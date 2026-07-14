-- Store P0 — entitlement foundation (dormant). Schema record for a fresh DB.
-- The per-org overrides table carries a NO-FORCE dormant baseline wall here so the
-- fresh-dump migration chain agrees with the Phase 4 target generator. Strict/FORCE
-- RLS and grants live under deploy/postgres/store-p0-entitlements-rls.sql.
-- See docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md.

CREATE TABLE IF NOT EXISTS saas_tariffs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name        text NOT NULL,
  description text DEFAULT '' NOT NULL,
  price_minor integer,
  currency    text,
  mechanics   jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active   boolean DEFAULT true NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE be_organizations
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES saas_tariffs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS saas_org_entitlement_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  mechanic        text NOT NULL,
  enabled         boolean NOT NULL,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT saas_org_entitlement_overrides_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT saas_org_entitlement_overrides_org_mechanic_uidx UNIQUE (organization_id, mechanic)
);

CREATE INDEX IF NOT EXISTS idx_saas_org_entitlement_overrides_org
  ON saas_org_entitlement_overrides USING btree (organization_id);

ALTER TABLE "public"."saas_org_entitlement_overrides" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."saas_org_entitlement_overrides";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."saas_org_entitlement_overrides" FOR ALL USING ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)) WITH CHECK ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid));

-- Rollback, if this migration has not been used by application code yet:
--   ALTER TABLE IF EXISTS be_organizations DROP COLUMN IF EXISTS tariff_id;
--   DROP TABLE IF EXISTS saas_org_entitlement_overrides;
--   DROP TABLE IF EXISTS saas_tariffs;
