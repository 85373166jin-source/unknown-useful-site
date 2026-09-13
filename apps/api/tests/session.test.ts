import { describe, expect, it } from 'vitest';
import { SESSION_LIFETIME_MS, hashSessionToken, issueSessionToken, sessionExpiresAt } from '../src/services/session';

describe('session token primitives', () => {
  it('issues a 32-byte opaque token and its HMAC hash', async () => {
    const issued = await issueSessionToken('pepper');
    expect(issued.token).toBeTruthy();
    expect(issued.tokenHash).toBeTruthy();
    expect(issued.token).not.toBe(issued.tokenHash);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes issued tokens with the session pepper', async () => {
    const issued = await issueSessionToken('pepper');
    await expect(hashSessionToken(issued.token, 'pepper')).resolves.toBe(issued.tokenHash);
    await expect(hashSessionToken(issued.token, 'different-pepper')).resolves.not.toBe(issued.tokenHash);
  });

  it('issues unique tokens and hashes', async () => {
    const first = await issueSessionToken('pepper');
    const second = await issueSessionToken('pepper');
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  it('defines explicit session expiry semantics', () => {
    expect(SESSION_LIFETIME_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(sessionExpiresAt(1000)).toBe(1000 + SESSION_LIFETIME_MS);
  });
});
