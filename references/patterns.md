# 随堂互动作业（数字化探究舱）仿真范式与原生组件库 (patterns.md)

> **核心定位**：随堂互动作业（`课堂作业.html`）绝非课后 5 分钟的简单刷题页，而是**支撑机房课堂 35~40 分钟动手运转的“数字化探究舱 (Inquiry Workspace)”**。学生进机房后以互动作业为主线自主闯关探究，教师巡视点拨辅导。
> **门禁唯一口径**：所有屏数、动手环节数、每屏正文字数、测验题数与题干字数的硬指标，严格对齐 `references/output-spec.md` 第六节 `spec-yaml`，由 `scripts/check_lesson.py` 自动审计。

---

## 一、数字化探究舱总体架构与设计铁律

### 1. 支撑 40 分钟课堂运转的闯关主线结构
根据学段屏数上限（3~4 年级 ≤4 屏，5~6 年级 ≤5 屏，7~8 年级 ≤6 屏），标准课堂探究舱遵循以下递进式认知主线：

| 阶段 | 核心作用 | 典型交互与分层设计 | 门禁属性标记 |
|:---|:---|:---|:---|
| **Stage 1：破冰痛点 / 感知配对** | 创设真实生活情境，让学生先“手动尝试”感受痛点，或建立概念直觉 | 人工闪现计数、双列点击/SVG连线配对、真假工具辨析 | `<section class="panel active" data-step="0">` + `<p data-prose>` |
| **Stage 2：核心解剖 / 建模分析** | 拆解系统内部机理、提取关键数据要素或建立算法模型 | 部件点击高亮解剖台、要素提取卡片、流程图拼图槽 + 随堂即时巩固小问（答错可无限重选，答对锁定） | `<section class="panel" data-step="1">` + `<p data-prose>` |
| **Stage 3：深度仿真沙箱（核心实操）** | 亲手调节参数、运行仿真、观察规律，完成从“看懂”到“做通”的跨越 | **基础通关任务**（全员必达）+ **⭐ 进阶挑战星**（防快学生早退无所事事，提供极限参数/边界条件深挖） | `data-panel-type="hands-on"` + `<p data-prose>` |
| **Stage 4：迁移排雷 / 逻辑调优** *(中高段)* | 换情境迁移、排查代码/配置故障、验证算法鲁棒性 | 代码 Bug 排雷侦探、无解/异常分支补全、多组测试用例验证 | `data-panel-type="hands-on"`（注意年级动手屏上限） |
| **Stage Final：达标测验 & 评价凭单闭环** | 检验核心素养达成度，生成可直传平台的 `.txt` 凭单与荣誉奖状 | 先选后判 Quiz + 累计点亮徽章墙 (Medal) + 含“还没完全懂”自评 + 零弹窗秒下凭单 + 电子奖状卡 | 终极屏 `data-step="N-1"` + `<p data-prose>` |

### 2. 教师设想绝对优先原则 (Teacher Customization First)
- **最高优先级**：当授课教师在“教学设想与特别说明”中指定了特色生活情境（如校园测温、智能垃圾桶、自动售货机、运动会记分牌）、特定案例或机房环境限制时，**必须 100% 优先围绕教师设想量身定制关卡情境与微型仿真器**，严禁机械照搬教材默认案例。
- **智能启发与兜底**：仅在教师未指定具体仿真形式时，系统依据第二节“浙教版 12 册教材能力进阶与仿真器启发范式库”，结合具体课题名称自动匹配最契合的原生仿真器原型。

### 3. 学科化精准输入原则（少打字，精打字）
中小学机房打字速度差异极大，**严禁要求学生输入长篇文字小作文或开放式长问答**！所有文本/键盘输入必须紧扣学科核心认知：
- **小学低段（3~4 年级）**：聚焦鼠标单击/双击（小啄木鸟双击）、拖拽/点选归类、2~6 个字母的姓名拼音录入、规范文件名命名（如 `我的作品.png`）。
- **小学高段（5~6 年级）**：聚焦 `0/1` 二进制位翻转、流程图条件框词块选择、循环次数/阈值参数调节、Python 关键变量名或比较运算符（`<`、`==`、`>`）补全。
- **初中阶段（7~8 年级）**：聚焦 IP 地址段（如 `192.168.1.10`）、传感器告警阈值、加密偏移密钥（Key）、单行关键代码表达式或机器学习超参数（如 `K=3`）调节。

### 4. 学段难度与 `output-spec.md` 门禁硬指标速查
| 年级 | 屏数上限 (`screens`) | 动手屏上限 (`hands_on`) | 测验题数 (`quiz`) | 每屏 `data-prose` 上限 | 测验题干 `q:` 上限 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **3 年级** | ≤ 4 屏 | ≤ 1 个 | 严格 2 题 | ≤ 60 字 | ≤ 30 字 |
| **4 年级** | ≤ 4 屏 | ≤ 1 个 | 严格 2 题 | ≤ 80 字 | ≤ 34 字 |
| **5 年级** | ≤ 5 屏 | ≤ 2 个 | 严格 3 题 | ≤ 100 字 | ≤ 40 字 |
| **6 年级** | ≤ 5 屏 | ≤ 2 个 | 严格 3 题 | ≤ 120 字 | ≤ 44 字 |
| **7 年级** | ≤ 6 屏 | ≤ 2 个 | 严格 3 题 | ≤ 140 字 | ≤ 50 字 |
| **8 年级** | ≤ 6 屏 | ≤ 2 个 | 严格 3 题 | ≤ 160 字 | ≤ 54 字 |

> **关键防踩坑提示**：
> 1. 每屏必须有且仅保留精炼的 `<p data-prose>...</p>` 核心导语（严格控制在对应年级字数上限内）；详细的操作提示、比喻说明请放在不带 `data-prose` 的 `.tip-box` 或卡片内部，避免触发 `第 X 屏正文超标` FAIL。
> 2. `data-panel-type="hands-on"` 仅标记在最核心的 1~2 个动手仿真屏上（3~4 年级严格标记 1 个，5~8 年级标记 1~2 个），切勿每屏都加，否则触发 `动手环节超标` FAIL。
> 3. 测验数组必须严格写作 `const quiz = [ { q: "...", options: [...], correct: 0 }, ... ];`（注意末尾分号 `;` 必填，题干属性名必须为 `q`）。

---

## 二、浙教版 12 册教材典型微型仿真器原生组件库

以下 12 类原生 JS 仿真器组件专为单文件离线 HTML 设计（零外部依赖，直接内嵌 `<style>` 与 `<script>` 即可运行），并内置 `xxxEver` 累计通关状态供徽章墙与凭单导出调用。

### 1. 【三上 · 感知智能与在线入门】部件高亮解剖台 + 虚拟下载排雷/文件分类箱
- **适用课型**：了解智能工具、寻找智能“小眼睛/小耳朵”、下载平台资源、分类整理资源。
- **核心交互**：
  - **解剖台模式**：点击部件槽位（`.hardware-slot`）高亮发光，右侧面板（`.inspect-detail`）动态展示拟人化生活比喻（如摄像头=“电子小眼睛”、麦克风=“顺风小耳朵”、CPU=“超级大脑”）及工作流程；全部点亮后解锁 `inspectAllEver = true`。
  - **虚拟浏览器下载排雷 / 文件分类箱**：模拟下载页面区分“高速捆绑广告假按钮”与“官方纯净下载真按钮”，或点击文件卡片（`.jpg`、`.mp3`、`.mp4`、`.docx`）归入对应分类文件夹。
- **可复用状态机骨架**：
```js
// 部件解剖台 + 分类归档状态机
let inspectedSet = new Set();
let inspectAllEver = false;
function inspectPart(key, partMap) {
  inspectedSet.add(key);
  if (inspectedSet.size >= Object.keys(partMap).length) inspectAllEver = true;
  document.querySelectorAll('.hardware-slot').forEach(el => {
    el.classList.toggle('active', el.dataset.part === key);
  });
  const info = partMap[key];
  document.getElementById('inspectTitle').textContent = `${info.icon} ${info.title}`;
  document.getElementById('inspectDesc').textContent = info.desc;
}
```

### 2. 【三下 · 多媒体与 AI 初体验】多媒体滤镜/波形调节台 + AI 提示词（Prompt）配方合成器
- **适用课型**：处理图像素材、剪辑音频素材、编辑视频素材、资源智能生成、智能辅助创作。
- **核心交互**：
  - **图像/音频实时调节台**：通过 `<input type="range">` 滑块调节亮度 (`brightness`)、对比度 (`contrast`)、旋转角度或音频音量淡入淡出包络线，实时驱动预览区 CSS `filter` 或 SVG 波形高度变化，达成目标参数区间即判定通关。
  - **AI 提示词（Prompt）联想合成台**：提供【主体角色】【场景环境】【画面风格】【细节光影】四组词块（`.prompt-chip`），学生点击组合后点击“✨ 启动 AI 生成”，画布实时渲染对应的 SVG 矢量插画卡片与生成日志，直观体会“提示词越精准，生成效果越符合预期”。
- **可复用状态机骨架**：
```js
let mediaTunedEver = false;
let promptBuiltEver = false;
function updateMediaFilter() {
  const b = +document.getElementById('rngBright').value; // 50..150
  const c = +document.getElementById('rngContrast').value; // 50..150
  const preview = document.getElementById('mediaPreview');
  preview.style.filter = `brightness(${b}%) contrast(${c}%)`;
  if (b >= 110 && b <= 130 && c >= 105 && c <= 125) {
    mediaTunedEver = true;
    document.getElementById('mediaMsg').textContent = '🌟 参数调优达标！画面清晰明亮！';
  }
}
```

### 3. 【四上 · 数据与生活编码】二进制灯泡开关阵列 + 条形码/编码规则生成器
- **适用课型**：从数据到编码、编码长度与信息量、编码的规则制订、数据计算与图表呈现。
- **核心交互**：
  - **二进制灯泡阵列（8-4-2-1 权值沙箱）**：4 位或 8 位灯泡卡片，点击切换 `0`（熄灭）与 `1`（点亮发光），底部实时显示权值算式 `8×b3 + 4×b2 + 2×b1 + 1×b0 = 十进制值`。设置目标挑战（如：“请点亮灯泡凑出十进制数字 11”或进阶挑战“4 位二进制最大能表示多少？”）。
  - **生活编码定制器**：通过下拉框/数字键组装“入学年份(4位) + 班级(2位) + 学号(2位)”，实时生成带颜色分段的编码铭牌并检验唯一性。
- **可复用状态机骨架**：
```js
const bits = [0, 0, 0, 0]; // 权重: 8, 4, 2, 1
const weights = [8, 4, 2, 1];
let binarySolvedEver = false;
function toggleBit(idx, targetVal) {
  bits[idx] = bits[idx] ? 0 : 1;
  const total = bits.reduce((sum, b, i) => sum + b * weights[i], 0);
  document.getElementById('decValue').textContent = total;
  document.getElementById('binFormula').textContent =
    bits.map((b, i) => `${weights[i]}×${b}`).join(' + ') + ` = ${total}`;
  if (total === targetVal) {
    binarySolvedEver = true;
    document.getElementById('binFeedback').textContent = `🎉 挑战成功！十进制 ${targetVal} 的二进制编码为 ${bits.join('')}`;
  }
}
```

### 4. 【四下 · 数字化底层与校验】像素点阵取色编码板 + 奇偶校验排雷矩阵
- **适用课型**：图像编码、字符编码（ASCII 转盘）、数据解码、数据校验、手写数字识别。
- **核心交互**：
  - **像素点阵编码/解码沙箱**：左侧为 `5×5` 或 `8×8` 像素网格，右侧为实时同步的 `0/1` 二进制编码矩阵。支持“涂色生成编码”与“修改 `0/1` 解码还原图案”双向互动。
  - **奇偶校验排雷矩阵**：展示 `4×4` 数据位 + 行偶校验位 + 列偶校验位。模拟无线传输中某 1 位发生翻转（0 变 1 或 1 变 0），学生通过观察哪一行、哪一列的 `1` 的个数变成了奇数，精准点击交叉点的受损格子完成修复！
- **可复用状态机骨架**：
```js
let parityFixedEver = false;
function checkParityCell(row, col, errRow, errCol, cellEl) {
  if (row === errRow && col === errCol) {
    cellEl.textContent = cellEl.textContent === '1' ? '0' : '1';
    cellEl.classList.add('fixed');
    parityFixedEver = true;
    document.getElementById('parityMsg').textContent = `🎯 排雷成功！第 ${row+1} 行与第 ${col+1} 列交叉点已恢复偶校验平衡！`;
  } else {
    document.getElementById('parityMsg').textContent = `💡 再观察一下：哪一行和哪一列中“1”的总数是奇数？找它们的交叉点！`;
  }
}
```

### 5. 【五上 · 算法思维与流程图分支】流程图词块拼图槽 + 分支条件切换仿真器
- **适用课型**：流程图描述算法、顺序结构、分支结构、双分支结构、生活中的决策、认识决策树。
- **核心交互**：
  - **双模流程图拼图槽（触控点选 + 鼠标拖拽全兼容）**：点击备选池词块（`.fchip`）再点击虚线菱形判断框/矩形处理框（`.fdrop`）即可填入，点击已填槽位可退回；兼容 HTML5 拖拽。
  - **红绿灯 / 智慧道闸 / 身高购票分支仿真器**：拖动参数滑块（如车牌识别结果、身高 `135cm`、体温 `37.5℃`），实时高亮流程图中的 `是(Y)` 或 `否(N)` 分支路径，并驱动右侧道闸抬杆/落杆动画。
- **可复用状态机骨架**：
```js
let branchTestedTrue = false, branchTestedFalse = false, branchMasterEver = false;
function runBranchSim(val, threshold) {
  const isPass = val >= threshold;
  if (isPass) branchTestedTrue = true; else branchTestedFalse = true;
  if (branchTestedTrue && branchTestedFalse) branchMasterEver = true;
  document.getElementById('pathYes').classList.toggle('active-path', isPass);
  document.getElementById('pathNo').classList.toggle('active-path', !isPass);
  document.getElementById('branchOutput').textContent = isPass ? '✅ 条件成立 (True)：执行分支 A' : '❌ 条件不成立 (False)：执行分支 B';
}
```

### 6. 【五下 · 控制系统与循环结构】恒温箱/自动浇花阈值沙箱 + 循环计数累加步进器
- **适用课型**：控制系统的三个环节（输入-计算-输出）、查表计算、条件计算、循环结构、恒温箱实验。
- **核心交互**：
  - **恒温箱/自动浇花闭环仿真台**：学生设定目标温度阈值（如 `25℃`），点击“模拟环境降温/升温”，观察【传感器采集输入 ➔ 控制器比较判断 ➔ 加热器/风扇执行输出】三环节状态灯联动。
  - **循环结构步进累加器**：可视化 `i` 从 `1` 变化到 `N`、累加变量 `sum` 逐步更新的过程，支持“单步执行”、“连续运行”与“重置”。

### 7. 【六上 · 代码实现与经典算法】单步代码追踪器（人肉 CPU）+ 二分查找对战台
- **适用课型**：用程序设计语言描述算法、算法的执行、猜数字算法设计（二分法）、韩信点兵枚举法/筛选法。
- **核心交互**：
  - **人肉 CPU 单步执行器**：预先通过 `buildRunSteps()` 将代码执行过程展开为快照数组 `[{ line, vars: { tu, ji, tui }, note, output }]`，支持**上一步 / 下一步 / 自动连播 / 暂停**，当前代码行高亮 `.codeline.hl`，变量监控卡 `.var-card` 实时跳动。
  - **二分猜数字 vs 顺序枚举效率对战台**：在 `1~100` 范围内找目标数，直观对比顺序枚举（最多 100 次）与二分折半查找（每次取中点 `mid = (low + high) // 2`，最多 7 次）的步数差距。
- **可复用状态机骨架**：
```js
let stepIdx = 0, cpuRunEver = false, playTimer = null;
function renderCpuStep(steps) {
  const s = steps[stepIdx];
  document.querySelectorAll('.codeline').forEach((el, i) => el.classList.toggle('hl', i + 1 === s.line));
  Object.entries(s.vars).forEach(([k, v]) => {
    const vEl = document.getElementById(`var_${k}`);
    if (vEl) vEl.textContent = v;
  });
  document.getElementById('cpuNote').textContent = s.note;
  if (stepIdx === steps.length - 1) cpuRunEver = true;
}
```

### 8. 【六下 · 反馈控制与逻辑运算门】双开关串并联逻辑门电路 + 闭环反馈水位沙箱
- **适用课型**：自动控制系统、反馈与控制、连续量与开关量、开关量的与运算（AND）、或运算（OR）。
- **核心交互**：
  - **与门（串联）/ 或门（并联）电路仿真台**：点击切换开关 A（0/1）和开关 B（0/1），实时渲染电路导通高亮路径与终端蜂鸣器/指示灯状态，并自动勾选点亮右侧 **真值表（Truth Table）** 的对应行（4 种组合全部验证后解锁 `truthTableEver = true`）。
  - **连续量转开关量阈值沙箱**：调节模拟传感器连续量滑块，观察跨越阈值瞬间如何触发开关量 `0 ➔ 1` 跳变。
- **可复用状态机骨架**：
```js
let swA = 0, swB = 0, testedCombos = new Set(), logicGateEver = false;
function toggleGateSwitch(which, mode = 'AND') {
  if (which === 'A') swA = swA ? 0 : 1; else swB = swB ? 0 : 1;
  const out = mode === 'AND' ? (swA & swB) : (swA | swB);
  testedCombos.add(`${swA}${swB}`);
  if (testedCombos.size >= 4) logicGateEver = true;
  document.getElementById(`row_${swA}_${swB}`)?.classList.add('verified');
  document.getElementById('gateOutLamp').classList.toggle('on', out === 1);
}
```

### 9. 【七上 · 网络底层与拓扑搭建】局域网拓扑连线与 IP/DHCP 分配器 + 数据包逐跳路由
- **适用课型**：计算机网络、互联网接入、认识 TCP/IP、IP 地址与 DHCP、小型网络的搭建、向世界介绍我的学校（HTML 实时预览）。
- **核心交互**：
  - **小型局域网拓扑与 IP 排障台**：展示光猫 ➔ 路由器 ➔ 交换机 ➔ 多台终端的拓扑图，支持“手动分配 IP（检测 `192.168.1.x` 同网段、IP 冲突与 `0~255` 越界）”与“开启 DHCP 自动分配”对比，点击 `ping` 按钮发送测试数据包动画。
  - **HTML 标签实时预览沙箱**（网页创作课）：选择或微调 `<h1>`、`<p>`、`<img>`、`<a>` 标签属性，右侧模拟浏览器窗口即时渲染网页效果。

### 10. 【七下 · 物联网与图搜索算法】传感器折线监控台 + 迷宫 DFS/BFS 寻路回溯动画器
- **适用课型**：常见的传感器、无线通信与物联网协议、物联网控制与反馈、二分搜索算法、深度优先搜索算法（DFS）。
- **核心交互**：
  - **物联网多传感器实时监控与反馈台**：SVG 动态绘制温湿度/光照强度折线图，支持注入环境干扰并观察 MQTT 消息发布/订阅日志与执行器反馈。
  - **DFS 深度优先搜索迷宫步进器**：在 `5×5` 网格迷宫或树形结构中，点击“下一步”观察探索节点入栈（高亮蓝色）、遇到死胡同**回溯（Backtrack，标灰退回上一岔路口）**直至找到终点的全过程。

### 11. 【八上 · DOM 数据与密码安全】凯撒密码移位转盘 + 网页 DOM 探针/散列防伪实验室
- **适用课型**：网页的数据组织/编码、数据备份与加密、数据解密、网络安全防范、网络身份认证。
- **核心交互**：
  - **凯撒密码移位加密/解密转盘 & 暴力枚举破译器**：拖动密钥滑块 `Key (1~25)`，实时高亮明文字母表与密文字母表的偏移映射关系，支持输入/点击密文一键解密，或点击“启动 Python 循环暴力穷举 25 种密钥”观察候选明文列表。
  - **数据防伪散列（Hash）对比台**：对比原始数据与修改 1 个字符后的散列值变化（雪崩效应），验证信息完整性。

### 12. 【八下 · AI 原理级拆解】2D 平面 KNN 动态分类面 + 图像卷积核滤波/神经元计算台
- **适用课型**：图像识别技术、监督学习与无监督学习、K近邻算法（KNN）、神经网络的计算、卷积神经网络（CNN）。
- **核心交互**：
  - **KNN（K-近邻）交互式分类画布**：SVG 画布预置两类已知样本点（如🟢好瓜 vs 🔴坏瓜，或两类鸢尾花），学生点击画布任意位置放置待测样本点 `❓`，并调节超参数 `K = 1 / 3 / 5`，画布实时画出待测点到最近 `K` 个邻居的虚线、显示欧氏距离并按“少数服从多数”给出投票分类结果！
  - **神经元加权求和 / 3×3 卷积核特征提取器**：调节输入特征权重 `w1, w2` 与偏置 `b`，或切换【边缘检测】【锐化】【模糊】3×3 卷积核矩阵，实时观察输出特征图响应。
- **可复用状态机骨架**：
```js
let knnTestedEver = false;
function classifyKnnPoint(px, py, kVal, samples, svgEl) {
  const dists = samples.map(s => ({ ...s, d: Math.hypot(s.x - px, s.y - py) }))
                       .sort((a, b) => a.d - b.d)
                       .slice(0, kVal);
  const votes = {};
  dists.forEach(n => { votes[n.label] = (votes[n.label] || 0) + 1; });
  knnTestedEver = true;
  return { neighbors: dists, predicted: Object.entries(votes).sort((a,b) => b[1]-a[1])[0][0] };
}
```

### 13. 通用组件：双模 SVG 贝塞尔连线 (`initMatchGame`) 与随堂巩固单选 (`makeOptions`)
- **双模连线配对**：同时支持“先点左卡、再点右卡”的点击接力模式（最适合机房鼠标与低龄触控）与 PointerEvents 拖拽贝塞尔曲线模式；切换 Tab 进入该屏时调用 `requestAnimationFrame(() => matchCtrl.redraw())`。
- **随堂巩固单选（非终极测验）**：采用**“答错温和提示可无限重选，答对变绿锁定”**策略，严禁“一选定终身”导致学生只能刷新网页重来。

---

## 三、终极关卡与平台评价闭环标准状态机骨架

终极关卡（第 `maxScreens` 屏）必须 100% 闭环包含以下五件套，且**全程严禁使用 `alert()` 弹窗阻断学生操作**：

1. **随堂测验 (`const quiz = [...];`) —— 严格先选后判**：
   - 点击选项时仅切换 `.picked` 高亮选中态，**绝不提前暴露红绿对错**；
   - 点击【提交测验并判分】按钮后：若仍有未选题，在按钮下方状态栏温和提示“还有题目未选择哦”（**不用 `alert`**）；全部选完后统一标出 `.correct`（绿）与 `.wrong`（红），给 `.option-list` 加上 `.locked` 锁定，并展示总分横幅。
2. **动态通关徽章墙 (`medalDefs`) —— 绑定累计状态防重置丢失**：
   - 必须包含 `medal` 标识（如 `class="badge-grid medal-wall"`），声明 4 枚与本课关卡强关联的专属徽章；
   - 徽章解锁条件必须绑定 `xxxEver` 累计布尔变量（一旦达成永久点亮，防止学生回看重置沙箱时徽章熄灭）。
3. **自我评价打卡 —— 必留心理安全出口**：
   - 3~4 项复选/单选清单，**必须包含一条含“我还没完全懂”字样的选项**（如：`我还没完全懂，需要老师或同伴帮助`），通过 `check_lesson.py` 门禁检查。
4. **极简无感 `.txt` 学习凭单导出 (`exportReport()`) —— 零弹窗一键秒下**：
   - 提供班级、姓名输入框（选填），**当学生未填写姓名或班级时，自动使用 `'本班'` / `'小极客'`（或 `'同学'`）兜底，严禁弹 `alert()` 逼迫学生打字**！
   - 凭单文件首行必须为结构化标准格式：`# 班级|姓名|课题|得分|时间`，随后列出各关卡探究数据、徽章解锁情况与自评结果，通过 `Blob` + `<a download="班级_姓名_课题_得分.txt">` 一键秒下，直接供“中小学信息科技与人工智能平台”上传汇聚。
5. **现场电子通关奖状卡 (`#certModal`)**：
   - 点击【🎖️ 生成电子通关奖状】直接弹出精美奖状模态框（未填姓名自动显示“小极客 / 优秀学员”），给予学生即时的课堂成就感。

---

## 四、交付前自动化门禁与真机自检清单

1. **静态门禁检查（必跑，0 FAIL / 0 WARN）**：
   ```bash
   uv run python scripts/check_lesson.py <课堂作业.html 或 课例目录>
   ```
2. **核心自检核对项**：
   - `<meta charset="UTF-8">` 与 `<meta name="lesson-grade" content="3~8">` 齐全；
   - 无任何外部 HTTP/HTTPS 资源引用（100% 断网机房可用）；
   - `stepLabels.length === document.querySelectorAll('section.panel').length`，且 `data-step` 从 `0` 连续递增；
   - `data-panel-type="hands-on"` 屏数 `>= 1` 且不超过该年级上限（3~4 年级 ≤1，5~8 年级 ≤2）；
   - 每屏 `<p data-prose>` 有效字数不超过该年级上限（60~160 字）；
   - `const quiz = [...];` 题数等于该年级上限（3~4 年级 2 题，5~8 年级 3 题），且每道 `q:` 题干字数不超限（30~54 字）；
   - 全流程零 `alert()` 拦截，不填姓名点击导出凭单和生成奖状均可一键秒出。
