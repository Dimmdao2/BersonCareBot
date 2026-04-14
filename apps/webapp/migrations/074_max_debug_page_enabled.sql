-- Админ-флаг: показывать ли страницу диагностики MAX Mini App (`/max-debug`). По умолчанию выкл.
INSERT INTO system_settings (key, scope, value_json)
VALUES ('max_debug_page_enabled', 'admin', '{"value": false}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
