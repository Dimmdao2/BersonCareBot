-- Mirror webapp system_settings key for VK web login entry URL
INSERT INTO system_settings (key, scope, value_json)
VALUES ('vk_web_login_url', 'admin', '{"value": ""}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
