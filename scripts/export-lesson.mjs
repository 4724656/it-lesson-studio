#!/usr/bin/env node
/**
 * it-lesson-studio 一键导出流水线
 *
 *   node scripts/export-lesson.mjs <课程目录或Markdown文件路径>
 *       [--no-pdf] [--no-pptx] [--output-dir=<目录>] [--verify-layout]
 *
 * - Marp 课件 (.md 含 marp:true) → .pptx / .pdf
 * - 教案 / 导学单 (.md) → .docx（Pandoc + beautify_docx.py 中文公文精排）
 *
 * 安全说明（P0-1）：
 *   所有外部命令一律使用 execFileSync(cmd, argsArray) 逐参数传递，
 *   shell 恒为 false。课程目录/文件名只作为 argv 出现，绝不拼进 shell
 *   字符串，从根上消除路径命令注入。回归测试：
 *   `npm test`（scripts/export-lesson.test.mjs）。
 *
 * 可靠性说明（P0-2）：
 *   导出前先规划全部任务，逐项执行并统计 成功/失败/总数；
 *   任一任务失败则最终以非零退出码退出，CI 不会把半成品当成功。
 *   --output-dir 可将产物隔离写入指定目录（默认写在源文件旁边）。
 *   --verify-layout 在导出后校验 DOCX 实际页数与课件页数（见
 *   scripts/verify_layout.py；严格模式：LibreOffice 不可用则直接 FAIL，
 *   不允许 WARN 跳过）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 资源路径配置
const pandocTemplate = path.join(rootDir, 'resources', 'pandoc', '模板.docx');
const luaFilter = path.join(rootDir, 'resources', 'pandoc', 'br.lua');
const marpTheme = path.join(rootDir, 'resources', 'themes', 'edu-lesson.css');
const beautifyScript = path.join(rootDir, 'scripts', 'beautify_docx.py');
const verifyScript = path.join(rootDir, 'scripts', 'verify_layout.py');

/**
 * 执行外部命令。cmd 与每个参数分离传递，shell 恒为 false：
 * 路径中的空格、中文、$()、反引号、分号都只会被当作普通字符。
 */
export function runCmd(cmd, args, opts = {}) {
  // P0-2 附带修复：强制 UTF-8 locale，否则 pandoc 在 POSIX locale 下无法处理中文路径/模板文件名
  const env = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', ...process.env, ...(opts.env || {}) };
  return execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], shell: false, ...opts, env });
}

/**
 * 解析 Marp 执行方式：优先用项目本地安装的 marp-cli（npm ci 后），
 * 以 `node marp-cli.js` 形式直跑，彻底避免 npx/平台差异；
 * 本地未安装时回退到 npx（POSIX 环境）。
 */
export function resolveMarpCommand() {
  const jsEntry = path.join(rootDir, 'node_modules', '@marp-team', 'marp-cli', 'marp-cli.js');
  if (fs.existsSync(jsEntry)) return { cmd: process.execPath, args: [jsEntry] };
  const localBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'marp.cmd' : 'marp');
  if (fs.existsSync(localBin)) return { cmd: localBin, args: [] };
  return { cmd: 'npx', args: ['@marp-team', 'marp-cli'] };
}

export function buildMarpArgs(mdFile, outFile) {
  const args = [mdFile, '--allow-local-files', '--theme-set', marpTheme, '-o', outFile];
  const chrome = resolveChromePath();
  if (chrome) args.push('--browser-path', chrome);
  return args;
}

/**
 * 解析可用的 Chrome/Chromium 二进制。
 * 顺序：环境变量 → puppeteer 缓存（真 Chrome）→ /usr/local/bin/chrome-headless →
 * 系统 google-chrome/chromium。注意 /usr/bin/chromium-browser 在本镜像中是
 * snap 假包，绝不直接采用。
 */
export function resolveChromePath() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  try {
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(cacheDir)) {
      const versions = fs.readdirSync(cacheDir).sort().reverse();
      for (const v of versions) {
        candidates.push(path.join(cacheDir, v, 'chrome-linux64', 'chrome'));
        candidates.push(path.join(cacheDir, v, 'chrome-mac', 'Google Chrome for Testing.app',
          'Contents', 'MacOS', 'Google Chrome for Testing'));
      }
    }
  } catch { /* 忽略 */ }
  candidates.push('/usr/local/bin/chrome-headless');
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium']) {
    try {
      const found = execFileSync('which', [bin], { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
        .toString().trim();
      if (found && !found.includes('chromium-browser')) candidates.push(found);
    } catch { /* 忽略 */ }
  }
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) {
        // root 运行 Chrome 必须 --no-sandbox：生成一次性包装脚本
        if (typeof process.getuid === 'function' && process.getuid() === 0) {
          return chromeNoSandboxWrapper(c);
        }
        return c;
      }
    } catch { /* 忽略 */ }
  }
  return null;
}

function chromeNoSandboxWrapper(realChrome) {
  // 必修3：不用 /tmp 下固定文件名（可被预置软链接劫持/覆盖），
  // 每次生成随机私有临时目录，路径不可预测。
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itls-chrome-'));
    fs.chmodSync(tmpDir, 0o700);
    const wrapPath = path.join(tmpDir, 'chrome-no-sandbox.sh');
    const content = `#!/bin/sh\nexec "${realChrome.replace(/"/g, '\\"')}" --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage "$@"\n`;
    // O_EXCL 语义：mkdtemp 已保证目录新建，目录内不可能有同名文件；
    // 若写入失败直接回退用原 Chrome 路径，不静默复用可疑旧文件。
    fs.writeFileSync(wrapPath, content, { mode: 0o755, flag: 'wx' });
    return wrapPath;
  } catch {
    return realChrome;
  }
}

export function buildPandocArgs(inputMd, docxOut, resourceDirs) {
  const args = [inputMd, '-o', docxOut, `--resource-path=${resourceDirs.join(path.delimiter)}`];
  if (fs.existsSync(pandocTemplate)) args.push(`--reference-doc=${pandocTemplate}`);
  if (fs.existsSync(luaFilter)) args.push(`--lua-filter=${luaFilter}`);
  return args;
}

// 递归查找指定目录下的所有 .md 文件
function findMarkdownFiles(dirOrFile) {
  const stat = fs.statSync(dirOrFile);
  if (stat.isFile()) {
    return dirOrFile.endsWith('.md') && !dirOrFile.endsWith('.tmp.md') ? [dirOrFile] : [];
  }
  const results = [];
  const entries = fs.readdirSync(dirOrFile, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirOrFile, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('.tmp.md')) {
      results.push(full);
    }
  }
  return results;
}

function getAvailableLessons() {
  const examplesDir = path.join(rootDir, 'examples');
  const lessons = [];
  if (fs.existsSync(examplesDir)) {
    for (const grade of fs.readdirSync(examplesDir)) {
      const gradePath = path.join(examplesDir, grade);
      try {
        if (fs.statSync(gradePath).isDirectory()) {
          for (const l of fs.readdirSync(gradePath)) {
            const lPath = path.join(gradePath, l);
            if (fs.statSync(lPath).isDirectory()) {
              lessons.push(`examples/${grade}/${l}`);
            }
          }
        }
      } catch {}
    }
  }
  return lessons;
}

async function main() {
  // 解析输入参数
  const args = process.argv.slice(2);
  const targetArg = args.find((arg) => !arg.startsWith('--'));

  if (!targetArg || args.includes('--help') || args.includes('-h')) {
    console.log(`\n📖 IT Lesson Studio 教学资料编译导出工具`);
    console.log(`使用方法: node scripts/export-lesson.mjs <课程目录或Markdown文件路径> [选项]\n`);
    console.log(`选项:`);
    console.log(`  --no-pdf          跳过 PDF 课件导出`);
    console.log(`  --no-pptx         跳过 PPTX 课件导出`);
    console.log(`  --verify-layout   导出后自动校验实际物理版式`);
    console.log(`  --output-dir=DIR  指定产物输出隔离目录\n`);

    const lessons = getAvailableLessons();
    if (lessons.length) {
      console.log(`💡 示例用法:`);
      console.log(`  node scripts/export-lesson.mjs ${lessons[0]}\n`);
      console.log(`📚 当前可用标杆课例:`);
      for (const item of lessons) {
        console.log(`  - ${item}`);
      }
      console.log(``);
    }
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const skipPdf = args.includes('--no-pdf');
  const skipPptx = args.includes('--no-pptx');
  const verifyLayout = args.includes('--verify-layout');
  const outDirOpt = args.find((a) => a.startsWith('--output-dir='));
  const outputDir = outDirOpt ? path.resolve(rootDir, outDirOpt.slice('--output-dir='.length)) : null;

  const targetPath = path.isAbsolute(targetArg) ? targetArg : path.resolve(rootDir, targetArg);

  // 必修2：拒绝仓库外的课程路径。--output-dir 做路径映射时用
  // path.relative(rootDir, absOut)，若课程在仓库外会产生 ../ 逃逸，
  // 导致产物写到隔离目录之外。直接拒绝，不做静默截断。
  {
    const rel = path.relative(rootDir, targetPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.error(`❌ 课程路径必须在仓库内，拒绝仓库外路径: ${targetPath}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ 目标路径不存在: ${targetPath}`);
    // 友好提示：列出 examples 下可用的课例目录
    const lessons = getAvailableLessons();
    if (lessons.length) {
      console.error(`💡 可用的课例目录：\n   - ${lessons.join('\n   - ')}`);
    }
    process.exit(1);
  }

  const mdFiles = findMarkdownFiles(targetPath);

  if (mdFiles.length === 0) {
    console.log(`ℹ️ 在 ${targetPath} 下未找到任何 .md 文件。`);
    process.exit(0);
  }

  console.log(`\n📦 开始一键导出备课文件 (${mdFiles.length} 个 Markdown 文件)...`);
  console.log(`📂 目标目录: ${path.relative(rootDir, targetPath) || '.'}`);
  if (outputDir) console.log(`📁 产物隔离输出到: ${path.relative(rootDir, outputDir) || '.'}`);
  console.log();

  // 将产物路径映射到隔离输出目录（保持相对结构），默认写在源文件旁边
  const mapOut = (absOut) => {
    if (!outputDir) return absOut;
    const rel = path.relative(rootDir, absOut);
    // 纵深防御：即使上游校验被绕过，也不允许映射结果逃出隔离目录
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.error(`❌ 产物路径映射逃逸被拦截: ${absOut}`);
      process.exit(1);
    }
    const mapped = path.join(outputDir, rel);
    fs.mkdirSync(path.dirname(mapped), { recursive: true });
    return mapped;
  };

  // 日志展示路径：仓库内用相对路径，仓库外（如隔离目录）用绝对路径
  const showPath = (absP) => {
    const rel = path.relative(rootDir, absP);
    return rel.startsWith('..') ? absP : rel;
  };

  // P0-2：先规划全部导出任务，再逐项执行并统计
  const tasks = [];
  for (const mdFile of mdFiles) {
    const content = fs.readFileSync(mdFile, 'utf-8');
    const dir = path.dirname(mdFile);
    const baseName = path.basename(mdFile, '.md');
    const isMarp = /---[\s\S]*?marp:\s*true[\s\S]*?---/.test(content);

    if (isMarp) {
      if (!skipPptx) tasks.push({ kind: 'pptx', mdFile, out: mapOut(path.join(dir, `${baseName}.pptx`)) });
      if (!skipPdf) tasks.push({ kind: 'pdf', mdFile, out: mapOut(path.join(dir, `${baseName}.pdf`)) });
    } else {
      tasks.push({ kind: 'docx', mdFile, dir, out: mapOut(path.join(dir, `${baseName}.docx`)) });
    }
  }

  const marp = resolveMarpCommand();
  let succeeded = 0;
  const failed = [];

  for (const task of tasks) {
    const relIn = showPath(task.mdFile);
    const relOut = showPath(task.out);
    try {
      if (task.kind === 'pptx' || task.kind === 'pdf') {
        console.log(`🖥️  [Marp] 正在导出 ${task.kind.toUpperCase()}: ${relIn} ➔ ${relOut}`);
        runCmd(marp.cmd, [...marp.args, ...buildMarpArgs(task.mdFile, task.out)], { cwd: rootDir });
        console.log(`   ✔ 成功生成 ${task.kind.toUpperCase()}: ${relOut}\n`);
      } else {
        console.log(`📝 [Pandoc] 正在导出 Word: ${relIn} ➔ ${relOut}`);
        const imagesDir = path.join(rootDir, 'examples', 'images');
        runCmd('pandoc', buildPandocArgs(task.mdFile, task.out, [task.dir, imagesDir]), { cwd: rootDir });

        // 中文专业排版后处理（首行缩进两格、黑体标题、宋体正文、表格防断裂）
        if (fs.existsSync(beautifyScript)) {
          try {
            // 自适应 Python 运行环境：优先 uv，容器或原生 Linux 回退 python3
            let pyCmd = 'python3';
            let pyArgs = [beautifyScript, task.out];
            try {
              execFileSync(process.platform === 'win32' ? 'where' : 'which', ['uv'], { stdio: 'ignore' });
              pyCmd = 'uv';
              pyArgs = ['run', 'python', beautifyScript, task.out];
            } catch { /* 无 uv 时使用系统 python3 */ }

            runCmd(pyCmd, pyArgs, { stdio: ['ignore', 'ignore', 'inherit'], cwd: rootDir });
            console.log(`   ✨ 已自动应用中文公文级排版 (首行缩进2格·黑体大纲·宋体正文·表格美化)`);
          } catch (postErr) {
            console.warn(`   ⚠️ 后处理排版优化跳过: ${postErr.message}`);
          }
        }
        console.log(`   ✔ 成功生成 Word: ${relOut}\n`);
      }
      succeeded++;
    } catch (err) {
      console.error(`   ✖ 导出失败 [${task.kind}] ${relIn}: ${err.message}\n`);
      failed.push(`${task.kind}: ${relIn}`);
    }
  }

  const total = tasks.length;
  console.log(`📊 导出结果：成功 ${succeeded} / 失败 ${failed.length} / 共 ${total} 个任务`);
  if (failed.length) {
    for (const f of failed) console.error(`   ✖ ${f}`);
    console.error(`\n❌ 导出未完成（${failed.length} 个任务失败），退出码 1。`);
    process.exit(1);
  }

  // P1-5：导出后校验实际版式（DOCX 真实页数 / 课件页数）
  if (verifyLayout) {
    console.log(`\n🔍 正在校验实际版式（DOCX 真实页数 / 课件页数）...`);
    const verifyTarget = outputDir || targetPath;
    // 必修1：隔离导出时产物与源分离，显式传入源 lesson.yaml，
    // 避免 verify_layout.py 找不到 manifest 而把 duplex 导学单误按 1 页检查
    const manifestCandidates = [
      path.join(targetPath, 'lesson.yaml'),
      path.join(path.dirname(targetPath), 'lesson.yaml'),
    ];
    const manifestPath = manifestCandidates.find((p) => fs.existsSync(p));
    let verifyCmd = 'python3';
    let verifyArgs = [verifyScript, '--strict'];
    try {
      execFileSync(process.platform === 'win32' ? 'where' : 'which', ['uv'], { stdio: 'ignore' });
      verifyCmd = 'uv';
      verifyArgs = ['run', 'python', verifyScript, '--strict'];
    } catch { /* 无 uv 时使用系统 python3 */ }
    if (manifestPath) verifyArgs.push('--manifest', manifestPath);
    verifyArgs.push(verifyTarget);
    try {
      runCmd(verifyCmd, verifyArgs, { cwd: rootDir });
    } catch (err) {
      console.error(`\n❌ 版式校验未通过，退出码 1。`);
      process.exit(1);
    }
  }

  console.log(`\n🎉 导出完成！共成功处理 ${succeeded} 个导出任务。\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((err) => {
    console.error(`❌ 导出流水线异常: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
}
