CREATE TABLE "content_section_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_slug" text NOT NULL,
	"new_slug" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "content_section_slug_history_old_slug_key" ON "content_section_slug_history" USING btree ("old_slug" text_ops);
--> statement-breakpoint
CREATE INDEX "idx_content_section_slug_history_new_slug" ON "content_section_slug_history" USING btree ("new_slug" text_ops);
