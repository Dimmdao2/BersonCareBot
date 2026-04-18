CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"comment_type" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_target_type_check" CHECK (target_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text, 'stage_item_instance'::text, 'stage_instance'::text, 'program_instance'::text])),
	CONSTRAINT "comments_comment_type_check" CHECK (comment_type = ANY (ARRAY['template'::text, 'individual_override'::text, 'clinical_note'::text]))
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_comments_target_type_target_id" ON "comments" USING btree ("target_type" text_ops,"target_id" uuid_ops);