-- Plain-text product comments, moderation state, and SVIP author-only cleanup.

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'public', 'rejected', 'author_only')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  rejection_reason TEXT,
  visible_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_comments_product_status_created ON comments(product_id, status, created_at);
CREATE INDEX idx_comments_user_created ON comments(user_id, created_at);
CREATE INDEX idx_comments_visible_until ON comments(visible_until) WHERE status = 'author_only';
