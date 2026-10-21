import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readHtmlLimits, buildV2Prompt, parseV2Payload, validateV2Payload, assembleClassworkV2, publishClassworkV2, validateSourceTasks } from '../web/services/classwork-v2.js';
const fixture = () => JSON.parse(fs.readFileSync(new URL('../tests/fixtures/classwork-v2/binary.json', import.meta.url), 'utf8'));
const identity = { gradeNum: 4, grade: '四年级上册', lessonTitle: '二进制灯泡' };
const rejectMutation = (change, expected) => { const data = fixture(); change(data); assert.throws(() => validateV2Payload(data, 4), expected); };

test('V2 reads actual spec instead of a numerical copy and treats limits as maxima', () => {
  const spec = fs.readFileSync(new URL('../references/output-spec.md', import.meta.url), 'utf8');
  assert.equal(readHtmlLimits(4).screens, 4);
  assert.equal(readHtmlLimits(4, spec.replace('4: { screens: 4', '4: { screens: 3')).screens, 3);
  assert.throws(() => readHtmlLimits(4, 'broken'), /无法读取/);
  assert.throws(() => readHtmlLimits(9), /无法读取/);
  assert.doesNotThrow(() => validateV2Payload(fixture(), 4));
  rejectMutation(d => { d.screens = Array.from({ length: 4 }, (_, i) => ({ ...d.screens[0], id: `task-${i}` })); }, /屏数/);
  rejectMutation(d => { d.screens[0].prose = '字'.repeat(81); }, /导语/);
  rejectMutation(d => { d.screens[0].goal = '字'.repeat(81); }, /合计正文/);
  rejectMutation(d => { d.quiz[0].q = '字'.repeat(35); }, /题干/);
});

test('V2 prompt loads only module 4 plus selected semester, preserving full document context', () => {
  const result = buildV2Prompt({ ...identity, requirements: '用校园温室做情境', planContent: '任务一'.repeat(2000), worksheetContent: '任务二'.repeat(700) });
  assert.ok(result.user.includes('用校园温室做情境'));
  assert.ok(result.user.includes('任务一'.repeat(2000)));
  assert.ok(result.user.includes('任务二'.repeat(700)));
  assert.ok(result.user.includes('| **四上**'));
  assert.ok(!result.user.includes('| **八下**'));
  assert.ok(!result.system.includes('## 一、教材分析'));
  assert.ok(!result.system.includes('grid-2'));
  assert.ok(!result.system.includes('--paper:'));
  assert.ok(!buildV2Prompt({ ...identity, grade: '四年级', planContent: '', worksheetContent: '' }).user.includes('| **四上**'));
});

test('V2 rejects missing teaching predicates, invalid quiz, duplicated IDs and fabricated schema', () => {
  rejectMutation(d => { d.screens[0].basicCriterion = ''; }, /判据/);
  rejectMutation(d => { d.screens[0].kind = 'read'; }, /类型/);
  rejectMutation(d => { d.screens[0].kind = 'explore'; }, /动手/);
  rejectMutation(d => { d.screens.push({ ...d.screens[0] }); }, /重复/);
  rejectMutation(d => { d.quiz[0].correct = 10; }, /答案索引/);
  rejectMutation(d => { d.medals[0].event = 'reflection'; }, /徽章/);
  rejectMutation(d => { delete d.screens[0].hints; }, /提示/);
  assert.throws(() => parseV2Payload('{"schemaVersion":2'), /未尝试补尾/);
  assert.deepEqual(parseV2Payload('```json\n' + JSON.stringify(fixture()) + '\n```'), fixture());
});

test('V2 never executes simulation code on the server; rejects syntax errors and network dependencies', () => {
  rejectMutation(d => { d.screens[0].script += '\nconst invalid = ;'; }, /Unexpected/);
  rejectMutation(d => { d.screens[0].script += '\ndocument.body.remove();'; }, /全局状态/);
  rejectMutation(d => { d.screens[0].script += '\nfetch("https://example.invalid")'; }, /网络/);
  rejectMutation(d => { d.screens[0].html += '<script>bad()</script>'; }, /标签/);
  rejectMutation(d => { d.screens[0].html += '<img src="https://example.invalid/x">'; }, /资源/);
  rejectMutation(d => { d.screens[0].html += '<img src=local-image.png>'; }, /相对路径/);
  rejectMutation(d => { d.screens[0].html += '</template><div>escaped</div>'; }, /标签/);
  rejectMutation(d => { d.screens[0].css += 'body{background:url(https://example.invalid)}'; }, /CSS/);
  const data = fixture();
  data.screens[0].script = 'throw new Error("server must not execute this");';
  assert.doesNotThrow(() => validateV2Payload(data, 4));
});

test('V2 assembler safely embeds lesson text and machine gates the final single HTML without legacy mutations', () => {
  const data = fixture();
  data.quiz[0].why = '</script><script>bad()</script>';
  const html = assembleClassworkV2(data, { ...identity, lessonTitle: '<img src=x onerror=bad()>' });
  assert.ok(html.includes('&lt;img src=x onerror=bad()&gt;'));
  assert.ok(!html.includes('</script><script>bad()'));
  assert.ok(html.includes('const quiz = [{"q":'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-v2-gate-'));
  try {
    const target = path.join(dir, '课堂作业.html');
    const valid = assembleClassworkV2(fixture(), identity);
    assert.equal(publishClassworkV2(valid, target).errors, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), valid);
    assert.throws(() => publishClassworkV2(valid.replace('</body>', ''), target), /不完整/);
    assert.equal(fs.readFileSync(target, 'utf8'), valid);
    const cancelled = AbortSignal.abort();
    assert.throws(() => publishClassworkV2(valid, target, { signal: cancelled }));
    assert.equal(fs.readFileSync(target, 'utf8'), valid);
    assert.deepEqual(fs.readdirSync(dir), ['课堂作业.html']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('V1 retains its exact frozen system prompt; V2 integration changes only the opted-in branch', async () => {
  const { generateLessonFiles } = await import('../web/services/ai.js');
  const { dbService } = await import('../web/db.js');
  const getSetting = dbService.getSetting;
  const fetch = globalThis.fetch;
  const previousMode = process.env.AI_HTML_GENERATOR;
  const previousDiagnostics = process.env.AI_GENERATION_DIAGNOSTICS;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-v2-pipeline-'));
  const legacy = fs.readFileSync(new URL('../resources/prompts/legacy-skill-v1.md', import.meta.url), 'utf8');
  dbService.getSetting = key => ({ ai_api_key: 'test', ai_model: 'test-model' })[key];
  try {
    for (const mode of ['v1', 'v2']) {
      process.env.AI_HTML_GENERATOR = mode;
      process.env.AI_GENERATION_DIAGNOSTICS = '0';
      let calls = 0;
      globalThis.fetch = async (_, req) => {
        calls++;
        const body = JSON.parse(req.body);
        if (calls === 1) {
          if (mode === 'v1') assert.equal(body.messages[0].content, legacy);
          else { assert.ok(body.messages[0].content.includes('### 模块三')); assert.ok(!body.messages[0].content.includes('### 模块四')); }
        } else if (mode === 'v2') {
          assert.ok(!body.messages[0].content.includes('grid-2'));
          assert.ok(body.messages[1].content.includes('plan-full-context'));
        }
        const content = calls === 1 ? '===FILE: 教案.md===\nplan-full-context 灯泡权值探究\n===FILE: 导学案.md===\nworksheet 灯泡权值探究\n===FILE: 课件.md===\nslides 灯泡权值探究'
          : mode === 'v2' ? JSON.stringify(fixture()) : '<!DOCTYPE html><html><head></head><body></body></html>';
        return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
      };
      const dir = path.join(root, mode);
      const files = await generateLessonFiles({ ...identity, targetDir: dir });
      assert.equal(calls, 2);
      assert.equal(files.length, 4);
      const htmlName = files.find(f => f.endsWith('.html'));
      const result = fs.readFileSync(path.join(dir, htmlName), 'utf8');
      assert.equal(result.includes('name="lesson-engine" content="v2"'), mode === 'v2');
      assert.equal(fs.existsSync(path.join(dir, 'HTML_V2_教师说明.txt')), mode === 'v2');
    }
  } finally {
    dbService.getSetting = getSetting;
    globalThis.fetch = fetch;
    for (const [key, previous] of [['AI_HTML_GENERATOR', previousMode], ['AI_GENERATION_DIAGNOSTICS', previousDiagnostics]]) {
      if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('V2 task names must be shared by all three existing documents', () => {
  const payload = fixture();
  assert.doesNotThrow(() => validateSourceTasks(payload, { plan:'灯泡权值探究',worksheet:'任务：灯泡权值探究',slides:'灯泡权值探究' }));
  assert.throws(() => validateSourceTasks(payload, { plan:'灯泡权值探究',worksheet:'另一个任务',slides:'灯泡权值探究' }), /共同出现/);
});
