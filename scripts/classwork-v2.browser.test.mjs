import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { assembleClassworkV2 } from '../web/services/classwork-v2.js';

const fixture = () => JSON.parse(fs.readFileSync(new URL('../tests/fixtures/classwork-v2/binary.json', import.meta.url), 'utf8'));
const options = { gradeNum: 4, grade: '四年级上册', lessonTitle: '二进制灯泡' };
let browser;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-v2-browser-'));
test.before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'] });
});
test.after(async () => { await browser?.close(); fs.rmSync(directory, { recursive: true, force: true }); });

async function open(payload = fixture(), viewport = { width: 1366, height: 768 }) {
  const filename = path.join(directory, `lesson-${Math.random().toString(16).slice(2)}.html`);
  fs.writeFileSync(filename, assembleClassworkV2(payload, options));
  const context = await browser.newContext({ offline: true, viewport, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
  await page.addInitScript(() => {
    // Prove no dependency on storage, regardless of private/file:// behavior.
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new Error('storage denied'); } });
    Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new Error('storage denied'); } });
  });
  await page.goto(pathToFileURL(filename).href);
  await page.waitForFunction(() => window.__itlsV2?.ready);
  return { context, page, errors, external };
}
const sim = page => page.locator('#sim-binary');
async function setBits(page, code) {
  for (let i = 0; i < code.length; i++) {
    const bit = sim(page).locator(`[data-bit="${i}"]`);
    if ((await bit.getAttribute('aria-pressed') === 'true') !== (code[i] === '1')) await bit.click();
  }
}
async function record(page, code) { await setBits(page, code); await sim(page).locator('#record').click(); }
async function passBasic(page) {
  await sim(page).locator('#prediction').selectOption('same');
  await record(page, '0001');
  await record(page, '0100');
  await record(page, '0101');
  await sim(page).locator('#explanation').selectOption('weight');
}
async function goFinal(page) { await page.locator('#nextStep').click(); }
async function submit(page, choices) {
  const blocks = page.locator('.quiz-block');
  for (let i = 0; i < choices.length; i++) await blocks.nth(i).locator(`[data-choice="${choices[i]}"]`).click();
  await page.locator('#quizSubmit').click();
}

test('offline navigation, honest basic/star/transfer, repeated reset and first score remain coherent', async () => {
  const { context, page, errors, external } = await open();
  try {
    assert.deepEqual(await page.evaluate(() => window.__itlsV2.errors), []);
    assert.equal(await page.locator('.medal.got').count(), 0);
    await goFinal(page); // incomplete tasks do not lock evaluation
    assert.ok((await page.locator('#navMessage').textContent()).includes('尚未完成'));
    await page.locator('#prevStep').click();
    // Wrong comparison: different counts does not prove the stated misconception.
    await sim(page).locator('#prediction').selectOption('same');
    await record(page, '0000'); await record(page, '0001'); await record(page, '0101');
    await sim(page).locator('#explanation').selectOption('weight');
    assert.ok(!(await page.locator('#task-state-binary').textContent()).includes('曾独立通关'));
    await page.locator('[data-reset="binary"]').click();
    await passBasic(page);
    assert.ok((await page.locator('#task-state-binary').textContent()).includes('独立通关'));
    assert.equal(await page.locator('.medal.got').count(), 1);
    await record(page, '1010');
    assert.equal(await page.locator('.medal.got').count(), 2, 'advanced does not automatically award transfer');
    await sim(page).locator('#transferAnswer').fill('9');
    await sim(page).locator('#transferCheck').click();
    assert.equal(await page.locator('.medal.got').count(), 3);
    await page.locator('[data-reset="binary"]').click();
    await page.locator('[data-reset="binary"]').click();
    assert.equal(await sim(page).locator('#value').textContent(), '0000 = 0');
    assert.equal(await page.locator('.medal.got').count(), 3);
    await goFinal(page);
    await page.locator('#quizSubmit').click();
    assert.ok((await page.locator('#quizMessage').textContent()).includes('2 题'));
    const q1 = page.locator('.quiz-block').nth(0);
    await q1.locator('[data-choice="1"]').click();
    assert.equal(await page.locator('.quiz-option.correct,.quiz-option.wrong').count(), 0);
    await submit(page, [1, -1]);
    assert.ok((await page.locator('#scoreBox').textContent()).includes('50 / 100'));
    await page.locator('#selfList input').last().check();
    assert.equal(await page.locator('.medal.got').count(), 4);
    await page.locator('#prevStep').click();
    await page.locator('[data-reset="binary"]').click();
    await goFinal(page);
    assert.ok((await page.locator('#scoreBox').textContent()).includes('50 / 100'));
    assert.ok(await page.locator('#quizSubmit').isDisabled());
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await context.close(); }
});

test('full example causes assisted completion; skip/help never grant knowledge badges', async () => {
  const { context, page } = await open();
  try {
    await page.locator('#helpFlag').click();
    assert.equal(await page.locator('.medal.got').count(), 1);
    for (let i = 0; i < 3; i++) await page.locator('[data-hint="binary"]').click();
    assert.equal(await page.locator('.medal.got').count(), 1);
    await passBasic(page);
    const state = await page.locator('#task-state-binary').textContent();
    assert.ok(state.includes('带提示通关'));
    assert.ok(!state.includes('独立通关'));
    await page.locator('[data-reset="binary"]').click();
    assert.equal(await page.locator('.medal.got').count(), 2);
  } finally { await context.close(); }
});

test('blank identity and unavailable download/clipboard have the same plain-text receipt fallback', async () => {
  const { context, page, errors } = await open();
  try {
    await goFinal(page);
    await submit(page, [-1, -1]);
    await page.locator('#inputClass').fill('四年级|2班\n');
    await page.locator('#inputName').fill('小/明');
    const download = page.waitForEvent('download');
    await page.locator('#saveReceipt').click();
    const file = await download;
    const buffer = fs.readFileSync(await file.path());
    const text = buffer.toString('utf8');
    assert.ok(text.startsWith('# 班级|姓名|课题|得分|时间\n'));
    assert.equal(text.trimEnd().split('\n')[1].split('|').length, 5);
    assert.ok(!text.includes('还没完全懂'));
    assert.notEqual(buffer[0], 0xef);
    assert.equal(await page.locator('#receiptText').inputValue(), text);
    assert.ok(!/[|\/\\]/.test(file.suggestedFilename()));
    await page.locator('#inputName').fill(''); await page.locator('#inputClass').fill('');
    await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('download blocked'); }; });
    await page.locator('#saveReceipt').click();
    assert.ok((await page.locator('#receiptText').inputValue()).includes('本班|小极客|二进制灯泡|0|'));
    assert.ok((await page.locator('#receiptMessage').textContent()).includes('复制'));
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
    await page.locator('#copyReceipt').click();
    assert.ok((await page.locator('#receiptMessage').textContent()).includes('Ctrl+C'));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('certificate remains truthful and keyboard accessible at 1024x768 with denied storage', async () => {
  const { context, page, errors } = await open(fixture(), { width: 1024, height: 768 });
  try {
    await goFinal(page);
    await page.locator('#openCert').click();
    assert.ok((await page.locator('#certContent').textContent()).includes('勇敢探索者'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'closeCert');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'closeCert');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#certModal').isHidden());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'openCert');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#prevStep').click();
    await sim(page).locator('[data-bit="0"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await sim(page).locator('#value').textContent(), '1000 = 8');
    if (process.env.ITLS_V2_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.ITLS_V2_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.ITLS_V2_SCREENSHOT_DIR, 'binary-1024.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('broken or pre-awarded module is visible to runtime validation while navigation remains usable', async () => {
  const payload = fixture();
  payload.screens[0].script = 'return { evaluate(){ return {basic:true,star:true,transfer:true}; }, reset(){} };';
  const { context, page } = await open(payload);
  try {
    assert.deepEqual(await page.evaluate(() => window.__itlsV2.errors), ['binary']);
    assert.equal(await page.locator('.medal.got').count(), 0);
    await goFinal(page);
    await page.locator('#openCert').click();
    assert.ok(await page.locator('#certModal').isVisible());
  } finally { await context.close(); }
});
