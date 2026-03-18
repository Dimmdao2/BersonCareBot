-- Channel delivery preferences per user. Linked status is derived from session bindings.
CREATE TABLE IF NOT EXISTS user_channel_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  channel_code TEXT NOT NULL CHECK (channel_code IN ('telegram', 'max', 'vk')),
  is_enabled_for_messages BOOLEAN NOT NULL DEFAULT true,
  is_enabled_for_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_code)
);

CREATE INDEX IF NOT EXISTS idx_user_channel_preferences_user_id ON user_channel_preferences (user_id);
