-- Soft-delete for reference_items (separate from is_active archive flag).
ALTER TABLE reference_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN reference_items.deleted_at IS 'Soft delete timestamp; NULL means not deleted.';

CREATE INDEX IF NOT EXISTS reference_items_category_deleted_active_sort_idx
  ON reference_items (category_id, deleted_at, is_active, sort_order);
