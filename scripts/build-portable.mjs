#!/usr/bin/env node
/**
 * IT Lesson Studio - Windows 免安装单机便携版 (方案 B: All-in-One) 自动化打包脚本
 *
 * 用法:
 *   node scripts/build-portable.mjs [--no-zip]
 *
 * 产物:
 *   dist/IT-Lesson-Studio-便携版/        (免安装解压即用完整目录)
 *   dist/IT-Lesson-Studio-便携版.zip    (一键分发压缩包)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import archiver from '../web/node_modules/archiver/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DIST_ROOT = path.join(rootDir, 'dist');
const PACK_NAME = 'IT-Lesson-Studio-便携版';
const TARGET_DIR = path.join(DIST_ROOT, PACK_NAME);
const ZIP_PATH = path.join(DIST_ROOT, `${PACK_NAME}.zip`);

function logStep(step, msg) {
  console.log(`\n🔹 [${step}] ${msg}`);
}

function copyDirFiltered(src, dest, filterFn = () => true) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (!filterFn(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath, filterFn);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function resolveRealPandocExe() {
  const scoopPandoc = 'D:\\Scoop\\apps\\pandoc\\current\\pandoc.exe';
  if (fs.existsSync(scoopPandoc)) return scoopPandoc;
  try {
    const out = execFileSync('where', ['pandoc'], { encoding: 'utf-8' }).trim().split(/\r?\n/)[0];
    // 如果是 scoop shim，解析同目录下的 .shim 文件获取真实路径
    if (out.endsWith('.exe')) {
      const shimFile = out.replace(/\.exe$/i, '.shim');
      if (fs.existsSync(shimFile)) {
        const shimContent = fs.readFileSync(shimFile, 'utf-8');
        const m = shimContent.match(/^path\s*=\s*"?([^"\r\n]+)"?/m);
        if (m && fs.existsSync(m[1])) return m[1];
      }
      return out;
    }
  } catch {}
  throw new Error('未找到 pandoc.exe，无法构建全功能便携包');
}

function resolvePythonHome() {
  const cfgPath = path.join(rootDir, '.venv', 'pyvenv.cfg');
  if (fs.existsSync(cfgPath)) {
    const content = fs.readFileSync(cfgPath, 'utf-8');
    const m = content.match(/^home\s*=\s*(.+)$/m);
    if (m) {
      const homeDir = m[1].trim();
      if (fs.existsSync(path.join(homeDir, 'python.exe'))) {
        return homeDir;
      }
    }
  }
  throw new Error('未能从 .venv/pyvenv.cfg 解析出有效的 CPython 基础目录');
}

function getDirSizeMB(dirPath) {
  let total = 0;
  function walk(p) {
    if (!fs.existsSync(p)) return;
    const stat = fs.statSync(p);
    if (stat.isFile()) {
      total += stat.size;
    } else if (stat.isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        walk(path.join(p, f));
      }
    }
  }
  walk(dirPath);
  return (total / (1024 * 1024)).toFixed(1);
}

async function createDistributionZip(sourceDir, outZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outZip);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, PACK_NAME);
    archive.finalize();
  });
}

async function main() {
  const skipZip = process.argv.includes('--no-zip');

  console.log('================================================================');
  console.log('   🚀 开始构建 IT Lesson Studio [Windows 免安装全功能便携包]');
  console.log('================================================================');

  // 1. 清理并初始化构建目录
  logStep('1/6', '清理旧构建目录并创建标准骨架...');
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  // 2. 复制项目核心业务代码与静态资产（排除个人数据与开发期垃圾）
  logStep('2/6', '复制核心教学引擎、模板、课标图谱与前端代码...');
  const batContent = [
    '@echo off',
    'cd /d "%~dp0"',
    'chcp 65001 >nul',
    'title IT Lesson Studio',
    'if exist "runtime\\node\\node.exe" (',
    '    "runtime\\node\\node.exe" "scripts\\start-portable.mjs"',
    ') else (',
    '    node "scripts\\start-portable.mjs"',
    ')',
    'if errorlevel 1 pause',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(rootDir, '启动备课工坊.bat'), batContent, 'ascii');
  fs.writeFileSync(path.join(TARGET_DIR, '启动备课工坊.bat'), batContent, 'ascii');
  fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(TARGET_DIR, 'package.json'));

  for (const dirName of ['references', 'resources', 'skills', 'examples']) {
    copyDirFiltered(
      path.join(rootDir, dirName),
      path.join(TARGET_DIR, dirName),
      (srcPath, entry) => !entry.name.endsWith('.tmp.md') && !entry.name.endsWith('.pyc')
    );
  }

  // 复制 scripts/ 核心运行脚本（排除测试与打包脚本本身）
  const scriptsDest = path.join(TARGET_DIR, 'scripts');
  fs.mkdirSync(scriptsDest, { recursive: true });
  for (const scriptFile of ['start-portable.mjs', 'export-lesson.mjs', 'beautify_docx.py', 'check_lesson.py', 'verify_layout.py', 'textbook_sources.json']) {
    const srcFile = path.join(rootDir, 'scripts', scriptFile);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(scriptsDest, scriptFile));
    }
  }

  // 复制根目录 node_modules (Marp 课件导出引擎)
  copyDirFiltered(
    path.join(rootDir, 'node_modules'),
    path.join(TARGET_DIR, 'node_modules'),
    (srcPath, entry) => entry.name !== '.cache'
  );

  // 复制 web/ 目录（排除真实 .env 与历史数据库 web/data）
  const webDest = path.join(TARGET_DIR, 'web');
  fs.mkdirSync(webDest, { recursive: true });
  for (const f of ['server.js', 'db.js', 'package.json']) {
    fs.copyFileSync(path.join(rootDir, 'web', f), path.join(webDest, f));
  }
  copyDirFiltered(path.join(rootDir, 'web', 'public'), path.join(webDest, 'public'));
  copyDirFiltered(path.join(rootDir, 'web', 'services'), path.join(webDest, 'services'));
  copyDirFiltered(path.join(rootDir, 'web', 'node_modules'), path.join(webDest, 'node_modules'));

  // 创建干净的 web/data 目录与默认单机版 web/.env
  fs.mkdirSync(path.join(webDest, 'data', 'workspaces'), { recursive: true });
  const cleanEnv = [
    '# ==========================================',
    '# IT Lesson Studio 单机便携版配置文件',
    '# ==========================================',
    'APP_MODE=standalone',
    'PORT=3800',
    'JWT_SECRET=it-lesson-studio-standalone-secret-2026',
    '',
    '# AI 密钥与模型可在启动后直接点击网页右上角【AI 引擎】图形化配置并自动保存',
    'AI_API_BASE=https://api.deepseek.com/v1',
    'AI_API_KEY=',
    'AI_MODEL=deepseek-chat',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(webDest, '.env'), cleanEnv, 'utf-8');

  // 3. 封装免安装绿色运行时 runtime/ (Node.js + Pandoc + Python)
  logStep('3/6', '注入免安装绿色运行时 (Node.js + Pandoc + Python 3.12)...');
  const runtimeDir = path.join(TARGET_DIR, 'runtime');

  // 3.1 Node.js
  const nodeDestDir = path.join(runtimeDir, 'node');
  fs.mkdirSync(nodeDestDir, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(nodeDestDir, 'node.exe'));
  console.log(`   ✔ 已内置 Node.js: ${process.execPath} (${getDirSizeMB(nodeDestDir)} MB)`);

  // 3.2 Pandoc
  const pandocExe = resolveRealPandocExe();
  const pandocDestDir = path.join(runtimeDir, 'pandoc');
  fs.mkdirSync(pandocDestDir, { recursive: true });
  fs.copyFileSync(pandocExe, path.join(pandocDestDir, 'pandoc.exe'));
  console.log(`   ✔ 已内置 Pandoc : ${pandocExe} (${getDirSizeMB(pandocDestDir)} MB)`);

  // 3.3 Python 3.12 + python-docx + lxml (精简免安装版)
  const pyHome = resolvePythonHome();
  const pyDestDir = path.join(runtimeDir, 'python');
  fs.mkdirSync(pyDestDir, { recursive: true });

  // 复制顶层解释器与运行时 DLL
  for (const entry of fs.readdirSync(pyHome, { withFileTypes: true })) {
    if (entry.isFile() && /\.(exe|dll|txt)$/i.test(entry.name)) {
      fs.copyFileSync(path.join(pyHome, entry.name), path.join(pyDestDir, entry.name));
    }
  }

  // 复制 DLLs (剔除无用的 tkinter/tcl/tk 与调试符号)
  copyDirFiltered(
    path.join(pyHome, 'DLLs'),
    path.join(pyDestDir, 'DLLs'),
    (srcPath, entry) => !/^(tcl|tk|_tkinter)/i.test(entry.name) && !entry.name.endsWith('.pdb')
  );

  // 复制标准库 Lib (剔除体积庞大且无关的 tkinter/test/idlelib/ensurepip/turtledemo)
  const excludedStdLibs = new Set(['test', 'tests', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', 'lib2to3', '__pycache__', 'site-packages']);
  copyDirFiltered(
    path.join(pyHome, 'Lib'),
    path.join(pyDestDir, 'Lib'),
    (srcPath, entry) => !excludedStdLibs.has(entry.name) && !entry.name.endsWith('.pyc')
  );

  // 复制排版必需的第三方包 (docx, lxml, typing_extensions) 到 runtime/python/Lib/site-packages
  const venvSitePackages = path.join(rootDir, '.venv', 'Lib', 'site-packages');
  const destSitePackages = path.join(pyDestDir, 'Lib', 'site-packages');
  fs.mkdirSync(destSitePackages, { recursive: true });

  const requiredPkgPrefixes = ['docx', 'python_docx', 'lxml', 'typing_extensions'];
  for (const entry of fs.readdirSync(venvSitePackages, { withFileTypes: true })) {
    if (requiredPkgPrefixes.some(prefix => entry.name.startsWith(prefix))) {
      const srcP = path.join(venvSitePackages, entry.name);
      const dstP = path.join(destSitePackages, entry.name);
      if (entry.isDirectory()) {
        copyDirFiltered(srcP, dstP, (p, e) => e.name !== '__pycache__' && !e.name.endsWith('.pyc'));
      } else {
        fs.copyFileSync(srcP, dstP);
      }
    }
  }
  console.log(`   ✔ 已内置 Python : ${pyHome} (精简后含 python-docx 共 ${getDirSizeMB(pyDestDir)} MB)`);

  // 4. 生成傻瓜式使用说明文件
  logStep('4/6', '生成教师极简使用说明文档...');
  const readmeTxt = [
    '====================================================================',
    '       IT Lesson Studio · 中小学信息科技四位一体备课工作台',
    '                    【Windows 免安装单机便携版】',
    '====================================================================',
    '',
    '✨ 零环境门槛：本便携包已内置全部编译引擎（Node.js + Pandoc + Python 公文排版），',
    '   您的电脑无需安装任何编程软件！',
    '',
    '【三步极速上手】',
    '1. 双击运行本目录下的 【启动备课工坊.bat】；',
    '2. 浏览器会自动弹出 http://localhost:3800 备课界面；',
    '3. 首次使用请点击网页右上角 【AI 引擎】 按钮，填入您的 API Key（支持 DeepSeek、',
    '   通义千问、OpenAI 或自定义中转地址）并点击保存，即可开始一键生成：',
    '   - 📄 备课教案 (.docx 公文精排，严格 ≤4 页)',
    '   - 📋 探究导学单 (.docx 学生视角，单面 A4 防溢出)',
    '   - 🖥️ 演示课件 (.pptx 与 .pdf 16:9 现代卡片式课件)',
    '   - 🎮 随堂互动作业 (.html 单文件微仿真互动闯关与学习凭单导出)',
    '',
    '【常见问题】',
    '- 问：备课期间黑窗口可以关掉吗？',
    '  答：请勿关闭黑窗口（将其最小化到任务栏即可），关闭黑窗口即代表停止本地备课服务。',
    '- 问：生成的历史资料保存在哪里？',
    '  答：全部保存在本目录的 web\\data\\workspaces 文件夹下，也可随时在网页右上角',
    '      【备课历史】中一键下载。',
    '====================================================================',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(TARGET_DIR, '使用说明.txt'), readmeTxt, 'utf-8');

  // 5. 自包含运行时全链路冒烟自检
  logStep('5/6', '执行内置绿色运行时自检 (模拟纯净无环境电脑)...');
  const bundledNode = path.join(runtimeDir, 'node', 'node.exe');
  const bundledPandoc = path.join(runtimeDir, 'pandoc', 'pandoc.exe');
  const bundledPython = path.join(runtimeDir, 'python', 'python.exe');

  const nodeVer = execFileSync(bundledNode, ['-v'], { encoding: 'utf-8' }).trim();
  const pandocVer = execFileSync(bundledPandoc, ['-v'], { encoding: 'utf-8' }).trim().split(/\r?\n/)[0];
  const pyCheck = execFileSync(bundledPython, ['-c', 'import docx, lxml; print("Python", __import__("sys").version.split()[0], "+ python-docx OK")'], {
    encoding: 'utf-8',
    env: { PATH: '' } // 故意清空 PATH，验证 100% 独立无外部依赖！
  }).trim();

  console.log(`   ✅ 内置 Node 自检通过   : ${nodeVer}`);
  console.log(`   ✅ 内置 Pandoc 自检通过 : ${pandocVer}`);
  console.log(`   ✅ 内置 Python 自检通过 : ${pyCheck}`);

  // 6. 打包成单一 .zip 分发包
  if (!skipZip) {
    logStep('6/6', `正在压缩生成一键分发包: ${ZIP_PATH} (请稍候)...`);
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
    const bytes = await createDistributionZip(TARGET_DIR, ZIP_PATH);
    const zipMB = (bytes / (1024 * 1024)).toFixed(1);
    console.log(`   🎉 ZIP 压缩包构建完成: ${ZIP_PATH} (${zipMB} MB)`);
  } else {
    logStep('6/6', '已跳过 ZIP 压缩 (--no-zip)');
  }

  console.log('\n================================================================');
  console.log(`✅ 便携版目录已就绪: ${TARGET_DIR} (总大小 ${getDirSizeMB(TARGET_DIR)} MB)`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ 构建便携包失败:', err);
  process.exit(1);
});
