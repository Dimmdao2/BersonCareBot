-- Подтверждение email: время верификации + таблица челленджей.
ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS email_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_challenges_user_id ON email_challenges (user_id);
CREATE INDEX IF NOT EXISTS idx_email_challenges_expires_at ON email_challenges (expires_at);

CREATE TABLE IF NOT EXISTS email_send_cooldowns (
  user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, email_normalized)
);
