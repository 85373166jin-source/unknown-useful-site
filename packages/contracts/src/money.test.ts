import { describe, expect, it } from 'vitest';
import { centsToYuanString, discountedCents, yuanToCents } from './money';
import { MembershipTierSchema, PermissionRoleSchema } from './identity';

describe('money contracts', () => {
  it('converts yuan strings to exact cents', () => {
    expect(yuanToCents('0.01')).toBe(1);
    expect(yuanToCents('9.9')).toBe(990);
    expect(yuanToCents(29)).toBe(2900);
    expect(yuanToCents('49.00')).toBe(4900);
  });

  it('formats cents without floating point errors', () => {
    expect(centsToYuanString(1)).toBe('0.01');
    expect(centsToYuanString(990)).toBe('9.90');
    expect(centsToYuanString(2900)).toBe('29.00');
  });

  it('calculates membership discounts with cent rounding', () => {
    expect(discountedCents(2900, 'normal')).toBe(2900);
    expect(discountedCents(2900, 'vip')).toBe(2320);
    expect(discountedCents(2900, 'svip')).toBe(1450);
    expect(discountedCents(1, 'svip')).toBe(1);
  });

  it('accepts only declared identity values', () => {
    expect(PermissionRoleSchema.parse('owner')).toBe('owner');
    expect(MembershipTierSchema.parse('svip')).toBe('svip');
    expect(() => MembershipTierSchema.parse('gold')).toThrow();
  });
});
