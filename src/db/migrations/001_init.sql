-- 1️⃣ Таблица users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2️⃣ Таблица mailings
CREATE TABLE IF NOT EXISTS mailings (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3️⃣ Таблица user_subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailing_id BIGINT NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (user_id, mailing_id)
);

-- 4️⃣ Индексы
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_mailing_id ON user_subscriptions(mailing_id);


-- 6️⃣ Лог рассылок
CREATE TABLE IF NOT EXISTS mailing_logs (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailing_id BIGINT NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error TEXT,
  PRIMARY KEY (user_id, mailing_id)
);

INSERT INTO mailings (code, title)
VALUES
  ('spb', 'Новости Санкт-Петербург'),
  ('msk', 'Новости Москва')
ON CONFLICT (code) DO NOTHING;
