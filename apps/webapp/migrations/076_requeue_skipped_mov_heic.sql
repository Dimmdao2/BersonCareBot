-- Requeue skipped MOV/HEIC media previews after ffmpeg/runtime fixes.
UPDATE media_files
SET preview_status = 'pending',
    preview_attempts = 0,
    preview_next_attempt_at = NULL
WHERE preview_status = 'skipped'
  AND preview_sm_key IS NULL
  AND mime_type IN ('video/quicktime', 'image/heic', 'image/heif');
