-- 0138: clinical visit details for client card feedback.
-- Adds free-text complaint history on visits and per-symptom description.

ALTER TABLE "clinical_visit"
  ADD COLUMN IF NOT EXISTS "anamnesis_text" text;
--> statement-breakpoint

ALTER TABLE "clinical_complaint"
  ADD COLUMN IF NOT EXISTS "description" text;
