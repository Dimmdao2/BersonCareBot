-- Patient product-catalog SELECT grant + RLS policy (defect fix: patient purchase HTTP 500 /
-- SQLSTATE 42501 on be_products, isolation telemetry eventClass "role_pool_mismatch").
--
-- Context / defect:
--   POST /api/booking/products/purchase calls
--   apps/webapp/src/infra/repos/pgProducts.ts resolveProductOrganizationId(productId) BEFORE any
--   principal wrapper runs -- straight after requirePatientApiBusinessAccess's ambient patient DB
--   principal stamp (apps/webapp/src/app-layer/guards/requireRole.ts:330-357,
--   stampPatientPrincipalForApi -> enterWithDbPatientPrincipal({organizationId: undefined,
--   platformUserId, ...})). That query runs under the app_patient DB role (nonstaff pool,
--   apps/webapp/src/infra/db/webappPoolProvider.ts:227-256 routes principal.kind "patient" there),
--   which has NO grant at all on be_products: p0-5b-grants.sql's p0_5b_patient_grant_tables list
--   grants app_patient the DOWNSTREAM product tables (be_product_purchases, be_product_history_events)
--   but never be_products itself -- PostgreSQL aclcheck_error (SQLSTATE 42501) -> HTTP 500. Confirmed
--   live on dev 2026-08-01; the webapp's own isolation reporter classifies it as eventClass
--   "role_pool_mismatch", the same named defect class already fixed for other tables in
--   patient-write-grants-role-pool-mismatch.sql and patient-support-mark-read-grant.sql.
--
--   A GRANT alone is not sufficient: be_products' only RLS policy (saas_org_dormant_p0_8_3,
--   deploy/postgres/phase4-locked-helper-rls-policies.sql) has just a staff branch
--   (`app.is_staff() AND organization_id = app.current_org_id()`) -- no patient branch at all -- so a
--   granted-but-policy-less app_patient would still see zero rows. This overlay adds both.
--
-- Why this is the same access pattern as other working patient reads, not a new one:
--   apps/webapp/src/app/api/patient/treatment-program-instances/route.ts reads
--   treatment_program_instances the same way -- straight after requirePatientApiBusinessAccess, no
--   wrapper -- and succeeds (verified live on dev 2026-08-01: GET returns 200). That table's app_patient
--   grant + RLS patient branch is a plain ownership predicate keyed only on
--   app.current_patient_user_id(), with NO dependency on app.current_org_id() -- current_org_id() is
--   never populated for this ambient principal (see stampPatientPrincipalForApi above; organizationId
--   is only set once an explicit org-scoped wrapper runs later in the request).
--
--   be_products has no per-row patient-owner column (it's org-shared catalog data, not a patient-owned
--   row), so the closest analogous predicate is the org_enrollments EXISTS check already used by
--   patient-visible-catalog-rls.sql for content_pages/content_sections/patient_home_blocks -- but
--   WITHOUT that overlay's additional `organization_id = app.current_org_id()` equality, for the same
--   reason the ownership-predicate tables above omit it: current_org_id() is unset at this call site.
--   The org_enrollments EXISTS check alone (keyed off the row's own organization_id, not a GUC) is what
--   actually secures this predicate.
--
-- Row scope: a patient can only see be_products rows for organizations where they hold an ACTIVE
-- org_enrollments row. This cannot widen beyond what the application already enforces independently --
-- the caller separately compares the resolved product's organization_id to the patient's own resolved
-- enrollment org and 404s on mismatch (apps/webapp/src/app/api/booking/products/purchase/route.ts:34-36).
--
-- Out of scope (not fixed here, no evidence pinning the exact defect down cleanly yet): be_product_pay_links
-- is reached the same way by the public pay-link purchase route
-- (apps/webapp/src/app/api/booking/public/products/purchase/route.ts), but that route stamps a
-- BOOTSTRAP principal, not a patient one -- a different gap, needs its own investigation.
--
-- Dormant boundary (same as sibling overlays): this file only adds a GRANT + an additive SELECT policy
-- to app_patient. It does not change DATABASE_URL, switch any runtime process, or touch any other role
-- or existing policy.
--
-- Requires app.current_org_id()/app.current_patient_user_id() (protected principal context) -- same
-- prerequisite as patient-visible-catalog-rls.sql; wire into the protected_overlays list, not
-- always_overlays.
--
-- No psql variables required (role name is fixed) -- invoke directly:
--   psql '<database-url>' -f deploy/postgres/patient-products-catalog-select.sql
--
-- Rollback:
--   Re-run with -v patient_products_catalog_select_down=1.

\set ON_ERROR_STOP on
\pset pager off

DO $patient_products_catalog_select_prerequisites$
BEGIN
  IF to_regprocedure('app.current_org_id()') IS NULL
     OR to_regprocedure('app.current_patient_user_id()') IS NULL THEN
    RAISE EXCEPTION 'patient_products_catalog_select_principal_helpers_missing';
  END IF;
END
$patient_products_catalog_select_prerequisites$;

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')::int AS patient_products_catalog_select_role_exists \gset

\if :patient_products_catalog_select_role_exists
\else
\echo 'FATAL: app_patient must already exist -- run p0-5b-role-split-staff-patient.sql first.'
SELECT 1 / 0 AS patient_products_catalog_select_abort;
\endif

\if :{?patient_products_catalog_select_down}
\echo 'Patient products catalog SELECT DOWN: dropping RLS policy and revoking SELECT on be_products from app_patient.'
DROP POLICY IF EXISTS "patient_enrolled_org_select" ON "public"."be_products";
REVOKE SELECT ON TABLE "public"."be_products" FROM app_patient;
\echo 'Patient products catalog SELECT DOWN complete.'
\else
\echo 'Patient products catalog SELECT UP: GRANT SELECT on be_products + patient-enrollment RLS policy for app_patient.'

GRANT SELECT ON TABLE "public"."be_products" TO app_patient;

DROP POLICY IF EXISTS "patient_enrolled_org_select" ON "public"."be_products";
CREATE POLICY "patient_enrolled_org_select" ON "public"."be_products"
FOR SELECT TO app_patient
USING (
  app.current_patient_user_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = be_products.organization_id
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
);

\echo 'Patient products catalog SELECT UP complete.'
\endif
