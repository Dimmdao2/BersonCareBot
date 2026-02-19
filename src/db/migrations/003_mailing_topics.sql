-- 003_mailing_topics.sql
CREATE TABLE IF NOT EXISTS mailing_topics (
  id SERIAL PRIMARY KEY,
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailing_topics_active ON mailing_topics(is_active);
