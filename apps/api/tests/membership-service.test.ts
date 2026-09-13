import { describe, expect, it } from 'vitest';
import { effectiveMembership, nextMembershipExpiry } from '../src/services/membership';

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
});
