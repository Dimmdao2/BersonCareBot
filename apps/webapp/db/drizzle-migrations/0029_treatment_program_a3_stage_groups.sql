CREATE TABLE "treatment_program_template_stage_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"schedule_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_program_instance_stage_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"source_group_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"schedule_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treatment_program_template_stage_items" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "treatment_program_template_stage_groups" ADD CONSTRAINT "treatment_program_template_stage_groups_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."treatment_program_template_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_groups" ADD CONSTRAINT "treatment_program_instance_stage_groups_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."treatment_program_instance_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_groups" ADD CONSTRAINT "treatment_program_instance_stage_groups_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "public"."treatment_program_template_stage_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_treatment_program_tpl_stage_groups_stage_order" ON "treatment_program_template_stage_groups" USING btree ("stage_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_treatment_program_inst_stage_groups_stage_order" ON "treatment_program_instance_stage_groups" USING btree ("stage_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
ALTER TABLE "treatment_program_template_stage_items" ADD CONSTRAINT "treatment_program_template_stage_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."treatment_program_template_stage_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD CONSTRAINT "treatment_program_instance_stage_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."treatment_program_instance_stage_groups"("id") ON DELETE set null ON UPDATE no action;