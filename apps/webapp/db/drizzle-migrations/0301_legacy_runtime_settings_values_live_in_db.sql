-- Ч7-б/в: legacy configAdapter readers no longer substitute caller constants.
-- These are the values that the live production callers previously supplied in code, now stored
-- as initial database data. Existing administrator values always win.

INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
VALUES
  ('platform_user_merge_v2_enabled', 'admin', NULL, '{"value":false}'::jsonb, now()),
  ('video_hls_pipeline_enabled', 'admin', NULL, '{"value":false}'::jsonb, now()),
  ('video_hls_new_uploads_auto_transcode', 'admin', NULL, '{"value":false}'::jsonb, now()),
  ('video_hls_reconcile_enabled', 'admin', NULL, '{"value":false}'::jsonb, now()),
  ('operator_heartbeat_config', 'admin', NULL, '{"value":{"pipeline_delivery":21600,"digest":93600}}'::jsonb, now()),
  ('operator_health_alert_config', 'admin', NULL, '{"value":{"topics":{"critical_enabled":true,"digest_enabled":true,"account_conflicts":true,"support_enabled":true},"digestTime":"09:00","channels":{"critical":{"telegram":true,"max":true,"web_push":true,"sms":true,"email":true},"digest":{"telegram":true,"max":true,"web_push":true,"sms":true,"email":true},"account_conflicts":{"telegram":true,"max":true,"web_push":true,"sms":true,"email":true},"support":{"telegram":true,"max":true,"web_push":true,"sms":true,"email":true}},"locks":{"topics":{"critical_enabled":true},"channels":{"critical":{"telegram":true,"max":true,"web_push":true,"sms":true,"email":true}}}}}'::jsonb, now()),
  ('admin_incident_alert_config', 'admin', NULL, '{"value":{"topics":{"channel_link":true,"auto_merge_conflict":true,"auto_merge_conflict_anomaly":true,"messenger_phone_bind_blocked":true,"messenger_phone_bind_anomaly":true,"system_health_db_guard":false},"channels":{"telegram":true,"max":true,"web_push":true}}}'::jsonb, now()),
  ('operator_health_projection_thresholds', 'admin', NULL, '{"value":{"retriesDebounceMinutes":15,"stalePendingDebounceMinutes":15,"oldestPendingStaleMinutes":30}}'::jsonb, now()),
  ('admin_telegram_ids', 'admin', NULL, '{"value":[]}'::jsonb, now()),
  ('admin_max_ids', 'admin', NULL, '{"value":[]}'::jsonb, now()),
  ('doctor_telegram_ids', 'admin', NULL, '{"value":[]}'::jsonb, now()),
  ('doctor_max_ids', 'admin', NULL, '{"value":[]}'::jsonb, now()),
  ('smtp_outbound', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('smsc_api_key', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('max_bot_api_key', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('yandex_oauth_client_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('yandex_oauth_client_secret', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('yandex_oauth_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('google_client_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('google_client_secret', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('google_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('platform_integration_availability', 'admin', NULL, '{"value":{"version":1,"integrations":{"telegram":true,"max":true,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}}'::jsonb, now()),
  ('google_oauth_login_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('apple_oauth_client_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('apple_oauth_team_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('apple_oauth_key_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('apple_oauth_private_key', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('apple_oauth_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now())
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

-- The only live exact-clinic legacy reader is Google Calendar's refresh token. An empty token is
-- the previous explicit "not connected" value; a missing row or failed read is now an error.
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
SELECT 'google_refresh_token', 'admin', organization.id, '{"value":""}'::jsonb, now()
FROM public.be_organizations AS organization
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO NOTHING;
