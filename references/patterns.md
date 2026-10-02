# 互动课件实现模式参考

配套 `resources/classwork/base-template.html` 使用。模板已包含步骤导航、测验、徽章、自我评价、导出记录；
本文件说明**各环节互动组件**的做法和常见坑。

## 一、标准课流程（8–10 步）

信息科技课最通用的骨架，按需增删，但**热身、目标、总结三步必须有**：

| 序 | 环节 | 作用 | 常用组件 |
|----|------|------|----------|
| 0 | 热身/探索 | 让学生先"手动硬做"，感受痛点 | 闪现计数、逐次试错、滑块 |
| 1 | 学习目标 | 可勾选，导出时统计 | `data-goal` 复选框 |
| 2 | 情境/描述问题 | 故事化引入 | `.story` 块 |
| 3 | 抽象/建模 | 抓关键要素、列关系 | 表格、要素卡片 |
| 4 | 设计算法/建立模型 | 步骤排序、写算式 | 拖拽排序、填空 |
| 5 | 流程图 | 图形化表达 | 拖拽填空 + 可点击讲解 |
| 6 | 验证/预演 | 让电脑按算法跑一遍 | 单步执行、自动动画 |
| 7 | 拓展练习 | 换个情境迁移 | 填空 + 主观输入 |
| 8 | 测验 & 保存 | 收尾 + 留痕 | 三件套 |

知识点课的变体：把 3–6 换成"概念讲解 → 辨析 → 应用"。

## 二、组件实现要点

### 1. 闪现计数（热身：感受人工极限）
- 三档难度用数组配置：`[{count:10,interval:900},{count:18,interval:520},{count:30,interval:280}]`。
- 序列**一次性生成**再逐帧显示，答案在生成时就确定，不要边显示边随机。
- 用 `setInterval` 必须保存 id，结束或重开时 `clearInterval`，否则多个计时器叠加会加速。

### 2. 逐次试错（热身：枚举的痛苦）
- 每次点击推进一个候选值，把过程追加进 `.log-box` 并 `log.scrollTop = log.scrollHeight`。
- 命中后禁用按钮并记录 `warmFound = true`，供徽章与导出使用。

### 3. 滑块实验室（两个变量凑条件）
- 两个 `input[type=range]` + `input` 事件即时算出结果，实时反馈"还差几个"。
- 找到解时把当前滑块值存为 `best`，供导出记录。

### 4. 拖拽排序（排算法步骤）
- 用 `dragstart/dragover/drop`，`getDragAfterElement` 计算插入位置：
```js
function getDragAfterElement(container, y){
  const els = [...container.querySelectorAll('.sort-item:not(.dragging)')];
  return els.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    return (offset < 0 && offset > closest.offset) ? {offset, element:child} : closest;
  }, {offset:Number.NEGATIVE_INFINITY}).element;
}
```
- **移动端必须补点击交换**：触屏不触发 HTML5 拖拽。做法：点击选中一项高亮，再点另一项则交换两者位置。
- 校验时比对每项的 `dataset.text` 与目标数组顺序，全对才标绿，错了只标红错的项。

### 5. 流程图填空
- 目标框 `.fdrop`（虚线空槽）+ 备选池 `.fchip`（可拖拽词块）。
- 拖入后 `chip.classList.add('used')`，槽位变 `.filled`；点击已填槽位可退回备选池。
- 校验：每个槽位的答案与 `answers` 数组比对，正确加 `.correct`，错误加 `.wrong`，并给出文字解析。

### 6. 单步执行"人肉CPU"
- 把算法写成**步骤生成器**：预先 `buildRunSteps()` 展开成数组 `[{line, note, vars, output}]`，再用索引单步推进。
- 不要在单步函数里就地计算，否则"上一步"无法回退。
- 变量卡片 `.var-card` 每次刷新显示当前值，当前代码行加 `.codeline.hl`。

### 7. 自动预演动画
- `setInterval` 推进索引，跑完自动 `clearInterval`；**"停止"按钮必须可中断**，且中断后状态保持。
- 同时提供"单步"和"连播"两个入口，满足不同节奏。

### 8. 判题（单选/多选）
- 单选：`quiz` 数组 + `correct` 索引，点击即判对错并锁住该题。
- 多选：收集所有选中项，与答案集合比对；**全对才给分**，部分正确给提示但不给分。
- 提交后禁用按钮，把 `quizScore` 写进导出报告。

### 9. 贝塞尔曲线连线配对（概念/功能对应）
- **适用场景**：硬件与功能、术语与比喻、编码与现实物体的两列一对一或多对多配对。
- **架构设计**：
  - 左列卡片 `.match-card[data-side="left"]`，右列卡片 `.match-card[data-side="right"]`，中间覆盖自适应绝对定位 SVG 画布 `.match-svg`。
  - 每个卡片内嵌 `.match-dot` 锚点作为连线起点/终点坐标拾取源。
- **双模交互（触控与键鼠全兼容）**：
  1. **拖拽划线模式**：在 `.match-dot` 上触发 `pointerdown`，使用 `setPointerCapture` 锁定触控点，`pointermove` 实时动态绘制三次贝塞尔曲线：
     ```js
     const cp = Math.max(30, Math.abs(p2.x - p1.x) * 0.45);
     const d = `M ${p1.x} ${p1.y} C ${p1.x + cp} ${p1.y}, ${p2.x - cp} ${p2.y}, ${p2.x} ${p2.y}`;
     ```
     在目标卡片/锚点松开 `pointerup` 自动吸附完成连线。
  2. **点选接力模式（低学段触控极佳）**：点击左侧任一卡片高亮处于激活态（`.active`），再点击右侧任一卡片立即生成平滑连线；反向点选亦可。
- **状态维护与交互容错**：
  - **一对一互斥约束**：同一个左端点或右端点已有连线时，连新线自动替换旧线，杜绝混乱交织。
  - **点击断开连线**：SVG `<path>` 开启 `pointer-events: stroke` 并赋予隐形击中热区，点击连线直接断开；点击已配对卡片亦可取消。
  - **动态自适应重绘**：通过 `ResizeObserver` 监听容器尺寸变化；在多步骤 Tab 切换时（`display: none` 切换为激活），在进入该屏的 `goToStep(i)` 中显式调用 `requestAnimationFrame(() => matchCtrl.redraw())`，消除由于初始隐藏宽高为 0 导致的坐标偏移。
  - **先连后判**：连线过程中只显示常规连接线（蓝/灰），点击“验证连线”后统一标定：正确项为绿色实线，错误项为红白脉冲虚线，避免学生无脑试探。

## 三、数据驱动约定

- 一切可变内容放数组顶部：`stepLabels`、`quiz`、`medalDefs`、`selfLabels`、`correctSteps`、`answers`。
- `stepLabels.length` **必须等于** `section.panel` 的数量，且 `data-step` 从 0 连续递增。
- 每个互动环节至少留一个状态变量（如 `runCompleted`、`flowFillCorrectEver`），供徽章与导出使用。
- 导出报告用 `extraReport()` 补充本课独有环节；没有就返回空字符串。

## 四、常见坑

1. **步骤数与步骤条不一致** → 加/删 panel 后忘记同步 `stepLabels`，导航会错位。
2. **数字前后矛盾** → 热身用的参数和主题情境的参数不同（如热身 15辆/40轮，主题 20辆/45轮），学生极易混淆。同一课内尽量统一，确需不同要在文案里说明。
3. **计时器泄漏** → 切屏时旧计时器仍在跑。切屏或重开前统一 `clearInterval`。
4. **触屏拖拽失效** → 必须有点击交换的兜底。
5. **导出文件名含非法字符** → 姓名可能为空或含 `/`，统一用"学生"兜底。
6. **中文标点混入代码** → JS 字符串里用英文引号，正文里才用中文引号。
7. **忘记 `<meta charset="UTF-8">`** → 导出 txt 或双击打开会乱码。
8. **上一课预告写错** → 结尾那句话要和下一课标题严格对应，做完新课后回头改上一课。
9. **选择题"一选定终身"** → 写 `if(picked.v!==null) return;` 图省事，结果学生答错也改不了，
   只能刷新页面重来（农村学校最忌讳，等于作业作废）。**正确规则：答对才锁定，答错可以无限重选**，
   反馈里带"还能再选，已试 N 次"。用模板里的 `makeOptions()`，不要自己写。
10. **测验题还没提交就标红绿** → 点一下立刻显示对错，学生挨个试就能刷到全对，测验失去意义。
    **正确规则：提交前只标 `picked` 选中态；点"提交"后统一判分、标色、加 `locked` 锁定。**

### 选择题交互的正确写法

```js
// 单选：答对即锁定，答错可重选
function makeOptions(listEl, fbEl, opts, rightIdx, onPick, wrongHint){ /* 见 base-template.html */ }
// onPick(ok, tries) —— tries 可写进导出报告，老师能看出谁是"一次就懂"、谁是"试出来的"
```

- 答错反馈 = 一句针对性提示 + ` 还能再选，已试 N 次。`（别说"错了"，说"再想想"）
- 答对反馈 = 一次就对说"对了！"；试了多次说"对了！试了 N 次，学会回头检查也很棒。"
- 锁定的视觉表达：给 `.option-list` 加 `locked`，CSS 把非正确项 `opacity:.5`、去掉手型光标。
- 测验（`quiz` 数组）不共用这个组件：它要先选后判，逻辑在 `quizSubmit` 里统一处理。

## 五、交付前自检

### 静态检查

运行 `scripts/check_lesson.py <文件.html>`，它会检查：编码、外部依赖、`data-step` 连续性、
步骤条数量一致性、三件套（测验/徽章/导出）是否齐全、是否残留 `data-page-node-id`。

两项便宜且高收益的补充检查：

1. **JS 语法检查**：抽出 `<script>` 内容存成临时 .js，跑 `node --check`。
2. **id 引用核对**：用正则取出 HTML 里所有 `id="..."`，与 JS 里所有 `getElementById('...')` 求差集，
   差集非空说明引用了不存在的元素（动态生成的 id 需先排除）。这类错误浏览器里表现为整段脚本静默失效。

### 无头 DOM 冒烟测试（推荐）

静态检查抓不到运行时错误。用 jsdom 在 Node 里真实加载页面并模拟点击，能在交付前跑通全流程：

```bash
cd <node workspace> && npm install jsdom
NODE_PATH=<node workspace>/node_modules node smoke.js
```

```js
const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
const click = el => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
```

要点：
- `virtualConsole` 过滤掉 `Not implemented`（jsdom 不实现 `window.scrollTo`，会刷屏）。
- 覆盖这些路径：逐屏点 `[data-next]` 走到底、点圆点跳回、每个互动环节按**正确**答案点一遍、
  跑完单步执行、改参数运行、提交测验、最后检查徽章墙点亮数量是否等于 `medalDefs.length`。
- 导出测试：覆写 `window.Blob`（构造函数里存下 `parts.join('')`）、`URL.createObjectURL` 和
  `URL.revokeObjectURL`，点击保存后断言报告文本包含姓名、各环节标题与下节课预告。
- 写测试时注意核对每题的 `correct` 索引，别一律点第 0 项，否则会误报。

**易踩的设计坑（冒烟测试暴露出来的）**：徽章状态用 `runDone` 这类"当前状态"变量时，
学生点"重置"会把已获得的徽章清空。徽章与报告一律用 `xxxEver` 这种"曾经达成"的累计变量。

**写测试时的两个坑**：
- 经典 script 里的顶层 `const stepLabels` **不会挂到 `window` 上**，`dom.window.stepLabels` 是
  `undefined`。要用 `dom.window.eval('stepLabels.length')` 取值。
- 导出测试还要覆写 `window.HTMLAnchorElement.prototype.click`，才能拿到 `a.download` 断言文件名。

### 人工确认三件事

- 在浏览器里从第 1 步点到最后一步，每屏都能正常前进后退；
- 点一次"保存学习记录"，打开 txt 看内容是否完整、无乱码；
- 缩窄窗口到手机宽度，检查步骤条与代码块是否溢出。
