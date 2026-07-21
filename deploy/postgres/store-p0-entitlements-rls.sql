-- Store P0 — entitlement foundation (dormant). Tables + column + RLS/grants under the enforce walls.
--
-- UP:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/store-p0-entitlements-rls.sql
-- DOWN / rollback:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -v store_p0_entitlements_down=1 -f deploy/postgres/store-p0-entitlements-rls.sql
--
-- DORMANT by design: creates the tariff catalog + per-org entitlement overrides + be_organizations.tariff_id.
-- Nothing is GATED here (that is P1 requireEntitlement). No BYPASSRLS. Idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS). saas_org_entitlement_overrides is FORCE-RLS org-scoped (same idiom as be_specialists / courses).
-- saas_tariffs is a platform-global reference catalog: ordinary staff may read it, while all
-- commercial writes belong exclusively to the dedicated app_platform_settings principal.

\set ON_ERROR_STOP on
\pset pager off

\if :{?store_p0_entitlements_down}
\else
\set store_p0_entitlements_down 0
\endif

SELECT 1 / (:'store_p0_entitlements_down' IN ('0','1'))::int AS store_p0_entitlements_down_is_valid;

-- Preconditions: enforce helpers + be_organizations + the runtime roles must exist.
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
  AND to_regprocedure('app.is_staff()') IS NOT NULL
  AND to_regprocedure('app.current_org_id()') IS NOT NULL
  AND to_regclass('public.be_organizations') IS NOT NULL
)::int AS store_p0_preflight_ok \gset

\if :store_p0_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_staff role, app.is_staff()/app.current_org_id(), public.be_organizations must all exist.'
SELECT 1 / 0 AS store_p0_abort;
\endif

-- Own the new objects by the same role that owns be_organizations (NOT postgres, NOT a runtime role, NOT BYPASSRLS).
SELECT pg_get_userbyid(c.relowner) AS store_p0_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'be_organizations' AND c.relkind IN ('r','p') \gset
SELECT quote_ident(:'store_p0_owner') AS store_p0_owner_ident \gset

BEGIN;

\if :store_p0_entitlements_down
ALTER TABLE IF EXISTS public.be_organizations DROP COLUMN IF EXISTS tariff_id;
DROP TABLE IF EXISTS public.saas_org_entitlement_overrides;
DROP TABLE IF EXISTS public.saas_tariffs;
\echo 'store-p0-entitlements DOWN complete.'
\else

-- 1. Platform-global tariff catalog. mechanics: {mechanic->bool}; absent key = default enabled (resolver default-on).
CREATE TABLE IF NOT EXISTS public.saas_tariffs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_minor integer,
  currency    text,
  mechanics   jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_tariffs OWNER TO :store_p0_owner_ident;

-- 2. Clinic -> tariff link (nullable: no tariff => resolver returns all-enabled, dormant/backward-compat).
ALTER TABLE public.be_organizations
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES public.saas_tariffs(id) ON DELETE SET NULL;

-- 3. Per-clinic entitlement OVERRIDES (tariff defaults + per-org override, owner decision 2026-07-13).
CREATE TABLE IF NOT EXISTS public.saas_org_entitlement_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  mechanic        text NOT NULL,
  enabled         boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_org_entitlement_overrides_org_mechanic_uidx UNIQUE (organization_id, mechanic)
);
ALTER TABLE public.saas_org_entitlement_overrides OWNER TO :store_p0_owner_ident;
CREATE INDEX IF NOT EXISTS idx_saas_org_entitlement_overrides_org
  ON public.saas_org_entitlement_overrides USING btree (organization_id);

-- ---- RLS ----
-- saas_tariffs: global reference; any staff session may read; ordinary staff never writes.
ALTER TABLE public.saas_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tariffs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_tariffs_staff_read_write" ON public.saas_tariffs;
DROP POLICY IF EXISTS "saas_tariffs_staff_read" ON public.saas_tariffs;
CREATE POLICY "saas_tariffs_staff_read" ON public.saas_tariffs
  FOR SELECT
  USING (app.is_staff());

-- saas_org_entitlement_overrides: org-scoped, same idiom as be_specialists/courses.
ALTER TABLE public.saas_org_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_entitlement_overrides_org_wall" ON public.saas_org_entitlement_overrides;
DROP POLICY IF EXISTS "saas_org_entitlement_overrides_org_read" ON public.saas_org_entitlement_overrides;
CREATE POLICY "saas_org_entitlement_overrides_org_read" ON public.saas_org_entitlement_overrides
  FOR SELECT
  USING (app.is_staff() AND (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()));

-- ---- Grants (least privilege; no BYPASSRLS) ----
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_tariffs FROM app_staff;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.saas_org_entitlement_overrides FROM app_staff;
GRANT SELECT ON TABLE public.saas_tariffs TO app_staff;
GRANT SELECT ON TABLE public.saas_org_entitlement_overrides TO app_staff;

\echo 'store-p0-entitlements UP complete (dormant; nothing gated).'
\endif

COMMIT;
