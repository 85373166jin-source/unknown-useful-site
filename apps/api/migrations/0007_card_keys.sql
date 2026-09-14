-- One-time card keys and order numbers for non-payment unlocks.

CREATE TABLE card_key_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE card_keys (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES card_key_batches(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'disabled')),
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users(id),
  used_at INTEGER,
  order_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_card_keys_hash ON card_keys(code_hash);
CREATE INDEX idx_card_keys_product_status ON card_keys(product_id, status, created_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  source TEXT NOT NULL CHECK (source IN ('payment', 'card_key', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  card_key_id TEXT REFERENCES card_keys(id),
  payment_claim_id TEXT REFERENCES payment_claims(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
