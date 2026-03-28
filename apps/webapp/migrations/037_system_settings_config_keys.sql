-- 037: system_settings — runtime config keys (non-secret, dual-read with env fallback)
-- Добавляем non-secret runtime URI и флаги в system_settings scope=admin.
-- Секреты (HMAC, OAuth-secret, токены) остаются ТОЛЬКО в env.
INSERT INTO system_settings (key, scope, value_json) VALUES
  ('integrator_api_url',       'admin', '{"value": ""}'),
  ('booking_url',              'admin', '{"value": ""}'),
  ('telegram_bot_username',    'admin', '{"value": ""}'),
  ('google_calendar_enabled',  'admin', '{"value": false}'),
  ('google_calendar_id',       'admin', '{"value": ""}'),
  ('yandex_oauth_redirect_uri','admin', '{"value": ""}')
ON CONFLICT (key, scope) DO NOTHING;
