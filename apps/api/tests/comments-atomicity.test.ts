import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonAuthHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), ...JSON_HEADERS };
}

async function seedProduct(): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO products
      (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
     VALUES ('super', '超影课程', 29, 2900, 'course', 'active', 'courses', 1, '', ?, ?)`
  ).bind(now, now).run();
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
  const meBody = await me.json<{ user: { id: string } }>();
  return { token: body.token, userId: meBody.user.id };
}

async function seedModerator(): Promise<{ token: string; userId: string }> {
  const userId = 'moderator-1';
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, permission_role, status, created_at, updated_at)
     VALUES (?, 'moderator-1', ?, 'admin', 'admin', 'active', ?, ?)`
  ).bind(userId, await hashPassword('moderator-password-123'), now, now).run();

  const login = await app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'moderator-1', password: 'moderator-password-123' })
    },
    env
  );
  expect(login.status).toBe(200);
  const body = await login.json<{ token: string }>();
  return { token: body.token, userId };
}

async function postPendingComment(token: string): Promise<{ id: string }> {
  const response = await app.request(
    '/api/v1/products/super/comments',
    {
      method: 'POST',
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ body: 'atomicity' })
    },
    env
  );
  expect(response.status).toBe(201);
  return response.json<{ id: string }>();
}

async function createAuditFailureTrigger(action: 'comment.approved' | 'comment.deleted'): Promise<void> {
  await env.DB.prepare(
    `CREATE TRIGGER fail_comment_audit
     BEFORE INSERT ON audit_logs
     WHEN NEW.action = '${action}'
     BEGIN
       SELECT RAISE(ABORT, 'audit failure');
     END`
  ).run();
}

describe('comments audit atomicity', () => {
  beforeEach(async () => {
    await env.DB.prepare('DROP TRIGGER IF EXISTS fail_comment_audit').run();
    await resetTestDatabase(env.DB);
    await seedProduct();
  });

  it('rolls back a review when the audit insert fails', async () => {
    const alice = await registerUser('alice');
    const moderator = await seedModerator();
    const comment = await postPendingComment(alice.token);
    await createAuditFailureTrigger('comment.approved');

    const response = await app.request(
      `/api/v1/admin/comments/${comment.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(moderator.token),
        body: JSON.stringify({ decision: 'approve' })
      },
      env
    );
    expect(response.status).toBe(500);

    const row = await env.DB.prepare('SELECT status FROM comments WHERE id = ?')
      .bind(comment.id)
      .first<{ status: string }>();
    expect(row?.status).toBe('pending');
    const audits = await env.DB.prepare('SELECT COUNT(*) AS count FROM audit_logs WHERE entity_type = ?').bind('comment').first<{ count: number }>();
    expect(audits?.count).toBe(0);
  });

  it('rolls back a delete when the audit insert fails', async () => {
    const alice = await registerUser('alice');
    const moderator = await seedModerator();
    const comment = await postPendingComment(alice.token);
    await createAuditFailureTrigger('comment.deleted');

    const response = await app.request(
      `/api/v1/admin/comments/${comment.id}`,
      { method: 'DELETE', headers: authHeaders(moderator.token) },
      env
    );
    expect(response.status).toBe(500);

    const row = await env.DB.prepare('SELECT id FROM comments WHERE id = ?')
      .bind(comment.id)
      .first<{ id: string }>();
    expect(row?.id).toBe(comment.id);
    const audits = await env.DB.prepare('SELECT COUNT(*) AS count FROM audit_logs WHERE entity_type = ?').bind('comment').first<{ count: number }>();
    expect(audits?.count).toBe(0);
  });
});


