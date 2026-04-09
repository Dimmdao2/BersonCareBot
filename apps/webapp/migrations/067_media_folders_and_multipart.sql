-- Media library folders, multipart upload sessions, 3 GiB max file size.

-- Raise max object size to 3 GiB (was 2 GiB in 044).
ALTER TABLE media_files
  DROP CONSTRAINT IF EXISTS media_files_size_bytes_check;

ALTER TABLE media_files
  ADD CONSTRAINT media_files_size_bytes_check
    CHECK (size_bytes >= 0 AND size_bytes <= 3221225472);

-- Hierarchical folders (library taxonomy only; S3 keys unchanged).
CREATE TABLE IF NOT EXISTS media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES media_folders(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND char_length(name) <= 180),
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(name))) STORED,
  created_by UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_folders_root_name
  ON media_folders (name_normalized)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_folders_child_name
  ON media_folders (parent_id, name_normalized)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_folders_parent_id ON media_folders (parent_id);

ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES media_folders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_media_files_folder_created
  ON media_files (folder_id, created_at DESC)
  WHERE folder_id IS NOT NULL;

-- Multipart upload session (binds media pending row to S3 UploadId).
CREATE TABLE IF NOT EXISTS media_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'initiated',
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
  mime_type TEXT NOT NULL,
  part_size_bytes INT NOT NULL CHECK (part_size_bytes >= 1 AND part_size_bytes <= 536870912),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  aborted_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_upload_sessions_status_check CHECK (
    status IN (
      'initiated',
      'uploading',
      'completing',
      'completed',
      'aborted',
      'expired',
      'failed'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_upload_sessions_one_active_per_media
  ON media_upload_sessions (media_id)
  WHERE status IN ('initiated', 'uploading', 'completing');

CREATE INDEX IF NOT EXISTS idx_media_upload_sessions_expires
  ON media_upload_sessions (expires_at)
  WHERE status IN ('initiated', 'uploading', 'completing');

CREATE INDEX IF NOT EXISTS idx_media_upload_sessions_owner ON media_upload_sessions (owner_user_id);

-- Max folder depth 32 (root = depth 0).
CREATE OR REPLACE FUNCTION media_folders_enforce_depth()
RETURNS TRIGGER AS $$
DECLARE
  d INT := 0;
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  WHILE cur IS NOT NULL AND d < 64 LOOP
    d := d + 1;
    SELECT parent_id INTO cur FROM media_folders WHERE id = cur;
  END LOOP;
  IF d > 32 THEN
    RAISE EXCEPTION 'media_folders: max depth 32 exceeded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_folders_depth_ins ON media_folders;
CREATE TRIGGER trg_media_folders_depth_ins
  BEFORE INSERT ON media_folders
  FOR EACH ROW EXECUTE PROCEDURE media_folders_enforce_depth();

DROP TRIGGER IF EXISTS trg_media_folders_depth_upd ON media_folders;
CREATE TRIGGER trg_media_folders_depth_upd
  BEFORE UPDATE OF parent_id ON media_folders
  FOR EACH ROW
  WHEN (NEW.parent_id IS DISTINCT FROM OLD.parent_id)
  EXECUTE PROCEDURE media_folders_enforce_depth();

-- Prevent cycles: new parent must not be self or any descendant of the row (on UPDATE).
CREATE OR REPLACE FUNCTION media_folders_prevent_cycle()
RETURNS TRIGGER AS $$
DECLARE
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'media_folders: cannot set parent to self';
  END IF;
  cur := NEW.parent_id;
  FOR i IN 1..64 LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'media_folders: cycle detected';
    END IF;
    SELECT parent_id INTO cur FROM media_folders WHERE id = cur;
    EXIT WHEN cur IS NULL;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_folders_cycle_upd ON media_folders;
CREATE TRIGGER trg_media_folders_cycle_upd
  BEFORE UPDATE OF parent_id ON media_folders
  FOR EACH ROW
  WHEN (NEW.parent_id IS DISTINCT FROM OLD.parent_id)
  EXECUTE PROCEDURE media_folders_prevent_cycle();
