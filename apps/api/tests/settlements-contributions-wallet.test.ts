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
  const token = (await response.json<{ token: string }>()).token;
  const me = await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env);
  const userId = (await me.json<{ user: { id: string } }>()).user.id;
  return { token, userId };
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

async function seedProducts(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('super', '超影课程', 29, 2900, 'course', 'active', 'courses', 1, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('anbu', '暗部课程', 29, 2900, 'course', 'active', 'courses', 2, '', ?, ?)`
    ).bind(now, now)
  ]);
}

async function createClaim(token: string, promoCode?: string): Promise<Response> {
  const form = new FormData();
  form.set('productId', 'super');
  form.set('paidAt', '2026-09-14T12:00:00.000Z');
  form.set('contactText', 'buyer@example.com');
  if (promoCode) form.set('promoCode', promoCode);
  form.set('screenshot', new File([new Uint8Array([1, 2, 3])], 'payment.png', { type: 'image/png' }));
  return app.request('/api/v1/orders', { method: 'POST', headers: authHeaders(token), body: form }, env);
}

describe('settlements, contributions, and wallet API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedProducts();
  });

  it('attributes a payment to a promo code and a linked contribution, then settles both earnings', async () => {
    const referrer = await registerUser('referrer');
    const contributor = await registerUser('contributor');
    const buyer = await registerUser('buyer');
    const ownerToken = await seedOwner();
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO subsites (user_id, tier, promo_code, created_at, updated_at)
         VALUES (?, 'basic', 'SITE-REFERRER', ?, ?)`
      ).bind(referrer.userId, now, now),
      env.DB.prepare(
        `INSERT INTO contributions
          (id, user_id, title, kind, source, external_url, requested_share_bps, approved_share_bps,
           status, product_id, reviewed_by, reviewed_at, created_at, updated_at)
         VALUES ('contribution-1', ?, '超影素材', 'video', 'link', 'https://example.com/video', 3000, 3000,
                 'approved', 'super', 'owner-1', ?, ?, ?)`
      ).bind(contributor.userId, now, now, now)
    ]);

    const created = await createClaim(buyer.token, 'site-referrer');
    expect(created.status).toBe(201);
    const claim = await created.json<{ orderNo: string }>();

    const pending = await env.DB.prepare(
      `SELECT user_id, source, amount_cents, status
       FROM earning_entries ORDER BY source`
    ).all<{ user_id: string; source: string; amount_cents: number; status: string }>();
    expect(pending.results).toEqual([
      { user_id: contributor.userId, source: 'contribution', amount_cents: 870, status: 'pending' },
      { user_id: referrer.userId, source: 'subsite', amount_cents: 1450, status: 'pending' }
    ]);

    const approved = await app.request(
      `/api/v1/admin/orders/${claim.orderNo}/review`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ decision: 'approve', actualAmountCents: 2900 })
      },
      env
    );
    expect(approved.status).toBe(200);

    const settled = await env.DB.prepare(
      `SELECT source, amount_cents, status
       FROM earning_entries ORDER BY source`
    ).all<{ source: string; amount_cents: number; status: string }>();
    expect(settled.results).toEqual([
      { source: 'contribution', amount_cents: 870, status: 'available' },
      { source: 'subsite', amount_cents: 1450, status: 'available' }
    ]);

    const notifications = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE type IN ('subsite.earning.available', 'contribution.earning.available')"
    ).first<{ count: number }>();
    expect(notifications?.count).toBe(2);
  });

  it('unlocks ZIP submissions only after an image or video is approved', async () => {
    const user = await registerUser('creator');
    const ownerToken = await seedOwner();

    const blocked = await app.request(
      '/api/v1/contributions',
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...authHeaders(user.token) },
        body: JSON.stringify({
          title: '先传 ZIP',
          kind: 'zip',
          externalUrl: 'https://example.com/archive.zip',
          requestedSharePercent: 20
        })
      },
      env
    );
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'zip_not_unlocked' } });

    const form = new FormData();
    form.set('title', '第一张图');
    form.set('kind', 'image');
    form.set('requestedSharePercent', '20');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' }));
    const uploaded = await app.request(
      '/api/v1/contributions',
      { method: 'POST', headers: authHeaders(user.token), body: form },
      env
    );
    expect(uploaded.status).toBe(201);
    const contribution = await uploaded.json<{ id: string }>();

    const approved = await app.request(
      `/api/v1/admin/contributions/${contribution.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ decision: 'approve', approvedSharePercent: 15 })
      },
      env
    );
    expect(approved.status).toBe(200);

    const permission = await env.DB.prepare(
      'SELECT 1 AS ok FROM contribution_permissions WHERE user_id = ?'
    ).bind(user.userId).first<{ ok: number }>();
    expect(permission?.ok).toBe(1);

    const zip = await app.request(
      '/api/v1/contributions',
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...authHeaders(user.token) },
        body: JSON.stringify({
          title: '后续 ZIP',
          kind: 'zip',
          externalUrl: 'https://example.com/archive.zip',
          requestedSharePercent: 20
        })
      },
      env
    );
    expect(zip.status).toBe(201);
  });

  it('freezes withdrawal funds and restores or consumes them on review', async () => {
    const user = await registerUser('withdrawer');
    const ownerToken = await seedOwner();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO earning_entries
        (id, user_id, source, amount_cents, status, gross_amount_cents, share_bps, created_at, updated_at)
       VALUES ('earning-1', ?, 'subsite', 20000, 'available', 20000, 10000, ?, ?)`
    ).bind(user.userId, now, now).run();

    const created = await app.request(
      '/api/v1/wallet/withdrawals',
      {
        method: 'POST',
        headers: jsonAuthHeaders(user.token),
        body: JSON.stringify({ amountCents: 5000, method: 'wechat', account: 'wx-user' })
      },
      env
    );
    expect(created.status).toBe(201);
    const withdrawal = await created.json<{ id: string; feeCents: number; netCents: number }>();
    expect(withdrawal).toMatchObject({ feeCents: 50, netCents: 4950 });

    const rejected = await app.request(
      `/api/v1/admin/wallet/withdrawals/${withdrawal.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ decision: 'reject', reason: '收款信息有误' })
      },
      env
    );
    expect(rejected.status).toBe(200);

    const restored = await env.DB.prepare(
      `SELECT SUM(CASE WHEN status = 'available' THEN amount_cents WHEN status = 'frozen' THEN amount_cents ELSE 0 END) AS available
       FROM earning_entries WHERE user_id = ?`
    ).bind(user.userId).first<{ available: number }>();
    expect(restored?.available).toBe(20000);

    const second = await app.request(
      '/api/v1/wallet/withdrawals',
      {
        method: 'POST',
        headers: jsonAuthHeaders(user.token),
        body: JSON.stringify({ amountCents: 5000, method: 'alipay', account: 'alipay-user' })
      },
      env
    );
    expect(second.status).toBe(201);
    const secondWithdrawal = await second.json<{ id: string }>();

    const approved = await app.request(
      `/api/v1/admin/wallet/withdrawals/${secondWithdrawal.id}`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ decision: 'approve' })
      },
      env
    );
    expect(approved.status).toBe(200);

    const used = await env.DB.prepare(
      `SELECT SUM(CASE
                WHEN status = 'available' THEN amount_cents
                WHEN status IN ('frozen', 'withdrawn') THEN amount_cents
                ELSE 0 END) AS available,
              SUM(CASE WHEN status = 'withdrawn' THEN amount_cents ELSE 0 END) AS withdrawn
       FROM earning_entries WHERE user_id = ?`
    ).bind(user.userId).first<{ available: number; withdrawn: number }>();
    expect(used).toEqual({ available: 15000, withdrawn: -5000 });
  });
});
