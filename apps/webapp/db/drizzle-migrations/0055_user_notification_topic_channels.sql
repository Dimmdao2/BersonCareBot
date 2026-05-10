-- Keep Drizzle deploy path in sync with profile notifications runtime.
-- Idempotent parity with legacy `086_cms_unassigned_notification_topic_channels.sql`.
INSERT INTO "content_sections" ("slug", "title", "description", "sort_order", "is_visible", "requires_auth", "kind", "system_parent_code")
VALUES (
  '_cms_unassigned',
  'Без раздела',
  'Страницы без привязанного раздела (служебный раздел CMS)',
  -1,
  false,
  false,
  'article',
  NULL
)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification_topic_channels" (
  "user_id" uuid NOT NULL REFERENCES "platform_users"("id") ON DELETE cascade,
  "topic_code" text NOT NULL,
  "channel_code" text NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_notification_topic_channels_channel_check" CHECK ("channel_code" = ANY (ARRAY['telegram'::text, 'max'::text, 'email'::text])),
  CONSTRAINT "user_notification_topic_channels_pkey" PRIMARY KEY("user_id","topic_code","channel_code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notification_topic_channels_user"
  ON "user_notification_topic_channels" USING btree ("user_id");
