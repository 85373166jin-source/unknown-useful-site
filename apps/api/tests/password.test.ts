import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/password';

describe('password primitives', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    await expect(verifyPassword('correct', await hashPassword('correct'))).resolves.toBe(true);
    await expect(verifyPassword('wrong', await hashPassword('correct'))).resolves.toBe(false);
  });

  it('encodes PBKDF2-SHA-256 with 100000 iterations and a random salt', async () => {
    const encoded = await hashPassword('correct');
    const [algorithm, iterations, salt, hash] = encoded.split('$');
    expect(algorithm).toBe('pbkdf2-sha256');
    expect(iterations).toBe('100000');
    expect(salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(salt).not.toBe(hash);
  });

  it('returns false for malformed encoded values', async () => {
    await expect(verifyPassword('correct', '')).resolves.toBe(false);
    await expect(verifyPassword('correct', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('correct', 'pbkdf2-sha256$100000$$')).resolves.toBe(false);
  });
});
