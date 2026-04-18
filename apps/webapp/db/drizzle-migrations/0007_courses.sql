CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"program_template_id" uuid NOT NULL,
	"intro_lesson_page_id" uuid,
	"access_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"price_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_program_template_id_fkey" FOREIGN KEY ("program_template_id") REFERENCES "public"."treatment_program_templates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_intro_lesson_page_id_fkey" FOREIGN KEY ("intro_lesson_page_id") REFERENCES "public"."content_pages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));
--> statement-breakpoint
CREATE INDEX "idx_courses_status" ON "courses" USING btree ("status" text_ops);
--> statement-breakpoint
CREATE INDEX "idx_courses_program_template" ON "courses" USING btree ("program_template_id" uuid_ops);
