import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };
const DAY_MS = 24 * 60 * 60 * 1000;

type Claim = {
  orderNo: string;
  productId: string;
  userId: string;
  listAmountCents: number;
  actualAmountCents: number | null;
  status: 'pending' | 'approved' | 'rejected';
};

type MembershipRow = {
  membership_tier: 'normal' | 'vip' | 'svip';
  membership_expires_at: number | null;
};

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
  const body = await response.json<{ token: string }>();
  const me = await app.request('/api/v1/auth/me', { headers: authHeaders(body.token) }, env);
  expect(me.status).toBe(200);
  const meBody = await me.json<{ user: { id: string } }>();
  return { token: body.token, userId: meBody.user.id };
}

async function seedMembershipProducts(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('vip_monthly', 'VIP 会员', 10, 990, 'membership', 'active', 'memberships', 1, 'VIP 会员 30 天', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('svip_monthly', 'SVIP 豪华会员', 20, 1990, 'membership', 'active', 'memberships', 2, 'SVIP 豪华会员 30 天', ?, ?)`
    ).bind(now, now)
  ]);
}

async function seedPrivilegedUser(
  id: string,
  username: string,
  permissionRole: 'admin' | 'owner',
  password: string
): Promise<string> {
  const now = Date.now();
  const passwordHash = await hashPassword(password);
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
      body: JSON.stringify({ username, password })
    },
    env
  );
  expect(login.status).toBe(200);
  const body = await login.json<{ token: string }>();
  return body.token;
}

async function createClaim(token: string, productId: 'vip_monthly' | 'svip_monthly'): Promise<Response> {
  const form = new FormData();
  form.set('productId', productId);
  form.set('paidAt', '2026-09-13T12:00:00.000Z');
  form.set('contactText', 'alice@example.com');
  form.set('screenshot', new File([new Uint8Array([1, 2, 3])], 'payment.png', { type: 'image/png' }));
  return app.request('/api/v1/orders', { method: 'POST', headers: authHeaders(token), body: form }, env);
}

async function approveClaim(ownerToken: string, orderNo: string): Promise<Response> {
  return app.request(
    `/api/v1/admin/orders/${orderNo}/review`,
    {
      method: 'PATCH',
      headers: jsonAuthHeaders(ownerToken),
      body: JSON.stringify({ decision: 'approve' })
    },
    env
  );
}

async function membershipRow(userId: string): Promise<MembershipRow | null> {
  return env.DB.prepare(
    'SELECT membership_tier, membership_expires_at FROM users WHERE id = ?'
  )
    .bind(userId)
    .first<MembershipRow>();
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

describe('membership API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedMembershipProducts();
  });

  it('sets VIP and a 30-day expiry when an owner approves a VIP claim', async () => {
    const { token, userId } = await registerUser('alice');
    const ownerToken = await seedPrivilegedUser('owner-1', 'owner-1', 'owner', 'owner-password-123');
    const created = await createClaim(token, 'vip_monthly');
    expect(created.status).toBe(201);
    const claim = await created.json<Claim>();
    expect(claim.listAmountCents).toBe(990);
    expect(claim.actualAmountCents).toBe(990);

    const beforeApproval = Date.now();
    const approved = await approveClaim(ownerToken, claim.orderNo);
    const afterApproval = Date.now();
    expect(approved.status).toBe(200);

    const membership = await membershipRow(userId);
    expect(membership?.membership_tier).toBe('vip');
    expect(membership?.membership_expires_at).toBeGreaterThanOrEqual(beforeApproval + 30 * DAY_MS);
    expect(membership?.membership_expires_at).toBeLessThanOrEqual(afterApproval + 30 * DAY_MS);

    const entitlementCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM entitlements WHERE user_id = ? AND product_id = 'vip_monthly'"
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(entitlementCount?.count).toBe(0);

    const audit = await env.DB.prepare(
      "SELECT before_json, after_json FROM audit_logs WHERE action = 'order.approved' AND entity_id = ?"
    )
      .bind(claim.orderNo)
      .first<{ before_json: string; after_json: string }>();
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.before_json)).toMatchObject({
      membershipTier: 'normal',
      membershipExpiresAt: null
    });
    expect(JSON.parse(audit!.after_json)).toMatchObject({
      membershipTier: 'vip',
      membershipExpiresAt: membership?.membership_expires_at
    });
  });

  it('extends an early VIP renewal from the existing expiry by 30 days', async () => {
    const { token, userId } = await registerUser('alice');
    const ownerToken = await seedPrivilegedUser('owner-1', 'owner-1', 'owner', 'owner-password-123');
    const existingExpiry = Date.now() + 10 * DAY_MS;
    await setMembership(userId, 'vip', existingExpiry);

    const created = await createClaim(token, 'vip_monthly');
    expect(created.status).toBe(201);
    const claim = await created.json<Claim>();
    expect((await approveClaim(ownerToken, claim.orderNo)).status).toBe(200);

    await expect(membershipRow(userId)).resolves.toEqual({
      membership_tier: 'vip',
      membership_expires_at: existingExpiry + 30 * DAY_MS
    });
  });

  it('starts a fresh 30-day SVIP period when a VIP upgrades', async () => {
    const { token, userId } = await registerUser('alice');
    const ownerToken = await seedPrivilegedUser('owner-1', 'owner-1', 'owner', 'owner-password-123');
    const existingExpiry = Date.now() + 90 * DAY_MS;
    await setMembership(userId, 'vip', existingExpiry);

    const created = await createClaim(token, 'svip_monthly');
    expect(created.status).toBe(201);
    const claim = await created.json<Claim>();
    const beforeApproval = Date.now();
    const approved = await approveClaim(ownerToken, claim.orderNo);
    const afterApproval = Date.now();
    expect(approved.status).toBe(200);

    const membership = await membershipRow(userId);
    expect(membership?.membership_tier).toBe('svip');
    expect(membership?.membership_expires_at).toBeGreaterThanOrEqual(beforeApproval + 30 * DAY_MS);
    expect(membership?.membership_expires_at).toBeLessThanOrEqual(afterApproval + 30 * DAY_MS);
    expect(membership?.membership_expires_at).toBeLessThan(existingExpiry);
  });

  it('rejects an SVIP downgrade request without approving the claim', async () => {
    const { token, userId } = await registerUser('alice');
    const ownerToken = await seedPrivilegedUser('owner-1', 'owner-1', 'owner', 'owner-password-123');
    const existingExpiry = Date.now() + 20 * DAY_MS;
    await setMembership(userId, 'svip', existingExpiry);

    const created = await createClaim(token, 'vip_monthly');
    expect(created.status).toBe(201);
    const claim = await created.json<Claim>();
    const rejected = await approveClaim(ownerToken, claim.orderNo);
    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'membership_downgrade' }
    });

    await expect(membershipRow(userId)).resolves.toEqual({
      membership_tier: 'svip',
      membership_expires_at: existingExpiry
    });
    const row = await env.DB.prepare('SELECT status FROM payment_claims WHERE order_no = ?')
      .bind(claim.orderNo)
      .first<{ status: string }>();
    expect(row?.status).toBe('pending');
  });

  it('does not discount VIP or SVIP membership fees', async () => {
    const { token } = await registerUser('alice');

    const vip = await createClaim(token, 'vip_monthly');
    expect(vip.status).toBe(201);
    await expect(vip.json<Claim>()).resolves.toMatchObject({
      listAmountCents: 990,
      actualAmountCents: 990
    });

    const svip = await createClaim(token, 'svip_monthly');
    expect(svip.status).toBe(201);
    await expect(svip.json<Claim>()).resolves.toMatchObject({
      listAmountCents: 1990,
      actualAmountCents: 1990
    });
  });

  it('lets owners correct membership and rejects non-owner correction', async () => {
    const { userId } = await registerUser('alice');
    const ownerToken = await seedPrivilegedUser('owner-1', 'owner-1', 'owner', 'owner-password-123');
    const adminToken = await seedPrivilegedUser('admin-1', 'admin-1', 'admin', 'admin-password-123');
    const correctionExpiry = Date.now() + 45 * DAY_MS;

    const corrected = await app.request(
      `/api/v1/admin/users/${userId}/membership`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(ownerToken),
        body: JSON.stringify({ tier: 'svip', expiresAt: correctionExpiry })
      },
      env
    );
    expect(corrected.status).toBe(200);
    await expect(corrected.json()).resolves.toMatchObject({
      user: { membershipTier: 'svip', membershipExpiresAt: correctionExpiry }
    });
    await expect(membershipRow(userId)).resolves.toEqual({
      membership_tier: 'svip',
      membership_expires_at: correctionExpiry
    });

    const forbidden = await app.request(
      `/api/v1/admin/users/${userId}/membership`,
      {
        method: 'PATCH',
        headers: jsonAuthHeaders(adminToken),
        body: JSON.stringify({ tier: 'vip', expiresAt: correctionExpiry })
      },
      env
    );
    expect(forbidden.status).toBe(403);
    await expect(membershipRow(userId)).resolves.toEqual({
      membership_tier: 'svip',
      membership_expires_at: correctionExpiry
    });

    const audit = await env.DB.prepare(
      "SELECT before_json, after_json FROM audit_logs WHERE action = 'admin.user.membership' AND entity_id = ?"
    )
      .bind(userId)
      .first<{ before_json: string; after_json: string }>();
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit!.before_json)).toMatchObject({
      membershipTier: 'normal',
      membershipExpiresAt: null
    });
    expect(JSON.parse(audit!.after_json)).toMatchObject({
      membershipTier: 'svip',
      membershipExpiresAt: correctionExpiry
    });
  });
});
