import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { findProductById, listProductComponentIds } from '../repositories/orders';
import { listActiveEntitlementsForUser } from '../repositories/learning';
import { findUserById, updateUserMembership } from '../repositories/users';
import { applyMembershipPurchase, effectiveMembership } from './membership';
import { buildUpsertSubsiteStatement, type SubsiteTier } from './subsites';
import { findCardKeyByHash, insertCardKeyBatch, buildInsertCardKeyStatement, verifyCardKeyByHash } from '../repositories/card-keys';

export const CARD_KEY_VALID_MS = 30 * 24 * 60 * 60 * 1000;
const CARD_KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(): string {
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  const chars = Array.from(values, (value) => CARD_KEY_ALPHABET[value % CARD_KEY_ALPHABET.length]);
  return [chars.slice(0, 4).join(''), chars.slice(4, 8).join(''), chars.slice(8, 12).join(''), chars.slice(12, 16).join('')].join('-');
}

export function normalizeCardKey(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function hashCardKey(code: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pepper}:${normalizeCardKey(code)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function orderNo(now: number): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `ORD-${now.toString(36).toUpperCase()}-${random}`;
}

export function cardKeyVerificationPayload(row: Awaited<ReturnType<typeof verifyCardKeyByHash>>) {
  if (!row) return null;
  return {
    productId: row.product_id,
    status: row.expires_at <= Date.now() && row.status === 'unused' ? 'expired' : row.status,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    orderNo: row.order_no,
    usedBy: row.used_by ? { username: row.username, displayName: row.display_name ?? row.username } : null
  };
}

export async function generateCardKeys(
  env: Env,
  actorUserId: string,
  input: { productId: string; quantity: number; note?: string | undefined }
) {
  const product = await findProductById(env.DB, input.productId);
  if (!product) throw new ApiError('invalid_product', 'Product not found', 404);
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 500) {
    throw new ApiError('invalid_request', 'Quantity must be between 1 and 500', 400);
  }
  const now = Date.now();
  const expiresAt = now + CARD_KEY_VALID_MS;
  const batchId = crypto.randomUUID();
  const codes = Array.from({ length: input.quantity }, randomCode);
  const rows = await Promise.all(codes.map(async (code) => ({
    id: crypto.randomUUID(), batchId, productId: product.id, codeHash: await hashCardKey(code, env.SESSION_PEPPER), expiresAt, createdAt: now
  })));
  await insertCardKeyBatch(env.DB, { id: batchId, productId: product.id, quantity: input.quantity, expiresAt, note: input.note?.trim() || null, createdBy: actorUserId, createdAt: now });
  try {
    await env.DB.batch(rows.map((row) => buildInsertCardKeyStatement(env.DB, row)));
  } catch (error) {
    throw error;
  }
  return { batchId, productId: product.id, expiresAt, codes };
}

export async function verifyCardKey(env: Env, code: string) {
  return cardKeyVerificationPayload(await verifyCardKeyByHash(env.DB, await hashCardKey(code, env.SESSION_PEPPER)));
}

export async function redeemCardKey(env: Env, userId: string, code: string) {
  const hash = await hashCardKey(code, env.SESSION_PEPPER);
  const key = await findCardKeyByHash(env.DB, hash);
  if (!key) throw new ApiError('card_key_invalid', '卡密无效', 404);
  if (key.status === 'used') throw new ApiError('card_key_used', '卡密已使用', 409);
  if (key.status === 'disabled') throw new ApiError('card_key_disabled', '卡密已禁用', 409);
  if (key.expires_at <= Date.now()) throw new ApiError('card_key_expired', '卡密已过期', 410);

  const product = await findProductById(env.DB, key.product_id);
  if (!product) throw new ApiError('invalid_product', 'Product not found', 404);
  const now = Date.now();
  const orderId = crypto.randomUUID();
  const newOrderNo = orderNo(now);
  const statements = [
    env.DB.prepare(
      `UPDATE card_keys SET status = 'used', used_by = ?, used_at = ?, order_id = ?
       WHERE id = ? AND status = 'unused' AND expires_at > ?`
    ).bind(userId, now, orderId, key.id, now),
    env.DB.prepare(
      `INSERT INTO orders (id, order_no, user_id, product_id, source, status, amount_cents, card_key_id, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'card_key', 'completed', 0, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM card_keys WHERE id = ? AND status = 'used' AND used_by = ? AND order_id = ?)`
    ).bind(orderId, newOrderNo, userId, product.id, key.id, now, now, key.id, userId, orderId)
  ];

  let unlocked: string[] = [];
  if (product.product_type === 'membership') {
    const user = await findUserById(env.DB, userId);
    if (!user) throw new ApiError('unauthorized', 'Account is not available', 401);
    const tier = product.id === 'vip_monthly' ? 'vip' : product.id === 'svip_monthly' ? 'svip' : null;
    if (!tier) throw new ApiError('invalid_product', 'Unsupported membership product', 400);
    const next = applyMembershipPurchase(effectiveMembership({ tier: user.membership_tier, expiresAt: user.membership_expires_at }, now), tier, now);
    statements.push(
      env.DB.prepare('UPDATE users SET membership_tier = ?, membership_expires_at = ?, updated_at = ? WHERE id = ?')
        .bind(next.tier, next.expiresAt, now, userId)
    );
  } else if (product.product_type === 'course' || product.product_type === 'digital') {
    const components = await listProductComponentIds(env.DB, product.id);
    const productIds = components.length > 0 ? components : [product.id];
    const owned = new Set((await listActiveEntitlementsForUser(env.DB, userId)).map((row) => row.product_id));
    if (productIds.every((productId) => owned.has(productId))) {
      throw new ApiError('already_owned', '已经拥有该商品', 409);
    }
    for (const productId of productIds) {
      if (owned.has(productId)) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO entitlements (id, user_id, product_id, status, source, order_id, created_at)
           SELECT ?, ?, ?, 'active', 'order', NULL, ?
           WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)`
        ).bind(crypto.randomUUID(), userId, productId, now, orderId)
      );
    }
  } else if (product.product_type === 'partner_opening') {
    const tierMap: Record<string, SubsiteTier> = { partner_basic: 'basic', partner_advanced: 'advanced', partner_top: 'top' };
    const tier = tierMap[product.id];
    if (!tier) throw new ApiError('invalid_product', 'Unsupported sub-site product', 400);
    statements.push(buildUpsertSubsiteStatement(env.DB, userId, tier, now));
  } else {
    throw new ApiError('invalid_product', 'Unsupported product type', 400);
  }

  const results = await env.DB.batch(statements);
  if ((results[1]?.meta.changes ?? 0) !== 1) {
    throw new ApiError('card_key_used', '卡密已被使用', 409);
  }
  if (product.product_type === 'course' || product.product_type === 'digital') {
    unlocked = (await listActiveEntitlementsForUser(env.DB, userId)).map((row) => row.product_id).sort();
  }
  return { orderNo: newOrderNo, productId: product.id, unlocked };
}
