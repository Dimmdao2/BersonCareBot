-- Stage 6: lfk_sessions extended metrics; lfk_complexes links to symptom + references.

ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT;
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS difficulty_0_10 SMALLINT CHECK (difficulty_0_10 IS NULL OR (difficulty_0_10 >= 0 AND difficulty_0_10 <= 10));
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS pain_0_10 SMALLINT CHECK (pain_0_10 IS NULL OR (pain_0_10 >= 0 AND pain_0_10 <= 10));
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

UPDATE lfk_sessions SET recorded_at = completed_at WHERE recorded_at IS NULL;

ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS symptom_tracking_id UUID REFERENCES symptom_trackings(id);
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS region_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IS NULL OR side IN ('left', 'right', 'both'));
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS diagnosis_ref_id UUID REFERENCES reference_items(id);
