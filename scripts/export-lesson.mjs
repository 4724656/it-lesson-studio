#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import zlib from 'node:zlib';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 资源路径配置
const pandocTemplate = path.join(rootDir, 'resources', 'pandoc', '模板.docx');
const luaFilter = path.join(rootDir, 'resources', 'pandoc', 'br.lua');
const marpTheme = path.join(rootDir, 'resources', 'themes', 'edu-lesson.css');

// 自动渲染 Mermaid 图像到本地 (带离线机房 3 秒快速超时降级保护)
async function downloadMermaidPng(mermaidText, outputPath) {
  const state = JSON.stringify({ code: mermaidText, mermaid: { theme: 'default' } });
  const data = Buffer.from(state, 'utf8');
  const compressed = zlib.deflateSync(data, { level: 9 });
  const encoded = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const url = `https://mermaid.ink/img/pako:${encoded}`;
  
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 3000 }, (res) => {
      if (res.statusCode !== 200) {
         reject(new Error(`Mermaid 服务返回 HTTP ${res.statusCode}`));
         return;
      }
      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
         fileStream.close();
         resolve();
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('网络请求超时(3s)，机房离线保护生效，已优雅跳过'));
    });
    req.on('error', reject);
  });
}

// 异步替换函数
async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
}

// 解析输入参数
const args = process.argv.slice(2);
const targetArg = args.find(arg => !arg.startsWith('--')) || 'examples/demo-lesson';
const skipPdf = args.includes('--no-pdf');
const skipPptx = args.includes('--no-pptx');

const targetPath = path.isAbsolute(targetArg) ? targetArg : path.resolve(rootDir, targetArg);

if (!fs.existsSync(targetPath)) {
  console.error(`❌ 目标路径不存在: ${targetPath}`);
  process.exit(1);
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

const mdFiles = findMarkdownFiles(targetPath);

if (mdFiles.length === 0) {
  console.log(`ℹ️ 在 ${targetPath} 下未找到任何 .md 文件。`);
  process.exit(0);
}

console.log(`\n📦 开始一键导出备课文件 (${mdFiles.length} 个 Markdown 文件)...`);
console.log(`📂 目标目录: ${path.relative(rootDir, targetPath) || '.'}\n`);

let successCount = 0;

// 使用 async/await 顶层循环
for (const mdFile of mdFiles) {
  const relPath = path.relative(rootDir, mdFile);
  const content = fs.readFileSync(mdFile, 'utf-8');
  const dir = path.dirname(mdFile);
  const baseName = path.basename(mdFile, '.md');

  // 判断是否为 Marp 课件
  const isMarp = /---[\s\S]*?marp:\s*true[\s\S]*?---/.test(content);

  if (isMarp) {
    // 1. 导出 PPTX (默认同时导出，除非传入 --no-pptx)
    if (!skipPptx) {
      const pptxOut = path.join(dir, `${baseName}.pptx`);
      const pptxRel = path.relative(rootDir, pptxOut);
      console.log(`🖥️  [Marp] 正在导出 PPTX: ${relPath} ➔ ${pptxRel}`);

      try {
        execSync(`npx @marp-team/marp-cli "${mdFile}" --allow-local-files --theme-set "${marpTheme}" -o "${pptxOut}"`, {
          stdio: ['ignore', 'inherit', 'inherit'],
          cwd: rootDir
        });
        console.log(`   ✔ 成功生成 PPTX: ${pptxRel}\n`);
        successCount++;
      } catch (err) {
        console.error(`   ✖ Marp PPTX 导出失败: ${err.message}\n`);
      }
    }

    // 2. 导出 PDF (默认同时导出，除非传入 --no-pdf)
    if (!skipPdf) {
      const pdfOut = path.join(dir, `${baseName}.pdf`);
      const pdfRel = path.relative(rootDir, pdfOut);
      console.log(`📄 [Marp] 正在导出 PDF: ${relPath} ➔ ${pdfRel}`);

      try {
        execSync(`npx @marp-team/marp-cli "${mdFile}" --allow-local-files --theme-set "${marpTheme}" -o "${pdfOut}"`, {
          stdio: ['ignore', 'inherit', 'inherit'],
          cwd: rootDir
        });
        console.log(`   ✔ 成功生成 PDF: ${pdfRel}\n`);
        successCount++;
      } catch (err) {
        console.error(`   ✖ Marp PDF 导出失败: ${err.message}\n`);
      }
    }
  } else {
    // 导出 Word (.docx)
    const docxOut = path.join(dir, `${baseName}.docx`);
    const docxRel = path.relative(rootDir, docxOut);
    console.log(`📝 [Pandoc] 正在导出 Word: ${relPath} ➔ ${docxRel}`);

    try {
      // 预处理：扫描 Mermaid 并转为图片，统一存储在 examples/images
      const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
      let mermaidIndex = 1;
      const unifiedImagesDir = path.join(rootDir, 'examples', 'images');
      if (!fs.existsSync(unifiedImagesDir)) fs.mkdirSync(unifiedImagesDir, { recursive: true });
      
      let newContent = await replaceAsync(content, mermaidRegex, async (match, mermaidCode) => {
         const imgName = `${baseName}_mermaid_${mermaidIndex++}.png`;
         const imgPath = path.join(unifiedImagesDir, imgName);
         
         console.log(`   🎨 [Kroki] 正在云端渲染 Mermaid 板书为图片: ${imgName}...`);
         try {
             await downloadMermaidPng(mermaidCode.trim(), imgPath);
             const relToImg = path.relative(dir, imgPath).replace(/\\/g, '/');
             // 返回 Markdown 插入图片的语法（留空 alt 避免 Pandoc 在 Word 图片下方输出图注标题）
             return `![](${relToImg})`;
         } catch(e) {
             console.warn(`   ⚠️ 跳过 Mermaid 渲染 (机房离线保护): ${e.message}`);
             return match; // 失败则原样保留代码块，绝不挂起导出流水线
         }
      });
      
      let processedMdFile = mdFile;
      let tempFileCreated = false;
      if (newContent !== content) {
          processedMdFile = path.join(dir, `${baseName}.tmp.md`);
          fs.writeFileSync(processedMdFile, newContent, 'utf-8');
          tempFileCreated = true;
      }

      const hasLua = fs.existsSync(luaFilter);
      const hasTpl = fs.existsSync(pandocTemplate);

      let cmd = `pandoc "${processedMdFile}" -o "${docxOut}" --resource-path="${dir}${path.delimiter}${unifiedImagesDir}"`;
      if (hasTpl) cmd += ` --reference-doc="${pandocTemplate}"`;
      if (hasLua) cmd += ` --lua-filter="${luaFilter}"`;

      execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'], cwd: rootDir });

      // 中文专业排版后处理（首行缩进两格、黑体标题、宋体正文、表格防断裂）
      const beautifyScript = path.join(rootDir, 'scripts', 'beautify_docx.py');
      if (fs.existsSync(beautifyScript)) {
        try {
          execSync(`uv run --with python-docx python "${beautifyScript}" "${docxOut}"`, {
            stdio: ['ignore', 'ignore', 'inherit'],
            cwd: rootDir
          });
          console.log(`   ✨ 已自动应用中文公文级排版 (首行缩进2格·黑体大纲·宋体正文·表格美化)`);
        } catch (postErr) {
          console.warn(`   ⚠️ 后处理排版优化跳过: ${postErr.message}`);
        }
      }

      console.log(`   ✔ 成功生成 Word: ${docxRel}\n`);
      successCount++;
      
      if (tempFileCreated) {
          fs.unlinkSync(processedMdFile);
      }
    } catch (err) {
      console.error(`   ✖ Pandoc 导出失败: ${err.message}\n`);
    }
  }
}

console.log(`🎉 导出完成！共成功处理 ${successCount} 个导出任务。\n`);
