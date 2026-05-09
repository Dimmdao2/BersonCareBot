-- Stage B (WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE): parity with legacy `082_recommendations_domain.sql`
-- so Drizzle-only migrate paths satisfy deploy guardrails (`recommendations.domain`).
-- Idempotent: safe if legacy 082 already applied.
ALTER TABLE "recommendations" ADD COLUMN IF NOT EXISTS "domain" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recommendations_domain" ON "recommendations" USING btree ("domain");
