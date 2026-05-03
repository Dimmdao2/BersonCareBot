-- VIDEO_HLS_DELIVERY phase-10: optional burn-in watermark during HLS transcode (media-worker; default off).
INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES ('video_watermark_enabled', 'admin', '{"value": false}'::jsonb, now())
ON CONFLICT ("key", "scope") DO UPDATE
SET "value_json" = EXCLUDED."value_json",
    "updated_at" = now();
