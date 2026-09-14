-- Store the KV object key for each user's optional profile avatar.

ALTER TABLE users ADD COLUMN avatar_key TEXT;
