CREATE TABLE IF NOT EXISTS "notification_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"user_id" uuid,
	"integrator_user_id" text,
	"topic_code" text,
	"intent_type" text,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"provider_status_code" integer,
	"event_id" text,
	"occurrence_id" uuid,
	"endpoint_hash" text,
	"recipient_ref" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_delivery_attempts_created_at" ON "notification_delivery_attempts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_delivery_attempts_channel_created" ON "notification_delivery_attempts" USING btree ("channel","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_delivery_attempts_status_created" ON "notification_delivery_attempts" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_delivery_attempts_user_created" ON "notification_delivery_attempts" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_delivery_attempts_topic_created" ON "notification_delivery_attempts" USING btree ("topic_code","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_delivery_attempts_occurrence_created" ON "notification_delivery_attempts" USING btree ("occurrence_id","created_at");
