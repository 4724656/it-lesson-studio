import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

export function createZipArchive(sourceDir, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });

    output.on('close', () => {
      resolve(zipFilePath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // 将目标目录中除临时文件外的内容打包
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['*.tmp.md', '*.log', '.DS_Store']
    });

    archive.finalize();
  });
}
