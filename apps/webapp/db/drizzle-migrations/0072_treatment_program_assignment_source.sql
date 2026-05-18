-- treatment_program_instances: assignment_source + one active row per patient (partial unique)
ALTER TABLE "treatment_program_instances" ADD COLUMN IF NOT EXISTS "assignment_source" text;

UPDATE "treatment_program_instances"
SET "assignment_source" = CASE
  WHEN "assigned_by" IS NOT NULL THEN 'doctor'
  ELSE 'course'
END
WHERE "assignment_source" IS NULL;

ALTER TABLE "treatment_program_instances" ALTER COLUMN "assignment_source" SET NOT NULL;

ALTER TABLE "treatment_program_instances" DROP CONSTRAINT IF EXISTS "treatment_program_instances_assignment_source_check";
ALTER TABLE "treatment_program_instances" ADD CONSTRAINT "treatment_program_instances_assignment_source_check"
  CHECK ("assignment_source" = ANY (ARRAY['doctor'::text, 'promo'::text, 'course'::text]));

-- If historical data had multiple active rows, keep the newest by updated_at and complete the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY patient_user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM treatment_program_instances
  WHERE status = 'active'
)
UPDATE treatment_program_instances t
SET status = 'completed', updated_at = now()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_treatment_program_instances_one_active_per_patient"
  ON "treatment_program_instances" ("patient_user_id")
  WHERE status = 'active'::text;
