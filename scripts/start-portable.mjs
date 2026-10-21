#!/usr/bin/env node
/**
 * IT Lesson Studio - Windows 单机便携版 Node 启动器
 *
 * 彻底规避 Windows cmd.exe 在中文路径及 UTF-8/GBK 编码切换下的字节偏移乱码问题，
 * 由 Node.js 原生 Unicode 环境接管路径解析、环境注入、端口检测与浏览器自动拉起。
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 强制锁定工作目录为项目根目录
process.chdir(rootDir);

// 注入单机模式环境变量与内置 runtime PATH
process.env.APP_MODE = 'standalone';
const PORT = Number(process.env.PORT) || 3800;
process.env.PORT = String(PORT);

const runtimeDirs = [
  path.join(rootDir, 'runtime', 'node'),
  path.join(rootDir, 'runtime', 'pandoc'),
  path.join(rootDir, 'runtime', 'python'),
].filter((d) => fs.existsSync(d));

if (runtimeDirs.length > 0) {
  process.env.PATH = [...runtimeDirs, process.env.PATH || ''].join(path.delimiter);
}

const hasNode = fs.existsSync(path.join(rootDir, 'runtime', 'node', 'node.exe'));
const hasPandoc = fs.existsSync(path.join(rootDir, 'runtime', 'pandoc', 'pandoc.exe'));
const hasPython = fs.existsSync(path.join(rootDir, 'runtime', 'python', 'python.exe'));

console.log('====================================================================');
console.log('   IT Lesson Studio · 中小学信息科技四位一体备课工作台');
console.log('                 [Windows 免安装单机便携版]');
console.log('====================================================================');
console.log('');
console.log(' [环境自检]');
console.log(`  * Node.js 运行引擎 : ${hasNode ? '已就绪 (内置绿色版)' : '已就绪 (系统环境)'}`);
console.log(`  * Pandoc 文档引擎  : ${hasPandoc ? '已就绪 (内置绿色版)' : '使用系统环境'}`);
console.log(`  * Python 公文精排  : ${hasPython ? '已就绪 (内置绿色版)' : '使用系统环境'}`);
console.log('');
console.log(` [服务地址] http://localhost:${PORT}`);
console.log(' [操作提示] 正在为您自动打开浏览器，备课期间请勿关闭本窗口（最小化即可）');
console.log('====================================================================');
console.log('');

function openBrowser(url) {
  if (process.env.NO_BROWSER === '1') return;
  if (process.platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, () => {});
  }
}

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function checkIsOurStudio(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/system/mode`, {
      signal: AbortSignal.timeout(1200)
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && typeof data.standalone === 'boolean' && typeof data.hasApiKey === 'boolean');
  } catch {
    return false;
  }
}

async function waitForPortReady(port, timeoutMs = 15000) {
  const startMs = Date.now();
  while (Date.now() - startMs < timeoutMs) {
    if (await checkPortInUse(port)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function start() {
  let targetPort = PORT;
  for (let offset = 0; offset < 10; offset++) {
    const candidate = PORT + offset;
    const inUse = await checkPortInUse(candidate);
    if (!inUse) {
      targetPort = candidate;
      break;
    }
    if (await checkIsOurStudio(candidate)) {
      console.log(` 💡 检测到备课工作台已在后台运行 (端口 ${candidate})，正在为您直接打开浏览器...`);
      openBrowser(`http://localhost:${candidate}`);
      setTimeout(() => process.exit(0), 2000);
      return;
    }
    console.log(` ⚠️ 端口 ${candidate} 已被其他程序占用，自动顺延尝试端口 ${candidate + 1}...`);
    targetPort = candidate + 1;
  }

  process.env.PORT = String(targetPort);

  // 直接加载并启动 Web 服务，待端口真正就绪后再拉起浏览器
  const serverEntry = pathToFileURL(path.join(rootDir, 'web', 'server.js')).href;
  await import(serverEntry);

  const ready = await waitForPortReady(targetPort);
  if (ready) {
    openBrowser(`http://localhost:${targetPort}`);
  }
}

start().catch((err) => {
  console.error('\n ❌ 启动失败:', err);
  process.exit(1);
});
