-- Requeue media previews skipped by legacy 200 MiB preview cap.
UPDATE media_files
SET preview_status = 'pending',
    preview_attempts = 0,
    preview_next_attempt_at = NULL
WHERE preview_status = 'skipped'
  AND preview_sm_key IS NULL
  AND (
    (mime_type LIKE 'video/%' AND size_bytes > 209715200)
    OR (mime_type IN ('image/heic', 'image/heif') AND size_bytes > 209715200)
  );
