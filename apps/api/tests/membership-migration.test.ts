import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedCatalogAndAdmin } from '../src/db/seed';
import { resetTestDatabase, TABLES_TO_CLEAR } from './helpers/test-db';

const BACKFILL_MIGRATION_TABLE = 'membership_backfill_migrations';

async function dropAllTables(): Promise<void> {
  const statements = TABLES_TO_CLEAR.map(
    (table) => `DROP TABLE IF EXISTS "${table}";`
  ).join('\n');
  await env.DB.exec(statements);
}

async function applyMigrationsThrough0002(): Promise<void> {
  await dropAllTables();
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter(
      (migration) => migration.name === '0001_init.sql' || migration.name === '0002_payment_claim_note.sql'
    ),
    BACKFILL_MIGRATION_TABLE
  );
}

async function applyMigration0003(): Promise<void> {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((migration) => migration.name === '0003_identity_membership_money.sql'),
    BACKFILL_MIGRATION_TABLE
  );
}

describe('identity and membership migration', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCatalogAndAdmin(env);
  });

  it('seeds fresh admin as owner without changing the legacy account', async () => {
    const row = await env.DB.prepare(
      "SELECT id, role, permission_role FROM users WHERE id = ?"
    ).bind('admin').first<{ id: string; role: string; permission_role: string }>();
    expect(row).toEqual({ id: 'admin', role: 'admin', permission_role: 'owner' });
  });

  it('stores course prices in cents', async () => {
    const row = await env.DB.prepare(
      "SELECT price_cents, product_type FROM products WHERE id = 'super'"
    ).first<{ price_cents: number; product_type: string }>();
    expect(row).toEqual({ price_cents: 2900, product_type: 'course' });
  });

  it('seeds membership products with cent prices', async () => {
    const rows = await env.DB.prepare(
      "SELECT id, price_cents, product_type FROM products WHERE product_type = 'membership' ORDER BY id"
    ).all<{ id: string; price_cents: number; product_type: string }>();
    expect(rows.results).toEqual([
      { id: 'svip_monthly', price_cents: 1990, product_type: 'membership' },
      { id: 'vip_monthly', price_cents: 990, product_type: 'membership' }
    ]);
  });
});

describe('0003 migration backfill', () => {
  it('backfills legacy identity, product, and payment claim rows', async () => {
    await applyMigrationsThrough0002();

    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('legacy-admin', 'legacy-admin', 'hash', 'admin', 'active', 1, 1)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, description, created_at, updated_at) VALUES ('super', '超影课程', 29, 'active', 'courses', 1, '', 1, 1)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO payment_claims (id, order_no, user_id, product_id, list_amount_yuan, actual_amount_yuan, paid_at, contact_text, screenshot_key, status, created_at, updated_at) VALUES ('claim-1', 'HY-LEGACY-1', 'legacy-admin', 'super', 29, 20, 1, 'x', 'k', 'pending', 1, 1)"
    ).run();

    await applyMigration0003();

    const admin = await env.DB.prepare(
      "SELECT permission_role, role FROM users WHERE id = 'legacy-admin'"
    ).first<{ permission_role: string; role: string }>();
    const product = await env.DB.prepare(
      "SELECT price_cents, product_type FROM products WHERE id = 'super'"
    ).first<{ price_cents: number; product_type: string }>();
    const claim = await env.DB.prepare(
      "SELECT list_amount_cents, actual_amount_cents FROM payment_claims WHERE id = 'claim-1'"
    ).first<{ list_amount_cents: number; actual_amount_cents: number | null }>();

    expect(admin).toEqual({ permission_role: 'owner', role: 'admin' });
    expect(product).toEqual({ price_cents: 2900, product_type: 'course' });
    expect(claim).toEqual({ list_amount_cents: 2900, actual_amount_cents: 2000 });
  });
});



