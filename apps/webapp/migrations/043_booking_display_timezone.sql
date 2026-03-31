-- 043: IANA timezone for booking reminder / lifecycle message text (integrator reads system_settings).
INSERT INTO system_settings (key, scope, value_json) VALUES
  ('booking_display_timezone', 'admin', '{"value": "Europe/Moscow"}')
ON CONFLICT (key, scope) DO NOTHING;
