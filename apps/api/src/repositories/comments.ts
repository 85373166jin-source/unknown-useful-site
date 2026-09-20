import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  AdminCommentStatus,
  CommentStatus,
  MembershipTier,
  PermissionRole
} from '@site/contracts';

export interface CommentRow {
  id: string;
  product_id: string;
  lesson_id: string | null;
  user_id: string;
  body: string;
  status: CommentStatus;
  reviewed_by: string | null;
  reviewed_at: number | null;
  rejection_reason: string | null;
  visible_until: number | null;
  created_at: number;
  updated_at: number;
}

export interface CommentWithAuthorRow extends CommentRow {
  username: string;
  permission_role: PermissionRole;
  membership_tier: MembershipTier;
  membership_expires_at: number | null;
}

export interface InsertCommentInput {
  id: string;
  productId: string;
  lessonId: string | null;
  userId: string;
  body: string;
  status: CommentStatus;
  visibleUntil: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpdateCommentDecisionInput {
  status: 'public' | 'rejected';
  reviewedBy: string;
  reviewedAt: number;
  rejectionReason: string | null;
  updatedAt: number;
}

const COMMENT_COLUMNS =
  'c.id, c.product_id, c.lesson_id, c.user_id, c.body, c.status, c.reviewed_by, c.reviewed_at, c.rejection_reason, c.visible_until, c.created_at, c.updated_at';
const COMMENT_AUTHOR_COLUMNS =
  'COALESCE(u.display_name, u.username) AS username, u.permission_role AS permission_role, u.membership_tier AS membership_tier, u.membership_expires_at AS membership_expires_at';

export async function productExists(db: D1Database, productId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM products WHERE id = ? AND id != 'bundle' AND product_type IN ('course', 'digital')")
    .bind(productId)
    .first<{ id: string }>();
  return row !== null;
}

export async function findLessonForComment(
  db: D1Database,
  lessonId: string
): Promise<{ id: string; series_id: string } | null> {
  return db.prepare('SELECT id, series_id FROM lessons WHERE id = ?')
    .bind(lessonId)
    .first<{ id: string; series_id: string }>();
}

export async function findCommentById(db: D1Database, id: string): Promise<CommentRow | null> {
  return db
    .prepare(
      `SELECT id, product_id, lesson_id, user_id, body, status, reviewed_by, reviewed_at, rejection_reason, visible_until, created_at, updated_at
       FROM comments WHERE id = ?`
    )
    .bind(id)
    .first<CommentRow>();
}

export async function findCommentWithAuthorById(
  db: D1Database,
  id: string
): Promise<CommentWithAuthorRow | null> {
  return db
    .prepare(
      `SELECT ${COMMENT_COLUMNS}, ${COMMENT_AUTHOR_COLUMNS}
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`
    )
    .bind(id)
    .first<CommentWithAuthorRow>();
}

export async function listVisibleCommentsForProduct(
  db: D1Database,
  productId: string,
  viewerUserId: string | null,
  now: number
): Promise<CommentWithAuthorRow[]> {
  const result = await db
    .prepare(
      `SELECT ${COMMENT_COLUMNS}, ${COMMENT_AUTHOR_COLUMNS}
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.product_id = ?
         AND c.lesson_id IS NULL
         AND (
           c.status = 'public'
           OR (c.user_id = ? AND c.status IN ('pending', 'rejected'))
           OR (c.user_id = ? AND c.status = 'author_only' AND c.visible_until IS NOT NULL AND c.visible_until > ?)
         )
       ORDER BY c.created_at ASC, c.id ASC`
    )
    .bind(productId, viewerUserId, viewerUserId, now)
    .all<CommentWithAuthorRow>();
  return result.results ?? [];
}

export async function listVisibleCommentsForLesson(
  db: D1Database,
  lessonId: string,
  viewerUserId: string | null,
  now: number
): Promise<CommentWithAuthorRow[]> {
  const result = await db
    .prepare(
      `SELECT ${COMMENT_COLUMNS}, ${COMMENT_AUTHOR_COLUMNS}
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.lesson_id = ?
         AND (
           c.status = 'public'
           OR (c.user_id = ? AND c.status IN ('pending', 'rejected'))
           OR (c.user_id = ? AND c.status = 'author_only' AND c.visible_until IS NOT NULL AND c.visible_until > ?)
         )
       ORDER BY c.created_at ASC, c.id ASC`
    )
    .bind(lessonId, viewerUserId, viewerUserId, now)
    .all<CommentWithAuthorRow>();
  return result.results ?? [];
}

export async function listCommentsForAdmin(
  db: D1Database,
  status: AdminCommentStatus
): Promise<CommentWithAuthorRow[]> {
  const result = await db
    .prepare(
      `SELECT ${COMMENT_COLUMNS}, ${COMMENT_AUTHOR_COLUMNS}
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.status = ?
       ORDER BY c.created_at DESC, c.id DESC`
    )
    .bind(status)
    .all<CommentWithAuthorRow>();
  return result.results ?? [];
}

export async function insertComment(
  db: D1Database,
  input: InsertCommentInput
): Promise<CommentWithAuthorRow> {
  await db
    .prepare(
      `INSERT INTO comments
        (id, product_id, lesson_id, user_id, body, status, visible_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.productId,
      input.lessonId,
      input.userId,
      input.body,
      input.status,
      input.visibleUntil,
      input.createdAt,
      input.updatedAt
    )
    .run();

  const created = await findCommentWithAuthorById(db, input.id);
  if (!created) {
    throw new Error('Failed to load the newly created comment');
  }
  return created;
}

export function buildUpdateCommentDecisionStatement(
  db: D1Database,
  id: string,
  input: UpdateCommentDecisionInput
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE comments
       SET status = ?, reviewed_by = ?, reviewed_at = ?, rejection_reason = ?, visible_until = NULL, updated_at = ?
       WHERE id = ? AND status = 'pending'`
    )
    .bind(
      input.status,
      input.reviewedBy,
      input.reviewedAt,
      input.rejectionReason,
      input.updatedAt,
      id
    );
}

export function buildDeleteCommentStatement(db: D1Database, id: string): D1PreparedStatement {
  return db.prepare('DELETE FROM comments WHERE id = ?').bind(id);
}

export async function deleteExpiredAuthorOnlyComments(
  db: D1Database,
  now: number
): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM comments
       WHERE status = 'author_only' AND visible_until IS NOT NULL AND visible_until <= ?`
    )
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}

export async function deleteExpiredRateLimits(db: D1Database, now: number): Promise<number> {
  const result = await db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(now).run();
  return result.meta.changes ?? 0;
}
