-- 038: whitelist IDs in system_settings — admins/doctors managed via admin panel (Pack B2)
-- Seeds empty rows; actual values set by admin via PATCH /api/admin/settings.
-- Primary source of truth: system_settings when non-empty; env is fallback.
INSERT INTO system_settings (key, scope, value_json) VALUES
  ('allowed_telegram_ids',  'admin', '{"value": [], "comment": "Client-only Telegram IDs (whitelist); env ALLOWED_TELEGRAM_IDS is fallback"}'),
  ('allowed_max_ids',       'admin', '{"value": [], "comment": "Client-only Max IDs (whitelist); env ALLOWED_MAX_IDS is fallback"}'),
  ('admin_telegram_ids',    'admin', '{"value": [], "comment": "Admin Telegram IDs; env ADMIN_TELEGRAM_ID is fallback"}'),
  ('doctor_telegram_ids',   'admin', '{"value": [], "comment": "Doctor Telegram IDs; env DOCTOR_TELEGRAM_IDS is fallback"}'),
  ('admin_max_ids',         'admin', '{"value": [], "comment": "Admin Max IDs; env ADMIN_MAX_IDS is fallback"}'),
  ('doctor_max_ids',        'admin', '{"value": [], "comment": "Doctor Max IDs; env DOCTOR_MAX_IDS is fallback"}'),
  ('admin_phones',          'admin', '{"value": [], "comment": "Admin phone numbers; env ADMIN_PHONES is fallback"}'),
  ('doctor_phones',         'admin', '{"value": [], "comment": "Doctor phone numbers; env DOCTOR_PHONES is fallback"}'),
  ('allowed_phones',        'admin', '{"value": [], "comment": "Client-only phones whitelist; env ALLOWED_PHONES is fallback"}')
ON CONFLICT (key, scope) DO NOTHING;
