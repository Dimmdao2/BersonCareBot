-- Pack F: справочник упражнений ЛФК + медиа.

CREATE TABLE IF NOT EXISTS lfk_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  region_ref_id UUID REFERENCES reference_items(id),
  load_type TEXT CHECK (load_type IN ('strength', 'stretch', 'balance', 'cardio', 'other')),
  difficulty_1_10 INT CHECK (difficulty_1_10 IS NULL OR (difficulty_1_10 >= 1 AND difficulty_1_10 <= 10)),
  contraindications TEXT,
  tags TEXT[],
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfk_exercises_archived ON lfk_exercises(is_archived);
CREATE INDEX IF NOT EXISTS idx_lfk_exercises_region ON lfk_exercises(region_ref_id) WHERE NOT is_archived;

CREATE TABLE IF NOT EXISTS lfk_exercise_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES lfk_exercises(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'gif')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfk_exercise_media_exercise ON lfk_exercise_media(exercise_id, sort_order);
