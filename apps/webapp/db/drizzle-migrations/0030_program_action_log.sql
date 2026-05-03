CREATE TABLE "program_action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"instance_stage_item_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"session_id" uuid,
	"action_type" text NOT NULL,
	"payload" jsonb,
	"note" text,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_action_log" ADD CONSTRAINT "program_action_log_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."treatment_program_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_action_log" ADD CONSTRAINT "program_action_log_instance_stage_item_id_fkey" FOREIGN KEY ("instance_stage_item_id") REFERENCES "public"."treatment_program_instance_stage_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_action_log" ADD CONSTRAINT "program_action_log_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_action_log" ADD CONSTRAINT "program_action_log_action_type_check" CHECK (action_type = ANY (ARRAY['done'::text, 'viewed'::text, 'note'::text]));--> statement-breakpoint
CREATE INDEX "idx_program_action_log_instance" ON "program_action_log" USING btree ("instance_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_program_action_log_stage_item" ON "program_action_log" USING btree ("instance_stage_item_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_program_action_log_created_at" ON "program_action_log" USING btree ("created_at" timestamptz_ops);
