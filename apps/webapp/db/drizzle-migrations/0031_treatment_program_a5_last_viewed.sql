-- A5 PROGRAM_PATIENT_SHAPE: item timestamps + patient «plan opened» marker
ALTER TABLE "treatment_program_instance_stage_items" ADD COLUMN "created_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "treatment_program_instance_stage_items" AS i
SET "created_at" = inst."created_at"
FROM "treatment_program_instance_stages" AS s
JOIN "treatment_program_instances" AS inst ON inst."id" = s."instance_id"
WHERE s."id" = i."stage_id" AND i."created_at" IS NULL;
--> statement-breakpoint
UPDATE "treatment_program_instance_stage_items" SET "created_at" = now() WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD COLUMN "last_viewed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "treatment_program_instance_stage_items" SET "last_viewed_at" = "created_at" WHERE "last_viewed_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "treatment_program_instances" ADD COLUMN "patient_plan_last_opened_at" timestamp with time zone;
