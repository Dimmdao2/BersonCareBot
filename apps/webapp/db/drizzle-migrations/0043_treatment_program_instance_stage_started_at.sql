-- PATIENT_TREATMENT_PROGRAMS_POLISH stage A: stage first `in_progress` timestamp (control-date enabler).
ALTER TABLE "treatment_program_instance_stages" ADD COLUMN "started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "treatment_program_instance_stages" AS s
SET "started_at" = inst."created_at"
FROM "treatment_program_instances" AS inst
WHERE inst."id" = s."instance_id"
  AND s."status" = 'in_progress'
  AND s."started_at" IS NULL;
