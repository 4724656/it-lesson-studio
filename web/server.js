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
// JWT 鉴权密钥：必须通过环境变量配置，禁止硬编码默认值（防止伪造 token）。
// 启动时缺失则直接拒绝启动，避免静默回退到不安全的默认值。
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ 启动失败：未设置 JWT_SECRET 环境变量。');
  console.error('   请在 web/.env 中配置至少 32 位的随机长字符串，例如：openssl rand -hex 32');
  process.exit(1);
}
const INVITE_CODE = process.env.INVITE_CODE || 'ZJ2026';

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 静态托管教材图谱目录，供前端下拉框快速选择
app.get('/api/textbook-catalog', (req, res) => {
  const catalogPath = path.join(rootDir, 'references', 'textbook-zj2026.md');
  if (fs.existsSync(catalogPath)) {
    return res.type('text/markdown').send(fs.readFileSync(catalogPath, 'utf-8'));
  }
  res.status(404).send('Catalog not found');
});

// 身份校验中间件（支持 Authorization: Bearer <token> 或 query param ?token=<token>）
function authenticate(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录状态已失效，请重新登录' });
  }
}

// 管理员权限校验中间件
function requireAdmin(req, res, next) {
  const user = dbService.findUserById(req.user.id);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: '权限不足，仅管理员可访问' });
  }
  next();
}

// ======================= 用户认证与个人资料 =======================

// 注册
app.post('/api/register', (req, res) => {
  const { username, password, inviteCode, school, realName, phone } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名与密码为必填项' });
  }

  // 安全：用户名白名单（仅中文/字母/数字/下划线/连字符，2~20 字符），阻断 XSS 注入
  const cleanUsername = username.trim();
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,20}$/.test(cleanUsername)) {
    return res.status(400).json({ error: '用户名仅支持中文、字母、数字、下划线与连字符，长度 2~20 位' });
  }

  const userCount = dbService.getUserCount();
  const currentInviteCode = dbService.getSetting('invite_code') || INVITE_CODE;

  // 如果已有用户，后续注册必须输入邀请码；首位注册自动跳过邀请码并晋升超管
  if (userCount > 0) {
    if (!inviteCode) {
      return res.status(400).json({ error: '请输入专属注册邀请码' });
    }
    if (inviteCode.trim() !== currentInviteCode) {
      return res.status(403).json({ error: '注册邀请码错误，仅限本校教师注册' });
    }
  }

  const existing = dbService.findUserByUsername(cleanUsername);
  if (existing) {
    return res.status(409).json({ error: '该用户名已被使用' });
  }

  // 首个注册用户自动晋升为管理员
  const role = (userCount === 0) ? 'admin' : 'teacher';
  const hash = bcrypt.hashSync(password, 10);
  const user = dbService.createUser(cleanUsername, hash, role);

  const actualRealName = realName || req.body.real_name;
  if (school || actualRealName || phone) {
    dbService.updateUserProfile(user.id, {
      school: school ? school.trim() : '',
      real_name: actualRealName ? actualRealName.trim() : '',
      phone: phone ? phone.trim() : ''
    });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role }, JWT_SECRET, { expiresIn: '30d' });
  const fullUser = dbService.findUserById(user.id);
  res.json({ token, user: fullUser });
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

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  const fullUser = dbService.findUserById(user.id);
  res.json({ token, user: fullUser });
});

// 获取当前用户完整资料
app.get('/api/me', authenticate, (req, res) => {
  const user = dbService.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

// 更新当前用户个人资料（单位、姓名、电话）
app.put('/api/me', authenticate, (req, res) => {
  const { school, real_name, phone } = req.body;
  const updated = dbService.updateUserProfile(req.user.id, { school, real_name, phone });
  res.json(updated);
});

// ======================= 管理员后台专区 =======================

// 1. 获取所有注册教师列表
app.get('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  const users = dbService.getAllUsers();
  res.json(users);
});

// 2. 更改成员角色（提权管理员 / 降为普通教师）
app.put('/api/admin/users/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'teacher'].includes(role)) {
    return res.status(400).json({ error: '无效角色' });
  }
  const target = dbService.findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const updated = dbService.updateUserRole(req.params.id, role);
  res.json(updated);
});

// 3. 重置成员密码
app.put('/api/admin/users/:id/password', authenticate, requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '新密码不能少于 6 位' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  dbService.updateUserPassword(req.params.id, hash);
  res.json({ message: '密码重置成功' });
});

// 4. 删除成员
app.delete('/api/admin/users/:id', authenticate, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: '不能删除自己的当前登录账号' });
  }
  dbService.deleteUser(req.params.id);
  res.json({ message: '用户已删除' });
});

// 5. 获取系统配置与 AI 接口
app.get('/api/admin/settings', authenticate, requireAdmin, (req, res) => {
  const settings = dbService.getAllSettings();
  res.json({
    ai_api_base: settings.ai_api_base || process.env.AI_API_BASE || 'http://127.0.0.1:8317/v1',
    ai_api_key: settings.ai_api_key || process.env.AI_API_KEY || 'sk-none',
    ai_model: settings.ai_model || process.env.AI_MODEL || 'gemini-2.5-flash',
    invite_code: settings.invite_code || process.env.INVITE_CODE || 'ZJ2026'
  });
});

// 6. 保存系统配置与 AI 接口
app.put('/api/admin/settings', authenticate, requireAdmin, (req, res) => {
  const { ai_api_base, ai_api_key, ai_model, invite_code } = req.body;
  if (ai_api_base !== undefined) dbService.setSetting('ai_api_base', ai_api_base.trim());
  if (ai_api_key !== undefined) dbService.setSetting('ai_api_key', ai_api_key.trim());
  if (ai_model !== undefined) dbService.setSetting('ai_model', ai_model.trim());
  if (invite_code !== undefined) dbService.setSetting('invite_code', invite_code.trim());
  res.json({ message: '系统设置已更新并即时生效' });
});


// ======================= 教学任务生成与管理 =======================

// 创建备课生成任务
app.post('/api/tasks', authenticate, async (req, res) => {
  const { grade, lessonTitle, requirements, materialsText, images } = req.body;

  if (!grade || !lessonTitle) {
    return res.status(400).json({ error: '年级与课题名称为必填项' });
  }

  const taskId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const taskDir = path.join(__dirname, 'data', 'workspaces', taskId);
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  // 若有上传教材插图/截图，保存到 workspace 目录供生成与后续重试读取
  if (images && Array.isArray(images) && images.length > 0) {
    try {
      fs.writeFileSync(path.join(taskDir, 'materials_images.json'), JSON.stringify(images), 'utf-8');
    } catch (e) {
      console.error(`[Task ${taskId}] Failed to save materials_images.json:`, e);
    }
  }

  const task = dbService.createTask({
    id: taskId,
    userId: req.user.id,
    grade: grade.trim(),
    lessonTitle: lessonTitle.trim(),
    requirements: requirements ? requirements.trim() : '',
    materialsText: materialsText ? materialsText.trim() : ''
  });

  // 异步在后台运行全套生成与编译流水线
  startLessonGenerationPipeline(taskId, req.user.id, grade.trim(), lessonTitle.trim(), requirements, materialsText, images);

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

// 获取历史任务列表（所有用户仅查看自己的历史）
app.get('/api/tasks', authenticate, (req, res) => {
  const tasks = dbService.listTasksByUserId(req.user.id);
  res.json(tasks);
});

// 取消任务
app.post('/api/tasks/:id/cancel', authenticate, (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  if (task.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权操作此任务' });
  }
  const updated = dbService.cancelTask(req.params.id, '用户手动取消生成');
  res.json({ message: '任务已取消', task: updated });
});

// 重新生成任务
app.post('/api/tasks/:id/retry', authenticate, async (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  if (task.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权操作此任务' });
  }

  // 重置状态为 generating
  dbService.updateTaskProgress(task.id, {
    status: 'generating',
    progress: 10,
    progressText: '正在重新构思并启动四位一体流水线...',
    errorMsg: ''
  });

  // 恢复保存的教材插图
  let images = [];
  const taskDir = path.join(__dirname, 'data', 'workspaces', task.id);
  const imagesPath = path.join(taskDir, 'materials_images.json');
  if (fs.existsSync(imagesPath)) {
    try {
      images = JSON.parse(fs.readFileSync(imagesPath, 'utf-8'));
    } catch (e) {
      console.error(`[Task ${task.id}] Failed to load materials_images.json on retry:`, e);
    }
  }

  // 异步重新拉起生成流水线（完整传递教材参考文本与图片）
  startLessonGenerationPipeline(task.id, task.user_id, task.grade, task.lesson_title, task.requirements, task.materials_text || '', images);
  res.json({ taskId: task.id, message: '已重新启动生成' });
});

// ======================= 资料下载与作业在线预览 =======================

// 在线直接试玩/预览 HTML 作业（鉴权保护：仅限任务所有者或管理员访问）
app.get('/api/preview/:id/html', authenticate, (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task) {
    return res.status(404).send('任务不存在');
  }
  if (task.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).send('无权访问此任务的作业预览');
  }
  if (!task.output_dir || !fs.existsSync(task.output_dir)) {
    return res.status(404).send('课堂作业文件尚未生成或不存在');
  }

  const htmlFile = fs.readdirSync(task.output_dir).find(f => f.endsWith('.html'));
  if (!htmlFile) {
    return res.status(404).send('未找到 HTML 作业文件');
  }

  res.type('text/html; charset=utf-8').sendFile(path.join(task.output_dir, htmlFile));
});

// 单项或打包下载（鉴权保护：仅限任务所有者或管理员访问，与预览路由一致）
app.get('/api/download/:id/:type', authenticate, async (req, res) => {
  const task = dbService.getTaskById(req.params.id);
  if (!task) {
    return res.status(404).send('任务不存在');
  }
  if (task.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).send('无权下载此任务的备课资料');
  }
  if (!task.output_dir || !fs.existsSync(task.output_dir)) {
    return res.status(404).send('任务目录不存在');
  }

  const { type } = req.params;
  const files = fs.readdirSync(task.output_dir);

  let matchedFile = null;
  if (type === 'zip') {
    const zipName = `${task.grade}_${task.lesson_title}_全套教学资料.zip`.replace(/[\\/:*?"<>|]/g, '_');
    const zipPath = path.join(task.output_dir, zipName);
    if (!fs.existsSync(zipPath)) {
      await createZipArchive(task.output_dir, zipPath);
    }
    matchedFile = zipName;
  } else if (type === 'docx_plan') {
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

  const filePath = path.join(task.output_dir, matchedFile);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(matchedFile)}"; filename*=UTF-8''${encodeURIComponent(matchedFile)}`);
  res.download(filePath, matchedFile);
});

// ======================= 后台调度核心流水线 =======================

async function startLessonGenerationPipeline(taskId, userId, grade, lessonTitle, requirements, materialsText, images) {
  const taskDir = path.join(__dirname, 'data', 'workspaces', taskId);

  try {
    // 阶段 1：AI 构思并流式生成四件套 Markdown & HTML 源码
    dbService.updateTaskProgress(taskId, {
      status: 'generating',
      progress: 25,
      progressText: '教学引擎正在构思四位一体教学闭环...'
    });

    await generateLessonFiles({
      taskId,
      grade,
      lessonTitle,
      requirements,
      materialsText,
      images,
      targetDir: taskDir,
      onProgress: ({ progress, progressText }) => {
        dbService.updateTaskProgress(taskId, {
          status: 'generating',
          progress,
          progressText
        });
      }
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
  const cleaned = dbService.cleanHangingTasks();
  if (cleaned > 0) {
    console.log(`🧹 已自动恢复/清理 ${cleaned} 个中断的生成任务`);
  }
  console.log(`\n🚀 IT Lesson Studio Web 服务已启动: http://0.0.0.0:${PORT}`);
  const maskedInvite = INVITE_CODE ? `${INVITE_CODE.slice(0, 2)}****` : '未配置';
  console.log(`🔑 教研组注册邀请码: ${maskedInvite} (可登录管理员后台查看或修改)`);
  console.log(`📁 数据目录: ${path.join(__dirname, 'data')}\n`);
});
