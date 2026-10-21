import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveJwtSecret, INSECURE_DEFAULT_JWT_SECRET } from '../web/auth.js';

test('JWT_SECRET: 自定义环境变量优先生效', () => {
  const customSecret = 'my-super-secret-production-key-999';
  const mockDb = {
    settings: {},
    getSetting(k) { return this.settings[k]; },
    setSetting(k, v) { this.settings[k] = v; }
  };

  const secret = resolveJwtSecret(mockDb, { JWT_SECRET: customSecret });
  assert.equal(secret, customSecret);
  // 不应覆盖数据库
  assert.equal(mockDb.settings['jwt_secret'], undefined);
});

test('JWT_SECRET: 自动忽略公开不安全默认占位符', () => {
  const mockDb = {
    settings: {},
    getSetting(k) { return this.settings[k]; },
    setSetting(k, v) { this.settings[k] = v; }
  };

  const secret = resolveJwtSecret(mockDb, { JWT_SECRET: INSECURE_DEFAULT_JWT_SECRET });
  assert.notEqual(secret, INSECURE_DEFAULT_JWT_SECRET);
  assert.equal(typeof secret, 'string');
  assert.equal(secret.length, 64); // 256 位 hex
  assert.equal(mockDb.settings['jwt_secret'], secret);
});

test('JWT_SECRET: 首次部署自动生成 256 位随机密钥并持久化至数据库', () => {
  const mockDb = {
    settings: {},
    getSetting(k) { return this.settings[k]; },
    setSetting(k, v) { this.settings[k] = v; }
  };

  const secret1 = resolveJwtSecret(mockDb, {});
  assert.equal(secret1.length, 64);
  assert.equal(mockDb.settings['jwt_secret'], secret1);

  // 容器重启模拟：再次调用时应复用数据库已持久化的同一密钥
  const secret2 = resolveJwtSecret(mockDb, {});
  assert.equal(secret2, secret1);
});

test('JWT_SECRET: 数据库中残留的不安全默认值会被自动重置', () => {
  const mockDb = {
    settings: { jwt_secret: INSECURE_DEFAULT_JWT_SECRET },
    getSetting(k) { return this.settings[k]; },
    setSetting(k, v) { this.settings[k] = v; }
  };

  const secret = resolveJwtSecret(mockDb, {});
  assert.notEqual(secret, INSECURE_DEFAULT_JWT_SECRET);
  assert.equal(secret.length, 64);
  assert.equal(mockDb.settings['jwt_secret'], secret);
});

test('JWT_SECRET: 不同部署实例生成的密钥彼此独立', () => {
  const mockDb1 = {
    settings: {},
    getSetting(k) { return this.settings[k]; },
    setSetting(k, v) { this.settings[k] = v; }
  };
  const mockDb2 = {
    settings: {},
    getSetting(k) { return this.settings[k]; },
    setSetting(k, v) { this.settings[k] = v; }
  };

  const s1 = resolveJwtSecret(mockDb1, {});
  const s2 = resolveJwtSecret(mockDb2, {});
  assert.notEqual(s1, s2);
});
