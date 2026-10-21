import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));

export function assertFileMarkers(raw, phase) {
  const names = [...raw.matchAll(/===FILE:\s*([^\n\r=]+)===/g)].map(m => m[1].trim());
  // Preserve legacy bare-HTML fallback; document stage always requires markers.
  if (phase === 'classwork' && names.length === 0) return;
  const types = names.map(name => name.includes('教案') ? 'plan'
    : name.includes('导学') ? 'worksheet' : name.includes('课件') ? 'slides'
      : name.includes('作业') ? 'classwork' : 'unknown');
  const expected = phase === 'documents' ? ['plan', 'worksheet', 'slides'] : ['classwork'];
  if (types.length !== expected.length || expected.some(type => types.filter(t => t === type).length !== 1)
    || names.some(name => /[\\/]/.test(name) || name.includes('..'))) {
    throw new Error('AI 文件标记缺失、重复或非法，未写入本阶段文件');
  }
}

export function createDiagnostics(targetDir) {
  return event => {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.appendFileSync(path.join(targetDir, 'generation-diagnostics.jsonl'),
        JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), ...event }) + '\n', 'utf8');
    } catch {
      console.warn('AI 元数据记录失败');
    }
  };
}

/** Structural completeness only; this does not certify behavior or teaching quality. */
export function assertCompleteFiles(files, phase) {
  const suffixes = phase === 'documents'
    ? ['_教案.md', '_导学案.md', '_课件.md'] : ['_课堂作业.html'];
  const names = Object.keys(files);
  if (names.length !== suffixes.length || suffixes.some(suffix => names.filter(n => n.endsWith(suffix)).length !== 1)) {
    throw new Error(`AI ${phase} 文件缺失或包含非预期文件，未写入本阶段文件`);
  }
  for (const [name, content] of Object.entries(files)) {
    if (path.basename(name) !== name || /[\\/]/.test(name) || !content.trim()) {
      throw new Error('AI 文件名或内容无效，未写入本阶段文件');
    }
    if (name.endsWith('.html')) {
      // Exclude comment/script/style text from document boundary checks.
      const markup = content.replace(/<!--[\s\S]*?-->/g, '')
        .replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi, '$1$3');
      const required = /^\s*<!doctype\s+html\s*>\s*<html\b[^>]*>[\s\S]*<head\b[^>]*>[\s\S]*<\/head\s*>\s*<body\b[^>]*>[\s\S]*<\/body\s*>\s*<\/html\s*>\s*$/i;
      if (!required.test(markup) || ['script', 'style', 'section'].some(tag =>
        (markup.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length !==
        (markup.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length)) {
        throw new Error('AI HTML 文档不完整，未写入课堂作业');
      }
    }
  }
}

/** Reuse the existing gate without editing content. Audit only during P1. */
export function auditClasswork(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-audit-'));
  try {
    const file = path.join(dir, '课堂作业.html');
    fs.writeFileSync(file, content, 'utf8');
    const result = spawnSync('uv', ['run', '--frozen', 'python', 'scripts/check_lesson.py', file], {
      cwd: rootDir, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
      windowsHide: true
    });
    const summary = result.stdout?.match(/合计: (\d+) 个错误, (\d+) 个提醒/);
    return summary && !result.error && [0, 1].includes(result.status)
      ? { status: 'checked', errors: Number(summary[1]), warnings: Number(summary[2]) }
      : { status: 'unavailable' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
