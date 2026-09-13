import { describe, expect, it } from 'vitest';
import {
  CommentBodySchema,
  CommentDecisionSchema,
  CommentStatusSchema,
  CreateCommentSchema
} from './comments';

describe('comment contracts', () => {
  it('accepts only the four persisted comment statuses', () => {
    expect(CommentStatusSchema.options).toEqual(['pending', 'public', 'rejected', 'author_only']);
    expect(CommentStatusSchema.safeParse('hidden').success).toBe(false);
  });

  it('trims plain-text comment bodies and enforces the 1 to 1000 character range', () => {
    expect(CreateCommentSchema.parse({ body: '  hello  ' })).toEqual({ body: 'hello' });
    expect(CommentBodySchema.safeParse('   ').success).toBe(false);
    expect(CommentBodySchema.safeParse('x'.repeat(1001)).success).toBe(false);
  });

  it('accepts only approve and reject moderation decisions', () => {
    expect(CommentDecisionSchema.options).toEqual(['approve', 'reject']);
  });
});
