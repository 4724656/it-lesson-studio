import crypto from 'node:crypto';

export const INSECURE_DEFAULT_JWT_SECRET = 'it-lesson-studio-secret-key-2026';

/**
 * 解析并确保每台部署实例拥有独立、持久化的 JWT_SECRET
 *
 * 优先级逻辑：
 * 1. 若环境变量 JWT_SECRET 存在且不是公开默认弱密钥，使用用户指定值（便于多机集群共享）；
 * 2. 检查 SQLite settings 表中的 jwt_secret；若存在且非公开默认值，直接使用；
 * 3. 若未设置或仍为公开弱密钥，自动生成 256 位安全随机密钥（32 字节 hex），并写入 SQLite 持久化；
 * 
 * 从而保证：
 * - 开箱即用、零配置 Docker 部署即具备生产级安全性
 * - 每台机器 / 每次全新部署密钥完全独立，杜绝跨实例伪造 Token
 * - 密钥存入 SQLite（挂载至 ./web/data），容器重启不会丢失，用户 30 天会话保持有效
 *
 * @param {object} [db] - 数据库服务实例，需具备 getSetting / setSetting
 * @param {object} [env] - 环境变量对象，默认 process.env
 * @returns {string} 有效的 JWT Secret
 */
export function resolveJwtSecret(db, env = process.env) {
  const envSecret = env?.JWT_SECRET?.trim();
  if (envSecret && envSecret !== INSECURE_DEFAULT_JWT_SECRET) {
    return envSecret;
  }

  const storedSecret = db?.getSetting ? db.getSetting('jwt_secret') : null;
  if (storedSecret && typeof storedSecret === 'string') {
    const trimmed = storedSecret.trim();
    if (trimmed && trimmed !== INSECURE_DEFAULT_JWT_SECRET) {
      return trimmed;
    }
  }

  const generatedSecret = crypto.randomBytes(32).toString('hex');
  if (db?.setSetting) {
    try {
      db.setSetting('jwt_secret', generatedSecret);
    } catch (e) {
      console.warn('警告：无法将 JWT 密钥持久化到数据库:', e.message);
    }
  }
  return generatedSecret;
}
