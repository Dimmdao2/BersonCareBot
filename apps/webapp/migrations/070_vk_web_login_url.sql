-- Публичная ссылка «Вход с VK ID» на экране «Другие способы» (OAuth VK, vk.me, мини-приложение — задаёт админ).
INSERT INTO system_settings (key, scope, value_json)
VALUES ('vk_web_login_url', 'admin', '{"value": ""}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
