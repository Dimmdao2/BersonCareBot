CREATE TABLE IF NOT EXISTS "patient_daily_warmup_video_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "content_page_id" uuid NOT NULL,
  "viewed_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_daily_warmup_video_views"
    ADD CONSTRAINT "patient_daily_warmup_video_views_user_id_platform_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_daily_warmup_video_views"
    ADD CONSTRAINT "patient_daily_warmup_video_views_content_page_id_content_pages_id_fk"
    FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_daily_warmup_video_views_viewed_at"
  ON "patient_daily_warmup_video_views" USING btree ("viewed_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_daily_warmup_video_views_page_viewed"
  ON "patient_daily_warmup_video_views" USING btree ("content_page_id" uuid_ops, "viewed_at" timestamptz_ops);
