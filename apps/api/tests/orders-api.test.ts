import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

type ErrorBody = { error: { code: string; message: string } };

type Claim = {
  id: string;
  orderNo: string;
  userId: string;
  productId: string;
  listAmountYuan: number;
  actualAmountYuan: number | null;
  paidAt: number;
  contactText: string;
  screenshotKey: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

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
  const body = await response.json<{ token: string }>();
  return body.token;
}

async function getUserId(token: string): Promise<string> {
  const response = await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env);
  expect(response.status).toBe(200);
  const body = await response.json<{ user: { id: string } }>();
  return body.user.id;
}

async function seedCatalogAndComponents(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('super', '超影课程', 29, 'active', 'courses', 1, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('bundle', '火影合集', 49, 'presale', 'courses', 2, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('anbu', '暗部课程', 29, 'coming_soon', 'courses', 3, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO product_components (parent_product_id, child_product_id, created_at, updated_at)
       VALUES ('bundle', 'super', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO product_components (parent_product_id, child_product_id, created_at, updated_at)
       VALUES ('bundle', 'anbu', ?, ?)`
    ).bind(now, now)
  ]);
}

async function seedAdmin(): Promise<string> {
  const adminHash = await hashPassword('admin-password-123');
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
     VALUES ('admin-1', 'admin-1', ?, 'admin', 'active', ?, ?)`
  )
    .bind(adminHash, now, now)
    .run();

  const login = await app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'admin-1', password: 'admin-password-123' })
    },
    env
  );
  expect(login.status).toBe(200);
  const body = await login.json<{ token: string }>();
  return body.token;
}

interface ClaimFormOverrides {
  productId?: string;
  paidAt?: string;
  contactText?: string;
  screenshot?: File;
}

function claimForm(overrides: ClaimFormOverrides = {}): FormData {
  const form = new FormData();
  form.set('productId', overrides.productId ?? 'bundle');
  form.set('paidAt', overrides.paidAt ?? '2026-09-12T12:00:00.000Z');
  form.set('contactText', overrides.contactText ?? 'alice@example.com');
  form.set(
    'screenshot',
    overrides.screenshot ?? new File([new Uint8Array([1, 2, 3])], 'payment.png', { type: 'image/png' })
  );
  return form;
}

async function createClaim(token: string, form: FormData = claimForm()): Promise<Response> {
  return await app.request(
    '/api/v1/orders',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: form
    },
    env
  );
}

async function reviewClaim(
  adminToken: string,
  orderNo: string,
  body: Record<string, unknown>
): Promise<Response> {
  return await app.request(
    `/api/v1/admin/orders/${orderNo}/review`,
    {
      method: 'PATCH',
      headers: jsonAuthHeaders(adminToken),
      body: JSON.stringify(body)
    },
    env
  );
}

async function countClaims(): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM payment_claims`).first<{ count: number }>();
  return row?.count ?? 0;
}

async function activeProductsFor(userId: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT product_id FROM entitlements WHERE user_id = ? AND status = 'active' ORDER BY product_id`
  )
    .bind(userId)
    .all<{ product_id: string }>();
  return (rows.results ?? []).map((row) => row.product_id);
}

describe('payment claims API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCatalogAndComponents();
  });

  it('creates a pending claim with a HY order number and private screenshot', async () => {
    const token = await registerUser('alice');
    const created = await createClaim(token);

    expect(created.status).toBe(201);
    const claim = await created.json<Claim>();
    expect(claim.orderNo).toMatch(/^HY-\d{8}-[A-Z0-9]{4}$/);
    expect(claim.status).toBe('pending');
    expect(claim.listAmountYuan).toBe(49);
    expect(claim).not.toHaveProperty('screenshotKey');

    const stored = await env.DB.prepare(
      `SELECT screenshot_key FROM payment_claims WHERE order_no = ?`
    )
      .bind(claim.orderNo)
      .first<{ screenshot_key: string }>();
    expect(stored?.screenshot_key).toMatch(/^payment-claims\//);
    expect(await env.SCREENSHOTS.head(stored!.screenshot_key)).not.toBeNull();
  });

  it('approves a bundle claim and grants both super and anbu entitlements', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const created = await createClaim(token);
    expect(created.status).toBe(201);
    const claim = await created.json<Claim>();

    const reviewed = await reviewClaim(adminToken, claim.orderNo, {
      decision: 'approve',
      actualAmountYuan: 49
    });
    expect(reviewed.status).toBe(200);
    const reviewedClaim = await reviewed.json<Claim>();
    expect(reviewedClaim.status).toBe('approved');
    expect(reviewedClaim.actualAmountYuan).toBe(49);
    expect(reviewedClaim.reviewedBy).toBe('admin-1');

    const userId = await getUserId(token);
    await expect(activeProductsFor(userId)).resolves.toEqual(['anbu', 'super']);

    const entitlement = await env.DB.prepare(
      `SELECT order_id FROM entitlements WHERE user_id = ? AND product_id = 'super' AND status = 'active'`
    )
      .bind(userId)
      .first<{ order_id: string }>();
    expect(entitlement?.order_id).toBe(claim.id);
  });

  it('defaults the approved amount to the product list price', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const claim = await (await createClaim(token)).json<Claim>();

    const reviewed = await reviewClaim(adminToken, claim.orderNo, { decision: 'approve' });
    expect(reviewed.status).toBe(200);
    const reviewedClaim = await reviewed.json<Claim>();
    expect(reviewedClaim.actualAmountYuan).toBe(49);
  });

  it('keeps approval idempotent', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const claim = await (await createClaim(token)).json<Claim>();

    await reviewClaim(adminToken, claim.orderNo, { decision: 'approve', actualAmountYuan: 49 });
    const second = await reviewClaim(adminToken, claim.orderNo, { decision: 'approve', actualAmountYuan: 49 });
    expect(second.status).toBe(200);

    const userId = await getUserId(token);
    await expect(activeProductsFor(userId)).resolves.toEqual(['anbu', 'super']);
  });

  it('rejects a claim with a reason and creates no entitlement', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const claim = await (await createClaim(token)).json<Claim>();

    const reviewed = await reviewClaim(adminToken, claim.orderNo, {
      decision: 'reject',
      rejectionReason: '截图不清晰'
    });
    expect(reviewed.status).toBe(200);
    const reviewedClaim = await reviewed.json<Claim>();
    expect(reviewedClaim.status).toBe('rejected');
    expect(reviewedClaim.rejectionReason).toBe('截图不清晰');
    expect(reviewedClaim.actualAmountYuan).toBeNull();

    const userId = await getUserId(token);
    await expect(activeProductsFor(userId)).resolves.toEqual([]);
  });

  it('requires an admin to list or review claims', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const claim = await (await createClaim(token)).json<Claim>();

    const list = await app.request('/api/v1/admin/orders', { headers: authHeaders(token) }, env);
    expect(list.status).toBe(403);

    const review = await reviewClaim(token, claim.orderNo, { decision: 'approve' });
    expect(review.status).toBe(403);

    const adminList = await app.request('/api/v1/admin/orders', { headers: authHeaders(adminToken) }, env);
    expect(adminList.status).toBe(200);
    await expect(adminList.json()).resolves.toMatchObject({ orders: [{ orderNo: claim.orderNo }] });
  });

  it('returns only the authenticated user orders', async () => {
    const aliceToken = await registerUser('alice');
    const bobToken = await registerUser('bob');
    await createClaim(aliceToken, claimForm({ productId: 'super', contactText: 'alice@example.com' }));
    await createClaim(bobToken, claimForm({ productId: 'bundle', contactText: 'bob@example.com' }));

    const mine = await app.request('/api/v1/orders/mine', { headers: authHeaders(aliceToken) }, env);
    expect(mine.status).toBe(200);
    const body = await mine.json<{ orders: Claim[] }>();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]?.productId).toBe('super');
    expect(body.orders[0]?.contactText).toBe('alice@example.com');
  });

  it('rejects unsupported screenshot types without creating a claim', async () => {
    const token = await registerUser('alice');
    const form = claimForm({
      screenshot: new File([new Uint8Array([1])], 'payment.gif', { type: 'image/gif' })
    });

    const created = await createClaim(token, form);
    expect(created.status).toBe(400);
    await expect(created.json()).resolves.toMatchObject({ error: { code: 'unsupported_media_type' } });
    expect(await countClaims()).toBe(0);
  });

  it('rejects screenshots larger than 8 MiB without creating a claim', async () => {
    const token = await registerUser('alice');
    const form = claimForm({
      screenshot: new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'payment.png', { type: 'image/png' })
    });

    const created = await createClaim(token, form);
    expect(created.status).toBe(400);
    await expect(created.json()).resolves.toMatchObject({ error: { code: 'file_too_large' } });
    expect(await countClaims()).toBe(0);
  });

  it('rejects a bundle claim when the user already owns both components', async () => {
    const token = await registerUser('alice');
    const userId = await getUserId(token);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO entitlements (id, user_id, product_id, status, source, created_at)
         VALUES (?, ?, 'super', 'active', 'course_password', ?)`
      ).bind(crypto.randomUUID(), userId, now),
      env.DB.prepare(
        `INSERT INTO entitlements (id, user_id, product_id, status, source, created_at)
         VALUES (?, ?, 'anbu', 'active', 'course_password', ?)`
      ).bind(crypto.randomUUID(), userId, now)
    ]);

    const created = await createClaim(token);
    expect(created.status).toBe(409);
    await expect(created.json()).resolves.toMatchObject({ error: { code: 'already_owned' } });
  });

  it('streams the private screenshot only to admins with the stored content type and bytes', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const claim = await (await createClaim(token)).json<Claim>();

    const userResponse = await app.request(
      `/api/v1/admin/orders/${claim.orderNo}/screenshot`,
      { headers: authHeaders(token) },
      env
    );
    expect(userResponse.status).toBe(403);

    const missing = await app.request(
      '/api/v1/admin/orders/HY-20260101-ABCD/screenshot',
      { headers: authHeaders(adminToken) },
      env
    );
    expect(missing.status).toBe(404);

    const response = await app.request(
      `/api/v1/admin/orders/${claim.orderNo}/screenshot`,
      { headers: authHeaders(adminToken) },
      env
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it('redacts contact text and screenshot keys from order audit logs', async () => {
    const token = await registerUser('alice');
    const adminToken = await seedAdmin();
    const claim = await (await createClaim(token, claimForm({ contactText: 'alice@example.com' }))).json<Claim>();
    await reviewClaim(adminToken, claim.orderNo, { decision: 'approve', actualAmountYuan: 49 });

    const rows = await env.DB.prepare(
      `SELECT before_json, after_json FROM audit_logs WHERE entity_type = 'payment_claim'`
    ).all<{ before_json: string; after_json: string }>();
    expect(rows.results?.length).toBeGreaterThan(0);

    for (const row of rows.results ?? []) {
      expect(row.before_json).not.toContain('alice@example.com');
      expect(row.before_json).not.toContain('payment-claims/');
      expect(row.after_json).not.toContain('alice@example.com');
      expect(row.after_json).not.toContain('payment-claims/');
    }
  });

  it('rejects individual anbu claims because the product is coming soon', async () => {
    const token = await registerUser('alice');
    const created = await createClaim(token, claimForm({ productId: 'anbu' }));

    expect(created.status).toBe(409);
    await expect(created.json()).resolves.toMatchObject({ error: { code: 'product_not_available' } });
    expect(await countClaims()).toBe(0);
  });

  it('requires authentication to create or list claims', async () => {
    const created = await app.request('/api/v1/orders', { method: 'POST', body: claimForm() }, env);
    expect(created.status).toBe(401);

    const list = await app.request('/api/v1/orders/mine', {}, env);
    expect(list.status).toBe(401);
  });
});

