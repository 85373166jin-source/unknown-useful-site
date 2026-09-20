import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import app from '../src/index';

describe('catalog API', () => {
  it('returns products sorted by sort_order and categories in fixed order', async () => {
    const response = await app.request('/api/v1/catalog', {}, env);

    expect(response.status).toBe(200);

    const body = await response.json<{
      products: Array<{ id: string; priceYuan: number; status: string }>;
      categories: Array<{ id: string; title: string }>;
    }>();

    expect(body.products.map((p) => p.id)).toEqual(['super', 'bundle', 'anbu']);
    expect(body.products.find((p) => p.id === 'super')?.priceYuan).toBe(29);
    expect(body.products.find((p) => p.id === 'anbu')?.status).toBe('active');
    expect(body.products.find((p) => p.id === 'bundle')?.status).toBe('presale');
    expect(body.categories.map((c) => c.title)).toEqual([
      '全部资源',
      '在线课程',
      '工具服务',
      '会员权益',
      '数字资源',
      '免费专区'
    ]);
  });
});
