import type {
  AdminCommentStatus,
  Comment,
  CommentDecision,
  CommentViewerStatus,
  CommentsResponse,
  MembershipTier,
  PermissionRole
} from '@site/contracts';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import {
  countCommentsSince,
  deleteCommentById,
  deleteExpiredAuthorOnlyComments,
  deleteExpiredRateLimits,
  findCommentById,
  findCommentWithAuthorById,
  insertComment,
  listCommentsForAdmin,
  listVisibleCommentsForProduct,
  productExists,
  updateCommentDecision,
  type CommentWithAuthorRow
} from '../repositories/comments';
import { findUserById, type UserRow } from '../repositories/users';
import { recordAudit } from './audit';
import { effectiveMembership, membershipRemainingDays } from './membership';

export const SVIP_COMMENT_WINDOW_MS = 10 * 60 * 1000;
export const AUTHOR_ONLY_VISIBLE_MS = 60 * 60 * 1000;
export const SVIP_PUBLIC_COMMENT_LIMIT = 3;

export interface CleanupResult {
  commentsDeleted: number;
  rateLimitsDeleted: number;
}

function viewerStatus(user: UserRow | null, now: number): CommentViewerStatus {
  if (!user) {
    return 'guest';
  }
  return effectiveMembership(
    { tier: user.membership_tier, expiresAt: user.membership_expires_at },
    now
  ).tier;
}

export function toCommentPayload(row: CommentWithAuthorRow, now = Date.now()): Comment {
  const membershipTier: MembershipTier = effectiveMembership(
    { tier: row.membership_tier, expiresAt: row.membership_expires_at },
    now
  ).tier;

  return {
    id: row.id,
    productId: row.product_id,
    body: row.body,
    status: row.status,
    author: {
      id: row.user_id,
      username: row.username,
      membershipTier,
      membershipRemainingDays: membershipRemainingDays(
        { tier: row.membership_tier, expiresAt: row.membership_expires_at },
        now
      ),
      isAdmin: row.permission_role !== 'user'
    },
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    visibleUntil: row.visible_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getProductComments(
  env: Env,
  productId: string,
  viewerUserId: string | null
): Promise<CommentsResponse> {
  if (!(await productExists(env.DB, productId))) {
    throw new ApiError('product_not_found', 'Product not found', 404);
  }

  const now = Date.now();
  const viewer = viewerUserId ? await findUserById(env.DB, viewerUserId) : null;
  const rows = await listVisibleCommentsForProduct(env.DB, productId, viewerUserId, now);
  return {
    comments: rows.map((row) => toCommentPayload(row, now)),
    canComment: viewer !== null,
    currentStatus: viewerStatus(viewer, now)
  };
}

export async function createComment(
  env: Env,
  userId: string,
  productId: string,
  body: string
): Promise<Comment> {
  if (!(await productExists(env.DB, productId))) {
    throw new ApiError('product_not_found', 'Product not found', 404);
  }

  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  const now = Date.now();
  const membership = effectiveMembership(
    { tier: user.membership_tier, expiresAt: user.membership_expires_at },
    now
  );

  let status: 'pending' | 'public' | 'author_only' = 'pending';
  let visibleUntil: number | null = null;
  if (membership.tier === 'svip') {
    const recentCount = await countCommentsSince(env.DB, userId, now - SVIP_COMMENT_WINDOW_MS);
    if (recentCount < SVIP_PUBLIC_COMMENT_LIMIT) {
      status = 'public';
    } else {
      status = 'author_only';
      visibleUntil = now + AUTHOR_ONLY_VISIBLE_MS;
    }
  }

  const created = await insertComment(env.DB, {
    id: crypto.randomUUID(),
    productId,
    userId,
    body,
    status,
    visibleUntil,
    createdAt: now,
    updatedAt: now
  });
  return toCommentPayload(created, now);
}

export async function listAdminComments(
  env: Env,
  status: AdminCommentStatus
): Promise<Comment[]> {
  const now = Date.now();
  const rows = await listCommentsForAdmin(env.DB, status);
  return rows.map((row) => toCommentPayload(row, now));
}

export async function reviewComment(
  env: Env,
  moderatorUserId: string,
  commentId: string,
  decision: CommentDecision,
  rejectionReason?: string
): Promise<Comment> {
  const comment = await findCommentById(env.DB, commentId);
  if (!comment) {
    throw new ApiError('comment_not_found', 'Comment not found', 404);
  }
  if (comment.status !== 'pending') {
    throw new ApiError('invalid_state', 'Only pending comments can be reviewed', 409);
  }

  const now = Date.now();
  const status = decision === 'approve' ? 'public' : 'rejected';
  const reason = decision === 'reject' ? rejectionReason?.trim() || null : null;
  const updated = await updateCommentDecision(env.DB, commentId, {
    status,
    reviewedBy: moderatorUserId,
    reviewedAt: now,
    rejectionReason: reason,
    updatedAt: now
  });
  if (!updated) {
    throw new ApiError('invalid_state', 'Comment is no longer pending', 409);
  }

  const reviewed = await findCommentWithAuthorById(env.DB, commentId);
  if (!reviewed) {
    throw new Error('Failed to load the reviewed comment');
  }

  await recordAudit(env, {
    actorUserId: moderatorUserId,
    action: decision === 'approve' ? 'comment.approved' : 'comment.rejected',
    entityType: 'comment',
    entityId: commentId,
    before: {
      id: comment.id,
      productId: comment.product_id,
      body: comment.body,
      status: comment.status
    },
    after: {
      id: reviewed.id,
      productId: reviewed.product_id,
      body: reviewed.body,
      status: reviewed.status,
      rejectionReason: reviewed.rejection_reason
    }
  });

  return toCommentPayload(reviewed, now);
}

export async function deleteComment(
  env: Env,
  actorUserId: string,
  actorRole: PermissionRole,
  commentId: string
): Promise<void> {
  const comment = await findCommentById(env.DB, commentId);
  if (!comment) {
    throw new ApiError('comment_not_found', 'Comment not found', 404);
  }

  const canDeleteAny = actorRole === 'admin' || actorRole === 'owner';
  if (comment.user_id !== actorUserId && !canDeleteAny) {
    throw new ApiError('forbidden', 'Comment deletion is not allowed', 403);
  }

  const deleted = await deleteCommentById(env.DB, commentId);
  if (!deleted) {
    throw new ApiError('comment_not_found', 'Comment not found', 404);
  }

  await recordAudit(env, {
    actorUserId,
    action: 'comment.deleted',
    entityType: 'comment',
    entityId: commentId,
    before: {
      id: comment.id,
      productId: comment.product_id,
      userId: comment.user_id,
      body: comment.body,
      status: comment.status
    }
  });
}

export async function cleanupExpiredData(env: Env, now = Date.now()): Promise<CleanupResult> {
  const [commentsDeleted, rateLimitsDeleted] = await Promise.all([
    deleteExpiredAuthorOnlyComments(env.DB, now),
    deleteExpiredRateLimits(env.DB, now)
  ]);
  return { commentsDeleted, rateLimitsDeleted };
}

