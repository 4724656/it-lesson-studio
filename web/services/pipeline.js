import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

export function runExportPipeline(targetDir) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(rootDir, 'scripts', 'export-lesson.mjs');
    const args = [scriptPath, targetDir];

    execFile(process.execPath, args, { cwd: rootDir }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Export failed: ${error.message}\n${stderr || stdout}`));
      }
      resolve({ stdout, stderr });
    });
  });
}
