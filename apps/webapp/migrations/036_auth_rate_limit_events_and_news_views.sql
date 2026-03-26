-- Persisted auth rate-limit buckets and unique patient-news views.
CREATE TABLE IF NOT EXISTS auth_rate_limit_events (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_events_scope_key_time
  ON auth_rate_limit_events (scope, key, occurred_at);

CREATE TABLE IF NOT EXISTS news_item_views (
  news_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (news_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_news_item_views_news_id ON news_item_views (news_id);
