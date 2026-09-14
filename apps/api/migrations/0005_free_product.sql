-- Add the legacy database-backed free resource product for catalog compatibility.
-- Idempotent: re-applying refreshes the row instead of duplicating it.

INSERT INTO products
  (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at)
VALUES
  (
    'free',
    '免费资源专区',
    0,
    0,
    'other',
    'active',
    'free',
    6,
    '免费工具与学习资料整理中',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  )
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
