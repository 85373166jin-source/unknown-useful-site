import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import app from '../src/index';
import { bearerAuth, requireAdmin, type AppEnv } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { hashPassword } from '../src/services/password';
import { hmacContact } from '../src/services/contact';
import { resetTestDatabase } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

type AuthUser = {
  id: string;
  username: string;
  role: 'user' | 'admin';
  phoneMask: string | null;
  emailMask: string | null;
  createdAt: number;
};

type ErrorBody = { error: { code: string; message: string } };

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function registerUser(body: Record<string, unknown>): Promise<Response> {
  return app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body)
    },
    env
  );
}

async function loginUser(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify(body)
    },
    env
  );
}

async function recoverUser(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return app.request(
    '/api/v1/auth/recover',
    {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify(body)
    },
    env
  );
}

async function expectError(response: Response, status: number, code: string): Promise<ErrorBody> {
  expect(response.status).toBe(status);
  const body = (await response.json()) as ErrorBody;
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  return body;
}

describe('authentication API', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
  });

  it('registers a user and replaces the previous session on login', async () => {
    const register = await registerUser({
      username: 'alice',
      password: 'long-password-123',
      email: 'alice@example.com'
    });
    expect(register.status).toBe(201);
    const first = (await register.json()) as { token: string };
    expect(first.token).toBeTruthy();

    const login = await loginUser({ username: 'alice', password: 'long-password-123' });
    expect(login.status).toBe(200);
    const second = (await login.json()) as { token: string; riskLevel: string };
    expect(second.token).toBeTruthy();
    expect(second.riskLevel).toBe('none');

    const oldSession = await app.request('/api/v1/auth/me', { headers: authHeaders(first.token) }, env);
    expect(oldSession.status).toBe(401);
    const newSession = await app.request('/api/v1/auth/me', { headers: authHeaders(second.token) }, env);
    expect(newSession.status).toBe(200);
  });

  it('validates username and password during registration', async () => {
    await expectError(await registerUser({ username: 'ab', password: 'long-password-123' }), 400, 'invalid_username');
    await expectError(await registerUser({ username: 'alice!', password: 'long-password-123' }), 400, 'invalid_username');
    await expectError(await registerUser({ username: 'alice', password: 'short' }), 400, 'invalid_password');
  });


  it('validates optional phone and email values during registration', async () => {
    await expectError(
      await registerUser({ username: 'alice', password: 'long-password-123', phone: 'not-a-phone' }),
      400,
      'invalid_phone'
    );
    await expectError(
      await registerUser({ username: 'alice', password: 'long-password-123', email: 'not-an-email' }),
      400,
      'invalid_email'
    );
    await expectError(
      await registerUser({ username: 'alice', password: 'long-password-123', email: 'alice@example' }),
      400,
      'invalid_email'
    );
  });

  it('rejects duplicate usernames and bound contacts', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123' });
    await expectError(await registerUser({ username: 'alice', password: 'long-password-123' }), 409, 'duplicate_username');

    await registerUser({ username: 'carol', password: 'long-password-123', email: 'alice@example.com' });
    await expectError(
      await registerUser({ username: 'dave', password: 'long-password-123', email: 'ALICE@example.com' }),
      409,
      'duplicate_contact'
    );

    await registerUser({ username: 'erin', password: 'long-password-123', phone: '+86 138-0000-0000' });
    await expectError(
      await registerUser({ username: 'frank', password: 'long-password-123', phone: '13800000000' }),
      409,
      'duplicate_contact'
    );
  });

  it('maps concurrent duplicate registration to a structured conflict', async () => {
    const responses = await Promise.all([
      registerUser({ username: 'alice', password: 'long-password-123', email: 'alice@example.com' }),
      registerUser({ username: 'alice', password: 'long-password-123', email: 'alice@example.com' })
    ]);

    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    for (const response of responses) {
      if (response.status === 409) {
        const body = (await response.json()) as ErrorBody;
        expect(['duplicate_username', 'duplicate_contact']).toContain(body.error.code);
      }
    }
  });

  it('stores only hashed passwords and masked contact values', async () => {
    await registerUser({
      username: 'alice',
      password: 'long-password-123',
      phone: '+86 138-0000-0000',
      email: 'User@Example.COM'
    });

    const row = await env.DB.prepare(
      'SELECT password_hash, phone_hmac, phone_mask, email_hmac, email_mask FROM users WHERE username = ?'
    )
      .bind('alice')
      .first<{
        password_hash: string;
        phone_hmac: string | null;
        phone_mask: string | null;
        email_hmac: string | null;
        email_mask: string | null;
      }>();

    expect(row?.password_hash).not.toContain('long-password-123');
    expect(row?.phone_hmac).toBe(await hmacContact('13800000000', env.CONTACT_HMAC_SECRET));
    expect(row?.phone_mask).toBe('138****0000');
    expect(row?.email_hmac).toBe(await hmacContact('user@example.com', env.CONTACT_HMAC_SECRET));
    expect(row?.email_mask).toBe('us***@example.com');
  });

  it('rejects invalid login credentials', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123' });
    await expectError(await loginUser({ username: 'alice', password: 'wrong-password' }), 401, 'invalid_credentials');
    await expectError(await loginUser({ username: 'nobody', password: 'long-password-123' }), 401, 'invalid_credentials');
  });

  it('clears an expired-but-unrevoked session before creating a new one', async () => {
    const register = await registerUser({ username: 'alice', password: 'long-password-123' });
    const first = (await register.json()) as { token: string };

    const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
      .bind('alice')
      .first<{ id: string }>();
    if (!user) {
      throw new Error('Expected the registered user to exist');
    }
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?')
      .bind(1, user.id)
      .run();

    const login = await loginUser({ username: 'alice', password: 'long-password-123' });
    expect(login.status).toBe(200);

    const oldSession = await app.request('/api/v1/auth/me', { headers: authHeaders(first.token) }, env);
    expect(oldSession.status).toBe(401);
  });

  it('logs out the current session', async () => {
    const register = await registerUser({ username: 'alice', password: 'long-password-123' });
    const first = (await register.json()) as { token: string };

    await expect((await app.request('/api/v1/auth/me', { headers: authHeaders(first.token) }, env)).status).toBe(200);

    const logout = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: authHeaders(first.token)
    }, env);
    expect(logout.status).toBe(200);

    await expectError(
      await app.request('/api/v1/auth/me', { headers: authHeaders(first.token) }, env),
      401,
      'unauthorized'
    );
  });

  it('recovers with a matching phone and invalidates all old sessions', async () => {
    const register = await registerUser({
      username: 'alice',
      password: 'old-password-123',
      phone: '+86 138-0000-0000'
    });
    const first = (await register.json()) as { token: string };

    const recover = await recoverUser({
      username: 'alice',
      contact: '138-0000-0000',
      newPassword: 'new-password-456'
    });
    expect(recover.status).toBe(200);

    await expectError(
      await app.request('/api/v1/auth/me', { headers: authHeaders(first.token) }, env),
      401,
      'unauthorized'
    );
    await expectError(await loginUser({ username: 'alice', password: 'old-password-123' }), 401, 'invalid_credentials');

    const login = await loginUser({ username: 'alice', password: 'new-password-456' });
    expect(login.status).toBe(200);
  });

  it('recovers with a matching email', async () => {
    await registerUser({
      username: 'alice',
      password: 'old-password-123',
      email: 'User@Example.COM'
    });

    const recover = await recoverUser({
      username: 'alice',
      contact: 'user@example.com',
      newPassword: 'new-password-456'
    });
    expect(recover.status).toBe(200);

    const login = await loginUser({ username: 'alice', password: 'new-password-456' });
    expect(login.status).toBe(200);
  });

  it('rejects an invalid email on the recovery path', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123', email: 'alice@example.com' });

    await expectError(
      await recoverUser({ username: 'alice', contact: 'not-an-email', newPassword: 'new-password-456' }),
      400,
      'invalid_contact'
    );
    await expectError(
      await recoverUser({ username: 'alice', contact: 'alice@example', newPassword: 'new-password-456' }),
      400,
      'invalid_contact'
    );
  });

  it('requires an exact username and matching contact for recovery', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123', phone: '13800000000' });

    await expectError(
      await recoverUser({ username: 'alice', contact: '13900000000', newPassword: 'new-password-456' }),
      401,
      'invalid_credentials'
    );
    await expectError(
      await recoverUser({ username: 'aliceX', contact: '13800000000', newPassword: 'new-password-456' }),
      401,
      'invalid_credentials'
    );
  });

  it('updates the password and contacts through the account patch endpoint', async () => {
    const register = await registerUser({
      username: 'alice',
      password: 'old-password-123',
      phone: '13800000000'
    });
    const first = (await register.json()) as { token: string };

    const patch = await app.request(
      '/api/v1/auth/account',
      {
        method: 'PATCH',
        headers: { ...authHeaders(first.token), ...JSON_HEADERS },
        body: JSON.stringify({ newPassword: 'new-password-456', phone: '13900000000', email: 'alice@example.com' })
      },
      env
    );
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { user: AuthUser };
    expect(body.user.phoneMask).toBe('139****0000');
    expect(body.user.emailMask).toBe('al***@example.com');

    await expectError(
      await app.request('/api/v1/auth/me', { headers: authHeaders(first.token) }, env),
      401,
      'unauthorized'
    );

    await expectError(await loginUser({ username: 'alice', password: 'old-password-123' }), 401, 'invalid_credentials');

    const login = await loginUser({ username: 'alice', password: 'new-password-456' });
    expect(login.status).toBe(200);
  });

  it('rejects an invalid email through the account patch endpoint', async () => {
    const register = await registerUser({ username: 'alice', password: 'long-password-123' });
    const first = (await register.json()) as { token: string };

    await expectError(
      await app.request(
        '/api/v1/auth/account',
        {
          method: 'PATCH',
          headers: { ...authHeaders(first.token), ...JSON_HEADERS },
          body: JSON.stringify({ email: 'not-an-email' })
        },
        env
      ),
      400,
      'invalid_email'
    );
  });

  it('rejects binding a contact that already belongs to another account', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123', email: 'alice@example.com' });
    const register = await registerUser({ username: 'bob', password: 'long-password-123' });
    const first = (await register.json()) as { token: string };

    await expectError(
      await app.request(
        '/api/v1/auth/account',
        {
          method: 'PATCH',
          headers: { ...authHeaders(first.token), ...JSON_HEADERS },
          body: JSON.stringify({ email: 'alice@example.com' })
        },
        env
      ),
      409,
      'duplicate_contact'
    );
  });

  it('unbinds a contact through the contact delete endpoint', async () => {
    const register = await registerUser({
      username: 'alice',
      password: 'long-password-123',
      phone: '13800000000',
      email: 'alice@example.com'
    });
    const first = (await register.json()) as { token: string };

    const deleteResponse = await app.request(
      '/api/v1/auth/account/contact',
      {
        method: 'DELETE',
        headers: { ...authHeaders(first.token), ...JSON_HEADERS },
        body: JSON.stringify({ kind: 'phone' })
      },
      env
    );
    expect(deleteResponse.status).toBe(200);

    const row = await env.DB.prepare('SELECT phone_hmac, phone_mask FROM users WHERE username = ?')
      .bind('alice')
      .first<{ phone_hmac: string | null; phone_mask: string | null }>();
    expect(row?.phone_hmac).toBeNull();
    expect(row?.phone_mask).toBeNull();

    await expectError(
      await app.request(
        '/api/v1/auth/account/contact',
        {
          method: 'DELETE',
          headers: { ...authHeaders(first.token), ...JSON_HEADERS },
          body: JSON.stringify({ kind: 'wechat' })
        },
        env
      ),
      400,
      'invalid_request'
    );
  });

  it('rate limits login attempts by username', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await loginUser({ username: 'alice', password: 'wrong-password' });
      expect(response.status).toBe(401);
    }

    await expectError(await loginUser({ username: 'alice', password: 'wrong-password' }), 429, 'rate_limited');
  });

  it('rate limits login attempts by IP', async () => {
    const passwordHash = await hashPassword('long-password-123');
    const now = Date.now();
    for (let index = 0; index < 21; index += 1) {
      await env.DB.prepare(
        "INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, 'user', 'active', ?, ?)"
      )
        .bind(`u${index}`, `user${index}`, passwordHash, now, now)
        .run();
    }

    for (let index = 0; index < 20; index += 1) {
      const response = await loginUser(
        { username: `user${index}`, password: 'long-password-123' },
        { 'cf-connecting-ip': '203.0.113.9' }
      );
      expect(response.status).toBe(200);
    }

    await expectError(
      await loginUser({ username: 'user20', password: 'long-password-123' }, { 'cf-connecting-ip': '203.0.113.9' }),
      429,
      'rate_limited'
    );
  });

  it('rate limits recovery attempts by username', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123', phone: '13800000000' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await recoverUser({
        username: 'alice',
        contact: '13900000000',
        newPassword: 'new-password-456'
      });
      expect(response.status).toBe(401);
    }

    await expectError(
      await recoverUser({ username: 'alice', contact: '13900000000', newPassword: 'new-password-456' }),
      429,
      'rate_limited'
    );
  });

  it('rate limits recovery attempts by IP', async () => {
    const passwordHash = await hashPassword('long-password-123');
    const now = Date.now();
    for (let index = 0; index < 21; index += 1) {
      await env.DB.prepare(
        "INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, 'user', 'active', ?, ?)"
      )
        .bind(`u${index}`, `user${index}`, passwordHash, now, now)
        .run();
    }

    for (let index = 0; index < 20; index += 1) {
      const response = await recoverUser(
        { username: `user${index}`, contact: '13900000000', newPassword: 'new-password-456' },
        { 'cf-connecting-ip': '203.0.113.8' }
      );
      expect(response.status).toBe(401);
    }

    await expectError(
      await recoverUser(
        { username: 'user20', contact: '13900000000', newPassword: 'new-password-456' },
        { 'cf-connecting-ip': '203.0.113.8' }
      ),
      429,
      'rate_limited'
    );
  });

  it('returns a risk warning after multiple distinct login IPs', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123' });

    const first = await loginUser({ username: 'alice', password: 'long-password-123' }, { 'cf-connecting-ip': '203.0.113.1' });
    expect(((await first.json()) as { riskLevel: string }).riskLevel).toBe('none');

    const second = await loginUser({ username: 'alice', password: 'long-password-123' }, { 'cf-connecting-ip': '203.0.113.2' });
    expect(((await second.json()) as { riskLevel: string }).riskLevel).toBe('none');

    const third = await loginUser({ username: 'alice', password: 'long-password-123' }, { 'cf-connecting-ip': '203.0.113.3' });
    expect(((await third.json()) as { riskLevel: string }).riskLevel).toBe('warn');
  });

  it('adds CORS headers only for configured origins', async () => {
    const allowed = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { origin: 'https://example.com', ...JSON_HEADERS },
        body: JSON.stringify({ username: 'alice', password: 'long-password-123' })
      },
      env
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://example.com');
    expect(allowed.headers.get('access-control-allow-methods')).toContain('POST');
    expect(allowed.headers.get('access-control-allow-headers')).toContain('Authorization');

    const denied = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { origin: 'https://evil.example', ...JSON_HEADERS },
        body: JSON.stringify({ username: 'bob', password: 'long-password-123' })
      },
      env
    );
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('treats a missing ALLOWED_ORIGINS binding as an empty allow-list', async () => {
    const response = await app.request('/api/v1/health', {}, {});
    expect(response.status).toBe(200);
  });

  it('ignores spoofable forwarding headers for login risk identity', async () => {
    await registerUser({ username: 'alice', password: 'long-password-123' });

    const first = await loginUser({ username: 'alice', password: 'long-password-123' }, { 'x-forwarded-for': '203.0.113.1' });
    expect(((await first.json()) as { riskLevel: string }).riskLevel).toBe('none');

    const second = await loginUser({ username: 'alice', password: 'long-password-123' }, { 'x-forwarded-for': '203.0.113.2' });
    expect(((await second.json()) as { riskLevel: string }).riskLevel).toBe('none');

    const third = await loginUser({ username: 'alice', password: 'long-password-123' }, { 'x-forwarded-for': '203.0.113.3' });
    expect(((await third.json()) as { riskLevel: string }).riskLevel).toBe('none');
  });

  it('answers CORS preflight for configured origins', async () => {
    const preflight = await app.request(
      '/api/v1/auth/account',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'PATCH',
          'access-control-request-headers': 'authorization,content-type'
        }
      },
      env
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });

  it('rejects missing and malformed bearer tokens', async () => {
    await expectError(await app.request('/api/v1/auth/me', {}, env), 401, 'unauthorized');
    await expectError(
      await app.request('/api/v1/auth/me', { headers: { authorization: 'Bearer not-a-token' } }, env),
      401,
      'unauthorized'
    );
  });

  it('enforces the admin role server-side', async () => {
    const adminHash = await hashPassword('admin-password-123');
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('admin-1', 'admin-1', ?, 'admin', 'active', ?, ?)"
    )
      .bind(adminHash, now, now)
      .run();

    const userRegister = await registerUser({ username: 'alice', password: 'long-password-123' });
    const userToken = ((await userRegister.json()) as { token: string }).token;

    const adminLogin = await loginUser({ username: 'admin-1', password: 'admin-password-123' });
    const adminToken = ((await adminLogin.json()) as { token: string }).token;

    const protectedApp = new Hono<AppEnv>();
    protectedApp.onError(errorHandler);
    protectedApp.use('/admin', bearerAuth, requireAdmin);
    protectedApp.get('/admin', (c) => c.json({ ok: true }));

    await expectError(
      await protectedApp.request('/admin', { headers: authHeaders(userToken) }, env),
      403,
      'forbidden'
    );

    const allowed = await protectedApp.request('/admin', { headers: authHeaders(adminToken) }, env);
    expect(allowed.status).toBe(200);
  });

  it('returns structured JSON for unknown routes', async () => {
    await expectError(await app.request('/api/v1/unknown', {}, env), 404, 'not_found');
  });
});

