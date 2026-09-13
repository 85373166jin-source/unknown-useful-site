import type { D1Database } from '@cloudflare/workers-types';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface RateLimitRow {
  count: number;
  window_start: number;
  expires_at: number;
}

export async function consumeRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs;

  const row = await db.prepare(
    `INSERT INTO rate_limits (rate_key, window_start, count, expires_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(rate_key) DO UPDATE SET
       count = CASE WHEN rate_limits.expires_at <= excluded.window_start THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.expires_at <= excluded.window_start THEN excluded.window_start ELSE rate_limits.window_start END,
       expires_at = CASE WHEN rate_limits.expires_at <= excluded.window_start THEN excluded.expires_at ELSE rate_limits.expires_at END
     RETURNING count, window_start, expires_at`
  )
    .bind(key, windowStart, expiresAt)
    .first<RateLimitRow>();

  const count = row?.count ?? 1;
  const resetAt = row?.expires_at ?? expiresAt;

  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt
  };
}
