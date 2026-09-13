import { ProductIdSchema, type ProductId } from '@site/contracts';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { listActiveEntitlementsForUser } from '../repositories/learning';
import {
  findPaymentClaimByOrderNo,
  findProductById,
  insertOrderEntitlement,
  insertPaymentClaim,
  listAllPaymentClaims,
  listPaymentClaimsForUser,
  listProductComponentIds,
  updatePaymentClaimCorrection,
  updatePaymentClaimReview,
  type PaymentClaimRow
} from '../repositories/orders';
import { recordAudit } from './audit';

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const SCREENSHOT_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

const CLAIMABLE_PRODUCT_STATUSES = new Set(['active', 'presale']);

export interface CreatePaymentClaimInput {
  productId: string;
  paidAt: string;
  contactText: string;
  screenshot: File;
}

export interface ReviewPaymentClaimInput {
  decision: 'approve' | 'reject' | 'correct';
  actualAmountYuan?: number | undefined;
  paidAt?: string | undefined;
  note?: string | undefined;
  rejectionReason?: string | undefined;
}

export interface PaymentClaimPayload {
  id: string;
  orderNo: string;
  userId: string;
  productId: string;
  listAmountYuan: number;
  actualAmountYuan: number | null;
  paidAt: number;
  contactText: string;
  status: PaymentClaimRow['status'];
  rejectionReason: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const ORDER_SUFFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomOrderSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let suffix = '';
  for (const byte of bytes) {
    suffix += ORDER_SUFFIX_ALPHABET[byte % ORDER_SUFFIX_ALPHABET.length] ?? 'A';
  }
  return suffix;
}

function todayOrderDate(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function generateUniqueOrderNo(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const orderNo = `HY-${todayOrderDate()}-${randomOrderSuffix()}`;
    const existing = await findPaymentClaimByOrderNo(db, orderNo);
    if (!existing) {
      return orderNo;
    }
  }
  throw new ApiError('internal_error', 'Unable to allocate a unique order number', 500);
}

function validateScreenshot(screenshot: File): void {
  if (!(SCREENSHOT_EXTENSIONS[screenshot.type])) {
    throw new ApiError('unsupported_media_type', 'Screenshot must be PNG, JPEG, or WebP', 400);
  }
  if (screenshot.size > MAX_SCREENSHOT_BYTES) {
    throw new ApiError('file_too_large', 'Screenshot must be 8 MiB or smaller', 400);
  }
}

export function toPaymentClaimPayload(row: PaymentClaimRow): PaymentClaimPayload {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    productId: row.product_id,
    listAmountYuan: row.list_amount_yuan,
    actualAmountYuan: row.actual_amount_yuan,
    paidAt: row.paid_at,
    contactText: row.contact_text,
    status: row.status,
    rejectionReason: row.rejection_reason,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface PaymentClaimAudit {
  orderNo: string;
  productId: string;
  listAmountYuan: number;
  actualAmountYuan: number | null;
  paidAt: number;
  status: PaymentClaimRow['status'];
  rejectionReason: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

function toPaymentClaimAudit(row: PaymentClaimRow): PaymentClaimAudit {
  return {
    orderNo: row.order_no,
    productId: row.product_id,
    listAmountYuan: row.list_amount_yuan,
    actualAmountYuan: row.actual_amount_yuan,
    paidAt: row.paid_at,
    status: row.status,
    rejectionReason: row.rejection_reason,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function assertProductCanBeClaimed(
  env: Env,
  userId: string,
  productId: ProductId
): Promise<void> {
  const entitlements = await listActiveEntitlementsForUser(env.DB, userId);
  const owned = new Set(entitlements.map((entitlement) => entitlement.product_id));

  if (productId === 'bundle') {
    if (owned.has('super') && owned.has('anbu')) {
      throw new ApiError('already_owned', 'You already own both courses in this bundle', 409);
    }
    return;
  }

  if (owned.has(productId)) {
    throw new ApiError('already_owned', 'You already own this product', 409);
  }
}

export async function createPaymentClaim(
  env: Env,
  userId: string,
  input: CreatePaymentClaimInput
): Promise<PaymentClaimRow> {
  const parsedProductId = ProductIdSchema.safeParse(input.productId);
  if (!parsedProductId.success) {
    throw new ApiError('invalid_product', 'Unsupported product', 400);
  }
  const productId = parsedProductId.data;

  const product = await findProductById(env.DB, productId);
  if (!product) {
    throw new ApiError('product_not_found', 'Product not found', 404);
  }

  if (!CLAIMABLE_PRODUCT_STATUSES.has(product.status)) {
    throw new ApiError('product_not_available', 'This product is not available for claims yet', 409);
  }

  const paidAt = Date.parse(input.paidAt);
  if (!Number.isFinite(paidAt)) {
    throw new ApiError('invalid_paid_at', 'Paid time must be a valid date', 400);
  }

  const contactText = input.contactText.trim();
  if (!contactText) {
    throw new ApiError('invalid_contact', 'Contact text is required', 400);
  }

  validateScreenshot(input.screenshot);
  await assertProductCanBeClaimed(env, userId, productId);

  const orderNo = await generateUniqueOrderNo(env.DB);
  const extension = SCREENSHOT_EXTENSIONS[input.screenshot.type];
  if (!extension) {
    throw new ApiError('unsupported_media_type', 'Screenshot must be PNG, JPEG, or WebP', 400);
  }
  const screenshotKey = `payment-claims/${userId}/${orderNo}.${extension}`;
  await env.SCREENSHOTS.put(screenshotKey, await input.screenshot.arrayBuffer(), {
    metadata: { contentType: input.screenshot.type }
  });
  const now = Date.now();
  return insertPaymentClaim(env.DB, {
    id: crypto.randomUUID(),
    orderNo,
    userId,
    productId,
    listAmountYuan: product.price_yuan,
    paidAt,
    contactText,
    screenshotKey,
    createdAt: now,
    updatedAt: now
  });
}

export async function listMyPaymentClaims(env: Env, userId: string): Promise<PaymentClaimRow[]> {
  return listPaymentClaimsForUser(env.DB, userId);
}

export async function listPaymentClaims(env: Env): Promise<PaymentClaimRow[]> {
  return listAllPaymentClaims(env.DB);
}

export async function getPaymentClaimScreenshot(
  env: Env,
  orderNo: string
): Promise<{ contentType: string; body: ArrayBuffer }> {
  const claim = await findPaymentClaimByOrderNo(env.DB, orderNo);
  if (!claim) {
    throw new ApiError('order_not_found', 'Payment claim not found', 404);
  }

  const object = await env.SCREENSHOTS.getWithMetadata<{ contentType?: string }>(claim.screenshot_key, 'arrayBuffer');
  if (!object.value) {
    throw new ApiError('screenshot_not_found', 'Screenshot not found', 404);
  }

  return {
    contentType: object.metadata?.contentType ?? 'application/octet-stream',
    body: object.value
  };
}

async function entitledProductIds(db: D1Database, productId: string): Promise<string[]> {
  const components = await listProductComponentIds(db, productId);
  return components.length > 0 ? components : [productId];
}

async function approvePaymentClaim(
  env: Env,
  reviewerUserId: string,
  claim: PaymentClaimRow,
  actualAmountYuan: number,
  note: string | null
): Promise<PaymentClaimRow> {
  const now = Date.now();
  const updated = await updatePaymentClaimReview(env.DB, claim.order_no, {
    status: 'approved',
    actualAmountYuan,
    rejectionReason: null,
    note,
    reviewedBy: reviewerUserId,
    reviewedAt: now,
    updatedAt: now
  });

  const productIds = await entitledProductIds(env.DB, claim.product_id);
  for (const productId of productIds) {
    await insertOrderEntitlement(env.DB, {
      userId: claim.user_id,
      productId,
      orderId: claim.id,
      createdAt: now
    });
  }

  await recordAudit(env, {
    actorUserId: reviewerUserId,
    action: 'order.approved',
    entityType: 'payment_claim',
    entityId: claim.order_no,
    before: toPaymentClaimAudit(claim),
    after: toPaymentClaimAudit(updated)
  });

  return updated;
}

async function rejectPaymentClaim(
  env: Env,
  reviewerUserId: string,
  claim: PaymentClaimRow,
  rejectionReason: string,
  note: string | null
): Promise<PaymentClaimRow> {
  const now = Date.now();
  const updated = await updatePaymentClaimReview(env.DB, claim.order_no, {
    status: 'rejected',
    actualAmountYuan: null,
    rejectionReason,
    note,
    reviewedBy: reviewerUserId,
    reviewedAt: now,
    updatedAt: now
  });

  await recordAudit(env, {
    actorUserId: reviewerUserId,
    action: 'order.rejected',
    entityType: 'payment_claim',
    entityId: claim.order_no,
    before: toPaymentClaimAudit(claim),
    after: toPaymentClaimAudit(updated)
  });

  return updated;
}

async function correctPaymentClaim(
  env: Env,
  reviewerUserId: string,
  claim: PaymentClaimRow,
  input: ReviewPaymentClaimInput
): Promise<PaymentClaimRow> {
  let paidAt = claim.paid_at;
  if (input.paidAt !== undefined) {
    const parsedPaidAt = Date.parse(input.paidAt);
    if (!Number.isFinite(parsedPaidAt)) {
      throw new ApiError('invalid_paid_at', 'Paid time must be a valid date', 400);
    }
    paidAt = parsedPaidAt;
  }

  const actualAmountYuan = input.actualAmountYuan ?? claim.actual_amount_yuan ?? claim.list_amount_yuan;
  const note = input.note === undefined ? claim.admin_note : input.note.trim() || null;
  const now = Date.now();
  const updated = await updatePaymentClaimCorrection(env.DB, claim.order_no, {
    actualAmountYuan,
    paidAt,
    note,
    updatedAt: now
  });

  await recordAudit(env, {
    actorUserId: reviewerUserId,
    action: 'order.corrected',
    entityType: 'payment_claim',
    entityId: claim.order_no,
    before: toPaymentClaimAudit(claim),
    after: toPaymentClaimAudit(updated)
  });

  return updated;
}

export async function reviewPaymentClaim(
  env: Env,
  reviewerUserId: string,
  orderNo: string,
  input: ReviewPaymentClaimInput
): Promise<PaymentClaimRow> {
  const claim = await findPaymentClaimByOrderNo(env.DB, orderNo);
  if (!claim) {
    throw new ApiError('order_not_found', 'Payment claim not found', 404);
  }

  if (input.decision === 'correct') {
    if (claim.status !== 'approved') {
      throw new ApiError('invalid_state', 'Only approved payment claims can be corrected', 409);
    }
    return correctPaymentClaim(env, reviewerUserId, claim, input);
  }

  if (input.decision === 'approve') {
    if (claim.status === 'approved') {
      return claim;
    }
    if (claim.status === 'rejected') {
      throw new ApiError('invalid_state', 'A rejected payment claim cannot be approved', 409);
    }
    const amount = input.actualAmountYuan ?? claim.list_amount_yuan;
    const note = input.note?.trim() || null;
    return approvePaymentClaim(env, reviewerUserId, claim, amount, note);
  }

  if (claim.status === 'rejected') {
    return claim;
  }
  if (claim.status === 'approved') {
    throw new ApiError('invalid_state', 'An approved payment claim cannot be rejected', 409);
  }

  const rejectionReason = input.rejectionReason?.trim();
  if (!rejectionReason) {
    throw new ApiError('invalid_request', 'Rejection reason is required', 400);
  }
  const note = input.note?.trim() || null;
  return rejectPaymentClaim(env, reviewerUserId, claim, rejectionReason, note);
}