CREATE TABLE "treatment_program_template_stage_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_ref_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"comment" text,
	"settings" jsonb,
	CONSTRAINT "treatment_program_template_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'test_set'::text]))
);
--> statement-breakpoint
CREATE TABLE "treatment_program_template_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_program_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treatment_program_templates_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))
);
--> statement-breakpoint
ALTER TABLE "treatment_program_template_stage_items" ADD CONSTRAINT "treatment_program_template_stage_items_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."treatment_program_template_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_template_stages" ADD CONSTRAINT "treatment_program_template_stages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."treatment_program_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_program_templates" ADD CONSTRAINT "treatment_program_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_treatment_program_stage_items_stage_order" ON "treatment_program_template_stage_items" USING btree ("stage_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_treatment_program_template_stages_template_order" ON "treatment_program_template_stages" USING btree ("template_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_treatment_program_templates_status" ON "treatment_program_templates" USING btree ("status" text_ops);