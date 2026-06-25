-- Token blacklist for immediate JWT invalidation on logout
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS token_blacklist (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash  TEXT        NOT NULL UNIQUE,
  user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_hash    ON token_blacklist(token_hash);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

-- Optional: run this periodically via pg_cron or a scheduled job
-- DELETE FROM token_blacklist WHERE expires_at < NOW();
