# 输出规范总表（唯一口径）

> 本文件是教案 / 导学单 / 课件 / HTML 课堂作业全部篇幅与难度数值的**唯一来源**。
> README.md、DEVELOPMENT.md、skills/it-lesson-studio/SKILL.md、AGENTS.md
> 只引用本表，不再各自维护数值。`scripts/check_lesson.py` 从下方
> `spec-yaml` 代码块读取阈值做门禁，做到"文档即门禁"。
>
> 口径收敛记录（2026-10-03）：历史上出现过 250~450（Skill 旧文）、350~500
>（README/DEVELOPMENT）、350~520（检查器提示）等多种表述，现统一为下表；
> 5~8 年级导学单由"严格双面 800~1100"修正为"**单面优先**，复杂大课才双面"。

## 一、备课教案（Word）

| 项目 | 规范 |
|---|---|
| 物理篇幅 | 严格 ≤4 页 A4（双面打印刚好 2 张纸），绝不溢出第 5 页 |
| 正文字数 | 目标 2000~2800 字；<1600 字偏单薄（WARN）；>2800 字偏长（WARN）；>3200 字必超 4 页（FAIL） |
| 板书 | 彻底取消独立板书环节（含 Mermaid），节约纸张 |

## 二、探究导学单（Word）

| 学段 | 版式 | 字数 |
|---|---|---|
| 3~4 年级 | **严格单面 A4（恒=1 页）**，严禁翻页 | 推荐 350~520 字；>520 字 WARN；>550 字 FAIL（必跨页） |
| 5~8 年级 | **单面 A4 优先**；仅复杂算法分支预演、代码多步追踪、综合项目式大课时允许双面（≤2 页，严禁第 3 页） | 单面推荐 300~550 字；双面大课上限 1100 字；>1200 字 FAIL |

导学单抬头统一为"班级、姓名、评价"（取消机房座号）；正文题干首行缩进两格；
必须含 `[ ]` 勾选槽 / 填空括号等纸笔互动留痕、通关目标、末尾好习惯自评。

`lesson.yaml` 中以 `worksheet_layout: single | duplex` 声明版式，
双面须在 `layout_reason` 写明复杂性理由。

## 三、互动课堂作业（HTML）

| 年级 | 屏数上限 | 动手环节上限 | 测验题数上限 | 每屏正文上限 | 题干字数上限 |
|---|---|---|---|---|---|
| 3 | 4 | 1 | 2 | 60 字 | 30 字 |
| 4 | 4 | 1 | 2 | 80 字 | 34 字 |
| 5 | 5 | 2 | 3 | 100 字 | 40 字 |
| 6 | 5 | 2 | 3 | 120 字 | 44 字 |
| 7 | 6 | 2 | 3 | 140 字 | 50 字 |
| 8 | 6 | 2 | 3 | 160 字 | 54 字 |

- **屏数**：`<section class="panel" data-step="N">` 从 0 连续编号，数量即屏数。
- **动手环节**：指学生亲手完成一项可验证的操作任务的屏
  （技能仿真、调试排雷、变量追踪赋值等），以 `data-panel-type="hands-on"` 标记；
  纯点击浏览 / 配对认知屏不计入。
- **每屏正文**：指承担阅读负荷的教学正文（情境导入句、操作口诀、知识讲解），
  以 `data-prose` 标记；标题、卡片标签、按钮文案等交互文案不计入。
  无 `data-prose` 的屏记 WARN（提醒作者补标记），不直接 FAIL。
- **题干字数**：`const quiz = [...]` 数组中每道 `q:` 题干的上限；
  解剖台等关卡内的随堂巩固小问不计入测验题干。
- 头部必须声明 `<meta charset="UTF-8">` 与
  `<meta name="lesson-grade" content="年级数字">`（仅 3~8 合法）。

## 四、教学课件（Marp）

16:9、`edu-lesson` 主题；大屏严禁出现"广播听讲""建议用时""教师备注"等
教师后台台词，保持纯净学生第一视角；一页一核心任务，卡片网格布局。

## 五、实际版式校验（P1-5）

字数只是纸张的近似证明。`scripts/verify_layout.py` 在导出后实测：

- 教案 DOCX（转 PDF 后）≤4 页；导学单 DOCX 页数须等于
  `lesson.yaml` 声明的版式（single=1 页，duplex=2 页）；
- Marp PDF 页数须与 PPTX 幻灯片数一致且 >0；
- 校验失败则导出流水线以非零退出码退出。

## 六、机器可读规范（check_lesson.py 唯一数值来源）

```spec-yaml
lesson_plan:
  target_min: 2000
  target_max: 2800
  warn_low: 1600
  warn_high: 2800
  fail_max: 3200
  max_pages: 4
worksheet:
  grades_3_4: { target_min: 350, target_max: 520, warn_max: 520, fail_max: 550, layout: single }
  grades_5_8: { target_min: 300, target_max: 550, duplex_max: 1100, fail_max: 1200, layout: single_preferred }
html_grades:
  3: { screens: 4, hands_on: 1, quiz: 2, prose_per_screen: 60, quiz_stem: 30 }
  4: { screens: 4, hands_on: 1, quiz: 2, prose_per_screen: 80, quiz_stem: 34 }
  5: { screens: 5, hands_on: 2, quiz: 3, prose_per_screen: 100, quiz_stem: 40 }
  6: { screens: 5, hands_on: 2, quiz: 3, prose_per_screen: 120, quiz_stem: 44 }
  7: { screens: 6, hands_on: 2, quiz: 3, prose_per_screen: 140, quiz_stem: 50 }
  8: { screens: 6, hands_on: 2, quiz: 3, prose_per_screen: 160, quiz_stem: 54 }
markers:
  panel_type_attr: data-panel-type
  hands_on_value: hands-on
  prose_attr: data-prose
```

## 七、lesson.yaml（每课 Manifest，P0-3 / P1-1）

每课目录下必须有 `lesson.yaml`，记录机器可读的课次身份与四件套映射：

```yaml
title: 了解智能工具        # 课题（须与四件套标题一致）
grade: 3
term: 上                  # 上 / 下
lesson_no: 2
unit: 第一单元 感受智能社会
textbook: 浙教版2026
textbook_id: "1000067"    # 教材图谱中的 Textbook ID（可选）
scenarios: [智能工具小剧场] # 四件套共同情境关键词
worksheet_layout: single   # single | duplex（双面须写 layout_reason）
tasks:                     # 四件套统一任务（ID 全课唯一）
  - id: T1
    name: 工具与本领配对
  - id: T2
    name: 机箱微型解剖台
artifacts:
  plan: 02_了解智能工具_教案.md
  worksheet: 02_了解智能工具_导学案.md
  slides: 02_了解智能工具_课件.md
  classwork: 02_了解智能工具_课堂作业.html
```

门禁（`check_lesson.py` 目录级检查）验证：

1. 四件套文件齐全；
2. 每件套标题含 `title`；
3. 每个任务名在四件套中全部出现（改任一件的任务名即 FAIL）；
4. `(grade, term, lesson_no, title, unit)` 与 `references/textbook-zj2026.md`
   图谱一致，不一致即 FAIL（教材课次对齐铁律，P0-3）。
