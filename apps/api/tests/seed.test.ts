import { describe, expect, it } from 'vitest';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { Env } from '../src/env';
import app from '../src/index';
import seedWorker from '../src/db/seed';

function makeSeedEnv(seedToken?: string): Env {
  const env: Env = {
    DB: {
      prepare() {
        throw new Error('DB should not be reached for unauthorized requests');
      }
    } as unknown as D1Database,
    SCREENSHOTS: {} as KVNamespace,
    SESSION_PEPPER: 'test-session-pepper',
    CONTACT_HMAC_SECRET: 'test-contact-secret',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD_HASH: 'test-admin-password-hash',
    SUPER_COURSE_PASSWORD_HASH: 'test-super-course-hash',
    ANBU_COURSE_PASSWORD_HASH: 'test-anbu-course-hash',
    ALLOWED_ORIGINS: 'https://example.com'
  };

  if (seedToken !== undefined) {
    env.SEED_TOKEN = seedToken;
  }

  return env;
}

describe('public main entry', () => {
  it('does not mount the seed worker route', async () => {
    const response = await app.request('/seed', { method: 'POST' });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'not_found', message: 'Not found' }
    });
  });

  it('still serves the health endpoint', async () => {
    const response = await app.request('/api/v1/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe('seed worker authorization', () => {
  it('rejects requests when no SEED_TOKEN is configured', async () => {
    const response = await seedWorker.fetch(
      new Request('https://seed.local/seed', { method: 'POST' }),
      makeSeedEnv(undefined)
    );
    expect(response.status).toBe(401);
  });

  it('rejects requests with a missing or wrong token', async () => {
    const env = makeSeedEnv('expected-token');

    const missing = await seedWorker.fetch(
      new Request('https://seed.local/seed', { method: 'POST' }),
      env
    );
    expect(missing.status).toBe(401);

    const wrong = await seedWorker.fetch(
      new Request('https://seed.local/seed', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' }
      }),
      env
    );
    expect(wrong.status).toBe(401);
  });

  it('rejects non-POST methods', async () => {
    const response = await seedWorker.fetch(
      new Request('https://seed.local/seed', {
        method: 'GET',
        headers: { Authorization: 'Bearer expected-token' }
      }),
      makeSeedEnv('expected-token')
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('accepts a POST with the correct bearer token', async () => {
    let prepared = 0;
    const db = {
      prepare() {
        prepared += 1;
        return {
          bind() {
            return {
              async run() {
                return { meta: {} };
              }
            };
          }
        };
      }
    };

    const env: Env = {
      ...makeSeedEnv('expected-token'),
      DB: db as unknown as D1Database
    };

    const response = await seedWorker.fetch(
      new Request('https://seed.local/seed', {
        method: 'POST',
        headers: { Authorization: 'Bearer expected-token' }
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(prepared).toBeGreaterThan(0);
  });
});
