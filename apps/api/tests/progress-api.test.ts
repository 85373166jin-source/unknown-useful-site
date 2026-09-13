import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { hashPassword } from '../src/services/password';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

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

async function unlock(token: string, seriesId: string, password: string): Promise<Response> {
  const response = await app.request(
    '/api/v1/entitlements/unlock',
    {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...authHeaders(token) },
      body: JSON.stringify({ seriesId, password })
    },
    env
  );
  expect(response.status).toBe(200);
  return response;
}

async function putProgress(
  token: string,
  lessonId: string,
  body: { positionSeconds: number; durationSeconds: number }
): Promise<Response> {
  return app.request(
    `/api/v1/progress/${lessonId}`,
    {
      method: 'PUT',
      headers: { ...JSON_HEADERS, ...authHeaders(token) },
      body: JSON.stringify(body)
    },
    env
  );
}

async function getProgress(token: string, lessonId: string): Promise<Response> {
  return app.request(`/api/v1/progress/${lessonId}`, { headers: authHeaders(token) }, env);
}

async function seedCourseCatalog(): Promise<void> {
  const now = Date.now();
  const superHash = await hashPassword('super-course-password');
  const anbuHash = await hashPassword('anbu-course-password');

  const products = [
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
    ).bind(now, now)
  ];

  const series = [
    env.DB.prepare(
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES ('super', '超影课程', 'active', ?, ?, ?)`
    ).bind(superHash, now, now),
    env.DB.prepare(
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES ('anbu', '暗部课程', 'coming_soon', ?, ?, ?)`
    ).bind(anbuHash, now, now)
  ];

  const lessons = Array.from({ length: 9 }, (_, index) => {
    const order = index + 1;
    const padded = String(order).padStart(2, '0');
    return env.DB.prepare(
      `INSERT INTO lessons (id, series_id, title, media_path, sort_order, created_at, updated_at)
       VALUES (?, 'super', ?, ?, ?, ?, ?)`
    ).bind(`super-${padded}`, `第 ${order} 课`, `/media/super-shadow/${order}.mp4`, order, now, now);
  });

  await env.DB.batch([...products, ...series, ...lessons]);
}

describe('lesson watch progress API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCourseCatalog();
  });

  it('saves and reads progress for an entitled user', async () => {
    const token = await registerUser('alice');
    await unlock(token, 'super', 'super-course-password');

    const saved = await putProgress(token, 'super-01', { positionSeconds: 412, durationSeconds: 1000 });
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({ positionSeconds: 412, completed: false });

    const loaded = await getProgress(token, 'super-01');
    expect(loaded.status).toBe(200);
    await expect(loaded.json()).resolves.toMatchObject({ positionSeconds: 412, completed: false });
  });

  it('returns zero progress when nothing has been saved yet', async () => {
    const token = await registerUser('alice');
    await unlock(token, 'super', 'super-course-password');

    const loaded = await getProgress(token, 'super-01');
    expect(loaded.status).toBe(200);
    await expect(loaded.json()).resolves.toMatchObject({ positionSeconds: 0, completed: false });
  });

  it('rejects progress read and write without an active entitlement', async () => {
    const token = await registerUser('bob');

    const read = await getProgress(token, 'super-01');
    expect(read.status).toBe(403);

    const write = await putProgress(token, 'super-01', { positionSeconds: 10, durationSeconds: 100 });
    expect(write.status).toBe(403);
  });

  it('returns 401 for unauthenticated progress access', async () => {
    const read = await app.request('/api/v1/progress/super-01', {}, env);
    expect(read.status).toBe(401);

    const write = await app.request(
      '/api/v1/progress/super-01',
      {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ positionSeconds: 10, durationSeconds: 100 })
      },
      env
    );
    expect(write.status).toBe(401);
  });

  it('rejects negative position and non-positive duration', async () => {
    const token = await registerUser('carol');
    await unlock(token, 'super', 'super-course-password');

    const negative = await putProgress(token, 'super-01', { positionSeconds: -1, durationSeconds: 1000 });
    expect(negative.status).toBe(400);

    const zeroDuration = await putProgress(token, 'super-01', { positionSeconds: 10, durationSeconds: 0 });
    expect(zeroDuration.status).toBe(400);
  });

  it('marks completed at 95 percent and keeps below 95 percent incomplete', async () => {
    const token = await registerUser('dave');
    await unlock(token, 'super', 'super-course-password');

    const completed = await putProgress(token, 'super-01', { positionSeconds: 950, durationSeconds: 1000 });
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({ positionSeconds: 950, completed: true });

    const below = await putProgress(token, 'super-01', { positionSeconds: 949, durationSeconds: 1000 });
    expect(below.status).toBe(200);
    await expect(below.json()).resolves.toMatchObject({ positionSeconds: 949, completed: false });
  });

  it('upserts progress by user and lesson', async () => {
    const token = await registerUser('eve');
    await unlock(token, 'super', 'super-course-password');

    await putProgress(token, 'super-01', { positionSeconds: 100, durationSeconds: 1000 });
    const second = await putProgress(token, 'super-01', { positionSeconds: 412, durationSeconds: 1000 });
    expect(second.status).toBe(200);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM watch_progress WHERE lesson_id = 'super-01'`
    ).first<{ count: number }>();
    expect(row?.count).toBe(1);

    const loaded = await getProgress(token, 'super-01');
    await expect(loaded.json()).resolves.toMatchObject({ positionSeconds: 412, completed: false });
  });

  it('returns 404 for an unknown lesson', async () => {
    const token = await registerUser('frank');
    await unlock(token, 'super', 'super-course-password');

    const loaded = await getProgress(token, 'super-99');
    expect(loaded.status).toBe(404);
  });
});
