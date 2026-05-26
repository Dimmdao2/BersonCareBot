CREATE TABLE "patient_content_rating_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_page_id" uuid NOT NULL,
	"rating_value" smallint NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pcrf_rating_value_check" CHECK ((rating_value >= 1) AND (rating_value <= 5))
);
--> statement-breakpoint
ALTER TABLE "patient_content_rating_feedback" ADD CONSTRAINT "patient_content_rating_feedback_user_id_platform_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_content_rating_feedback" ADD CONSTRAINT "patient_content_rating_feedback_content_page_id_content_pages_id_fk" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_pcrf_content_page_created_desc" ON "patient_content_rating_feedback" USING btree ("content_page_id" uuid_ops,"created_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX "idx_pcrf_user_created_desc" ON "patient_content_rating_feedback" USING btree ("user_id" uuid_ops,"created_at" timestamptz_ops);
