import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

type UnlockBody = { unlocked: string[] };
type ErrorBody = { error: { code: string; message: string } };

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

async function unlock(token: string | null, seriesId: string, password: string): Promise<Response> {
  const headers = token ? { ...JSON_HEADERS, ...authHeaders(token) } : JSON_HEADERS;
  return app.request(
    '/api/v1/entitlements/unlock',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ seriesId, password })
    },
    env
  );
}

async function getEntitlements(token: string): Promise<Response> {
  return app.request('/api/v1/entitlements', { headers: authHeaders(token) }, env);
}

async function seedCourseCatalog(): Promise<void> {
  const now = Date.now();
  const superHash = await hashPassword('super-course-password');
  const anbuHash = await hashPassword('anbu-course-password');

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
       VALUES ('super', '超影课程', 'active', ?, ?, ?)`
    ).bind(superHash, now, now),
    env.DB.prepare(
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES ('anbu', '暗部课程', 'coming_soon', ?, ?, ?)`
    ).bind(anbuHash, now, now)
  ]);
}

describe('course password entitlements API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCourseCatalog();
  });

  it('unlocks a series with the correct course password', async () => {
    const token = await registerUser('alice');
    const response = await unlock(token, 'super', 'super-course-password');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ unlocked: ['super'] });
  });

  it('keeps a second correct unlock idempotent', async () => {
    const token = await registerUser('alice');
    await unlock(token, 'super', 'super-course-password');

    const second = await unlock(token, 'super', 'super-course-password');
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ unlocked: ['super'] });

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM entitlements
       WHERE user_id = (SELECT id FROM users WHERE username = 'alice')
         AND product_id = 'super'
         AND status = 'active'`
    ).first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it('returns structured INVALID_COURSE_PASSWORD for a wrong password', async () => {
    const token = await registerUser('alice');
    const response = await unlock(token, 'super', 'wrong-password');

    expect(response.status).toBe(400);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('INVALID_COURSE_PASSWORD');
    expect(typeof body.error.message).toBe('string');

    const owned = await getEntitlements(token);
    await expect(owned.json()).resolves.toMatchObject({ unlocked: [] });
  });

  it('returns 401 for unauthenticated unlock and entitlement reads', async () => {
    const unlockResponse = await unlock(null, 'super', 'super-course-password');
    expect(unlockResponse.status).toBe(401);
    await expect(unlockResponse.json()).resolves.toMatchObject({
      error: { code: 'unauthorized' }
    });

    const listResponse = await app.request('/api/v1/entitlements', {}, env);
    expect(listResponse.status).toBe(401);
  });

  it('keeps series password hashes independent', async () => {
    const token = await registerUser('alice');

    const wrongAnbu = await unlock(token, 'anbu', 'super-course-password');
    expect(wrongAnbu.status).toBe(400);
    await expect(wrongAnbu.json()).resolves.toMatchObject({
      error: { code: 'INVALID_COURSE_PASSWORD' }
    });

    const anbu = await unlock(token, 'anbu', 'anbu-course-password');
    expect(anbu.status).toBe(200);
    await expect(anbu.json()).resolves.toMatchObject({ unlocked: ['anbu'] });
  });

  it('rate-limits repeated attempts per user and series', async () => {
    const token = await registerUser('alice');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await unlock(token, 'super', 'wrong-password');
      expect(response.status).toBe(400);
    }

    const limited = await unlock(token, 'super', 'wrong-password');
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: 'rate_limited' }
    });
  });

  it('represents the bundle through its component series entitlements', async () => {
    const token = await registerUser('alice');
    await unlock(token, 'super', 'super-course-password');
    await unlock(token, 'anbu', 'anbu-course-password');

    const owned = await getEntitlements(token);
    expect(owned.status).toBe(200);
    const body = await owned.json<UnlockBody>();
    expect(body.unlocked).toEqual(['anbu', 'super']);
    expect(body.unlocked).not.toContain('bundle');
  });

  it('never returns password hashes or plaintext passwords', async () => {
    const token = await registerUser('alice');
    await unlock(token, 'super', 'super-course-password');

    const owned = await getEntitlements(token);
    const text = await owned.text();
    expect(text).not.toContain('course_password_hash');
    expect(text).not.toContain('super-course-password');
  });
});
