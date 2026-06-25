-- User session tracking for the "Active Sessions" UI
-- Run this in Supabase SQL Editor after 006_token_blacklist.sql

CREATE TABLE IF NOT EXISTS user_sessions (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supabase_session_id TEXT        UNIQUE,        -- JWT session_id claim (identifies the Supabase session)
  device_info         TEXT,                      -- User-Agent string
  ip_address          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user     ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_supabase ON user_sessions(supabase_session_id);
