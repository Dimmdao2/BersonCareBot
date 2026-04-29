ALTER TABLE "content_sections" ADD COLUMN IF NOT EXISTS "icon_image_url" text;
--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN IF NOT EXISTS "cover_image_url" text;
--> statement-breakpoint
ALTER TABLE "content_section_slug_history" ADD COLUMN IF NOT EXISTS "changed_by_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_section_slug_history" ADD CONSTRAINT "content_section_slug_history_slug_diff_chk" CHECK (old_slug <> new_slug);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_home_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "patient_home_blocks_code_key" UNIQUE ("code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_home_blocks_sort" ON "patient_home_blocks" USING btree ("sort_order" int4_ops);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_home_block_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"target_type" text NOT NULL,
	"target_ref" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "patient_home_block_items_target_type_check" CHECK (target_type = ANY (ARRAY['content_section'::text, 'content_page'::text, 'course'::text]))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_home_block_items" ADD CONSTRAINT "patient_home_block_items_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."patient_home_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_home_block_items_block_sort" ON "patient_home_block_items" USING btree ("block_id" uuid_ops, "sort_order" int4_ops);
--> statement-breakpoint
INSERT INTO "patient_home_blocks" ("code", "is_visible", "sort_order")
VALUES
	('situations', true, 0),
	('daily_warmup', true, 1),
	('subscription_carousel', true, 2),
	('sos', true, 3),
	('courses', true, 4)
ON CONFLICT ("code") DO NOTHING;
