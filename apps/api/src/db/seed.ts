import { CATALOG } from '@site/contracts';
import type { Env } from '../env';
import { PRODUCT_SORT_ORDER } from '../services/catalog';

type ProductId = keyof typeof CATALOG.products;
type SeriesId = keyof typeof CATALOG.series;

const membershipProducts = [
  { id: 'vip_monthly', title: 'VIP 会员', priceCents: 990, productType: 'membership' },
  { id: 'svip_monthly', title: 'SVIP 豪华会员', priceCents: 1990, productType: 'membership' }
] as const;

// Free resource product that backs the homepage 免费资源专区 comment surface.
// It is intentionally not part of the claimable ProductId enum, so payments are unaffected.
const freeProduct = {
  id: 'free',
  title: '免费资源专区',
  priceCents: 0,
  productType: 'other',
  categoryId: 'free',
  sortOrder: 6,
  description: '免费工具与学习资料整理中'
} as const;

export async function seedCatalogAndAdmin(env: Env): Promise<void> {
  const now = Date.now();

  const productIds = Object.keys(CATALOG.products) as ProductId[];
  for (const productId of productIds) {
    const product = CATALOG.products[productId];
    await env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        price_yuan = excluded.price_yuan,
        price_cents = excluded.price_cents,
        product_type = excluded.product_type,
        status = excluded.status,
        category_id = excluded.category_id,
        sort_order = excluded.sort_order,
        description = excluded.description,
        updated_at = excluded.updated_at`
    )
      .bind(
        product.id,
        product.title,
        product.priceYuan,
        product.priceYuan * 100,
        product.productType,
        product.status,
        product.categoryId,
        PRODUCT_SORT_ORDER[productId],
        product.description,
        now,
        now
      )
      .run();
  }

  const seriesIds = Object.keys(CATALOG.series) as SeriesId[];
  for (const seriesId of seriesIds) {
    const series = CATALOG.series[seriesId];
    await env.DB.prepare(
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        updated_at = excluded.updated_at`
    )
      .bind(series.id, series.title, series.status, 'card-key-only', now, now)
      .run();

    for (const lesson of series.lessons) {
      await env.DB.prepare(
        `INSERT INTO lessons (id, series_id, title, media_path, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          series_id = excluded.series_id,
          title = excluded.title,
          media_path = excluded.media_path,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`
      )
        .bind(lesson.id, series.id, lesson.title, lesson.mediaPath, lesson.order, now, now)
        .run();
    }
  }

  const components: Array<[ProductId, ProductId]> = [
    ['bundle', 'super'],
    ['bundle', 'anbu']
  ];
  for (const [parentProductId, childProductId] of components) {
    await env.DB.prepare(
      `INSERT INTO product_components (parent_product_id, child_product_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(parent_product_id, child_product_id) DO UPDATE SET updated_at = excluded.updated_at`
    )
      .bind(parentProductId, childProductId, now, now)
      .run();
  }

  for (const [index, product] of membershipProducts.entries()) {
    await env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'memberships', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        price_yuan = excluded.price_yuan,
        price_cents = excluded.price_cents,
        product_type = excluded.product_type,
        status = excluded.status,
        category_id = excluded.category_id,
        sort_order = excluded.sort_order,
        description = excluded.description,
        updated_at = excluded.updated_at`
    )
      .bind(
        product.id,
        product.title,
        Math.round(product.priceCents / 100),
        product.priceCents,
        product.productType,
        4 + index,
        `${product.title} 30 天`,
        now,
        now
      )
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO products
      (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      price_yuan = excluded.price_yuan,
      price_cents = excluded.price_cents,
      product_type = excluded.product_type,
      status = excluded.status,
      category_id = excluded.category_id,
      sort_order = excluded.sort_order,
      description = excluded.description,
      updated_at = excluded.updated_at`
  )
    .bind(
      freeProduct.id,
      freeProduct.title,
      Math.round(freeProduct.priceCents / 100),
      freeProduct.priceCents,
      freeProduct.productType,
      freeProduct.categoryId,
      freeProduct.sortOrder,
      freeProduct.description,
      now,
      now
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, permission_role, status, created_at, updated_at)
     VALUES ('admin', ?, ?, 'admin', 'owner', 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      role = excluded.role,
      permission_role = excluded.permission_role,
      status = excluded.status,
      updated_at = excluded.updated_at`
  )
    .bind(env.ADMIN_USERNAME, env.ADMIN_PASSWORD_HASH, now, now)
    .run();
}

function readSeedToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return request.headers.get("x-seed-token");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/seed") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" }
      });
    }

    const token = readSeedToken(request);
    if (!env.SEED_TOKEN || !token || !safeEqual(token, env.SEED_TOKEN)) {
      return new Response("Unauthorized", { status: 401 });
    }

    await seedCatalogAndAdmin(env);
    return Response.json({ ok: true });
  }
};

