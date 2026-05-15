-- Mirror webapp system_settings key admin_incident_alert_config (TG/Max relay toggles for identity incidents).
INSERT INTO system_settings (key, scope, value_json)
VALUES (
  'admin_incident_alert_config',
  'admin',
  '{"value":{"topics":{"channel_link":true,"auto_merge_conflict":true,"auto_merge_conflict_anomaly":true,"messenger_phone_bind_blocked":true,"messenger_phone_bind_anomaly":true},"channels":{"telegram":true,"max":true}}}'::jsonb
)
ON CONFLICT (key, scope) DO NOTHING;
