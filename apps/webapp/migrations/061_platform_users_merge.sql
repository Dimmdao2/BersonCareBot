-- Logical merge: merged_into_id + DEFERRABLE UNIQUE on strong identifiers for merge transactions.

-- Phone unique constraint (nullable allowed; multiple NULLs OK in PostgreSQL)
ALTER TABLE platform_users
  DROP CONSTRAINT IF EXISTS platform_users_phone_normalized_key;
ALTER TABLE platform_users
  ADD CONSTRAINT platform_users_phone_normalized_key
  UNIQUE (phone_normalized)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE platform_users
  DROP CONSTRAINT IF EXISTS platform_users_integrator_user_id_key;
ALTER TABLE platform_users
  ADD CONSTRAINT platform_users_integrator_user_id_key
  UNIQUE (integrator_user_id)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS merged_into_id UUID
    REFERENCES platform_users(id) ON DELETE SET NULL;

ALTER TABLE platform_users
  DROP CONSTRAINT IF EXISTS platform_users_no_self_merge;
ALTER TABLE platform_users
  ADD CONSTRAINT platform_users_no_self_merge
  CHECK (merged_into_id IS NULL OR merged_into_id <> id);

CREATE INDEX IF NOT EXISTS idx_platform_users_merged_into
  ON platform_users (merged_into_id)
  WHERE merged_into_id IS NOT NULL;
