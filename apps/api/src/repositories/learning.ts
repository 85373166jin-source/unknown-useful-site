import type { D1Database } from '@cloudflare/workers-types';

export type SeriesStatus = 'active' | 'coming_soon';

export interface SeriesRow {
  id: string;
  title: string;
  status: SeriesStatus;
  course_password_hash: string;
  created_at: number;
  updated_at: number;
}

export type EntitlementStatus = 'active' | 'revoked';
export type EntitlementSource = 'course_password' | 'order' | 'admin';

export interface EntitlementRow {
  id: string;
  user_id: string;
  product_id: string;
  status: EntitlementStatus;
  source: EntitlementSource;
  order_id: string | null;
  expires_at: number | null;
  created_at: number;
}

const SERIES_COLUMNS = 'id, title, status, course_password_hash, created_at, updated_at';
const ENTITLEMENT_COLUMNS = 'id, user_id, product_id, status, source, order_id, expires_at, created_at';

export async function findSeriesById(db: D1Database, seriesId: string): Promise<SeriesRow | null> {
  return db
    .prepare(`SELECT ${SERIES_COLUMNS} FROM series WHERE id = ?`)
    .bind(seriesId)
    .first<SeriesRow>();
}

export async function findActiveEntitlement(
  db: D1Database,
  userId: string,
  productId: string
): Promise<EntitlementRow | null> {
  return db
    .prepare(
      `SELECT ${ENTITLEMENT_COLUMNS}
       FROM entitlements
       WHERE user_id = ? AND product_id = ? AND status = 'active'
       LIMIT 1`
    )
    .bind(userId, productId)
    .first<EntitlementRow>();
}

export interface InsertActiveEntitlementInput {
  userId: string;
  productId: string;
  source: EntitlementSource;
  createdAt: number;
}

export async function insertActiveEntitlement(
  db: D1Database,
  input: InsertActiveEntitlementInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entitlements (id, user_id, product_id, status, source, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)
       ON CONFLICT(user_id, product_id) WHERE status = 'active' DO NOTHING`
    )
    .bind(crypto.randomUUID(), input.userId, input.productId, input.source, input.createdAt)
    .run();
}

export async function listActiveEntitlementsForUser(
  db: D1Database,
  userId: string
): Promise<EntitlementRow[]> {
  const result = await db
    .prepare(
      `SELECT ${ENTITLEMENT_COLUMNS}
       FROM entitlements
       WHERE user_id = ? AND status = 'active'
       ORDER BY product_id`
    )
    .bind(userId)
    .all<EntitlementRow>();

  return result.results ?? [];
}
