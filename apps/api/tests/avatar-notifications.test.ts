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

async function registerUser(username: string): Promise<string> {
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
  return (await response.json<{ token: string }>()).token;
}

async function seedOwner(): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, permission_role, status, created_at, updated_at)
     VALUES ('owner-1', 'owner-1', ?, 'admin', 'owner', 'active', ?, ?)`
  )
    .bind(await hashPassword('owner-password-123'), now, now)
    .run();
  const response = await app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'owner-1', password: 'owner-password-123' })
    },
    env
  );
  expect(response.status).toBe(200);
  return (await response.json<{ token: string }>()).token;
}

async function seedProduct(): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO products
      (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
     VALUES ('super', '超影课程', 29, 2900, 'course', 'active', 'courses', 1, '', ?, ?)`
  ).bind(now, now).run();
}

describe('avatar upload and notification feeds', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedProduct();
  });

  it('uploads an avatar and serves it through the public avatar endpoint', async () => {
    const token = await registerUser('alice');
    const form = new FormData();
    form.set('avatar', new File([new Uint8Array([1, 2, 3, 4])], 'avatar.png', { type: 'image/png' }));
    const uploaded = await app.request(
      '/api/v1/auth/account/avatar',
      { method: 'POST', headers: authHeaders(token), body: form },
      env
    );
    expect(uploaded.status).toBe(200);
    const payload = await uploaded.json<{ user: { avatarUrl: string | null } }>();
    expect(payload.user.avatarUrl).toBeTruthy();

    const avatar = await app.request(payload.user.avatarUrl!, {}, env);
    expect(avatar.status).toBe(200);
    expect(avatar.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await avatar.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('notifies a buyer when a course payment is approved', async () => {
    const buyerToken = await registerUser('buyer');
    const ownerToken = await seedOwner();
    const form = new FormData();
    form.set('productId', 'super');
    form.set('paidAt', '2026-09-14T12:00:00.000Z');
    form.set('contactText', 'buyer@example.com');
    form.set('screenshot', new File([new Uint8Array([1])], 'payment.png', { type: 'image/png' }));
    const created = await app.request(
      '/api/v1/orders',
      { method: 'POST', headers: authHeaders(buyerToken), body: form },
      env
    );
    expect(created.status).toBe(201);
    const claim = await created.json<{ orderNo: string }>();
    const reviewed = await app.request(
      `/api/v1/admin/orders/${claim.orderNo}/review`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ decision: 'approve', actualAmountCents: 2900 })
      },
      env
    );
    expect(reviewed.status).toBe(200);

    const notifications = await app.request(
      '/api/v1/wallet/notifications',
      { headers: authHeaders(buyerToken) },
      env
    );
    await expect(notifications.json()).resolves.toMatchObject({
      notifications: [{ type: 'order.approved', title: '购买课程已开通' }]
    });
  });

  it('notifies a commenter when moderation is finished', async () => {
    const userToken = await registerUser('commenter');
    const ownerToken = await seedOwner();
    const created = await app.request(
      '/api/v1/products/super/comments',
      {
        method: 'POST',
        headers: jsonAuthHeaders(userToken),
        body: JSON.stringify({ body: '这是一条测试评论' })
      },
      env
    );
    expect(created.status).toBe(201);
    const comment = await created.json<{ id: string }>();
    const reviewed = await app.request(
      `/api/v1/admin/comments/${comment.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ decision: 'approve' })
      },
      env
    );
    expect(reviewed.status).toBe(200);

    const notifications = await app.request(
      '/api/v1/wallet/notifications',
      { headers: authHeaders(userToken) },
      env
    );
    await expect(notifications.json()).resolves.toMatchObject({
      notifications: [{ type: 'comment.reviewed', title: '评论已通过审核' }]
    });
  });
});
