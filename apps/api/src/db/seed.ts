import { CATALOG } from '@site/contracts';
import type { Env } from '../env';

type ProductId = keyof typeof CATALOG.products;
type SeriesId = keyof typeof CATALOG.series;

const PRODUCT_SORT_ORDER: Record<ProductId, number> = {
  super: 1,
  bundle: 2,
  anbu: 3
};

const SERIES_PASSWORD_BINDING = {
  super: 'SUPER_COURSE_PASSWORD_HASH',
  anbu: 'ANBU_COURSE_PASSWORD_HASH'
} as const satisfies Record<SeriesId, keyof Pick<Env, 'SUPER_COURSE_PASSWORD_HASH' | 'ANBU_COURSE_PASSWORD_HASH'>>;

export async function seedCatalogAndAdmin(env: Env): Promise<void> {
  const now = Date.now();

  const productIds = Object.keys(CATALOG.products) as ProductId[];
  for (const productId of productIds) {
    const product = CATALOG.products[productId];
    await env.DB.prepare(
      `INSERT INTO products
        (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        price_yuan = excluded.price_yuan,
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
    const passwordHash = env[SERIES_PASSWORD_BINDING[seriesId]];
    await env.DB.prepare(
      `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        course_password_hash = excluded.course_password_hash,
        updated_at = excluded.updated_at`
    )
      .bind(series.id, series.title, series.status, passwordHash, now, now)
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

  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
     VALUES ('admin', ?, ?, 'admin', 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      password_hash = excluded.password_hash,
      role = excluded.role,
      status = excluded.status,
      updated_at = excluded.updated_at`
  )
    .bind(env.ADMIN_USERNAME, env.ADMIN_PASSWORD_HASH, now, now)
    .run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/seed') {
      return new Response('Not found', { status: 404 });
    }
    await seedCatalogAndAdmin(env);
    return Response.json({ ok: true });
  }
};
