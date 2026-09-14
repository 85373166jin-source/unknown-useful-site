-- Attribute orders to a promo code / contribution and keep immutable earning details.

ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN referrer_user_id TEXT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN contribution_id TEXT REFERENCES contributions(id);
ALTER TABLE orders ADD COLUMN subsite_share_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN contribution_share_bps INTEGER NOT NULL DEFAULT 0;

ALTER TABLE earning_entries ADD COLUMN withdrawal_id TEXT REFERENCES withdrawals(id);
ALTER TABLE earning_entries ADD COLUMN gross_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE earning_entries ADD COLUMN share_bps INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_orders_payment_claim ON orders(payment_claim_id);
CREATE INDEX idx_earning_entries_order_source ON earning_entries(order_id, source);
CREATE UNIQUE INDEX idx_contributions_product_unique
ON contributions(product_id)
WHERE product_id IS NOT NULL;
