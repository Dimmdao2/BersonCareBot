-- Canonical platform users (webapp-owned). One row per person; bindings link to messengers.
CREATE TABLE IF NOT EXISTS platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'doctor', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_phone ON platform_users (phone_normalized) WHERE phone_normalized IS NOT NULL;

-- Channel bindings: which messenger identities are linked to a platform user.
CREATE TABLE IF NOT EXISTS user_channel_bindings (
  user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  channel_code TEXT NOT NULL CHECK (channel_code IN ('telegram', 'max', 'vk')),
  external_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_code, external_id)
);

CREATE INDEX IF NOT EXISTS idx_user_channel_bindings_user_id ON user_channel_bindings (user_id);
CREATE INDEX IF NOT EXISTS idx_user_channel_bindings_lookup ON user_channel_bindings (channel_code, external_id);
