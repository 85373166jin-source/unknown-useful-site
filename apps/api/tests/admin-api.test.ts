import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

type Claim = {
  id: string;
  orderNo: string;
  userId: string;
  productId: string;
  listAmountYuan: number;
  actualAmountYuan: number | null;
  status: 'pending' | 'approved' | 'rejected';
};

type AdminUser = {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  phoneMask: string | null;
  emailMask: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  riskLevel: 'none' | 'warn' | 'strong_warn';
  entitlements: string[];
};

type Dashboard = {
  confirmedRevenueYuan: number;
  monthRevenueYuan: number;
  todayRevenueYuan: number;
  pendingAmountYuan: number;
  pendingOrderCount: number;
  userCount: number;
  newUserCount: number;
  paidUserCount: number;
  repeatBuyerCount: number;
  byProduct: Record<string, number>;
  byCategory: Record<string, number>;
  series: Array<{ date: string; yuan: number }>;
};

type Revenue = {
  totalYuan: number;
  byProduct: Record<string, number>;
  byCategory: Record<string, number>;
  series: Array<{ date: string; yuan: number }>;
};

type AuditEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: number;
};

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonAuthHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), ...JSON_HEADERS };
}

async function seedCatalog(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('super', '超影课程', 29, 'active', 'courses', 1, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('anbu', '暗部课程', 29, 'coming_soon', 'courses', 2, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('bundle', '火影合集', 49, 'presale', 'courses', 3, '', ?, ?)`
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

async function seedCatalogAndAdmin(): Promise<string> {
  await seedCatalog();
  return seedAdmin();
}

async function registerUser(
  username: string,
  contacts: { phone?: string; email?: string } = {}
): Promise<{ token: string; userId: string }> {
  const response = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password: 'long-password-123', ...contacts })
    },
    env
  );
  expect(response.status).toBe(201);
  const registered = await response.json<{ token: string }>();
  const me = await app.request('/api/v1/auth/me', { headers: authHeaders(registered.token) }, env);
  expect(me.status).toBe(200);
  const meBody = await me.json<{ user: { id: string } }>();
  return { token: registered.token, userId: meBody.user.id };
}

function claimForm(overrides: { paidAt?: string; contactText?: string } = {}): FormData {
  const form = new FormData();
  form.set('productId', 'bundle');
  form.set('paidAt', overrides.paidAt ?? new Date().toISOString());
  form.set('contactText', overrides.contactText ?? 'alice@example.com');
  form.set('screenshot', new File([new Uint8Array([1, 2, 3])], 'payment.png', { type: 'image/png' }));
  return form;
}

async function createClaim(token: string, form: FormData = claimForm()): Promise<Response> {
  return app.request('/api/v1/orders', { method: 'POST', headers: authHeaders(token), body: form }, env);
}

async function reviewClaim(
  adminToken: string,
  orderNo: string,
  body: Record<string, unknown>
): Promise<Response> {
  return app.request(`/api/v1/admin/orders/${orderNo}/review`, {
    method: 'PATCH',
    headers: jsonAuthHeaders(adminToken),
    body: JSON.stringify(body)
  }, env);
}

async function expectError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const body = await response.json<{ error: { code: string; message: string } }>();
  expect(body.error.code).toBe(code);
}

describe('admin reporting and user management API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
  });

  it('returns confirmed revenue, pending counts, and user metrics on the dashboard', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token } = await registerUser('alice');
    const claim = await (await createClaim(token)).json<Claim>();
    const review = await reviewClaim(adminToken, claim.orderNo, { decision: 'approve', actualAmountYuan: 49 });
    expect(review.status).toBe(200);

    const response = await app.request('/api/v1/admin/dashboard', { headers: authHeaders(adminToken) }, env);
    expect(response.status).toBe(200);
    const dashboard = await response.json<Dashboard>();

    expect(dashboard).toMatchObject({
      confirmedRevenueYuan: 49,
      pendingOrderCount: 0,
      userCount: 2
    });
    expect(dashboard.monthRevenueYuan).toBe(49);
    expect(dashboard.todayRevenueYuan).toBe(49);
    expect(dashboard.pendingAmountYuan).toBe(0);
    expect(dashboard.paidUserCount).toBe(1);
    expect(dashboard.repeatBuyerCount).toBe(0);
    expect(dashboard.newUserCount).toBeGreaterThanOrEqual(1);
    expect(dashboard.byProduct.bundle).toBe(49);
    expect(dashboard.byProduct.super).toBe(0);
    expect(dashboard.byProduct.anbu).toBe(0);
    expect(dashboard.byCategory.courses).toBe(49);
    expect(dashboard.series).toHaveLength(30);
    expect(dashboard.series.reduce((sum, point) => sum + point.yuan, 0)).toBe(49);
  });

  it('reports revenue by product and category without double-counting bundle components', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token } = await registerUser('alice');
    const claim = await (await createClaim(token)).json<Claim>();
    await reviewClaim(adminToken, claim.orderNo, { decision: 'approve' });

    const response = await app.request('/api/v1/admin/revenue?range=30d', { headers: authHeaders(adminToken) }, env);
    expect(response.status).toBe(200);
    const report = await response.json<Revenue>();

    expect(report.totalYuan).toBe(49);
    expect(report.byProduct.bundle).toBe(49);
    expect(report.byProduct.super).toBe(0);
    expect(report.byProduct.anbu).toBe(0);
    expect(report.byCategory.courses).toBe(49);
  });

  it('counts pending claims in the dashboard before review', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token } = await registerUser('alice');
    await createClaim(token);

    const response = await app.request('/api/v1/admin/dashboard', { headers: authHeaders(adminToken) }, env);
    expect(response.status).toBe(200);
    const dashboard = await response.json<Dashboard>();

    expect(dashboard.confirmedRevenueYuan).toBe(0);
    expect(dashboard.pendingOrderCount).toBe(1);
    expect(dashboard.pendingAmountYuan).toBe(49);
  });

  it('never counts rejected claims as revenue', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token } = await registerUser('alice');
    const claim = await (await createClaim(token)).json<Claim>();
    await reviewClaim(adminToken, claim.orderNo, { decision: 'reject', rejectionReason: '截图不清晰' });

    const dashboard = await app.request('/api/v1/admin/dashboard', { headers: authHeaders(adminToken) }, env);
    const dashboardBody = await dashboard.json<Dashboard>();
    expect(dashboardBody.confirmedRevenueYuan).toBe(0);
    expect(dashboardBody.pendingOrderCount).toBe(0);

    const revenue = await app.request('/api/v1/admin/revenue?range=all', { headers: authHeaders(adminToken) }, env);
    const report = await revenue.json<Revenue>();
    expect(report.totalYuan).toBe(0);
  });

  it('replaces list amounts with the reviewed actual amount', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token } = await registerUser('alice');
    const claim = await (await createClaim(token)).json<Claim>();
    await reviewClaim(adminToken, claim.orderNo, { decision: 'approve', actualAmountYuan: 60 });

    const dashboard = await app.request('/api/v1/admin/dashboard', { headers: authHeaders(adminToken) }, env);
    const dashboardBody = await dashboard.json<Dashboard>();
    expect(dashboardBody.confirmedRevenueYuan).toBe(60);
    expect(dashboardBody.byProduct.bundle).toBe(60);
  });

  it('forbids normal users from every admin endpoint', async () => {
    await seedCatalogAndAdmin();
    const { token } = await registerUser('alice');

    const adminPaths = [
      '/api/v1/admin/dashboard',
      '/api/v1/admin/revenue',
      '/api/v1/admin/users',
      '/api/v1/admin/risk',
      '/api/v1/admin/audit'
    ];
    for (const path of adminPaths) {
      const response = await app.request(path, { headers: authHeaders(token) }, env);
      await expectError(response, 403, 'forbidden');
    }

    await expectError(
      await app.request('/api/v1/admin/users/someone', {
        method: 'PATCH',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ status: 'disabled' })
      }, env),
      403,
      'forbidden'
    );
  });

  it('lists users with masked contacts, entitlements, and no secrets', async () => {
    const adminToken = await seedCatalogAndAdmin();
    await registerUser('alice', { phone: '+86 138-0000-0000', email: 'alice@example.com' });

    const response = await app.request('/api/v1/admin/users', { headers: authHeaders(adminToken) }, env);
    expect(response.status).toBe(200);
    const body = await response.json<{ users: AdminUser[] }>();
    const alice = body.users.find((user) => user.username === 'alice');
    expect(alice).toBeDefined();
    expect(alice?.phoneMask).toBe('138****0000');
    expect(alice?.emailMask).toBe('al***@example.com');
    expect(alice?.entitlements).toEqual([]);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('13800000000');
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('password_hash');
    expect(serialized).not.toContain('phone_hmac');
    expect(serialized).not.toContain('email_hmac');
  });

  it('disables and re-enables a user and writes an audit trail', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token, userId } = await registerUser('alice');

    const disable = await app.request(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(adminToken),
      body: JSON.stringify({ status: 'disabled' })
    }, env);
    expect(disable.status).toBe(200);
    const disabledUser = await disable.json<{ user: AdminUser }>();
    expect(disabledUser.user.status).toBe('disabled');

    const blocked = await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env);
    await expectError(blocked, 401, 'unauthorized');

    const enable = await app.request(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(adminToken),
      body: JSON.stringify({ status: 'active' })
    }, env);
    expect(enable.status).toBe(200);
    const enabledUser = await enable.json<{ user: AdminUser }>();
    expect(enabledUser.user.status).toBe('active');

    const restored = await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env);
    expect(restored.status).toBe(200);

    const auditRows = await env.DB.prepare(
      `SELECT before_json, after_json FROM audit_logs WHERE action = 'admin.user.update' ORDER BY created_at`
    ).all<{ before_json: string; after_json: string }>();
    expect(auditRows.results?.length).toBe(2);
    for (const row of auditRows.results ?? []) {
      expect(row.before_json).not.toContain('password');
      expect(row.after_json).not.toContain('password');
    }
  });

  it('grants and revokes an entitlement and writes an audit trail', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token, userId } = await registerUser('alice');

    const grant = await app.request(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(adminToken),
      body: JSON.stringify({ grantProductId: 'super' })
    }, env);
    expect(grant.status).toBe(200);
    const grantedUser = await grant.json<{ user: AdminUser }>();
    expect(grantedUser.user.entitlements).toContain('super');

    const unlocked = await app.request('/api/v1/entitlements', { headers: authHeaders(token) }, env);
    expect(unlocked.status).toBe(200);
    expect(await unlocked.json<{ unlocked: string[] }>()).toEqual({ unlocked: ['super'] });

    const revoke = await app.request(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(adminToken),
      body: JSON.stringify({ revokeProductId: 'super' })
    }, env);
    expect(revoke.status).toBe(200);
    const revokedUser = await revoke.json<{ user: AdminUser }>();
    expect(revokedUser.user.entitlements).toEqual([]);

    const auditRows = await env.DB.prepare(
      `SELECT before_json, after_json FROM audit_logs WHERE action = 'admin.user.entitlements' ORDER BY created_at`
    ).all<{ before_json: string; after_json: string }>();
    expect(auditRows.results?.length).toBe(2);
  });

  it('resets a password, invalidates sessions, and writes an audit trail', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { token, userId } = await registerUser('alice');

    const reset = await app.request(`/api/v1/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: jsonAuthHeaders(adminToken),
      body: JSON.stringify({ newPassword: 'replacement-password-123' })
    }, env);
    expect(reset.status).toBe(200);

    await expectError(await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env), 401, 'unauthorized');

    const oldLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'alice', password: 'long-password-123' })
    }, env);
    expect(oldLogin.status).toBe(401);

    const newLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'alice', password: 'replacement-password-123' })
    }, env);
    expect(newLogin.status).toBe(200);

    const auditRows = await env.DB.prepare(
      `SELECT before_json, after_json FROM audit_logs WHERE action = 'admin.user.reset_password'`
    ).all<{ before_json: string; after_json: string }>();
    expect(auditRows.results?.length).toBe(1);
    const audit = auditRows.results?.[0];
    expect(audit?.before_json).not.toContain('replacement-password-123');
    expect(audit?.after_json).not.toContain('replacement-password-123');
  });

  it('unbinds a contact and writes a masked audit trail', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { userId } = await registerUser('alice', { phone: '+86 138-0000-0000', email: 'alice@example.com' });

    const response = await app.request(`/api/v1/admin/users/${userId}/contact/email`, {
      method: 'DELETE',
      headers: authHeaders(adminToken)
    }, env);
    expect(response.status).toBe(200);
    const body = await response.json<{ user: AdminUser }>();
    expect(body.user.emailMask).toBeNull();

    const dbUser = await env.DB.prepare(
      `SELECT email_hmac, email_mask FROM users WHERE id = ?`
    ).bind(userId).first<{ email_hmac: string | null; email_mask: string | null }>();
    expect(dbUser?.email_hmac).toBeNull();
    expect(dbUser?.email_mask).toBeNull();

    const auditRows = await env.DB.prepare(
      `SELECT before_json, after_json FROM audit_logs WHERE action = 'admin.user.contact_unbind'`
    ).all<{ before_json: string; after_json: string }>();
    expect(auditRows.results?.length).toBe(1);
    expect(auditRows.results?.[0]?.before_json).not.toContain('alice@example.com');
    expect(auditRows.results?.[0]?.after_json).not.toContain('alice@example.com');
  });

  it('lists risky users and exposes a redacted audit history', async () => {
    const adminToken = await seedCatalogAndAdmin();
    const { userId } = await registerUser('alice', { email: 'alice@example.com' });

    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      const login = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'cf-connecting-ip': ip },
        body: JSON.stringify({ username: 'alice', password: 'long-password-123' })
      }, env);
      expect(login.status).toBe(200);
    }

    const riskResponse = await app.request('/api/v1/admin/risk', { headers: authHeaders(adminToken) }, env);
    expect(riskResponse.status).toBe(200);
    const riskBody = await riskResponse.json<{ users: Array<{ userId: string; riskLevel: string; distinctIpCount: number }> }>();
    const riskUser = riskBody.users.find((user) => user.userId === userId);
    expect(riskUser?.riskLevel).toBe('warn');
    expect(riskUser?.distinctIpCount).toBe(3);

    const auditResponse = await app.request('/api/v1/admin/audit', { headers: authHeaders(adminToken) }, env);
    expect(auditResponse.status).toBe(200);
    const auditBody = await auditResponse.json<{ audits: AuditEntry[] }>();
    expect(auditBody.audits.length).toBeGreaterThan(0);
    expect(auditBody.audits.some((entry) => entry.action === 'auth.login')).toBe(true);
    expect(JSON.stringify(auditBody)).not.toContain('alice@example.com');
  });
});
