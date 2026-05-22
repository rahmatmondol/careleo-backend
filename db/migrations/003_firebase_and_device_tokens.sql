-- Add Firebase identity support and device tokens for push notifications

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(191),
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'password';

CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique ON users(firebase_uid);

-- device_tokens table
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL,
  app_version VARCHAR(40),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_fcm_token_unique ON device_tokens(fcm_token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_is_active ON device_tokens(is_active);

DROP TRIGGER IF EXISTS trg_device_tokens_set_updated_at ON device_tokens;
CREATE TRIGGER trg_device_tokens_set_updated_at
BEFORE UPDATE ON device_tokens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
