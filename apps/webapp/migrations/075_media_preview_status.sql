-- Background-generated thumbnails/posters for media library (MinIO/S3).
-- Worker: POST /api/internal/media-preview/process

ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS preview_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS preview_sm_key TEXT,
  ADD COLUMN IF NOT EXISTS preview_md_key TEXT,
  ADD COLUMN IF NOT EXISTS preview_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_next_attempt_at TIMESTAMPTZ;

ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_preview_status_check;
ALTER TABLE media_files
  ADD CONSTRAINT media_files_preview_status_check
    CHECK (preview_status IN ('pending', 'ready', 'failed', 'skipped'));

-- No object to read, or MIME types that do not get visual previews
UPDATE media_files
  SET preview_status = 'skipped'
  WHERE s3_key IS NULL
     OR trim(s3_key) = ''
     OR (mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%');

CREATE INDEX IF NOT EXISTS idx_media_files_preview_status
  ON media_files(preview_status)
  WHERE preview_status = 'pending';
