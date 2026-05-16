ALTER TABLE "platform_users" ADD COLUMN "merged_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "idx_platform_users_merged_at" ON "platform_users" USING btree ("merged_at") WHERE merged_at IS NOT NULL;
--> statement-breakpoint
UPDATE "platform_users" SET merged_at = updated_at WHERE merged_into_id IS NOT NULL AND merged_at IS NULL;
