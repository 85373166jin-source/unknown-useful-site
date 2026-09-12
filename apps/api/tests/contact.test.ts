import { describe, expect, it } from 'vitest';
import { hmacContact, maskEmail, maskPhone, normalizeEmail, normalizePhone } from '../src/services/contact';

describe('contact primitives', () => {
  it('normalizes Chinese phone numbers', () => {
    expect(normalizePhone('+86 138-0000-0000')).toBe('13800000000');
    expect(normalizePhone('13800000000')).toBe('13800000000');
    expect(normalizePhone('+8613800000000')).toBe('13800000000');
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('normalizes email addresses with trim and lowercase', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
    expect(normalizeEmail('   ')).toBeNull();
  });

  it('masks phone and email display values', () => {
    expect(maskPhone('13800000000')).toBe('138****0000');
    expect(maskEmail('user@example.com')).toBe('us***@example.com');
  });

  it('hashes contact values deterministically with HMAC-SHA-256', async () => {
    const first = await hmacContact('13800000000', 'contact-secret');
    const second = await hmacContact('13800000000', 'contact-secret');
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const other = await hmacContact('13800000000', 'other-secret');
    expect(other).not.toBe(first);
  });
});
