import type { D1Database } from '@cloudflare/workers-types';

const TABLES_TO_CLEAR = [
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

export async function resetTestDatabase(db: D1Database): Promise<void> {
  for (const table of TABLES_TO_CLEAR) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
}
