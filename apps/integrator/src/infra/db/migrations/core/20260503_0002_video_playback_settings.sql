-- Mirror webapp system_settings: phase-04 playback API flag + default delivery strategy.
INSERT INTO system_settings (key, scope, value_json)
VALUES
  ('video_playback_api_enabled', 'admin', '{"value": false}'::jsonb),
  ('video_default_delivery', 'admin', '{"value": "mp4"}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
