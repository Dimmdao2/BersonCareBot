-- Clinical test attempts: submitted_at (patient finished full set), accepted_at/by (doctor checklist MVP-B).
-- Replaces attempt.completed_at with submitted_at; partial unique index on open attempts uses submitted_at IS NULL.

ALTER TABLE "test_attempts" ADD COLUMN "submitted_at" timestamptz;
ALTER TABLE "test_attempts" ADD COLUMN "accepted_at" timestamptz;
ALTER TABLE "test_attempts" ADD COLUMN "accepted_by" uuid;

UPDATE "test_attempts" SET "submitted_at" = "completed_at" WHERE "completed_at" IS NOT NULL;

-- Legacy: пункт был отмечен пациентом при старой логике — зачтём последнюю отправленную попытку как принятую по дате пункта.
UPDATE "test_attempts" AS ta
SET "accepted_at" = si."completed_at"
FROM "treatment_program_instance_stage_items" AS si
WHERE ta."instance_stage_item_id" = si."id"
  AND si."item_type" = 'clinical_test'
  AND si."completed_at" IS NOT NULL
  AND ta."submitted_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "test_attempts" AS ta2
    WHERE ta2."instance_stage_item_id" = ta."instance_stage_item_id"
      AND ta2."patient_user_id" = ta."patient_user_id"
      AND ta2."submitted_at" IS NOT NULL
      AND (
        ta2."submitted_at" > ta."submitted_at"
        OR (ta2."submitted_at" = ta."submitted_at" AND ta2."started_at" > ta."started_at")
      )
  );

ALTER TABLE "test_attempts"
  ADD CONSTRAINT "test_attempts_accepted_by_fkey"
  FOREIGN KEY ("accepted_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;

DROP INDEX IF EXISTS "idx_test_attempts_one_open_per_item_patient";
ALTER TABLE "test_attempts" DROP COLUMN "completed_at";

CREATE UNIQUE INDEX "idx_test_attempts_one_open_per_item_patient"
  ON "test_attempts" ("instance_stage_item_id", "patient_user_id")
  WHERE ("submitted_at" IS NULL);
