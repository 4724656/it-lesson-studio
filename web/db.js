import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'studio.db');
const db = new DatabaseSync(DB_PATH);

// 初始化数据库表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'teacher', -- 'admin' | 'teacher'
    school TEXT,
    real_name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    grade TEXT NOT NULL,
    lesson_title TEXT NOT NULL,
    requirements TEXT,
    materials_text TEXT,
    status TEXT NOT NULL, -- pending, generating, compiling, completed, failed
    progress INTEGER DEFAULT 0,
    progress_text TEXT,
    error_msg TEXT,
    output_dir TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// 动态兼容迁移老数据字段
try {
  const tableInfo = db.prepare('PRAGMA table_info(users)').all();
  const colNames = tableInfo.map(c => c.name);
  if (!colNames.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'teacher'");
  }
  if (!colNames.includes('school')) {
    db.exec("ALTER TABLE users ADD COLUMN school TEXT");
  }
  if (!colNames.includes('real_name')) {
    db.exec("ALTER TABLE users ADD COLUMN real_name TEXT");
  }
  if (!colNames.includes('phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }

  // 保证系统中最早注册的第 1 位用户一定是 admin
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
  if (adminCount && adminCount.count === 0) {
    db.exec("UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)");
  }

  // 任务表动态迁移 materials_text 字段
  const taskTableInfo = db.prepare('PRAGMA table_info(tasks)').all();
  const taskColNames = taskTableInfo.map(c => c.name);
  if (!taskColNames.includes('materials_text')) {
    db.exec("ALTER TABLE tasks ADD COLUMN materials_text TEXT");
  }
} catch (e) {
  console.error('Database migration note:', e.message);
}

export const dbService = {
  // 用户相关
  getUserCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    return stmt.get().count;
  },

  findUserByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
  },

  findUserById(id) {
    const stmt = db.prepare('SELECT id, username, role, school, real_name, phone, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  },

  createUser(username, passwordHash, role = 'teacher') {
    const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
    const result = stmt.run(username, passwordHash, role);
    return { id: result.lastInsertRowid, username, role };
  },

  updateUserProfile(id, { school, real_name, phone }) {
    const stmt = db.prepare('UPDATE users SET school = ?, real_name = ?, phone = ? WHERE id = ?');
    stmt.run(school || '', real_name || '', phone || '', id);
    return this.findUserById(id);
  },

  getAllUsers() {
    const stmt = db.prepare('SELECT id, username, role, school, real_name, phone, created_at FROM users ORDER BY id ASC');
    return stmt.all();
  },

  updateUserRole(id, role) {
    const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
    stmt.run(role, id);
    return this.findUserById(id);
  },

  updateUserPassword(id, passwordHash) {
    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    stmt.run(passwordHash, id);
    return true;
  },

  deleteUser(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
    return true;
  },

  // 系统全局配置 (管理员可随时修改 AI 接口与邀请码)
  getSetting(key, defaultValue = null) {
    try {
      const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
      const row = stmt.get(key);
      return row ? row.value : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  setSetting(key, value) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, String(value));
  },

  getAllSettings() {
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const map = {};
      for (const r of rows) {
        map[r.key] = r.value;
      }
      return map;
    } catch {
      return {};
    }
  },

  // 任务相关
  createTask({ id, userId, grade, lessonTitle, requirements, materialsText }) {
    const stmt = db.prepare(`
      INSERT INTO tasks (id, user_id, grade, lesson_title, requirements, materials_text, status, progress, progress_text)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, '任务已排队')
    `);
    stmt.run(id, userId, grade, lessonTitle, requirements || '', materialsText || '');
    return this.getTaskById(id);
  },

  updateTaskProgress(id, { status, progress, progressText, errorMsg, outputDir }) {
    const fields = [];
    const values = [];

    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }
    if (progress !== undefined) {
      fields.push('progress = ?');
      values.push(progress);
    }
    if (progressText !== undefined) {
      fields.push('progress_text = ?');
      values.push(progressText);
    }
    if (errorMsg !== undefined) {
      fields.push('error_msg = ?');
      values.push(errorMsg);
    }
    if (outputDir !== undefined) {
      fields.push('output_dir = ?');
      values.push(outputDir);
    }
    if (status === 'completed' || status === 'failed') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(sql);
    stmt.run(...values);
  },

  getTaskById(id) {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    return stmt.get(id);
  },

  listTasksByUserId(userId, limit = 50) {
    const stmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  },


  // 取消任务
  cancelTask(id, reason = '已手动取消生成') {
    const stmt = db.prepare(`
      UPDATE tasks 
      SET status = 'failed', error_msg = ?, progress_text = '任务已取消', completed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(reason, id);
    return this.getTaskById(id);
  },

  // 服务启动时自愈清理僵尸任务（防止服务重启导致任务永远卡在 generating）
  cleanHangingTasks() {
    const stmt = db.prepare(`
      UPDATE tasks 
      SET status = 'failed', error_msg = '服务重启导致任务中断，可点击重新生成', progress_text = '已中断 (可重试)', completed_at = CURRENT_TIMESTAMP 
      WHERE status IN ('generating', 'pending')
    `);
    const info = stmt.run();
    return info.changes;
  }
};

