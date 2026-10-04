import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

import { dbService } from '../db.js';

// 加载项目 Master Skill 作为大模型核心系统提示词
function loadSystemPrompt() {
  const skillPath = path.join(rootDir, 'skills', 'it-lesson-studio', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf-8');
  }
  return '你是一位中小学信息科技特级教师，擅长设计教案、导学单、课件和随堂作业。';
}

/**
 * 提取年级数字（3~8）
 */
function extractGradeNum(gradeStr) {
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
 * 通用 LLM 请求封装
 */
async function callLlmApi({ apiBase, apiKey, model, messages, temperature = 0.3 }) {
  const endpoint = `${apiBase.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI 服务请求失败 [HTTP ${response.status}]: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('AI 未返回有效内容');
  }
  return content;
}

/**
 * 标杆级单文件课堂作业完整 CSS 样式库（直接内嵌，确保无论哪个模型产出的页面都具备省特级教师标杆视觉水准）
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
  .stepper { display: flex; align-items: center; gap: 8px; }
  .step-node {
    display: flex; align-items: center; gap: 6px;
    cursor: pointer; opacity: 0.65; transition: all 0.25s ease;
    padding: 4px 8px; border-radius: 20px;
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
  main { max-width: 860px; margin: 24px auto; padding: 0 16px; }
  .panel {
    display: none; background: var(--card-bg); border-radius: var(--radius);
    padding: 30px 32px; box-shadow: var(--shadow);
    border: 1px solid rgba(220, 221, 225, 0.6); animation: slideUp 0.35s ease;
  }
  .panel.active { display: block; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .panel-tag {
    display: inline-block; color: var(--accent); background: var(--primary-light);
    font-size: 13px; font-weight: 800; padding: 3px 10px; border-radius: 6px; margin-bottom: 8px;
  }
  h2.panel-title { font-size: 24px; font-weight: 800; color: var(--primary); margin-bottom: 12px; }
  .story-box {
    background: #F4F8FA; border-left: 4px solid var(--accent-blue);
    border-radius: 0 12px 12px 0; padding: 14px 18px; margin-bottom: 20px;
    font-size: 15px; color: #34495E;
  }
  .story-box b { color: var(--accent-blue); }
  .tip-box {
    background: #FFF9E6; border: 1px solid #FDE3A7; color: #936500;
    border-radius: 10px; padding: 10px 16px; font-size: 14px; margin: 14px 0 20px;
    display: flex; align-items: center; gap: 8px;
  }
  /* 配对与仿真卡片容器 */
  .match-arena { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
  .match-col { display: flex; flex-direction: column; gap: 12px; }
  .match-card {
    background: #FAFBFC; border: 2px solid var(--border); border-radius: 12px;
    padding: 16px 18px; cursor: pointer; transition: all 0.2s ease;
    display: flex; align-items: center; gap: 14px;
  }
  .match-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(78, 159, 61, 0.15); }
  .match-card.selected { border-color: var(--accent-gold); background: #FFFDF7; box-shadow: 0 0 0 3px rgba(243, 156, 18, 0.25); }
  .match-card.matched { border-color: var(--accent); background: #EDF7EC; pointer-events: none; opacity: 0.9; }
  .match-icon { font-size: 32px; flex-shrink: 0; }
  .match-info h4 { font-size: 17px; margin-bottom: 2px; color: var(--primary); }
  .match-info p { font-size: 13px; color: var(--text-sub); }
  .match-status { min-height: 28px; font-size: 16px; font-weight: 800; text-align: center; margin-top: 10px; }
  /* 仿真沙箱与微解剖台 */
  .case-lab {
    background: #2C3E50; border-radius: 14px; padding: 24px; color: #fff;
    margin: 18px 0; display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: center;
  }
  @media(max-width: 768px) { .case-lab, .match-arena { grid-template-columns: 1fr; } }
  .motherboard-sim {
    background: #1B2836; border: 2px dashed #4A6572; border-radius: 12px;
    padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  .hardware-slot {
    background: #22313F; border: 2px solid #34495E; border-radius: 10px;
    padding: 12px 8px; text-align: center; cursor: pointer; transition: all 0.25s ease;
  }
  .hardware-slot:hover { border-color: var(--accent-gold); background: #2C3E50; transform: scale(1.04); }
  .hardware-slot.active { border-color: #F1C40F; background: #34495E; box-shadow: 0 0 15px rgba(241, 196, 15, 0.4); }
  .slot-icon { font-size: 26px; display: block; margin-bottom: 4px; }
  .slot-name { font-size: 13px; font-weight: 700; color: #ECF0F1; }
  .inspect-detail {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 20px; min-height: 180px; display: flex; flex-direction: column; justify-content: center;
  }
  .inspect-title { font-size: 20px; font-weight: 800; color: #F1C40F; margin-bottom: 8px; }
  .inspect-metaphor { font-size: 15px; color: #E0E6ED; line-height: 1.6; }
  .inspect-hint { font-size: 13px; color: #BDC3C7; margin-top: 10px; }
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
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
    margin-top: 28px; padding-top: 20px; border-top: 2px dashed #ECEFF1;
  }
  .btn {
    font-family: inherit; font-size: 15px; font-weight: 800;
    padding: 12px 24px; border-radius: 12px; border: none; cursor: pointer;
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
 * 调用 LLM API 生成四位一体教学资料（两阶段架构：教学文稿三件套 + 深度定制单文件 HTML 作业）
 */
export async function generateLessonFiles({
  taskId,
  grade,
  lessonTitle,
  requirements,
  materialsText,
  images,
  targetDir,
  onProgress
}) {
  const apiBase = dbService.getSetting('ai_api_base') || process.env.AI_API_BASE || 'http://127.0.0.1:8317/v1';
  const apiKey = dbService.getSetting('ai_api_key') || process.env.AI_API_KEY || 'sk-none';
  const model = dbService.getSetting('ai_model') || process.env.AI_MODEL || 'gemini-2.5-flash';

  const systemPrompt = loadSystemPrompt();
  const gradeNum = extractGradeNum(grade);

  let materialsPrompt = '';
  if (materialsText && materialsText.trim()) {
    materialsPrompt = `\n【教师自主上传/提供的课本教材与知识点参考资料】：\n${materialsText.trim()}\n(请务必参考并吸收上述教材知识点与案例，融入到教学任务与活动设计中)\n`;
  }

  // =========================================================================
  // 阶段 1：生成教学文稿三件套（教案.md、导学案.md、课件.md）
  // =========================================================================
  if (onProgress) {
    onProgress({ progress: 20, progressText: '教学引擎正在构思教案、导学单与大屏课件...' });
  }

  const promptPhase1 = `
请为以下中小学信息科技课程设计前三件套教学资料（教案、导学单、课件）：
- 授课年级：${grade}（第 ${gradeNum} 学段）
- 课程课题：${lessonTitle}
- 教师补充要求 / 教学意图：${requirements || '无特殊补充，请严格紧扣浙教版 2026 最新教材体系与 2022 义务教育信息科技新课标。'}
${materialsPrompt}
【输出格式强制要求】：
必须严格按照以下三个文件标记完整输出，严禁省略，保证四位一体任务同源呼应：

===FILE: 教案.md===
(严格遵循教案规范，<=4页A4，无板书，含生活通俗比喻、设问话术、避坑锦囊三支架，四列精排教学过程表；八、教学反思各设问下方只留1条适度手写横线如 ____________________________________________________，严禁超长折行)

===FILE: 导学案.md===
(严格遵循导学单规范，低段单面A4，第一人称趣味语境，含显式 [ ] 勾选槽与微型记录表。
【选择题铁律】：
1. 题干后必须留出明确作答区：【我的选择是：(     )】
2. 每个选项必须独立空行成段，严禁软回车粘连！
3. 选项严格使用 [ ] A. / [ ] B. / [ ] C. 格式，确保纸质打印直接在 [ ] 打勾，机房电脑打开也能在括号直接键盘输入字母作答！)

===FILE: 课件.md===
(Marp 16:9 主题 edu-lesson。严禁大白屏与干瘪文字！必须达到省特级教师大屏课件视觉水准：
1. 封面页必须声明 <!-- _class: lead -->，包含 <span class="tag">年级单元</span>、大标题与副标题，呈现深蓝渐变震撼大屏视觉；
2. 内容页严禁只有单薄的一两行字！必须全量采用卡片式大屏布局：
   - 左右双栏对比使用 <div class="grid-2">
   - 分组卡片使用 <div class="card"> 和 <div class="card card-highlight">
   - 易错/排雷使用 <div class="card card-warm">
   - 底部金句重点使用 <div class="callout">、<div class="callout-warm"> 或 <div class="callout-success">
   - 关键操作使用 <kbd> 快捷键或 <span class="tag"> 标签
3. 卡片内层次分明（含 <h3> 标题、<ul><li> 条目列表），严禁裸露未转义的 ** 语法，纯净学生第一视角，绝无教师后台台词！)
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
    temperature: 0.3
  });

  // 解析并落盘前三件套
  const filesPhase1 = parseDelimitedFiles(rawPhase1, grade, lessonTitle);
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

  // =========================================================================
  // 阶段 2：基于教案与导学单，专门深度生成“课堂作业.html”
  // =========================================================================
  if (onProgress) {
    onProgress({ progress: 45, progressText: '正在基于教案关卡深度定制微型仿真器与单文件课堂作业...' });
  }

  // 严格年级学段限制
  let maxScreens = 4;
  let maxQuiz = 2;
  if (gradeNum >= 5 && gradeNum <= 6) {
    maxScreens = 5;
    maxQuiz = 3;
  } else if (gradeNum >= 7) {
    maxScreens = 6;
    maxQuiz = 3;
  }

  const promptPhase2 = `
你现在需要为本课专门编写配套的【课堂作业.html】单文件离线交互课件应用。
必须与刚才生成的教案、导学单实现 100% 任务同源咬合！

【课程基本信息】：
- 授课年级：${grade}（${gradeNum}年级）
- 课程课题：${lessonTitle}
- 刚才生成的教案核心内容片段：
${planContent.slice(0, 1800)}

【导学单任务情境】：
${worksheetContent.slice(0, 1000)}

【🚨 课堂作业.html 工业级与自动化质检铁律（必须 100% 遵守，绝不能漏！）】：
1. **单文件纯原生断网运行**：
   - 严禁任何外部网络资源链接（严禁引入外部 CSS、CDN 或 JS 文件，全部内嵌）；
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
2. **顶栏导航与闯关步进器**：
   - 必须使用 <header class="top-bar">，内部包含 <div class="brand"> 和 <div class="stepper" id="stepper"></div>；
   - JS 必须声明：const stepLabels = ['关卡1简名', '关卡2简名', '关卡3简名', '测验评价'];
   - 步骤数量必须严格等于 ${maxScreens} 屏！
3. **关卡容器 DOM 结构**：
   - 必须严格使用 <section class="panel active" data-step="0"> ... </section>；
   - 第 2、3、4 关使用 <section class="panel" data-step="1">、data-step="2" 等，data-step 必须从 0 到 ${maxScreens - 1} 严格连续递增！
   - 每屏包含 <div class="panel-tag">、<h2 class="panel-title">、<div class="story-box"><p data-prose>情境介绍与操作指引</p></div>、<div class="tip-box"> 和 <div class="footer-nav">；每屏说明文字段落必须加上 data-prose 属性；
4. **本课特色微型仿真与实操环节**：
   - 必须根据教案中的任务设计真实的交互式微型仿真器（例如：卡片磁吸连线配对、机箱/平台微型解剖台、下载流程沙箱模拟、按键模拟等）；
   - 允许做错重试，配对或操作成功时给予即时鼓励反馈；
5. **终极关卡（第 ${maxScreens} 屏）：达标测验与收尾三件套（必须严格闭环）**：
   - **随堂测验 (Quiz)**：
     - JS 必须声明：const quiz = [ ... ];
     - 🚨 题数铁律：${gradeNum}年级**严格只能有且必须有 ${maxQuiz} 道题目**！严禁多出或少于 ${maxQuiz} 题！
     - 规则：先选后判！点击选项只高亮表示选中，严禁提前显示红绿对错！点击【提交测验并判分】按钮后统一标出红绿正确项、锁定题目并显示总分横幅；
   - **通关徽章 (medal)**：
     - 必须包含徽章墙容器（class="badge-grid medal-wall" id="badgeGrid"），卡片 class 必须包含 "badge-card medal-card"，声明 4 枚本课专属徽章，根据挑战表现动态点亮；
   - **自我评价打卡**：
     - 必须包含 3~4 项自我反思勾选项，**其中必须包含“我还没完全懂，需要老师或同伴帮助”选项**；
   - **导出学习凭单 (.txt)**：
     - 【极简无感导出】：支持选填班级与姓名，但**绝不强制填写，严禁任何 alert 拦截**！中小学学生打字不利索且平台已自带隔离学生账号，点击【保存学习记录凭单】必须能够直接一键即时下载凭单文件（未填写时直接生成，不卡顿）；
     - 凭单首行格式必须为：# 班级|姓名|课题|得分|时间；
   - **现场生成电子通关奖状卡**：
     - 必须在 HTML 末尾内嵌 <div class="cert-modal" id="certModal"> 弹窗（包含金色大奖杯 🏆、金色边框、学生姓名、专属课题称号、满级成就赞赏、关闭按钮）；
     - 点击【生成电子通关奖状】直接弹出模态框展示（未输入姓名时直接显示“优秀学员”或“小极客”，严禁弹窗拦截逼迫孩子打字）！

【输出格式要求】：
请只输出完整的 HTML 代码，直接包含在 ===FILE: 课堂作业.html=== 标记中：

===FILE: 课堂作业.html===
<!DOCTYPE html>
<html lang="zh-CN">
...完整的HTML、样式和脚本，100%可直接在浏览器运行...
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
    temperature: 0.2
  });

  const filesPhase2 = parseDelimitedFiles(rawPhase2, grade, lessonTitle);
  for (const [filename, fileContent] of Object.entries(filesPhase2)) {
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, fileContent.trim(), 'utf-8');
  }

  const allFiles = { ...filesPhase1, ...filesPhase2 };
  return Object.keys(allFiles);
}

/**
 * 解析大模型返回的带有 ===FILE: xxx=== 标记的文本
 */
function parseDelimitedFiles(rawText, grade, lessonTitle) {
  const cleanGrade = (grade || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const cleanTitle = (lessonTitle || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const prefix = cleanGrade ? `${cleanGrade}_${cleanTitle}` : cleanTitle;

  const fileRegex = /===FILE:\s*([^\n\r=]+)===\s*([\s\S]*?)(?====FILE:|$)/g;
  const result = {};
  let match;

  while ((match = fileRegex.exec(rawText)) !== null) {
    const rawName = match[1].trim();
    const content = match[2].trim();

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
    if (rawText.includes('<!DOCTYPE html>') || rawText.includes('<html')) {
      const standardName = `${prefix}_课堂作业.html`;
      result[standardName] = rawText.trim();
    } else {
      throw new Error('大模型未按规范输出资料文件标记，请重试');
    }
  }

  return result;
}
