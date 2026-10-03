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

test('P0-1: $() 注入路径只当 argv 传递，不触发命令执行', () => {
  cleanSentinel();
  const evil = `$(touch ${SENTINEL})`;
  const out = runCmd('/bin/echo', [evil], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(out.toString().trim(), evil, 'argv 必须原样透传');
  assert.equal(fs.existsSync(SENTINEL), false, 'shell 展开被触发了！存在命令注入');
  cleanSentinel();
});

test('P0-1: 反引号 / 分号 / 管道符路径不被执行', () => {
  cleanSentinel();
  const evil = '`touch ' + SENTINEL + '`; touch ' + SENTINEL + ' | cat';
  const out = runCmd('/bin/echo', [evil], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(out.toString().trim(), evil);
  assert.equal(fs.existsSync(SENTINEL), false, 'shell 展开被触发了！存在命令注入');
  cleanSentinel();
});

test('P0-1: 中文、空格路径原样透传', () => {
  const p = 'examples/三年级上/第02课_了解智能工具/02_了解智能工具_课件.md';
  const out = runCmd('/bin/echo', [p], { stdio: ['ignore', 'pipe', 'pipe'] });
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
