-- Initial D1 schema for the unknown-useful-site Worker.
-- All timestamps are integer Unix milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  phone_hmac TEXT UNIQUE,
  phone_mask TEXT,
  phone_bound_at INTEGER,
  phone_verified_at INTEGER,
  email_hmac TEXT UNIQUE,
  email_mask TEXT,
  email_bound_at INTEGER,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price_yuan INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'presale', 'coming_soon')),
  category_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status ON products(status);

CREATE TABLE payment_claims (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  list_amount_yuan INTEGER NOT NULL,
  actual_amount_yuan INTEGER,
  paid_at INTEGER NOT NULL,
  contact_text TEXT NOT NULL,
  screenshot_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_payment_claims_user_id ON payment_claims(user_id);
CREATE INDEX idx_payment_claims_product_id ON payment_claims(product_id);
CREATE INDEX idx_payment_claims_status ON payment_claims(status);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'coming_soon')),
  course_password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id),
  title TEXT NOT NULL,
  media_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_lessons_series_id_sort_order ON lessons(series_id, sort_order);

CREATE TABLE product_components (
  parent_product_id TEXT NOT NULL REFERENCES products(id),
  child_product_id TEXT NOT NULL REFERENCES products(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (parent_product_id, child_product_id)
);

CREATE INDEX idx_product_components_child_product_id ON product_components(child_product_id);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source TEXT NOT NULL CHECK (source IN ('course_password', 'order', 'admin')),
  order_id TEXT REFERENCES payment_claims(id),
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX one_active_entitlement
ON entitlements(user_id, product_id) WHERE status = 'active';

CREATE INDEX idx_entitlements_user_id ON entitlements(user_id);
CREATE INDEX idx_entitlements_product_id ON entitlements(product_id);
CREATE INDEX idx_entitlements_order_id ON entitlements(order_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_summary TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE UNIQUE INDEX one_active_session
ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE watch_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  position_seconds REAL NOT NULL DEFAULT 0,
  duration_seconds REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX idx_watch_progress_lesson_id ON watch_progress(lesson_id);

CREATE TABLE login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ip_hash TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  datacenter TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('none', 'warn', 'strong_warn')),
  at INTEGER NOT NULL
);

CREATE INDEX idx_login_events_user_id_at ON login_events(user_id, at);

CREATE TABLE rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
