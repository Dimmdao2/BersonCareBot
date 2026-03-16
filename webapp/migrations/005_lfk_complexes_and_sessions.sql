-- LFK diary: complexes (user-managed) + sessions (completed_at, source).
-- Replaces flat lfk_sessions from 001_diaries.sql.

CREATE TABLE IF NOT EXISTS lfk_complexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'assigned_by_specialist')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfk_complexes_user_active ON lfk_complexes (user_id, is_active);

DROP TABLE IF EXISTS lfk_sessions;

CREATE TABLE lfk_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  complex_id UUID NOT NULL REFERENCES lfk_complexes(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('bot', 'webapp')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfk_sessions_user_completed ON lfk_sessions (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lfk_sessions_complex_completed ON lfk_sessions (complex_id, completed_at DESC);
