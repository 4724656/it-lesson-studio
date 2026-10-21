/**
 * export-lesson.mjs 安全回归测试（P0-1 验收）
 *
 * 运行：npm test  →  node --test scripts/export-lesson.test.mjs
 *
 * 断言：
 * 1. 含空格、中文、$()、反引号、分号的恶意路径只作为 argv 逐参数传递，
 *    不会被 shell 展开执行（/bin/echo 原样回显，且 sentinel 文件未被创建）。
 * 2. Marp / Pandoc 的参数构造器把路径当作独立数组元素，不做字符串拼接。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCmd, buildMarpArgs, buildPandocArgs } from './export-lesson.mjs';

const SENTINEL = path.join(os.tmpdir(), 'itls_pwned_sentinel');

function cleanSentinel() {
  try { fs.unlinkSync(SENTINEL); } catch { /* 不存在 */ }
}

const echoCmd = process.platform === 'win32' ? process.execPath : '/bin/echo';
const wrapArg = (arg) => process.platform === 'win32' ? ['-e', 'console.log(process.argv[1])', arg] : [arg];

test('P0-1: $() 注入路径只当 argv 传递，不触发命令执行', () => {
  cleanSentinel();
  const evil = `$(touch ${SENTINEL})`;
  const out = runCmd(echoCmd, wrapArg(evil), { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(out.toString().trim(), evil, 'argv 必须原样透传');
  assert.equal(fs.existsSync(SENTINEL), false, 'shell 展开被触发了！存在命令注入');
  cleanSentinel();
});

test('P0-1: 反引号 / 分号 / 管道符路径不被执行', () => {
  cleanSentinel();
  const evil = '`touch ' + SENTINEL + '`; touch ' + SENTINEL + ' | cat';
  const out = runCmd(echoCmd, wrapArg(evil), { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(out.toString().trim(), evil);
  assert.equal(fs.existsSync(SENTINEL), false, 'shell 展开被触发了！存在命令注入');
  cleanSentinel();
});

test('P0-1: 中文、空格路径原样透传', () => {
  const p = 'examples/三年级上/第02课_了解智能工具/02_了解智能工具_课件.md';
  const out = runCmd(echoCmd, wrapArg(p), { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(out.toString().trim(), p);
});

test('P0-1: buildMarpArgs 把路径当作独立数组元素', () => {
  const mdFile = '/tmp/evil $(touch x)/课件.md';
  const args = buildMarpArgs(mdFile, '/tmp/out.pptx');
  assert.ok(Array.isArray(args), '必须是参数数组');
  assert.ok(args.includes(mdFile), 'md 路径必须是独立数组元素');
  assert.ok(!args.some((a) => typeof a === 'string' && a.includes('`') && a !== mdFile));
});

test('P0-1: buildPandocArgs 把路径当作独立数组元素', () => {
  const mdFile = '/tmp/evil`id`/教案.md';
  const args = buildPandocArgs(mdFile, '/tmp/out.docx', ['/tmp/dir']);
  assert.ok(args.includes(mdFile), '输入路径必须是独立数组元素');
  assert.ok(args.includes('/tmp/out.docx'), '输出路径必须是独立数组元素');
  assert.ok(args.every((a) => typeof a === 'string'));
});

test('P0-1: runCmd 默认 shell:false', async () => {
  // 通过一个必然失败的“命令”验证 shell 未介入：
  // 若走 shell，'not-a-real-binary-$(touch x)' 会被解析；直调则直接 ENOENT。
  await assert.rejects(
    async () => runCmd('definitely-not-a-binary', ['x']),
    (err) => err.code === 'ENOENT',
  );
});

test('Phase 2 仿真蓝图匹配器: 精准识别 12 册典型课型并尊重教师自定义设想', async () => {
  const { resolveSimulationBlueprint, getGradeLimits } = await import('../web/services/ai.js');

  const bpParity = resolveSimulationBlueprint('四年级下册', '第07课 数据校验', '');
  assert.equal(bpParity.gradeNum, 4);
  assert.ok(bpParity.archetypeName.includes('奇偶校验'), '应命中奇偶校验仿真器原型');

  const bpGate = resolveSimulationBlueprint('六年级下册', '第08课 开关量的与运算', '用双保险箱门禁做情境');
  assert.equal(bpGate.gradeNum, 6);
  assert.equal(bpGate.hasCustomRequirements, true);
  assert.ok(bpGate.archetypeName.includes('逻辑门'), '应命中逻辑门与真值表仿真器原型');

  const bpKnn = resolveSimulationBlueprint('八年级下册', '第09课 K近邻算法', '');
  assert.equal(bpKnn.gradeNum, 8);
  assert.ok(bpKnn.archetypeName.includes('KNN'), '应命中 2D KNN 动态分类面原型');

  const limits3 = getGradeLimits(3);
  assert.deepEqual(limits3, { screens: 4, handsOn: 1, quiz: 2, prosePerScreen: 60, quizStem: 30 });
});

test('Phase 2 HTML 合规微调器: 自动修正超标字数/多余hands-on/alert弹窗并通过 check_lesson.py 0 FAIL 0 WARN', async () => {
  const { sanitizeGeneratedClassworkHtml } = await import('../web/services/ai.js');

  // 构造一份故意带有多种门禁瑕疵的 3 年级课堂作业 HTML
  const dirtyHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<title>第7课 下载平台资源</title>
</head>
<body>
<main>
  <section class="panel active" data-step="0" data-panel-type="hands-on">
    <p data-prose>${'这是一段故意写得非常非常冗长超过六十个字的三年级第一屏导入说明文字用来测试自动裁剪器是否能够准确将其收敛在门禁阈值以内而不报错。'.repeat(2)}</p>
    <p data-prose>同屏第二个多余的 data-prose 标记应当被剥离属性。</p>
  </section>
  <section class="panel" data-step="1" data-panel-type="hands-on">
    <p>第二屏故意漏掉 data-prose 属性，测试微调器自动补齐。</p>
  </section>
  <section class="panel" data-step="2">
    <p data-prose>第三屏动手分类演练。</p>
  </section>
  <section class="panel" data-step="3">
    <p data-prose>完成随堂测验并保存凭单。</p>
    <div class="medal-wall">medal</div>
  </section>
</main>
<script>
const stepLabels = ['破冰', '解剖', '实操', '评价'];
const quiz = [
  { q: "这是一道故意写得特别特别长超过三十个字上限的三年级随堂测验题干用来验证自动精简功能？", options: ["A", "B"], correct: 0 },
  { q: "2. 下载文件时应该点击哪个按钮？", options: ["A. 官方下载", "B. 广告弹窗"], correct: 0 }
]
function exportReport() {
  alert('请先填写姓名！');
  const b = new Blob(['# 三(1)班|小极客|第7课|100|2026'], { type: 'text/plain' });
  const a = document.createElement('a');
  a.download = '凭单.txt';
}
</script>
</body>
</html>`;

  const cleanHtml = sanitizeGeneratedClassworkHtml(dirtyHtml, 3, '三年级上册', '第7课 下载平台资源');
  assert.ok(!cleanHtml.includes('alert('), '不应残留阻塞式 alert() 弹窗');
  assert.ok(cleanHtml.includes('还没完全懂'), '应自动补齐心理安全出口自评项');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-html-check-'));
  const tmpHtmlPath = path.join(tmpDir, '三年级上册_第7课_课堂作业.html');
  fs.writeFileSync(tmpHtmlPath, cleanHtml, 'utf-8');

  try {
    const out = runCmd('uv', ['run', 'python', 'scripts/check_lesson.py', tmpHtmlPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
    assert.ok(out.includes('[OK] 全部检查通过'), `check_lesson.py 应全部通过，实际输出:\n${out}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

