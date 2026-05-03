-- Mirror webapp: VIDEO_HLS_DELIVERY phase-10 — optional HLS burn-in watermark (default off).
INSERT INTO system_settings (key, scope, value_json)
VALUES ('video_watermark_enabled', 'admin', '{"value": false}'::jsonb)
ON CONFLICT (key, scope) DO UPDATE SET value_json = EXCLUDED.value_json;
