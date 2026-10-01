# IT Lesson Studio (中小学信息科技教学工作室)

> 专为中国中小学信息科技/信息技术教师打造的**“四位一体”全流程备课与教学工作台**。
> 一次输入，自动同源生成**规范教案 (Word)、演示课件 (Marp PPTX/PDF)、探究导学单 (Word)、交互作业 (HTML)**。

---

## 🌟 四大阶段产物矩阵

| 教学阶段 | 产物格式 | 核心特色 | 适用场景 |
|:---|:---|:---|:---|
| **1. 教学设计（教案）** | `.docx` / `.md` | Pandoc 双栏表格排版，课标四维素养，附 Mermaid 板书结构图 | 学校常规备课检查、教研公开课、申报评比 |
| **2. 教学课件（演示文稿）** | `.pptx` / `.pdf` / `.md` | Marp `edu-lesson` 16:9 现代教学主题，卡片网格布局，大屏高对比投影 | 讲台大屏授课、互动问答、演示讲解 |
| **3. 探究导学单（学案）** | `.docx` / `.md` | 学生第一视角（我的任务），留白与表格设计，阶梯式进阶挑战 | 学生机房实操指南、纸笔记录、小组合作 |
| **4. 课堂作业（交互题库）** | `.html` + 凭单 `.txt` | **单文件纯离线**，零依赖，自动批改、即时解析，一键导出成绩凭单 | 随堂测评、学生自测、无外网机房收作业 |

---

## 🎯 为什么选择 IT Lesson Studio？

1. **同源同构，拒绝割裂**：教案的情境导入、课件的引导卡片、导学单的探究步骤与 HTML 作业的实操关卡 100% 呼应。
2. **机房真离线，开箱即用**：
   - 交互作业为**纯静态单文件**，无需任何网络连接与外网 CDN，内嵌全部样式与脚本。
   - 学生交卷后一键导出包含姓名、成绩与防篡改指纹的 `.txt` 学习凭单，方便机房无服务器极简收发。
3. **严格对齐学段认知**：
   - 严格遵循《义务教育信息科技课程标准（2022年版）》。
   - 杜绝小学低段盲目出现过于抽象的代码术语，情境贴近中小学生真实校园与日常生活。

---

## 🛠️ 环境准备与快速上手

### 1. 基础环境
- **Node.js** (>= 18)
- **Pandoc**：用于将 Markdown 编译为高标准 Word 文档
  - Windows: `winget install pandoc`
  - macOS: `brew install pandoc`
- **uv / Python**：用于运行教学成果合规性审计脚本
  - Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`

### 2. 常用命令
```bash
# 安装依赖
npm install

# 一键导出指定课例的所有 Word、PPTX、PDF 资产
npm run export:lesson examples/三年级上/第03课_了解信息处理工具/

# 运行课堂作业规范与离线性自检
npm run check:lesson examples/三年级上/第03课_了解信息处理工具/03_了解信息处理工具_课堂作业.html
```

---

## 📂 目录结构

```text
it-lesson-studio/
├── skills/
│   └── it-lesson-studio/      # 核心 Master Prompt 技能定义
├── resources/
│   ├── pandoc/                # Word 模板与 Lua 过滤器 (模板.docx + br.lua)
│   ├── themes/                # Marp 课件主题样式 (edu-lesson.css)
│   └── classwork/             # 交互作业基础骨架 (base-template.html)
├── references/
│   ├── textbook-zj2026.md     # 新课标教材知识网络与年级学段认知锚点
│   └── patterns.md            # HTML 交互作业题型设计模式库
├── scripts/
│   ├── export-lesson.mjs      # 一键 Word/PPTX/PDF 编译导出脚本
│   └── check_lesson.py        # 成果合规与零外链静态自检脚本
├── examples/                  # 示范样例工程
│   └── 三年级上/
│       └── 第03课_了解信息处理工具/
├── DEVELOPMENT.md             # 开发者与后续打磨指南（重点参考）
└── package.json
```

---

## 📖 深入打磨与贡献

本项目正在持续打磨完善中！关于**题型扩展路线图、Word 模板美化、Marp 多主题支持、局域网作业收集方案**等具体规划，请务必阅读：
👉 **[开发与打磨指南 (DEVELOPMENT.md)](DEVELOPMENT.md)**

---

## 📄 开源许可
MIT License.