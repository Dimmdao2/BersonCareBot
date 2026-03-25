-- 031: system_settings — глобальные настройки платформы (Settings/Admin Stage 14)
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT        NOT NULL,
  scope       TEXT        NOT NULL DEFAULT 'global',
  value_json  JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID        REFERENCES platform_users(id),
  PRIMARY KEY (key, scope),
  CHECK (scope IN ('global', 'doctor', 'admin'))
);

INSERT INTO system_settings (key, scope, value_json) VALUES
  ('patient_label',                  'doctor', '{"value": "пациент"}'),
  ('sms_fallback_enabled',           'admin',  '{"value": true}'),
  ('debug_forward_to_admin',         'admin',  '{"value": false}'),
  ('dev_mode',                       'admin',  '{"value": false}'),
  ('important_fallback_delay_minutes','admin',  '{"value": 60}')
ON CONFLICT DO NOTHING;
