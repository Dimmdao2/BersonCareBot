CREATE TABLE IF NOT EXISTS "product_push_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_code" text,
	"intent_type" text,
	"occurrence_id" uuid,
	"push_kind" text,
	"warmup_slogan_key" text,
	"warmup_slogan_text" text,
	"open_url" text,
	"title" text,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_push_notifications" ADD CONSTRAINT "product_push_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_push_notifications_user_created" ON "product_push_notifications" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_push_notifications_topic_created" ON "product_push_notifications" USING btree ("topic_code","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_push_notifications_kind_slogan_created" ON "product_push_notifications" USING btree ("push_kind","warmup_slogan_key","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_analytics_events_recent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamptz DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"entry_channel" text NOT NULL,
	"page_key" text,
	"user_id" uuid,
	"client_session_id" text,
	"push_tracking_id" uuid,
	"topic_code" text,
	"push_kind" text,
	"warmup_slogan_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "product_analytics_events_recent" ADD CONSTRAINT "product_analytics_events_recent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_analytics_events_recent_occurred" ON "product_analytics_events_recent" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_analytics_events_recent_type_occurred" ON "product_analytics_events_recent" USING btree ("event_type","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_analytics_events_recent_push_open_dedupe" ON "product_analytics_events_recent" USING btree ("push_tracking_id") WHERE (event_type = 'push_open' AND push_tracking_id IS NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_analytics_hourly" (
	"bucket_hour" timestamptz NOT NULL,
	"event_type" text NOT NULL,
	"entry_channel" text NOT NULL,
	"page_key" text NOT NULL,
	"topic_code" text NOT NULL,
	"push_kind" text NOT NULL,
	"warmup_slogan_key" text NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "product_analytics_hourly_pkey" PRIMARY KEY("bucket_hour","event_type","entry_channel","page_key","topic_code","push_kind","warmup_slogan_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_analytics_hourly_bucket" ON "product_analytics_hourly" USING btree ("bucket_hour");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_analytics_user_hourly" (
	"bucket_hour" timestamptz NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_channel" text NOT NULL,
	"page_key" text NOT NULL,
	"app_opens" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"push_opens" integer DEFAULT 0 NOT NULL,
	"active_minutes" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamptz,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "product_analytics_user_hourly_pkey" PRIMARY KEY("bucket_hour","user_id","entry_channel","page_key")
);
--> statement-breakpoint
ALTER TABLE "product_analytics_user_hourly" ADD CONSTRAINT "product_analytics_user_hourly_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_analytics_user_hourly_user_bucket" ON "product_analytics_user_hourly" USING btree ("user_id","bucket_hour");
