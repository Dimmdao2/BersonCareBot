CREATE TABLE IF NOT EXISTS user_reminder_rules (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_type TEXT NOT NULL DEFAULT 'interval_window',
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  interval_minutes INTEGER NOT NULL,
  window_start_minute INTEGER NOT NULL,
  window_end_minute INTEGER NOT NULL,
  days_mask TEXT NOT NULL DEFAULT '1111111',
  content_mode TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reminder_rules_user_category_uniq UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS user_reminder_rules_enabled_idx
  ON user_reminder_rules(is_enabled, category);

CREATE TABLE IF NOT EXISTS user_reminder_occurrences (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES user_reminder_rules(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL UNIQUE,
  planned_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  queued_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  delivery_channel TEXT NULL,
  delivery_job_id TEXT NULL,
  error_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_reminder_occurrences_due_idx
  ON user_reminder_occurrences(status, planned_at);

CREATE TABLE IF NOT EXISTS user_reminder_delivery_logs (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES user_reminder_occurrences(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_reminder_delivery_logs_occurrence_idx
  ON user_reminder_delivery_logs(occurrence_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_access_grants (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_access_grants_user_expires_idx
  ON content_access_grants(user_id, expires_at DESC);
