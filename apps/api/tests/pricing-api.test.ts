import { describe, expect, it } from 'vitest';
import { priceForTier, priceProductForUser } from '../src/services/pricing';

describe('server pricing', () => {
  it('applies eligible membership discounts', () => {
    expect(priceForTier(2900, 'course', 'normal')).toBe(2900);
    expect(priceForTier(2900, 'course', 'vip')).toBe(2320);
    expect(priceForTier(2900, 'course', 'svip')).toBe(1450);
  });

  it('does not discount membership, opening, service, or tip products', () => {
    expect(priceForTier(990, 'membership', 'svip')).toBe(990);
    expect(priceForTier(1, 'partner_opening', 'svip')).toBe(1);
    expect(priceForTier(10000, 'service', 'svip')).toBe(10000);
  });

  it('discounts digital and other virtual products', () => {
    expect(priceForTier(1000, 'digital', 'vip')).toBe(800);
    expect(priceForTier(1000, 'digital', 'svip')).toBe(500);
    expect(priceForTier(2000, 'other', 'svip')).toBe(1000);
  });

  it('prices a product for an effective membership', () => {
    expect(priceProductForUser({ price_cents: 2900, product_type: 'course' }, { tier: 'vip' })).toBe(2320);
    expect(priceProductForUser({ price_cents: 990, product_type: 'membership' }, { tier: 'svip' })).toBe(990);
  });
});
