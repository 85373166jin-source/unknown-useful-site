import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedCatalogAndAdmin } from '../src/db/seed';
import { resetTestDatabase, TABLES_TO_CLEAR } from './helpers/test-db';

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
});
