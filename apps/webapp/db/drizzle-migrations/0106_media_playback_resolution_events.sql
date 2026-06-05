CREATE TABLE "media_playback_resolution_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "media_id" uuid NOT NULL,
  "delivery" text NOT NULL,
  "fallback_used" boolean DEFAULT false NOT NULL,
  "resolved_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "media_playback_resolution_events_delivery_check"
    CHECK (delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text]))
);

ALTER TABLE "media_playback_resolution_events"
  ADD CONSTRAINT "media_playback_resolution_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "media_playback_resolution_events"
  ADD CONSTRAINT "media_playback_resolution_events_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "idx_media_playback_resolution_events_resolved_at"
  ON "media_playback_resolution_events" USING btree ("resolved_at" DESC NULLS FIRST);

CREATE INDEX "idx_media_playback_resolution_events_user_resolved_at"
  ON "media_playback_resolution_events" USING btree ("user_id", "resolved_at" DESC NULLS FIRST);
