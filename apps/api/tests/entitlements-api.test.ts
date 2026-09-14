import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

type UnlockBody = { unlocked: string[] };

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
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

async function userIdFor(token: string): Promise<string> {
  const response = await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env);
  expect(response.status).toBe(200);
  return (await response.json<{ user: { id: string } }>()).user.id;
}

async function getEntitlements(token: string): Promise<Response> {
  return app.request('/api/v1/entitlements', { headers: authHeaders(token) }, env);
}

async function seedCourseCatalog(): Promise<void> {
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
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES ('super', '超影课程', 'active', 'retired', ?, ?)`
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES ('anbu', '暗部课程', 'coming_soon', 'retired', ?, ?)`
    ).bind(now, now)
  ]);
}

async function grantEntitlement(token: string, productId: 'super' | 'anbu'): Promise<void> {
  const userId = await userIdFor(token);
  await env.DB.prepare(
    `INSERT INTO entitlements (id, user_id, product_id, status, source, created_at)
     VALUES (?, ?, ?, 'active', 'admin', ?)`
  )
    .bind(crypto.randomUUID(), userId, productId, Date.now())
    .run();
}

describe('card-key entitlements API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCourseCatalog();
  });

  it('retires the old course-password endpoint with a migration error', async () => {
    const token = await registerUser('alice');
    const response = await app.request(
      '/api/v1/entitlements/unlock',
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...authHeaders(token) },
        body: JSON.stringify({ seriesId: 'super', password: 'anything' })
      },
      env
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'card_key_required' } });
    await expect(getEntitlements(token).then((item) => item.json())).resolves.toMatchObject({ unlocked: [] });
  });

  it('returns active card-key/admin entitlements for the current account', async () => {
    const token = await registerUser('alice');
    await grantEntitlement(token, 'super');

    const owned = await getEntitlements(token);
    expect(owned.status).toBe(200);
    await expect(owned.json<UnlockBody>()).resolves.toMatchObject({ unlocked: ['super'] });
  });

  it('returns 401 for unauthenticated unlock and entitlement reads', async () => {
    const unlock = await app.request(
      '/api/v1/entitlements/unlock',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ seriesId: 'super', password: 'x' }) },
      env
    );
    expect(unlock.status).toBe(401);

    const list = await app.request('/api/v1/entitlements', {}, env);
    expect(list.status).toBe(401);
  });

  it('represents the bundle through its component series entitlements', async () => {
    const token = await registerUser('alice');
    await grantEntitlement(token, 'super');
    await grantEntitlement(token, 'anbu');

    const owned = await getEntitlements(token);
    const body = await owned.json<UnlockBody>();
    expect(body.unlocked).toEqual(['anbu', 'super']);
    expect(body.unlocked).not.toContain('bundle');
  });

  it('never returns legacy password hashes or plaintext passwords', async () => {
    const token = await registerUser('alice');
    await grantEntitlement(token, 'super');

    const text = await (await getEntitlements(token)).text();
    expect(text).not.toContain('course_password_hash');
    expect(text).not.toContain('retired');
  });
});
