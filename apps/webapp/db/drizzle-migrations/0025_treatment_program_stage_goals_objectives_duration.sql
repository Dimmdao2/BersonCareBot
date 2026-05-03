ALTER TABLE "treatment_program_template_stages" ADD COLUMN "goals" text;--> statement-breakpoint
ALTER TABLE "treatment_program_template_stages" ADD COLUMN "objectives" text;--> statement-breakpoint
ALTER TABLE "treatment_program_template_stages" ADD COLUMN "expected_duration_days" integer;--> statement-breakpoint
ALTER TABLE "treatment_program_template_stages" ADD COLUMN "expected_duration_text" text;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD COLUMN "goals" text;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD COLUMN "objectives" text;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD COLUMN "expected_duration_days" integer;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD COLUMN "expected_duration_text" text;