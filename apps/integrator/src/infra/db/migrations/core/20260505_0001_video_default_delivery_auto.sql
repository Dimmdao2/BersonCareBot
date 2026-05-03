-- Mirror webapp: VIDEO_HLS_DELIVERY phase-08 — default delivery `auto` (HLS when ready, else MP4).
INSERT INTO system_settings (key, scope, value_json)
VALUES ('video_default_delivery', 'admin', '{"value": "auto"}'::jsonb)
ON CONFLICT (key, scope) DO UPDATE SET value_json = EXCLUDED.value_json;
