import type { D1Database } from '@cloudflare/workers-types';

export interface SessionRow {
  token_hash: string;
  user_id: string;
  device_summary: string | null;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  deviceSummary: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export async function createSession(db: D1Database, input: CreateSessionInput): Promise<void> {
  await db.prepare(
    `INSERT INTO sessions (token_hash, user_id, device_summary, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.tokenHash,
      input.userId,
      input.deviceSummary,
      input.createdAt,
      input.lastSeenAt,
      input.expiresAt
    )
    .run();
}

export async function findActiveSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
  now: number
): Promise<SessionRow | null> {
  return db.prepare(
    `SELECT token_hash, user_id, device_summary, created_at, last_seen_at, expires_at, revoked_at
     FROM sessions
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
     LIMIT 1`
  )
    .bind(tokenHash, now)
    .first<SessionRow>();
}

export async function revokeSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
  now: number
): Promise<void> {
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(now, tokenHash)
    .run();
}

/**
 * Deletes every previous session for the user. This intentionally includes
 * expired-but-unrevoked rows; otherwise the `one_active_session` partial unique
 * index would count them and block the replacement session being created next.
 */
export async function deleteAllSessionsForUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}
