ALTER TABLE "test_sets" ADD COLUMN "publication_status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_publication_status_check" CHECK ("publication_status" IN ('draft', 'published'));
--> statement-breakpoint
CREATE INDEX "idx_test_sets_publication_arch" ON "test_sets" USING btree ("is_archived", "publication_status");
