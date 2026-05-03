-- Mirror webapp: VIDEO_HLS_DELIVERY phase-09 — presign TTL seconds (default 1h).
INSERT INTO system_settings (key, scope, value_json)
VALUES ('video_presign_ttl_seconds', 'admin', '{"value": 3600}'::jsonb)
ON CONFLICT (key, scope) DO UPDATE SET value_json = EXCLUDED.value_json;
