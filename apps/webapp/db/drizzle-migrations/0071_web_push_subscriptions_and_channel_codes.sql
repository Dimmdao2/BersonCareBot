-- Web Push subscriptions + channel enums for web_push
CREATE TABLE IF NOT EXISTS "user_web_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "user_web_push_subscriptions" ADD CONSTRAINT "user_web_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_web_push_subscriptions_endpoint" ON "user_web_push_subscriptions" USING btree ("endpoint");

CREATE INDEX IF NOT EXISTS "idx_user_web_push_subscriptions_user" ON "user_web_push_subscriptions" USING btree ("user_id");

ALTER TABLE "user_channel_preferences" DROP CONSTRAINT IF EXISTS "user_channel_preferences_channel_code_check";

ALTER TABLE "user_channel_preferences" ADD CONSTRAINT "user_channel_preferences_channel_code_check" CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'sms'::text, 'email'::text, 'web_push'::text]));

ALTER TABLE "user_notification_topic_channels" DROP CONSTRAINT IF EXISTS "user_notification_topic_channels_channel_check";

ALTER TABLE "user_notification_topic_channels" ADD CONSTRAINT "user_notification_topic_channels_channel_check" CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'email'::text, 'web_push'::text]));
