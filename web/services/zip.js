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

    // 严格筛选四位一体 4 份最终交付文件，杜绝源码与临时文件混入
    const files = fs.readdirSync(sourceDir);
    const planFile = files.find(f => f.includes('教案') && f.endsWith('.docx'));
    const worksheetFile = files.find(f => f.includes('导学') && f.endsWith('.docx'));
    const pptxFile = files.find(f => f.endsWith('.pptx'));
    const htmlFile = files.find(f => f.endsWith('.html'));

    const fourDeliverables = [planFile, worksheetFile, pptxFile, htmlFile].filter(Boolean);

    for (const file of fourDeliverables) {
      archive.file(path.join(sourceDir, file), { name: file });
    }

    archive.finalize();
  });
}
