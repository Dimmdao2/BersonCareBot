-- Retry metadata for background S3 delete (purge worker).
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS delete_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Enforce known status values (column added in 044; NOT NULL DEFAULT 'ready').
ALTER TABLE media_files
  DROP CONSTRAINT IF EXISTS media_files_status_check;

ALTER TABLE media_files
  ADD CONSTRAINT media_files_status_check
    CHECK (status IN ('ready', 'pending', 'deleting', 'pending_delete'));

CREATE INDEX IF NOT EXISTS idx_media_files_purge_queue
  ON media_files (next_attempt_at ASC NULLS FIRST)
  WHERE status IN ('pending_delete', 'deleting');
