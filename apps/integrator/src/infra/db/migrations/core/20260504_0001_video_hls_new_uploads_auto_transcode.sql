-- Mirror webapp system_settings: phase-06 auto-enqueue transcode for new video uploads.
INSERT INTO system_settings (key, scope, value_json)
VALUES
  ('video_hls_new_uploads_auto_transcode', 'admin', '{"value": false}'::jsonb)
ON CONFLICT (key, scope) DO NOTHING;
