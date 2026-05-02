-- Mirror webapp system_settings key test_account_identifiers (test phones / Telegram / Max IDs).
INSERT INTO system_settings (key, scope, value_json)
VALUES (
  'test_account_identifiers',
  'admin',
  '{"value":{"phones":[],"telegramIds":[],"maxIds":[]}}'::jsonb
)
ON CONFLICT (key, scope) DO NOTHING;
