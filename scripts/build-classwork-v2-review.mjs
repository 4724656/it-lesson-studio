import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assembleClassworkV2, publishClassworkV2 } from '../web/services/classwork-v2.js';
const payload = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/classwork-v2/binary.json', import.meta.url), 'utf8'));
const html = assembleClassworkV2(payload, { gradeNum: 4, grade: '四年级上册', lessonTitle: '二进制灯泡' });
const target = new URL('../docs/html-v2/review/binary_课堂作业.html', import.meta.url);
publishClassworkV2(html, fileURLToPath(target));
console.log('Built docs/html-v2/review/binary_课堂作业.html (engineering review fixture, not a full lesson)');
