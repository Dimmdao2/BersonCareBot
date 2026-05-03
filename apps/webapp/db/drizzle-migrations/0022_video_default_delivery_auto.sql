-- VIDEO_HLS_DELIVERY phase-08: prefer HLS when asset is ready (`auto`), progressive MP4 otherwise.
INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES ('video_default_delivery', 'admin', '{"value": "auto"}'::jsonb, now())
ON CONFLICT ("key", "scope") DO UPDATE
SET "value_json" = EXCLUDED."value_json",
    "updated_at" = now();
