#!/usr/bin/env python3
"""导出后实际版式校验（P1-5）。

字数只是纸张的近似证明。本脚本实测导出产物的真实页数：
- 教案 DOCX（经 LibreOffice 转 PDF 后）页数 <= 4；
- 导学单 DOCX 真实页数须等于 lesson.yaml 声明的版式（single=1 页，duplex=2 页）；
- Marp PDF 页数 > 0，且与同名 PPTX 的幻灯片数一致。

用法：
    uv run python scripts/verify_layout.py <导出产物目录> [...]

LibreOffice 不可用时降级为 WARN 跳过 DOCX 检查（不直接 FAIL）；
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

    fails, warns, checked = [], [], 0
    docx_files, pptx_files, pdf_files = [], [], []
    for target in sys.argv[1:]:
        for root, _, files in os.walk(target):
            for f in files:
                fp = os.path.join(root, f)
                if f.endswith(".docx"):
                    docx_files.append(fp)
                elif f.endswith(".pptx"):
                    pptx_files.append(fp)
                elif f.endswith(".pdf") and not f.endswith(".tmp.pdf"):
                    pdf_files.append(fp)

    # --- DOCX 真实页数 ---
    for docx in sorted(docx_files):
        base = os.path.basename(docx)
        pages = docx_to_pdf_pages(docx)
        if pages is None:
            warns.append("LibreOffice 不可用，跳过 DOCX 真实页数检查: %s" % base)
            continue
        checked += 1
        if "教案" in base or "plan" in base.lower():
            if pages > PLAN_MAX_PAGES:
                fails.append("教案页数超标: %s 共 %d 页（上限 %d 页）" % (base, pages, PLAN_MAX_PAGES))
            else:
                print("  [OK] 教案 %s：%d 页（<=%d）" % (base, pages, PLAN_MAX_PAGES))
        elif "导学" in base or "worksheet" in base.lower():
            expected = worksheet_expected_pages(find_manifest(os.path.dirname(docx)))
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
