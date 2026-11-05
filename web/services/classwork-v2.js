import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { assertCompleteFiles, auditClasswork } from './generation-diagnostics.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeJson = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const words = text => (String(text).match(/[\u4e00-\u9fa5]|[a-zA-Z0-9]+/g) || []).length;
const requireThat = (condition, message) => { if (!condition) throw new Error('HTML V2: ' + message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Read the existing inline-map YAML notation strictly; fail closed on spec changes. */
export function readHtmlLimits(grade, specText = read('references/output-spec.md')) {
  const block = specText.match(/```spec-yaml\r?\n([\s\S]*?)```/)?.[1];
  const section = block?.match(/(?:^|\n)html_grades:\s*\r?\n([\s\S]*?)(?=\n\S|$)/)?.[1];
  const row = section?.split(/\r?\n/).find(line => new RegExp(`^  ${grade}:`).test(line));
  requireThat(Number.isInteger(grade) && grade >= 3 && grade <= 8 && row, '无法读取对应年级 spec-yaml');
  const match = row.match(/^  [3-8]:\s*\{([^}]+)\}\s*$/);
  requireThat(match, 'html_grades 格式变化，请更新规范读取器');
  const entries = match[1].split(',').map(item => item.trim().split(/\s*:\s*/));
  const limits = Object.fromEntries(entries.map(([k, v]) => [k, Number(v)]));
  const keys = ['screens', 'hands_on', 'quiz', 'prose_per_screen', 'quiz_stem'];
  requireThat(entries.length === keys.length && keys.every(k => Number.isSafeInteger(limits[k]) && limits[k] > 0), '年级门禁损坏或缺项');
  return limits;
}

export function buildV2Prompt({ gradeNum, grade, lessonTitle, requirements, planContent, worksheetContent, slidesContent, simBlueprint }) {
  const skill = read('skills/it-lesson-studio/SKILL.md');
  const globalRules = skill.slice(skill.indexOf('## 🎯'), skill.indexOf('## ⚙️'));
  const patterns = read('references/classwork-v2-patterns.md');
  const cn = { 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八' }[gradeNum];
  const term = /上/.test(grade) && !/下/.test(grade) ? '上' : /下/.test(grade) && !/上/.test(grade) ? '下' : '';
  const selected = term ? patterns.split('\n').find(line => line.startsWith(`| **${cn}${term}**`)) : null;
  const limits = readHtmlLimits(gradeNum);
  const blueprintBlock = simBlueprint ? `\n推荐仿真原型与关卡拆解（若教师未指定冲突设想则优先以此构建多屏探究主线）：\n- 原型：${simBlueprint.archetypeName}\n${simBlueprint.interactiveDesign}` : '';
  return {
    system: [globalRules, read('skills/4-classwork/SKILL.md'), read('references/classwork-v2-contract.md')].join('\n\n'),
    user: `生成本课的 HTML V2 教学差异 JSON。不要输出完整 HTML 或公共引擎。
【3~8年级学段认知与交互设计要求】：
1. 严格对齐学段学情（防超纲拔高）：
   - 3~4年级：大卡片、具象道具（发光灯泡、分类箱、温度计），题干 ≤ ${limits.quiz_stem} 字儿童口语，禁止出现代码与底层计算机原理；
   - 5年级：自然语言步骤词块拼图、流程图插槽、生活分支条件切换、恒温阈值滑块，题干 ≤ ${limits.quiz_stem} 字，五年级全学年不学编程代码，禁止出现 Python 代码、KNN 或数学权重公式；
   - 6年级：简短代码单步追踪、猜数字/枚举对比、串并联双开关电路与反馈调节，题干 ≤ ${limits.quiz_stem} 字，考查直观规则与因果，不考死记编程语法；
   - 7~8年级：网络拓扑连线、传感器折线图、密码转盘、2D近邻分类画布，题干 ≤ ${limits.quiz_stem} 字，一课聚焦 1 个核心机理，不跨单元混塞其它算法，不搞大学公式推导。
   - 所有年级反馈文案讲通俗生活因果，禁止使用生硬的成人学术黑话。
2. 界面与交互细节：
   - 运用原生 CSS 与 SVG 绘制直观道具，按钮与滑块提供清晰的状态反馈。
3. 探究主线：设计 2—3 个递进探究屏（加上自动生成的终极评价屏共 3—4 屏，封顶上限不超过 ${limits.screens} 屏，严禁为凑满上限屏数而堆砌复杂控件），覆盖“生活感知配对 ➔ 核心动手仿真（基础+⭐进阶） ➔ 迁移巩固”。screens 每一屏的 kind 属性必须二选一："hands-on"（动手实操屏）或 "explore"（认知探究屏）。

年级：${grade}；课题：${lessonTitle}
实际 spec-yaml 上限（不是必须凑满）：${JSON.stringify(limits)}
教师设想（在硬性契约内优先）：${requirements || '未指定'}
已确认册次的可选范式：${selected || '册次不明确，不推断教材事实；围绕课题选型'}${blueprintBlock}

以下文稿是任务同源依据，使用完整文本，不另造任务名称：
<lesson-plan>
${planContent}
</lesson-plan>
<worksheet>
${worksheetContent}
</worksheet>
<slides>
${slidesContent || ''}
</slides>
仅输出接口契约要求的 JSON 对象。`
  };
}

export function parseV2Payload(raw) {
  const clean = String(raw).trim().replace(/^```(?:json)?\s*\n/i, '').replace(/\n```\s*$/, '');
  try { return JSON.parse(clean); } catch { throw new Error('HTML V2: JSON 不完整或格式错误；未尝试补尾或删减'); }
}

function checkFragment(screen) {
  // Conservative contract + network-blocking CSP. Generated JS is not an untrusted-code sandbox.
  requireThat(!/\bdata-(?:prose|panel-type)\b/i.test(screen.html), '仿真片段不能自造门禁标记');
  requireThat(!/<\/?(?:script|style|html|head|body|iframe|object|embed|link|base|template)\b/i.test(screen.html), '仿真片段含文档级或不支持的标签');
  requireThat(!/\bon\w+\s*=|\b(?:href|src|srcset|action)\s*=\s*["']?\s*(?:https?:|\/\/|javascript:)/i.test(screen.html), '仿真片段含事件属性或外部资源');
  for (const attr of screen.html.matchAll(/\b(?:href|src|srcset|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const value = attr[1] ?? attr[2] ?? attr[3];
    requireThat(/^(?:#|data:image\/)/i.test(value) && !/^srcset/i.test(attr[0]), '仿真资源必须内联，不能依赖相对路径');
  }
  requireThat(!/<\/style/i.test(screen.css) && !/@import|url\s*\(\s*(?!["']?data:)/i.test(screen.css), '专属 CSS 含外部引用或越界标签');
  requireThat(!/<\/script/i.test(screen.script) && !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker|alert|confirm|prompt|importScripts|eval|Function)\s*\(|\bimport\s*(?:\(|["'{*])|sendBeacon\s*\(/.test(screen.script), '仿真脚本包含网络、弹窗或动态代码能力');
  requireThat(!/\b(?:window|globalThis|parent|top|frames|location|navigator)\b|\bdocument\.(?!createElement|createTextNode|createDocumentFragment\b)\w+|\bdocument\b(?!\.(?:createElement|createTextNode|createDocumentFragment\b))/.test(screen.script), '仿真脚本越过 root/api 访问全局状态');
  // Compile only, never execute model code on the server.
  new Script(`(function(root, api) { "use strict";\n${screen.script}\n})`);
}

export function validateV2Payload(payload, gradeNum) {
  const limits = readHtmlLimits(gradeNum);
  requireThat(payload?.schemaVersion === 2 && nonempty(payload.concept) && nonempty(payload.misconception), '缺少核心概念或典型误区');
  requireThat(Array.isArray(payload.teacherNotes) && payload.teacherNotes.length >= 3 && payload.teacherNotes.length <= 5 && payload.teacherNotes.every(nonempty), '需要 3—5 行教师说明');
  requireThat(Array.isArray(payload.screens) && payload.screens.length >= 2 && payload.screens.length + 1 <= limits.screens, '屏数超标或没有足够探究任务');
  const ids = new Set();
  let handsOn = 0;
  payload.screens.forEach(screen => {
    if (typeof screen.id === 'string') {
      screen.id = screen.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    }
    requireThat(/^[a-z][a-z0-9-]{0,31}$/.test(screen.id) && !ids.has(screen.id), '仿真 ID 非法或重复');
    ids.add(screen.id);
    requireThat(nonempty(screen.sourceTask), '缺少文稿同源任务名');
    requireThat(nonempty(screen.title) && nonempty(screen.prose) && words(screen.prose) <= limits.prose_per_screen, '任务标题或导语不合规');
    if (typeof screen.kind === 'string') {
      screen.kind = screen.kind.trim().toLowerCase().replace(/_/g, '-');
    }
    requireThat(['explore', 'hands-on'].includes(screen.kind), '任务类型非法');
    if (screen.kind === 'hands-on') handsOn++;
    requireThat(['goal', 'basicCriterion', 'starCriterion'].every(k => nonempty(screen[k])), '缺少目标或基础/进阶判据');
    requireThat(words([screen.prose, '目标：' + screen.goal, '基础：' + screen.basicCriterion, '挑战：' + screen.starCriterion].join(' ')) <= limits.prose_per_screen, '导语、目标和判据合计正文超标');
    requireThat(Array.isArray(screen.hints) && screen.hints.length === 3 && screen.hints.every(nonempty), '需要观察方向、关键变量、完整示范三级提示');
    requireThat(nonempty(screen.html) && typeof screen.css === 'string' && nonempty(screen.script), '仿真 DOM/CSS/脚本不完整');
    screen.html = screen.html
      .replace(/<section\b([^>]*)>/gi, '<div role="region"$1>')
      .replace(/<\/section>/gi, '</div>')
      .replace(/<form\b([^>]*)>/gi, '<div role="form"$1>')
      .replace(/<\/form>/gi, '</div>');
    checkFragment(screen);
  });
  requireThat(handsOn >= 1 && handsOn <= limits.hands_on, '必须有真实动手任务且不超上限');
  requireThat(Array.isArray(payload.quiz) && payload.quiz.length >= 1 && payload.quiz.length <= limits.quiz, '测验题量不合规');
  payload.quiz.forEach(q => {
    requireThat(nonempty(q.q) && words(q.q) <= limits.quiz_stem && Array.isArray(q.options) && q.options.length >= 2 && q.options.every(nonempty)
      && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length && nonempty(q.why), '测验字段、题干或答案索引不合规');
  });
  return payload;
}

export function validateSourceTasks(payload, documents) {
  const docs = Object.values(documents);
  requireThat(docs.length === 3 && docs.every(nonempty), '需要三件完整文稿');
  for (const screen of payload.screens) {
    const raw = String(screen.sourceTask || '').trim();
    const clean = raw.replace(/^[一二三四五六七八0-9]+[、.：:]\s*|关卡[0-9一二三四]?[：:]\s*|任务[0-9一二三四]?[：:]\s*/g, '').trim();
    const parts = clean.split(/[·/、：:\s\-_——"“”'‘’（）()]+/g).map(s => s.trim()).filter(s => s.length >= 2);
    const cands = [...new Set([raw, clean, ...parts])].filter(k => k.length >= 2);
    const inEveryDoc = cands.length > 0 && docs.every(doc => cands.some(k => doc.includes(k)));
    requireThat(inEveryDoc, '探究任务名未在教案、导学单、课件中共同出现：' + screen.sourceTask);
  }
}

export function assembleClassworkV2(payload, { gradeNum, grade, lessonTitle }) {
  validateV2Payload(payload, gradeNum);
  const h = escapeHtml;
  const panels = payload.screens.map((s, i) => `<section class="panel${i === 0 ? ' active' : ''}" data-step="${i}"${s.kind === 'hands-on' ? ' data-panel-type="hands-on"' : ''}>
<h2 tabindex="-1">${h(s.title)}</h2><div data-prose><p>${h(s.prose)}</p>
<p class="goal">目标：${h(s.goal)}</p><p>基础：${h(s.basicCriterion)}</p><p>⭐ 挑战：${h(s.starCriterion)}</p></div>
<div id="sim-${s.id}" class="simulation"></div><template id="template-${s.id}"><style>${read('resources/classwork/v2/simulation.css')}\n${s.css}</style>${s.html}</template>
<p id="feedback-${s.id}" role="status" aria-live="polite"></p><p id="task-state-${s.id}"></p>
<div class="task-tools"><button data-hint="${s.id}">需要一点提示</button><button data-reset="${s.id}">重置实验</button></div><p id="hint-${s.id}" class="hint" hidden></p>
</section>`).join('\n');
  const labels = [...payload.screens.map(s => s.title), '评价与学习记录'];
  const config = { title: lessonTitle, grade, screens: payload.screens.map(({ html, css, script, ...s }) => s) };
  const mounts = payload.screens.map(s => `${safeJson(s.id)}: function(root, api) { "use strict";\n${s.script}\n}`).join(',\n');
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="lesson-grade" content="${gradeNum}"><meta name="lesson-engine" content="v2">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${h(lessonTitle)}｜课堂作业</title><style>${read('resources/classwork/v2/engine.css')}</style></head><body>
<header class="top"><div class="top-title"><h1>${h(lessonTitle)}</h1><button id="helpFlag" aria-pressed="false">🚩 我需要帮助</button></div><nav id="stepper" class="stepper" aria-label="任务导航"></nav><p id="progressCapsule" role="status"></p><p id="helpBanner" hidden>我需要帮助，请老师或同伴过来看看。</p></header>
<main>${panels}
<section class="panel" data-step="${payload.screens.length}"><h2 tabindex="-1">评价与学习记录</h2><p data-prose>回顾探究，再记录自己的收获。</p><div id="quizArea"></div><button id="quizSubmit">提交测验并判分</button><p id="quizMessage" role="status"></p><p id="scoreBox" hidden></p>
<h3>自我评价</h3><div id="selfList"></div><p id="selfMessage" role="status"></p>
<label>班级（选填）<input id="inputClass" maxlength="60" autocomplete="off"></label><label>姓名（选填）<input id="inputName" maxlength="60" autocomplete="off"></label><div class="task-tools"><button id="saveReceipt" disabled>保存学习凭单 (.txt)</button><button id="viewReceipt" disabled>查看／复制凭单</button></div>
<div id="receiptPanel" hidden><label>学习凭单<textarea id="receiptText" readonly rows="4"></textarea></label><button id="copyReceipt">复制凭单</button><p id="receiptMessage" role="status"></p></div></section>
<footer class="nav-row"><button id="prevStep">上一屏</button><p id="navMessage" role="status"></p><button id="nextStep">下一屏／稍后再来</button></footer>
<button id="restartLesson">重新开始整节课</button><div id="restartConfirm" hidden><p>这会清除本轮任务成就与首次测验成绩，确定重新开始吗？</p><button id="restartYes">确定重新开始</button><button id="restartNo">继续本轮学习</button></div>
</main>
<script>
"use strict";
const stepLabels = ${safeJson(labels)};
const quiz = ${safeJson(payload.quiz)};
const lessonConfig = ${safeJson(config)};
const simulationMounts = {${mounts}};
${read('resources/classwork/v2/engine.js')}
</script></body></html>`;
}

/** Fail before replacing any previously successful classwork. */
export function publishClassworkV2(html, target, { signal } = {}) {
  signal?.throwIfAborted();
  assertCompleteFiles({ 'v2_课堂作业.html': html }, 'classwork');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach(m => new Script(m[1]));
  const audit = auditClasswork(html);
  requireThat(audit.status === 'checked' && audit.errors === 0 && audit.warnings === 0, '组装结果门禁未通过或检查器不可用，保留已有成果');
  signal?.throwIfAborted();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, html, { encoding: 'utf8', flag: 'wx' });
    signal?.throwIfAborted();
    fs.renameSync(temp, target);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return audit;
}
