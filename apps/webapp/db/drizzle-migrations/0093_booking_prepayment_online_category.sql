-- Stage 5 audit: prepayment policies for online categories (nullable service_id)

ALTER TABLE "be_prepayment_policies" DROP CONSTRAINT IF EXISTS "be_prepayment_policies_service_id_fkey";
ALTER TABLE "be_prepayment_policies" ALTER COLUMN "service_id" DROP NOT NULL;

ALTER TABLE "be_prepayment_policies" ADD COLUMN IF NOT EXISTS "online_category" text;

ALTER TABLE "be_prepayment_policies" DROP CONSTRAINT IF EXISTS "be_prepayment_policies_scope_check";
ALTER TABLE "be_prepayment_policies" ADD CONSTRAINT "be_prepayment_policies_scope_check" CHECK (
  (service_id IS NOT NULL AND online_category IS NULL)
  OR (service_id IS NULL AND online_category IS NOT NULL)
);

DROP INDEX IF EXISTS "be_prepayment_policies_service_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "be_prepayment_policies_service_uidx"
  ON "be_prepayment_policies" ("organization_id", "service_id")
  WHERE service_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "be_prepayment_policies_online_uidx"
  ON "be_prepayment_policies" ("organization_id", "online_category")
  WHERE online_category IS NOT NULL;

ALTER TABLE "be_prepayment_policies" ADD CONSTRAINT "be_prepayment_policies_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "be_clinic_services"("id") ON DELETE cascade;

ALTER TABLE "be_prepayment_policies" DROP CONSTRAINT IF EXISTS "be_prepayment_policies_online_category_check";
ALTER TABLE "be_prepayment_policies" ADD CONSTRAINT "be_prepayment_policies_online_category_check" CHECK (
  online_category IS NULL OR online_category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text])
);
