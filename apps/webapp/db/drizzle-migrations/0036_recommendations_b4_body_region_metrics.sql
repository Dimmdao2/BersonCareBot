ALTER TABLE "recommendations" ADD COLUMN "body_region_id" uuid;
--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "quantity_text" text;
--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "frequency_text" text;
--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "duration_text" text;
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_body_region_id_fkey" FOREIGN KEY ("body_region_id") REFERENCES "reference_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_recommendations_body_region" ON "recommendations" USING btree ("body_region_id");
