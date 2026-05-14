CREATE TABLE "media_playback_client_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "event_class" text NOT NULL,
  "delivery" text,
  "error_detail" text,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "media_playback_client_events_event_class_check"
    CHECK (
      event_class = ANY (
        ARRAY[
          'hls_fatal'::text,
          'video_error'::text,
          'hls_import_failed'::text,
          'playback_refetch_failed'::text,
          'playback_refetch_exception'::text,
          'hls_js_unsupported'::text
        ]
      )
    ),
  CONSTRAINT "media_playback_client_events_delivery_check"
    CHECK ((delivery IS NULL) OR (delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))
);

ALTER TABLE "media_playback_client_events"
  ADD CONSTRAINT "media_playback_client_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "media_playback_client_events"
  ADD CONSTRAINT "media_playback_client_events_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "idx_media_playback_client_events_created_at"
  ON "media_playback_client_events" USING btree ("created_at" DESC NULLS FIRST);

CREATE INDEX "idx_media_playback_client_events_event_time"
  ON "media_playback_client_events" USING btree ("event_class","created_at" DESC NULLS FIRST);

CREATE INDEX "idx_media_playback_client_events_media_time"
  ON "media_playback_client_events" USING btree ("media_id","created_at" DESC NULLS FIRST);
