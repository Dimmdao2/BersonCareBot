-- Source pixel dimensions for library media (filled by preview worker; used by UI instead of client-side probes).
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS source_width  INT,
  ADD COLUMN IF NOT EXISTS source_height INT;
