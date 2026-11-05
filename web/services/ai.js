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
 * 按年级提供认知边界红线与推荐通用 UI 交互积木（不按课题名写死具体画面或剧本，把情境与素材自由度 100% 留给教师与教案上下文）
 */
export function resolveSimulationBlueprint(gradeStr, lessonTitle, requirements) {
  const gradeNum = extractGradeNum(gradeStr);
  const semesterHint = getSemesterSimulationHint(gradeStr);
  const title = (lessonTitle || '').trim();
  const req = (requirements || '').trim();

  const gradeToolboxMap = {
    3: {
      guardrail: '小学 3 年级具象感知学段：全篇使用儿童口语大白话，点选操作防手滑，严禁出现编程语言代码、二进制计算、IP/DHCP 网络配置或复杂术语。',
      recommendedBlocks: '【积木① 原生 SVG 640×360 生活场景脉冲热点寻宝】、【积木② 两步点击配对与收纳盒分类（.chip + .box）】、【积木⑤ <input type="range"> 直观参数滑块】或【原生 speechSynthesis 语音朗读对话（带文字气泡同步）】'
    },
    4: {
      guardrail: '小学 4 年级数据与生活编码学段：聚焦身边的数据图表、生活编码规则与黑白像素点阵，严禁出现编程语言代码、凯撒密码算法或高年级网络拓扑。',
      recommendedBlocks: '【积木⑥ Chart.js 动态统计图表（.chart-box 内嵌 canvas，支持 bar/line/pie 切换与 chart.update()）】、【积木④ 原生 CSS Grid 方格点阵涂色板 / 行列 1 的个数奇偶找错格】、【积木② 两步点击分类箱】或【分段下拉框生活编码拼接器】'
    },
    5: {
      guardrail: '小学 5 年级自然语言算法与控制系统学段（⚠️全学年无编程代码）：聚焦把做事步骤说清楚、流程图与分支条件（如果…否则…）、输入-计算-输出三环节，严禁出现 Python/JS 编程语言代码、严禁混入八年级 KNN 近邻或神经网络数学权重公式！',
      recommendedBlocks: '【积木③ 语义化流程图与分支插槽（.flow-col / .flow-node / .flow-cond ❖胶囊判断框 / .flow-branch，支持词块点击填空与 .active-path 路径高亮）】、【积木② 自然语言步骤词块两步点击排序与漏步补全】、【积木⑤ <input type="range"> 环境数值滑块 + DOM 进度条状态灯控制面板】'
    },
    6: {
      guardrail: '小学 6 年级算法初步验证与反馈开关控制学段：聚焦简短代码单步观察、猜数字/枚举效率对比、闭环反馈调节与串并联双开关（与/或）逻辑，不考复杂语法死记硬背。',
      recommendedBlocks: '【代码单步追踪器（.code-line.hl 逐行高亮 + .var-card 变量记事卡更新）】、【积木⑥ Chart.js 算法查找步数对比柱状图（.chart-box）】、【积木⑤ <input type="range"> 闭环反馈偏差调节台】或【双开关串并联（AND/OR）点灯与状态表】'
    },
    7: {
      guardrail: '初中 7 年级互联网、物联网与搜索算法直观体验学段：一课只聚焦本课 1 个核心机理（如传感器课只做时序监控与阈值联动，不混塞迷宫 DFS），不搞大学公式推导。',
      recommendedBlocks: '【积木⑥ Chart.js 传感器实时折线监控图（.chart-box）】、【积木④ 原生 CSS Grid 有序序列二分查找收缩条 / 方格迷宫 DFS 单步探路染色与回溯网格】、【积木③ .flow-* 局域网拓扑节点与 IP 分配排障面板】或【HTML 标签实时预览窗】'
    },
    8: {
      guardrail: '初中 8 年级网页数据组织、密码安全与 AI 典型方法体验学段：一课只聚焦本课 1 个核心实验台，直观展现数据流转或分类决策过程，不堆砌高深数学推导。',
      recommendedBlocks: '【积木⑥ Chart.js 二维散点图（type: "scatter"）KNN 近邻投票画布或网页数据可视化看板（.chart-box）】、【积木③ .flow-* 网页 DOM 节点树或三层神经网络特征加权连线面板】、【凯撒密码移位映射转盘】或【原生 speechSynthesis 语速音调合成实验台】'
    }
  };

  const profile = gradeToolboxMap[gradeNum] || gradeToolboxMap[3];
  const archetypeName = req
    ? `${gradeStr}·《${title || '本课主题'}》教师定制情境探究舱`
    : `${gradeStr}·《${title || '本课主题'}》交互式探究实验台`;

  const interactiveDesign = `
        - 学段防超纲红线：${profile.guardrail}
        - 关卡1（破冰感知与概念配对）：紧扣《${title || '本课'}》教案导入情境或课本案例，采用【SVG 场景脉冲热点寻宝】或【两步点击配对/分类箱】完成具象认知破冰；
        - 关卡2（基础核心实操 · data-panel-type="hands-on"）：严格对齐本课教案与导学单的核心任务，从本学段推荐交互积木（${profile.recommendedBlocks}）中选择最契合的组件搭建动手实验台（必须有实时可交互的状态变化，严禁退化为纯文字选择题）；
        - 关卡3（进阶调试与迁移应用 · data-panel-type="hands-on"）：基于同一课题主线设计参数调节、异常数据/错误步骤排雷或方案对比实验，包含基础通关任务与 ⭐ 进阶挑战星。`.trim();

  const codePatternHint = `
        let stage1Done = false, handsOnBasicEver = false, handsOnStarEver = false;
        function markHandsOnProgress(isStar) {
          handsOnBasicEver = true;
          if (isStar) handsOnStarEver = true;
        }`.trim();

  return {
    gradeNum,
    semesterHint,
    gradeGuardrail: profile.guardrail,
    recommendedBlocks: profile.recommendedBlocks,
    hasCustomRequirements: Boolean(req),
    customRequirementsText: req,
    archetypeName,
    interactiveDesign,
    codePatternHint
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
  /* Chart.js 防拉长固定高度容器 */
  .chart-box {
    position: relative; width: 100%; height: 260px; margin: 14px 0;
    background: #FFFFFF; border: 1px solid var(--border); border-radius: 12px; padding: 12px;
  }
  /* 语义化流程图与分支树样式类（判断框 .flow-cond 采用 ❖ 胶囊切角框，避免斜边裁切词块按钮） */
  .flow-col { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 16px 0; }
  .flow-arrow { font-size: 18px; font-weight: 900; color: #7F8C8D; line-height: 1.1; user-select: none; }
  .flow-arrow.active-path { color: var(--accent); transform: scale(1.15); }
  .flow-node {
    background: #F8FAFC; border: 2px solid #94A3B8; border-radius: 12px;
    padding: 10px 20px; min-width: 180px; max-width: 100%; text-align: center;
    font-size: 15px; font-weight: 700; color: var(--text-main); transition: all 0.25s ease;
  }
  .flow-node.start-end { border-radius: 999px; background: #EBF4EC; border-color: var(--primary); color: var(--primary); }
  .flow-cond {
    background: #FFFDF5; border: 2.5px solid #F39C12; border-radius: 16px;
    padding: 10px 22px; min-width: 210px; max-width: 100%; text-align: center;
    font-size: 15px; font-weight: 800; color: #B9770E;
    box-shadow: inset 0 0 0 2px rgba(243, 156, 18, 0.18); transition: all 0.25s ease;
  }
  .flow-cond::before { content: "❖ 判断："; font-weight: 900; color: #D35400; margin-right: 4px; }
  .flow-node.active-path, .flow-cond.active-path {
    border-color: var(--accent); background: #EDF7EC; color: #1E5128;
    box-shadow: 0 0 14px rgba(78, 159, 61, 0.35); transform: translateY(-1px);
  }
  .flow-branch {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; max-width: 640px;
    margin: 6px 0; padding: 12px; border-top: 2px dashed #CBD5E1; border-bottom: 2px dashed #CBD5E1;
  }
  .flow-branch-col { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .flow-badge {
    display: inline-block; font-size: 12px; font-weight: 800; padding: 2px 10px;
    border-radius: 999px; background: #E2E8F0; color: #475569;
  }
  .flow-badge.yes { background: #D4EDDA; color: #1E5128; }
  .flow-badge.no { background: #FDEDEC; color: #C0392B; }
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

  // 10. 按需幂等内联本地 Chart.js 库（检测到 new Chart( 或 Chart. 时内联至 </head> 前，并注入切屏重排 resize 钩子）
  if (/\bnew\s+Chart\s*\(|\bChart\./.test(html) && !/<script\b[^>]*\bdata-local-lib=["']chart\.js["']/i.test(html)) {
    // 清理大模型可能误写的外部 Chart.js script 标签
    html = html.replace(/<script\b[^>]*\bsrc=["'][^"']*chart[^"']*["'][^>]*>\s*<\/script>\s*/gi, '');
    const chartLibPath = path.join(rootDir, 'resources', 'libs', 'chart.umd.min.js');
    if (fs.existsSync(chartLibPath)) {
      const chartLibCode = fs.readFileSync(chartLibPath, 'utf-8').trim();
      const resizeHookCode = `;(function(){if(typeof window==="undefined"||typeof document==="undefined")return;function r(){requestAnimationFrame(function(){setTimeout(function(){window.dispatchEvent(new Event("resize"));if(window.Chart&&window.Chart.instances){Object.values(window.Chart.instances).forEach(function(c){if(c&&typeof c.resize==="function"){try{c.resize();}catch(e){}}});}},20);});}document.addEventListener("click",function(e){if(e.target&&e.target.closest&&e.target.closest(".step-node,.footer-nav .btn,[data-step]"))r();});})();`;
      const inlineTag = `<script data-local-lib="chart.js">\n${chartLibCode}\n${resizeHookCode}\n</script>`;
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${inlineTag}\n</head>`);
      } else {
        html = `${inlineTag}\n${html}`;
      }
    }
  }

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
4. **学段认知适配与 6 种通用交互积木（UI Patterns，严禁跨学段超纲或退化为纯文字选择题）**：
   - 请围绕【本课教案/导学单的具体任务】灵活组合以下通用积木，不要生搬硬套无关剧本：
     * **积木① 原生 SVG 640×360 场景寻宝**：使用 \`<div class="scene-wrap"><svg viewBox="0 0 640 360" class="scene-svg">...</svg><button class="hs" style="left:..%; top:..%;">...</button></div>\` 叠加脉冲热点，点击发现加星并配【💡 给我一点提示】（\`giveHint()\` 抖动热点）；
     * **积木② 两步点击配对与收纳盒归类（防机房拖拽手滑）**：左右点击配对（\`.sel\` 选中，\`.right\`/\`.wrong\` 反馈）、词块卡片入箱或步骤排序（先点 \`.chip.sel\` 再点 \`.box\`）；
     * **积木③ 语义化流程图与分支树插槽**：直接使用预置 CSS 类 \`<div class="flow-col"><div class="flow-node start-end">开始</div><div class="flow-arrow">↓</div><div class="flow-cond">条件词块槽</div><div class="flow-branch"><div class="flow-branch-col"><span class="flow-badge yes">是</span><div class="flow-node">分支A</div></div><div class="flow-branch-col"><span class="flow-badge no">否</span><div class="flow-node">分支B</div></div></div></div>\`，切换滑块或条件时为对应节点加 \`.active-path\` 高亮（不要对判断框使用 rotate(45deg) 以免裁切文字）；
     * **积木④ 原生 CSS Grid 方格点阵 / 奇偶校验 / 寻路步进网格**：使用 CSS Grid + \`<button>\` 渲染 0/1 像素矩阵、有序查找序列或迷宫网格；
     * **积木⑤ \`<input type="range">\` 滑块与状态过渡仿真**：配合 DOM 进度条与 CSS transition 实时展示亮度/音量/温度阈值/反馈水位的动态变化；
     * **积木⑥ \`Chart.js\` 动态图表（系统会自动按需内联本地 \`chart.umd.min.js\`，严禁写外链 \`<script src=...>\`）**：凡涉及数据统计（bar/line/pie）、物联网传感器监控折线、算法步数对比或 KNN 二维散点图（scatter），在 HTML 中写 \`<div class="chart-box"><canvas id="myChart"></canvas></div>\`，并在 JS 中直接调用 \`new Chart(ctx, { type: '...', data: {...}, options: { responsive: true, maintainAspectRatio: false } })\` 及 \`chart.update()\`；
     * **原生语音朗读（可选，适合智能对话/语音合成课）**：直接调用 \`window.speechSynthesis\`，调用前先执行 \`window.speechSynthesis.cancel()\` 防连点堆积，外包 \`try { ... } catch(e) {}\`，并在页面对话气泡中同步显示朗读文字（兼容无耳机机房）。
   - **学段防超纲红线**：${simBlueprint.gradeGuardrail}
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
