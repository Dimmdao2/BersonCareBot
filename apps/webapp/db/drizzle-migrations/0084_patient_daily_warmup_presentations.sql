CREATE TABLE IF NOT EXISTS "patient_daily_warmup_presentations" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "content_page_id" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_daily_warmup_presentations"
    ADD CONSTRAINT "patient_daily_warmup_presentations_user_id_platform_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_daily_warmup_presentations"
    ADD CONSTRAINT "patient_daily_warmup_presentations_content_page_id_content_pages_id_fk"
    FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_daily_warmup_presentations_content_page"
  ON "patient_daily_warmup_presentations" USING btree ("content_page_id");
