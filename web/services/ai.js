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

// V1 uses its frozen baseline; V2 reads the main Skill and loads module 4 by stage.
function loadSystemPrompt(useV2 = false) {
  const skillPath = useV2
    ? path.join(rootDir, 'skills', 'it-lesson-studio', 'SKILL.md')
    : path.join(rootDir, 'resources', 'prompts', 'legacy-skill-v1.md');
  if (fs.existsSync(skillPath)) {
    const text = fs.readFileSync(skillPath, 'utf-8');
    return useV2 ? text.slice(0, text.indexOf('### 模块四：')) : text;
  }
  return '你是一位中小学信息科技特级教师，擅长设计教案、导学单、课件和随堂作业。';
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
    '三年级上册': '部件高亮解剖台、虚拟浏览器下载排雷沙箱、文件分类拖拽/点选箱（侧重感知智能与在线入门，大触控、强正向反馈）',
    '三年级下册': '图片滤镜裁剪滑块、音频波形淡入淡出调节、AI提示词联想生成台（侧重多媒体处理与AI初体验）',
    '四年级上册': '二进制开关灯泡阵列、条形码/编码生成器、动态统计图表调节（侧重数据表示与生活编码）',
    '四年级下册': '像素点阵取色板、ASCII 编码对照转盘、奇偶校验排雷矩阵（侧重数字化底层与校验）',
    '五年级上册': '流程图卡片拼图槽、红绿灯/道闸分支条件切换器、生活决策树（侧重算法思维与流程图分支结构）',
    '五年级下册': '恒温箱/自动浇花阈值仿真沙箱、循环计数累加步进器（侧重控制系统与循环结构）',
    '六年级上册': '单步代码追踪器（人肉CPU）、二分猜数字对战台、枚举步进观察表（侧重代码实现与经典算法）',
    '六年级下册': '双开关串并联逻辑门电路（与/或/非）、水箱水位闭环反馈调节沙箱（侧重反馈控制与逻辑运算）',
    '七年级上册': '局域网拓扑连线与 IP 分配器、数据包逐跳路由动画、HTML标签实时预览台（侧重网络底层与拓扑搭建）',
    '七年级下册': '传感器折线波动监控台、迷宫 DFS/BFS 寻路步进回溯动画器（侧重物联网与图搜索算法）',
    '八年级上册': '凯撒密码移位加密转盘、网页 DOM 树节点探针、密码散列防伪实验室（侧重DOM数据与密码安全）',
    '八年级下册': '2D 平面 KNN 动态分类面（点击加点动态重绘边界）、图像卷积核滤波观察台、神经网络权重调节器（侧重AI原理级拆解）'
  };
  for (const [k, v] of Object.entries(map)) {
    if (g.includes(k) || g.includes(k.replace('册', ''))) {
      return v;
    }
  }
  return '卡片磁吸连线配对、核心概念微型解剖台、参数调节与单步流程预演沙箱';
}

/**
 * 智能识别课题课型与定制仿真蓝图（支持教师自定义设想最高优先级 + 课题关键词精准匹配 + 12册学期兜底）
 */
export function resolveSimulationBlueprint(gradeStr, lessonTitle, requirements) {
  const gradeNum = extractGradeNum(gradeStr);
  const semesterHint = getSemesterSimulationHint(gradeStr);
  const title = (lessonTitle || '').trim();
  const req = (requirements || '').trim();
  const combined = `${title} ${req}`;

  // 课型特征匹配库（按课题关键词精准命中具体仿真器原型与状态机方案）
  const archetypes = [
    {
      match: /校验|奇偶|解码|点阵|像素|图像编码|字符编码|ASCII/i,
      archetypeName: '数字化编码点阵与奇偶校验排雷沙箱',
      interactiveDesign: `
        - 关卡1（感知配对）：生活中的编码与数字媒介双列配对；
        - 关卡2（像素/编码解剖台）：5×5 或 8×8 像素点阵网格与 0/1 二进制编码双向联动（点击格子切换黑白并实时刷新二进制行编码）；
        - 关卡3（核心实操 · data-panel-type="hands-on"）：【奇偶校验排雷矩阵 / 编码译码器】包含基础任务（定位并修复传输翻转的错误位，使每行每列 1 的个数恢复偶校验平衡）与 ⭐进阶挑战星（自主设计一组带校验位的 8 位编码并验证抗干扰能力）。`,
      codePatternHint: `
        // 像素点阵/奇偶校验网格点击翻转状态机示例
        let gridFixedEver = false;
        function toggleGridCell(r, c, targetR, targetC, el) {
          el.textContent = el.textContent === '1' ? '0' : '1';
          el.classList.toggle('on', el.textContent === '1');
          if (r === targetR && c === targetC && el.textContent === '1') {
            gridFixedEver = true;
          }
        }`
    },
    {
      match: /编码|二进制|有序|数据计算|图表|图标呈现|数据整理|数据获取/i,
      archetypeName: '二进制灯泡权值阵列与生活编码定制沙箱',
      interactiveDesign: `
        - 关卡1（痛点体验）：杂乱无序数据 vs 规范编码检索效率对比配对；
        - 关卡2（二进制灯泡阵列）：4位（8-4-2-1）开关灯泡点击翻转，实时计算算式与十进制总和；
        - 关卡3（核心实操 · data-panel-type="hands-on"）：【编码规则制定与生成器】通过下拉框/数字段拼装唯一编码（如区域码+类别码+序号），包含基础任务（按规则生成指定物品编码）与 ⭐进阶挑战星（排查冲突编码或扩容编码位数）。`,
      codePatternHint: `
        // 8-4-2-1 二进制灯泡翻转状态机示例
        const bits = [0, 0, 0, 0], weights = [8, 4, 2, 1];
        let binSolvedEver = false;
        function flipBit(i, targetDec) {
          bits[i] = bits[i] ? 0 : 1;
          const sum = bits.reduce((a, b, idx) => a + b * weights[idx], 0);
          if (sum === targetDec) binSolvedEver = true;
        }`
    },
    {
      match: /流程图|顺序结构|分支|双分支|决策|判断/i,
      archetypeName: '流程图词块拼图槽与分支条件（if-else）动态仿真器',
      interactiveDesign: `
        - 关卡1（要素识别）：自然语言步骤与流程图标准图形符号（起止框、处理框、判断菱形框、流程线）配对；
        - 关卡2（流程图拼图槽 · data-panel-type="hands-on"）：点击备选词块填入虚线判断框与分支处理框，完成算法流程图建模；
        - 关卡3（分支条件仿真沙箱 · data-panel-type="hands-on"）：拖动传感器数值滑块（如体温/身高/车牌/电量），实时高亮流程图【是(Y) / 否(N)】执行路径，包含基础通关（覆盖双分支测试）与 ⭐进阶挑战星（修正边界阈值漏洞，如包含临界值 >= 与 > 的区别）。`,
      codePatternHint: `
        // 分支条件双路径覆盖状态机示例
        let branchTrueEver = false, branchFalseEver = false, branchAllEver = false;
        function testBranchInput(val, threshold) {
          const ok = val >= threshold;
          if (ok) branchTrueEver = true; else branchFalseEver = true;
          if (branchTrueEver && branchFalseEver) branchAllEver = true;
        }`
    },
    {
      match: /恒温|控制系统|输入|输出|查表|循环结构|系统/i,
      archetypeName: '输入-计算-输出闭环阈值沙箱与循环累加步进器',
      interactiveDesign: `
        - 关卡1（系统拆解）：控制系统三大环节（输入传感器 ➔ 控制器计算 ➔ 输出执行器）磁吸配对；
        - 关卡2（核心实操 · data-panel-type="hands-on"）：【恒温箱/智能浇花阈值控制仿真台】设定目标阈值，调节环境温度/湿度滑块，实时观察三环节状态灯与执行器动作；
        - 关卡3（进阶演练）：循环检测计数累加步进器 + ⭐进阶挑战星（排查阈值死区或循环终止条件异常）。`,
      codePatternHint: `
        // 阈值控制系统仿真状态机示例
        let ctrlHighEver = false, ctrlLowEver = false, ctrlDoneEver = false;
        function runControlLoop(envVal, limitVal) {
          const trigger = envVal < limitVal;
          if (trigger) ctrlLowEver = true; else ctrlHighEver = true;
          if (ctrlLowEver && ctrlHighEver) ctrlDoneEver = true;
        }`
    },
    {
      match: /与运算|或运算|开关量|连续量|反馈|扩音/i,
      archetypeName: '双开关串并联逻辑门电路（AND/OR）与闭环反馈沙箱',
      interactiveDesign: `
        - 关卡1（概念辨析）：生活中的连续量（温度具体数值、音量大小）与开关量（红绿灯、门禁开闭）分类配对；
        - 关卡2（逻辑门电路与真值表 · data-panel-type="hands-on"）：点击切换开关 A（0/1）与开关 B（0/1），实时高亮串联（与运算 AND）或并联（或运算 OR）电流路径，并自动点亮右侧真值表（Truth Table）4 种状态行；
        - 关卡3（综合挑战 · data-panel-type="hands-on"）：多条件安全联锁控制拼装 + ⭐进阶挑战星（组合双条件触发报警器）。`,
      codePatternHint: `
        // 逻辑门电路与真值表自动验证状态机示例
        let swA = 0, swB = 0, comboSet = new Set(), gateAllEver = false;
        function toggleSwitch(which, isAnd) {
          if (which === 'A') swA = swA ? 0 : 1; else swB = swB ? 0 : 1;
          const out = isAnd ? (swA & swB) : (swA | swB);
          comboSet.add(swA + '_' + swB);
          if (comboSet.size >= 4) gateAllEver = true;
        }`
    },
    {
      match: /算法的执行|程序设计|Python|韩信点兵|枚举|猜数字|二分|算法实现|算法的效率/i,
      archetypeName: '人肉 CPU 单步代码追踪器与代码排雷/二分效率对战台',
      interactiveDesign: `
        - 关卡1（算力破冰）：手动试算 vs 计算机一键高速运行对比体验；
        - 关卡2（人肉 CPU 单步追踪 · data-panel-type="hands-on"）：代码行逐行高亮（.code-line.hl）+ 变量实时监控卡（.var-card）+ 上一步/下一步/连播控制；
        - 关卡3（代码排雷与逻辑再造 · data-panel-type="hands-on"）：排查大小写/全角符号/缩进报错，或补全关键判断表达式 + ⭐进阶挑战星（测试无解边界或对比顺序枚举与二分查找步数）。`,
      codePatternHint: `
        // 单步代码追踪器状态机示例
        let traceIdx = 0, traceDoneEver = false;
        function stepCpu(steps, dir) {
          traceIdx = Math.max(0, Math.min(steps.length - 1, traceIdx + dir));
          if (traceIdx === steps.length - 1) traceDoneEver = true;
        }`
    },
    {
      match: /网络|TCP|IP|DHCP|协议|路由|网页|HTML|云计算|云存储/i,
      archetypeName: '小型局域网拓扑 IP/DHCP 分配器与数据包逐跳路由沙箱',
      interactiveDesign: `
        - 关卡1（网络设备与协议配对）：光猫、路由器、交换机、终端及 HTTP/TCP/IP 职责配对；
        - 关卡2（IP 地址与 DHCP 分配排障台 · data-panel-type="hands-on"）：为局域网终端配置 192.168.1.x 网段 IP（实时检测 IP 冲突与 >255 越界错误），对比手动静态配置与 DHCP 自动分配；
        - 关卡3（数据包逐跳路由 / HTML 实时预览 · data-panel-type="hands-on"）：点击发送 Ping 测试包观察逐跳路由转发，或微调 HTML 标签属性实时渲染网页预览 + ⭐进阶挑战星。`,
      codePatternHint: `
        // IP 地址合法性与冲突检测状态机示例
        let netConfigEver = false;
        function verifyHostIp(lastOctet, usedOctets) {
          const n = Number(lastOctet);
          const ok = Number.isInteger(n) && n >= 2 && n <= 254 && !usedOctets.includes(n);
          if (ok) netConfigEver = true;
          return ok;
        }`
    },
    {
      match: /物联网|传感器|无线通信|深度优先|DFS|搜索算法|物联系统/i,
      archetypeName: '物联网传感器实时折线监控台与迷宫 DFS 步进回溯动画器',
      interactiveDesign: `
        - 关卡1（感知层-网络层-应用层架构配对）：传感器类型与物联应用场景配对；
        - 关卡2（传感器折线波动监控与阈值联动 · data-panel-type="hands-on"）：模拟采集环境数据绘制动态折线，设置告警阈值触发 MQTT 指令反馈；
        - 关卡3（算法深潜 · data-panel-type="hands-on"）：网格迷宫 DFS 深度优先搜索（前进探索入栈染色 + 死胡同回溯 Backtrack 动画）或物联调试 + ⭐进阶挑战星。`,
      codePatternHint: `
        // 步进探索与回溯状态机示例
        let dfsStep = 0, dfsCompleteEver = false;
        function nextDfsFrame(frames) {
          dfsStep = Math.min(frames.length - 1, dfsStep + 1);
          if (dfsStep === frames.length - 1) dfsCompleteEver = true;
        }`
    },
    {
      match: /加密|解密|凯撒|备份|安全|身份认证|网页的数据|DOM/i,
      archetypeName: '凯撒密码移位加密转盘、暴力枚举破译与散列防伪实验室',
      interactiveDesign: `
        - 关卡1（明文-密钥-密文要素辨析）：古典密码与现代数据安全防护手段配对；
        - 关卡2（凯撒密码移位转盘 · data-panel-type="hands-on"）：调节偏移密钥 Key (1~25)，实时观察明文字母与密文字母映射轮盘，亲手解密截获的密文情报；
        - 关卡3（Python 暴力穷举破译与防伪校验 · data-panel-type="hands-on"）：修补解密代码关键表达式，一键穷举 25 种密钥还原口令 + ⭐进阶挑战星（篡改 1 个字符观察 Hash 散列值雪崩变化）。`,
      codePatternHint: `
        // 凯撒密码移位转盘状态机示例
        let cipherCrackedEver = false;
        function caesarShift(str, shift) {
          return str.replace(/[A-Za-z]/g, ch => {
            const base = ch <= 'Z' ? 65 : 97;
            return String.fromCharCode(((ch.charCodeAt(0) - base + shift + 26) % 26) + base);
          });
        }`
    },
    {
      match: /机器学习|监督学习|无监督|K近邻|KNN|神经网络|卷积|图像识别|语音|自然语言|多模态/i,
      archetypeName: '2D 平面 KNN 动态分类画布与神经网络/卷积核特征提取台',
      interactiveDesign: `
        - 关卡1（AI 技术与范式配对）：监督学习（有标签训练）、无监督学习（聚类）与典型生活应用配对；
        - 关卡2（2D 平面 KNN 动态分类面 / 卷积核观察台 · data-panel-type="hands-on"）：点击 SVG 坐标平面放置待测样本点，调节超参数 K=1/3/5，实时绘制最近 K 个邻居连线、计算欧氏距离并投票分类；
        - 关卡3（神经元权重调参 / 特征调优 · data-panel-type="hands-on"）：调节特征权重 w1, w2 与阈值 b 观察分类准确率变化 + ⭐进阶挑战星（探究 K 值过大或过小对边界样本分类的影响）。`,
      codePatternHint: `
        // 2D KNN 欧氏距离计算与投票状态机示例
        let knnRunEver = false;
        function runKnnVote(px, py, k, points) {
          const nearest = points.map(p => ({ ...p, dist: Math.hypot(p.x - px, p.y - py) }))
                                .sort((a, b) => a.dist - b.dist).slice(0, k);
          knnRunEver = true;
          return nearest;
        }`
    },
    {
      match: /图像|音频|视频|媒体|智能生成|智能处理|智能辅助|数字作品/i,
      archetypeName: '多媒体参数滑块调节台与 AI 提示词（Prompt）配方合成器',
      interactiveDesign: `
        - 关卡1（媒体类型与扩展名分类箱）：将 .jpg/.png、.mp3/.wav、.mp4、.txt 归入对应数字资源分类箱；
        - 关卡2（图像滤镜/音频波形实时调节台）：拖动亮度、对比度、裁剪比例或音量淡入淡出滑块，实时预览媒体处理效果；
        - 关卡3（AI 提示词配方生成台 · data-panel-type="hands-on"）：组合【主体角色 + 场景动作 + 艺术风格 + 光影细节】提示词芯片，驱动画布生成精美数字作品 + ⭐进阶挑战星。`,
      codePatternHint: `
        // 多媒体滑块与 Prompt 合成状态机示例
        let mediaEditedEver = false;
        function applyMediaParams(bright, contrast) {
          if (bright >= 105 && contrast >= 105) mediaEditedEver = true;
        }`
    }
  ];

  let matched = archetypes.find(a => a.match.test(combined));
  if (!matched) {
    matched = {
      archetypeName: `${gradeStr}核心概念解剖台与交互式参数仿真沙箱`,
      interactiveDesign: `
        - 关卡1（情境探索与概念配对）：紧扣《${title}》生活情境设计双列点击/连线配对；
        - 关卡2（核心机理微解剖台）：点击核心模块/部件槽位高亮发光，展示拟人化生活比喻与随堂即时巩固问答（答错温和提示可无限重选，答对锁定）；
        - 关卡3（深度动手仿真沙箱 · data-panel-type="hands-on"）：结合本学期能力范式（${semesterHint}），提供参数调节、步骤推演或键鼠实操模拟，包含基础通关与 ⭐进阶挑战星。`,
      codePatternHint: `
        // 通用仿真完成度累计状态变量
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
  .badge-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px; margin: 16px 0;
  }
  .badge-card {
    background: #F8F9FA; border: 2px dashed #DCDDE1; border-radius: 12px;
    padding: 12px; text-align: center; transition: all 0.2s ease;
  }
  .badge-card.unlocked {
    background: #FFFDF5; border: 2px solid #F39C12; box-shadow: 0 4px 12px rgba(243, 156, 18, 0.15);
  }
  .badge-icon { font-size: 32px; filter: grayscale(100%); opacity: 0.4; }
  .badge-card.unlocked .badge-icon { filter: none; opacity: 1; }
  .badge-name { font-size: 14px; font-weight: 800; margin-top: 4px; color: var(--text-main); }
  .badge-card.unlocked .badge-name { color: #D35400; }
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
  /* 奖状卡片模态 */
  .cert-modal {
    display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); z-index: 200; align-items: center; justify-content: center; padding: 20px;
  }
  .cert-card {
    background: #FFFDF9; border: 8px solid #F1C40F; border-radius: 20px;
    max-width: 500px; width: 100%; padding: 30px; text-align: center;
    box-shadow: 0 20px 50px rgba(0,0,0,0.4); animation: zoomCert 0.3s ease; position: relative;
  }
  @keyframes zoomCert { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
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
  const systemPrompt = loadSystemPrompt(useV2);
  const gradeNum = extractGradeNum(grade);
  const limits = getGradeLimits(gradeNum);
  const simBlueprint = resolveSimulationBlueprint(grade, lessonTitle, requirements);

  let requirementsPrompt = '';
  if (requirements && requirements.trim()) {
    requirementsPrompt = `\n【🚨 教师教学设想与特别说明（最高优先级，必须100%优先遵循）】：\n${requirements.trim()}\n(特别声明：教师输入的特色情境、专属案例或机房特别要求拥有最高优先级，所有任务关卡与微型仿真器必须以此为主导量身定制，严禁机械套用教材默认情境！)\n`;
  }

  let materialsPrompt = '';
  if (materialsText && materialsText.trim()) {
    materialsPrompt = `\n【教师自主上传/提供的课本教材与知识点参考资料】：\n${materialsText.trim()}\n(请务必参考并吸收上述教材知识点与案例，融入到教学任务与活动设计中)\n`;
  }

  // =========================================================================
  // 阶段 1：生成教学文稿三件套（教案.md、导学案.md、课件.md）
  // =========================================================================
  if (onProgress) {
    onProgress({ progress: 20, progressText: '教学引擎正在构思教案、导学单与演示课件...' });
  }

  const promptPhase1 = `
请为以下中小学信息科技课程设计前三件套教学资料（教案、导学单、课件）：
- 授课年级：${grade}（${gradeNum}年级）
- 课程课题：${lessonTitle}
${requirementsPrompt || '- 教师补充要求 / 教学意图：无特殊补充，请严格紧扣浙教版 2026 最新教材体系与 2022 义务教育信息科技新课标。'}
- 配套随堂互动作业（数字化探究舱）仿真蓝图（请确保教案、导学单、课件的任务设计与该仿真主线 100% 同源呼应）：
  【推荐仿真器原型】：${simBlueprint.archetypeName}
  【闯关任务设计】：
  ${simBlueprint.interactiveDesign}
${materialsPrompt}
【输出格式与门禁强制要求】：
必须严格按照以下三个文件标记完整输出，严禁省略，保证四位一体任务同源呼应：

===FILE: 教案.md===
(严格遵循教案规范：
1. 正文字数严格控制在 2000~2800 字（绝对不超过 3200 字，确保 <=4页A4）；彻底取消板书设计与 Mermaid 代码块；
2. 顶部必须包含 2行4列 课题元数据表（| 课题 | ... | 教材版本 | 浙教版2026 |）；
3. 必须完整包含八大标准公文二级标题：## 一、教材分析 / ## 二、学情分析 / ## 三、教学目标 / ## 四、教学重点 / ## 五、教学难点 / ## 六、教学过程 / ## 七、作业 / ## 八、教学反思；
4. 含生活通俗比喻（用“比作”等词）、真实启发设问、实操避坑锦囊三大支架；
5. 【六、教学过程】必须使用四列精排表格（| 教学环节 | 教师活动 | 学生活动 | 设计意图 |）；
6. 【七、作业】明确包含 1. 导学单 2. 随堂作业 3. 课后探究；【八、教学反思】各设问下方只留1条适度手写横线如 ____________________________________________________，严禁超长折行)

===FILE: 导学案.md===
(严格遵循导学单规范：
1. 字数门禁：${gradeNum <= 4 ? '小学低年级严格单面 A4，总有效字数控制在 350~500 字（绝不超过 520 字！）' : '中高年级单面 A4 优先，总有效字数控制在 320~520 字'}；
2. 抬头必须包含“**班级：**________ **姓名：**________”，取消机房座号；
3. 纯净学生第一人称趣味语境（含“🎯 今日通关目标”、关卡任务与末尾“📊 星级自评打卡”），**绝对严禁出现“四维素养/信息意识/计算思维/数字化学习与创新/信息社会责任/教材分析/学情分析”等教案学术套话**！
4. 【选择题铁律】：题干后留出【我的选择是：(     )】，每个选项独立空行成段，严格使用 [ ] A. / [ ] B. / [ ] C. 格式；填空横线严禁超过 20 个下划线字符)

===FILE: 课件.md===
(Marp 16:9 主题 edu-lesson。严禁大白屏与干瘪文字！必须达到省特级教师大屏课件视觉水准：
1. 头部 YAML 声明 marp: true, theme: edu-lesson, paginate: true, size: "16:9"；
2. 封面页必须声明 <!-- _class: lead -->，包含 <span class="tag">年级单元</span>、大标题与副标题；
3. 内容页全量采用卡片式大屏布局（<div class="grid-2">、<div class="card">、<div class="card card-highlight">、<div class="card card-warm">、<div class="callout">）；
4. 卡片内层次分明（含 <h3> 标题、<ul><li> 条目列表），严禁裸露未转义的 ** 语法；
5. 纯净学生第一视角，**绝对严禁出现“广播听讲/建议用时/教师备注/授课提示”等教师后台台词**！)
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
      { role: 'system', content: systemPrompt },
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
    const prompt = buildV2Prompt({ gradeNum, grade, lessonTitle, requirements, planContent, worksheetContent, slidesContent, simBlueprint });
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

  const promptPhase2 = `
你现在需要为本课专门编写配套的【课堂作业.html】单文件离线“数字化探究舱 (Inquiry Workspace)”应用。
必须支撑机房课堂 35~40 分钟学生动手探究，并与刚才生成的教案、导学单实现 100% 任务同源咬合！

【课程基本信息】：
- 授课年级：${grade}（${gradeNum}年级）
- 课程课题：${lessonTitle}
${requirementsPrompt}
- 本课专属仿真器蓝图与分层关卡设计（当教师未指定特定仿真形式时以此为准）：
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

【🚨 课堂作业.html 核心规范与 check_lesson.py 自动化门禁硬指标（必须 100% 遵守！）】：
0. **教师个性化教学设想绝对优先**：
   - 若上方存在【教师教学设想与特别说明】，必须 100% 优先围绕教师设想的特色情境、案例与交互需求量身定制仿真沙箱！
   - 若无特殊说明，则严格按照上方【本课专属仿真器蓝图】实现高可玩性的原生 JS 微型仿真器。
1. **单文件纯原生断网运行**：
   - 严禁任何外部网络资源链接（严禁 http://、https://、// 外链 CSS/JS/图片/字体，全部内嵌）；
   - 头部必须包含：
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
2. **顶栏导航与闯关步进器（严格 ${maxScreens} 屏）**：
   - 必须使用 <header class="top-bar">，内部包含 <div class="brand"> 和 <div class="stepper" id="stepper"></div>；
   - JS 必须声明：const stepLabels = [...]; 且数组元素个数**必须严格等于 ${maxScreens} 项**！
3. **关卡容器 DOM 结构与门禁属性（极其重要！）**：
   - 必须严格使用 ${maxScreens} 个 <section class="panel" data-step="i">（i 从 0 到 ${maxScreens - 1} 严格连续递增，第 0 屏带 active 类）；
   - **动手实操屏标记 (data-panel-type="hands-on")**：在最核心的动手仿真关卡 section 标签上添加 \`data-panel-type="hands-on"\`，${gradeNum}年级**最少标记 1 个、最多绝不超过 ${maxHandsOn} 个**！
   - **每屏正文导语字数门禁 (data-prose)**：
     * 每一屏（从 data-step="0" 到 data-step="${maxScreens - 1}"）内部必须有且仅有 1 个核心导语段落标记 \`<p data-prose>...简短导语...</p>\`；
     * 🚨 字数红线：${gradeNum}年级每屏 \`<p data-prose>\` 内的文字**必须严格 ≤ ${maxProse} 字**！详细的操作提示、故事细节请放在不带 data-prose 属性的 \`<div class="tip-box">\` 或卡片内，绝不可让 data-prose 超字数！
4. **支撑 40 分钟课堂的仿真设计与学科精准输入**：
   - 杜绝要求学生输入长篇文字小作文！采用点击配对、部件解剖、参数滑块、开关翻转、代码单步追踪、下拉/词块拼装等精准学科交互；
   - 在核心仿真屏内设置**“基础通关任务”**与 \`<div class="challenge-card"><h4>⭐ 进阶挑战星</h4>...</div>\`，让快学生有深度探究空间，慢学生稳步达标；
   - 关卡内的随堂巩固单选题必须支持**“答错温和提示可无限重选，答对后变绿锁定”**。
5. **终极关卡（第 ${maxScreens} 屏，data-step="${maxScreens - 1}"）：达标测验与收尾五件套（100% 闭环，零 alert 弹窗！）**：
   - **① 随堂测验 (Quiz)**：
     * JS 必须严格声明：\`const quiz = [ { q: "题干", options: ["A. ...", "B. ...", "C. ..."], correct: 0 }, ... ];\`（整条语句末尾必须带分号 \`;\`，但数组内部各项之间必须用逗号 \`,\` 分隔，严禁在 options 数组后误写分号！）；
     * 🚨 题数与题干字数铁律：${gradeNum}年级**严格只能有 ${maxQuiz} 道题**！每道题 \`q:\` 题干字数**必须严格 ≤ ${maxQuizStem} 字**！
     * 规则：**先选后判**！点击选项只加 \`.picked\` 高亮，绝不提前标红绿；点击【✍️ 提交测验并判分】后统一标出 \`.correct\` / \`.wrong\`、锁定列表并展示得分横幅（若未答完在页面状态栏温和提示，**严禁调用 alert()**）。
   - **② 通关徽章墙 (medal)**：
     * 包含 \`<div class="badge-grid medal-wall" id="badgeGrid"></div>\`，声明 \`const medalDefs = [...] \`（4 枚本课专属徽章，卡片 class 含 \`badge-card medal\`），绑定各关卡 \`xxxEver\` 累计达成变量动态点亮。
   - **③ 自我评价打卡**：
     * 包含 3~4 项复选框，**其中最后一项必须包含“我还没完全懂，需要老师或同伴帮助”字样**！
   - **④ 极简无感导出学习凭单 (.txt)**：
     * 提供班级 \`#inputClass\` 与姓名 \`#inputName\` 选填框，但**绝不强制填写，严禁任何 alert() 弹窗拦截**！未填时默认使用 \`'${grade}'\` 与 \`'小极客'\` 兜底，点击【📥 保存学习记录凭单 (.txt)】直接通过 \`Blob\` 和 \`a.download\` 一键秒下！
     * 凭单首行必须严格为：\`# 班级|姓名|${lessonTitle}|得分|时间\`。
   - **⑤ 现场电子通关奖状卡**：
     * HTML 末尾内嵌 \`<div class="cert-modal" id="certModal">\` 模态框（含 🏆、学生姓名、课程名称、四星满级成就赞词、关闭按钮），点击【🎖️ 生成电子通关奖状】直接弹出展示（零 alert 拦截）。

【输出格式要求】：
请只输出完整的 HTML 代码，直接包含在 ===FILE: 课堂作业.html=== 标记中：

===FILE: 课堂作业.html===
<!DOCTYPE html>
<html lang="zh-CN">
...完整的HTML、样式和脚本，100%可直接在浏览器运行并通过 check_lesson.py 零错误零警告检测...
</html>
`;

  const rawPhase2 = await callLlmApi({
    apiBase,
    apiKey,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
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
