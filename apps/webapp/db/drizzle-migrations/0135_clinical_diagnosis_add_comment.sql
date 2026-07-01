-- 0135: clinical_diagnosis — add optional comment field (task #196 B2.3).
-- Allows doctors to annotate a diagnosis with a short clarification, e.g. "слева, L5-S1".
-- Converted from legacy migration 091_clinical_diagnosis_add_comment.sql.
-- The comment column is already declared in db/schema/patientClinical.ts; this migration
-- brings the DB in sync with the schema.

ALTER TABLE "clinical_diagnosis"
  ADD COLUMN IF NOT EXISTS "comment" text;
