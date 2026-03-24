-- PIN-коды (этап 5: авторизация)
CREATE TABLE IF NOT EXISTS user_pins (
  user_id UUID PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  attempts_failed SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OAuth-привязки
CREATE TABLE IF NOT EXISTS user_oauth_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'yandex')),
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON user_oauth_bindings(user_id);

-- Login tokens (Telegram / Max авторизация через бота)
CREATE TABLE IF NOT EXISTS login_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('telegram', 'max')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_status ON login_tokens(status, expires_at) WHERE status = 'pending';
