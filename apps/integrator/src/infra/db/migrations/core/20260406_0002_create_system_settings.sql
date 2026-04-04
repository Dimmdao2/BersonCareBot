-- Mirror of webapp `system_settings` for integrator DB (separate from webapp DB).
-- No FK to platform_users — integrator stores updated_by as TEXT.
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT        NOT NULL,
  scope       TEXT        NOT NULL DEFAULT 'global',
  value_json  JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT,
  PRIMARY KEY (key, scope),
  CHECK (scope IN ('global', 'doctor', 'admin'))
);

INSERT INTO system_settings (key, scope, value_json) VALUES
  ('app_display_timezone', 'admin', '{"value": "Europe/Moscow"}'::jsonb)
ON CONFLICT DO NOTHING;
