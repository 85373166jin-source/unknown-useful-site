-- Scope new comments to a single lesson while preserving legacy product comments.

ALTER TABLE comments ADD COLUMN lesson_id TEXT REFERENCES lessons(id);

CREATE INDEX idx_comments_lesson_status_created
ON comments(lesson_id, status, created_at);
