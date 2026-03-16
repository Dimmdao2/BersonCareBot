-- Symptom diary: trackings (user-managed symptoms) + entries (0-10, instant/daily, source).
-- Replaces flat symptom_entries from 001_diaries.sql.

-- New table: user-defined symptom trackings
CREATE TABLE IF NOT EXISTS symptom_trackings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  symptom_key TEXT,
  symptom_title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_symptom_trackings_user_active ON symptom_trackings (user_id, is_active);

-- Replace symptom_entries with new structure
DROP TABLE IF EXISTS symptom_entries;

CREATE TABLE symptom_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tracking_id UUID NOT NULL REFERENCES symptom_trackings(id) ON DELETE CASCADE,
  value_0_10 SMALLINT NOT NULL CHECK (value_0_10 >= 0 AND value_0_10 <= 10),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('instant', 'daily')),
  recorded_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('bot', 'webapp', 'import')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_symptom_entries_tracking_recorded ON symptom_entries (tracking_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_symptom_entries_user_type_recorded ON symptom_entries (user_id, entry_type, recorded_at DESC);
