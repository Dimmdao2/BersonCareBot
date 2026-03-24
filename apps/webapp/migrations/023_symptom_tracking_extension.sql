-- Stage 6: symptom_trackings — reference links, side, diagnosis, soft-delete timestamp.

ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS symptom_type_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS region_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IS NULL OR side IN ('left', 'right', 'both'));
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS diagnosis_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS stage_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_symptom_trackings_deleted ON symptom_trackings (user_id) WHERE deleted_at IS NOT NULL;
