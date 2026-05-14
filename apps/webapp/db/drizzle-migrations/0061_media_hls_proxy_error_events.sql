CREATE TABLE "media_hls_proxy_error_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "reason_code" text NOT NULL,
  "http_status" smallint,
  "artifact_kind" text NOT NULL,
  "object_suffix" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "media_hls_proxy_error_events_reason_check"
    CHECK (
      reason_code = ANY (
        ARRAY[
          'session_unauthorized'::text,
          'feature_disabled'::text,
          'media_not_readable'::text,
          'forbidden_path'::text,
          'missing_object'::text,
          'upstream_403'::text,
          's3_read_failed'::text,
          'upstream_timeout'::text,
          'range_not_satisfiable'::text,
          'playlist_read_failed'::text,
          'playlist_rewrite_failed'::text,
          'internal_error'::text
        ]
      )
    ),
  CONSTRAINT "media_hls_proxy_error_events_artifact_check"
    CHECK (artifact_kind = ANY (ARRAY['master'::text, 'variant'::text, 'segment'::text]))
);

ALTER TABLE "media_hls_proxy_error_events"
  ADD CONSTRAINT "media_hls_proxy_error_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "media_hls_proxy_error_events"
  ADD CONSTRAINT "media_hls_proxy_error_events_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "idx_media_hls_proxy_error_events_created_at"
  ON "media_hls_proxy_error_events" USING btree ("created_at" DESC NULLS FIRST);

CREATE INDEX "idx_media_hls_proxy_error_events_reason_time"
  ON "media_hls_proxy_error_events" USING btree ("reason_code","created_at" DESC NULLS FIRST);
