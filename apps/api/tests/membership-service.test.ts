import { describe, expect, it } from 'vitest';
import { applyMembershipPurchase, effectiveMembership, nextMembershipExpiry } from '../src/services/membership';

describe('membership service', () => {
  it('expires a membership at its timestamp', () => {
    expect(effectiveMembership({ tier: 'vip', expiresAt: 100 }, 100)).toEqual({ tier: 'normal', expiresAt: null });
    expect(effectiveMembership({ tier: 'vip', expiresAt: 101 }, 100)).toEqual({ tier: 'vip', expiresAt: 101 });
  });

  it('extends the same tier from the later timestamp', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(nextMembershipExpiry('vip', 200 * day + 1, 100 * day, 'vip')).toBe(230 * day + 1);
    expect(nextMembershipExpiry('vip', 90 * day, 100 * day, 'vip')).toBe(130 * day);
  });

  it('resets the period when upgrading to SVIP', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(nextMembershipExpiry('vip', 200 * day, 100 * day, 'svip')).toBe(130 * day);
  });

  it('rejects downgrading an active SVIP to VIP', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(() =>
      applyMembershipPurchase({ tier: 'svip', expiresAt: 200 * day }, 'vip', 100 * day)
    ).toThrow('SVIP cannot downgrade to VIP');
  });

  it('keeps VIP to SVIP on a fresh period', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(
      applyMembershipPurchase({ tier: 'vip', expiresAt: 200 * day }, 'svip', 100 * day)
    ).toEqual({ tier: 'svip', expiresAt: 130 * day });
  });

  it('allows an expired SVIP to purchase VIP', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(
      applyMembershipPurchase({ tier: 'svip', expiresAt: 100 * day }, 'vip', 100 * day)
    ).toEqual({ tier: 'vip', expiresAt: 130 * day });
  });
});
