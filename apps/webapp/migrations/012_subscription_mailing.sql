-- Stage 11: Subscription/mailing product and audit (projection from integrator).
-- mailing_topics: product-level категории подписок.
-- user_subscriptions: выбор пользователя по topic.
-- mailing_logs_webapp: audit рассылок (projection из integrator.mailing_logs).

CREATE TABLE IF NOT EXISTS mailing_topics_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_topic_id BIGINT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailing_topics_webapp_integrator_id
  ON mailing_topics_webapp (integrator_topic_id);
CREATE INDEX IF NOT EXISTS idx_mailing_topics_webapp_key ON mailing_topics_webapp (key);

CREATE TABLE IF NOT EXISTS user_subscriptions_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_user_id BIGINT NOT NULL,
  integrator_topic_id BIGINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integrator_user_id, integrator_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_webapp_user
  ON user_subscriptions_webapp (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_webapp_topic
  ON user_subscriptions_webapp (integrator_topic_id);

CREATE TABLE IF NOT EXISTS mailing_logs_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_user_id BIGINT NOT NULL,
  integrator_mailing_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integrator_user_id, integrator_mailing_id)
);

CREATE INDEX IF NOT EXISTS idx_mailing_logs_webapp_user ON mailing_logs_webapp (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_mailing_logs_webapp_mailing ON mailing_logs_webapp (integrator_mailing_id);
