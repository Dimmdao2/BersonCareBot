-- Rollback (ops): DROP TABLE IF EXISTS patient_practice_completions CASCADE;

CREATE TABLE "patient_practice_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_page_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"feeling" smallint,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "ppc_source_check" CHECK (source = ANY (ARRAY['home'::text, 'reminder'::text, 'section_page'::text, 'daily_warmup'::text])),
	CONSTRAINT "ppc_feeling_check" CHECK ((feeling IS NULL) OR ((feeling >= 1) AND (feeling <= 5)))
);
--> statement-breakpoint
ALTER TABLE "patient_practice_completions" ADD CONSTRAINT "patient_practice_completions_content_page_id_content_pages_id_fk" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ppc_user_completed_desc" ON "patient_practice_completions" USING btree ("user_id" uuid_ops,"completed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_ppc_user_page" ON "patient_practice_completions" USING btree ("user_id" uuid_ops,"content_page_id" uuid_ops);