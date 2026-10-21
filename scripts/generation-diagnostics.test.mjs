import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { callLlmApi } from '../web/services/llm.js';
import { assertFileMarkers, assertCompleteFiles, auditClasswork, createDiagnostics } from '../web/services/generation-diagnostics.js';

const html = '<!DOCTYPE html><html><head></head><body><section></section><script>const x = 1;</script></body></html>';
const args = { apiBase: 'https://example.invalid/v1/', apiKey: 'secret-key', model: 'test-model', messages: [{ role: 'user', content: 'private-material' }] };
const response = (content, finish_reason = 'stop', usage) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }], usage }), { status: 200 });

async function withFetch(mock, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await fn(); } finally { globalThis.fetch = previous; }
}

test('API metadata contains actual usage, finish reason and elapsed time without content or key', async () => {
  const records = [];
  await withFetch(async (url, request) => {
    assert.equal(url, 'https://example.invalid/v1/chat/completions');
    assert.deepEqual(JSON.parse(request.body), { model: args.model, messages: args.messages, temperature: 0.3 });
    return response('lesson', 'stop', { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 });
  }, async () => {
    assert.equal(await callLlmApi({ ...args, onMetadata: m => records.push(m) }), 'lesson');
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].usage.total_tokens, 140);
  assert.equal(records[0].finishReason, 'stop');
  assert.equal(records[0].status, 'success');
  assert.ok(records[0].elapsedMs >= 0);
  assert.ok(!/secret-key|private-material|lesson/.test(JSON.stringify(records)));
});

test('opt-in truncation/content-filter guard rejects even a well-closed HTML', async () => {
  for (const reason of ['length', 'max_tokens', 'content_filter']) {
    const records = [];
    await withFetch(async () => response(html, reason), async () => {
      await assert.rejects(callLlmApi({ ...args, onMetadata: m => records.push(m) }), /未完整结束/);
    });
    assert.equal(records[0].status, 'incomplete');
  }
  await withFetch(async () => response(html, 'length'), async () => {
    assert.equal(await callLlmApi(args), html, 'disabled diagnostics retains legacy output');
  });
});

test('missing usage/reason remains explicitly unknown; empty output is rejected', async () => {
  let metadata;
  await withFetch(async () => response('lesson', null), async () => {
    await callLlmApi({ ...args, onMetadata: m => { metadata = m; } });
  });
  assert.equal(metadata.finishReason, null);
  assert.deepEqual(metadata.usage, { prompt_tokens: null, completion_tokens: null, total_tokens: null });
  await withFetch(async () => response('   '), async () => {
    await assert.rejects(callLlmApi({ ...args, onMetadata() {} }), /有效内容/);
  });
});

test('HTTP, JSON, network and cancellation failures emit exactly one safe metadata event', async () => {
  for (const mode of ['http', 'json', 'network', 'cancel']) {
    const records = [];
    const controller = new AbortController();
    await withFetch(async () => {
      if (mode === 'http') return new Response('private-provider-error', { status: 429 });
      if (mode === 'json') return new Response('not-json');
      if (mode === 'cancel') controller.abort();
      throw new Error('private-provider-error');
    }, async () => {
      await assert.rejects(callLlmApi({ ...args, signal: controller.signal, onMetadata: m => records.push(m) }));
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].status, mode === 'cancel' ? 'cancelled' : 'request_failed');
    assert.ok(!JSON.stringify(records).includes('private-provider-error'));
  }
});

test('metadata sink failure does not invalidate successful response', async () => {
  await withFetch(async () => response('lesson'), async () => {
    assert.equal(await callLlmApi({ ...args, onMetadata() { throw new Error('disk full'); } }), 'lesson');
  });
});

test('phase integrity detects missing, empty, extra and unsafe files without changing content', () => {
  const docs = { 'x_教案.md': 'plan', 'x_导学案.md': 'worksheet', 'x_课件.md': 'slides' };
  assert.doesNotThrow(() => assertCompleteFiles(docs, 'documents'));
  assert.throws(() => assertCompleteFiles({ 'x_教案.md': 'plan' }, 'documents'), /缺失/);
  assert.throws(() => assertCompleteFiles({ ...docs, 'x_课件.md': '' }, 'documents'), /无效/);
  assert.throws(() => assertCompleteFiles({ ...docs, 'extra.md': 'extra' }, 'documents'), /缺失/);
  assert.throws(() => assertCompleteFiles({ '../x_课堂作业.html': html }, 'classwork'), /无效/);
  assert.doesNotThrow(() => assertCompleteFiles({ 'x_课堂作业.html': html }, 'classwork'));
  for (const broken of [html.replace('</html>', ''), html.replace('</script>', ''), html.replace('</section>', ''), '<!-- ' + html + ' -->']) {
    assert.throws(() => assertCompleteFiles({ 'x_课堂作业.html': broken }, 'classwork'), /不完整/);
  }
});

test('raw audit exposes syntax errors and never mutates source', () => {
  const source = fs.readFileSync(new URL('../examples/三年级上/第02课_了解智能工具/02_了解智能工具_课堂作业.html', import.meta.url), 'utf8');
  assert.deepEqual(auditClasswork(source), { status: 'checked', errors: 0, warnings: 0 });
  const broken = source.replace('</script>', 'const invalid = ;</script>');
  assert.ok(auditClasswork(broken).errors > 0);
});

test('generation opt-in saves metadata; failed phase 2 preserves existing HTML and phase 1 files', async () => {
  const { generateLessonFiles } = await import('../web/services/ai.js');
  const { dbService } = await import('../web/db.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-p1-'));
  const previousSetting = dbService.getSetting;
  const previousEnv = process.env.AI_GENERATION_DIAGNOSTICS;
  const classworkName = '三年级上册_测试课_课堂作业.html';
  dbService.getSetting = key => ({ ai_api_key: 'secret-key', ai_model: 'test-model' })[key];
  process.env.AI_GENERATION_DIAGNOSTICS = '1';
  try {
    fs.writeFileSync(path.join(dir, classworkName), 'successful-existing-v1');
    let calls = 0;
    await withFetch(async () => ++calls === 1
      ? response('===FILE: 教案.md===\nplan\n===FILE: 导学案.md===\nworksheet\n===FILE: 课件.md===\nslides')
      : response('===FILE: 课堂作业.html===\n' + html, 'length'), async () => {
      await assert.rejects(generateLessonFiles({ grade: '三年级上册', lessonTitle: '测试课', targetDir: dir }), /未完整结束/);
    });
    assert.equal(calls, 2, 'no hidden retries');
    assert.equal(fs.readFileSync(path.join(dir, classworkName), 'utf8'), 'successful-existing-v1');
    assert.equal(fs.readFileSync(path.join(dir, '三年级上册_测试课_教案.md'), 'utf8'), 'plan');
    const records = fs.readFileSync(path.join(dir, 'generation-diagnostics.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(records.filter(x => x.type === 'api').length, 2);
    assert.equal(records.at(-1).status, 'incomplete');
  } finally {
    dbService.getSetting = previousSetting;
    if (previousEnv === undefined) delete process.env.AI_GENERATION_DIAGNOSTICS;
    else process.env.AI_GENERATION_DIAGNOSTICS = previousEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('JSONL writer appends independent records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-events-'));
  try {
    const record = createDiagnostics(dir);
    record({ type: 'api', phase: 'documents' });
    record({ type: 'api', phase: 'classwork' });
    const events = fs.readFileSync(path.join(dir, 'generation-diagnostics.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.length, 2);
    assert.ok(events.every(x => x.schemaVersion === 1));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('duplicate or unexpected raw markers cannot be hidden by filename normalization', () => {
  assert.throws(() => assertFileMarkers('===FILE: 教案.md===a===FILE: 教案.md===b===FILE: 导学案.md===c===FILE: 课件.md===d', 'documents'), /重复/);
  assert.throws(() => assertFileMarkers('===FILE: ../课堂作业.html===x', 'classwork'), /非法/);
  assert.throws(() => assertFileMarkers('===FILE: notes.md===x', 'classwork'), /非法/);
  assert.doesNotThrow(() => assertFileMarkers(html, 'classwork'));
});

test('successful opt-in and disabled runs produce byte-identical V1 artifacts with two API calls', async () => {
  const { generateLessonFiles } = await import('../web/services/ai.js');
  const { dbService } = await import('../web/db.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-compat-'));
  const previousSetting = dbService.getSetting;
  const previousEnv = process.env.AI_GENERATION_DIAGNOSTICS;
  dbService.getSetting = key => ({ ai_api_key: 'secret-key', ai_model: 'test-model' })[key];
  const source = fs.readFileSync(new URL('../examples/三年级上/第02课_了解智能工具/02_了解智能工具_课堂作业.html', import.meta.url), 'utf8');
  try {
    for (const enabled of ['0', '1']) {
      process.env.AI_GENERATION_DIAGNOSTICS = enabled;
      let calls = 0;
      await withFetch(async () => ++calls === 1
        ? response('===FILE: 教案.md===\nplan\n===FILE: 导学案.md===\nworksheet\n===FILE: 课件.md===\nslides')
        : response('===FILE: 课堂作业.html===\n' + source), async () => {
        const files = await generateLessonFiles({ grade: '三年级上册', lessonTitle: '了解智能工具', targetDir: path.join(root, enabled) });
        assert.equal(files.length, 4);
      });
      assert.equal(calls, 2);
    }
    const names = fs.readdirSync(path.join(root, '0'));
    assert.equal(names.length, 4, 'disabled mode does not write diagnostics');
    for (const name of names) assert.deepEqual(fs.readFileSync(path.join(root, '0', name)), fs.readFileSync(path.join(root, '1', name)));
    const events = fs.readFileSync(path.join(root, '1', 'generation-diagnostics.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.filter(e => e.type === 'api').length, 2);
    assert.equal(events.find(e => e.type === 'audit').before.status, 'checked');
    assert.equal(events.find(e => e.type === 'audit').after.status, 'checked');
    assert.doesNotThrow(() => assertCompleteFiles({ 'x_课堂作业.html': html.replace('const x = 1;', 'const x = "<section>";') }, 'classwork'));
  } finally {
    dbService.getSetting = previousSetting;
    if (previousEnv === undefined) delete process.env.AI_GENERATION_DIAGNOSTICS;
    else process.env.AI_GENERATION_DIAGNOSTICS = previousEnv;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
