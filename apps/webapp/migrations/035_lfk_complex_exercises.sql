-- Pack F: упражнения внутри комплекса пациента (копия из шаблона при назначении).

CREATE TABLE IF NOT EXISTS lfk_complex_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id UUID NOT NULL REFERENCES lfk_complexes(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES lfk_exercises(id),
  sort_order INT NOT NULL DEFAULT 0,
  reps INT,
  sets INT,
  side TEXT CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  max_pain_0_10 INT CHECK (max_pain_0_10 IS NULL OR (max_pain_0_10 >= 0 AND max_pain_0_10 <= 10)),
  comment TEXT,
  UNIQUE (complex_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_lfk_complex_exercises_complex ON lfk_complex_exercises(complex_id, sort_order);
