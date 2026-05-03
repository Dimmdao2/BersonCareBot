INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES
  ('video_playback_api_enabled', 'admin', '{"value": false}'::jsonb, now()),
  ('video_default_delivery', 'admin', '{"value": "mp4"}'::jsonb, now())
ON CONFLICT ("key", "scope") DO NOTHING;
