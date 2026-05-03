CREATE TABLE "media_playback_stats_hourly" (
	"bucket_hour" timestamp with time zone NOT NULL,
	"delivery" text NOT NULL,
	"resolved_count" integer DEFAULT 0 NOT NULL,
	"fallback_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "media_playback_stats_hourly_pkey" PRIMARY KEY("bucket_hour","delivery"),
	CONSTRAINT "media_playback_stats_hourly_delivery_check" CHECK (delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text]))
);
--> statement-breakpoint
CREATE INDEX "idx_media_playback_stats_hourly_bucket" ON "media_playback_stats_hourly" USING btree ("bucket_hour" timestamptz_ops);