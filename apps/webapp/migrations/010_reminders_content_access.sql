-- Stage 7: Reminders + content access projection (product master in webapp).
-- reminder_rules, reminder_occurrence_history, reminder_delivery_events, content_access_grants_webapp.
-- Rows keyed by integrator_* ids for reconciliation and read switching.

-- Reminder rules (projection from user_reminder_rules).
CREATE TABLE IF NOT EXISTS reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_rule_id TEXT NOT NULL UNIQUE,
  platform_user_id UUID NULL REFERENCES platform_users(id) ON DELETE SET NULL,
  integrator_user_id BIGINT NOT NULL,
  category TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_type TEXT NOT NULL DEFAULT 'interval_window',
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  interval_minutes INTEGER NOT NULL,
  window_start_minute INTEGER NOT NULL,
  window_end_minute INTEGER NOT NULL,
  days_mask TEXT NOT NULL DEFAULT '1111111',
  content_mode TEXT NOT NULL DEFAULT 'none',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_rules_integrator_rule_id
  ON reminder_rules (integrator_rule_id);
CREATE INDEX IF NOT EXISTS idx_reminder_rules_integrator_user_id
  ON reminder_rules (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_rules_platform_user_id
  ON reminder_rules (platform_user_id) WHERE platform_user_id IS NOT NULL;

-- Finalized occurrence history (sent/failed only; projection from user_reminder_occurrences).
CREATE TABLE IF NOT EXISTS reminder_occurrence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_occurrence_id TEXT NOT NULL UNIQUE,
  integrator_rule_id TEXT NOT NULL,
  integrator_user_id BIGINT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  delivery_channel TEXT NULL,
  error_code TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_occurrence_history_integrator_occ_id
  ON reminder_occurrence_history (integrator_occurrence_id);
CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_integrator_user_id
  ON reminder_occurrence_history (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_occurred_at
  ON reminder_occurrence_history (occurred_at DESC);

-- Delivery events trail (projection from user_reminder_delivery_logs).
CREATE TABLE IF NOT EXISTS reminder_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_delivery_log_id TEXT NOT NULL UNIQUE,
  integrator_occurrence_id TEXT NOT NULL,
  integrator_rule_id TEXT NOT NULL,
  integrator_user_id BIGINT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_delivery_events_integrator_log_id
  ON reminder_delivery_events (integrator_delivery_log_id);
CREATE INDEX IF NOT EXISTS idx_reminder_delivery_events_integrator_user_id
  ON reminder_delivery_events (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_delivery_events_created_at
  ON reminder_delivery_events (created_at DESC);

-- Content access grants (projection from content_access_grants).
CREATE TABLE IF NOT EXISTS content_access_grants_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_grant_id TEXT NOT NULL UNIQUE,
  platform_user_id UUID NULL REFERENCES platform_users(id) ON DELETE SET NULL,
  integrator_user_id BIGINT NOT NULL,
  content_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_access_grants_webapp_integrator_grant_id
  ON content_access_grants_webapp (integrator_grant_id);
CREATE INDEX IF NOT EXISTS idx_content_access_grants_webapp_integrator_user_id
  ON content_access_grants_webapp (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_content_access_grants_webapp_expires_at
  ON content_access_grants_webapp (expires_at DESC);
