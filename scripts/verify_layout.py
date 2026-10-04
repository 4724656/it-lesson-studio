#!/usr/bin/env python3
"""导出后实际版式校验（P1-5）。

字数只是纸张的近似证明。本脚本实测导出产物的真实页数：
- 教案 DOCX（经 LibreOffice 转 PDF 后）页数 <= 4；
- 导学单 DOCX 真实页数须等于 lesson.yaml 声明的版式（single=1 页，duplex=2 页）；
- Marp PDF 页数 > 0，且与同名 PPTX 的幻灯片数一致。

用法：
    uv run python scripts/verify_layout.py [--manifest <lesson.yaml>] <导出产物目录> [...]

--manifest 显式指定源课例的 lesson.yaml（隔离导出时产物与源分离，
无法靠目录向上查找定位；不指定则回退向上查找，找不到按 single=1 页）。
--strict 严格模式：LibreOffice 不可用时记 FAIL 而非 WARN 跳过（供 CI 使用，
确保页数校验真正执行）。

页数违规则退出码非零，供 export-lesson.mjs --verify-layout 调用。
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    from pptx import Presentation
except ImportError:
    Presentation = None

try:
    import yaml
except ImportError:
    yaml = None

PLAN_MAX_PAGES = 4


def pdf_pages(pdf_path):
    reader = PdfReader(pdf_path)
    return len(reader.pages)


def docx_to_pdf_pages(docx_path, retries=1):
    """用 LibreOffice 将 docx 转为 pdf 并返回页数；不可用时返回 None。

    每次调用使用独立的 UserInstallation 配置目录，避免连续调用时
    LibreOffice 用户配置锁竞争导致的偶发失败；失败时重试一次。
    """
    import time
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None
    tmpdir = tempfile.mkdtemp(prefix="verify_layout_")
    try:
        profile = os.path.join(tmpdir, "lo-profile")
        for attempt in range(retries + 1):
            try:
                subprocess.run(
                    [soffice, "--headless", "--norestore",
                     "-env:UserInstallation=file://%s" % profile,
                     "--convert-to", "pdf", "--outdir", tmpdir, docx_path],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    check=True, timeout=180,
                )
                pdf = os.path.join(tmpdir, os.path.splitext(os.path.basename(docx_path))[0] + ".pdf")
                if os.path.isfile(pdf):
                    return pdf_pages(pdf)
            except Exception:
                if attempt < retries:
                    time.sleep(3)
                    continue
            return None
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def batch_docx_to_pdf_pages(docx_list, max_batch_size=8):
    """批量/并发将多个 docx 转为 pdf 并返回 {docx_path: pages} 字典。
    单次 soffice 调用接收多个文件，避免多次启动 LibreOffice 造成的线性耗时倍增。
    若批量中有个别失败，自动独立单文件重试。
    """
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice or not docx_list:
        return {d: None for d in docx_list} if not soffice else {}

    results = {}
    remaining = list(docx_list)

    # 批次执行
    for i in range(0, len(remaining), max_batch_size):
        chunk = remaining[i:i + max_batch_size]
        tmpdir = tempfile.mkdtemp(prefix="verify_layout_batch_")
        profile = os.path.join(tmpdir, "lo-profile")
        try:
            cmd = [
                soffice, "--headless", "--norestore",
                "-env:UserInstallation=file://%s" % profile,
                "--convert-to", "pdf", "--outdir", tmpdir
            ] + chunk
            subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                check=False, timeout=240,
            )
            for docx_path in chunk:
                base_name = os.path.splitext(os.path.basename(docx_path))[0]
                pdf_file = os.path.join(tmpdir, base_name + ".pdf")
                if os.path.isfile(pdf_file):
                    try:
                        results[docx_path] = pdf_pages(pdf_file)
                    except Exception:
                        results[docx_path] = None
                else:
                    results[docx_path] = None
        except Exception:
            for docx_path in chunk:
                results[docx_path] = None
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    # 针对未成功转出的文件，单独重试一次
    failed = [d for d, p in results.items() if p is None]
    if failed:
        for docx_path in failed:
            results[docx_path] = docx_to_pdf_pages(docx_path, retries=1)

    return results


def find_manifest(start_dir):
    """向上查找最近的 lesson.yaml。"""
    d = os.path.abspath(start_dir)
    while True:
        mf = os.path.join(d, "lesson.yaml")
        if os.path.isfile(mf):
            return mf
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def worksheet_expected_pages(manifest_path):
    if not manifest_path or yaml is None:
        return 1
    try:
        m = yaml.safe_load(open(manifest_path, encoding="utf-8").read())
        return 2 if (m or {}).get("worksheet_layout") == "duplex" else 1
    except Exception:
        return 1


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    if PdfReader is None:
        print("[FAIL] 缺少 pypdf 依赖，请先 uv sync")
        return 1

    # 必修1：支持显式传入源 lesson.yaml（隔离导出时产物目录与源目录分离，
    # 无法靠向上查找定位 manifest；不传则回退到向上查找，再找不到则按 single=1 页）
    # 必修4：--strict 严格模式（供 CI 使用）：LibreOffice 不可用时不再 WARN 跳过，
    # 直接记为 FAIL，确保页数校验真正执行而非被静默跳过。
    manifest_override = None
    strict = False
    targets = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--manifest" and i + 1 < len(sys.argv):
            manifest_override = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--strict":
            strict = True
            i += 1
        else:
            targets.append(sys.argv[i])
            i += 1
    if not targets:
        print(__doc__)
        return 2

    fails, warns, checked = [], [], 0
    docx_files, pptx_files, pdf_files = [], [], []
    for target in targets:
        for root, _, files in os.walk(target):
            for f in files:
                fp = os.path.join(root, f)
                if f.endswith(".docx"):
                    docx_files.append(fp)
                elif f.endswith(".pptx"):
                    pptx_files.append(fp)
                elif f.endswith(".pdf") and not f.endswith(".tmp.pdf"):
                    pdf_files.append(fp)

    # --- DOCX 真实页数（支持批量转 PDF，彻底消除串行等待） ---
    docx_pages_map = batch_docx_to_pdf_pages(sorted(docx_files))
    for docx in sorted(docx_files):
        base = os.path.basename(docx)
        pages = docx_pages_map.get(docx)
        if pages is None:
            # 必修4：严格模式下 LibreOffice 不可用记 FAIL，不允许仅 WARN 跳过
            msg = "LibreOffice 不可用，无法校验 DOCX 真实页数: %s" % base
            if strict:
                fails.append("[STRICT] " + msg)
            else:
                warns.append(msg + "（已跳过）")
            continue
        checked += 1
        if "教案" in base or "plan" in base.lower():
            if pages > PLAN_MAX_PAGES:
                fails.append("教案页数超标: %s 共 %d 页（上限 %d 页）" % (base, pages, PLAN_MAX_PAGES))
            else:
                print("  [OK] 教案 %s：%d 页（<=%d）" % (base, pages, PLAN_MAX_PAGES))
        elif "导学" in base or "worksheet" in base.lower():
            # 优先用显式传入的 manifest（隔离导出场景），否则向上查找
            mf = manifest_override if manifest_override and os.path.isfile(manifest_override) \
                else find_manifest(os.path.dirname(docx))
            expected = worksheet_expected_pages(mf)
            if pages != expected:
                fails.append("导学单页数不符: %s 共 %d 页（lesson.yaml 声明版式要求 %d 页）"
                             % (base, pages, expected))
            else:
                print("  [OK] 导学单 %s：%d 页（符合声明版式）" % (base, pages))
        else:
            print("  [INFO] %s：%d 页（非教案/导学单，仅记录）" % (base, pages))

    # --- PPTX / PDF 课件页数 ---
    pdf_by_stem = {}
    for pdf in pdf_files:
        stem = os.path.splitext(os.path.basename(pdf))[0]
        pdf_by_stem.setdefault(stem, pdf)
    for pptx in sorted(pptx_files):
        base = os.path.basename(pptx)
        stem = os.path.splitext(base)[0]
        if Presentation is None:
            warns.append("缺少 python-pptx，跳过幻灯片数检查: %s" % base)
            continue
        slides = len(Presentation(pptx).slides)
        checked += 1
        if slides == 0:
            fails.append("课件无幻灯片: %s" % base)
            continue
        pdf = pdf_by_stem.get(stem)
        if pdf:
            ppages = pdf_pages(pdf)
            if ppages != slides:
                fails.append("课件 PDF/PPTX 页数不一致: %s（pdf %d 页 vs pptx %d 张）"
                             % (base, ppages, slides))
            else:
                print("  [OK] 课件 %s：%d 张幻灯片，PDF 页数一致" % (base, slides))
        else:
            print("  [OK] 课件 %s：%d 张幻灯片（无配套 PDF 可比对）" % (base, slides))

    print("=" * 60)
    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    print("版式校验：%d 项已检，%d 个错误，%d 个提醒" % (checked, len(fails), len(warns)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
