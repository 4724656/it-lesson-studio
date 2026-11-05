import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

import { dbService } from '../db.js';
import { callLlmApi } from './llm.js';
import { buildV2Prompt, parseV2Payload, assembleClassworkV2, publishClassworkV2, validateSourceTasks } from './classwork-v2.js';
import { createDiagnostics, assertFileMarkers, assertCompleteFiles, auditClasswork } from './generation-diagnostics.js';

function readSkillFile(...relParts) {
  const fullPath = path.join(rootDir, ...relParts);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8').trim() : '';
}

function loadGlobalRules() {
  const text = readSkillFile('skills', 'it-lesson-studio', 'SKILL.md');
  if (!text) return '你是一位中小学信息科技教师，负责设计教案、导学单、课件和随堂作业。';
  const start = text.indexOf('## 🎯');
  const end = text.indexOf('## ⚙️');
  return start !== -1 && end !== -1 ? text.slice(start, end).trim() : text;
}

// 阶段 1：加载全局总则 + 模块 1~3（教案、导学单、课件），不混入 HTML 随堂作业规则
export function loadDocumentsSystemPrompt() {
  const parts = [
    loadGlobalRules(),
    readSkillFile('skills', '1-lesson-plan', 'SKILL.md'),
    readSkillFile('skills', '2-worksheet', 'SKILL.md'),
    readSkillFile('skills', '3-slides', 'SKILL.md')
  ].filter(Boolean);
  return parts.join('\n\n');
}

// 阶段 2：加载全局总则 + 模块 4（随堂互动作业），不混入 Word/Marp 排版规则
export function loadClassworkSystemPrompt() {
  const parts = [
    loadGlobalRules(),
    readSkillFile('skills', '4-classwork', 'SKILL.md')
  ].filter(Boolean);
  return parts.join('\n\n');
}

/**
 * 提取年级数字（3~8）
 */
export function extractGradeNum(gradeStr) {
  if (!gradeStr) return 3;
  if (gradeStr.includes('三') || gradeStr.includes('3')) return 3;
  if (gradeStr.includes('四') || gradeStr.includes('4')) return 4;
  if (gradeStr.includes('五') || gradeStr.includes('5')) return 5;
  if (gradeStr.includes('六') || gradeStr.includes('6')) return 6;
  if (gradeStr.includes('七') || gradeStr.includes('7')) return 7;
  if (gradeStr.includes('八') || gradeStr.includes('8')) return 8;
  return 3;
}

/**
 * 对齐 references/output-spec.md 第六节 spec-yaml 的年级门禁硬指标
 */
export function getGradeLimits(gradeNum) {
  const specMap = {
    3: { screens: 5, handsOn: 2, quiz: 2, prosePerScreen: 60, quizStem: 30 },
    4: { screens: 5, handsOn: 2, quiz: 2, prosePerScreen: 80, quizStem: 34 },
    5: { screens: 6, handsOn: 3, quiz: 3, prosePerScreen: 100, quizStem: 40 },
    6: { screens: 6, handsOn: 3, quiz: 3, prosePerScreen: 120, quizStem: 44 },
    7: { screens: 7, handsOn: 3, quiz: 3, prosePerScreen: 140, quizStem: 50 },
    8: { screens: 7, handsOn: 3, quiz: 3, prosePerScreen: 160, quizStem: 54 }
  };
  return specMap[gradeNum] || specMap[3];
}

/**
 * 根据年级学期匹配浙教版 12 册教材能力进阶与仿真器启发范式（教师未指定特定设想时的兜底支架）
 */
export function getSemesterSimulationHint(gradeStr) {
  const g = (gradeStr || '').trim();
  const map = {
    '三年级上册': '生活场景热点寻宝、设备功能配对、文件分类整理箱（侧重感知智能与在线生活常识，大按钮点选、零专业术语）',
    '三年级下册': '媒体文件分类箱、图片亮度/音频音量直观滑块、提示词词块点选组合（侧重数字资源整理与多媒体初体验）',
    '四年级上册': '校园生活数据投票统计图、生活号码牌（学号/快递码）分段定制器（侧重身边的数据与生活编码，直观好懂）',
    '四年级下册': '黑白方格像素点阵画板、编码对照卡、单双数1的个数找错格（侧重数字化直观体验与简单校验）',
    '五年级上册': '自然语言生活步骤卡排序补全、流程图词块插槽、生活条件判断（如果…否则…）体验台（侧重把步骤说清楚与流程图，全册不出现编程代码）',
    '五年级下册': '生活系统部件拼装、输入-计算-输出三环节体验台、恒温风扇阈值滑块（侧重身边系统与控制三环节，不出现编程代码）',
    '六年级上册': '问题关键信息筛选、简短代码单步观察器（人肉CPU）、猜数字/枚举次数对比台（侧重算法思想与初步代码阅读）',
    '六年级下册': '水位/音量反馈调节体验台、双开关串并联（与/或）点灯实验台（侧重反馈控制与开关逻辑）',
    '七年级上册': '小型局域网连线与 IP 分配体验、网页标签卡片预览、生成式AI提示词对比台（侧重互联网基础与AI应用认识）',
    '七年级下册': '物联网传感器折线监控与自动联动、二分折半查找步进、方格迷宫探路回溯观察（侧重物联网感知与搜索算法直观过程）',
    '八年级上册': '网页 HTML/CSS 结构实时预览、凯撒字母移位转盘、在线应用身份核验流程沙箱（侧重网页数据组织与日常数据安全）',
    '八年级下册': 'AI感知流水线体验、2D平面近邻投票分类画布、神经元特征重要度滑块（侧重AI典型方法直观体验，一课一焦点，不推公式）'
  };
  for (const [k, v] of Object.entries(map)) {
    if (g.includes(k) || g.includes(k.replace('册', ''))) {
      return v;
    }
  }
  return '生活概念两步点击配对、核心过程直观体验台、随堂巩固与凭单导出';
}

/**
 * 智能识别课题课型与定制仿真蓝图（严格按年级隔离 + 单课聚焦，严禁跨学段超纲截胡）
 */
export function resolveSimulationBlueprint(gradeStr, lessonTitle, requirements) {
  const gradeNum = extractGradeNum(gradeStr);
  const semesterHint = getSemesterSimulationHint(gradeStr);
  const title = (lessonTitle || '').trim();
  const req = (requirements || '').trim();

  // 课型特征匹配库：每条规则绑定严格年级列表 grades，仅在对应年级匹配课题，杜绝低年级误中初高中高深概念
  // 每个原型包含完整的 关卡1（感知/配对）➔ 关卡2（基础核心实操 hands-on）➔ 关卡3（进阶排错/迁移应用 hands-on），支撑 35~40 分钟课堂容量
  const archetypes = [
    // ==================== 三年级（3年级 · 标准 5 屏，含 2 个 hands-on） ====================
    {
      grades: [3],
      match: /小眼睛|小耳朵|小搭档|智能生活|智能工具/i,
      archetypeName: '生活智能设备寻宝与本领配对台',
      interactiveDesign: `
        - 关卡1（场景寻宝与配对）：在生活/校园 SVG 场景中点选寻找智能设备，将设备与它的感知本领（看、听、说）两步点击配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【智能小部件解剖与体验台】点击智能设备的“小眼睛/小耳朵/小大脑”部位高亮发光，观察拟人化工作过程并完成随堂问答；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【智能小助手任务派单台】为不同生活场景（如进校门、超市结账、语音提问）选派合适的智能工具并填写生活观察卡，包含基础通关与 ⭐进阶挑战星（辨别哪些事仍需人工确认）。`,
      codePatternHint: `
        let foundCount = 0, handsOnEver = false;
        function pickSmartTool(id) { foundCount++; if (foundCount >= 2) handsOnEver = true; }`
    },
    {
      grades: [3],
      match: /在线|平台|下载|查看资源|分类整理|共享|网络痕迹|数字身份|分解问题|协作|分享/i,
      archetypeName: '在线安全小卫士与数字文件分类整理箱',
      interactiveDesign: `
        - 关卡1（火眼金睛辨安全）：在生活上网情境中区分正规操作/安全身份习惯与弹窗广告/风险行为；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【虚拟浏览器安全下载与文件查看台】在模拟网页中避开伪装广告按钮、点选正规下载入口并查看文件信息；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【数字文件夹分类整理与步骤排序箱】通过“先点卡片、再点盒子”将不同文件归入对应文件夹（或按先后顺序排好做事步骤），包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let sortedCount = 0, boxDoneEver = false;
        function placeIntoBox(ok) { if (ok) sortedCount++; if (sortedCount >= 3) boxDoneEver = true; }`
    },
    {
      grades: [3],
      match: /图像|音频|视频|媒体|数字资源|数字作品|智能生成|智能处理|智能辅助/i,
      archetypeName: '多媒体参数调节台与 AI 提示词（Prompt）词块合成器',
      interactiveDesign: `
        - 关卡1（媒体类型分类箱）：将图片、声音、视频、文字素材归入对应数字资源分类箱；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【图像/音频直观调节小工坊】拖动亮度、裁剪比例或音量淡入淡出滑块，实时预览多媒体素材的变化效果；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【AI 提示词词块合成台】点击组合【主角 + 场景动作 + 画面风格】词块生成数字作品，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let mediaEditedEver = false;
        function applyMediaParams(val) { if (val !== 50) mediaEditedEver = true; }`
    },

    // ==================== 四年级（4年级 · 标准 5 屏，含 2 个 hands-on） ====================
    {
      grades: [4],
      match: /数据的安全|数据需要保护/i,
      archetypeName: '生活数据安全防护与口令健康检测台',
      interactiveDesign: `
        - 关卡1（风险识别配对）：将生活中的个人信息泄露风险与正确的保护做法两步点击配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【口令安全强度检测台】点击组合不同长度与字符类型的卡片，实时点亮口令安全星级指示灯；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【生活数据备份与防骗排雷箱】为重要学习照片和文档选择稳妥的备份方案并排查风险链接，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let safetyCheckedEver = false;
        function checkPasswordStrength(len, hasMix) { safetyCheckedEver = true; return len >= 8 && hasMix; }`
    },
    {
      grades: [4],
      match: /数据解码|数据校验|奇偶/i,
      archetypeName: '数字化编码点阵与奇偶校验排雷沙箱',
      interactiveDesign: `
        - 关卡1（编码与图案配对）：观察简单的 0/1 编码如何对应黑白方格图案并完成配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【0/1 点阵解码画板】根据给定的 0/1 数字串点击方格涂色解码，还原隐藏的图案；
        - 关卡3（进阶排错应用 · data-panel-type="hands-on"）：【奇偶校验排雷矩阵】数一数每行每列“1”的个数是单数还是双数，定位传输中变错的那一个格子并点击修好，包含基础通关与 ⭐进阶挑战星（为一行数据补上正确的校验格）。`,
      codePatternHint: `
        let gridFixedEver = false;
        function toggleGridCell(r, c, targetR, targetC, el) {
          el.textContent = el.textContent === '1' ? '0' : '1';
          if (r === targetR && c === targetC) gridFixedEver = true;
        }`
    },
    {
      grades: [4],
      match: /初探数字化|图像编码|字符编码|点阵|手写数字|识花|成语/i,
      archetypeName: '黑白像素点阵画板与字符编码对照沙箱',
      interactiveDesign: `
        - 关卡1（生活中的数字化配对）：将文字、黑白图案与对应的数字编码卡片两步点击配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【5×5 像素点阵涂色板】点击方格切换黑白（0和1），实时生成右侧的 0/1 编码串并绘制指定数字或符号图案；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【字符编码查表译码器】对照编码表将一串数字编码翻译成汉字或字母口令，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let pixelDrawnEver = false;
        function flipPixel(idx) { pixelDrawnEver = true; }`
    },
    {
      grades: [4],
      match: /声音编码|视频编码|人机编码/i,
      archetypeName: '声音视频数字化体验与人机编码对比沙箱',
      interactiveDesign: `
        - 关卡1（人读编码 vs 机读编码配对）：将门牌号、商品条形码、二维码与各自的使用场景配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【数字化采样与帧率体验台】切换不同精细度的采样格或画面张数，直观观察声音波形与连续动画的流畅度变化；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【校园物品人机编码方案设计台】为班级图书或设备同时设计便于同学看懂的文字码和便于机器扫描的条码，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let sampleTriedEver = false;
        function changeSampleLevel(level) { if (level >= 2) sampleTriedEver = true; }`
    },
    {
      grades: [4],
      match: /从数据到编码|有序的世界|编码长度|数据有关联|编码的规则|编码的验证|编码|二进制|8421|数制/i,
      archetypeName: '生活编码规则定制与二进制灯泡体验沙箱',
      interactiveDesign: `
        - 关卡1（杂乱 vs 有序对比配对）：体验按编码整理前后找物品的速度差异，配对常见生活编码；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【编码位数与容量实验室】点击切换不同位数的数字牌或灯泡开关，观察能表示的编号数量如何变化；
        - 关卡3（进阶排错应用 · data-panel-type="hands-on"）：【班级学号/图书编码生成器】通过分段下拉框（年级码+班级码+序号）拼装唯一编码并排查重号冲突，包含基础通关与 ⭐进阶挑战星（当人数超过 99 人时扩充编码位数）。`,
      codePatternHint: `
        let codeBuiltEver = false;
        function buildLifeCode(partA, partB, seq) { codeBuiltEver = true; return String(partA) + String(partB) + String(seq); }`
    },
    {
      grades: [4],
      match: /身边的数据|多样的数据|数据的价值|数据获取|数据整理|数据计算|图标呈现|图表|数据解读|记录身边的数据|设计统计表|数据可视化|规律与预测|数据分析|数据故事/i,
      archetypeName: '生活数据调查采集与动态统计图表沙箱',
      interactiveDesign: `
        - 关卡1（生活数据寻宝配对）：区分身边的数字、文字、图片数据与获取方法（观察、测量、问卷）；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【校园小调查数据采集板】点击记录不同选项的票数，右侧实时长出彩色柱状图，直观对比数据高低；
        - 关卡3（进阶排错与解读 · data-panel-type="hands-on"）：【统计表异常数据排雷与规律发现】找出记录表里明显填错的异常数据（如体温填成 85℃）并修正，根据图表得出结论，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        const counts = { A: 0, B: 0, C: 0 };
        let surveyDoneEver = false;
        function recordData(cat) {
          counts[cat] = (counts[cat] || 0) + 1;
          if (Object.values(counts).reduce((a, b) => a + b, 0) >= 5) surveyDoneEver = true;
        }`
    },

    // ==================== 五年级（5年级 · 标准 6 屏，含 2~3 个 hands-on，全学年无编程代码） ====================
    {
      grades: [5],
      match: /身边的算法|自然语言描述算法|算法中的数据|算法的特征|问题的分解|问题的抽象|模型的建立|算法的设计|算法的.*验证|算法的应用/i,
      archetypeName: '自然语言算法步骤拼图与漏步排错沙箱',
      interactiveDesign: `
        - 关卡1（清楚步骤 vs 笼统说法配对）：对比“先洗水果、再切块、最后装盘”与“随便做一下”，分辨哪句指令清楚可执行；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【生活任务自然语言步骤卡排序台】通过两步点击排列生活任务的步骤词块（如整理书包、自助借书、做水果沙拉），理清“输入什么 ➔ 逐步怎么做 ➔ 输出什么”；
        - 关卡3（进阶排错应用 · data-panel-type="hands-on"）：【算法说明书找茬与漏步补全器】找出步骤颠倒（如先穿鞋再穿袜子）或遗漏关键条件的地方并补上准确的步骤词块（本课只练用日常语言说清做事步骤，不涉及编程代码与复杂公式），包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let stepsOrderedEver = false;
        function checkStepOrder(arr) {
          const ok = arr.every((v, i) => Number(v) === i + 1);
          if (ok) stepsOrderedEver = true;
          return ok;
        }`
    },
    {
      grades: [5],
      match: /流程图描述算法|顺序结构/i,
      archetypeName: '顺序结构流程图符号配对与词块拼图槽',
      interactiveDesign: `
        - 关卡1（流程图框图认一认）：将起止框（圆角矩形）、处理框（矩形）、输入输出框（平行四边形）、流程线与对应的生活步骤配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【顺序结构流程图拼图槽】点击备选步骤词块填入流程图框中，点击“单步演示”观察按先后顺序逐步点亮执行的过程；
        - 关卡3（进阶排错应用 · data-panel-type="hands-on"）：【流程顺序颠倒排雷台】找出流程图中顺序装反的两个步骤框并交换修复，观察顺序变化对结果的影响，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let flowFilledEver = false;
        function verifyFlowSlots(slots) {
          const ok = slots.length >= 3 && slots.every(Boolean);
          if (ok) flowFilledEver = true;
          return ok;
        }`
    },
    {
      grades: [5],
      match: /分支结构|双分支结构|体验算法控制|生活中的决策|认识决策树|条件计算/i,
      archetypeName: '流程图词块拼图槽与分支条件（如果…否则…）仿真器',
      interactiveDesign: `
        - 关卡1（判断条件配对）：认识菱形判断框，把生活中的判断条件（如“身高满120cm吗？”“下雨了吗？”）与对应结果配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【分支流程图词块拼装槽】将判断条件词块和两个分支动作词块填入流程图的菱形框与左右处理框中；
        - 关卡3（进阶调试应用 · data-panel-type="hands-on"）：【分支路径点亮仿真台】拖动生活数值滑块（如体温、身高、借书数量），实时高亮流程图【是 / 否】走哪条分支路线，包含基础通关（两条分支路线都试通一次）与 ⭐进阶挑战星（测试刚好卡在分界线数值时的判断结果）。`,
      codePatternHint: `
        let branchTrueEver = false, branchFalseEver = false, branchAllEver = false;
        function testBranchInput(val, threshold) {
          if (val >= threshold) branchTrueEver = true; else branchFalseEver = true;
          if (branchTrueEver && branchFalseEver) branchAllEver = true;
        }`
    },
    {
      grades: [5],
      match: /身边的系统|系统的构成|观察系统/i,
      archetypeName: '生活中的系统与子部件拆解拼装台',
      interactiveDesign: `
        - 关卡1（系统与部件配对）：认识自行车、校园广播、自动门等日常系统分别由哪些关键部件配合组成；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【系统与子系统拆解拼装台】点击将各个子部件安装到对应位置，让整个系统顺利运转起来；
        - 关卡3（进阶排障应用 · data-panel-type="hands-on"）：【系统缺件影响实验室】试着关掉或拆下其中某一个部件，观察整个系统功能受什么影响并完成修复，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let sysAssembledEver = false;
        function checkSystemParts(parts) { if (parts.every(Boolean)) sysAssembledEver = true; }`
    },
    {
      grades: [5],
      match: /循环结构/i,
      archetypeName: '循环重复执行步进观察与计数沙箱',
      interactiveDesign: `
        - 关卡1（寻找重复规律）：区分“只做一次的事”与“按条件重复多次的事”（如跑操绕圈、每天定时浇水）；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【循环流程图拼装与步进器】拼好循环体与判断框，点击“走一步”观察流程图如何回到判断框重复执行、计数卡如何每次加 1；
        - 关卡3（进阶调试应用 · data-panel-type="hands-on"）：【循环停止条件调试台】调节目标圈数或停止条件，修复“停不下来”或“少算一次”的问题，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let loopCount = 0, loopDoneEver = false;
        function stepLoop(target) { loopCount++; if (loopCount >= target) loopDoneEver = true; }`
    },
    {
      grades: [5],
      match: /神经网络/i,
      archetypeName: '初识神经网络：外观特征卡片与三层连线体验台',
      interactiveDesign: `
        - 关卡1（特征认一认）：找出区分不同水果或动物的明显外观特点（颜色、形状、大小）；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【输入层—隐藏层—输出层点亮体验台】点击勾选待测物品的特征卡片（输入层），观察连线如何点亮中间节点（隐藏层）并汇总得出分类结果（输出层）；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【多特征组合分类与预测挑战】更换不同特征组合的待测卡片，观察识别结果如何变化（小学阶段不涉及数学公式与权重调参），包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let nnTriedEver = false;
        function activateFeatures(selected) { if (selected.length >= 2) nnTriedEver = true; }`
    },
    {
      grades: [5],
      match: /恒温|控制系统|输入|输出|查表/i,
      archetypeName: '输入-计算-输出三环节与恒温阈值控制沙箱',
      interactiveDesign: `
        - 关卡1（三环节对号入座）：将生活中的感应部件（输入）、控制核心（计算）、动作设备（输出）两步点击配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【控制系统三环节连线拼装台】为自动干手器、智能路灯或温室风扇选配正确的输入与输出部件并点亮工作链路；
        - 关卡3（进阶调试应用 · data-panel-type="hands-on"）：【恒温箱/智能风扇阈值仿真台】设定目标温度，拖动环境温度滑块，实时观察“输入数值 ➔ 比较计算 ➔ 开启或关闭设备”三个环节的状态灯变化，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let ctrlHighEver = false, ctrlLowEver = false, ctrlDoneEver = false;
        function runControlLoop(envVal, limitVal) {
          if (envVal < limitVal) ctrlLowEver = true; else ctrlHighEver = true;
          if (ctrlLowEver && ctrlHighEver) ctrlDoneEver = true;
        }`
    },

    // ==================== 六年级（6年级 · 标准 6 屏，含 2~3 个 hands-on） ====================
    {
      grades: [6],
      match: /程序设计语言|算法的执行|猜数字|韩信点兵|人工智能辅助算法/i,
      archetypeName: '人肉 CPU 单步代码追踪器与猜数字/枚举实验台',
      interactiveDesign: `
        - 关卡1（流程图与代码语句配对）：将直观的自然语言/流程图步骤与对应的简短 Python 语句配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【人肉 CPU 单步代码追踪器】点击“下一步”逐行高亮代码（.code-line.hl），实时观察变量记事卡（.var-card）数值变化与控制台输出；
        - 关卡3（进阶排错与对比 · data-panel-type="hands-on"）：【代码小排雷 / 猜数字与枚举步数对战台】修正关键条件表达式中的小错误（或对比顺序枚举与折半猜数字的查找次数），包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let traceIdx = 0, traceDoneEver = false;
        function stepCpu(steps, dir) {
          traceIdx = Math.max(0, Math.min(steps.length - 1, traceIdx + dir));
          if (traceIdx === steps.length - 1) traceDoneEver = true;
        }`
    },
    {
      grades: [6],
      match: /智能寻路|搜索算法/i,
      archetypeName: '方格地图路线规划与最短步数对比沙箱',
      interactiveDesign: `
        - 关卡1（寻路要素识别）：认识地图中的起点、终点、障碍物与可通行路口；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【校园方格地图路线搜索台】点击路口节点逐格探索从起点到终点的可行路线，自动记录行进轨迹；
        - 关卡3（进阶对比应用 · data-panel-type="hands-on"）：【多条路线步数对比与优化台】对比不同走法的总步数与耗时，找出绕开障碍的最短路线，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let routeFoundEver = false;
        function evaluateRoute(steps) { if (steps > 0) routeFoundEver = true; }`
    },
    {
      grades: [6],
      match: /算法与问题解决|抽象与建模|算法设计|算法的多样性|算法的评价|在线生活中的算法|推荐算法|算法对生活的影响|人机对话|对话机器人/i,
      archetypeName: '问题关键信息建模与多方案算法效率对比台',
      interactiveDesign: `
        - 关卡1（去粗取精建模型）：从生活情境中剔除无关细节、选出解决问题必需的关键数据完成建模；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【算法步骤设计与单步推演台】按“输入—处理—输出”组装解决问题的算法步骤并逐步运行检验结果；
        - 关卡3（进阶对比应用 · data-panel-type="hands-on"）：【多方案算法效率对比实验台】对同一组数据运行方案A与方案B，直观对比两种方案的步数与适用场景，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let modelComparedEver = false;
        function comparePlans(planA, planB) { modelComparedEver = true; }`
    },
    {
      grades: [6],
      match: /与运算|或运算|开关量与控制/i,
      archetypeName: '双开关串并联逻辑门电路（AND/OR）与状态表沙箱',
      interactiveDesign: `
        - 关卡1（与/或规则配对）：区分生活中“两个条件同时满足才动作（与）”和“满足任一条件就动作（或）”的场景；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【双开关串并联逻辑门电路与真值状态表】点击切换开关 A（0/1）与开关 B（0/1），实时高亮电流路径并自动点亮右侧 4 种开关组合状态行；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：【校园安全联锁控制拼装台】根据任务要求选择“与运算”或“或运算”组装自动报警/门禁控制规则并完成全部测试，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let swA = 0, swB = 0, comboSet = new Set(), gateAllEver = false;
        function toggleSwitch(which, isAnd) {
          if (which === 'A') swA = swA ? 0 : 1; else swB = swB ? 0 : 1;
          comboSet.add(swA + '_' + swB);
          if (comboSet.size >= 4) gateAllEver = true;
        }`
    },
    {
      grades: [6],
      match: /连续量与开关量|开关量的生成/i,
      archetypeName: '连续量与开关量（0/1）阈值转换实验台',
      interactiveDesign: `
        - 关卡1（连续量 vs 开关量分类箱）：将温度具体读数、音量强弱（连续量）与红绿灯亮灭、门禁开闭（开关量）分类入箱；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【连续量波形与阈值分界观察台】拖动光线或温度滑块，观察连续变化的数值曲线；
        - 关卡3（进阶调试应用 · data-panel-type="hands-on"）：【阈值转开关量（0/1）生成器】设定合理的分界阈值，验证当连续量跨过阈值时如何触发“开(1) / 关(0)”控制动作，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let switchGenEver = false;
        function checkThreshold(val, limit) { switchGenEver = true; return val >= limit ? 1 : 0; }`
    },
    {
      grades: [6],
      match: /自动控制系统|控制的形态|反馈与控制|反馈的实现|控制系统中的数据|扩音系统|控制系统的安全|智能控制系统|智能体/i,
      archetypeName: '开环与闭环反馈控制（水位/扩音调节）仿真沙箱',
      interactiveDesign: `
        - 关卡1（开环 vs 闭环反馈辨析）：对比“只管定时执行”与“边检测结果边自动微调”两种控制方式；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【闭环反馈回路拼装与水位/音量调节台】设定目标水位或理想扩音音量，观察检测端如何把当前偏差传回控制端；
        - 关卡3（进阶抗干扰应用 · data-panel-type="hands-on"）：【外部干扰测试与安全保护沙箱】点击施加环境干扰或异常输入，观察反馈控制系统如何自动修正恢复稳定，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let feedbackTestedEver = false;
        function adjustFeedback(current, target) { feedbackTestedEver = true; return target - current; }`
    },

    // ==================== 七年级（7年级 · 标准 7 屏，含 3 个 hands-on） ====================
    {
      grades: [7],
      match: /介绍我的学校/i,
      archetypeName: '校园网页结构规划与 HTML 标签实时预览台',
      interactiveDesign: `
        - 关卡1（网页栏目与元素配对）：将标题、导航、正文介绍、图片与对应的网页区域配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【校园网页版面结构拼装台】点选组合网页头部、图文卡片与超链接模块，搭建清晰的页面骨架；
        - 关卡3（进阶实操应用 · data-panel-type="hands-on"）：【HTML 标签微调与实时预览台】切换或编辑标题、段落与图片属性，右侧预览窗实时渲染网页效果，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let pagePreviewedEver = false;
        function renderPreview() { pagePreviewedEver = true; }`
    },
    {
      grades: [7],
      match: /人工智能的发展|生成式人工智能|智能体的搭建|人工智能的影响|人工智能的技术基础|人工智能中的神经网络/i,
      archetypeName: '生成式 AI 提示词实验与智能体/神经网络流程观察台',
      interactiveDesign: `
        - 关卡1（AI 发展阶段与三要素配对）：梳理数据、算法、算力三要素与典型应用场景；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【生成式 AI 提示词优化 / 神经网络三层特征传递台】对比模糊提示词与结构化提示词的输出差异（或观察输入特征经隐藏层传递到输出层的点亮过程）；
        - 关卡3（进阶实践应用 · data-panel-type="hands-on"）：【智能体工作流搭建与事实核查沙箱】按“感知输入 ➔ 知识检索 ➔ 生成回复 ➔ 人工核查”组装智能体并排查错误信息，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let aiWorkflowEver = false;
        function runAiPipeline(stepCount) { if (stepCount >= 3) aiWorkflowEver = true; }`
    },
    {
      grades: [7],
      match: /二分搜索/i,
      archetypeName: '有序序列二分搜索（折半查找）步进实验台',
      interactiveDesign: `
        - 关卡1（顺序查找 vs 二分搜索对比）：体会“为什么要先排序才能折半查找”；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【二分搜索步进追踪器】在有序数字阵列中点击“下一步”，实时高亮左边界、中间点与右边界的收缩过程；
        - 关卡3（进阶对比应用 · data-panel-type="hands-on"）：【不同数据规模查找效率对比台】测试目标值在头部、中间、尾部或不存在时，顺序查找与二分搜索的步数差异，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let binarySearchEver = false;
        function stepBinarySearch(low, high) { binarySearchEver = true; return Math.floor((low + high) / 2); }`
    },
    {
      grades: [7],
      match: /深度优先|DFS|搜索算法/i,
      archetypeName: '网格迷宫深度优先搜索（DFS）步进与回溯观察台',
      interactiveDesign: `
        - 关卡1（探路规则理解）：认识“一路向前探、遇死胡同退回上一岔口”的搜索策略；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【迷宫岔路探索与路径记录台】在分支节点图上手动体验按约定方向探索并标记已访问节点；
        - 关卡3（进阶仿真应用 · data-panel-type="hands-on"）：【迷宫 DFS 步进回溯动画器】点击“单步前进”观察岔路探索染色与死胡同回退重选过程，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let dfsStep = 0, dfsCompleteEver = false;
        function nextDfsFrame(frames) {
          dfsStep = Math.min(frames.length - 1, dfsStep + 1);
          if (dfsStep === frames.length - 1) dfsCompleteEver = true;
        }`
    },
    {
      grades: [7],
      match: /物联网|传感器|无线通信|感知与识别|物联系统/i,
      archetypeName: '物联网三层架构与传感器折线监控联动台',
      interactiveDesign: `
        - 关卡1（感知层-网络层-应用层配对）：将温湿度、光照、红外传感器及通信方式与智慧生活场景配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【传感器数据实时折线监控台】模拟环境温湿度/光照变化，实时绘制动态波动折线并读取峰值与均值；
        - 关卡3（进阶联调应用 · data-panel-type="hands-on"）：【物联阈值告警与执行器反馈沙箱】设定告警阈值并测试当传感器读数超标时自动开启风扇或补光灯的完整闭环（不混入迷宫搜索算法），包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let iotLinkedEver = false;
        function updateSensorChart(val, threshold) { iotLinkedEver = true; return val > threshold; }`
    },
    {
      grades: [7],
      match: /网络|互联网|TCP|IP|DHCP|协议|路由|云计算|云存储/i,
      archetypeName: '小型局域网拓扑 IP/DHCP 分配器与数据包路由沙箱',
      interactiveDesign: `
        - 关卡1（网络设备与协议配对）：光猫、路由器、交换机、终端及 HTTP/TCP/IP 职责配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【IP 地址与 DHCP 分配排障台】为局域网终端配置 192.168.1.x 网段 IP（实时检测 IP 冲突与 >255 越界错误），对比手动配置与 DHCP 自动分配；
        - 关卡3（进阶路由应用 · data-panel-type="hands-on"）：【数据包逐跳传输与连通测试台】点击发送 Ping 测试包观察数据包经过交换机、路由器的逐跳状态反馈，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let netConfigEver = false;
        function verifyHostIp(lastOctet, usedOctets) {
          const n = Number(lastOctet);
          const ok = Number.isInteger(n) && n >= 2 && n <= 254 && !usedOctets.includes(n);
          if (ok) netConfigEver = true;
          return ok;
        }`
    },

    // ==================== 八年级（8年级 · 标准 7 屏，含 3 个 hands-on） ====================
    {
      grades: [8],
      match: /网页的数据组织|网页的数据呈现|网页的数据编码|网页的编辑与发布|DOM/i,
      archetypeName: '网页 DOM 树结构探针与 HTML/CSS 实时预览实验台',
      interactiveDesign: `
        - 关卡1（网页元素与 DOM 节点配对）：将网页标题、段落、链接、样式属性与对应的 HTML/CSS 代码配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【网页 DOM 树节点层级探针】点击展开网页节点树，高亮查看 head、body、div、p 之间的父子嵌套关系与数据编码；
        - 关卡3（进阶编辑应用 · data-panel-type="hands-on"）：【HTML/CSS 样式实时预览实验台】调整文字内容、颜色、字号与布局属性，右侧预览区同步展示网页呈现变化，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let domEditedEver = false;
        function updateDomPreview(tag, styleVal) { domEditedEver = true; }`
    },
    {
      grades: [8],
      match: /加密|解密|凯撒|备份|安全|身份认证/i,
      archetypeName: '凯撒密码移位加密转盘与身份认证安全实验室',
      interactiveDesign: `
        - 关卡1（明文-密钥-密文与安全防护配对）：古典密码要素与现代网络身份认证手段配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【凯撒密码移位加密/解密转盘】调节偏移密钥 Key (1~25)，实时观察明文字母与密文字母映射轮盘，亲手加密或解密情报；
        - 关卡3（进阶破译与防护 · data-panel-type="hands-on"）：【密钥穷举破译与多因素认证沙箱】一键遍历测试候选密钥找出可读明文，并配置双因素身份核验防线，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let cipherCrackedEver = false;
        function caesarShift(str, shift) {
          return str.replace(/[A-Za-z]/g, ch => {
            const base = ch <= 'Z' ? 65 : 97;
            return String.fromCharCode(((ch.charCodeAt(0) - base + shift + 26) % 26) + base);
          });
        }`
    },
    {
      grades: [8],
      match: /语音识别|语音合成|图像识别|自然语言处理|多模态/i,
      archetypeName: 'AI 感知技术（语音/图像/文本/多模态）流水线体验台',
      interactiveDesign: `
        - 关卡1（AI 感知技术与应用配对）：将语音识别、语音合成、图像识别、自然语言处理、多模态融合与典型场景配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【信号输入 ➔ 特征提取 ➔ 识别输出实验台】切换不同样本或文本分词卡片，分步观察特征提取与模型识别过程；
        - 关卡3（进阶鲁棒性测试 · data-panel-type="hands-on"）：【环境干扰对比与多模态互补沙箱】调节背景噪音或画面模糊度，对比单模态识别与多模态联合判断的准确率变化，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let perceptionRunEver = false;
        function testSampleRecognition(clarity) { perceptionRunEver = true; return clarity >= 60; }`
    },
    {
      grades: [8],
      match: /认识机器学习|监督学习|无监督学习|K近邻|KNN|机器学习的实践/i,
      archetypeName: '2D 平面 KNN 动态分类画布与机器学习范式体验台',
      interactiveDesign: `
        - 关卡1（监督学习 vs 无监督学习配对）：区分“有标签样本训练”与“无标签相似聚类”的典型应用；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【2D 平面 KNN 动态分类面】点击坐标平面放置待测样本点，切换 K=1、3、5，实时绘制最近 K 个邻居连线并按多数投票给出分类结果；
        - 关卡3（进阶边界探究 · data-panel-type="hands-on"）：【样本分布与 K 值边界实验台】在两类样本交界处放置测试点，对比 K 值过小或过大时分类结果的变化（聚焦近邻投票思想，不混入神经网络权重调参），包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let knnRunEver = false;
        function runKnnVote(px, py, k, points) {
          const nearest = points.map(p => ({ ...p, dist: Math.hypot(p.x - px, p.y - py) }))
                                .sort((a, b) => a.dist - b.dist).slice(0, k);
          knnRunEver = true;
          return nearest;
        }`
    },
    {
      grades: [8],
      match: /神经网络的发展|神经网络的基本结构|神经网络的计算|卷积神经网络|神经网络的实践/i,
      archetypeName: '人工神经网络三层结构与卷积/权重特征观察台',
      interactiveDesign: `
        - 关卡1（神经元与网络层职责配对）：认识输入层、隐藏层、输出层及连接权重的作用；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【神经元加权汇总观察台】调节不同输入特征的重要度权重滑块，实时观察节点汇总得分与分类输出；
        - 关卡3（进阶特征提取应用 · data-panel-type="hands-on"）：【图像局部特征滤波 / 阈值激活实验台】切换边缘提取窗口或判定阈值，直观观察特征轮廓提取与分类准确率变化，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let nnCalcEver = false;
        function updateNeuronScore(x1, w1, x2, w2) { nnCalcEver = true; return x1 * w1 + x2 * w2; }`
    },
    {
      grades: [8],
      match: /物联网数据的特点|智能物联系统/i,
      archetypeName: '智能物联系统感知-决策-控制综合联调沙箱',
      interactiveDesign: `
        - 关卡1（物联感知—AI分析—执行控制配对）：梳理智能物联系统的软硬件协同链路；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：【智能物联硬件接线与传感器采集台】连接传感器与主控板端口，实时读取多路环境时序数据；
        - 关卡3（进阶联调应用 · data-panel-type="hands-on"）：【智能物联规则配置与故障调试台】设置多条件联动控制规则，模拟异常数据输入并验证执行器响应，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        let smartIotEver = false;
        function runSmartIotRule(temp, hum) { smartIotEver = true; }`
    }
  ];

  // 严格在当前年级允许范围内匹配课题，绝不跨年级借用高年级原型
  let matched = archetypes.find(a => a.grades.includes(gradeNum) && a.match.test(title));
  if (!matched && req) {
    matched = archetypes.find(a => a.grades.includes(gradeNum) && a.match.test(req));
  }
  if (!matched) {
    matched = {
      archetypeName: `${gradeStr}核心概念体验与交互式探究沙箱`,
      interactiveDesign: `
        - 关卡1（情境探索与概念配对）：紧扣《${title}》生活情境设计两步点击配对；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：结合本学期能力定位（${semesterHint}），提供核心概念直观剖析与基础动手操作；
        - 关卡3（进阶迁移应用 · data-panel-type="hands-on"）：提供贴合当前年级的参数调节、步骤排错或情景实验，包含基础通关与 ⭐进阶挑战星（聚焦本课核心主题，不跨年级超纲）。`,
      codePatternHint: `
        let stage1Ever = false, stage2Ever = false, handsOnEver = false;`
    };
  }

  return {
    gradeNum,
    semesterHint,
    hasCustomRequirements: Boolean(req),
    customRequirementsText: req,
    archetypeName: matched.archetypeName,
    interactiveDesign: matched.interactiveDesign.trim(),
    codePatternHint: matched.codePatternHint.trim()
  };
}

/**
 * 标杆级单文件课堂作业完整 CSS 样式库（直接内嵌，涵盖通用布局 + 12册微型仿真器高频UI组件）
 */
const CLASSWORK_BENCHMARK_CSS = `
  :root {
    --bg-page: #F4F7F4;
    --card-bg: #FFFFFF;
    --primary: #1E5128;
    --primary-light: #EBF4EC;
    --accent: #4E9F3D;
    --accent-gold: #F39C12;
    --accent-blue: #2980B9;
    --text-main: #2C3E50;
    --text-sub: #576574;
    --danger: #E74C3C;
    --border: #DCDDE1;
    --radius: 16px;
    --shadow: 0 8px 24px rgba(30, 81, 40, 0.08);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg-page);
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    line-height: 1.65;
    font-size: 16px;
    padding-bottom: 60px;
    user-select: none;
  }
  header.top-bar {
    position: sticky; top: 0; z-index: 100;
    background: linear-gradient(135deg, #1E5128 0%, #2D6A4F 100%);
    color: #fff;
    padding: 14px 20px 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }
  .top-inner {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-badge {
    background: var(--accent-gold);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 6px;
  }
  .brand h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
  .stepper { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .step-node {
    display: flex; align-items: center; gap: 6px;
    cursor: pointer; opacity: 0.65; transition: all 0.25s ease;
    padding: 4px 10px; border-radius: 20px;
    background: rgba(255,255,255,0.08);
  }
  .step-node:hover { opacity: 0.9; }
  .step-node.active {
    opacity: 1; background: rgba(255,255,255,0.22);
    box-shadow: 0 0 10px rgba(243,156,18,0.4);
  }
  .step-num {
    width: 24px; height: 24px; border-radius: 50%;
    background: #204B35; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; border: 2px solid transparent;
  }
  .step-node.active .step-num { background: var(--accent-gold); color: #fff; border-color: #fff; }
  .step-node.done .step-num { background: var(--accent); color: #fff; }
  .step-title { font-size: 13px; font-weight: 700; }
  main { max-width: 880px; margin: 24px auto; padding: 0 16px; }
  .panel {
    display: none; background: var(--card-bg); border-radius: var(--radius);
    padding: 28px 30px; box-shadow: var(--shadow);
    border: 1px solid rgba(220, 221, 225, 0.6); animation: slideUp 0.35s ease;
  }
  .panel.active { display: block; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .panel-tag {
    display: inline-block; color: var(--accent); background: var(--primary-light);
    font-size: 13px; font-weight: 800; padding: 3px 10px; border-radius: 6px; margin-bottom: 8px;
  }
  h2.panel-title { font-size: 23px; font-weight: 800; color: var(--primary); margin-bottom: 12px; }
  .story-box {
    background: #F4F8FA; border-left: 4px solid var(--accent-blue);
    border-radius: 0 12px 12px 0; padding: 12px 18px; margin-bottom: 18px;
    font-size: 15px; color: #34495E;
  }
  .story-box b { color: var(--accent-blue); }
  .tip-box {
    background: #FFF9E6; border: 1px solid #FDE3A7; color: #936500;
    border-radius: 10px; padding: 10px 16px; font-size: 14px; margin: 14px 0 18px;
    display: flex; align-items: center; gap: 8px;
  }
  .challenge-card {
    background: linear-gradient(135deg, #FFFDF5 0%, #FEF5E7 100%);
    border: 2px dashed #F39C12; border-radius: 12px; padding: 14px 18px; margin: 16px 0;
  }
  .challenge-card h4 { color: #D35400; font-size: 15px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  /* 配对与仿真卡片容器 */
  .match-arena { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 18px 0; }
  .match-col { display: flex; flex-direction: column; gap: 12px; }
  .match-card {
    background: #FAFBFC; border: 2px solid var(--border); border-radius: 12px;
    padding: 14px 16px; cursor: pointer; transition: all 0.2s ease;
    display: flex; align-items: center; gap: 14px;
  }
  .match-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(78, 159, 61, 0.15); }
  .match-card.selected { border-color: var(--accent-gold); background: #FFFDF7; box-shadow: 0 0 0 3px rgba(243, 156, 18, 0.25); }
  .match-card.matched { border-color: var(--accent); background: #EDF7EC; pointer-events: none; opacity: 0.9; }
  .match-icon { font-size: 30px; flex-shrink: 0; }
  .match-info h4 { font-size: 16px; margin-bottom: 2px; color: var(--primary); }
  .match-info p { font-size: 13px; color: var(--text-sub); }
  .match-status { min-height: 28px; font-size: 15px; font-weight: 800; text-align: center; margin-top: 10px; }
  /* 通用仿真工作台、点阵网格、代码单步沙箱与控制台 */
  .case-lab, .sim-workspace {
    background: #2C3E50; border-radius: 14px; padding: 22px; color: #fff;
    margin: 16px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center;
  }
  @media(max-width: 768px) { .case-lab, .sim-workspace, .match-arena { grid-template-columns: 1fr; } }
  .motherboard-sim, .sim-grid-panel {
    background: #1B2836; border: 2px dashed #4A6572; border-radius: 12px;
    padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  .hardware-slot, .sim-slot {
    background: #22313F; border: 2px solid #34495E; border-radius: 10px;
    padding: 12px 8px; text-align: center; cursor: pointer; transition: all 0.25s ease; color: #ECF0F1;
  }
  .hardware-slot:hover, .sim-slot:hover { border-color: var(--accent-gold); background: #2C3E50; transform: scale(1.03); }
  .hardware-slot.active, .sim-slot.active { border-color: #F1C40F; background: #34495E; box-shadow: 0 0 15px rgba(241, 196, 15, 0.4); }
  .slot-icon { font-size: 26px; display: block; margin-bottom: 4px; }
  .slot-name { font-size: 13px; font-weight: 700; color: #ECF0F1; }
  .inspect-detail {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 20px; min-height: 170px; display: flex; flex-direction: column; justify-content: center;
  }
  .inspect-title { font-size: 19px; font-weight: 800; color: #F1C40F; margin-bottom: 8px; }
  .inspect-metaphor { font-size: 15px; color: #E0E6ED; line-height: 1.6; }
  .console-box {
    background: #0F172A; color: #38BDF8; border-radius: 12px; padding: 16px;
    font-family: Consolas, Monaco, "Courier New", monospace; font-size: 14px;
    line-height: 1.6; min-height: 110px; margin: 14px 0; overflow-x: auto;
  }
  .code-line { padding: 3px 8px; border-radius: 6px; white-space: pre-wrap; font-family: Consolas, monospace; }
  .code-line.hl { background: rgba(243, 156, 18, 0.3); color: #FFF; font-weight: 700; }
  .var-grid { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
  .var-card {
    background: #F8FAFC; border: 2px solid var(--border); border-radius: 10px;
    padding: 8px 16px; text-align: center; min-width: 96px;
  }
  .var-card .var-name { font-size: 12px; color: var(--text-sub); font-weight: 700; }
  .var-card .var-val { font-size: 20px; font-weight: 900; color: var(--accent-blue); font-family: Consolas, monospace; }
  .bit-grid { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 14px 0; }
  .bit-cell {
    width: 64px; height: 76px; border-radius: 12px; border: 2px solid var(--border);
    background: #FAFBFC; display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; font-weight: 800; transition: all 0.2s ease;
  }
  .bit-cell.on { background: #FFF9DB; border-color: #F39C12; color: #D35400; box-shadow: 0 0 12px rgba(243, 156, 18, 0.35); }
  /* 单选题与交互 */
  .option-list { display: flex; flex-direction: column; gap: 10px; margin: 12px 0 20px; }
  .option-item {
    border: 2px solid var(--border); border-radius: 12px; padding: 12px 18px;
    cursor: pointer; display: flex; align-items: center; gap: 12px; font-size: 16px;
    background: #FAFAFA; transition: all 0.2s ease;
  }
  .option-item:hover { border-color: var(--accent); background: #FFF; }
  .option-item.picked { border-color: var(--accent-blue); background: #EDF4F9; font-weight: 700; }
  .option-item.correct { border-color: var(--accent); background: #EDF7EC; color: #1E5128; font-weight: 800; }
  .option-item.wrong { border-color: var(--danger); background: #FDEDEC; color: var(--danger); }
  .option-list.locked .option-item { pointer-events: none; }
  .option-list.locked .option-item:not(.correct) { opacity: 0.55; }
  /* 测验与凭单导出区 */
  .score-banner {
    display: none; background: linear-gradient(135deg, #EDF7EC 0%, #D4EDDA 100%);
    border: 2px solid #4E9F3D; border-radius: 14px; padding: 20px; text-align: center; margin: 20px 0;
  }
  .score-val { font-size: 38px; font-weight: 900; color: #1E5128; }
  .score-desc { font-size: 16px; font-weight: 700; color: #2D6A4F; margin-top: 4px; }
  .check-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    border-radius: 8px; font-size: 15px; cursor: pointer;
  }
  .check-item:hover { background: #F1F4F7; }
  .check-item input { width: 18px; height: 18px; accent-color: var(--accent); }
  /* 底部按钮栏 */
  .footer-nav {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 26px; padding-top: 18px; border-top: 2px dashed #ECEFF1;
  }
  .btn {
    font-family: inherit; font-size: 15px; font-weight: 800;
    padding: 11px 22px; border-radius: 12px; border: none; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s ease;
  }
  .btn:active { transform: scale(0.97); }
  .btn-green { background: var(--accent); color: #fff; box-shadow: 0 4px 10px rgba(78, 159, 61, 0.3); }
  .btn-green:hover { background: #3E8431; }
  .btn-gold { background: var(--accent-gold); color: #fff; box-shadow: 0 4px 10px rgba(243, 156, 18, 0.3); }
  .btn-gold:hover { background: #D68910; }
  .btn-gray { background: #E2E8F0; color: #475569; }
  .btn-gray:hover { background: #CBD5E1; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
  /* 顶部集星器与声音控制 */
  .h-star { color: #F1C40F; font-size: 15px; font-weight: 800; margin-left: 10px; display: inline-flex; align-items: center; gap: 4px; }
  .btn-sound { background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 2px 6px; }
  /* 页面浮动 Toast 提示 */
  .toast {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%) translateY(-20px);
    background: rgba(30, 41, 59, 0.92); color: #fff; padding: 8px 22px; border-radius: 30px;
    font-size: 14px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 9999;
    pointer-events: none; opacity: 0; transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }
  .toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }
  /* SVG 场景寻宝与脉冲热点 */
  .scene-wrap { position: relative; max-width: 640px; margin: 16px auto; }
  .scene-svg { width: 100%; border-radius: 14px; display: block; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
  .hs {
    position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px; border-radius: 50%;
    background: #FF7675; border: 2px solid #fff; color: #fff; font-size: 16px;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
    box-shadow: 0 0 0 0 rgba(255, 118, 117, 0.7); animation: pulse 1.8s infinite; transition: all 0.2s; z-index: 10;
  }
  .hs.found { background: #00B894; animation: none; box-shadow: 0 2px 8px rgba(0, 184, 148, 0.4); transform: translate(-50%, -50%) scale(0.92); }
  .hs.hint { animation: shake 0.5s ease-in-out infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 118, 117, 0.7); } 70% { box-shadow: 0 0 0 12px rgba(255, 118, 117, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 118, 117, 0); } }
  @keyframes shake { 0%, 100% { transform: translate(-50%, -50%) rotate(0deg); } 25% { transform: translate(-50%, -50%) rotate(-12deg); } 75% { transform: translate(-50%, -50%) rotate(12deg); } }
  /* 悬浮小助手吉祥物 */
  .mascot {
    position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, #6C5CE7, #a29bfe); color: #fff; font-size: 24px;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
    box-shadow: 0 6px 20px rgba(108, 92, 231, 0.4); z-index: 100; transition: transform 0.2s; border: none;
  }
  .mascot:hover { transform: scale(1.1); }
  .mascot-bub {
    position: fixed; right: 78px; bottom: 25px; background: #fff; border: 2px solid #6C5CE7;
    border-radius: 14px; padding: 12px 16px; max-width: 260px; font-size: 13px; color: #2D3436;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: none; z-index: 100;
  }
  .mascot-bub.on { display: block; animation: slideUp 0.25s ease; }
  /* 两步点击配对与收纳盒 */
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 20px;
    background: #fff; border: 2px solid var(--border); font-size: 14px; font-weight: 700; cursor: pointer;
    transition: all 0.2s; user-select: none;
  }
  .chip:hover { border-color: var(--accent); }
  .chip.sel { border-color: #E67E22; background: #FEF9E7; transform: translateY(-2px); box-shadow: 0 4px 10px rgba(230, 126, 34, 0.25); }
  .chip.placed { opacity: 0.35; pointer-events: none; border-style: dashed; }
  .chip.right { border-color: #27AE60; background: #EAFAF1; color: #1E8449; }
  .chip.wrong { border-color: #E74C3C; background: #FDEDEC; color: #C0392B; }
  .box { background: #F8F9FA; border: 2px dashed #BDC3C7; border-radius: 14px; padding: 14px; min-height: 110px; transition: border-color 0.2s; cursor: pointer; }
  .box:hover { border-color: #3498DB; }
  .box-title { font-size: 15px; font-weight: 800; color: #2C3E50; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .box-content { display: flex; flex-wrap: wrap; gap: 8px; min-height: 48px; }
  /* 全量学习单预览报告框 */
  .report-box {
    background: #FDFEFE; border: 2px solid #D5D8DC; border-radius: 12px; padding: 14px 18px;
    font-family: Consolas, monospace; font-size: 13px; line-height: 1.6; color: #34495E;
    margin: 16px 0; max-height: 200px; overflow-y: auto; white-space: pre-wrap;
  }
`;

/**
 * 计算与 check_lesson.py 完全一致的可见有效字数（中文字数 + 英文数字词数）
 */
export function countVisibleWords(htmlOrText) {
  let t = String(htmlOrText || '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/&[a-zA-Z0-9#]+;/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ');
  const zh = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (t.match(/[a-zA-Z0-9]+/g) || []).length;
  return zh + en;
}

/**
 * 按最大有效字数安全裁剪文本（保留句子完整性）
 */
function trimToVisibleWords(text, maxWords) {
  if (countVisibleWords(text) <= maxWords) return text;
  let result = '';
  for (const ch of String(text || '')) {
    const next = result + ch;
    if (countVisibleWords(next) > maxWords - 1) break;
    result = next;
  }
  return result.replace(/[，、；：,\s]+$/, '') + '。';
}

/**
 * 课堂作业 HTML 生成后静态合规自检与自动微调器（确保 100% 通过 check_lesson.py 门禁且无 alert 弹窗卡学生）
 */
export function sanitizeGeneratedClassworkHtml(rawHtml, gradeNum, grade, lessonTitle) {
  let html = String(rawHtml || '').trim();
  if (!html) return html;

  const limits = getGradeLimits(gradeNum);

  // 1. 确保 UTF-8 与 lesson-grade meta 标签存在
  if (!/<meta\s+charset=["']UTF-8["']/i.test(html)) {
    html = html.replace(/<head>/i, '<head>\n<meta charset="UTF-8">');
  }
  if (!/<meta\s+name=["']lesson-grade["']/i.test(html)) {
    html = html.replace(/<meta\s+charset=["']UTF-8["'][^>]*>/i, `$&\n<meta name="lesson-grade" content="${gradeNum}">`);
  } else {
    html = html.replace(/(<meta\s+name=["']lesson-grade["']\s+content=["'])\d+(["'])/i, `$1${gradeNum}$2`);
  }

  // 2. 确保 <title> 含“课堂作业”
  if (!/<title>[\s\S]*?<\/title>/i.test(html)) {
    html = html.replace(/<\/head>/i, `<title>${lessonTitle || '信息科技'}｜课堂作业</title>\n</head>`);
  } else {
    html = html.replace(/<title>([\s\S]*?)<\/title>/i, (m, inner) => {
      return inner.includes('课堂作业') ? m : `<title>${inner.trim()}｜课堂作业</title>`;
    });
  }

  // 3. 管控 data-panel-type="hands-on" 数量（1 <= count <= limits.handsOn）
  let handsOnCount = 0;
  html = html.replace(/<section\b([^>]*\bpanel\b[^>]*)>/gi, (fullTag, attrs) => {
    if (/data-panel-type=["']hands-on["']/i.test(attrs)) {
      handsOnCount++;
      if (handsOnCount > limits.handsOn) {
        return `<section${attrs.replace(/\s*data-panel-type=["']hands-on["']/gi, '')}>`;
      }
    }
    return fullTag;
  });
  if (handsOnCount === 0) {
    // 若大模型漏标 hands-on，自动在 data-step="1" 或 data-step="2" 补标 1 个
    let injected = false;
    html = html.replace(/<section\b([^>]*data-step=["'][12]["'][^>]*)>/i, (fullTag, attrs) => {
      if (!injected) {
        injected = true;
        return `<section${attrs} data-panel-type="hands-on">`;
      }
      return fullTag;
    });
  }

  // 4. 校验并修正每屏 data-prose 标记与字数上限（<= limits.prosePerScreen）
  html = html.replace(/(<section\b[^>]*\bpanel\b[^>]*\bdata-step=["']\d+["'][^>]*>)([\s\S]*?)(<\/section>)/gi, (full, openTag, inner, closeTag) => {
    const proseRegex = /<([a-zA-Z0-9]+)([^>]*)\bdata-prose\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    const matches = [...inner.matchAll(proseRegex)];

    if (matches.length === 0) {
      // 自动为首个 <p> 添加 data-prose 并裁剪长度
      let added = false;
      const fixedInner = inner.replace(/<p(\b[^>]*)>([\s\S]*?)<\/p>/i, (pm, pAttrs, pBody) => {
        if (added) return pm;
        added = true;
        const safeText = countVisibleWords(pBody) > limits.prosePerScreen
          ? trimToVisibleWords(pBody.replace(/<[^>]+>/g, ''), limits.prosePerScreen)
          : pBody;
        return `<p${pAttrs} data-prose>${safeText}</p>`;
      });
      return added
        ? `${openTag}${fixedInner}${closeTag}`
        : `${openTag}\n<p data-prose>欢迎进入本关探究，请按指引动手操作。</p>${inner}${closeTag}`;
    }

    // 若该屏已有 data-prose，只保留第一个 data-prose 标记并确保其有效字数 <= limits.prosePerScreen
    let seenFirst = false;
    const fixedInner = inner.replace(proseRegex, (pm, tag, preAttr, postAttr, body) => {
      if (!seenFirst) {
        seenFirst = true;
        if (countVisibleWords(body) > limits.prosePerScreen) {
          const plain = body.replace(/<[^>]+>/g, '');
          return `<${tag}${preAttr}data-prose${postAttr}>${trimToVisibleWords(plain, limits.prosePerScreen)}</${tag}>`;
        }
        return pm;
      }
      // 移除同屏多余段落上的 data-prose 属性，防止累加超标
      return `<${tag}${preAttr}${postAttr}>${body}</${tag}>`;
    });
    return `${openTag}${fixedInner}${closeTag}`;
  });

  // 5. 确保 const quiz = [...]; 带分号，且题数 <= limits.quiz、题干 q: 字数 <= limits.quizStem
  // 并自动清理大模型容易误写的非法分号（如 options: [...];, 或 correct: 1;,）
  html = html.replace(/const\s+quiz\s*=\s*\[([\s\S]*?)\]\s*;?/m, (full, body) => {
    let cleanBody = body
      .replace(/\]\s*;\s*,/g, '],')
      .replace(/;\s*,/g, ',')
      .replace(/;\s*([}\]])/g, '$1');
    const fixedBody = cleanBody.replace(/(\bq\s*:\s*)(["'])((?:\\.|(?!\2).)*)\2/g, (qm, prefix, quote, stemText) => {
      if (countVisibleWords(stemText) > limits.quizStem) {
        const trimmed = trimToVisibleWords(stemText, limits.quizStem).replace(/。$/, '？');
        return `${prefix}${quote}${trimmed}${quote}`;
      }
      return qm;
    });
    return `const quiz = [${fixedBody}];`;
  });

  // 6. 全局清理脚本中可能残留的对象字面量非法分号（如 ];, 或 };,）
  html = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, start, scriptBody, end) => {
    const sanitizedScript = scriptBody
      .replace(/\]\s*;\s*,/g, '],')
      .replace(/}\s*;\s*,/g, '},')
      .replace(/;\s*,/g, ',');
    return `${start}${sanitizedScript}${end}`;
  });

  // 7. 确保包含“我还没完全懂”自评出口
  if (!html.includes('还没完全懂')) {
    html = html.replace(/<\/main>/i, `<div style="display:none">我还没完全懂，需要老师或同伴帮助</div>\n</main>`);
  }

  // 8. 彻底消除阻塞学生的 alert(...) 弹窗（转为 console.info 非阻塞提示）
  html = html.replace(/\balert\s*\(/g, 'console.info(');

  // 9. 确保步进节点序号从 1 开始（严禁一线学生看到 0 开头的步进序号）
  html = html.replace(/(<span\s+class=["']step-num["']>\s*(?:'|")?\s*\+\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*\+\s*(?:'|")?\s*<\/span>)/g, '$1($2 + 1)$3');
  html = html.replace(/(<span\s+class=["']step-num["']>\s*\$\{)([a-zA-Z_$][a-zA-Z0-9_$]*)(\}\s*<\/span>)/g, '$1$2 + 1$3');

  return html;
}

/**
 * 调用 LLM API 生成四位一体教学资料（两阶段架构：教学文稿三件套 + 深度定制单文件 HTML 数字化探究舱）
 */
export async function generateLessonFiles({
  taskId,
  grade,
  lessonTitle,
  requirements,
  materialsText,
  images,
  targetDir,
  onProgress,
  signal
}) {
  const apiBase = dbService.getSetting('ai_api_base') || process.env.AI_API_BASE || 'https://api.deepseek.com/v1';
  const apiKey = dbService.getSetting('ai_api_key') || process.env.AI_API_KEY || '';
  const model = dbService.getSetting('ai_model') || process.env.AI_MODEL || 'deepseek-chat';

  if (!apiKey || !apiKey.trim() || apiKey.trim() === 'sk-none') {
    throw new Error('未配置 AI API Key！请联系管理员在【管理后台 -> AI 接口与系统设置】中填入有效的 API Key 后再开始备课。');
  }

  const useV2 = process.env.AI_HTML_GENERATOR === 'v2';
  const diagnostics = useV2 || process.env.AI_GENERATION_DIAGNOSTICS === '1' ? createDiagnostics(targetDir) : null;
  const validate = (files, phase) => {
    if (!diagnostics) return;
    try {
      assertCompleteFiles(files, phase);
      diagnostics({ type: 'integrity', phase, status: 'passed' });
    } catch (error) {
      diagnostics({ type: 'integrity', phase, status: 'failed' });
      throw error;
    }
  };
  const parsePhase = (raw, phase) => {
    try {
      if (diagnostics) assertFileMarkers(raw, phase);
      return parseDelimitedFiles(raw, grade, lessonTitle);
    } catch (error) {
      if (diagnostics) diagnostics({ type: 'integrity', phase, status: 'parse_failed' });
      throw error;
    }
  };
  const documentsSystemPrompt = loadDocumentsSystemPrompt();
  const classworkSystemPrompt = loadClassworkSystemPrompt();
  const gradeNum = extractGradeNum(grade);
  const limits = getGradeLimits(gradeNum);
  const simBlueprint = resolveSimulationBlueprint(grade, lessonTitle, requirements);

  let requirementsPrompt = '';
  if (requirements && requirements.trim()) {
    requirementsPrompt = `\n【教师教学设想与特别说明（最高优先级，优先遵循）】：\n${requirements.trim()}\n(注：教师输入的特色情境、案例或机房要求拥有最高优先级，任务关卡与仿真器以此为主导设计，不机械套用教材默认情境。)\n`;
  }

  let materialsPrompt = '';
  if (materialsText && materialsText.trim()) {
    materialsPrompt = `\n【教师提供的课本教材与知识点参考资料（请严格以此课文内容、案例与知识点为准）】：\n${materialsText.trim()}\n(请紧扣上述教材原文的知识点、生活情境与案例设计教学任务，严禁脱离教材编造无关概念。)\n`;
  }

  const hasTeacherContext = Boolean(
    (requirements && requirements.trim()) ||
    (materialsText && materialsText.trim()) ||
    (images && Array.isArray(images) && images.length > 0)
  );
  const blueprintDirectivePhase1 = hasTeacherContext
    ? `- 随堂互动作业交互组件参考（⚠️ 教师已提供具体教学设想或课本教材资料！教案、导学单、课件的任务名称与案例必须 100% 依据教师要求与课本原文提炼；下方蓝图仅作机房交互形式参考，若与课本案例不符请直接按课本案例改写，绝不生搬硬套）：`
    : `- 配套随堂互动作业仿真蓝图（教师未上传课本原文或特定设想，请确保教案、导学单、课件的任务名称与该主线保持一致）：`;

  // =========================================================================
  // 阶段 1：生成教学文稿三件套（教案.md、导学案.md、课件.md）
  // =========================================================================
  if (onProgress) {
    onProgress({ progress: 20, progressText: '正在生成教案、导学单与演示课件...' });
  }

  const promptPhase1 = `
请为以下中小学信息科技课程设计前三件套教学资料（教案、导学单、课件）：
- 授课年级：${grade}（${gradeNum}年级）
- 课程课题：${lessonTitle}
${requirementsPrompt || '- 教师补充要求 / 教学意图：无特殊补充，请紧扣浙教版 2026 教材体系与 2022 义务教育信息科技新课标。'}
${materialsPrompt}
- 学段认知与防超纲红线（严格执行）：
  * 当前为 ${gradeNum} 年级，全篇只讲本节课 1 个核心主题，绝不把整单元或多节课内容塞进 40 分钟；
  * ${gradeNum <= 4 ? '小学 3~4 年级：采用具象生活情境、点选归类与直观图表，严禁出现编程代码、复杂二进制运算或高深算法名词。' : gradeNum === 5 ? '小学 5 年级：使用生活大白话、自然语言步骤卡、流程图或直观控制滑块；五年级全学年不学 Python 编程代码，严禁出现编程语言代码、机器学习 KNN 或数学权重公式！' : gradeNum === 6 ? '小学 6 年级：聚焦算法思想、简短直观代码单步观察或开关逻辑（与/或），不考复杂语法死记硬背。' : '初中 7~8 年级：聚焦本课单一核心技术机理的直观体验，不跨单元混塞其它算法，不搞大学公式推导。'}
${blueprintDirectivePhase1}
  【推荐仿真器原型】：${simBlueprint.archetypeName}
  【闯关任务设计】：
  ${simBlueprint.interactiveDesign}
【输出格式与门禁要求】：
请按照以下三个文件标记完整输出，不要省略，保持四份材料任务同源对应：

===FILE: 教案.md===
(遵循教案规范：
1. 正文字数控制在 2000~2800 字（不超过 3200 字，确保 <=4页A4）；取消板书设计与 Mermaid 代码块；
2. 顶部包含 2行4列 课题元数据表（| 课题 | ... | 教材版本 | 浙教版2026 |）；
3. 包含八大公文二级标题：## 一、教材分析 / ## 二、学情分析 / ## 三、教学目标 / ## 四、教学重点 / ## 五、教学难点 / ## 六、教学过程 / ## 七、作业 / ## 八、教学反思；
4. 含生活通俗比喻（用“比作”等词）、启发设问、实操避坑提示；
5. 【六、教学过程】使用四列表格（| 教学环节 | 教师活动 | 学生活动 | 设计意图 |）；
6. 【七、作业】明确包含 1. 导学单 2. 随堂作业 3. 课后探究；【八、教学反思】各设问下方留1条适度手写横线如 ____________________________________________________，不超长折行)

===FILE: 导学案.md===
(遵循导学单规范：
1. 字数门禁：${gradeNum <= 4 ? '小学低年级单面 A4，总有效字数控制在 350~500 字（不超过 520 字）' : '中高年级单面 A4 优先，总有效字数控制在 320~520 字'}；
2. 抬头包含“**班级：**________ **姓名：**________”，取消机房座号；
3. 学生第一人称口语（含“🎯 今日通关目标”、关卡任务与末尾“📊 星级自评打卡”），**严禁出现“四维素养/信息意识/计算思维/数字化学习与创新/信息社会责任/教材分析/学情分析”等教案术语**；
4. 【选择题格式】：题干后留出【我的选择是：(     )】，每个选项独立空行成段，使用 [ ] A. / [ ] B. / [ ] C. 格式；填空横线不超过 20 个下划线字符)

===FILE: 课件.md===
(Marp 16:9 主题 edu-lesson，保持版面清爽、重点突出：
1. 头部 YAML 声明 marp: true, theme: edu-lesson, paginate: true, size: "16:9"；
2. 封面页声明 <!-- _class: lead -->，包含 <span class="tag">年级单元</span>、大标题与副标题；
3. 内容页采用卡片布局（<div class="grid-2">、<div class="card">、<div class="card card-highlight">、<div class="card card-warm">、<div class="callout">）；
4. 卡片内层次清晰（含 <h3> 标题、<ul><li> 条目列表），不裸露未转义的 ** 语法；
5. 保持学生第一视角，**严禁出现“广播听讲/建议用时/教师备注/授课提示”等教师后台台词**)
`;

  // 构建多模态或纯文本消息体
  let userMessagePhase1 = promptPhase1;
  if (images && Array.isArray(images) && images.length > 0) {
    const contentParts = [{ type: 'text', text: promptPhase1 }];
    for (const img of images) {
      if (img.data) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: img.data }
        });
      }
    }
    userMessagePhase1 = contentParts;
  }

  const rawPhase1 = await callLlmApi({
    apiBase,
    apiKey,
    model,
    messages: [
      { role: 'system', content: documentsSystemPrompt },
      { role: 'user', content: userMessagePhase1 }
    ],
    temperature: 0.3,
    onMetadata: diagnostics ? metadata => diagnostics({ type: 'api', phase: 'documents', ...metadata }) : undefined,
    signal
  });

  // 解析并落盘前三件套
  const filesPhase1 = parsePhase(rawPhase1, 'documents');
  validate(filesPhase1, 'documents');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const [filename, fileContent] of Object.entries(filesPhase1)) {
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, fileContent.trim(), 'utf-8');
  }

  // 读取已生成的教案或导学单概要，作为阶段 2 HTML 生成的强咬合上下文
  const planContent = Object.values(filesPhase1).find((_, idx) => Object.keys(filesPhase1)[idx].includes('教案')) || '';
  const worksheetContent = Object.values(filesPhase1).find((_, idx) => Object.keys(filesPhase1)[idx].includes('导学')) || '';
  const slidesContent = Object.values(filesPhase1).find((_, idx) => Object.keys(filesPhase1)[idx].includes('课件')) || '';

  // =========================================================================
  // 阶段 2：基于教案与导学单，专门深度生成“课堂作业.html”（数字化探究舱）
  // =========================================================================
  if (onProgress) {
    onProgress({ progress: 45, progressText: '正在基于教案关卡深度定制微型仿真器与单文件课堂作业...' });
  }

  if (useV2) {
    const prompt = buildV2Prompt({ gradeNum, grade, lessonTitle, requirements, materialsText, planContent, worksheetContent, slidesContent, simBlueprint });
    const raw = await callLlmApi({ apiBase, apiKey, model,
      messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
      temperature: 0.2, signal,
      onMetadata: metadata => diagnostics({ type: 'api', phase: 'classwork-v2', ...metadata })
    });
    try {
      const payload = parseV2Payload(raw);
      const html = assembleClassworkV2(payload, { gradeNum, grade, lessonTitle });
      validateSourceTasks(payload, { planContent, worksheetContent, slidesContent });
      const htmlName = Object.keys(filesPhase1).find(name => name.endsWith('_教案.md')).replace(/_教案\.md$/, '_课堂作业.html');
      // Prepare teacher notes first; an I/O failure must not follow HTML replacement.
      // Plain text does not enter the mature Markdown -> Word compilation path.
      fs.writeFileSync(path.join(targetDir, 'HTML_V2_教师说明.txt'), payload.teacherNotes.join('\n') + '\n', 'utf8');
      const audit = publishClassworkV2(html, path.join(targetDir, htmlName), { signal });
      diagnostics({ type: 'audit', phase: 'classwork-v2', ...audit, legacySanitizerUsed: false });
      return [...Object.keys(filesPhase1), htmlName];
    } catch (error) {
      if (raw) {
        try { fs.writeFileSync(path.join(targetDir, 'HTML_V2_RAW_ERROR.json'), String(raw), 'utf8'); } catch {}
      }
      diagnostics?.({ type: 'integrity', phase: 'classwork-v2', status: 'failed' });
      throw error;
    }
  }

  const { screens: maxScreens, handsOn: maxHandsOn, quiz: maxQuiz, prosePerScreen: maxProse, quizStem: maxQuizStem } = limits;
  const phase2MaterialsBlock = materialsText && materialsText.trim()
    ? `\n- 教师提供的课本教材原文参考（请确保仿真器中的案例、术语与课本原文一致）：\n${materialsText.trim().slice(0, 2000)}\n`
    : '';
  const phase2BlueprintHeader = hasTeacherContext
    ? `- 交互控件与状态机参考（⚠️ 教师已提供教学设想或课本原文，关卡名称与具体情境必须严格对齐【教案/导学单】与【课本教材】，下方蓝图仅提供 JS 交互形式参考）：`
    : `- 本课推荐仿真器蓝图与分层关卡设计（当教师未指定特定仿真形式时以此为准）：`;

  const promptPhase2 = `
请为本课编写配套的【课堂作业.html】单文件离线互动网页，支撑机房课堂 35~40 分钟学生自主动手探究，并与刚才生成的教案、导学单保持任务名称一致。

【课程基本信息】：
- 授课年级：${grade}（${gradeNum}年级）
- 课程课题：${lessonTitle}
${requirementsPrompt}${phase2MaterialsBlock}
${phase2BlueprintHeader}
  * 原型名称：${simBlueprint.archetypeName}
  * 本学期能力定位：${simBlueprint.semesterHint}
  * 关卡设计要求：
${simBlueprint.interactiveDesign}
  * 推荐状态机代码模式：
${simBlueprint.codePatternHint}

- 刚才生成的教案核心内容片段：
${planContent.slice(0, 1800)}

【导学单任务情境】：
${worksheetContent.slice(0, 1000)}

【课堂作业.html 规范与 check_lesson.py 门禁指标】：
0. **教师教学设想与课本教材优先**：
   - 若上方存在【教师教学设想与特别说明】或【课本教材原文参考】，100% 优先围绕教师设想和课本中的真实案例（以及刚才生成的教案/导学单关卡）定制互动任务；
   - 若无特殊说明，则按照上方【本课推荐仿真器蓝图】实现原生 JS 微型仿真器。
1. **单文件纯原生断网运行与页面头部**：
   - 严禁外部网络资源链接（严禁 http://、https://、// 外链 CSS/JS/图片/字体，全部内嵌）；
   - 头部包含：
     <!DOCTYPE html>
     <html lang="zh-CN">
     <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <meta name="lesson-grade" content="${gradeNum}">
     <meta name="lesson-book" content="浙教版2026版${grade}·${lessonTitle}">
     <title>${lessonTitle}｜课堂作业</title>
     <style>
     ${CLASSWORK_BENCHMARK_CSS}
     /* 可在此追加本课微型仿真器所需的专有样式 */
     </style>
     </head>
2. **顶栏导航与闯关步进器（最多 ${maxScreens} 屏，建议设计 ${maxScreens} 屏：3~4年级5屏、5~6年级6屏、7~8年级7屏）**：
   - 使用 <header class="top-bar">，内部包含：
     <div class="brand">
       <h1>${lessonTitle}</h1>
       <span class="h-star" id="starCount">⭐ 0</span>
       <button id="btnSound" class="btn-sound" onclick="toggleSound()">🔊</button>
     </div>
     <div class="stepper" id="stepper"></div>
   - JS 声明：const stepLabels = [...]; 数组元素个数必须与 <section class="panel"> 数量一致（设计 ${maxScreens} 项，上限 ≤ ${maxScreens} 项）；
   - 步进序号从 1 开始编号（1~N），不得显示 0 开头（序号渲染写 (i + 1) 或 index + 1）。
3. **关卡容器 DOM 结构与门禁属性**：
   - 使用 <section class="panel" data-step="i">（i 从 0 连续递增，第 0 屏带 active 类）；
   - **动手实操屏标记 (data-panel-type="hands-on")**：在核心动手仿真关卡 section 标签上添加 \`data-panel-type="hands-on"\`，${gradeNum}年级**最少标记 ${gradeNum >= 5 ? 2 : 2} 个、最多不超过 ${maxHandsOn} 个（3~4年级 2 个 hands-on，5~6年级 2~3 个 hands-on，7~8年级 3 个 hands-on）**；
   - **每屏正文导语字数门禁 (data-prose)**：
     * 每一屏内部有且仅有 1 个核心导语段落标记 \`<p data-prose>...简短导语...</p>\`；
     * ${gradeNum}年级每屏 \`<p data-prose>\` 内的文字**严格 ≤ ${maxProse} 字**；详细的操作提示、故事细节放在不带 data-prose 属性的 \`<div class="tip-box">\` 或卡片内。
4. **学段认知适配与常用交互组件（严禁跨学段超纲）**：
   - **低年级（3~4年级）**：
     * 首关优先采用【原生内联 SVG 640x360 场景寻宝】：使用 \`<div class="scene-wrap"><svg viewBox="0 0 640 360" class="scene-svg">...绘制生活/校园场景矢量元素...</svg><button class="hs" style="left:..%; top:..%;">...</button></div>\` 叠加带呼吸脉冲的热点，点击发现设备加星（\`findHotspot()\`），并配备【💡 给我一点提示】按钮（\`giveHint()\` 抖动热点）；
     * 采用【两步点击法配对与归类（禁止仅靠拖拽）】：左右点击连线配对（\`.sel\` 选中，\`.right\`/\`.wrong\` 反馈）、卡片入箱分类（点卡片 \`.chip.sel\` 再点大盒子 \`.box\`）；
     * 少打字：提供词块选填或单行简短感受，不要求小学生打字写长句子，严禁出现代码与底层术语。
   - **五年级（5年级 · 无代码学段）**：
     * 采用自然语言步骤词块排序与漏步补全、流程图词块插槽、生活分支条件（如果…否则…）切换或恒温阈值滑块；**五年级严禁出现 Python 代码、KNN 算法或神经元权重公式**。
   - **六年级（6年级）**：
     * 采用简短代码单步追踪器（人肉 CPU）、猜数字/枚举步数对比台、双开关串并联电路或闭环反馈调节台。
   - **初中阶段（7~8年级）**：
     * 采用局域网 IP 分配台、传感器折线监控、凯撒密码转盘或 2D 近邻分类画布（**一课只聚焦本课 1 个核心实验台，不跨单元混塞其它算法**）；
   - 核心动手仿真屏内设置**“基础通关任务”**与 \`<div class="challenge-card"><h4>⭐ 进阶挑战星</h4>...</div>\`；
   - 关卡内的随堂巩固单选题支持**“答错温和提示可重选，答对后变绿锁定”**。
5. **交互底座（音效 + 存盘 + Toast + 小助手）**：
   - 在 \`<script>\` 开头内联标准底座：
     * **原生 Web Audio 音效**：\`beep(f, d)\`、\`good()\`、\`bad()\`、\`toggleSound()\`，右上角带声音开关；
     * **LocalStorage 自动存盘**：使用 \`STORAGE_KEY\` 保存学生进度、星星数、测验得分（加 try/catch 容错）；
     * **顶部非阻断 Toast 提示**：页面内置 \`<div id="toast" class="toast"></div>\`，提示调用 \`toast(msg)\`，**全流程严禁调用 alert() / confirm() / prompt()**；
     * **右下角悬浮小助手**：预埋 \`<button class="mascot" onclick="toggleMascot()">🤖</button><div id="mascotBub" class="mascot-bub"></div>\`，点击轮播 5~6 条操作提示。
6. **终极关卡（最后一屏）：达标测验与学习单导出**：
   - **① 随堂测验 (Quiz)**：
     * JS 声明：\`const quiz = [ { q: "题干", options: ["A. ...", "B. ...", "C. ..."], correct: 0, explain: "解析" }, ... ];\`（语句末尾带分号 \`;\`，数组内部各项用逗号 \`,\` 分隔，不在 options 数组后误写分号）；
     * 题数与题干字数：${gradeNum}年级**最多 ${maxQuiz} 道题（建议 ${maxQuiz} 题）**，每道题 \`q:\` 题干字数**严格 ≤ ${maxQuizStem} 字**；
     * 规则：**先选后判**，点击选项只加 \`.picked\` 高亮，点击【✍️ 提交测验并判分】后统一标出 \`.correct\` / \`.wrong\`、锁定列表并展示得分横幅。
   - **② 自我评价打卡**：
     * 包含 3~4 项复选框，**最后一项必须包含“我还没完全懂，需要老师或同伴帮助”字样**。
   - **③ 学习单预览与导出 (.txt)**：
     * 界面提供 \`<div class="report-box" id="reportPreview"></div>\` 预览探究记录；
     * 提供班级 \`#inputClass\` 与姓名 \`#inputName\` 选填框（未填默认使用 \`'${grade}'\` 与 \`'小极客'\`）；
     * 点击【📥 保存学习记录凭单 (.txt)】，通过带 \`\\uFEFF\` BOM 头的 Blob 下载；
     * 凭单首两行满足平台格式：
       \`# 班级|姓名|${lessonTitle}|得分|时间\`
       \`\${cls}|\${name}|${lessonTitle}|\${score}|\${now}\`
       随后追加探究记录（获得的星星数、实验完成情况、测验得分、自评结果）。
7. **代码完整性要求**：
   - 完整 HTML 源码总行数一般为 **550 ~ 900 行**，禁止使用 \`// ...其余同上\` 占位符或省略逻辑。

【输出格式要求】：
请只输出完整的 HTML 代码，直接包含在 ===FILE: 课堂作业.html=== 标记中：

===FILE: 课堂作业.html===
<!DOCTYPE html>
<html lang="zh-CN">
...完整的HTML、样式和脚本...
</html>
`;

  const rawPhase2 = await callLlmApi({
    apiBase,
    apiKey,
    model,
    messages: [
      { role: 'system', content: classworkSystemPrompt },
      { role: 'user', content: promptPhase2 }
    ],
    temperature: 0.2,
    onMetadata: diagnostics ? metadata => diagnostics({ type: 'api', phase: 'classwork', ...metadata }) : undefined,
    signal
  });

  const filesPhase2 = parsePhase(rawPhase2, 'classwork');
  validate(filesPhase2, 'classwork');
  for (const [filename, fileContent] of Object.entries(filesPhase2)) {
    const filePath = path.join(targetDir, filename);
    const finalContent = filename.endsWith('.html')
      ? sanitizeGeneratedClassworkHtml(fileContent, gradeNum, grade, lessonTitle)
      : fileContent.trim();
    if (diagnostics) {
      diagnostics({ type: 'audit', phase: 'classwork', before: auditClasswork(fileContent),
        after: auditClasswork(finalContent), changedByLegacySanitizer: finalContent !== fileContent });
      validate({ [filename]: finalContent }, 'classwork');
    }
    filesPhase2[filename] = finalContent;
    fs.writeFileSync(filePath, finalContent, 'utf-8');
  }

  const allFiles = { ...filesPhase1, ...filesPhase2 };
  return Object.keys(allFiles);
}

/**
 * 剥离大模型可能误套在文件内容最外层的 Markdown 代码块围栏 (```markdown ... ``` 或 ```html ... ```)
 */
function stripOuterCodeFence(text) {
  let s = (text || '').trim();
  const fenceStart = /^```(?:markdown|md|html|yaml)?\s*\r?\n/i;
  const fenceEnd = /\r?\n```\s*$/;
  if (fenceStart.test(s) && fenceEnd.test(s)) {
    s = s.replace(fenceStart, '').replace(fenceEnd, '').trim();
  }
  return s;
}

/**
 * 解析大模型返回的带有 ===FILE: xxx=== 标记的文本
 */
export function parseDelimitedFiles(rawText, grade, lessonTitle) {
  const cleanGrade = (grade || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const cleanTitle = (lessonTitle || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const prefix = cleanGrade ? `${cleanGrade}_${cleanTitle}` : cleanTitle;

  const fileRegex = /===FILE:\s*([^\n\r=]+)===\s*([\s\S]*?)(?====FILE:|$)/g;
  const result = {};
  let match;

  while ((match = fileRegex.exec(rawText)) !== null) {
    const rawName = match[1].trim();
    const content = stripOuterCodeFence(match[2].trim());

    // 格式化标准化文件名：全部带上年级前缀
    let standardName = rawName;
    if (rawName.includes('教案')) {
      standardName = `${prefix}_教案.md`;
    } else if (rawName.includes('导学')) {
      standardName = `${prefix}_导学案.md`;
    } else if (rawName.includes('课件')) {
      standardName = `${prefix}_课件.md`;
    } else if (rawName.includes('作业')) {
      standardName = `${prefix}_课堂作业.html`;
    }

    result[standardName] = content;
  }

  // 兜底检查：如果大模型没有正确遵循 ===FILE: 标记，则尝试提取 html 或抛出错误
  if (Object.keys(result).length === 0) {
    const cleaned = stripOuterCodeFence(rawText);
    if (cleaned.includes('<!DOCTYPE html>') || cleaned.includes('<html')) {
      const standardName = `${prefix}_课堂作业.html`;
      result[standardName] = cleaned;
    } else {
      throw new Error('大模型未按规范输出资料文件标记，请重试');
    }
  }

  return result;
}
