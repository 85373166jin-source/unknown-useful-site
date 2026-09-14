import { ProductIdSchema, type ProductId } from '@site/contracts';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { listActiveEntitlementsForUser } from '../repositories/learning';
import { buildApplyMembershipPurchaseStatement, findUserById } from '../repositories/users';
import {
  findPaymentClaimByOrderNo,
  buildUpdatePaymentClaimReviewStatement,
  findProductById,
  insertOrderEntitlement,
  insertPaymentClaim,
  listAllPaymentClaims,
  listPaymentClaimsForUser,
  listProductComponentIds,
  updatePaymentClaimCorrection,
  updatePaymentClaimReview,
  type PaymentClaimRow,
  type ProductRow
} from '../repositories/orders';
import { recordAudit } from './audit';
import { applyMembershipPurchase, effectiveMembership } from './membership';
import { buildUpsertSubsiteStatement, type SubsiteTier } from './subsites';
import { priceProductForUser } from './pricing';

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const SCREENSHOT_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

const CLAIMABLE_PRODUCT_STATUSES = new Set(['active', 'presale']);

const MEMBERSHIP_PURCHASE_TIERS: Partial<Record<ProductId, 'vip' | 'svip'>> = {
  vip_monthly: 'vip',
  svip_monthly: 'svip'
};

export interface CreatePaymentClaimInput {
  productId: string;
  paidAt: string;
  contactText: string;
  screenshot: File;
}

export interface ProductQuote {
  productId: ProductId;
  title: string;
  listAmountCents: number;
  actualAmountCents: number;
}

export interface ReviewPaymentClaimInput {
  decision: 'approve' | 'reject' | 'correct';
  actualAmountYuan?: number | undefined;
  actualAmountCents?: number | undefined;
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
  listAmountCents: number;
  actualAmountCents: number | null;
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
    listAmountCents: row.list_amount_cents,
    actualAmountCents: row.actual_amount_cents,
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
  listAmountCents: number;
  actualAmountCents: number | null;
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
    listAmountCents: row.list_amount_cents,
    actualAmountCents: row.actual_amount_cents,
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

function listAmountCentsForProduct(product: { price_cents: number; price_yuan: number }): number {
  return product.price_cents > 0 ? product.price_cents : product.price_yuan * 100;
}

async function loadClaimableProduct(env: Env, productId: string) {
  const parsedProductId = ProductIdSchema.safeParse(productId);
  if (!parsedProductId.success) {
    throw new ApiError('invalid_product', 'Unsupported product', 400);
  }

  const product = await findProductById(env.DB, parsedProductId.data);
  if (!product) {
    throw new ApiError('product_not_found', 'Product not found', 404);
  }
  if (!CLAIMABLE_PRODUCT_STATUSES.has(product.status)) {
    throw new ApiError('product_not_available', 'This product is not available for claims yet', 409);
  }

  return { ...product, id: parsedProductId.data };
}

export async function getProductQuote(
  env: Env,
  userId: string,
  productId: string
): Promise<ProductQuote> {
  const product = await loadClaimableProduct(env, productId);
  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not active', 401);
  }

  const membership = effectiveMembership(
    { tier: user.membership_tier, expiresAt: user.membership_expires_at },
    Date.now()
  );
  const listAmountCents = listAmountCentsForProduct(product);
  const actualAmountCents = priceProductForUser(
    { price_cents: listAmountCents, product_type: product.product_type },
    membership
  );

  return {
    productId: product.id,
    title: product.title,
    listAmountCents,
    actualAmountCents
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
  const product = await loadClaimableProduct(env, input.productId);
  const productId = product.id;
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

  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not active', 401);
  }
  const membership = effectiveMembership(
    { tier: user.membership_tier, expiresAt: user.membership_expires_at },
    Date.now()
  );
  const listAmountCents = listAmountCentsForProduct(product);
  const actualAmountCents = priceProductForUser(
    { price_cents: listAmountCents, product_type: product.product_type },
    membership
  );
  const listAmountYuan = Math.round(listAmountCents / 100);
  const actualAmountYuan = Math.round(actualAmountCents / 100);

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
    listAmountYuan,
    actualAmountYuan,
    listAmountCents,
    actualAmountCents,
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

function resolvedActualAmount(
  claim: PaymentClaimRow,
  input: ReviewPaymentClaimInput
): { actualAmountYuan: number; actualAmountCents: number } {
  const storedCents = claim.actual_amount_cents ?? claim.list_amount_cents;

  if (input.actualAmountCents !== undefined) {
    return {
      actualAmountCents: input.actualAmountCents,
      actualAmountYuan: Math.round(input.actualAmountCents / 100)
    };
  }

  if (input.actualAmountYuan !== undefined) {
    return {
      actualAmountCents: input.actualAmountYuan * 100,
      actualAmountYuan: input.actualAmountYuan
    };
  }

  return {
    actualAmountCents: storedCents,
    actualAmountYuan: Math.round(storedCents / 100)
  };
}

async function approvePaymentClaim(
  env: Env,
  reviewerUserId: string,
  claim: PaymentClaimRow,
  actualAmountYuan: number,
  actualAmountCents: number,
  note: string | null
): Promise<PaymentClaimRow> {
  const now = Date.now();
  const purchasedTier = MEMBERSHIP_PURCHASE_TIERS[claim.product_id as ProductId];
  let membershipBefore: { tier: 'normal' | 'vip' | 'svip'; expiresAt: number | null } | null = null;
  let membershipStatement: ReturnType<typeof buildApplyMembershipPurchaseStatement> | null = null;
  let expectedMembership:
    | { userId: string; tier: 'vip' | 'svip'; activeAfter: number }
    | undefined;

  if (purchasedTier) {
    const user = await findUserById(env.DB, claim.user_id);
    if (!user) {
      throw new ApiError('user_not_found', 'User not found', 404);
    }

    const effective = effectiveMembership(
      { tier: user.membership_tier, expiresAt: user.membership_expires_at },
      now
    );
    try {
      applyMembershipPurchase(effective, purchasedTier, now);
    } catch (error) {
      if (error instanceof Error && error.message === 'SVIP cannot downgrade to VIP') {
        throw new ApiError('membership_downgrade', 'SVIP cannot be downgraded to VIP', 409);
      }
      throw error;
    }

    membershipBefore = effective;
    membershipStatement = buildApplyMembershipPurchaseStatement(
      env.DB,
      claim.user_id,
      purchasedTier,
      claim.order_no,
      now
    );
    expectedMembership = {
      userId: claim.user_id,
      tier: purchasedTier,
      activeAfter: now
    };
  }

  const subsiteTierMap: Record<string, SubsiteTier> = { partner_basic: 'basic', partner_advanced: 'advanced', partner_top: 'top' };
  const subsiteTier = subsiteTierMap[claim.product_id];
  const subsiteStatement = subsiteTier ? buildUpsertSubsiteStatement(env.DB, claim.user_id, subsiteTier, now) : null;

  const reviewStatement = buildUpdatePaymentClaimReviewStatement(env.DB, claim.order_no, {
    status: 'approved',
    actualAmountYuan,
    actualAmountCents,
    rejectionReason: null,
    note,
    reviewedBy: reviewerUserId,
    reviewedAt: now,
    updatedAt: now,
    expectedStatus: 'pending',
    expectedMembership
  });
  const statements = [
    ...(membershipStatement ? [membershipStatement] : []),
    ...(subsiteStatement ? [subsiteStatement] : []),
    reviewStatement
  ];
  const results = await env.DB.batch(statements);
  const reviewResult = results[results.length - 1];
  if ((reviewResult?.meta?.changes ?? 0) !== 1) {
    const currentUser = purchasedTier ? await findUserById(env.DB, claim.user_id) : null;
    const currentMembership = currentUser
      ? effectiveMembership(
          { tier: currentUser.membership_tier, expiresAt: currentUser.membership_expires_at },
          now
        )
      : null;
    if (currentMembership?.tier === 'svip' && purchasedTier === 'vip') {
      throw new ApiError('membership_downgrade', 'SVIP cannot be downgraded to VIP', 409);
    }
    throw new ApiError('invalid_state', 'Payment claim is no longer pending', 409);
  }

  const updated = await findPaymentClaimByOrderNo(env.DB, claim.order_no);
  if (!updated) {
    throw new Error('Failed to load the updated payment claim');
  }

  let membershipAfter: { tier: 'vip' | 'svip'; expiresAt: number } | null = null;
  if (purchasedTier) {
    const updatedUser = await findUserById(env.DB, claim.user_id);
    if (
      !updatedUser ||
      (updatedUser.membership_tier !== 'vip' && updatedUser.membership_tier !== 'svip') ||
      updatedUser.membership_expires_at === null
    ) {
      throw new Error('Failed to load the updated membership');
    }
    membershipAfter = {
      tier: updatedUser.membership_tier,
      expiresAt: updatedUser.membership_expires_at
    };
  }

  if (!purchasedTier) {
    const productIds = await entitledProductIds(env.DB, claim.product_id);
    for (const productId of productIds) {
      await insertOrderEntitlement(env.DB, {
        userId: claim.user_id,
        productId,
        orderId: claim.id,
        createdAt: now
      });
    }
  }

  const beforeAudit = membershipBefore
    ? {
        ...toPaymentClaimAudit(claim),
        membershipTier: membershipBefore.tier,
        membershipExpiresAt: membershipBefore.expiresAt
      }
    : toPaymentClaimAudit(claim);
  const afterAudit = membershipAfter
    ? {
        ...toPaymentClaimAudit(updated),
        membershipTier: membershipAfter.tier,
        membershipExpiresAt: membershipAfter.expiresAt
      }
    : toPaymentClaimAudit(updated);

  await recordAudit(env, {
    actorUserId: reviewerUserId,
    action: 'order.approved',
    entityType: 'payment_claim',
    entityId: claim.order_no,
    before: beforeAudit,
    after: afterAudit
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
    actualAmountCents: null,
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

  const amount = resolvedActualAmount(claim, input);
  const note = input.note === undefined ? claim.admin_note : input.note.trim() || null;
  const now = Date.now();
  const updated = await updatePaymentClaimCorrection(env.DB, claim.order_no, {
    actualAmountYuan: amount.actualAmountYuan,
    actualAmountCents: amount.actualAmountCents,
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
    const amount = resolvedActualAmount(claim, input);
    const note = input.note?.trim() || null;
    return approvePaymentClaim(
      env,
      reviewerUserId,
      claim,
      amount.actualAmountYuan,
      amount.actualAmountCents,
      note
    );
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
