import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pptxgen from 'pptxgenjs';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'artifacts', 'ppt-humanize-spike');
const source = path.join(root, 'examples', '八年级上', '第12课_数据解密', '12_数据解密_课件.md');
fs.mkdirSync(outDir, { recursive: true });

const C = { ink: '152238', muted: '506176', paper: 'FAFBFC', line: 'D9E1EA', blue: '2166E5', cyan: '19B5D8', amber: 'F3A526', red: 'E45C4C', green: '1D9A6C', paleBlue: 'EEF5FF', paleAmber: 'FFF7E8', paleGreen: 'EBF8F1', code: '162235' };
const S = { w: 13.333, h: 7.5, m: 0.56 };
const font = 'Microsoft YaHei';
const mono = 'Aptos Mono';
let pptx;

function run(cmd, args) { execFileSync(cmd, args, { stdio: 'inherit', cwd: root }); }
function rect(slide, x, y, w, h, fill, line = fill, radius = 0.12) { slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x, y, w, h, rectRadius: radius, fill: { color: fill }, line: { color: line, transparency: line === fill ? 100 : 0 } }); }
function text(slide, value, x, y, w, h, opts = {}) { slide.addText(value, { x, y, w, h, fontFace: opts.fontFace || font, fontSize: opts.fontSize || 18, color: opts.color || C.ink, bold: opts.bold || false, margin: 0, breakLine: false, fit: 'shrink', valign: opts.valign || 'mid', align: opts.align || 'left', paraSpaceAfterPt: 0, bullet: opts.bullet, ...opts }); }
function title(slide, kicker, heading, sub = '') { text(slide, kicker.toUpperCase(), S.m, 0.42, 4.2, 0.24, { fontSize: 8.5, color: C.blue, bold: true, charSpacing: 1.3 }); text(slide, heading, S.m, 0.70, 11.8, 0.55, { fontSize: 27, bold: true }); if (sub) text(slide, sub, S.m, 1.30, 11.7, 0.3, { fontSize: 11, color: C.muted }); slide.addShape(pptx.ShapeType.line, { x: S.m, y: 1.73, w: 12.2, h: 0, line: { color: C.line, width: 1 } }); }
function footer(slide, n) { text(slide, `试点页 ${n}  ·  数据解密`, S.m, 7.06, 5, 0.18, { fontSize: 7.5, color: '8190A2' }); }
function check(slide, x, y, label) { rect(slide, x, y, 1.55, 0.32, 'FFFFFF', C.line, 0.08); text(slide, `□ ${label}`, x + 0.10, y + 0.03, 1.35, 0.18, { fontSize: 8.5, color: C.muted }); }

function makeNative() {
  pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'IT Lesson Studio';
  pptx.subject = 'PPT visual humanization spike';
  pptx.title = '数据解密 · 三页课堂课件试点';
  pptx.company = 'IT Lesson Studio';
  pptx.lang = 'zh-CN';
  pptx.theme = { headFontFace: font, bodyFontFace: font, lang: 'zh-CN' };

  // 1 Route
  { const s = pptx.addSlide(); s.background = { color: C.paper }; title(s, 'MISSION MAP', '破解神秘密信：今天走完这 3 步', '每完成一站，就离读懂密信更近一点。');
    const nodes = [
      ['01', '密钥探秘', '动作：向后移 / 向前移', '成果：会加密、会解密', C.amber, C.paleAmber],
      ['02', '变量追踪', '动作：单步观察 key · ch · plain', '成果：看懂程序怎么跑', C.blue, C.paleBlue],
      ['03', '逻辑排雷', '动作：找出并修复 3 处 bug', '成果：读出正确明文', C.green, C.paleGreen],
    ];
    s.addShape(pptx.ShapeType.line, { x: 1.75, y: 3.16, w: 10.00, h: 0, line: { color: C.line, width: 2.8, beginArrowType: 'none', endArrowType: 'triangle' } });
    rect(s, .56, 2.76, 1.26, .80, C.code, C.code, .12); text(s, 'KHOOR', .64, 2.98, 1.10, .26, { fontFace: mono, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center' }); text(s, '密文输入', .56, 3.65, 1.26, .16, { fontSize: 8.5, color: C.muted, align: 'center' });
    nodes.forEach((n, i) => { const x = 2.15 + i * 3.20; s.addShape(pptx.ShapeType.ellipse, { x, y: 2.57, w: 1.18, h: 1.18, fill: { color: n[4] }, line: { color: n[4] } }); text(s, n[0], x, 2.92, 1.18, .27, { fontSize: 16, bold: true, color: 'FFFFFF', align: 'center' }); rect(s, x - .64, 4.03, 2.46, 1.48, n[5], n[5], .16); text(s, n[1], x - .45, 4.28, 2.08, .28, { fontSize: 15, bold: true, align: 'center' }); text(s, n[2], x - .52, 4.72, 2.22, .24, { fontSize: 9.5, color: C.muted, align: 'center' }); text(s, n[3], x - .52, 5.12, 2.22, .22, { fontSize: 9.5, color: C.ink, bold: true, align: 'center' }); });
    rect(s, 11.72, 2.76, 1.12, .80, C.green, C.green, .12); text(s, 'HELLO', 11.76, 2.98, 1.04, .26, { fontFace: mono, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center' }); text(s, '读出明文', 11.72, 3.65, 1.12, .16, { fontSize: 8.5, color: C.muted, align: 'center' }); footer(s, 2); }

  // 2 concept
  { const s = pptx.addSlide(); s.background = { color: C.paper }; title(s, 'CONCEPT IN ACTION', '凯撒密码：同一把钥匙，方向相反', '先看一次真实变换，再把规则说出来。');
    text(s, '加密', .70, 2.03, 1.1, .24, { fontSize: 12, color: C.amber, bold: true, align: 'center' }); text(s, '解密', .70, 4.84, 1.1, .24, { fontSize: 12, color: C.blue, bold: true, align: 'center' });
    const letters = [['H','K'],['E','H'],['L','O'],['L','O'],['O','R']]; letters.forEach((p,i) => { const x=2.03+i*1.38; rect(s,x,1.95,.82,.70,'FFFFFF',C.line,.12); text(s,p[0],x,2.13,.82,.22,{fontFace:mono,fontSize:18,bold:true,align:'center'}); s.addShape(pptx.ShapeType.downArrow,{x:x+.22,y:2.76,w:.38,h:.55,fill:{color:C.amber},line:{color:C.amber}}); text(s,'+3',x+.04,3.37,.74,.18,{fontSize:10,bold:true,color:C.amber,align:'center'}); rect(s,x,3.73,.82,.70,C.paleAmber,C.paleAmber,.12); text(s,p[1],x,3.91,.82,.22,{fontFace:mono,fontSize:18,bold:true,align:'center'}); });
    text(s, 'KHOOR', 2.00, 5.20, 1.40, .26, { fontFace: mono, fontSize: 17, bold: true, align:'center' }); s.addShape(pptx.ShapeType.rightArrow,{x:3.53,y:5.13,w:1.15,h:.32,fill:{color:C.blue},line:{color:C.blue}}); text(s,'−3',3.83,5.56,.55,.18,{fontSize:11,bold:true,color:C.blue,align:'center'}); text(s, 'HELLO', 4.88, 5.20, 1.20, .26, { fontFace: mono, fontSize: 17, bold: true, align:'center' }); text(s,'解密：用同一密钥大小 3，反向移动。',6.55,5.20,3.5,.26,{fontSize:12,color:C.muted});
    rect(s, 9.93, 2.02, 2.66, 2.78, C.paleBlue, C.paleBlue, .16); text(s,'循环不是例外',10.20,2.33,2.12,.28,{fontSize:15,bold:true,align:'center'}); text(s,'X  →  A\nY  →  B\nZ  →  C',10.38,2.92,1.78,1.02,{fontFace:mono,fontSize:16,bold:true,align:'center',breakLine:true}); text(s,'超过 Z，从 A 接着数。',10.16,4.24,2.18,.22,{fontSize:10,color:C.muted,align:'center'}); footer(s, 5); }

  // 3 practice
  { const s = pptx.addSlide(); s.background = { color: C.paper }; title(s, 'DO IT IN BROWSER', '在浏览器完成变量追踪，PPT 只负责导航', '本页复刻课堂作业的关键控件；请在教师下发的 HTML 作业中实际操作。');
    rect(s,.62,2.00,7.45,4.35,C.code,C.code,.16); text(s,'解密程序单步追踪（密文 KHOOR，密钥 key = 3）',.95,2.30,5.85,.25,{fontSize:12,bold:true,color:'FFFFFF'}); text(s,'轮次：0 / 5',6.25,2.30,1.28,.20,{fontSize:10,color:'B9CAE0',align:'right'}); text(s,'从初始状态开始，每次点击“单步执行”后观察变量区。',.95,2.66,5.40,.22,{fontSize:10,color:'B9CAE0'}); rect(s,.95,3.14,4.55,.84,'20314B','20314B',.08); text(s,'>>> plain = ""   |   key = 3   |   等待单步执行…',1.20,3.43,4.05,.20,{fontFace:mono,fontSize:11,color:'E9F2FF'}); rect(s,5.80,3.14,1.32,.52,C.amber,C.amber,.10); text(s,'单步执行',5.95,3.30,1.02,.18,{fontSize:10,bold:true,color:'FFFFFF',align:'center'}); rect(s,1.00,4.32,6.02,1.12,'FFFFFF','FFFFFF',.08); text(s,'追踪提问',1.22,4.54,1.02,.18,{fontSize:10,bold:true,color:C.ink}); text(s,'① 第 3 轮循环后，plain 的值是什么？\n② 5 轮全部跑完，key 的值变了吗？',1.22,4.82,4.65,.42,{fontSize:10,color:C.muted,breakLine:true}); rect(s,5.83,4.61,1.18,.43,C.blue,C.blue,.08); text(s,'提交追踪答案',5.91,4.75,1.01,.14,{fontSize:7.5,bold:true,color:'FFFFFF',align:'center'}); text(s,'示意：真实操作在浏览器 HTML 作业中完成',.95,5.75,4.65,.18,{fontSize:8.5,color:'8FA4C2'});
    text(s,'按这个顺序做',8.70,2.07,3.35,.30,{fontSize:17,bold:true}); const steps=[['1','打开本课 HTML 作业的“变量追踪”关卡'],['2','从 0 / 5 开始，单步执行并观察变量'],['3','第 3 轮答 plain；第 5 轮答 key，再提交']]; steps.forEach((p,i)=>{const y=2.72+i*.84;s.addShape(pptx.ShapeType.ellipse,{x:8.70,y:y,w:.42,h:.42,fill:{color:i===2?C.green:C.blue},line:{color:i===2?C.green:C.blue}});text(s,p[0],8.70,y+.10,.42,.16,{fontSize:9.5,bold:true,color:'FFFFFF',align:'center'});text(s,p[1],9.30,y+.03,3.15,.31,{fontSize:11,bold:i===2});});
    rect(s,8.68,5.32,3.72,.65,C.paleGreen,C.paleGreen,.12); text(s,'完成标准：两题均已提交，并看到反馈',8.90,5.52,3.25,.20,{fontSize:10.5,bold:true,align:'center'}); text(s,'不要在投影片上点击按钮。',8.88,6.24,3.25,.18,{fontSize:9,color:C.muted,align:'center'}); footer(s, 6); }
  return pptx.writeFile({ fileName: path.join(outDir, '数据解密_原生PPTX_三页试点.pptx') });
}

function makeMarp() {
  const md = `---
marp: true
theme: trial-humanize
size: 16:9
paginate: false
style: |
  section { font-family: 'Microsoft YaHei', sans-serif; padding: 34px 54px; color:#152238; background:#FAFBFC; }
  h1 { font-size: 32px; margin: 0 0 8px; } p { margin: 5px 0; } .k { color:#2166E5; font-size:10px; font-weight:bold; letter-spacing:1.5px; } .sub { color:#506176; font-size:13px; border-bottom:1px solid #D9E1EA; padding-bottom:10px; } .route { display:flex; align-items:center; gap:10px; margin-top:70px; } .node { width:29%; text-align:center; } .num { margin:auto; width:55px; height:55px; line-height:55px; border-radius:50%; background:#2166E5; color:#fff; font-weight:bold; font-size:20px; } .node h2 { margin:14px 0 7px; font-size:22px; } .node p { font-size:13px; color:#506176; } .arrow { font-size:28px; color:#A8B5C4; } .finish { background:#162235; color:#fff; padding:10px 18px; border-radius:10px; font-family:monospace; font-weight:bold; } .grid { display:grid; grid-template-columns: 2.6fr 1fr; gap:35px; margin-top:28px; } .letters { display:flex; gap:14px; align-items:center; margin:12px 0; } .letter { width:48px; height:44px; border:1px solid #D9E1EA; border-radius:8px; text-align:center; line-height:44px; font-family:monospace; font-size:25px; font-weight:bold; background:#fff; } .to { font-size:18px; color:#F3A526; font-weight:bold; } .loop { background:#EEF5FF; padding:24px; border-radius:12px; text-align:center; } .loop code { font-size:24px; } .practice { display:grid; grid-template-columns: 1.6fr 1fr; gap:32px; margin-top:25px; } .screen { background:#162235; border-radius:12px; padding:25px; color:#E9F2FF; min-height:245px; } .screen code { font-size:20px; } .button { display:inline-block; background:#F3A526; color:#fff; padding:9px 22px; border-radius:7px; font-weight:bold; } .steps { font-size:17px; line-height:2.1; } .done { background:#EBF8F1; padding:14px; border-radius:9px; font-family:monospace; text-align:center; font-weight:bold; }
---

<!-- _class: route-slide -->
<p class="k">MISSION MAP</p>
# 破解神秘密信：今天走完这 3 步
<p class="sub">每完成一站，就离读懂密信更近一点。</p>
<div class="route"><div class="finish">密文<br>KHOOR</div><div class="arrow">→</div><div class="node"><div class="num" style="background:#F3A526">01</div><h2>密钥探秘</h2><p>加密 +3 / 解密 −3<br><b>成果：会加密、会解密</b></p></div><div class="arrow">→</div><div class="node"><div class="num">02</div><h2>变量追踪</h2><p>观察 key · ch · plain<br><b>成果：看懂程序怎么跑</b></p></div><div class="arrow">→</div><div class="node"><div class="num" style="background:#1D9A6C">03</div><h2>逻辑排雷</h2><p>找出并修复 3 处 bug<br><b>成果：读出正确明文</b></p></div><div class="arrow">→</div><div class="finish" style="background:#1D9A6C">明文<br>HELLO</div></div>

---

<p class="k">CONCEPT IN ACTION</p>
# 凯撒密码：同一把钥匙，方向相反
<p class="sub">先看一次真实变换，再把规则说出来。</p>
<div class="grid"><div><p><b style="color:#F3A526">加密：向后移 3 位</b></p><div class="letters"><span class="letter">H</span><span class="to">+3 ↓</span><span class="letter" style="background:#FFF7E8">K</span><span class="letter">E</span><span class="to">+3 ↓</span><span class="letter" style="background:#FFF7E8">H</span><span class="letter">L</span><span class="to">+3 ↓</span><span class="letter" style="background:#FFF7E8">O</span></div><p style="margin-top:35px"><code style="font-size:22px">KHOOR</code>　→　<b style="color:#2166E5">−3</b>　→　<code style="font-size:22px">HELLO</code></p><p style="color:#506176">解密：用同一密钥大小 3，反向移动。</p></div><div class="loop"><h2>循环不是例外</h2><code>X → A<br>Y → B<br>Z → C</code><p>超过 Z，从 A 接着数。</p></div></div>

---

<p class="k">DO IT NOW</p>
# 现在操作：把程序跑到第 3 轮
<p class="sub">在 HTML 课堂作业的“变量追踪”关卡完成记录。</p>
<div class="practice"><div class="screen"><b>变量追踪 · 第 3 轮</b><p style="color:#B9CAE0">点击「下一步」后，观察高亮行和变量区。</p><pre><code>key = 3
ch = "O"
plain = "HEL"</code></pre><span class="button">下一步　→</span></div><div class="steps"><b>完成这 3 件事</b><br>① 打开“变量追踪”关卡<br>② 每点一次“下一步”，记录一行<br>③ 填完第 3 轮，提交答案<div class="done">检查：第 3 轮 plain = HEL</div></div></div>`;
  const css = `/* @theme trial-humanize */\n@import 'default';`;
  fs.writeFileSync(path.join(outDir, '数据解密_Marp改良版_三页.md'), md);
  fs.writeFileSync(path.join(outDir, 'trial-humanize.css'), css);
  run('npx', ['@marp-team/marp-cli', path.join(outDir, '数据解密_Marp改良版_三页.md'), '--theme-set', outDir, '--allow-local-files', '--pptx', '--output', path.join(outDir, '数据解密_Marp改良版_三页.pptx')]);
  // Marp output inferred from output extension only produces PPTX; emit PDF separately.
  run('npx', ['@marp-team/marp-cli', path.join(outDir, '数据解密_Marp改良版_三页.md'), '--theme-set', outDir, '--allow-local-files', '--pdf', '--output', path.join(outDir, '数据解密_Marp改良版_三页.pdf')]);
}

await makeNative();
makeMarp();
console.log(`Created spike artifacts in ${outDir}`);
