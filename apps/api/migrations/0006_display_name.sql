-- Separate the login account from the public display name.

ALTER TABLE users ADD COLUMN display_name TEXT;

UPDATE users
SET display_name = username
WHERE display_name IS NULL OR TRIM(display_name) = '';

CREATE UNIQUE INDEX idx_users_display_name_nocase
ON users(display_name COLLATE NOCASE);
