import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { ProductType } from '@site/contracts';

export type PaymentClaimStatus = 'pending' | 'approved' | 'rejected';

export interface ProductRow {
  id: string;
  title: string;
  price_yuan: number;
  price_cents: number;
  product_type: ProductType;
  status: string;
  category_id: string;
}

export interface PaymentClaimRow {
  id: string;
  order_no: string;
  user_id: string;
  product_id: string;
  list_amount_yuan: number;
  actual_amount_yuan: number | null;
  list_amount_cents: number;
  actual_amount_cents: number | null;
  paid_at: number;
  contact_text: string;
  screenshot_key: string;
  status: PaymentClaimStatus;
  rejection_reason: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface InsertPaymentClaimInput {
  id: string;
  orderNo: string;
  userId: string;
  productId: string;
  listAmountYuan: number;
  actualAmountYuan: number | null;
  listAmountCents: number;
  actualAmountCents: number;
  paidAt: number;
  contactText: string;
  screenshotKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExpectedMembershipState {
  userId: string;
  tier: 'vip' | 'svip';
  activeAfter: number;
}

export interface UpdatePaymentClaimReviewInput {
  status: 'approved' | 'rejected';
  actualAmountYuan: number | null;
  actualAmountCents: number | null;
  rejectionReason: string | null;
  note: string | null;
  reviewedBy: string;
  reviewedAt: number;
  updatedAt: number;
  expectedStatus?: PaymentClaimStatus | undefined;
  expectedMembership?: ExpectedMembershipState | undefined;
}

export interface UpdatePaymentClaimCorrectionInput {
  actualAmountYuan: number;
  actualAmountCents: number;
  paidAt: number;
  note: string | null;
  updatedAt: number;
}

export interface InsertOrderEntitlementInput {
  userId: string;
  productId: string;
  orderId: string;
  createdAt: number;
}

const PAYMENT_CLAIM_COLUMNS =
  'id, order_no, user_id, product_id, list_amount_yuan, actual_amount_yuan, list_amount_cents, actual_amount_cents, paid_at, contact_text, screenshot_key, status, rejection_reason, admin_note, reviewed_by, reviewed_at, created_at, updated_at';

export async function findProductById(db: D1Database, productId: string): Promise<ProductRow | null> {
  return db
    .prepare(`SELECT id, title, price_yuan, price_cents, product_type, status, category_id FROM products WHERE id = ?`)
    .bind(productId)
    .first<ProductRow>();
}

export async function findPaymentClaimByOrderNo(
  db: D1Database,
  orderNo: string
): Promise<PaymentClaimRow | null> {
  return db
    .prepare(`SELECT ${PAYMENT_CLAIM_COLUMNS} FROM payment_claims WHERE order_no = ? LIMIT 1`)
    .bind(orderNo)
    .first<PaymentClaimRow>();
}

export async function findPaymentClaimById(
  db: D1Database,
  id: string
): Promise<PaymentClaimRow | null> {
  return db
    .prepare(`SELECT ${PAYMENT_CLAIM_COLUMNS} FROM payment_claims WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<PaymentClaimRow>();
}

export async function insertPaymentClaim(
  db: D1Database,
  input: InsertPaymentClaimInput
): Promise<PaymentClaimRow> {
  await db
    .prepare(
      `INSERT INTO payment_claims (
        id, order_no, user_id, product_id, list_amount_yuan, actual_amount_yuan, list_amount_cents, actual_amount_cents,
        paid_at, contact_text, screenshot_key, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(
      input.id,
      input.orderNo,
      input.userId,
      input.productId,
      input.listAmountYuan,
      input.actualAmountYuan,
      input.listAmountCents,
      input.actualAmountCents,
      input.paidAt,
      input.contactText,
      input.screenshotKey,
      input.createdAt,
      input.updatedAt
    )
    .run();

  const created = await findPaymentClaimById(db, input.id);
  if (!created) {
    throw new Error('Failed to load the newly created payment claim');
  }
  return created;
}

export async function listPaymentClaimsForUser(
  db: D1Database,
  userId: string
): Promise<PaymentClaimRow[]> {
  const result = await db
    .prepare(
      `SELECT ${PAYMENT_CLAIM_COLUMNS}
       FROM payment_claims
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<PaymentClaimRow>();
  return result.results ?? [];
}

export async function listAllPaymentClaims(db: D1Database): Promise<PaymentClaimRow[]> {
  const result = await db
    .prepare(`SELECT ${PAYMENT_CLAIM_COLUMNS} FROM payment_claims ORDER BY created_at DESC`)
    .all<PaymentClaimRow>();
  return result.results ?? [];
}

export async function listProductComponentIds(
  db: D1Database,
  parentProductId: string
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT child_product_id
       FROM product_components
       WHERE parent_product_id = ?
       ORDER BY child_product_id`
    )
    .bind(parentProductId)
    .all<{ child_product_id: string }>();
  return (result.results ?? []).map((row) => row.child_product_id);
}

export function buildUpdatePaymentClaimReviewStatement(
  db: D1Database,
  orderNo: string,
  input: UpdatePaymentClaimReviewInput
): D1PreparedStatement {
  const conditions = ['order_no = ?'];
  const bindings: Array<string | number | null> = [
    input.actualAmountYuan,
    input.actualAmountCents,
    input.status,
    input.rejectionReason,
    input.note,
    input.reviewedBy,
    input.reviewedAt,
    input.updatedAt,
    orderNo
  ];

  if (input.expectedStatus) {
    conditions.push('status = ?');
    bindings.push(input.expectedStatus);
  }
  if (input.expectedMembership) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM users
        WHERE id = ? AND membership_tier = ? AND membership_expires_at > ?
      )`
    );
    bindings.push(
      input.expectedMembership.userId,
      input.expectedMembership.tier,
      input.expectedMembership.activeAfter
    );
  }

  return db
    .prepare(
      `UPDATE payment_claims
       SET actual_amount_yuan = ?,
           actual_amount_cents = ?,
           status = ?,
           rejection_reason = ?,
           admin_note = ?,
           reviewed_by = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE ${conditions.join(' AND ')}`
    )
    .bind(...bindings);
}

export async function updatePaymentClaimReview(
  db: D1Database,
  orderNo: string,
  input: UpdatePaymentClaimReviewInput
): Promise<PaymentClaimRow> {
  await buildUpdatePaymentClaimReviewStatement(db, orderNo, input).run();

  const updated = await findPaymentClaimByOrderNo(db, orderNo);
  if (!updated) {
    throw new Error('Failed to load the updated payment claim');
  }
  return updated;
}

export async function updatePaymentClaimCorrection(
  db: D1Database,
  orderNo: string,
  input: UpdatePaymentClaimCorrectionInput
): Promise<PaymentClaimRow> {
  await db
    .prepare(
      `UPDATE payment_claims
       SET actual_amount_yuan = ?,
           actual_amount_cents = ?,
           paid_at = ?,
           admin_note = ?,
           updated_at = ?
       WHERE order_no = ?`
    )
    .bind(input.actualAmountYuan, input.actualAmountCents, input.paidAt, input.note, input.updatedAt, orderNo)
    .run();

  const updated = await findPaymentClaimByOrderNo(db, orderNo);
  if (!updated) {
    throw new Error('Failed to load the corrected payment claim');
  }
  return updated;
}

export async function insertOrderEntitlement(
  db: D1Database,
  input: InsertOrderEntitlementInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entitlements (id, user_id, product_id, status, source, order_id, created_at)
       VALUES (?, ?, ?, 'active', 'order', ?, ?)
       ON CONFLICT(user_id, product_id) WHERE status = 'active' DO NOTHING`
    )
    .bind(crypto.randomUUID(), input.userId, input.productId, input.orderId, input.createdAt)
    .run();
}


export interface ApprovedPaymentClaimRow {
  id: string;
  user_id: string;
  product_id: string;
  list_amount_cents: number;
  actual_amount_cents: number | null;
  confirmed_amount_cents: number;
  confirmed_at: number;
  category_id: string;
}

export interface PendingPaymentClaimSummary {
  count: number;
  totalCents: number;
}

// Only products that can actually earn revenue feed the revenue-by-product
// breakdown. Zero-priced / non-sellable placeholders (for example the DB-only
// `free` resource product) are excluded so the owner report shows no empty row.
export async function listProductsForRevenue(
  db: D1Database
): Promise<Array<{ id: string; title: string }>> {
  const result = await db
    .prepare(
      'SELECT id, title FROM products WHERE price_cents > 0 OR price_yuan > 0 ORDER BY sort_order, id'
    )
    .all<{ id: string; title: string }>();
  return result.results ?? [];
}

export async function listApprovedPaymentClaims(
  db: D1Database
): Promise<ApprovedPaymentClaimRow[]> {
  const result = await db
    .prepare(
      `SELECT pc.id, pc.user_id, pc.product_id,
              CASE
                WHEN pc.list_amount_cents > 0 THEN pc.list_amount_cents
                ELSE pc.list_amount_yuan * 100
              END AS list_amount_cents,
              CASE
                WHEN pc.actual_amount_cents IS NOT NULL THEN pc.actual_amount_cents
                WHEN pc.actual_amount_yuan IS NOT NULL THEN pc.actual_amount_yuan * 100
                ELSE NULL
              END AS actual_amount_cents,
              COALESCE(
                CASE
                  WHEN pc.actual_amount_cents IS NOT NULL THEN pc.actual_amount_cents
                  WHEN pc.actual_amount_yuan IS NOT NULL THEN pc.actual_amount_yuan * 100
                  ELSE NULL
                END,
                CASE
                  WHEN pc.list_amount_cents > 0 THEN pc.list_amount_cents
                  ELSE pc.list_amount_yuan * 100
                END
              ) AS confirmed_amount_cents,
              COALESCE(pc.reviewed_at, pc.created_at) AS confirmed_at,
              p.category_id
       FROM payment_claims pc
       JOIN products p ON p.id = pc.product_id
       WHERE pc.status = 'approved'
       ORDER BY confirmed_at`
    )
    .all<ApprovedPaymentClaimRow>();
  return result.results ?? [];
}

export async function getPendingPaymentClaimSummary(
  db: D1Database
): Promise<PendingPaymentClaimSummary> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(
                CASE
                  WHEN list_amount_cents > 0 THEN list_amount_cents
                  ELSE list_amount_yuan * 100
                END
              ), 0) AS total
       FROM payment_claims
       WHERE status = 'pending'`
    )
    .first<{ count: number; total: number }>();

  return { count: row?.count ?? 0, totalCents: row?.total ?? 0 };
}
