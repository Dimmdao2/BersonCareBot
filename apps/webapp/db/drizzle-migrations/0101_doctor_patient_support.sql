-- Phase 1: manual «На сопровождении» + per-patient comment/media overrides.

CREATE TABLE IF NOT EXISTS "doctor_patient_support" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "on_support" boolean DEFAULT false NOT NULL,
  "comments_enabled" boolean,
  "media_enabled" boolean,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid
);

ALTER TABLE "doctor_patient_support" ADD CONSTRAINT "doctor_patient_support_patient_user_id_fkey"
  FOREIGN KEY ("patient_user_id") REFERENCES "platform_users"("id") ON DELETE cascade;

ALTER TABLE "doctor_patient_support" ADD CONSTRAINT "doctor_patient_support_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "platform_users"("id") ON DELETE set null;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_doctor_patient_support_patient"
  ON "doctor_patient_support" ("patient_user_id");

CREATE INDEX IF NOT EXISTS "idx_doctor_patient_support_on_support"
  ON "doctor_patient_support" ("on_support");

-- Preserve current «На сопровождении» semantics: active doctor-assigned program => on_support.
INSERT INTO "doctor_patient_support" ("patient_user_id", "on_support", "comments_enabled", "media_enabled", "updated_at")
SELECT DISTINCT tpi.patient_user_id, true, NULL, NULL, now()
FROM "treatment_program_instances" tpi
INNER JOIN "platform_users" pu ON pu.id = tpi.patient_user_id
WHERE tpi.status = 'active'
  AND tpi.assignment_source = 'doctor'
  AND pu.role = 'client'
  AND pu.merged_into_id IS NULL
  AND COALESCE(pu.is_archived, false) = false
ON CONFLICT ("patient_user_id") DO NOTHING;
