-- Mirror webapp system_settings key video_hls_pipeline_enabled (worker polls admin scope).
INSERT INTO system_settings (key, scope, value_json)
VALUES (
  'video_hls_pipeline_enabled',
  'admin',
  '{"value": false}'::jsonb
)
ON CONFLICT (key, scope) DO NOTHING;
