-- Rollback (ops): ALTER TABLE content_pages DROP CONSTRAINT IF EXISTS content_pages_linked_course_fkey;
-- Rollback (ops): DROP INDEX IF EXISTS idx_content_pages_linked_course;
-- Rollback (ops): ALTER TABLE content_pages DROP COLUMN IF EXISTS linked_course_id;

ALTER TABLE "content_pages" ADD COLUMN "linked_course_id" uuid;
--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_linked_course_fkey" FOREIGN KEY ("linked_course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "idx_content_pages_linked_course" ON "content_pages" USING btree ("linked_course_id");