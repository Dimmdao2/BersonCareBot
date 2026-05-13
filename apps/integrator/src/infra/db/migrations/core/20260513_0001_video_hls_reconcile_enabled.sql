-- Mirror webapp system_settings: periodic internal reconcile enqueue for legacy videos.
INSERT INTO system_settings (key, scope, value_json)
VALUES ('video_hls_reconcile_enabled', 'admin', '{"value": false}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
