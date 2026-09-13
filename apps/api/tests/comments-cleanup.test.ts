import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import { resetTestDatabase } from './helpers/test-db';

const HOUR_MS = 60 * 60 * 1000;

type ScheduledWorker = typeof worker & {
  scheduled?: (
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) => Promise<void>;
};

async function seedCommentData(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
       VALUES ('u1', 'u1', 'hash', 'user', 'active', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('super', '超影课程', 29, 'active', 'courses', 1, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
       VALUES ('expired-author-only', 'super', 'u1', 'expired', 'author_only', ?, ?, ?)`
    ).bind(now - 1, now - HOUR_MS, now - HOUR_MS),
    env.DB.prepare(
      `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
       VALUES ('future-author-only', 'super', 'u1', 'future', 'author_only', ?, ?, ?)`
    ).bind(now + HOUR_MS, now, now),
    env.DB.prepare(
      `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
       VALUES ('expired-public', 'super', 'u1', 'public', 'public', ?, ?, ?)`
    ).bind(now - 1, now, now),
    env.DB.prepare(
      `INSERT INTO rate_limits (rate_key, window_start, count, expires_at)
       VALUES ('expired-rate', 1, 1, ?)`
    ).bind(now - 1),
    env.DB.prepare(
      `INSERT INTO rate_limits (rate_key, window_start, count, expires_at)
       VALUES ('future-rate', 1, 1, ?)`
    ).bind(now + HOUR_MS)
  ]);
}

describe('scheduled comments cleanup', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCommentData();
  });

  it('removes expired author-only comments and expired rate limits', async () => {
    const scheduledWorker = worker as ScheduledWorker;
    expect(scheduledWorker.scheduled).toBeTypeOf('function');
    await scheduledWorker.scheduled!({} as ScheduledController, env, {} as ExecutionContext);

    const comments = await env.DB.prepare('SELECT id FROM comments ORDER BY id').all<{ id: string }>();
    expect(comments.results?.map((row) => row.id)).toEqual(['expired-public', 'future-author-only']);

    const limits = await env.DB.prepare('SELECT rate_key FROM rate_limits ORDER BY rate_key').all<{ rate_key: string }>();
    expect(limits.results?.map((row) => row.rate_key)).toEqual(['future-rate']);
  });
});
