import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { classifyLoginRisk } from '../src/services/risk';

async function createTestUserAndSession(env: Env) {
  const response = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'security-user', password: 'long-password-123' })
  }, env);
  return response.json<{ token: string }>();
}

it('protects entitlements, admin routes, and strong risk classification', async () => {
  const withoutToken = await app.request('/api/v1/entitlements', {}, env);
  expect(withoutToken.status).toBe(401);

  const userSession = await createTestUserAndSession(env);
  const adminPageAsUser = await app.request('/api/v1/admin/dashboard', {
    headers: { authorization: 'Bearer ' + userSession.token }
  }, env);
  expect(adminPageAsUser.status).toBe(403);

  const strongSignals = [1, 2, 3, 4, 5].map((n) => ({
    ipHash: String(n), country: 'CN', city: 'Shanghai', at: 1
  }));
  expect(classifyLoginRisk(strongSignals)).toBe('strong_warn');
});

it('replaces the previous session on a new login', async () => {
  const username = 'security-session-user';
  const register = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'long-password-123' })
  }, env);
  expect(register.status).toBe(201);
  const first = await register.json<{ token: string }>();

  const login = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'long-password-123' })
  }, env);
  expect(login.status).toBe(200);
  const second = await login.json<{ token: string }>();

  const oldSession = await app.request('/api/v1/auth/me', {
    headers: { authorization: 'Bearer ' + first.token }
  }, env);
  expect(oldSession.status).toBe(401);

  const newSession = await app.request('/api/v1/auth/me', {
    headers: { authorization: 'Bearer ' + second.token }
  }, env);
  expect(newSession.status).toBe(200);
});

it('never returns plaintext PII or password material in public payloads', async () => {
  const username = 'security-pii-user';
  const phone = '+86 138-0000-0000';
  const email = 'security-pii@example.com';
  const password = 'long-password-123';

  const register = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, phone, email })
  }, env);
  expect(register.status).toBe(201);

  const body = await register.json<{ token: string; user: Record<string, unknown> }>();
  const registerText = JSON.stringify(body);
  expect(registerText).not.toContain(phone.replace(/[^0-9]/g, ''));
  expect(registerText).not.toContain(email);
  expect(registerText).not.toContain(password);
  expect(registerText).not.toContain('password_hash');

  const me = await app.request('/api/v1/auth/me', {
    headers: { authorization: 'Bearer ' + body.token }
  }, env);
  expect(me.status).toBe(200);
  const meText = await me.text();
  expect(meText).not.toContain(phone.replace(/[^0-9]/g, ''));
  expect(meText).not.toContain(email);
  expect(meText).not.toContain(password);
  expect(meText).not.toContain('password_hash');
});
