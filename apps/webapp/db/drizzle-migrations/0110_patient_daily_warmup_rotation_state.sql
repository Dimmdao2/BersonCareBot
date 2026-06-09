ALTER TABLE "patient_daily_warmup_presentations" ADD COLUMN IF NOT EXISTS "last_rotation_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "patient_daily_warmup_presentations" ADD COLUMN IF NOT EXISTS "skip_next_scheduled_rotation" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "patient_daily_warmup_presentations"
SET "last_rotation_at" = COALESCE("updated_at", now())
WHERE "last_rotation_at" IS NULL;
