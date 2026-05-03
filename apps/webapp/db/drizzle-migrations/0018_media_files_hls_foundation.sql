ALTER TABLE "media_files" ADD COLUMN "video_processing_status" text;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "video_processing_error" text;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "hls_master_playlist_s3_key" text;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "hls_artifact_prefix" text;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "poster_s3_key" text;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "video_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "available_qualities_json" jsonb;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "video_delivery_override" text;--> statement-breakpoint
CREATE INDEX "idx_media_files_video_processing_status" ON "media_files" USING btree ("video_processing_status" text_ops) WHERE (mime_type ~~ 'video/%'::text);--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_video_processing_status_check" CHECK ((video_processing_status IS NULL) OR (video_processing_status = ANY (ARRAY['none'::text, 'pending'::text, 'processing'::text, 'ready'::text, 'failed'::text])));--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_video_delivery_override_check" CHECK ((video_delivery_override IS NULL) OR (video_delivery_override = ANY (ARRAY['mp4'::text, 'hls'::text, 'auto'::text])));