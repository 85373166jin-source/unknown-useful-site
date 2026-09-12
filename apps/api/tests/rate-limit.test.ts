import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit } from '../src/services/rate-limit';
import { resetTestDatabase } from './helpers/test-db';

describe('D1 rate limiting', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
  });

  it('enforces a fixed window limit', async () => {
    const key = 'login:username:alice';
    const first = await consumeRateLimit(env.DB, key, 3, 60_000);
    expect(first.allowed).toBe(true);
    expect(first.count).toBe(1);
    expect(first.remaining).toBe(2);

    await consumeRateLimit(env.DB, key, 3, 60_000);
    const third = await consumeRateLimit(env.DB, key, 3, 60_000);
    expect(third.allowed).toBe(true);
    expect(third.count).toBe(3);
    expect(third.remaining).toBe(0);

    const fourth = await consumeRateLimit(env.DB, key, 3, 60_000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.count).toBe(4);
    expect(fourth.remaining).toBe(0);
  });

  it('stores fixed window start, count, and expiry', async () => {
    const key = 'recover:bob';
    const result = await consumeRateLimit(env.DB, key, 2, 60_000);
    const row = await env.DB.prepare(
      'SELECT window_start, count, expires_at FROM rate_limits WHERE rate_key = ?'
    ).bind(key).first<{ window_start: number; count: number; expires_at: number }>();

    expect(result.count).toBe(1);
    expect(row).not.toBeNull();
    expect(row?.count).toBe(1);
    expect(row?.expires_at).toBe((row?.window_start ?? 0) + 60_000);
  });
});
