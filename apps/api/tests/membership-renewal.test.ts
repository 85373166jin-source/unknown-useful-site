import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { MEMBERSHIP_DAYS, MEMBERSHIP_DAY_MS } from '@site/contracts';
import { buildApplyMembershipPurchaseStatement } from '../src/repositories/users';
import { resetTestDatabase } from './helpers/test-db';

describe('membership renewal concurrency safety', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
  });

  it('does not collapse two same-tier renewal updates into one period', async () => {
    const now = Date.now();
    const existingExpiry = now + 10 * MEMBERSHIP_DAY_MS;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, username, password_hash, role, permission_role, membership_tier, membership_expires_at, status, created_at, updated_at)
         VALUES ('user-1', 'user-1', 'hash', 'user', 'user', 'vip', ?, 'active', ?, ?)`
      ).bind(existingExpiry, now, now),
      env.DB.prepare(
        `INSERT INTO products (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
         VALUES ('vip_monthly', 'VIP 会员', 10, 990, 'membership', 'active', 'memberships', 1, '', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(
        `INSERT INTO payment_claims (id, order_no, user_id, product_id, list_amount_yuan, list_amount_cents, paid_at, contact_text, screenshot_key, status, created_at, updated_at)
         VALUES ('claim-1', 'HY-1', 'user-1', 'vip_monthly', 10, 990, ?, 'x', 'k1', 'pending', ?, ?)`
      ).bind(now, now, now),
      env.DB.prepare(
        `INSERT INTO payment_claims (id, order_no, user_id, product_id, list_amount_yuan, list_amount_cents, paid_at, contact_text, screenshot_key, status, created_at, updated_at)
         VALUES ('claim-2', 'HY-2', 'user-1', 'vip_monthly', 10, 990, ?, 'x', 'k2', 'pending', ?, ?)`
      ).bind(now, now, now)
    ]);

    await buildApplyMembershipPurchaseStatement(env.DB, 'user-1', 'vip', 'HY-1', now).run();
    await buildApplyMembershipPurchaseStatement(env.DB, 'user-1', 'vip', 'HY-2', now).run();

    const row = await env.DB.prepare(
      'SELECT membership_expires_at FROM users WHERE id = ?'
    )
      .bind('user-1')
      .first<{ membership_expires_at: number }>();

    expect(row?.membership_expires_at).toBe(existingExpiry + 2 * MEMBERSHIP_DAYS * MEMBERSHIP_DAY_MS);
  });
});
