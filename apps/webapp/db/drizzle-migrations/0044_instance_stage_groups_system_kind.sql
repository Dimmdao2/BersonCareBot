ALTER TABLE "treatment_program_instance_stage_groups" ADD COLUMN "system_kind" text;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_groups" ADD CONSTRAINT "treatment_program_instance_stage_groups_system_kind_check" CHECK (system_kind IS NULL OR system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text]));--> statement-breakpoint
