-- Four sub-site tiers with fixed revenue shares.

INSERT INTO products
  (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
VALUES
  ('partner_basic', '基础分站', 0, 1, 'partner_opening', 'active', 'memberships', 11, '用户收益 50%，站长 50%', 0, 0),
  ('partner_advanced', '高级分站', 9, 990, 'partner_opening', 'active', 'memberships', 12, '用户收益 90%，站长 10%', 0, 0),
  ('partner_top', '顶级分站', 10, 1000, 'partner_opening', 'active', 'memberships', 13, '用户收益 100%', 0, 0)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  price_yuan = excluded.price_yuan,
  price_cents = excluded.price_cents,
  product_type = excluded.product_type,
  status = excluded.status,
  category_id = excluded.category_id,
  sort_order = excluded.sort_order,
  description = excluded.description,
  updated_at = excluded.updated_at;

CREATE TABLE subsites (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  tier TEXT NOT NULL CHECK (tier IN ('free', 'basic', 'advanced', 'top')),
  promo_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_subsites_promo_code ON subsites(promo_code);
