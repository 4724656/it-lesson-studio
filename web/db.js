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

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    grade TEXT NOT NULL,
    lesson_title TEXT NOT NULL,
    requirements TEXT,
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

export const dbService = {
  // 用户相关
  findUserByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
  },

  findUserById(id) {
    const stmt = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  },

  createUser(username, passwordHash) {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, passwordHash);
    return { id: result.lastInsertRowid, username };
  },

  // 任务相关
  createTask({ id, userId, grade, lessonTitle, requirements }) {
    const stmt = db.prepare(`
      INSERT INTO tasks (id, user_id, grade, lesson_title, requirements, status, progress, progress_text)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, '任务已排队')
    `);
    stmt.run(id, userId, grade, lessonTitle, requirements || '');
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

  listTasksByUserId(userId, limit = 20) {
    const stmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }
};
