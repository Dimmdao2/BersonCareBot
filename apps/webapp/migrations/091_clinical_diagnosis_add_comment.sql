-- Add optional comment field to clinical_diagnosis for task #196 (B2.3).
-- Allows doctors to annotate a diagnosis with a short clarification, e.g. "слева, L5-S1".
ALTER TABLE clinical_diagnosis
  ADD COLUMN IF NOT EXISTS comment TEXT;
