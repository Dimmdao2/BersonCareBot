DROP TABLE "news_item_views" CASCADE;--> statement-breakpoint
DROP TABLE "news_items" CASCADE;--> statement-breakpoint
ALTER TABLE "broadcast_audit" ADD COLUMN "channels" text[] DEFAULT ARRAY['bot_message'::text, 'sms'::text] NOT NULL;