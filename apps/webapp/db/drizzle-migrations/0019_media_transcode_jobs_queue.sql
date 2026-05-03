CREATE TABLE "media_transcode_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_transcode_jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "media_transcode_jobs" ADD CONSTRAINT "media_transcode_jobs_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_media_transcode_jobs_pending_pick" ON "media_transcode_jobs" USING btree ("next_attempt_at" timestamptz_ops,"created_at" timestamptz_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "media_transcode_jobs_one_active_per_media" ON "media_transcode_jobs" USING btree ("media_id" uuid_ops) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));--> statement-breakpoint
INSERT INTO "system_settings" ("key", "scope", "value_json", "updated_at")
VALUES ('video_hls_pipeline_enabled', 'admin', '{"value": false}'::jsonb, now())
ON CONFLICT ("key", "scope") DO NOTHING;