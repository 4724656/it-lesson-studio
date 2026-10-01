"""
义务教育信息科技课程标准（2022年版）OCR文本深度清洗与结构化转换器
"""

import re
from pathlib import Path

# 精准错别字与OCR脏符号修复字典
REPLACEMENTS = [
    (r"埋息科技", "信息科技"),
    (r"信入稍巷", "信息科技"),
    (r"牵重舟基", "信息科技"),
    (r"迁鳄稍巷", "信息科技"),
    (r"谨重头胡", "信息科技"),
    (r"深程桩质", "课程性质"),
    (r"江各下入", "课程内容"),
    (r"举亚质各", "学业质量"),
    (r"黄定基础", "奠定基础"),
    (r"骨在培养", "旨在培养"),
    (r"藩实立德树人", "落实立德树人"),
    (r"逮辑关联", "逻辑关联"),
    (r"罗辑主线", "逻辑主线"),
    (r"塔育要求", "培育要求"),
    (r"肖选课程内容", "遴选课程内容"),
    (r"适选科学原理", "遴选科学原理"),
    (r"避选重要观念", "遴选重要观念"),
    (r"具有庶强", "具有较强"),
    (r"峙尚科学精神", "崇尚科学精神"),
    (r"培根链于", "培根铸魂"),
    (r"马元思主义", "马克思主义"),
    (r"站京师范大学", "北京师范大学"),
    (r"BEUING", "BEIJING"),
    (r"步又", "步骤"),
    (r"辩别", "辨别"),
    (r"路学科", "跨学科"),
    (r"【内容要术】", "【内容要求】"),
    (r"【学业要术】", "【学业要求】"),
    (r"【救学提示】", "【教学提示】"),
    (r"草命文化", "革命文化"),
    (r"谁确理解", "准确理解"),
    (r"双诚", "双减"),
    (r"诚负", "减负"),
    (r"导癌", "导向"),
    (r"应肴力", "应着力"),
    (r"主体隆", "主体性"),
    (r"行而不轻", "行而不辍"),
    (r"问题角决", "问题解决"),
    (r"解诀", "解决"),
    (r"有具备", "具备"),
    (r"状别数据", "识别数据"),
    (r"网络鞋间", "网络空间"),
    (r"行为谁则", "行为准则"),
    (r"恨好", "很好"),
]

def is_header_or_footer(line: str) -> bool:
    line = line.strip()
    if not line:
        return True
    # 页眉过滤
    if re.search(r"义务[教救]育.*课程标准", line):
        return True
    if re.match(r"^[\s·\|目因四]*前\s*言[\s·\|目因四]*$", line):
        return True
    # 过滤类似 "二、课程理念 1目" 或 "四、课程内容 ‖目" 或 "六、课程实施 〗目"
    if re.search(r"[一二三四五六七八九十]、.*([1-9]\s*[目国四]|[\s·\|‖〗]+[目国四因])", line):
        return True
    # 纯数字页码
    if re.match(r"^[\s·\-—]*\d+[\s·\-—]*$", line):
        return True
    # 孤立扫描脏字符
    if line in ["了", "目", "四", "因", "站", "化", "国"]:
        return True
    return False

def clean_standard(input_path: Path, output_path: Path):
    raw_text = input_path.read_text(encoding="utf-8", errors="ignore")
    pages = raw_text.split("\x0c")

    lines_all = []

    # 1. 前言 (Page 2 - 5)
    for p in pages[1:5]:
        for line in p.splitlines():
            line = line.strip()
            if is_header_or_footer(line):
                continue
            lines_all.append(line)

    # 2. 正文 (Page 8 开始)
    for p in pages[7:]:
        for line in p.splitlines():
            line = line.strip()
            if is_header_or_footer(line):
                continue
            lines_all.append(line)

    # 3. 规范化段落合并
    paragraphs = []
    current = []

    for line in lines_all:
        # 如果是新章节特征
        is_heading = (
            re.match(r"^[一二三四五六]、", line) or
            re.match(r"^附录\s*[12]", line) or
            re.match(r"^[（(]?[一二三四五六七八九十][)）]", line) or
            re.match(r"^[一二三四五六七八九十]\)\s*", line) or
            re.match(r"^\d+[\.、]\s*", line) or
            re.match(r"^【(内容要求|学业要求|教学提示)】", line) or
            re.match(r"^第[一二三四]学段", line)
        )

        if is_heading:
            if current:
                paragraphs.append("".join(current))
                current = []
            paragraphs.append(line)
        else:
            if current and re.search(r"[。！？；：”’）]$", current[-1]):
                paragraphs.append("".join(current))
                current = [line]
            else:
                current.append(line)

    if current:
        paragraphs.append("".join(current))

    # 4. 组装并转换为 Markdown 语法
    md_output = []
    md_output.append("# 义务教育信息科技课程标准（2022年版）\n")
    md_output.append("> 中华人民共和国教育部制定 · 北京师范大学出版社出版\n")
    md_output.append("> 适用学段：义务教育阶段 1~9 年级（信息科技独立设课）\n\n---\n")

    in_preface = True

    for p in paragraphs:
        p = p.strip()
        if not p:
            continue

        # 错别字纠正
        for old, new in REPLACEMENTS:
            p = re.sub(old, new, p)

        # 顶级章节
        if p == "前言":
            md_output.append("\n## 前言\n")
            in_preface = True
            continue
        elif re.match(r"^[一二三四五六]、", p) or re.match(r"^附录\s*[12]", p):
            md_output.append(f"\n## {p}\n")
            in_preface = False
            continue

        # 二级小节 (一) (二) (三)
        sub_match = re.match(r"^[（(]?([一二三四五六七八九十])[)）]\s*(.*)", p) or re.match(r"^([一二三四五六七八九十])\)\s*(.*)", p)
        if sub_match and not in_preface:
            num = sub_match.group(1)
            title = sub_match.group(2)
            md_output.append(f"\n### （{num}）{title}\n")
            continue

        # 学段
        if re.match(r"^第[一二三四]学段", p):
            md_output.append(f"\n### {p}\n")
            continue

        # 课标核心块 【内容要求】【学业要求】【教学提示】
        if re.match(r"^【(内容要求|学业要求|教学提示)】", p):
            md_output.append(f"\n#### {p}\n")
            continue

        # 编号小标题 1. 2. 3.
        num_match = re.match(r"^(\d+)[\.、]\s*(.*)", p)
        if num_match and len(p) < 40 and not p.endswith("。"):
            md_output.append(f"\n#### {p}\n")
            continue

        md_output.append(p + "\n")

    final_content = "\n".join(md_output)
    final_content = re.sub(r"\n{3,}", "\n\n", final_content)

    output_path.write_text(final_content, encoding="utf-8")
    print(f"清洗成功！Markdown 已生成至: {output_path}")
    print(f"字符总数: {len(final_content)}，文件大小: {output_path.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    src = Path(r"e:\it-lesson-studio\references\义务教育信息科技课程标准（2022年版）_00001.txt")
    dst = Path(r"e:\it-lesson-studio\references\curriculum-standard-2022.md")
    clean_standard(src, dst)