import type { D1Database } from '@cloudflare/workers-types';

export const TABLES_TO_CLEAR = [
  'comments',
  'watch_progress',
  'login_events',
  'rate_limits',
  'audit_logs',
  'sessions',
  'entitlements',
  'product_components',
  'payment_claims',
  'lessons',
  'series',
  'products',
  'users'
] as const;

// Task 2 adds columns to existing tables rather than new tables, so clearing
// these rows is enough to reset identity, membership, and cent data between tests.
export async function resetTestDatabase(db: D1Database): Promise<void> {
  for (const table of TABLES_TO_CLEAR) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
}
