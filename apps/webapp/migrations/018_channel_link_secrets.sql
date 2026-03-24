-- Одноразовые секреты для deep-link привязки мессенджеров (минимум Telegram).
CREATE TABLE IF NOT EXISTS channel_link_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  channel_code TEXT NOT NULL CHECK (channel_code IN ('telegram', 'max', 'vk')),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_link_secrets_user_channel
  ON channel_link_secrets (user_id, channel_code);

CREATE INDEX IF NOT EXISTS idx_channel_link_secrets_expires
  ON channel_link_secrets (expires_at);
