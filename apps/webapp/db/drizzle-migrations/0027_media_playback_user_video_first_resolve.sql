CREATE TABLE "media_playback_user_video_first_resolve" (
	"user_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"first_resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_playback_user_video_first_resolve_pkey" PRIMARY KEY("user_id","media_id")
);
--> statement-breakpoint
ALTER TABLE "media_playback_user_video_first_resolve" ADD CONSTRAINT "media_playback_user_video_first_resolve_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_playback_user_video_first_resolve" ADD CONSTRAINT "media_playback_user_video_first_resolve_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_media_playback_user_video_first_resolve_time" ON "media_playback_user_video_first_resolve" USING btree ("first_resolved_at" timestamptz_ops);