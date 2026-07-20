ALTER TABLE "lfk_exercises"
  ADD COLUMN IF NOT EXISTS "catalog_scope" text DEFAULT 'catalog' NOT NULL;
--> statement-breakpoint
ALTER TABLE "lfk_exercises"
  DROP CONSTRAINT IF EXISTS "lfk_exercises_catalog_scope_check";
--> statement-breakpoint
ALTER TABLE "lfk_exercises"
  ADD CONSTRAINT "lfk_exercises_catalog_scope_check"
  CHECK ("catalog_scope" IN ('catalog', 'personal'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lfk_exercises_catalog_scope_owner"
  ON "lfk_exercises" USING btree
  ("owner_kind", "organization_id", "catalog_scope", "is_archived", "updated_at" DESC);
