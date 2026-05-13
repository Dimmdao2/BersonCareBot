-- VIDEO_HLS: job timing for admin health (avg duration, last-hour counts) + reconcile feature flag.
ALTER TABLE "media_transcode_jobs"
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "finished_at" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_media_transcode_jobs_finished_at"
  ON "media_transcode_jobs" ("finished_at" DESC)
  WHERE "finished_at" IS NOT NULL AND "status" IN ('done', 'failed');

INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES ('video_hls_reconcile_enabled', 'admin', '{"value": false}'::jsonb, now())
ON CONFLICT ("key", "scope") DO NOTHING;
