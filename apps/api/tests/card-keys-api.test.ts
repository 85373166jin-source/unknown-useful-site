import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function seedProducts(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('super', '超影课程', 29, 2900, 'course', 'active', 'courses', 1, '', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO products (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES ('vip_monthly', 'VIP 会员', 10, 990, 'membership', 'active', 'memberships', 2, '', ?, ?)`
    ).bind(now, now)
  ]);
}

async function createOwner(): Promise<string> {
  const now = Date.now();
  const passwordHash = await hashPassword('owner-password-123');
  await env.DB.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role, permission_role, status, created_at, updated_at)
     VALUES ('owner-1', 'owner', '站长', ?, 'admin', 'owner', 'active', ?, ?)`
  ).bind(passwordHash, now, now).run();
  const login = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username: 'owner', password: 'owner-password-123' })
  }, env);
  expect(login.status).toBe(200);
  return (await login.json<{ token: string }>()).token;
}

async function registerUser(username: string): Promise<string> {
  const response = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      username,
      displayName: `展示-${username}`,
      password: 'long-password-123'
    })
  }, env);
  expect(response.status).toBe(201);
  return (await response.json<{ token: string }>()).token;
}

async function generateCodes(ownerToken: string, productId: string, quantity: number) {
  const response = await app.request('/api/v1/admin/card-keys/batches', {
    method: 'POST',
    headers: { ...authHeaders(ownerToken), ...JSON_HEADERS },
    body: JSON.stringify({ productId, quantity, note: '测试批次' })
  }, env);
  expect(response.status).toBe(201);
  return response.json<{ batchId: string; codes: string[]; expiresAt: number }>();
}

describe('card keys API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedProducts();
  });

  it('generates one-time hashed card keys for a product', async () => {
    const ownerToken = await createOwner();
    const result = await generateCodes(ownerToken, 'super', 2);
    expect(result.codes).toHaveLength(2);
    for (const code of result.codes) {
      expect(code).toMatch(/^(?:[A-Z0-9]{4}-){3}[A-Z0-9]{4}$/);
    }

    const rows = await env.DB.prepare(
      'SELECT code_hash, status, expires_at FROM card_keys WHERE product_id = ? ORDER BY created_at'
    ).bind('super').all<{ code_hash: string; status: string; expires_at: number }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results?.every((row) => row.status === 'unused')).toBe(true);
    expect(rows.results?.every((row) => !result.codes.includes(row.code_hash))).toBe(true);
    expect(rows.results?.every((row) => row.expires_at > Date.now() + 29 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('redeems a card key once, creates an order, and grants access', async () => {
    const ownerToken = await createOwner();
    const generated = await generateCodes(ownerToken, 'super', 1);
    const userToken = await registerUser('card-user');

    const redeemed = await app.request('/api/v1/card-keys/redeem', {
      method: 'POST',
      headers: { ...authHeaders(userToken), ...JSON_HEADERS },
      body: JSON.stringify({ code: generated.codes[0] })
    }, env);
    expect(redeemed.status).toBe(200);
    const body = await redeemed.json<{ orderNo: string; productId: string; unlocked: string[] }>();
    expect(body.productId).toBe('super');
    expect(body.orderNo).toMatch(/^ORD-/);
    expect(body.unlocked).toContain('super');

    const second = await app.request('/api/v1/card-keys/redeem', {
      method: 'POST',
      headers: { ...authHeaders(userToken), ...JSON_HEADERS },
      body: JSON.stringify({ code: generated.codes[0] })
    }, env);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: { code: 'card_key_used' } });

    const verified = await app.request('/api/v1/admin/card-keys/verify', {
      method: 'POST',
      headers: { ...authHeaders(ownerToken), ...JSON_HEADERS },
      body: JSON.stringify({ code: generated.codes[0] })
    }, env);
    expect(verified.status).toBe(200);
    await expect(verified.json()).resolves.toMatchObject({
      status: 'used',
      productId: 'super',
      orderNo: body.orderNo,
      usedBy: { username: 'card-user', displayName: '展示-card-user' }
    });
  });
});
