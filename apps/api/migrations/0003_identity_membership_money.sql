ALTER TABLE users ADD COLUMN permission_role TEXT NOT NULL DEFAULT 'user'
  CHECK (permission_role IN ('user', 'admin', 'owner'));
ALTER TABLE users ADD COLUMN membership_tier TEXT NOT NULL DEFAULT 'normal'
  CHECK (membership_tier IN ('normal', 'vip', 'svip'));
ALTER TABLE users ADD COLUMN membership_expires_at INTEGER;

UPDATE users SET permission_role = CASE WHEN role = 'admin' THEN 'owner' ELSE 'user' END;

ALTER TABLE products ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'course'
  CHECK (product_type IN ('course', 'membership', 'partner_opening', 'digital', 'service', 'other'));
UPDATE products SET price_cents = price_yuan * 100 WHERE price_cents = 0 AND price_yuan > 0;

ALTER TABLE payment_claims ADD COLUMN list_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_claims ADD COLUMN actual_amount_cents INTEGER;
UPDATE payment_claims SET list_amount_cents = list_amount_yuan * 100 WHERE list_amount_cents = 0 AND list_amount_yuan > 0;
UPDATE payment_claims SET actual_amount_cents = actual_amount_yuan * 100 WHERE actual_amount_yuan IS NOT NULL;
