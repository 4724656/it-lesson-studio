#!/usr/bin/env python3
"""校验单文件互动课堂作业 HTML、导学案/教案/课件 Markdown 与 lesson.yaml 是否符合规范。

数值口径的唯一来源：references/output-spec.md 中的 ```spec-yaml 代码块。
本脚本只从那里读取阈值（"文档即门禁"，P1-4）。

用法:
    uv run python scripts/check_lesson.py <文件.html | 文件.md | 目录> [...]

检查项:
  [HTML作业]:
    FAIL: 编码不是 UTF-8 / 缺 charset / 非法年级(非3~8) / data-step 不连续 /
          屏数超上限 / 动手环节超上限 / 某屏正文(data-prose)超上限 /
          测验题干超上限 / 测验题数超标
    WARN: 缺少三件套之一 / 题量与答案数不匹配 / 未声明年级 / 缺"还没懂"出口 /
          某屏未标记 data-prose
  [导学单Markdown]:
    FAIL: 编码不是 UTF-8 / 低年级(3-4年级)超单面A4字数 / 高年级超双面A4字数 /
          缺学生抬头
    WARN: 教案学术套话 / 缺互动勾选槽 / 缺通关目标 / 缺好习惯自评 / 超长横线
  [教案Markdown]:
    FAIL: 有效字数>3200（必超4页）
    WARN: 字数偏离 2000~2800 / 含 Mermaid 板书 / 缺三大支架 / 缺四步环节
  [课件Markdown]:
    FAIL: 缺 marp:true / 含教师后台台词
  [lesson.yaml 目录级]:
    FAIL: 缺必填字段 / 四件套文件缺失 / 标题不一致 / 任务名在某件套缺失 /
          与教材图谱(课次/课题/单元)不一致(P0-3)

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

try:
    import yaml
except ImportError:
    yaml = None

_HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_PATH = os.path.normpath(os.path.join(_HERE, "..", "references", "output-spec.md"))
GRAPH_PATH = os.path.normpath(os.path.join(_HERE, "..", "references", "textbook-zj2026.md"))

# 内置回退默认值（与 output-spec.md 一致；仅当规范文件损坏时启用）
_DEFAULT_SPEC = {
    "lesson_plan": {"target_min": 2000, "target_max": 2800, "warn_low": 1600,
                    "warn_high": 2800, "fail_max": 3200, "max_pages": 4},
    "worksheet": {
        "grades_3_4": {"target_min": 350, "target_max": 520, "warn_max": 520,
                       "fail_max": 550, "layout": "single"},
        "grades_5_8": {"target_min": 300, "target_max": 550, "duplex_max": 1100,
                       "fail_max": 1200, "layout": "single_preferred"},
    },
    "html_grades": {
        3: {"screens": 4, "hands_on": 1, "quiz": 2, "prose_per_screen": 60, "quiz_stem": 30},
        4: {"screens": 4, "hands_on": 1, "quiz": 2, "prose_per_screen": 80, "quiz_stem": 34},
        5: {"screens": 5, "hands_on": 2, "quiz": 3, "prose_per_screen": 100, "quiz_stem": 40},
        6: {"screens": 5, "hands_on": 2, "quiz": 3, "prose_per_screen": 120, "quiz_stem": 44},
        7: {"screens": 6, "hands_on": 2, "quiz": 3, "prose_per_screen": 140, "quiz_stem": 50},
        8: {"screens": 6, "hands_on": 2, "quiz": 3, "prose_per_screen": 160, "quiz_stem": 54},
    },
}


def load_spec():
    """从 output-spec.md 的 spec-yaml 块读取规范；失败则回退内置值并返回告警。"""
    if yaml is None:
        return _DEFAULT_SPEC, "pyyaml 未安装，已回退内置默认阈值"
    try:
        text = open(SPEC_PATH, encoding="utf-8").read()
        m = re.search(r"```spec-yaml\n(.*?)```", text, re.S)
        if not m:
            return _DEFAULT_SPEC, "规范文件无 spec-yaml 块: %s" % SPEC_PATH
        spec = yaml.safe_load(m.group(1))
        spec["html_grades"] = {int(k): v for k, v in spec["html_grades"].items()}
        return spec, None
    except Exception as e:
        return _DEFAULT_SPEC, "规范文件解析失败(%s)，已回退内置默认阈值" % e


SPEC, _SPEC_WARN = load_spec()

# 年级 -> (屏数上限, 动手环节上限, 测验题数上限, 每屏正文字数上限, 题干字数上限)
GRADE_LIMITS = {
    g: (v["screens"], v["hands_on"], v["quiz"], v["prose_per_screen"], v["quiz_stem"])
    for g, v in SPEC["html_grades"].items()
}


def visible_len(html_or_text):
    """可见文本有效字数（与 Word 口径一致：中文字数 + 英文单词数）。"""
    t = re.sub(r"<script.*?</script>", " ", html_or_text, flags=re.S | re.I)
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S | re.I)
    t = re.sub(r"&[a-zA-Z0-9#]+;", " ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    zh = len(re.findall(r"[\u4e00-\u9fa5]", t))
    en = len(re.findall(r"[a-zA-Z0-9]+", t))
    return zh + en


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


def count_quiz_questions(text):
    """统计随堂测验题数：解析 const quiz 数组中的题干数。"""
    m = re.search(r"const quiz\s*=\s*\[(.*?)\];", text, re.S)
    if not m:
        return None
    return len(re.findall(r"\bq\s*:", m.group(1)))


def quiz_stems(text):
    """提取测验题干文本列表。"""
    m = re.search(r"const quiz\s*=\s*\[(.*?)\];", text, re.S)
    if not m:
        return []
    body = m.group(1)
    stems = re.findall(r'\bq\s*:\s*"([^"]*)"', body)
    stems += re.findall(r"\bq\s*:\s*'([^']*)'", body)
    return stems


def collect_panels(text):
    """返回 [(step, section_tag, inner_html)]。"""
    panels = []
    for m in re.finditer(r"(<section\b[^>]*>)(.*?)</section>", text, re.S):
        tag, inner = m.group(1), m.group(2)
        if "panel" not in tag or "data-step" not in tag:
            continue
        sm = re.search(r'data-step="(\d+)"', tag)
        if sm:
            panels.append((int(sm.group(1)), tag, inner))
    return panels


def prose_len_of_panel(inner):
    """该屏 data-prose 标记的正文总字数；返回 (字数, 是否有标记)。"""
    total, marked = 0, False
    for pm in re.finditer(r"<([a-zA-Z0-9]+)[^>]*\bdata-prose\b[^>]*>(.*?)</\1>", inner, re.S):
        marked = True
        total += visible_len(pm.group(2))
    return total, marked


def check_html(path):
    print("=" * 60)
    print("检查课堂作业 HTML:", path)
    fails, warns = [], []

    if _SPEC_WARN:
        warns.append("规范口径告警: " + _SPEC_WARN)

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    if not re.search(r'<meta\s+charset="UTF-8"', text, re.I):
        fails.append('缺少 <meta charset="UTF-8">，导出 txt 会乱码')

    if not re.search(r"<title>.+</title>", text, re.S):
        warns.append("没有 <title>")

    base = os.path.basename(path)
    if not base.endswith(".html"):
        warns.append("文件扩展名不是 .html")
    elif "课堂作业" not in base:
        warns.append('文件名不含"课堂作业"，老师收作业时认不出这是要交的作业')

    ext = re.findall(r'(?:src|href)\s*=\s*"(?:https?:)?//[^"]+"', text)
    ext += re.findall(r"@import\s+url\(", text)
    if ext:
        warns.append("检测到 %d 处外部网络资源: %s" % (len(ext), ext[:3]))

    panels = collect_panels(text)
    steps = [s for s, _, _ in panels]
    if not steps:
        fails.append("没有找到带 data-step 的 section.panel")
    else:
        if len(set(steps)) != len(steps):
            fails.append("data-step 有重复值: %s" % sorted(steps))
        if sorted(steps) != list(range(len(steps))):
            fails.append("data-step 必须从 0 连续递增，当前为: %s" % sorted(steps))
        n_labels = count_step_labels(text)
        if n_labels is None:
            fails.append("没有找到 stepLabels 数组")
        elif n_labels != len(steps):
            fails.append("stepLabels 有 %d 项，但 panel 有 %d 个，导航会错位" % (n_labels, len(steps)))

    trio = {
        "测验(quiz)": bool(re.search(r"\bquiz\b", text)),
        "徽章(medal)": "medal" in text.lower(),
        "导出(Blob+download)": "Blob" in text and "download" in text,
    }
    for name, ok in trio.items():
        if not ok:
            warns.append("缺少三件套之一: " + name)

    # 年级难度档位（P1-3：非法年级必须可读 FAIL，绝不 traceback）
    gm = re.search(r'<meta\s+name="lesson-grade"\s+content="(\d+)"', text)
    grade = int(gm.group(1)) if gm else None
    limits = GRADE_LIMITS.get(grade) if grade is not None else None

    if grade is None:
        warns.append('未声明年级：请在 head 加 <meta name="lesson-grade" content="6">')
    elif limits is None:
        fails.append("年级声明非法：%s，仅支持 3~8 年级" % grade)
        grade = None  # 后续档位检查跳过
    else:
        print("  年级: %d 年级　档位: 屏数<=%d 动手<=%d 测验<=%d 每屏正文<=%d字 题干<=%d字"
              % (grade, limits[0], limits[1], limits[2], limits[3], limits[4]))
        if steps and len(steps) > limits[0]:
            fails.append("难度超标：%d 年级最多 %d 屏，当前 %d 屏" % (grade, limits[0], len(steps)))
        # P1-2a：动手环节数（data-panel-type="hands-on"）
        n_hands = sum(1 for _, tag, _ in panels if 'data-panel-type="hands-on"' in tag)
        if n_hands > limits[1]:
            fails.append("动手环节超标：%d 年级最多 %d 个，当前 %d 个" % (grade, limits[1], n_hands))
        # P1-2b：每屏正文（data-prose 标记）
        for step, _, inner in panels:
            plen, marked = prose_len_of_panel(inner)
            if not marked:
                warns.append("第 %d 屏未标记 data-prose，无法校验每屏正文密度" % step)
            elif plen > limits[3]:
                fails.append("第 %d 屏正文超标：%d 年级每屏正文上限 %d 字，当前 %d 字"
                             % (step, grade, limits[3], plen))
        # P1-2c：测验题数与题干字数
        n_quiz = count_quiz_questions(text)
        if n_quiz is not None and n_quiz > limits[2]:
            fails.append("测验题超标：%d 年级最多 %d 题，当前 %d 题" % (grade, limits[2], n_quiz))
        for i, stem in enumerate(quiz_stems(text), 1):
            slen = visible_len(stem)
            if slen > limits[4]:
                fails.append("第 %d 题题干超标：%d 年级题干上限 %d 字，当前 %d 字"
                             % (i, grade, limits[4], slen))

    # 必须留"还没懂"的出口
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

    if _SPEC_WARN:
        warns.append("规范口径告警: " + _SPEC_WARN)

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

    clean_len = visible_len(text)
    ws = SPEC["worksheet"]

    if grade is not None:
        if grade in (3, 4):
            cfg = ws["grades_3_4"]
            print("  学段: 小学低年级 (%d 年级)　篇幅红线: 严格单面 A4 (推荐 %d~%d 字)"
                  % (grade, cfg["target_min"], cfg["target_max"]))
            if clean_len > cfg["fail_max"]:
                fails.append("篇幅超标：%d 年级导学单必须严格为单面 A4，有效字数上限 %d 字，当前 %d 字（极易跨页溢出）"
                             % (grade, cfg["fail_max"], clean_len))
            elif clean_len > cfg["warn_max"]:
                warns.append("篇幅偏长：当前有效字数 %d 字，接近单面 A4 临界值（建议 %d~%d 字）"
                             % (clean_len, cfg["target_min"], cfg["target_max"]))
        else:
            cfg = ws["grades_5_8"]
            print("  学段: 中高年级/初中 (%d 年级)　篇幅规范: 单面优先 (%d~%d字)，综合项目大课上限双面 A4 (上限 %d 字)"
                  % (grade, cfg["target_min"], cfg["target_max"], cfg["duplex_max"]))
            if clean_len > cfg["fail_max"]:
                fails.append("篇幅超标：%d 年级导学单最多一张 A4 双面（2页），有效字数上限 %d 字，当前 %d 字"
                             % (grade, cfg["fail_max"], clean_len))
    else:
        warns.append("路径或标题中未识别出年级（如'三年级'），无法精准校验纸张档位")

    # 反模式 1：教案学术化套话注水
    jargon = ["四维素养", "信息意识", "计算思维", "数字化学习与创新", "信息社会责任", "教材分析", "学情分析"]
    found_jargon = [j for j in jargon if j in text]
    if found_jargon:
        warns.append("导学单包含教案学术套话: %s（导学单面向学生第一视角，目标应简短趣味）" % found_jargon)

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
        print("  [OK] 全部检查通过（有效字数: %d 字，完美符合物理纸张约束）" % clean_len)
    return len(fails), len(warns)


def check_lesson_plan(path):
    print("=" * 60)
    print("检查备课教案 Markdown:", path)
    fails, warns = [], []

    if _SPEC_WARN:
        warns.append("规范口径告警: " + _SPEC_WARN)

    text, err = read(path)
    if text is None:
        print("  [FAIL] 文件不是 UTF-8 编码:", err)
        return 1, 0

    clean_len = visible_len(text)
    cfg = SPEC["lesson_plan"]

    print("  正文字数: %d 字 (标准: %d~%d 字，%d页A4封顶)"
          % (clean_len, cfg["target_min"], cfg["target_max"], cfg["max_pages"]))

    # 4页物理篇幅硬约束
    if clean_len > cfg["fail_max"]:
        fails.append("篇幅严重超标：当前有效字数 %d 字，必定超出 %d 页 A4 纸（浪费纸张）"
                     % (clean_len, cfg["max_pages"]))
    elif clean_len > cfg["warn_high"]:
        warns.append("篇幅偏长：当前有效字数 %d 字，接近 %d 页临界值（建议控制在 %d~%d 字）"
                     % (clean_len, cfg["max_pages"], cfg["target_min"], cfg["target_max"]))
    elif clean_len < cfg["warn_low"]:
        warns.append("内容可能偏单薄：当前有效字数 %d 字（建议丰富教学活动与支架）" % clean_len)

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
            warns.append("缺少实战支架提示：建议增加【%s】以化解教材认知坡度" % name)

    # 教学过程结构四步环节
    core_steps = {
        "情境导入": ["导入", "引出", "激趣", "热身", "情境", "情景"],
        "新知探究": ["探究", "新授", "授新", "讲解", "解密", "透视", "认知"],
        "动手练习": ["练习", "实操", "操练", "实战", "实践", "练兵", "闯关"],
        "全课小结": ["小结", "总结", "回顾", "升华", "打卡"]
    }
    for step_name, keywords in core_steps.items():
        if not any(k in text for k in keywords):
            warns.append("教学过程建议包含清晰的【%s】环节" % step_name)

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print("  [OK] 教案检查全部通过（有效字数: %d 字，符合 %d 页公文约束）"
              % (clean_len, cfg["max_pages"]))
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
            fails.append("大屏课件严禁出现教师内部后台台词: 【%s】（必须保持纯净学生视角）" % word)

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print("  [OK] 课件检查全部通过（视觉纯净无多余台词）")
    return len(fails), len(warns)


# ---------------- P0-3 / P1-1：lesson.yaml 目录级门禁 ----------------

_GRAPH = None


def _norm(s):
    return re.sub(r'[\s"“”\'\'‘’・·—\-_]+', "", s)


def load_textbook_graph():
    """解析 references/textbook-zj2026.md，返回 {(grade, term, lesson_no): (title, unit)}。"""
    global _GRAPH
    if _GRAPH is not None:
        return _GRAPH
    graph = {}
    grade = term = unit = None
    try:
        lines = open(GRAPH_PATH, encoding="utf-8").read().splitlines()
    except OSError:
        _GRAPH = graph
        return graph
    for line in lines:
        m = re.search(r"###\s*[📘📗]*\s*(小学|初中)([三四五六七八])年级(上|下)册", line)
        if m:
            num = {"三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8}[m.group(2)]
            grade, term, unit = num, m.group(3), None
            continue
        m = re.search(r"-\s*\*\*第(.+?)单元\s+(.+?)\*\*", line)
        if m and grade:
            unit = "第%s单元 %s" % (m.group(1), m.group(2).strip())
            continue
        m = re.search(r"^\s*-\s*第\s*(\d+)\s*课\s+(.+?)\s*$", line)
        if m and grade and term:
            graph[(grade, term, int(m.group(1)))] = (m.group(2).strip(), unit)
    _GRAPH = graph
    return graph


def check_manifest(lesson_dir):
    """P1-1 四件套同源门禁 + P0-3 教材课次对齐门禁。"""
    print("=" * 60)
    print("检查课程 Manifest:", lesson_dir)
    fails, warns = [], []

    if yaml is None:
        fails.append("pyyaml 未安装，无法解析 lesson.yaml（请 uv sync 安装项目依赖）")
        return len(fails), len(warns)

    mf_path = os.path.join(lesson_dir, "lesson.yaml")
    try:
        manifest = yaml.safe_load(open(mf_path, encoding="utf-8").read())
    except Exception as e:
        print("  [FAIL] lesson.yaml 解析失败:", e)
        return 1, 0
    if not isinstance(manifest, dict):
        print("  [FAIL] lesson.yaml 顶层必须是映射")
        return 1, 0

    required = ["title", "grade", "term", "lesson_no", "unit", "tasks", "artifacts"]
    for key in required:
        if key not in manifest or manifest[key] in (None, ""):
            fails.append("lesson.yaml 缺少必填字段: %s" % key)

    artifacts = manifest.get("artifacts") or {}
    texts = {}
    for kind in ("plan", "worksheet", "slides", "classwork"):
        fname = artifacts.get(kind)
        if not fname:
            fails.append("lesson.yaml artifacts 缺少 %s 条目" % kind)
            continue
        fpath = os.path.join(lesson_dir, fname)
        if not os.path.isfile(fpath):
            fails.append("四件套文件缺失 [%s]: %s" % (kind, fname))
            continue
        content, err = read(fpath)
        if content is None:
            fails.append("四件套文件不是 UTF-8 编码 [%s]: %s" % (kind, fname))
            continue
        texts[kind] = content

    title = str(manifest.get("title") or "")
    if title and texts:
        # 标题一致性：每件套标题须包含课题名
        for kind, content in texts.items():
            if kind == "classwork":
                m = re.search(r"<title>(.*?)</title>", content, re.S)
                head = m.group(1) if m else ""
            else:
                m = re.search(r"^#\s+(.+)$", content, re.M)
                head = m.group(1) if m else content[:500]
            if _norm(title) not in _norm(head):
                fails.append("标题不一致 [%s]：标题区未包含课题《%s》" % (kind, title))

    # 任务同源：每个任务名必须在四件套中全部出现
    tasks = manifest.get("tasks") or []
    if title and texts:
        for t in tasks:
            name = t.get("name") if isinstance(t, dict) else t
            if not name:
                continue
            missing = [k for k, c in texts.items() if _norm(str(name)) not in _norm(c)]
            if missing:
                fails.append("任务不同源：【%s】在以下件套中未出现: %s（改任一件的任务名即 FAIL）"
                             % (name, missing))

    # P0-3：教材课次对齐
    grade, term, no = manifest.get("grade"), manifest.get("term"), manifest.get("lesson_no")
    if grade and term and no and title:
        graph = load_textbook_graph()
        key = (int(grade), str(term), int(no))
        if key not in graph:
            warns.append("%d年级%s册第%s课在教材图谱中未找到，请检查课序号或更新图谱"
                         % (int(grade), term, no))
        else:
            g_title, g_unit = graph[key]
            if _norm(title) not in _norm(g_title) and _norm(g_title) not in _norm(title):
                fails.append(
                    "教材课次冲突：图谱记载 %d年级%s册第%s课=《%s》，但本课 lesson.yaml/四件套使用《%s》。"
                    "请先以原始教材核验真实课次，再修正其中一方（P0-3）"
                    % (int(grade), term, no, g_title, title))
            g_unit = g_unit or ""
            unit = str(manifest.get("unit") or "")
            if unit and g_unit and _norm(unit) not in _norm(g_unit) and _norm(g_unit) not in _norm(unit):
                warns.append("单元归属与图谱不一致：图谱为【%s】，lesson.yaml 为【%s】" % (g_unit, unit))

    for w in warns:
        print("  [WARN]", w)
    for f in fails:
        print("  [FAIL]", f)
    if not fails and not warns:
        print("  [OK] Manifest 同源与课次对齐全部通过")
    return len(fails), len(warns)


def audit_path(p):
    """根据文件或目录智能派发审计；单个文件异常不中断整体报告。"""
    total_f, total_w = 0, 0
    if os.path.isdir(p):
        manifest_dirs = set()
        for root, _, files in os.walk(p):
            for file in files:
                fp = os.path.join(root, file)
                if file == "lesson.yaml":
                    manifest_dirs.add(root)
                    continue
                try:
                    f, w = audit_single_file(fp)
                except Exception as e:  # P1-3：单个文件异常不中断整个检查报告
                    print("=" * 60)
                    print("检查文件异常: %s" % fp)
                    print("  [FAIL] 检查器内部异常（已隔离，不影响其他文件）: %s" % e)
                    f, w = 1, 0
                total_f += f
                total_w += w
        for d in sorted(manifest_dirs):
            try:
                f, w = check_manifest(d)
            except Exception as e:
                print("=" * 60)
                print("检查 Manifest 异常: %s" % d)
                print("  [FAIL] 检查器内部异常（已隔离）: %s" % e)
                f, w = 1, 0
            total_f += f
            total_w += w
        return total_f, total_w
    else:
        try:
            return audit_single_file(p)
        except Exception as e:
            print("=" * 60)
            print("检查文件异常: %s" % p)
            print("  [FAIL] 检查器内部异常: %s" % e)
            return 1, 0


def audit_single_file(p):
    base = os.path.basename(p)
    if p.endswith(".html"):
        return check_html(p)
    elif p.endswith(".md"):
        if "导学" in base or "worksheet" in base.lower():
            return check_worksheet(p)
        elif "教案" in base or "plan" in base.lower():
            return check_lesson_plan(p)
        elif "课件" in base or "slide" in base.lower():
            return check_slides(p)
        else:
            # 智能嗅探文件内容特征进行自动分流，绝不误判
            text, _ = read(p)
            if text:
                if "marp: true" in text:
                    return check_slides(p)
                elif "通关目标" in text or "导学单" in text or "⭐" in text:
                    return check_worksheet(p)
                elif "教材分析" in text or "学情分析" in text or "教学过程" in text:
                    return check_lesson_plan(p)
    return 0, 0


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    total_f = total_w = 0
    for p in sys.argv[1:]:
        if p in ("-h", "--help"):
            print(__doc__)
            return 0
        f, w = audit_path(p)
        total_f += f
        total_w += w
    print("=" * 60)
    print("合计: %d 个错误, %d 个提醒" % (total_f, total_w))
    return 1 if total_f else 0


if __name__ == "__main__":
    sys.exit(main())
