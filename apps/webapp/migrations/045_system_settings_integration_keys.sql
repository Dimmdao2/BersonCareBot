-- 045: system_settings — integration keys/tokens/webhook URIs in admin scope.
-- Seeds empty rows; values are auto-filled during deploy by seed-system-settings-from-env.mjs
-- (idempotent, fill-empty-only).
INSERT INTO system_settings (key, scope, value_json) VALUES
  ('integrator_webhook_secret',     'admin', '{"value": ""}'),
  ('integrator_webapp_entry_secret','admin', '{"value": ""}'),
  ('telegram_bot_token',            'admin', '{"value": ""}'),
  ('google_calendar_enabled',       'admin', '{"value": ""}'),
  ('google_calendar_id',            'admin', '{"value": ""}'),
  ('google_client_id',              'admin', '{"value": ""}'),
  ('google_client_secret',          'admin', '{"value": ""}'),
  ('google_redirect_uri',           'admin', '{"value": ""}'),
  ('google_refresh_token',          'admin', '{"value": ""}'),
  ('yandex_oauth_client_id',        'admin', '{"value": ""}'),
  ('yandex_oauth_client_secret',    'admin', '{"value": ""}'),
  ('rubitime_api_key',              'admin', '{"value": ""}'),
  ('rubitime_webhook_token',        'admin', '{"value": ""}'),
  ('rubitime_schedule_mapping',     'admin', '{"value": ""}'),
  ('rubitime_webhook_uri',          'admin', '{"value": ""}'),
  ('max_api_key',                   'admin', '{"value": ""}'),
  ('max_webhook_secret',            'admin', '{"value": ""}'),
  ('max_webhook_uri',               'admin', '{"value": ""}'),
  ('smsc_api_key',                  'admin', '{"value": ""}'),
  ('smsc_webhook_uri',              'admin', '{"value": ""}')
ON CONFLICT (key, scope) DO NOTHING;
