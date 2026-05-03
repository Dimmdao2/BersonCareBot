INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES ('video_hls_new_uploads_auto_transcode', 'admin', '{"value": false}'::jsonb, now())
ON CONFLICT ("key", "scope") DO NOTHING;
