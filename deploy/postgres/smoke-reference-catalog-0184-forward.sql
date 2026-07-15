-- Exact forward-migration rehearsal for a DB where 0182/0183 are already applied and a live
-- organization received an invalid receipt without a catalog. Entire rehearsal rolls back.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DROP TRIGGER IF EXISTS be_organizations_reference_catalog_snapshot ON public.be_organizations;
DROP FUNCTION IF EXISTS app.seed_reference_catalog_after_organization_insert();
DROP POLICY IF EXISTS reference_catalog_seed_owner ON public.reference_categories;
DROP POLICY IF EXISTS reference_catalog_seed_owner ON public.reference_items;
ALTER TABLE public.reference_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reference_items FORCE ROW LEVEL SECURITY;

INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
VALUES ('fa184000-0000-4000-8000-000000000002', 'Pre-0184 race fixture', true, 0, now(), now());
INSERT INTO public.reference_catalog_snapshot_receipts (organization_id, baseline_version)
VALUES ('fa184000-0000-4000-8000-000000000002', 1);

\ir ../../apps/webapp/db/drizzle-migrations/0184_reference_catalog_org_insert_hook.sql

SELECT 1 / (
  EXISTS (
    SELECT 1 FROM public.reference_catalog_snapshot_receipts
    WHERE organization_id = 'fa184000-0000-4000-8000-000000000002'
  )
  AND EXISTS (
    SELECT 1 FROM public.reference_categories
    WHERE organization_id = 'fa184000-0000-4000-8000-000000000002'
  )
  AND EXISTS (
    SELECT 1 FROM public.reference_items
    WHERE organization_id = 'fa184000-0000-4000-8000-000000000002'
  )
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.be_organizations'::regclass
      AND tgname = 'be_organizations_reference_catalog_snapshot'
      AND NOT tgisinternal
  )
)::int AS forward_cutover_repair_and_hook_ok;

ROLLBACK;
\echo 'smoke-reference-catalog-0184-forward: OK'
