-- 089: broadcast drafts (one draft per doctor, last-write-wins)
CREATE TABLE IF NOT EXISTS broadcast_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_user_id  UUID        NOT NULL UNIQUE,
  category        TEXT,
  audience        TEXT,
  channels        JSONB       NOT NULL DEFAULT '[]',
  title           TEXT        NOT NULL DEFAULT '',
  body            TEXT        NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- doctor_user_id is UNIQUE, so PostgreSQL already maintains a btree index on it
-- usable for the per-doctor lookup/upsert; no extra index needed.
