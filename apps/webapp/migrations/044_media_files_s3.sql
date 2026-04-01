ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS s3_key TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE media_files
  DROP CONSTRAINT IF EXISTS media_files_size_bytes_check;

ALTER TABLE media_files
  ADD CONSTRAINT media_files_size_bytes_check
    CHECK (size_bytes >= 0 AND size_bytes <= 2147483648);
