CREATE TABLE contribution_permissions (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  zip_unlocked_at INTEGER NOT NULL
);

CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'zip')),
  source TEXT NOT NULL CHECK (source IN ('upload', 'link')),
  file_key TEXT,
  external_url TEXT,
  extraction_code TEXT,
  requested_share_bps INTEGER NOT NULL CHECK (requested_share_bps BETWEEN 0 AND 10000),
  approved_share_bps INTEGER CHECK (approved_share_bps BETWEEN 0 AND 10000),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  product_id TEXT REFERENCES products(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_contributions_user_created ON contributions(user_id, created_at DESC);
CREATE INDEX idx_contributions_status ON contributions(status, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE earning_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL CHECK (source IN ('subsite', 'contribution')),
  order_id TEXT REFERENCES orders(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'cancelled', 'frozen', 'withdrawn')),
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_earning_entries_user_status ON earning_entries(user_id, status, created_at DESC);

CREATE TABLE withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  net_cents INTEGER NOT NULL CHECK (net_cents >= 0),
  method TEXT NOT NULL CHECK (method IN ('wechat', 'alipay')),
  account TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_withdrawals_user_status ON withdrawals(user_id, status, created_at DESC);
