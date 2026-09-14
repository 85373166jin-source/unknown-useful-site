import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { createNotification } from './notifications';
import { SUBSITE_SHARES, type SubsiteTier } from './subsites';

export interface OrderAttribution {
  promoCode: string | null;
  referrerUserId: string | null;
  subsiteShareBps: number;
  contributionId: string | null;
  contributionUserId: string | null;
  contributionShareBps: number;
}

interface ContributionAttributionRow {
  id: string;
  user_id: string;
  approved_share_bps: number | null;
}

function commissionCents(grossAmountCents: number, shareBps: number): number {
  return Math.round((grossAmountCents * shareBps) / 10_000);
}

export async function resolveOrderAttribution(
  env: Env,
  buyerUserId: string,
  productId: string,
  rawPromoCode?: string
): Promise<OrderAttribution> {
  const attribution: OrderAttribution = {
    promoCode: null,
    referrerUserId: null,
    subsiteShareBps: 0,
    contributionId: null,
    contributionUserId: null,
    contributionShareBps: 0
  };

  const promoCode = rawPromoCode?.trim().toUpperCase() ?? '';
  if (promoCode) {
    const subsite = await env.DB.prepare(
      'SELECT user_id, tier FROM subsites WHERE promo_code = ? LIMIT 1'
    )
      .bind(promoCode)
      .first<{ user_id: string; tier: SubsiteTier }>();
    if (!subsite) {
      throw new ApiError('invalid_promo_code', '推广码无效', 400);
    }
    if (subsite.user_id === buyerUserId) {
      throw new ApiError('self_referral', '不能使用自己的推广码', 400);
    }
    attribution.promoCode = promoCode;
    attribution.referrerUserId = subsite.user_id;
    attribution.subsiteShareBps = SUBSITE_SHARES[subsite.tier] * 100;
  }

  const contribution = await env.DB.prepare(
    `SELECT id, user_id, approved_share_bps
     FROM contributions
     WHERE product_id = ? AND status = 'approved'
     ORDER BY reviewed_at DESC
     LIMIT 1`
  )
    .bind(productId)
    .first<ContributionAttributionRow>();

  if (contribution && (contribution.approved_share_bps ?? 0) > 0) {
    attribution.contributionId = contribution.id;
    attribution.contributionUserId = contribution.user_id;
    attribution.contributionShareBps = contribution.approved_share_bps ?? 0;
  }

  return attribution;
}

export function buildPendingEarningStatements(
  db: D1Database,
  input: {
    orderId: string;
    grossAmountCents: number;
    attribution: OrderAttribution;
    now: number;
  }
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  const { attribution, grossAmountCents, now, orderId } = input;

  if (attribution.referrerUserId && attribution.subsiteShareBps > 0) {
    statements.push(
      db.prepare(
        `INSERT INTO earning_entries
          (id, user_id, source, order_id, amount_cents, status, note, gross_amount_cents, share_bps, created_at, updated_at)
         VALUES (?, ?, 'subsite', ?, ?, 'pending', ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        attribution.referrerUserId,
        orderId,
        commissionCents(grossAmountCents, attribution.subsiteShareBps),
        '订单待结算',
        grossAmountCents,
        attribution.subsiteShareBps,
        now,
        now
      )
    );
  }

  if (attribution.contributionUserId && attribution.contributionShareBps > 0) {
    statements.push(
      db.prepare(
        `INSERT INTO earning_entries
          (id, user_id, source, order_id, amount_cents, status, note, gross_amount_cents, share_bps, created_at, updated_at)
         VALUES (?, ?, 'contribution', ?, ?, 'pending', ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        attribution.contributionUserId,
        orderId,
        commissionCents(grossAmountCents, attribution.contributionShareBps),
        '投稿关联商品订单待结算',
        grossAmountCents,
        attribution.contributionShareBps,
        now,
        now
      )
    );
  }

  return statements;
}

export function buildUpdateOrderReviewStatement(
  db: D1Database,
  input: {
    paymentClaimId: string;
    status: 'approved' | 'rejected';
    amountCents: number | null;
    now: number;
  }
): D1PreparedStatement {
  return db.prepare(
    `UPDATE orders
     SET status = ?,
         amount_cents = COALESCE(?, amount_cents),
         updated_at = ?
     WHERE payment_claim_id = ? AND status = 'pending'`
  ).bind(input.status, input.amountCents, input.now, input.paymentClaimId);
}

export function buildSettleEarningStatement(
  db: D1Database,
  orderId: string,
  decision: 'approved' | 'rejected',
  now: number
): D1PreparedStatement {
  if (decision === 'rejected') {
    return db.prepare(
      `UPDATE earning_entries
       SET status = 'cancelled', note = '订单未通过，待结算收益已取消', updated_at = ?
       WHERE order_id = ? AND status = 'pending'`
    ).bind(now, orderId);
  }

  return db.prepare(
    `UPDATE earning_entries
     SET amount_cents = CAST(ROUND(gross_amount_cents * share_bps / 10000.0) AS INTEGER),
         status = 'available',
         note = '订单审核通过，收益已入账',
         updated_at = ?
     WHERE order_id = ? AND status = 'pending'`
  ).bind(now, orderId);
}

async function notifyAffectedEarners(
  env: Env,
  orderId: string,
  approved: boolean
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT user_id, source, amount_cents
     FROM earning_entries
     WHERE order_id = ? AND source IN ('subsite', 'contribution')
     ORDER BY source`
  )
    .bind(orderId)
    .all<{ user_id: string; source: 'subsite' | 'contribution'; amount_cents: number }>();

  for (const row of rows.results ?? []) {
    const label = row.source === 'subsite' ? '分站' : '投稿';
    await createNotification(env, {
      userId: row.user_id,
      type: approved ? `${row.source}.earning.available` : `${row.source}.earning.cancelled`,
      title: approved ? `${label}收益已入账` : `${label}收益已取消`,
      body: approved
        ? `关联订单已审核通过，${(row.amount_cents / 100).toFixed(2)} 元已计入可用余额`
        : '关联订单未通过审核，待结算金额已取消',
      link: '/wallet'
    });
  }
}

export async function notifyPendingEarnings(
  env: Env,
  orderId: string,
  orderNo: string
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT user_id, source, amount_cents
     FROM earning_entries
     WHERE order_id = ? AND status = 'pending'
     ORDER BY source`
  )
    .bind(orderId)
    .all<{ user_id: string; source: 'subsite' | 'contribution'; amount_cents: number }>();

  for (const row of rows.results ?? []) {
    const label = row.source === 'subsite' ? '分站' : '投稿';
    await createNotification(env, {
      userId: row.user_id,
      type: `${row.source}.earning.pending`,
      title: `${label}有新订单待结算`,
      body: `订单 ${orderNo} 已提交，预计${label}收益 ${(row.amount_cents / 100).toFixed(2)} 元，审核通过后可用`,
      link: '/wallet'
    });
  }
}

export async function notifyEarningSettlement(
  env: Env,
  orderId: string,
  decision: 'approved' | 'rejected'
): Promise<void> {
  await notifyAffectedEarners(env, orderId, decision === 'approved');
}
