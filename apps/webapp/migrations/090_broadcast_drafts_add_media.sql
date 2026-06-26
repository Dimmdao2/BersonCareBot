-- Add media_url and media_type columns to broadcast_drafts for image attachment draft persistence.
ALTER TABLE broadcast_drafts
  ADD COLUMN IF NOT EXISTS media_url  TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT;
