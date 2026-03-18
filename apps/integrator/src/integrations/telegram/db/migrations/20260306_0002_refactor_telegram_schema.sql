-- 002_refactor_telegram_schema.sql

-- удалить старую subscriptions
DROP TABLE IF EXISTS subscriptions;

-- изменить telegram_users (идемпотентно: переименовать только если chat_id ещё есть)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'chat_id'
  ) THEN
    ALTER TABLE telegram_users RENAME COLUMN chat_id TO telegram_id;
  END IF;
END $$;

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- убрать UNIQUE если был на chat_id (он останется после rename)
-- telegram_id уже UNIQUE

-- создать subscriptions (нормализованная модель)
CREATE TABLE IF NOT EXISTS subscriptions (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id bigint NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  subscription_id bigint NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, subscription_id)
);