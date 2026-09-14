import type { D1Database } from '@cloudflare/workers-types';

export interface CardKeyRow {
  id: string;
  batch_id: string;
  product_id: string;
  code_hash: string;
  status: 'unused' | 'used' | 'disabled';
  expires_at: number;
  used_by: string | null;
  used_at: number | null;
  order_id: string | null;
  created_at: number;
}

export interface CardKeyVerificationRow extends CardKeyRow {
  username: string | null;
  display_name: string | null;
  order_no: string | null;
}

export async function findCardKeyByHash(db: D1Database, codeHash: string): Promise<CardKeyRow | null> {
  return db.prepare(
    'SELECT id, batch_id, product_id, code_hash, status, expires_at, used_by, used_at, order_id, created_at FROM card_keys WHERE code_hash = ?'
  ).bind(codeHash).first<CardKeyRow>();
}

export async function verifyCardKeyByHash(
  db: D1Database,
  codeHash: string
): Promise<CardKeyVerificationRow | null> {
  return db.prepare(
    `SELECT ck.id, ck.batch_id, ck.product_id, ck.code_hash, ck.status, ck.expires_at,
            ck.used_by, ck.used_at, ck.order_id, ck.created_at,
            u.username, u.display_name, o.order_no
     FROM card_keys ck
     LEFT JOIN users u ON u.id = ck.used_by
     LEFT JOIN orders o ON o.id = ck.order_id
     WHERE ck.code_hash = ?`
  ).bind(codeHash).first<CardKeyVerificationRow>();
}

export async function insertCardKeyBatch(
  db: D1Database,
  input: { id: string; productId: string; quantity: number; expiresAt: number; note: string | null; createdBy: string; createdAt: number }
): Promise<void> {
  await db.prepare(
    `INSERT INTO card_key_batches (id, product_id, quantity, expires_at, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(input.id, input.productId, input.quantity, input.expiresAt, input.note, input.createdBy, input.createdAt).run();
}

export function buildInsertCardKeyStatement(
  db: D1Database,
  input: { id: string; batchId: string; productId: string; codeHash: string; expiresAt: number; createdAt: number }
) {
  return db.prepare(
    `INSERT INTO card_keys (id, batch_id, product_id, code_hash, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, 'unused', ?, ?)`
  ).bind(input.id, input.batchId, input.productId, input.codeHash, input.expiresAt, input.createdAt);
}
