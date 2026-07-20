-- Reference catalog strict-RLS overlay. Apply after the generated phase4 policy artifact and
-- specialist provisioning overlay.

\set ON_ERROR_STOP on
\pset pager off

\if :{?reference_catalog_patient_role}
\else
\set reference_catalog_patient_role app_patient
\endif
\if :{?reference_catalog_staff_role}
\else
\set reference_catalog_staff_role app_staff
\endif

SELECT 1 / (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'reference_catalog_patient_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'reference_catalog_staff_role')
  AND to_regprocedure('app.current_org_id()') IS NOT NULL
  AND to_regprocedure('app.current_patient_user_id()') IS NOT NULL
  AND to_regprocedure('app.seed_reference_catalog_snapshot(uuid)') IS NOT NULL
  AND to_regprocedure('app.seed_reference_catalog_after_organization_insert()') IS NOT NULL
  AND to_regprocedure('app.get_public_reference_baseline(text)') IS NOT NULL
  AND to_regclass('public.reference_catalog_snapshot_receipts') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.be_organizations'::regclass
      AND tgname = 'be_organizations_reference_catalog_snapshot'
      AND NOT tgisinternal
  )
)::int AS reference_catalog_rls_preflight_ok;

SELECT COALESCE(
  (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = to_regprocedure('app.provision_specialist_owner(uuid)')),
  (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure)
) AS provisioning_owner
\gset

BEGIN;

DROP POLICY IF EXISTS reference_catalog_patient_select ON public.reference_categories;
CREATE POLICY reference_catalog_patient_select ON public.reference_categories
FOR SELECT TO :"reference_catalog_patient_role"
USING (
  app.current_org_id() IS NOT NULL
  AND app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = reference_categories.organization_id
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
);

DROP POLICY IF EXISTS reference_catalog_patient_select ON public.reference_items;
CREATE POLICY reference_catalog_patient_select ON public.reference_items
FOR SELECT TO :"reference_catalog_patient_role"
USING (
  app.current_org_id() IS NOT NULL
  AND app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = reference_items.organization_id
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
);

-- FORCE RLS also applies to the helper owner. Its extra surface is restricted to organizations
-- without a receipt; every existing/provisioned organization remains behind the normal org wall.
DROP POLICY IF EXISTS reference_catalog_seed_owner ON public.reference_categories;
CREATE POLICY reference_catalog_seed_owner ON public.reference_categories
FOR ALL TO :"provisioning_owner"
USING (
  current_user = :'provisioning_owner'
  AND NOT EXISTS (
    SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt
    WHERE receipt.organization_id = reference_categories.organization_id
  )
)
WITH CHECK (
  current_user = :'provisioning_owner'
  AND NOT EXISTS (
    SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt
    WHERE receipt.organization_id = reference_categories.organization_id
  )
);

DROP POLICY IF EXISTS reference_catalog_seed_owner ON public.reference_items;
CREATE POLICY reference_catalog_seed_owner ON public.reference_items
FOR ALL TO :"provisioning_owner"
USING (
  current_user = :'provisioning_owner'
  AND NOT EXISTS (
    SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt
    WHERE receipt.organization_id = reference_items.organization_id
  )
)
WITH CHECK (
  current_user = :'provisioning_owner'
  AND NOT EXISTS (
    SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt
    WHERE receipt.organization_id = reference_items.organization_id
  )
);

GRANT SELECT ON public.reference_catalog_baselines TO :"provisioning_owner";
GRANT SELECT, INSERT ON public.reference_catalog_snapshot_receipts TO :"provisioning_owner";
GRANT SELECT, INSERT ON public.reference_categories, public.reference_items TO :"provisioning_owner";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"provisioning_owner";
GRANT SELECT ON public.org_enrollments TO :"reference_catalog_patient_role";
GRANT SELECT ON public.reference_categories, public.reference_items TO :"reference_catalog_patient_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reference_categories, public.reference_items TO :"reference_catalog_staff_role";

ALTER FUNCTION app.seed_reference_catalog_snapshot(uuid) OWNER TO :"provisioning_owner";
ALTER FUNCTION app.seed_reference_catalog_after_organization_insert() OWNER TO :"provisioning_owner";
ALTER FUNCTION app.get_public_reference_baseline(text) OWNER TO :"provisioning_owner";
REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.seed_reference_catalog_after_organization_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_public_reference_baseline(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.seed_reference_catalog_snapshot(uuid) TO :"provisioning_owner";
GRANT EXECUTE ON FUNCTION app.get_public_reference_baseline(text) TO :"reference_catalog_patient_role", :"reference_catalog_staff_role";

COMMIT;

\echo 'Reference catalog strict-RLS overlay applied.'
