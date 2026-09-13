import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };
const HOUR_MS = 60 * 60 * 1000;

type CommentStatus = 'pending' | 'public' | 'rejected' | 'author_only';

type CommentPayload = {
  id: string;
  productId: string;
  body: string;
  status: CommentStatus;
  author: {
    id: string;
    username: string;
    membershipTier: 'normal' | 'vip' | 'svip';
    membershipRemainingDays: number;
    isAdmin: boolean;
  };
  reviewedBy: string | null;
  reviewedAt: number | null;
  rejectionReason: string | null;
  visibleUntil: number | null;
  createdAt: number;
  updatedAt: number;
};

type CommentsResponse = {
  comments: CommentPayload[];
  canComment: boolean;
  currentStatus: 'guest' | 'normal' | 'vip' | 'svip';
};

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonAuthHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), ...JSON_HEADERS };
}

async function expectError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const body = await response.json<{ error: { code: string } }>();
  expect(body.error.code).toBe(code);
}

async function seedProduct(productId = 'super'): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO products
      (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
     VALUES (?, ?, 29, 2900, 'course', 'active', 'courses', 1, '', ?, ?)`
  )
    .bind(productId, productId, now, now)
    .run();
}

async function registerUser(username: string): Promise<{ token: string; userId: string }> {
  const response = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password: 'long-password-123' })
    },
    env
  );
  expect(response.status).toBe(201);
  const body = await response.json<{ token: string }>();
  const me = await app.request('/api/v1/auth/me', { headers: authHeaders(body.token) }, env);
  expect(me.status).toBe(200);
  const meBody = await me.json<{ user: { id: string } }>();
  return { token: body.token, userId: meBody.user.id };
}

async function seedPrivilegedUser(
  id: string,
  username: string,
  permissionRole: 'admin' | 'owner'
): Promise<{ token: string; userId: string }> {
  const now = Date.now();
  const passwordHash = await hashPassword('moderator-password-123');
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, permission_role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', ?, 'active', ?, ?)`
  )
    .bind(id, username, passwordHash, permissionRole, now, now)
    .run();

  const login = await app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password: 'moderator-password-123' })
    },
    env
  );
  expect(login.status).toBe(200);
  const body = await login.json<{ token: string }>();
  return { token: body.token, userId: id };
}

async function setMembership(
  userId: string,
  tier: 'normal' | 'vip' | 'svip',
  expiresAt: number | null
): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET membership_tier = ?, membership_expires_at = ?, updated_at = ? WHERE id = ?'
  )
    .bind(tier, expiresAt, Date.now(), userId)
    .run();
}

async function postComment(
  token: string,
  body: string,
  productId = 'super'
): Promise<Response> {
  return app.request(
    `/api/v1/products/${productId}/comments`,
    {
      method: 'POST',
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ body })
    },
    env
  );
}

interface InsertCommentInput {
  id: string;
  productId?: string;
  userId: string;
  body?: string;
  status: CommentStatus;
  createdAt?: number;
  visibleUntil?: number | null;
  rejectionReason?: string | null;
}

async function insertComment(input: InsertCommentInput): Promise<void> {
  const createdAt = input.createdAt ?? Date.now();
  await env.DB.prepare(
    `INSERT INTO comments
      (id, product_id, user_id, body, status, rejection_reason, visible_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.id,
      input.productId ?? 'super',
      input.userId,
      input.body ?? `body-${input.id}`,
      input.status,
      input.rejectionReason ?? null,
      input.visibleUntil ?? null,
      createdAt,
      createdAt
    )
    .run();
}

describe('comments API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedProduct();
  });

  it('shows public comments to guests and the author moderation states to the author', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
         VALUES ('public', 'super', ?, 'public body', 'public', NULL, ?, ?)`
      ).bind(alice.userId, now - 5000, now - 5000),
      env.DB.prepare(
        `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
         VALUES ('pending', 'super', ?, 'pending body', 'pending', NULL, ?, ?)`
      ).bind(alice.userId, now - 4000, now - 4000),
      env.DB.prepare(
        `INSERT INTO comments (id, product_id, user_id, body, status, rejection_reason, visible_until, created_at, updated_at)
         VALUES ('rejected', 'super', ?, 'rejected body', 'rejected', 'no', NULL, ?, ?)`
      ).bind(alice.userId, now - 3000, now - 3000),
      env.DB.prepare(
        `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
         VALUES ('author-only', 'super', ?, 'author body', 'author_only', ?, ?, ?)`
      ).bind(alice.userId, now + HOUR_MS, now - 2000, now - 2000),
      env.DB.prepare(
        `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
         VALUES ('other-pending', 'super', ?, 'other body', 'pending', NULL, ?, ?)`
      ).bind(bob.userId, now - 1000, now - 1000),
      env.DB.prepare(
        `INSERT INTO comments (id, product_id, user_id, body, status, visible_until, created_at, updated_at)
         VALUES ('expired-author-only', 'super', ?, 'expired body', 'author_only', ?, ?, ?)`
      ).bind(alice.userId, now - 1, now - 6000, now - 6000)
    ]);

    const guest = await app.request('/api/v1/products/super/comments', {}, env);
    expect(guest.status).toBe(200);
    const guestBody = await guest.json<CommentsResponse>();
    expect(guestBody.comments.map((comment) => comment.id)).toEqual(['public']);
    expect(guestBody.canComment).toBe(false);
    expect(guestBody.currentStatus).toBe('guest');

    const author = await app.request(
      '/api/v1/products/super/comments',
      { headers: authHeaders(alice.token) },
      env
    );
    expect(author.status).toBe(200);
    const authorBody = await author.json<CommentsResponse>();
    expect(authorBody.comments.map((comment) => comment.id)).toEqual([
      'public',
      'pending',
      'rejected',
      'author-only'
    ]);
    expect(authorBody.canComment).toBe(true);
    expect(authorBody.currentStatus).toBe('normal');
    expect(authorBody.comments[3]?.author).toMatchObject({
      id: alice.userId,
      username: 'alice',
      membershipTier: 'normal',
      membershipRemainingDays: 0,
      isAdmin: false
    });
  });

  it('creates normal and VIP comments as pending', async () => {
    const alice = await registerUser('alice');

    const normal = await postComment(alice.token, '  normal comment  ');
    expect(normal.status).toBe(201);
    const normalBody = await normal.json<CommentPayload>();
    expect(normalBody).toMatchObject({ status: 'pending', body: 'normal comment' });
    expect(normalBody.visibleUntil).toBeNull();

    await setMembership(alice.userId, 'vip', Date.now() + 30 * 24 * HOUR_MS);
    const vip = await postComment(alice.token, 'vip comment');
    expect(vip.status).toBe(201);
    const vipBody = await vip.json<CommentPayload>();
    expect(vipBody.status).toBe('pending');
    expect(vipBody.author.membershipTier).toBe('vip');
    expect(vipBody.author.membershipRemainingDays).toBeGreaterThan(0);
  });

  it('publishes the first three SVIP comments and keeps later comments author-only for one hour', async () => {
    const alice = await registerUser('alice');
    await setMembership(alice.userId, 'svip', Date.now() + 30 * 24 * HOUR_MS);

    const created: CommentPayload[] = [];
    for (let index = 1; index <= 4; index += 1) {
      const response = await postComment(alice.token, `svip comment ${index}`);
      expect(response.status).toBe(201);
      created.push(await response.json<CommentPayload>());
    }

    expect(created.map((comment) => comment.status)).toEqual([
      'public',
      'public',
      'public',
      'author_only'
    ]);
    expect(created.slice(0, 3).map((comment) => comment.visibleUntil)).toEqual([null, null, null]);
    expect(created[3]?.visibleUntil).toBe((created[3]?.createdAt ?? 0) + HOUR_MS);

    const guest = await app.request('/api/v1/products/super/comments', {}, env);
    const guestBody = await guest.json<CommentsResponse>();
    expect(guestBody.comments).toHaveLength(3);

    const author = await app.request(
      '/api/v1/products/super/comments',
      { headers: authHeaders(alice.token) },
      env
    );
    const authorBody = await author.json<CommentsResponse>();
    expect(authorBody.comments).toHaveLength(4);
    expect(authorBody.comments[3]?.status).toBe('author_only');
  });

  it('resets the SVIP quota at the next fixed ten-minute window and treats expired memberships as normal', async () => {
    const alice = await registerUser('alice');
    const now = Date.now();
    await setMembership(alice.userId, 'svip', now + 30 * 24 * HOUR_MS);
    const key = `comment:svip:${alice.userId}`;
    await env.DB.prepare(
      `INSERT INTO rate_limits (rate_key, window_start, count, expires_at) VALUES (?, ?, 3, ?)`
    ).bind(key, 1, 1).run();

    const recent = await postComment(alice.token, 'new window');
    expect(recent.status).toBe(201);
    await expect(recent.json<CommentPayload>()).resolves.toMatchObject({ status: 'public' });
    const quota = await env.DB.prepare(
      'SELECT count FROM rate_limits WHERE rate_key = ?'
    ).bind(key).first<{ count: number }>();
    expect(quota?.count).toBe(1);

    await setMembership(alice.userId, 'svip', now - 1);
    const expired = await postComment(alice.token, 'expired membership');
    expect(expired.status).toBe(201);
    await expect(expired.json<CommentPayload>()).resolves.toMatchObject({ status: 'pending' });
  });

  it('does not release SVIP quota when a comment is deleted in the same window', async () => {
    const alice = await registerUser('alice');
    await setMembership(alice.userId, 'svip', Date.now() + 30 * 24 * HOUR_MS);

    const created: CommentPayload[] = [];
    for (let index = 1; index <= 3; index += 1) {
      const response = await postComment(alice.token, `quota ${index}`);
      expect(response.status).toBe(201);
      created.push(await response.json<CommentPayload>());
    }
    expect(created.map((comment) => comment.status)).toEqual(['public', 'public', 'public']);

    const deleted = await app.request(
      `/api/v1/comments/${created[0]?.id}`,
      { method: 'DELETE', headers: authHeaders(alice.token) },
      env
    );
    expect(deleted.status).toBe(200);

    const fourth = await postComment(alice.token, 'after delete');
    expect(fourth.status).toBe(201);
    await expect(fourth.json<CommentPayload>()).resolves.toMatchObject({ status: 'author_only' });

    const quota = await env.DB.prepare(
      'SELECT count FROM rate_limits WHERE rate_key = ?'
    ).bind(`comment:svip:${alice.userId}`).first<{ count: number }>();
    expect(quota?.count).toBe(4);
  });

  it('atomically consumes SVIP quota for concurrent-equivalent posts', async () => {
    const alice = await registerUser('alice');
    await setMembership(alice.userId, 'svip', Date.now() + 30 * 24 * HOUR_MS);

    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, index) => postComment(alice.token, `concurrent ${index + 1}`))
    );
    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const comments = await Promise.all(
      responses.map((response) => response.json<CommentPayload>())
    );
    expect(comments.filter((comment) => comment.status === 'public')).toHaveLength(3);
    expect(comments.filter((comment) => comment.status === 'author_only')).toHaveLength(1);

    const quota = await env.DB.prepare(
      'SELECT count FROM rate_limits WHERE rate_key = ?'
    ).bind(`comment:svip:${alice.userId}`).first<{ count: number }>();
    expect(quota?.count).toBe(4);
  });

  it('rejects missing products, unauthenticated posts, and invalid comment bodies', async () => {
    const alice = await registerUser('alice');

    await expectError(await app.request('/api/v1/products/missing/comments', {}, env), 404, 'product_not_found');
    await expectError(await postComment(alice.token, 'hello', 'missing'), 404, 'product_not_found');
    await expectError(
      await app.request('/api/v1/products/super/comments', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ body: 'hello' })
      }, env),
      401,
      'unauthorized'
    );
    await expectError(await postComment(alice.token, '   '), 400, 'invalid_request');
    await expectError(await postComment(alice.token, 'x'.repeat(1001)), 400, 'invalid_request');
    await expectError(
      await app.request('/api/v1/products/super/comments', { headers: { authorization: 'Bearer invalid' } }, env),
      401,
      'unauthorized'
    );
  });
});

describe('comments moderation API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedProduct();
  });

  it('lists, approves, and rejects pending comments with audit records', async () => {
    const alice = await registerUser('alice');
    const moderator = await seedPrivilegedUser('moderator-1', 'moderator-1', 'admin');
    const pending = await (await postComment(alice.token, 'please review')).json<CommentPayload>();

    const pendingList = await app.request(
      '/api/v1/admin/comments?status=pending',
      { headers: authHeaders(moderator.token) },
      env
    );
    expect(pendingList.status).toBe(200);
    const pendingBody = await pendingList.json<{ comments: CommentPayload[] }>();
    expect(pendingBody.comments.map((comment) => comment.id)).toEqual([pending.id]);

    const approved = await app.request(
      `/api/v1/admin/comments/${pending.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(moderator.token),
        body: JSON.stringify({ decision: 'approve' })
      },
      env
    );
    expect(approved.status).toBe(200);
    const approvedBody = await approved.json<CommentPayload>();
    expect(approvedBody).toMatchObject({
      status: 'public',
      reviewedBy: moderator.userId,
      rejectionReason: null,
      visibleUntil: null
    });
    expect(approvedBody.reviewedAt).not.toBeNull();

    await expectError(
      await app.request(
        `/api/v1/admin/comments/${pending.id}`,
        {
          method: 'PATCH',
          headers: jsonAuthHeaders(moderator.token),
          body: JSON.stringify({ decision: 'reject', rejectionReason: 'late' })
        },
        env
      ),
      409,
      'invalid_state'
    );

    const nextPending = await (await postComment(alice.token, 'reject me')).json<CommentPayload>();
    const rejected = await app.request(
      `/api/v1/admin/comments/${nextPending.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(moderator.token),
        body: JSON.stringify({ decision: 'reject', rejectionReason: 'not allowed' })
      },
      env
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json<CommentPayload>()).toMatchObject({
      status: 'rejected',
      rejectionReason: 'not allowed'
    });

    const author = await app.request(
      '/api/v1/products/super/comments',
      { headers: authHeaders(alice.token) },
      env
    );
    const authorBody = await author.json<CommentsResponse>();
    expect(authorBody.comments.find((comment) => comment.id === nextPending.id)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'not allowed'
    });

    const guest = await app.request('/api/v1/products/super/comments', {}, env);
    const guestBody = await guest.json<CommentsResponse>();
    expect(guestBody.comments.map((comment) => comment.id)).toContain(pending.id);
    expect(guestBody.comments.map((comment) => comment.id)).not.toContain(nextPending.id);

    const audits = await env.DB.prepare(
      `SELECT action, entity_id, actor_user_id FROM audit_logs
       WHERE entity_type = 'comment' ORDER BY created_at`
    ).all<{ action: string; entity_id: string; actor_user_id: string }>();
    expect(audits.results).toEqual(
      expect.arrayContaining([
        { action: 'comment.approved', entity_id: pending.id, actor_user_id: moderator.userId },
        { action: 'comment.rejected', entity_id: nextPending.id, actor_user_id: moderator.userId }
      ])
    );
  });

  it('supports public and author-only admin filters', async () => {
    const alice = await registerUser('alice');
    const moderator = await seedPrivilegedUser('moderator-1', 'moderator-1', 'admin');
    await insertComment({ id: 'public', userId: alice.userId, status: 'public' });
    await insertComment({
      id: 'author-only',
      userId: alice.userId,
      status: 'author_only',
      visibleUntil: Date.now() + HOUR_MS
    });

    const publicList = await app.request(
      '/api/v1/admin/comments?status=public',
      { headers: authHeaders(moderator.token) },
      env
    );
    expect(publicList.status).toBe(200);
    await expect(publicList.json<{ comments: CommentPayload[] }>()).resolves.toMatchObject({
      comments: [expect.objectContaining({ id: 'public' })]
    });

    const authorOnlyList = await app.request(
      '/api/v1/admin/comments?status=author_only',
      { headers: authHeaders(moderator.token) },
      env
    );
    expect(authorOnlyList.status).toBe(200);
    await expect(authorOnlyList.json<{ comments: CommentPayload[] }>()).resolves.toMatchObject({
      comments: [expect.objectContaining({ id: 'author-only' })]
    });
  });

  it('allows authors to delete their own comments and owner/admin users to delete any comment', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const moderator = await seedPrivilegedUser('moderator-1', 'moderator-1', 'admin');
    const first = await (await postComment(alice.token, 'delete mine')).json<CommentPayload>();
    const second = await (await postComment(alice.token, 'delete any')).json<CommentPayload>();

    await expectError(
      await app.request(`/api/v1/comments/${first.id}`, { method: 'DELETE', headers: authHeaders(bob.token) }, env),
      403,
      'forbidden'
    );

    const ownDelete = await app.request(
      `/api/v1/comments/${first.id}`,
      { method: 'DELETE', headers: authHeaders(alice.token) },
      env
    );
    expect(ownDelete.status).toBe(200);

    const moderatorDelete = await app.request(
      `/api/v1/admin/comments/${second.id}`,
      { method: 'DELETE', headers: authHeaders(moderator.token) },
      env
    );
    expect(moderatorDelete.status).toBe(200);

    const rows = await env.DB.prepare('SELECT id FROM comments ORDER BY id').all<{ id: string }>();
    expect(rows.results).toEqual([]);

    const audits = await env.DB.prepare(
      `SELECT action, entity_id, actor_user_id FROM audit_logs
       WHERE action = 'comment.deleted' ORDER BY created_at`
    ).all<{ action: string; entity_id: string; actor_user_id: string }>();
    expect(audits.results).toEqual(
      expect.arrayContaining([
        { action: 'comment.deleted', entity_id: first.id, actor_user_id: alice.userId },
        { action: 'comment.deleted', entity_id: second.id, actor_user_id: moderator.userId }
      ])
    );
  });

  it('rejects moderation for unprivileged users and invalid filters', async () => {
    const alice = await registerUser('alice');
    const pending = await (await postComment(alice.token, 'pending')).json<CommentPayload>();

    await expectError(
      await app.request(
        `/api/v1/admin/comments/${pending.id}`,
        {
          method: 'PATCH',
          headers: jsonAuthHeaders(alice.token),
          body: JSON.stringify({ decision: 'approve' })
        },
        env
      ),
      403,
      'forbidden'
    );
    await expectError(
      await app.request('/api/v1/admin/comments?status=rejected', { headers: authHeaders(alice.token) }, env),
      403,
      'forbidden'
    );

    const moderator = await seedPrivilegedUser('moderator-1', 'moderator-1', 'admin');
    await expectError(
      await app.request('/api/v1/admin/comments?status=rejected', { headers: authHeaders(moderator.token) }, env),
      400,
      'invalid_request'
    );
  });
});
