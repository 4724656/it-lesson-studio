# IT Lesson Studio - AI Agent 工作上下文与交接备忘录 (AGENTS.md)

> **致进入本项目的下一个 AI Assistant**：  
> 请务必在开始工作前完整阅读本文档。本项目已有极其清晰的架构设计、权威依据和明确的任务路线图。用户当前的核心诉求是**“一个一个深度打磨四个环节里的各个 skills/模块”**。

---

## 1. 项目核心背景与使命

- **项目定位**：专为浙江省中小学（小学 3~6 年级、初中 7~8 年级）信息科技/信息技术教师打造的**“四位一体”全流程教学工作台**。
- **四大核心教学环节**（具体篇幅/字数阈值以 `references/output-spec.md` 为唯一口径，下文历史打卡中的数值仅为当时的记录）：
  1. **备课教案 (Lesson Plan)**：`.md` 编译为 `.docx`（首行缩进两格公文精排、彻底取消板书、降坡度三大支架）。
  2. **探究导学单 (Worksheet)**：`.md` 编译为 `.docx`（学生第一视角、取消座号、显式留白槽位与闭合网格）。
  3. **教学课件 (Marp Slides)**：`.md` 编译为 `.pptx` 与 `.pdf`（Marp `edu-lesson` 16:9 现代大屏主题，卡片网格布局，纯净学生第一视角）。
  4. **课堂作业 (HTML Classwork)**：**轻量单文件 HTML 互动作业**（微型仿真与即时判分，一键导出 `.txt` 学习凭单无缝上传至中小学信息科技与人工智能平台，自带电子通关奖状）。
- **三大核心原则**：
  - **四位一体同源**：同一节课的情境、任务、幻灯片与作业关卡必须 100% 呼应，杜绝割裂。
  - **平台联动与开箱即用**：作业采用轻量单文件架构，凭单 `.txt` 直传中小学信息科技与人工智能平台，无需繁琐部署。
  - **素养与学段对齐**：紧扣 2022 新课标，严格遵守年级认知阶梯，小学低段严禁出现过于抽象的代码术语。

---

## 2. 权威依据与知识库索引（必须严格遵守）

AI 在生成或审计任何教学内容时，必须以此四份文档为最高准绳：
1. 📘 **[references/curriculum-standard-2022.md](references/curriculum-standard-2022.md)**：
   - 中华人民共和国教育部《义务教育信息科技课程标准（2022年版）》全文。
   - 核心素养表述（信息意识、计算思维、数字化学习与创新、信息社会责任）、学段目标、模块内容要求与学业质量标准。
2. 📗 **[references/textbook-zj2026.md](references/textbook-zj2026.md)**：
   - 浙教版 2026 新课标最新教材目录图谱（从之江汇官方教学平台实时抓取校验）。
   - 覆盖 3~8 年级共 6 个年级、12 个册次、46 个单元、240 个课时（已彻底剔除 9 年级老旧内容）。
3. 📙 **[references/worksheet-patterns.md](references/worksheet-patterns.md)**：
   - 课堂导学单题型模式库、篇幅约束与显式留白规范。
4. 📙 **[references/patterns.md](references/patterns.md)**：
   - 课堂作业题型模式库与单文件原生交互规范。

---

## 3. 核心工具链与系统命令

- **Master Skill**：`skills/it-lesson-studio/SKILL.md`（定义了全流程专家角色的生成行为与质量红线）。
- **模板与样式**：
  - Word 模板与 Lua 软换行过滤器：`resources/pandoc/模板.docx`、`resources/pandoc/br.lua`
  - Marp 演示课件主题：`resources/themes/edu-lesson.css`
  - 课堂作业基准骨架：`resources/classwork/base-template.html`
- **自动化导出流水线**：
  ```bash
  node scripts/export-lesson.mjs <课程目录或Markdown文件路径>
  ```
  *(注：该脚本会自动串联 Pandoc 编译，并在后台自动调用 `scripts/beautify_docx.py` 实现中文公文级精排)*
- **合规自检脚本**（特别注意：根据用户全局规则，Python 执行必须使用 `uv run python`）：
  ```bash
  uv run python scripts/check_lesson.py <课堂作业HTML文件路径 或 导学案Markdown路径>
  ```

---

## 4. 当前开发进度与下一步主任务（Roadmap）

用户明确指示：**“现在最主要的任务还是打磨四个环节里的各个skills，一个一个来。”**

建议接下来的执行顺序（请主动与用户确认当前具体先攻坚哪一个）：

### 🎯 环节一：备课教案 Skill 深度打磨 (✅ 4页之内硬约束与实用支架已攻坚落地)
- [x] **确立物理篇幅铁律**：严格**控制在 4 页 A4 纸之内（双面打印刚好 2 张纸）**，正文字数控制在 2000~2800 字，绝不溢出到第 5 页浪费纸张。
- [x] **彻底取消板书环节**：不再生成 Mermaid 板书流程图与图注说明，节约排版空间与纸张，聚焦课堂实质教学。
- [x] **一线实战实用性（化解浙教版高难度）**：注入通俗生活比喻、真实启发设问台词、上机踩坑点拨锦囊，降低学生认知坡度。
- [x] **四位一体同源联动**：教学过程中的“课堂练习”与学生“导学单”各关卡 100% 同源呼应。

### 🎯 环节二：课堂导学单 Skill 深度打磨 (✅ 核心规范与精准单页防溢出已攻坚落地)
- [x] **确立物理篇幅原则（单页优先 · 上限封顶 · 严禁凑页注水）**：导学单核心定位为“轻量上机实操脚手架”，全学段**一律单面 A4 优先（1页，300~500字）**；低年级（3~4年级）单面 A4 封顶（绝不翻页），高年级（5~8年级）仅在复杂长情境项目大课时才拓展至双面 A4（上限封顶 2 页），**严禁为凑篇幅生硬注水**。
- [x] **杜绝尾页跨页孤行（实测精准 1 页收口）**：排版引擎注入纵向安全裕度（上下边距 14mm，行距 1.22，紧凑段后距与单元格），彻底解决多出 1 行溢出为 2 页的问题；经 Word COM 严格统计检测，三年级与四年级导学单实际页数**均 100% 稳定为精准 1 页**。
- [x] **彻底剔除“机房座号”**：导学单抬头统一精简为“班级、姓名、评价”，去除冗余字段，横向不换行。
- [x] **正文首行缩进两格与列表悬挂**：`beautify_docx.py` 严格设置正文题干说明首行缩进两格 (21pt)，步骤/选项列表保持左侧整齐悬挂。
- [x] **输出标准题型库与骨架指南**：沉淀于 [references/worksheet-patterns.md](references/worksheet-patterns.md)。
- [x] **重构落地标杆样例**：重构三年级《了解信息处理工具》与四年级《从数据到编码》两套导学单并全部通过验证。

### 🎯 环节三：教学课件 Marp Slides Skill 深度打磨 (✅ 视觉纯净与大屏卡片规范已攻坚落地)
- [x] **严格大屏学生第一视角**：彻底清理掉所有滑稽生硬的“广播听讲”、“建议用时：X分钟”等教师后台台词。
- [x] **单页信息密度与卡片布局**：采用 `<div class="grid-2">`、`<div class="card">` 与 `<kbd>`，一页一核心任务，拒绝“课本搬家”。
- [x] **四位一体强咬合**：课件任务关卡与导学单、互动作业 100% 同名同源呼应。

### 🎯 环节四：随堂互动作业 HTML Skill 深度打磨 (✅ 标杆落地与工业级交互规范已沉淀)
- [x] **轻量独立与开箱即用规范**：精炼单文件架构，免繁杂环境配置，下发秒开，无缝联动中小学信息科技与人工智能平台。
- [x] **年级屏数档位严格把控**：3~4年级严格 ≤4 屏，正文 ≤60 字，题干 ≤30 字，测验 ≤2 题。
- [x] **创新交互微型仿真器**：
  - 关卡一：工具与本领双列卡片磁吸配对；
  - 关卡二：深色机箱主板微型解剖台（点击发光芯片弹出通俗生活比喻）；
  - 关卡三：小啄木鸟双击模拟桌面 + 记事本窗口键盘录入姓名拼音；
  - 关卡四：随堂微测验（提交后统一判分）、通关徽章墙（动态点亮）、自我评价（含“还没完全懂”出口）、一键导出 txt 凭单（首行标准可 grep 汇总行）+ 现场生成电子荣誉通关奖状卡！
- [x] **全流程自动化自检**：`uv run python scripts/check_lesson.py` 自动化检测 0 FAIL / 0 WARN。
- [x] **沉淀 Master Skill**：将整套 HTML 交互规范反哺写入 `skills/it-lesson-studio/SKILL.md` 模块四。

### 🎯 环节五：Web 备课工作台与容器化编排 (✅ feature/web-studio 已落地)
- [x] **轻量全功能 Web 界面**：大气宽屏暗黑风 UI（Tailwind/原生 CSS），浙教版 2026 目录联动，支持文本与课本照片参考资料输入。
- [x] **两阶段深度生成流水线**：
  - 阶段 1：并行生成教案、导学案、课件 Markdown 并落盘编译；
  - 阶段 2：基于教案任务关卡强咬合生成单文件离线交互 HTML 作业。
- [x] **极简无感导出规范**：彻底剔除服务器绝对路径；作业凭单与奖状一键秒下，严禁弹窗阻断拦截学生，不给打字慢的孩子添门槛。
- [x] **教研组权限体系与做减法**：SQLite 零外部依赖持久化；注册邀请码；管理员后台做减法（聚焦成员管理与 AI 接口热切换，所有人只看自己备课历史）。
- [x] **通用容器化编排**：通用纯净 `docker-compose.yml` 与 `Dockerfile`，标准端口 3800，挂载 `./web/data` 目录持久化。

---

## 5. 快速确认工作状态命令

接手的 Agent 可随时在终端运行以下命令验证工作区健康度：
```powershell
git status               # 检查 Git 分支与状态
uv run python scripts/check_lesson.py examples/三年级上/第02课_了解智能工具/ # 门禁自动化全检 (0 FAIL / 0 WARN)
node scripts/export-lesson.mjs examples/三年级上/第02课_了解智能工具/  # 验证编译导出流水线 (4/4 成功)
```

---

## 6. OPUS 深度审计与问题闭环攻坚记录 (2026-10-01)

### 🔴 P0 级严重问题（已彻底修复并通过回归验收）
1. **`beautify_docx.py` 的 `beautify_lesson_plan_docx()` 遗漏 `doc.save(docx_path)`**：
   - **影响**：教案公文精排修改从未写回磁盘，导致排版修改静默丢失。
   - **修复**：在函数末尾补齐 `doc.save(docx_path)`，教案排版现已 100% 写入生效。
2. **四位一体同源偏差（HTML 作业与教案/导学案/课件不一致）**：
   - **影响**：HTML 作业第一关原仅有 3 个工具（缺少“电子计算机”），第二关芯片槽使用了“内存(RAM)”而非“主板(Motherboard)”。
   - **修复**：第一关补入第 4 个工具卡“💻 电子计算机”与功能卡“🚀 功能全面算力强”，配对判定修正为 `matchedCount === 4`，凭单分母改为 4；第二关芯片槽将 `ram` 替换为 `mb`（电脑主板，比喻对齐为“电路桥梁”），风扇比喻对齐为“降温空调”。

### 🟡 P1-P2 级次要问题（已彻底修复并通过回归验收）
1. **`check_lesson.py` 路由分流与教案/课件全检**：
   - **修复**：支持智能内容嗅探与扩展名分流，传入目录可全自动递归检测 HTML 作业、导学案、教案、课件；完善了教案四大教学环节与三大支架的灵活匹配；加入 Windows 控制台 UTF-8 中文输出防护，彻底杜绝乱码。
2. **Word `[ ]` 跨 Run 节点替换健壮性**：
   - **影响**：Pandoc 在将中英混排转 Word 时，`[ ]` 经常被切分到不同 `<w:r>` Run 节点（例如 Run 1 为 `：[`，Run 2 为 ` ]`），导致单 Run 替换静默失效，且末尾自评行漏替。
   - **修复**：实现字级别跨 Run 边界重组替换算法 `replace_in_runs`，在遍历段落与表格单元格时无损将 `[ ]` 替换为标准方框 `□`，同时剥离导学单勾选行多余的 Word 项目符号黑圆点 `•`，完美呈现整洁方框。
3. **Mermaid 渲染超时防护**：
   - **修复**：在 `downloadMermaidPng` 中加入 3 秒快速超时限制与友好的 fallback 降级机制，网络异常环境下绝不挂起流水线。

---

## 7. Muse 助手深度审查与质量加固记录 (2026-10-02)（历史存档）

> **历史说明**：本节记录 2026-10-02 首轮审查的修复。当时"三年级第03课《了解信息处理工具》"
> 尚未被纠正为教材真实的"第02课《了解智能工具》"（见 2026-10-03 P0-3 修复）。
> 下文"第03课"均指旧课次身份，课例本身已迁移至 `examples/三年级上/第02课_了解智能工具/`，
> 旧目录已删除。当前规范以 `references/output-spec.md` 为准。

### 🔴 P0 级严重同源性问题（已彻底修复并通过回归验收）
1. **三年级第03课课件 7 大构件超纲割裂**：
   - **影响**：三年级第 3 课《了解信息处理工具》中，教案、导学单与 HTML 作业均严格聚焦教材核心的 **4 大构件**（CPU、主板、硬盘、风扇），但课件（Marp Slides）却残留了老旧的 7 大构件（超纲引入电源、显卡、内存），导致教学四件套严重割裂。
   - **修复**：将课件全面重构为“机箱内部 4 大核心构件”，比喻词汇全面对齐（CPU 超级大脑、主板 电路桥梁、硬盘 海量仓库、风扇 降温空调），大屏卡片布局同步适配为双栏对比。

### 🟡 P1 级规范与门禁加固
1. **`check_lesson.py` 屏数档位严格对齐项目铁律**：
   - **修复**：将脚本中的屏数上限从宽松的 `(5, 6, 6, 7, 7, 8)` 全面收紧对齐为标准铁律：**3~4 年级 ≤4 屏，5~6 年级 ≤5 屏，7~8 年级 ≤6 屏**。
2. **新增随堂测验题数阻断校验**：
   - **修复**：新增 `count_quiz_questions()` 解析 `const quiz = [...]` 数组，若测验题数超过学段上限（3~5年级 ≤2题，6~8年级 ≤3题）直接判定为 `FAIL` 拦截。
3. **2022 新课标 OCR 格式修复与校对**：
   - **修复**：附录第四学段“跨学科主题”原版 OCR 损毁乱码已整理恢复为清晰规范文本；订正“吾开项目总结分享会”等断行与错别字。
4. **浙教版 2026 教材图谱彻底剔除九年级**：
   - **修复**：移除初三（九年级）老旧内容，将全省教材体系口径精准锁定为：**3~8 年级共 6 个年级、12 个册次、46 个单元、240 个课时**。全项目文档（`README.md`、`AGENTS.md`、`SKILL.md`）统计数据全面拉齐。

### 🟢 P2 级工程健壮性与死代码清理
1. **依赖重构**：`package.json` 移除了教案取消板书后无用的 `@mermaid-js/mermaid-cli`，正式声明幻灯片导出必需的 `@marp-team/marp-cli: ^4.5.1`。
2. **导出脚本防泄漏**：`scripts/export-lesson.mjs` 将 `.tmp.md` 临时文件清理放入 `finally` 块，异常时绝不残留垃圾文件；支持目标路径不存在时友好提示可用课例。
3. **Word 美化精简**：`scripts/beautify_docx.py` 移除了导学单排版中两分支完全相同的死代码。
4. **课件 BOM 清理**：移除了四年级第 10 课课件文件头部的不可见 UTF-8 BOM 字符。
5. **凭单 Git 忽略规则完善**：`.gitignore` 将 `*_00001.txt` 扩展为 `*_*.txt`，杜绝任意命名学生凭单被误入库。

---

## 8. 当前标杆课例库状态 (3 套全链路黄金标杆，覆盖三学段)

运行全库门禁检测可验证全部 3 套标杆课例健康度（**100% 通过 0 FAIL / 0 WARN**）：
```bash
uv run python scripts/check_lesson.py examples/
```

每课目录下均有 `lesson.yaml`（机器可读 Manifest：课次身份 / 四件套映射 / 统一任务名 / 版式声明），
`check_lesson.py` 自动校验四件套标题一致、任务名同源、课次与 `references/textbook-zj2026.md` 图谱对齐（含 `textbook_id` 机器核对）。

- 📗 **小学低年级标杆（三年级）**：`examples/三年级上/第02课_了解智能工具/`（A4单页导学单、4页教案、16:9课件、4屏微解剖HTML）
- 📗 **小学高年级标杆（六年级）**：`examples/六年级上/第05课_算法的执行/`（A4单页导学单、4页教案、16:9课件、4屏代码排雷与状态变量HTML）
- 📗 **初中标杆（八年级）**：`examples/八年级上/第12课_数据解密/`（凯撒密码；A4单页导学单、4页教案、16:9课件含 `.task-route` 人化组件、6屏变量追踪与逻辑调试HTML）

---

## 9. 教师实际备课产物的输出约定

`examples/` 是**只读参考库**，只存放三套黄金标杆的 Markdown 源文件。

教师实际备课产物（DOCX 教案、DOCX 导学单、PPTX/PDF 课件、HTML 作业）有两种推荐放法：

```bash
# 方式 A：产物输出到 output/（repo 内，已 gitignore）
node scripts/export-lesson.mjs <备课目录> --output-dir output/

# 方式 B：直接在 repo 外的任意目录工作（推荐）
node scripts/export-lesson.mjs ~/Desktop/七年级上/第03课_网页设计/
```

`output/` 和 `workspace/` 均已加入 `.gitignore`，产物不会被误提交。
CI 的 `export-pipeline` Job 将产物上传至 GitHub Actions Artifacts（保留 7 天），可在 Actions 页面直接下载。

---

## 10. Web 备课工作台深度代码审计与 13 项问题全闭环记录 (2026-10-04)

针对 `feature/web-studio` 分支代码审查报告中的全部 13 个问题实施靶向修复与闭环验证：

### 🔴 P0 级：Bug / 安全漏洞（4/4 全部闭环）
1. **`removeUploadedImage` 全局引用断裂**：在 [`web/public/app.js`](file:///e:/it-lesson-studio/web/public/app.js) 删除图片后显式同步 `window.uploadedImages = uploadedImages`，确保前端引用一致。
2. **`/api/tasks/:id/retry` 重试丢失参考资料**：在 [`web/db.js`](file:///e:/it-lesson-studio/web/db.js) 为 `tasks` 表增加 `materials_text` 字段与自动迁移逻辑；在 [`web/server.js`](file:///e:/it-lesson-studio/web/server.js) 将教材插图持久化至 `materials_images.json`，重试时完整恢复文本与图片透传给流水线。
3. **HTML 预览接口 `/api/preview/:id/html` 无鉴权**：在 [`web/server.js`](file:///e:/it-lesson-studio/web/server.js) 的 `authenticate` 中间件增加对 `?token=` 查询参数的支持，为预览端点加上身份验证与任务归属校验（非本人且非管理员返回 403）；在 [`web/public/app.js`](file:///e:/it-lesson-studio/web/public/app.js) 链接处带上鉴权 token。
4. **API Key 凭据防护核查**：确认 `web/.env` 从未入库 Git 历史，进一步在 [`.gitignore`](file:///e:/it-lesson-studio/.gitignore) 中强化 `.env*` 屏蔽规则（仅保留 `.env.example`）。

### 🟡 P1 级：功能缺陷 / 逻辑错误（4/4 全部闭环）
5. **进度条平滑递增速率不一致**：在 [`web/public/app.js`](file:///e:/it-lesson-studio/web/public/app.js) 提取统一的 `startSmoothProgressTimer()` 函数，步长与 100ms 刷新周期全面标准化。
6. **`applyProgressVisuals` DOM 重复设置与完成闪跳**：统一由 `applyProgressVisuals(currentDisplayPercent)` 处理进度文本与填充宽度，清除冲突代码；任务完成时平滑冲顶 100% 并点亮全部节点。
7. **残留僵尸 DB `app.db` 清理**：彻底物理删除早期原型遗留的 0 字节僵尸数据库 `web/data/app.db`。
8. **`logout` 无效清理键**：清理 [`web/public/app.js`](file:///e:/it-lesson-studio/web/public/app.js) 中未曾写入的 `localStorage.removeItem('itls_user')` 死代码。

### 🟠 P2 级：僵尸资源 / 死代码 / 容器兼容（5/5 全部闭环）
9. **废弃样式表清理**：使用 `git rm` 彻底移除未被加载的 551 行早期原型样式表 [`web/public/style.css`](file:///e:/it-lesson-studio/web/public/style.css)。
10. **废弃实验图片清理**：物理删除未引用的早期 PPT 导出截图目录 `web/public/ppt/`。
11. **调试截图清库**：清出 `web/public/` 下 14 张未引用的调试验收截屏（避免 Express 静态静态目录暴露 20MB+ 冗余资产）。
12. **启动日志邀请码脱敏**：在 [`web/server.js`](file:///e:/it-lesson-studio/web/server.js) 启动日志中对 `INVITE_CODE` 实行前两位保留加掩码脱敏（`AB****`），杜绝终端与容器日志泄露凭据。
13. **Python/uv 容器化兼容加固**：在 [`scripts/export-lesson.mjs`](file:///e:/it-lesson-studio/scripts/export-lesson.mjs) 中为 `verify_layout.py` 补充动态嗅探降级（优先 `uv run python`，无 uv 时使用 `python3`）；在 [`Dockerfile`](file:///e:/it-lesson-studio/Dockerfile) 中加入官方 `COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/` 镜像层，容器环境无缝对齐 uv 规范。

---

## 11. 第二轮深度审计与 9 项问题全闭环记录 (2026-10-04)

针对第二轮审查报告中的 9 个问题（2 个 P0、4 个 P1、3 个 P2）全部闭环修复与验证：

### 🔴 P0 级：最高优先级（2/2 全部闭环）
1. **创建 `.dockerignore` 杜绝密钥打入镜像层**：新增 [`.dockerignore`](file:///e:/it-lesson-studio/.dockerignore)，完整排除 `.git`、`.env*`、`web/.env*`、宿主机 `node_modules`、`web/data`、`output`、`downloads` 等，彻底解决 `COPY . .` 时意外将真实密钥或宿主机二进制打入镜像层的问题。
2. **教材下载脚本支持动态源配置与失效探测**：
   - 提取 [`scripts/textbook_sources.json`](file:///e:/it-lesson-studio/scripts/textbook_sources.json) 外部配置文件；
   - 在 [`scripts/download_textbooks.py`](file:///e:/it-lesson-studio/scripts/download_textbooks.py) 中支持 `--source-config`、环境变量 `ZJEAV_SOURCES` 与 JSON 文件动态加载；
   - 增加前置 `probe_source` 连通性与 HTTP 404/403 快速探测报警，杜绝平台更新 ID 后脚本挂起或盲目试错。

### 🟡 P1 级：工程规范与性能加速（4/4 全部闭环）
3. **Marp CLI 依赖正规化**：在 [`package.json`](file:///e:/it-lesson-studio/package.json) 将 `@marp-team/marp-cli` 移入 `dependencies`，更新 `package-lock.json`；[`Dockerfile`](file:///e:/it-lesson-studio/Dockerfile) 清除裸跑 `npm install`，使用标准 `npm install --omit=dev` 严格受控于 lockfile。
4. **Docker Compose 遵循 12-Factor 标准注入环境**：在 [`docker-compose.yml`](file:///e:/it-lesson-studio/docker-compose.yml) 显式声明 `env_file: - ./web/.env`，实现运行时环境变量与构建期镜像解耦。
5. **CLI 无参友好交互**：在 [`scripts/export-lesson.mjs`](file:///e:/it-lesson-studio/scripts/export-lesson.mjs) 剔除不存在的 `examples/demo-lesson` 占位符，无参数或 `--help` 时友好输出用法选项并动态展示仓库内可用的黄金标杆课例列表。
6. **LibreOffice 真实页数多文件批处理加速**：在 [`scripts/verify_layout.py`](file:///e:/it-lesson-studio/scripts/verify_layout.py) 中实现 `batch_docx_to_pdf_pages`，单次 `soffice` 进程处理全部文档，彻底消除多次冷启动的线性耗时倍增，失败时自动单文件重试。

### 🟠 P2 级：边界健壮性（3/3 全部闭环）
7. **DOCX 排版分类去歧义**：在 [`scripts/beautify_docx.py`](file:///e:/it-lesson-studio/scripts/beautify_docx.py) 中精准匹配 `导学`、`学习单`、`任务单`、`探究单`、`活动单`，移除宽泛的 `作业` 关键字，杜绝未来 DOCX 作业被误判为导学单。
8. **机房断网全景网络外链检测**：在 [`scripts/check_lesson.py`](file:///e:/it-lesson-studio/scripts/check_lesson.py) 中全面升级正则，覆盖单引号/双引号属性、内联 `style url(...)`、`@import` 以及 JS `fetch` / `axios` / `$.ajax` / `WebSocket` / `XMLHttpRequest` 调用，确保机房断网作业 100% 离线自给自足。
9. **教材下载退出码修复**：在 [`scripts/download_textbooks.py`](file:///e:/it-lesson-studio/scripts/download_textbooks.py) 中捕获所有册次下载状态，汇总成功/失败明细，发生任何错误时均返回退出码 `1`，确保 CI 与流水线可敏锐感知失败。

