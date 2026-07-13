ALTER TABLE "public"."platform_user_contacts"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid;
ALTER TABLE "public"."user_phone_history"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid;

CREATE INDEX IF NOT EXISTS "idx_platform_user_contacts_organization_id"
  ON "public"."platform_user_contacts" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_user_phone_history_organization_id"
  ON "public"."user_phone_history" USING btree ("organization_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_user_contacts_organization_id_fkey'
      AND conrelid = 'public.platform_user_contacts'::regclass
  ) THEN
    ALTER TABLE "public"."platform_user_contacts"
      ADD CONSTRAINT "platform_user_contacts_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_phone_history_organization_id_fkey'
      AND conrelid = 'public.user_phone_history'::regclass
  ) THEN
    ALTER TABLE "public"."user_phone_history"
      ADD CONSTRAINT "user_phone_history_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;

WITH user_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM (
    SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
    UNION ALL
    SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
  ) o
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE "public"."platform_user_contacts" tgt
SET "organization_id" = uo.organization_id
FROM user_org uo
WHERE tgt."platform_user_id" = uo.platform_user_id
  AND tgt."organization_id" IS NULL;

WITH user_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM (
    SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
    UNION ALL
    SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
  ) o
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE "public"."user_phone_history" tgt
SET "organization_id" = uo.organization_id
FROM user_org uo
WHERE tgt."platform_user_id" = uo.platform_user_id
  AND tgt."organization_id" IS NULL;

DO $$
DECLARE
  v_platform_user_contacts_residual_nulls bigint;
  v_user_phone_history_residual_nulls bigint;
BEGIN
  SELECT count(*)::bigint
  INTO v_platform_user_contacts_residual_nulls
  FROM "public"."platform_user_contacts"
  WHERE "organization_id" IS NULL;

  SELECT count(*)::bigint
  INTO v_user_phone_history_residual_nulls
  FROM "public"."user_phone_history"
  WHERE "organization_id" IS NULL;

  RAISE NOTICE 'P0.8.6 PII bootstrap org scope residual NULL platform_user_contacts.organization_id rows: %',
    v_platform_user_contacts_residual_nulls;
  RAISE NOTICE 'P0.8.6 PII bootstrap org scope residual NULL user_phone_history.organization_id rows: %',
    v_user_phone_history_residual_nulls;
END $$;
