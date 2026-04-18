CREATE TABLE "treatment_program_instance_stage_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_ref_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"comment" text,
	"local_comment" text,
	"settings" jsonb,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "treatment_program_instance_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'test_set'::text]))
);
--> statement-breakpoint
CREATE TABLE "treatment_program_instance_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"source_stage_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"local_comment" text,
	"status" text NOT NULL,
	CONSTRAINT "treatment_program_instance_stages_status_check" CHECK (status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text]))
);
--> statement-breakpoint
CREATE TABLE "treatment_program_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"patient_user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treatment_program_instances_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text]))
);
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD CONSTRAINT "treatment_program_instance_stage_items_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."treatment_program_instance_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD CONSTRAINT "treatment_program_instance_stages_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."treatment_program_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD CONSTRAINT "treatment_program_instance_stages_source_stage_id_fkey" FOREIGN KEY ("source_stage_id") REFERENCES "public"."treatment_program_template_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instances" ADD CONSTRAINT "treatment_program_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."treatment_program_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instances" ADD CONSTRAINT "treatment_program_instances_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instances" ADD CONSTRAINT "treatment_program_instances_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_treatment_program_instance_stage_items_stage_order" ON "treatment_program_instance_stage_items" USING btree ("stage_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_treatment_program_instance_stages_instance_order" ON "treatment_program_instance_stages" USING btree ("instance_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_treatment_program_instances_patient" ON "treatment_program_instances" USING btree ("patient_user_id" uuid_ops,"updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_treatment_program_instances_template" ON "treatment_program_instances" USING btree ("template_id" uuid_ops);