#!/usr/bin/env python3
"""校验单文件互动课堂作业 HTML 是否符合模板约定与年级难度档位。

用法:
    python check_lesson.py <文件.html> [<文件2.html> ...]

检查项:
  FAIL  编码不是 UTF-8 / 缺 charset / 引入外部资源 / data-step 不连续 / 步骤条数量对不上
        屏数超年级上限 / 测验题数超年级上限
  WARN  缺少三件套之一 / 残留 data-page-node-id / 有 panel 没有按钮 / 题量与答案数不匹配
        未声明年级 / 某屏正文超字数 / 动手环节数超标 / 题干过长 / 缺"还没懂"出口
        导出文件名或首行汇总行不规范

退出码: 存在 FAIL 为 1，否则为 0。
"""

import os
import re
import sys

# 年级 -> (屏数上限, 动手环节上限, 测验题数上限, 每屏正文字数上限, 题干字数上限)
GRADE_LIMITS = {
    3: (5, 1, 2, 60, 30),
    4: (6, 1, 2, 80, 34),
    5: (6, 2, 2, 100, 40),
    6: (7, 2, 3, 120, 44),
    7: (7, 2, 3, 140, 50),
    8: (8, 2, 3, 160, 54),
}

# 动手环节的容器标记（启发式统计，用于提醒，不作为硬性判定）
ACT_MARKS = ('class="stage"', 'class="sort-list"', 'class="flow"',
             'class="run-controls"', 'class="chip-bank"')


def read(path):
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw.decode("utf-8"), None
    except UnicodeDecodeError as e:
        return None, str(e)


def count_step_labels(text):
    m = re.search(r"stepLabels\s*=\s*\[(.*?)\]", text, re.S)
    if not m:
        return None
    return len(re.findall(r'"[^"]*"|\'[^\']*\'', m.group(1)))


def collect_panels(text):
    steps = []
    for tag in re.findall(r"<section\b[^>]*>", text):
        if "panel" in tag and "data-step" in tag:
            m = re.search(r'data-step="(\d+)"', tag)
            if m:
                steps.append(int(m.group(1)))
    return steps


def plain_len(html):
    """去掉标签与空白后的正文字数。代码块不计入（它是图，不是要读的字）。"""
    t = re.sub(r"<script\b.*?</script>", "", html, flags=re.S | re.I)
    t = re.sub(r"<style\b.*?</style>", "", t, flags=re.S | re.I)
    t = re.sub(r"<pre\b.*?</pre>", "", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\s+", "", t)
    return len(t)


def check(path):
    print("=" * 60)
    print("检查:", path)
    fails, warns = [], []

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    if not re.search(r'<meta\s+charset="UTF-8"', text, re.I):
        fails.append("缺少 <meta charset=\"UTF-8\">，导出 txt 会乱码")

    if not re.search(r"<title>.+</title>", text, re.S):
        warns.append("没有 <title>")

    # 产出文件命名：<册别><课次>-<课题>-课堂作业.html
    base = os.path.basename(path)
    if not base.endswith(".html"):
        warns.append("文件扩展名不是 .html")
    elif "课堂作业" not in base:
        warns.append('文件名不含"课堂作业"，老师收作业时认不出这是要交的作业 '
                     '（应如：六上第4课-算法的程序体验-课堂作业.html）')
    if re.search(r"[·/\\?*<>|\"]", base.replace("\\", "/").replace("/", "")):
        warns.append("文件名含特殊符号，建议只用中文、数字和半角连字符")

    ext = re.findall(r'(?:src|href)\s*=\s*"(?:https?:)?//[^"]+"', text)
    ext += re.findall(r'@import\s+url\(', text)
    if ext:
        fails.append(f"引入了 {len(ext)} 处外部资源，课件必须零依赖离线可用: {ext[:3]}")

    steps = collect_panels(text)
    if not steps:
        fails.append("没有找到带 data-step 的 section.panel")
    else:
        if len(set(steps)) != len(steps):
            fails.append(f"data-step 有重复值: {sorted(steps)}")
        if sorted(steps) != list(range(len(steps))):
            fails.append(f"data-step 必须从 0 连续递增，当前为: {sorted(steps)}")
        n_labels = count_step_labels(text)
        if n_labels is None:
            fails.append("没有找到 stepLabels 数组")
        elif n_labels != len(steps):
            fails.append(f"stepLabels 有 {n_labels} 项，但 panel 有 {len(steps)} 个，导航会错位")

    trio = {
        "测验(quiz)": bool(re.search(r"\bquiz\b", text)),
        "徽章(medal)": "medal" in text.lower(),
        "导出(Blob+download)": "Blob" in text and "download" in text,
    }
    for name, ok in trio.items():
        if not ok:
            warns.append("缺少三件套之一: " + name)

    if "data-page-node-id" in text:
        warns.append(f"残留 {text.count('data-page-node-id')} 处 data-page-node-id（生成器痕迹，建议清理）")

    # ---------- 年级难度档位 ----------
    gm = re.search(r'<meta\s+name="lesson-grade"\s+content="(\d+)"', text)
    grade = int(gm.group(1)) if gm else None
    limits = GRADE_LIMITS.get(grade)

    if grade is None:
        warns.append('未声明年级：请在 head 加 <meta name="lesson-grade" content="6">，否则无法按档位校验')
    else:
        print(f"  年级: {grade} 年级　档位: 屏数<={limits[0]} 动手<={limits[1]} "
              f"测验<={limits[2]} 每屏<={limits[3]}字")
        if steps and len(steps) > limits[0]:
            fails.append(f"难度超标：{grade} 年级最多 {limits[0]} 屏，当前 {len(steps)} 屏（课堂作业要少而精）")

    # 每屏正文字数
    if limits:
        for attrs, body in re.findall(r"<section\b([^>]*)>(.*?)</section>", text, re.S):
            if "panel" not in attrs:
                continue
            n = plain_len(body)
            if n > limits[3]:
                m = re.search(r'data-step="(\d+)"', attrs)
                tag = m.group(1) if m else "?"
                warns.append(f"难度提醒：第 {tag} 屏正文 {n} 字，超过 {grade} 年级的 {limits[3]} 字上限")

    # 动手环节数（启发式）
    act = sum(text.count(mark) for mark in ACT_MARKS)
    if limits and act > limits[1]:
        warns.append(f"难度提醒：识别出约 {act} 个动手环节，超过 {grade} 年级的 {limits[1]} 个上限")

    # 测验题量与题干长度
    stems = re.findall(r"\bq\s*:\s*['\"]([^'\"]*)['\"]", text)
    n_a = len(re.findall(r"\bcorrect\s*:\s*\d", text))
    if stems:
        if limits and len(stems) > limits[2]:
            fails.append(f"难度超标：{grade} 年级最多 {limits[2]} 道测验题，当前 {len(stems)} 道")
        if len(stems) != n_a:
            warns.append(f"题目数 {len(stems)} 与答案数 {n_a} 不一致")
        if limits:
            for s in stems:
                if len(s) > limits[4]:
                    warns.append(f"题干偏长（{len(s)} 字，上限 {limits[4]}）：{s[:24]}…")

    # 农村适配：必须留"还没懂"的出口
    if "还没完全懂" not in text:
        warns.append('缺少"我还没完全懂"这一自我评价项（农村学校红线：允许学生不会）')

    # 导出规范
    if "a_tag.download" in text:
        if "${cls}_${name}" not in text:
            warns.append('导出文件名不规范，应为 `${cls}_${name}_${lessonTitle}_${scoreStr}.txt`')
    if not re.search(r"report\s*=\s*['\"`]#\s*\$\{cls\}\|", text):
        warns.append("导出 txt 缺少首行汇总行 `# 班级|姓名|课次|得分|提交时间`")

    panels = re.findall(r"<section\b[^>]*>", text)
    body_parts = re.split(r"<section\b[^>]*>", text)[1:]
    no_nav = []
    for tag, body in zip(panels, body_parts):
        if "panel" not in tag:
            continue
        seg = body[:6000]
        if "<button" not in seg:
            no_nav.append(tag[:60])
    if no_nav:
        warns.append(f"{len(no_nav)} 个 panel 里没有任何按钮（可能缺上一步/下一步）")

    # ---------- 选择题交互反模式 ----------
    # 学生答错后必须能重选；只有答对才锁定，否则等于“一选定终身”
    if re.search(r"(picked|answered|chosen|done)\s*[.\w]*\s*!==\s*(null|false)\s*\)\s*return", text):
        warns.append("选择题“一点就锁死”：答错后无法重选（正确做法是答对才锁定）")
    if re.search(r"classList\.add\(\s*\w+\s*===\s*\w+\.correct\s*\?", text):
        warns.append("测验题在提交前就标出对错，答案能被试出来（应改为提交后统一判分）")
    if "makeOptions" in text and "locked" not in text:
        warns.append("单选组件缺少 locked 锁定样式（答对后其余选项应淡出）")

    timers = len(re.findall(r"setInterval", text))
    clears = len(re.findall(r"clearInterval", text))
    if timers and clears == 0:
        warns.append(f"有 {timers} 处 setInterval 但没有 clearInterval，切屏可能计时器泄漏")

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print("  [OK] 全部检查通过")
    return len(fails), len(warns)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    total_f = total_w = 0
    for p in sys.argv[1:]:
        f, w = check(p)
        total_f += f
        total_w += w
    print("=" * 60)
    print(f"合计: {total_f} 个错误, {total_w} 个提醒")
    return 1 if total_f else 0


if __name__ == "__main__":
    sys.exit(main())
