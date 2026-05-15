-- Admin incident alerts: identity relay topics + channels (defaults all enabled).
INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES (
  'admin_incident_alert_config',
  'admin',
  '{"value":{"topics":{"channel_link":true,"auto_merge_conflict":true,"auto_merge_conflict_anomaly":true,"messenger_phone_bind_blocked":true,"messenger_phone_bind_anomaly":true},"channels":{"telegram":true,"max":true}}}'::jsonb,
  now()
)
ON CONFLICT ("key", "scope") DO NOTHING;
