# HTML V2 教学差异与公共引擎接口 v2

本契约属于主 Skill 的模块四实现接口；教学要求见 `skills/it-lesson-studio/modules/classwork.md`。公共 CSS、导航、进度、提示、重置、测验判分、徽章、自评、凭单与奖状由程序维护，AI 不重复输出。当前实现是实验性 P2/P3，不包含自适应拆分与局部修复。

## 输出 JSON

只返回一个 JSON 对象，可用 json 代码围栏，不用 FILE 标记：

```json
{
  "schemaVersion": 2,
  "concept": "本课一个核心概念",
  "misconception": "要用实验揭示的典型误区",
  "teacherNotes": ["适用册次与主任务", "基础与进阶判据", "预计时长及模拟边界"],
  "screens": [{
    "id": "unique-task-id",
    "title": "本屏标题",
    "sourceTask": "在教案、导学单、课件中共同出现的原任务名",
    "prose": "本屏教学导语，与目标和判据一起计入正文上限",
    "kind": "hands-on",
    "goal": "可观察的任务目标",
    "basicCriterion": "至少两步有意义操作及结果判据，不能只数点击",
    "starCriterion": "基础上改变边界、加入故障、迁移或优化",
    "hints": ["观察方向", "关键变量", "完整且可解释的示范"],
    "html": "<div>仅本课操作控件和结果观察区</div>",
    "css": ":host { display: block; }",
    "script": "const model = {}; return { evaluate() { return {basic:false,star:false,transfer:false}; }, reset() {} };"
  }],
  "quiz": [{"q":"迁移或误区题干", "options":["选项一","选项二"], "correct":0, "why":"解释"}],
  "medals": [{"event":"basic","label":"本课基础成就"},{"event":"star","label":"本课进阶成就"},{"event":"transfer","label":"本课调试或迁移"},{"event":"reflection","label":"认真回顾与求助"}]
}
```

这只是字段示意，不是可交付仿真。严禁复制固定 false/true 作为实际判据。实际课题必须有至少一个 hands-on，多次操作、可比较证据、真实算法和可实现的基础/进阶/迁移条件。每屏必须通过 sourceTask 对应三件文稿中共同出现的原任务名称；不得另造主任务名。screens 只含探究屏，组装器另加终极关卡，计入总屏数；不必凑满年级上限。teacherNotes 为 3—5 行，仅交给教师，不能塞进学生页面。

## 仿真生命周期

`script` 是严格模式函数体，参数为 `root`（该仿真的 ShadowRoot）与 `api`，必须返回对象：

- `evaluate()`：无副作用，返回 `{basic:boolean, star:boolean, transfer:boolean}`，从真实模型与学生操作证据计算，初始状态全部 false。界面反馈、判据和测试用例使用同一套模型。基础未过时不得报进阶/迁移达成。
- `reset()`：只重置当前实验状态与操作证据，不操作引擎累计成就或测验成绩。
- 可选 `onEnter()` / `onLeave()`：开始/暂停必要动画与循环。初始不可在后台启动循环，离屏、页面不可见时停止。
- `api.changed()`：学生执行有意义操作后通知引擎重新 evaluate。挂载时不调用，不因点击提示或空操作直接授奖。
- `api.feedback(text)`：输出本任务可访问的纯文本反馈，讲明变量变化及原因。

只用 `root.querySelector` 定位自己的控件；CSS 在 Shadow DOM 内作用，不污染公共导航与评分。按钮必须有文字与键盘操作；拖放必须提供点选替代；数字/代码/中文输入容错按教学目标处理；不注入额外 data-prose 标记或隐藏教学正文来绕过字数检查。导语、目标、基础与进阶判据一起标记 data-prose 并计数，不能把讲解移进操作片段逃避门禁。复杂 DOM 也只能服务本课操作、证据和即时解释。

引擎分别保存 basicEver、independentEver、assistedEver、starEver、transferEver；完整示范后才通关记为带提示，不冒充独立。查看前两级方向提示不等于看完整答案。重置不抹累计成就；上一屏/下一屏/暂跳过不授奖、不锁住终极关卡。页面刷新不恢复，本阶段仅内存状态，不使用浏览器存储。

不得使用 document/window/globalThis 访问公共状态、网络 API、外链、动态导入/eval、阻断弹窗、表单提交或 iframe。不把静态扫描/CSP 称作执行任意不可信脚本的安全沙箱。HTML 预览课题在本阶段使用固定白名单标签安全渲染；不执行学生代码。数学随机实验须提供可复现条件。

## 公共闭环

- 测验字段唯一为 q/options/correct/why；先选只记录 picked，统一提交后锁定首次整数百分制得分。暂不会记为未答、零分，计入总题数。
- 四枚徽章 basic/star/transfer/reflection 分别由实际条件驱动；求助、自评不替代知识通关。
- 自评“还没完全懂”不扣分，不写入凭单。奖状人人能开，不虚称尚未取得的成就；支持 Esc、焦点进入/返回及焦点约束。
- 凭单统一为固定表头 `# 班级|姓名|课题|得分|时间`，第二行对应五个值，UTF-8 无 BOM，末尾换行。选填兜底本班/小极客；字段与文件名清理非法字符及竖线。只有正式提交测验后可导出，无关卡全满要求；始终提供同一文本的查看/复制。
- 该格式是本项目 V2 约定；实际平台接收兼容性尚待教师验证，不宣称平台认证、防伪或自动上传。V1 导出格式保持原样。

## 三类验收

机器：JSON/schema、真实规范数值、代码语法、无外部依赖、文档完整性及 check_lesson.py；失败不截断、不补标记、不删功能。
浏览器：挂载、初始无虚奖、操作判据、提示与累计成就、快速切屏、导航、首次成绩、下载/复制、奖状键盘焦点；固定样本只证明该样本。
教师：概念准确、误区真实、探究有因果、进阶有价值、能服务课堂时长。存在 evaluate() 或通过脚本并不证明教学质量。
