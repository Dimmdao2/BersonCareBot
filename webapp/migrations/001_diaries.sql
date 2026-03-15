-- Diary tables (default schema). Run against webapp DB.
-- symptom_entries: one row per symptom log
-- lfk_sessions: one row per "I exercised" session (optional complex in future)

CREATE TABLE IF NOT EXISTS symptom_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  symptom TEXT NOT NULL,
  severity SMALLINT NOT NULL CHECK (severity >= 1 AND severity <= 5),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symptom_entries_user_id ON symptom_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_symptom_entries_user_recorded ON symptom_entries (user_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS lfk_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  complex_id TEXT,
  complex_title TEXT
);

CREATE INDEX IF NOT EXISTS idx_lfk_sessions_user_id ON lfk_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_lfk_sessions_user_completed ON lfk_sessions (user_id, completed_at DESC);
