import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { dbService } from './db.js';
import { generateLessonFiles } from './services/ai.js';
import { runExportPipeline } from './services/pipeline.js';
import { createZipArchive } from './services/zip.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3800;
const JWT_SECRET = process.env.JWT_SECRET || 'it-lesson-studio-secret-key-2026';
const INVITE_CODE = process.env.INVITE_CODE || 'ZJ2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 静态托管教材图谱目录，供前端下拉框快速选择
app.get('/api/textbook-catalog', (req, res) => {
  const catalogPath = path.join(rootDir, 'references', 'textbook-zj2026.md');
  if (fs.existsSync(catalogPath)) {
    return res.type('text/markdown').send(fs.readFileSync(catalogPath, 'utf-8'));
  }
  res.status(404).send('Catalog not found');
});

// 身份校验中间件
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录状态已失效，请重新登录' });
  }
}

// ======================= 用户认证路由 =======================

// 注册
app.post('/api/register', (req, res) => {
  const { username, password, inviteCode } = req.body;

  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: '用户名、密码与组内邀请码均为必填' });
  }

  if (inviteCode.trim() !== INVITE_CODE) {
    return res.status(403).json({ error: '邀请码错误，仅限本教研组内部成员注册' });
  }

  const existing = dbService.findUserByUsername(username.trim());
  if (existing) {
    return res.status(409).json({ error: '该用户名已被使用' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = dbService.createUser(username.trim(), hash);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = dbService.findUserByUsername(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码不正确' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// 获取当前用户信息
app.get('/api/me', authenticate, (req, res) => {
  const user = dbService.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

// ======================= 教学任务生成与管理 =======================

// 创建备课生成任务
app.post('/api/tasks', authenticate, async (req, res) => {
  const { grade, lessonTitle, requirements } = req.body;

  if (!grade || !lessonTitle) {
    return res.status(400).json({ error: '年级与课题名称为必填项' });
  }

  const taskId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const task = dbService.createTask({
    id: taskId,
    userId: req.user.id,
    grade: grade.trim(),
    lessonTitle: lessonTitle.trim(),
    requirements: requirements ? requirements.trim() : ''
  });

  // 异步在后台运行全套生成与编译流水线
  startLessonGenerationPipeline(taskId, req.user.id, grade.trim(), lessonTitle.trim(), requirements);

  res.json({ taskId, message: '任务已启动' });
});

// 查询任务进度与状态
app.get('/api/tasks/:id', authenticate, (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  if (task.user_id !== req.user.id) return res.status(403).json({ error: '无权查看此任务' });

  // 扫描产物目录，收集已生成的文件列表
  let files = [];
  if (task.output_dir && fs.existsSync(task.output_dir)) {
    files = fs.readdirSync(task.output_dir).filter(f => !f.endsWith('.tmp.md') && !f.endsWith('.log'));
  }

  res.json({ ...task, availableFiles: files });
});

// 获取历史任务列表
app.get('/api/tasks', authenticate, (req, res) => {
  const tasks = dbService.listTasksByUserId(req.user.id);
  res.json(tasks);
});

// ======================= 资料下载与作业在线预览 =======================

// 在线直接试玩/预览 HTML 作业
app.get('/api/preview/:id/html', (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task || !task.output_dir || !fs.existsSync(task.output_dir)) {
    return res.status(404).send('课堂作业文件尚未生成或不存在');
  }

  const htmlFile = fs.readdirSync(task.output_dir).find(f => f.endsWith('.html'));
  if (!htmlFile) {
    return res.status(404).send('未找到 HTML 作业文件');
  }

  res.type('text/html; charset=utf-8').sendFile(path.join(task.output_dir, htmlFile));
});

// 单项或打包下载
app.get('/api/download/:id/:type', authenticate, async (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task || !task.output_dir || !fs.existsSync(task.output_dir)) {
    return res.status(404).send('任务目录不存在');
  }

  const { type } = req.params;
  const files = fs.readdirSync(task.output_dir);

  if (type === 'zip') {
    const zipPath = path.join(task.output_dir, `${task.grade}_${task.lesson_title}_全套教学资料.zip`);
    if (!fs.existsSync(zipPath)) {
      await createZipArchive(task.output_dir, zipPath);
    }
    return res.download(zipPath);
  }

  let matchedFile = null;
  if (type === 'docx_plan') {
    matchedFile = files.find(f => f.includes('教案') && f.endsWith('.docx'));
  } else if (type === 'docx_worksheet') {
    matchedFile = files.find(f => f.includes('导学') && f.endsWith('.docx'));
  } else if (type === 'pptx') {
    matchedFile = files.find(f => f.endsWith('.pptx'));
  } else if (type === 'pdf') {
    matchedFile = files.find(f => f.endsWith('.pdf'));
  } else if (type === 'html') {
    matchedFile = files.find(f => f.endsWith('.html'));
  }

  if (!matchedFile) {
    return res.status(404).send('该项交付文件未生成或不存在');
  }

  res.download(path.join(task.output_dir, matchedFile));
});

// ======================= 后台调度核心流水线 =======================

async function startLessonGenerationPipeline(taskId, userId, grade, lessonTitle, requirements) {
  const taskDir = path.join(__dirname, 'data', 'workspaces', taskId);

  try {
    // 阶段 1：AI 构思并流式生成四件套 Markdown & HTML 源码
    dbService.updateTaskProgress(taskId, {
      status: 'generating',
      progress: 25,
      progressText: '特级教师 AI 正在构思四位一体教学闭环...'
    });

    await generateLessonFiles({
      taskId,
      grade,
      lessonTitle,
      requirements,
      targetDir: taskDir
    });

    // 阶段 2：调用导出流水线（Pandoc 编译 Word ➔ beautify_docx 精排 ➔ Marp CLI 导出课件）
    dbService.updateTaskProgress(taskId, {
      status: 'compiling',
      progress: 60,
      progressText: '正在执行公文级排版与 PPTX/PDF 课件编译...'
    });

    await runExportPipeline(taskDir);

    // 阶段 3：预先打好 ZIP 压缩包
    dbService.updateTaskProgress(taskId, {
      progress: 90,
      progressText: '正在封装全套教学资源包...'
    });

    const zipName = `${grade}_${lessonTitle}_全套教学资料.zip`.replace(/[\\/:*?"<>|]/g, '_');
    const zipPath = path.join(taskDir, zipName);
    await createZipArchive(taskDir, zipPath);

    // 完成
    dbService.updateTaskProgress(taskId, {
      status: 'completed',
      progress: 100,
      progressText: '四位一体资料全部生成完毕！',
      outputDir: taskDir
    });
  } catch (err) {
    console.error(`[Task ${taskId} Error]:`, err);
    dbService.updateTaskProgress(taskId, {
      status: 'failed',
      progress: 0,
      progressText: '生成失败',
      errorMsg: err.message
    });
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 IT Lesson Studio Web 服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`🔑 教研组注册邀请码: ${INVITE_CODE}`);
  console.log(`📁 数据目录: ${path.join(__dirname, 'data')}\n`);
});
