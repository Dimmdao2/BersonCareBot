ALTER TABLE "content_sections" ADD COLUMN "kind" text DEFAULT 'article' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "system_parent_code" text;--> statement-breakpoint
UPDATE "content_sections" SET "kind" = 'system', "system_parent_code" = 'warmups' WHERE "slug" = 'warmups';--> statement-breakpoint
UPDATE "content_sections" SET "kind" = 'system', "system_parent_code" = 'lessons' WHERE "slug" IN ('lessons', 'course_lessons');--> statement-breakpoint
UPDATE "content_sections" SET "kind" = 'system', "system_parent_code" = NULL WHERE "slug" IN ('emergency', 'materials', 'workouts');--> statement-breakpoint
CREATE INDEX "idx_content_sections_kind_parent_sort" ON "content_sections" USING btree ("kind" text_ops,"system_parent_code" text_ops,"sort_order" int4_ops,"title" text_ops);--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_kind_check" CHECK ("content_sections"."kind" = ANY (ARRAY['article'::text, 'system'::text]));--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_system_parent_code_check" CHECK (("content_sections"."system_parent_code" IS NULL) OR ("content_sections"."system_parent_code" = ANY (ARRAY['situations'::text, 'sos'::text, 'warmups'::text, 'lessons'::text])));--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_article_no_system_parent_check" CHECK (("content_sections"."kind" = 'system'::text) OR ("content_sections"."system_parent_code" IS NULL));
