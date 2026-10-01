# IT Lesson Studio (中小学信息科技教学工坊)

> 专为中国中小学信息科技（信息技术）教师打造的**“四位一体”全流程教学交付引擎**。
> 一次输入课题或课本照片，自动输出同源联动的**规范教案（Word）、放映课件（PPT/PDF）、纸质导学单（Word）与机房离线互动作业（HTML）**。

---

## 🌟 四大闭环交付件

| 教学环节 | 产出物格式 | 核心特色 | 使用场景 |
|:---|:---|:---|:---|
| **1. 教学设计（教案）** | `.docx` / `.md` | Pandoc 双列表格严谨排版，对齐新课标四大核心素养，含 Mermaid 结构化板书 | 学校教案检查、教研备案、公开课申报 |
| **2. 教学课件（PPT）** | `.pptx` / `.pdf` / `.md` | Marp `edu-lesson` 16:9 现代主题，卡片网格布局，高聚焦无废话 | 讲台大屏投屏授课、说课演示 |
| **3. 上机导学案（任务单）** | `.docx` / `.md` | 阶梯闯关式任务设计，含连线、探究记录表、评价量规 | 学生自主探究、纸笔记录、小组合作留痕 |
| **4. 课堂作业（互动作业）** | `.html` + 学习记录 `.txt` | **零依赖单文件**，完全离线运行，步骤条导航，防作弊测验，`Blob` 一键导出成绩单 | 机房离线实操、当堂检核、无后端收发作业 |

---

## 💡 为什么选择 IT Lesson Studio？

1. **同源联动，拒绝割裂**：教案的情境、课件的卡片、导学单的任务与 HTML 作业的互动关卡 100% 严密对应。
2. **懂一线机房的实际环境**：
   - 互动课堂作业为**纯静态单文件**，无 CDN、无外链，断网机房双击即开；
   - 学生做完一键导出 `.txt` 成绩单，首行包含标准分隔符，方便教师机一键汇总统计。
3. **严格的年级认知与难度阶梯**：
   - 小学 3–6 年级、初中 7–8 年级严格量化屏数、动手环节数、每屏字数与题量；
   - 适配普通及农村学校认知起点，情境真实接地气，自我评价必须允许“我还没完全懂”的不扣分出口。

---

## 🛠️ 环境准备与快速上手

### 1. 基础环境
- **Node.js** (>= 18)
- **Pandoc**：用于将 Markdown 表格编译为标准 Word 文档
  - Windows: `winget install pandoc`
  - macOS: `brew install pandoc`

### 2. 常用命令
```bash
# 一键编译指定课程的 Word、PPTX、PDF 交付件
npm run export:lesson examples/三年级上/第03课_了解信息处理工具

# 校验生成的 HTML 互动作业合规性与难度红线
npm run check:lesson <HTML文件路径>
```

---

## 📁 目录结构

```text
it-lesson-studio/
├── skills/
│   └── it-lesson-studio/      # 核心智能体技能定义
├── resources/
│   ├── pandoc/                # Word 模板 (模板.docx + br.lua)
│   ├── themes/                # Marp 课件主题 (edu-lesson.css)
│   └── classwork/             # 课堂互动作业基底 (base-template.html)
├── references/
│   ├── textbook-zj2026.md     # 浙教版/统编版教材地图与难度档位表
│   └── patterns.md            # HTML 互动组件模式库
├── scripts/
│   ├── export-lesson.mjs      # 一键导出 Word/PPTX/PDF 脚本
│   └── check_lesson.py        # HTML 作业规范与难度校验脚本
├── examples/                  # 示范课程案例
│   └── 三年级上/
│       └── 第03课_了解信息处理工具/
└── package.json
```

---

## 📄 开源许可
MIT License.
