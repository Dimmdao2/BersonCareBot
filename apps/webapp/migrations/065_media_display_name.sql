ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS display_name TEXT;
