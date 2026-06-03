-- Patient package sale metadata (doctor card) + refund usage kind for session returns
ALTER TABLE "be_patient_packages"
  ADD COLUMN IF NOT EXISTS "sold_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "paid_amount_minor" integer,
  ADD COLUMN IF NOT EXISTS "paid_currency" text;

UPDATE "be_patient_packages"
SET
  "sold_at" = COALESCE("sold_at", "created_at"),
  "paid_amount_minor" = COALESCE("paid_amount_minor", "price_minor"),
  "paid_currency" = COALESCE("paid_currency", "currency")
WHERE "sold_at" IS NULL OR "paid_amount_minor" IS NULL OR "paid_currency" IS NULL;

ALTER TABLE "be_package_usages" DROP CONSTRAINT IF EXISTS "be_package_usages_kind_check";
ALTER TABLE "be_package_usages" ADD CONSTRAINT "be_package_usages_kind_check"
  CHECK (
    usage_kind = ANY (
      ARRAY[
        'reserve'::text,
        'consume'::text,
        'release'::text,
        'penalty'::text,
        'manual_adjust'::text,
        'refund'::text
      ]
    )
  );
