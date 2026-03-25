-- Pack F: шаблоны комплексов ЛФК, строки шаблона, назначения пациентам.

CREATE TABLE IF NOT EXISTS lfk_complex_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lfk_complex_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES lfk_complex_templates(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES lfk_exercises(id),
  sort_order INT NOT NULL DEFAULT 0,
  reps INT,
  sets INT,
  side TEXT CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  max_pain_0_10 INT CHECK (max_pain_0_10 IS NULL OR (max_pain_0_10 >= 0 AND max_pain_0_10 <= 10)),
  comment TEXT,
  UNIQUE (template_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_template_exercises_order ON lfk_complex_template_exercises(template_id, sort_order);

CREATE TABLE IF NOT EXISTS patient_lfk_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES platform_users(id),
  template_id UUID NOT NULL REFERENCES lfk_complex_templates(id),
  complex_id UUID REFERENCES lfk_complexes(id),
  assigned_by UUID REFERENCES platform_users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_assignments_patient ON patient_lfk_assignments(patient_user_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_lfk_assign_active_template
  ON patient_lfk_assignments(patient_user_id, template_id)
  WHERE is_active = true;
