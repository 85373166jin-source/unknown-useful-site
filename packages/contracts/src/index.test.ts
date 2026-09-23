import { describe, expect, it } from 'vitest';
import { CATALOG, ProductSchema } from './index';

describe('catalog contracts', () => {
  it('contains the confirmed prices and statuses', () => {
    expect(CATALOG.products.super.priceYuan).toBe(29);
    expect(CATALOG.products.anbu.priceYuan).toBe(29);
    expect(CATALOG.products.bundle.priceYuan).toBe(49);
    expect(CATALOG.products.bundle.status).toBe('presale');
  });

  it('contains the new paid Douyin registration tutorial', () => {
    expect(CATALOG.products.douyin).toMatchObject({
      title: '无限注册抖音新号',
      priceYuan: 19,
      productType: 'digital',
      status: 'active',
      categoryId: 'digital'
    });
    expect(CATALOG.series.douyin.lessons).toHaveLength(2);
    expect(CATALOG.series.douyin.lessons[0]?.mediaPath).toContain('/douyin-01.mp4');
  });

  it('contains the complete super and anbu course catalogs', () => {
    expect(CATALOG.series.super.lessons).toHaveLength(18);
    expect(CATALOG.series.anbu.lessons).toHaveLength(31);
    expect(CATALOG.series.super.lessons[0]).toMatchObject({
      id: 'super-01',
      title: '第 1 课',
      coverPath: '/media/covers/super-01.webp'
    });
    expect(CATALOG.series.super.lessons[0]?.mediaPath).toContain('/super-01.mp4');
    expect(CATALOG.series.anbu.lessons[30]?.mediaPath).toContain('/anbu-31.mp4');
  });

  it('rejects an invalid product price', () => {
    expect(() => ProductSchema.parse({ id: 'super', priceYuan: -1 })).toThrow();
  });
});
