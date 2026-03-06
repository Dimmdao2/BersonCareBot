CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value_normalized TEXT NOT NULL,
  label TEXT NULL,
  is_primary BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, value_normalized)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id
  ON contacts(user_id);
