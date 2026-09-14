import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDatabase } from './helpers/test-db';

describe('database schema', () => {
  beforeEach(async () => { await resetTestDatabase(env.DB); });

  it('enforces the comment status constraint and cleanup index', async () => {
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('u1', 'u1', 'hash', 'user', 'active', 1, 1)").run();
    await env.DB.prepare("INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, created_at, updated_at) VALUES ('super', '超影课程', 29, 'active', 'courses', 1, 1, 1)").run();

    await env.DB.prepare(
      "INSERT INTO comments (id, product_id, user_id, body, status, created_at, updated_at) VALUES ('c1', 'super', 'u1', 'body', 'pending', 1, 1)"
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO comments (id, product_id, user_id, body, status, created_at, updated_at) VALUES ('c2', 'super', 'u1', 'body', 'hidden', 1, 1)"
      ).run()
    ).rejects.toThrow();

    const indexes = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_comments_visible_until'").all<{ name: string }>();
    expect(indexes.results?.map((row) => row.name)).toEqual(['idx_comments_visible_until']);
  });
  it('requires unique case-insensitive display names', async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, username, display_name, password_hash, role, status, created_at, updated_at) VALUES ('u1', 'account-a', 'Alice', 'hash', 'user', 'active', 1, 1)"
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO users (id, username, display_name, password_hash, role, status, created_at, updated_at) VALUES ('u2', 'account-b', 'alice', 'hash', 'user', 'active', 1, 1)"
      ).run()
    ).rejects.toThrow(/UNIQUE/i);

    const index = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_display_name_nocase'"
    ).first<{ name: string }>();
    expect(index?.name).toBe('idx_users_display_name_nocase');
  });

  it('enforces one active entitlement per user and product', async () => {
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('u1', 'u1', 'hash', 'user', 'active', 1, 1)").run();
    await env.DB.prepare("INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, created_at, updated_at) VALUES ('super', '超影课程', 29, 'active', 'courses', 1, 1, 1)").run();
    await env.DB.prepare("INSERT INTO entitlements (id, user_id, product_id, source, created_at) VALUES ('e1', 'u1', 'super', 'course_password', 1)").run();
    await expect(env.DB.prepare("INSERT INTO entitlements (id, user_id, product_id, source, created_at) VALUES ('e2', 'u1', 'super', 'order', 1)").run()).rejects.toThrow();
  });
});
