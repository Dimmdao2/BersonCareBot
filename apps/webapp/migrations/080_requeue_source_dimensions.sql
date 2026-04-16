-- Requeue rows that already have previews but no stored source dimensions so the preview worker
-- backfills source_width/source_height (see docs/MEDIA_PREVIEW_PIPELINE.md). UI may show pending until processed.
UPDATE media_files
SET
  preview_status = 'pending',
  preview_attempts = 0,
  preview_next_attempt_at = NULL
WHERE preview_status = 'ready'
  AND (source_width IS NULL OR source_height IS NULL)
  AND s3_key IS NOT NULL
  AND length(trim(s3_key)) > 0;
