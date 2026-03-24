-- CMS visibility: archive and soft-delete (patient sees only published, non-archived, non-deleted).
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_pages_section_sort ON content_pages(section, sort_order);
