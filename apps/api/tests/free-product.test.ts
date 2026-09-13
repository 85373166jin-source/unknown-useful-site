import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { seedCatalogAndAdmin } from '../src/db/seed';
import { resetTestDatabase, TABLES_TO_CLEAR } from './helpers/test-db';

const JSON_HEADERS = { 'content-type': 'application/json' };

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonAuthHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), ...JSON_HEADERS };
}

async function registerUser(username: string): Promise<{ token: string }> {
  const response = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password: 'long-password-123' })
    },
    env
  );
  expect(response.status).toBe(201);
  const body = await response.json<{ token: string }>();
  return { token: body.token };
}

async function freeProductRow(): Promise<{
  id: string;
  title: string;
  price_yuan: number;
  price_cents: number;
  product_type: string;
  status: string;
  category_id: string;
  sort_order: number;
} | null> {
  return env.DB.prepare(
    "SELECT id, title, price_yuan, price_cents, product_type, status, category_id, sort_order FROM products WHERE id = 'free'"
  ).first();
}

async function dropAllTables(): Promise<void> {
  await env.DB.exec(
    TABLES_TO_CLEAR.map((table) => `DROP TABLE IF EXISTS "${table}";`).join('\n')
  );
}

const EXPECTED_FREE_PRODUCT = {
  id: 'free',
  title: '免费资源专区',
  price_yuan: 0,
  price_cents: 0,
  product_type: 'other',
  status: 'active',
  category_id: 'free',
  sort_order: 6
} as const;

describe('free resource product migration', () => {
  it('is discovered and inserts an idempotent free product row', async () => {
    expect(env.TEST_MIGRATIONS.map((migration) => migration.name)).toContain(
      '0005_free_product.sql'
    );

    const beforeFree = env.TEST_MIGRATIONS.filter(
      (migration) => migration.name !== '0005_free_product.sql'
    );
    const freeMigration = env.TEST_MIGRATIONS.filter(
      (migration) => migration.name === '0005_free_product.sql'
    );

    await dropAllTables();
    await applyD1Migrations(env.DB, beforeFree, 'free_before_migrations');
    expect(await freeProductRow()).toBeNull();

    await applyD1Migrations(env.DB, freeMigration, 'free_before_migrations');
    // Re-applying under a fresh bookkeeping table must not duplicate the row.
    await applyD1Migrations(env.DB, freeMigration, 'free_reapply_migrations');

    expect(await freeProductRow()).toEqual(EXPECTED_FREE_PRODUCT);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM products WHERE id = 'free'"
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});

describe('free resource product seed', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCatalogAndAdmin(env);
  });

  it('seeds the free product as a zero-price other product', async () => {
    expect(await freeProductRow()).toEqual(EXPECTED_FREE_PRODUCT);
  });

  it('serves and stores comments for the free product without touching payments', async () => {
    const guest = await app.request('/api/v1/products/free/comments', {}, env);
    expect(guest.status).toBe(200);
    await expect(guest.json()).resolves.toEqual({
      comments: [],
      canComment: false,
      currentStatus: 'guest'
    });

    const { token } = await registerUser('free-commenter');
    const created = await app.request(
      '/api/v1/products/free/comments',
      {
        method: 'POST',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ body: '免费资源评论' })
      },
      env
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json<{ productId: string; status: string; body: string }>();
    expect(createdBody.productId).toBe('free');
    expect(createdBody.status).toBe('pending');
    expect(createdBody.body).toBe('免费资源评论');

    const authorView = await app.request(
      '/api/v1/products/free/comments',
      { headers: authHeaders(token) },
      env
    );
    expect(authorView.status).toBe(200);
    const authorBody = await authorView.json<{
      comments: Array<{ body: string }>;
      canComment: boolean;
    }>();
    expect(authorBody.canComment).toBe(true);
    expect(authorBody.comments.map((comment) => comment.body)).toContain('免费资源评论');

    // The free product stays outside the payment flow and cannot be quoted.
    const quote = await app.request(
      '/api/v1/orders/quote?productId=free',
      { headers: authHeaders(token) },
      env
    );
    expect(quote.status).toBe(400);
    await expect(quote.json()).resolves.toMatchObject({
      error: { code: 'invalid_product' }
    });
  });
});
