-- VIDEO_HLS_DELIVERY phase-09: presigned GET TTL for private media (playback + progressive redirect).
INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES ('video_presign_ttl_seconds', 'admin', '{"value": 3600}'::jsonb, now())
ON CONFLICT ("key", "scope") DO UPDATE
SET "value_json" = EXCLUDED."value_json",
    "updated_at" = now();
