-- Requeue video rows missing md poster preview (worker now writes preview_md_key for video/heic).
UPDATE media_files
SET
  preview_status = 'pending',
  preview_attempts = 0,
  preview_next_attempt_at = NULL
WHERE preview_status = 'ready'
  AND mime_type LIKE 'video/%'
  AND (preview_md_key IS NULL OR length(trim(preview_md_key)) = 0)
  AND s3_key IS NOT NULL
  AND length(trim(s3_key)) > 0;
