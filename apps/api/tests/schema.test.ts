import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDatabase } from './helpers/test-db';

describe('database schema', () => {
  beforeEach(async () => { await resetTestDatabase(env.DB); });

  it('enforces one active entitlement per user and product', async () => {
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('u1', 'u1', 'hash', 'user', 'active', 1, 1)").run();
    await env.DB.prepare("INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, created_at, updated_at) VALUES ('super', '超影课程', 29, 'active', 'courses', 1, 1, 1)").run();
    await env.DB.prepare("INSERT INTO entitlements (id, user_id, product_id, source, created_at) VALUES ('e1', 'u1', 'super', 'course_password', 1)").run();
    await expect(env.DB.prepare("INSERT INTO entitlements (id, user_id, product_id, source, created_at) VALUES ('e2', 'u1', 'super', 'order', 1)").run()).rejects.toThrow();
  });
});
