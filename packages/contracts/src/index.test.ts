import { describe, expect, it } from 'vitest';
import { CATALOG, ProductSchema } from './index';

describe('catalog contracts', () => {
  it('contains the confirmed prices and statuses', () => {
    expect(CATALOG.products.super.priceYuan).toBe(29);
    expect(CATALOG.products.anbu.priceYuan).toBe(29);
    expect(CATALOG.products.bundle.priceYuan).toBe(49);
    expect(CATALOG.products.bundle.status).toBe('presale');
  });

  it('contains nine super course lessons', () => {
    expect(CATALOG.series.super.lessons).toHaveLength(9);
    expect(CATALOG.series.super.lessons[0]).toMatchObject({
      id: 'super-01',
      title: '第 1 课',
      mediaPath: '/media/super-shadow/1.mp4'
    });
  });

  it('rejects an invalid product price', () => {
    expect(() => ProductSchema.parse({ id: 'super', priceYuan: -1 })).toThrow();
  });
});
