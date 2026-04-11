-- Mirror webapp system_settings keys for Google web login + Apple OAuth (admin scope)
INSERT INTO system_settings (key, scope, value_json) VALUES
  ('google_oauth_login_redirect_uri', 'admin', '{"value": ""}'::jsonb),
  ('apple_oauth_client_id', 'admin', '{"value": ""}'::jsonb),
  ('apple_oauth_team_id', 'admin', '{"value": ""}'::jsonb),
  ('apple_oauth_key_id', 'admin', '{"value": ""}'::jsonb),
  ('apple_oauth_private_key', 'admin', '{"value": ""}'::jsonb),
  ('apple_oauth_redirect_uri', 'admin', '{"value": ""}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
