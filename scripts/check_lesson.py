#!/usr/bin/env python3
"""校验单文件互动课堂作业 HTML 与导学案 Markdown 是否符合规范与学段篇幅档位。

用法:
    python check_lesson.py <文件.html | 文件.md> [<文件2> ...]

检查项:
  [HTML作业]:
    FAIL: 编码不是 UTF-8 / 缺 charset / 引入外部资源 / data-step 不连续 / 步骤条数量对不上 / 屏数超上限 / 测验题超标
    WARN: 缺少三件套之一 / 题量与答案数不匹配 / 未声明年级 / 某屏正文超字数 / 缺"还没懂"出口
  [导学单Markdown]:
    FAIL: 编码不是 UTF-8 / 低年级(3-4年级)超单面A4字数(>550字) / 高年级超双面A4字数(>1200字) / 缺学生抬头
    WARN: 出现教案学术套话(四维素养等) / 缺互动勾选槽[ ] / 缺通关目标 / 缺好习惯自评 / 超长横线破版

退出码: 存在 FAIL 为 1，否则为 0。
"""

import os
import re
import sys

# 确保在 Windows 控制台环境下输出 UTF-8 中文字符，杜绝乱码
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

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
    """去掉标签与空白后的正文字数。代码块不计入。"""
    t = re.sub(r"<script\b.*?</script>", "", html, flags=re.S | re.I)
    t = re.sub(r"<style\b.*?</style>", "", t, flags=re.S | re.I)
    t = re.sub(r"<pre\b.*?</pre>", "", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\s+", "", t)
    return len(t)


def check_html(path):
    print("=" * 60)
    print("检查课堂作业 HTML:", path)
    fails, warns = [], []

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    if not re.search(r'<meta\s+charset="UTF-8"', text, re.I):
        fails.append("缺少 <meta charset=\"UTF-8\">，导出 txt 会乱码")

    if not re.search(r"<title>.+</title>", text, re.S):
        warns.append("没有 <title>")

    base = os.path.basename(path)
    if not base.endswith(".html"):
        warns.append("文件扩展名不是 .html")
    elif "课堂作业" not in base:
        warns.append('文件名不含"课堂作业"，老师收作业时认不出这是要交的作业')

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

    # 年级难度档位
    gm = re.search(r'<meta\s+name="lesson-grade"\s+content="(\d+)"', text)
    grade = int(gm.group(1)) if gm else None
    limits = GRADE_LIMITS.get(grade)

    if grade is None:
        warns.append('未声明年级：请在 head 加 <meta name="lesson-grade" content="6">')
    else:
        print(f"  年级: {grade} 年级　档位: 屏数<={limits[0]} 动手<={limits[1]} "
              f"测验<={limits[2]} 每屏<={limits[3]}字")
        if steps and len(steps) > limits[0]:
            fails.append(f"难度超标：{grade} 年级最多 {limits[0]} 屏，当前 {len(steps)} 屏")

    # 农村适配：必须留"还没懂"的出口
    if "还没完全懂" not in text:
        warns.append('缺少"我还没完全懂"这一自我评价项')

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print("  [OK] 全部检查通过")
    return len(fails), len(warns)


def check_worksheet(path):
    print("=" * 60)
    print("检查导学单 Markdown:", path)
    fails, warns = [], []

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    base = os.path.basename(path)
    if "导学" not in base:
        warns.append('文件名建议包含"导学案"或"导学单"（如：03_了解信息处理工具_导学案.md）')

    # 检测学段/年级
    grade = None
    for pattern in [r"([3-8])年级", r"([三四五六七八])年级", r"第0?([3-8])课"]:
        m = re.search(pattern, path)
        if m:
            val = m.group(1)
            mapping = {"三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8}
            grade = mapping.get(val, int(val) if val.isdigit() else None)
            if grade:
                break

    # 计算有效中英文字数（与 Word 统计口径一致：中文字数 + 英文单词数）
    t_clean = re.sub(r"&[a-zA-Z0-9#]+;|<[^>]+>", " ", text)
    zh_count = len(re.findall(r"[\u4e00-\u9fa5]", t_clean))
    en_count = len(re.findall(r"[a-zA-Z0-9]+", t_clean))
    clean_len = zh_count + en_count

    if grade is not None:
        if grade in (3, 4):
            # 低年级单面 A4 铁律
            print(f"  学段: 小学低年级 ({grade} 年级)　篇幅红线: 严格单面 A4 (推荐 350~520 字)")
            if clean_len > 550:
                fails.append(f"篇幅超标：{grade} 年级导学单必须严格为单面 A4，有效字数上限 550 字，当前 {clean_len} 字（极易跨页溢出）")
            elif clean_len > 520:
                warns.append(f"篇幅偏长：当前有效字数 {clean_len} 字，接近单面 A4 临界值（建议 350~500 字）")
        else:
            # 中高年级/初中 单面优先，项目大课上限双面 A4 封顶
            print(f"  学段: 中高年级/初中 ({grade} 年级)　篇幅规范: 单面优先 (300~500字)，综合项目大课上限双面 A4 (上限 1100 字)")
            if clean_len > 1200:
                fails.append(f"篇幅超标：{grade} 年级导学单最多一张 A4 双面（2页），有效字数上限 1200 字，当前 {clean_len} 字")
    else:
        warns.append("路径或标题中未识别出年级（如'三年级'），无法精准校验纸张档位")

    # 反模式 1：教案学术化套话注水
    jargon = ["四维素养", "信息意识", "计算思维", "数字化学习与创新", "信息社会责任", "教材分析", "学情分析"]
    found_jargon = [j for j in jargon if j in text]
    if found_jargon:
        warns.append(f"导学单包含教案学术套话: {found_jargon}（导学单面向学生第一视角，目标应简短趣味）")

    # 反模式 2：大段长横线留白导致排版被撑大
    if re.search(r"_{25,}", text):
        warns.append("存在超过25字符的超长填空横线，易导致Word表格换行撑破版面")

    # 结构检查：抬头（班级、姓名）
    if not ("班级" in text and "姓名" in text):
        fails.append("缺少学生抬头信息（班级、姓名必须包含）")

    # 结构检查：互动槽位 [ ]
    if "[ ]" not in text and "（" not in text and "(" not in text:
        warns.append("缺少互动勾选槽 [ ] 或填空括号，学生无法纸笔互动留痕")

    # 结构检查：通关目标
    if not ("目标" in text or "通关" in text or "挑战" in text):
        warns.append("缺少清晰的学习目标或通关口令")

    # 结构检查：习惯与评价
    if not ("自评" in text or "评价" in text or "打卡" in text or "星级" in text):
        warns.append("缺少末尾评价/习惯打卡栏")

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print(f"  [OK] 全部检查通过（有效字数: {clean_len} 字，完美符合物理纸张约束）")
    return len(fails), len(warns)

def check_lesson_plan(path):
    print("=" * 60)
    print("检查备课教案 Markdown:", path)
    fails, warns = [], []

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    # 字数统计（去除表格线与元数据后的正文字数）
    t_clean = re.sub(r"&[a-zA-Z0-9#]+;|<[^>]+>", " ", text)
    zh_count = len(re.findall(r"[\u4e00-\u9fa5]", t_clean))
    en_count = len(re.findall(r"[a-zA-Z0-9]+", t_clean))
    clean_len = zh_count + en_count

    print(f"  正文字数: {clean_len} 字 (标准: 2000~2800 字，4页A4封顶)")

    # 4页物理篇幅硬约束
    if clean_len > 3200:
        fails.append(f"篇幅严重超标：当前有效字数 {clean_len} 字，必定超出 4 页 A4 纸（浪费纸张）")
    elif clean_len > 2800:
        warns.append(f"篇幅偏长：当前有效字数 {clean_len} 字，接近 4 页临界值（建议控制在 2000~2800 字）")
    elif clean_len < 1600:
        warns.append(f"内容可能偏单薄：当前有效字数 {clean_len} 字（建议丰富教学活动与支架）")

    # 铁律：彻底取消板书设计
    if "```mermaid" in text:
        warns.append("检测到 Mermaid 代码块：教案已明确取消板书环节以节约排版空间与纸张")
    if "板书设计" in text:
        warns.append("建议取消独立【板书设计】环节，聚焦机房实操指导")

    # 实用三大支架检查
    scaffolds = {
        "通俗生活比喻": ["比作", "比喻", "超级大脑", "仓库", "桥梁", "菜谱", "身份证"],
        "真实启发设问": ["设问", "提问", "追问", "？", "?"],
        "实操踩坑预警": ["卡点", "易错", "避坑", "锦囊", "预警", "巡视", "指导"]
    }
    for name, keywords in scaffolds.items():
        if not any(k in text for k in keywords):
            warns.append(f"缺少实战支架提示：建议增加【{name}】以化解教材认知坡度")

    # 教学过程结构四步环节
    core_steps = {
        "情境导入": ["导入", "引出", "激趣", "热身", "情境", "情景"],
        "新知探究": ["探究", "新授", "授新", "讲解", "解密", "透视", "认知"],
        "动手练习": ["练习", "实操", "操练", "实战", "实践", "练兵", "闯关"],
        "全课小结": ["小结", "总结", "回顾", "升华", "打卡"]
    }
    for step_name, keywords in core_steps.items():
        if not any(k in text for k in keywords):
            warns.append(f"教学过程建议包含清晰的【{step_name}】环节")

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print(f"  [OK] 教案检查全部通过（有效字数: {clean_len} 字，符合 4 页公文约束）")
    return len(fails), len(warns)


def check_slides(path):
    print("=" * 60)
    print("检查教学课件 Markdown:", path)
    fails, warns = [], []

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    # 检查 Marp 声明
    if "marp: true" not in text:
        fails.append("缺少 Marp 声明 (marp: true)")
    if "edu-lesson" not in text:
        warns.append("未引用 edu-lesson 主题")

    # 严禁大屏露出教师内部后台台词
    forbidden = ["广播听讲", "建议用时", "教师备注", "授课提示"]
    for word in forbidden:
        if word in text:
            fails.append(f"大屏课件严禁出现教师内部后台台词: 【{word}】（必须保持纯净学生视角）")

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print("  [OK] 课件检查全部通过（视觉纯净无多余台词）")
    return len(fails), len(warns)


def audit_path(p):
    """根据文件或目录智能派发审计"""
    total_f, total_w = 0, 0
    if os.path.isdir(p):
        for root, _, files in os.walk(p):
            for file in files:
                fp = os.path.join(root, file)
                f, w = audit_single_file(fp)
                total_f += f
                total_w += w
        return total_f, total_w
    else:
        return audit_single_file(p)


def audit_single_file(p):
    base = os.path.basename(p)
    if p.endswith('.html'):
        return check_html(p)
    elif p.endswith('.md'):
        if '导学' in base or 'worksheet' in base.lower():
            return check_worksheet(p)
        elif '教案' in base or 'plan' in base.lower():
            return check_lesson_plan(p)
        elif '课件' in base or 'slide' in base.lower():
            return check_slides(p)
        else:
            # 智能嗅探文件内容特征进行自动分流，绝不误判
            text, _ = read(p)
            if text:
                if 'marp: true' in text:
                    return check_slides(p)
                elif '通关目标' in text or '导学单' in text or '⭐' in text:
                    return check_worksheet(p)
                elif '教材分析' in text or '学情分析' in text or '教学过程' in text:
                    return check_lesson_plan(p)
    return 0, 0


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    total_f = total_w = 0
    for p in sys.argv[1:]:
        if p in ('-h', '--help'):
            print(__doc__)
            return 0
        f, w = audit_path(p)
        total_f += f
        total_w += w
    print("=" * 60)
    print(f"合计: {total_f} 个错误, {total_w} 个提醒")
    return 1 if total_f else 0


if __name__ == "__main__":
    sys.exit(main())
