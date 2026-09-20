import { z } from 'zod';
import { MembershipTierSchema } from './identity';

export const COMMENT_STATUSES = ['pending', 'public', 'rejected', 'author_only'] as const;
export const CommentStatusSchema = z.enum(COMMENT_STATUSES);
export type CommentStatus = z.infer<typeof CommentStatusSchema>;

export const COMMENT_BODY_MAX_LENGTH = 1000;
export const CommentBodySchema = z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH);
export const CreateCommentSchema = z.object({ body: CommentBodySchema });
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const CommentDecisionSchema = z.enum(['approve', 'reject']);
export type CommentDecision = z.infer<typeof CommentDecisionSchema>;

export const AdminCommentStatusSchema = z.enum(['pending', 'public', 'author_only']);
export type AdminCommentStatus = z.infer<typeof AdminCommentStatusSchema>;

export const ReviewCommentSchema = z.object({
  decision: CommentDecisionSchema,
  rejectionReason: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH).optional()
});
export type ReviewCommentInput = z.infer<typeof ReviewCommentSchema>;

export const CommentAuthorSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  membershipTier: MembershipTierSchema,
  membershipRemainingDays: z.number().int().nonnegative(),
  isAdmin: z.boolean()
});
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;

export const CommentSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  lessonId: z.string().nullable(),
  body: z.string().min(1).max(COMMENT_BODY_MAX_LENGTH),
  status: CommentStatusSchema,
  author: CommentAuthorSchema,
  reviewedBy: z.string().nullable(),
  reviewedAt: z.number().int().nonnegative().nullable(),
  rejectionReason: z.string().nullable(),
  visibleUntil: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
});
export type Comment = z.infer<typeof CommentSchema>;

export const CommentViewerStatusSchema = z.enum(['guest', 'normal', 'vip', 'svip']);
export type CommentViewerStatus = z.infer<typeof CommentViewerStatusSchema>;

export const CommentsResponseSchema = z.object({
  comments: z.array(CommentSchema),
  canComment: z.boolean(),
  currentStatus: CommentViewerStatusSchema
});
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;

export const AdminCommentsResponseSchema = z.object({
  comments: z.array(CommentSchema)
});
export type AdminCommentsResponse = z.infer<typeof AdminCommentsResponseSchema>;
