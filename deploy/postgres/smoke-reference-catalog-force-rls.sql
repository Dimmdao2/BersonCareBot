-- Executable transactional proof for a fully migrated DB with P2-B roles/context installed.
-- Run as a PostgreSQL superuser; every fixture and baseline v2 is rolled back.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- The production base login receives this through D3.4; grant it transaction-locally to the
-- NOLOGIN execution roles so SET ROLE exercises the policies directly.
GRANT USAGE ON SCHEMA app TO app_staff, app_patient;

ALTER TABLE public.reference_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reference_items FORCE ROW LEVEL SECURITY;
-- Install the exact locked branches generated for these three tables. Keeping the smoke
-- transactional lets it run against either a dormant DEV rehearsal DB or an already-locked DB.
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.reference_categories;
CREATE POLICY saas_org_dormant_p0_8_3 ON public.reference_categories FOR ALL
USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
WITH CHECK (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
DROP POLICY IF EXISTS saas_org_dormant_p0_8_4 ON public.reference_items;
CREATE POLICY saas_org_dormant_p0_8_4 ON public.reference_items FOR ALL
USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
WITH CHECK (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
ALTER TABLE public.org_enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.org_enrollments;
CREATE POLICY saas_org_dormant_p0_8_3 ON public.org_enrollments FOR ALL
USING (
  (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
  OR (app.current_patient_user_id() IS NOT NULL AND platform_user_id = app.current_patient_user_id())
)
WITH CHECK (
  (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
  OR (app.current_patient_user_id() IS NOT NULL AND platform_user_id = app.current_patient_user_id())
);

INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
VALUES
  ('fa180000-0000-4000-8000-000000000001', 'Reference smoke A', true, 0, now(), now()),
  ('fa180000-0000-4000-8000-000000000002', 'Reference smoke B', true, 0, now(), now());

SELECT app.seed_reference_catalog_snapshot('fa180000-0000-4000-8000-000000000001') AS version_a \gset
SELECT app.seed_reference_catalog_snapshot('fa180000-0000-4000-8000-000000000002') AS version_b \gset
SELECT count(*) AS count_a_before
FROM public.reference_items
WHERE organization_id = 'fa180000-0000-4000-8000-000000000001' \gset

UPDATE public.reference_items
SET title = 'Clinic A independent edit'
WHERE organization_id = 'fa180000-0000-4000-8000-000000000001'
  AND code = 'pain';

INSERT INTO public.reference_catalog_baselines (version, definition_json)
SELECT 2, jsonb_set(
  definition_json,
  '{categories,6,items}',
  (definition_json #> '{categories,6,items}') || '[ ["future_only", "Future only", 999] ]'::jsonb
)
FROM public.reference_catalog_baselines
WHERE version = 1;

SELECT app.seed_reference_catalog_snapshot('fa180000-0000-4000-8000-000000000001') AS version_a_again \gset
INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
VALUES ('fa180000-0000-4000-8000-000000000003', 'Reference smoke C', true, 0, now(), now());
SELECT app.seed_reference_catalog_snapshot('fa180000-0000-4000-8000-000000000003') AS version_c \gset

SELECT 1 / (
  :'version_a'::int = 1
  AND :'version_b'::int = 1
  AND :'version_a_again'::int = 1
  AND :'version_c'::int = 2
  AND (SELECT count(*) FROM public.reference_items
       WHERE organization_id = 'fa180000-0000-4000-8000-000000000001') = :'count_a_before'::int
  AND NOT EXISTS (
    SELECT 1 FROM public.reference_items
    WHERE organization_id = 'fa180000-0000-4000-8000-000000000001' AND code = 'future_only'
  )
  AND EXISTS (
    SELECT 1 FROM public.reference_items
    WHERE organization_id = 'fa180000-0000-4000-8000-000000000003' AND code = 'future_only'
  )
  AND EXISTS (
    SELECT 1 FROM public.reference_items
    WHERE organization_id = 'fa180000-0000-4000-8000-000000000001'
      AND code = 'pain' AND title = 'Clinic A independent edit'
  )
)::int AS snapshot_once_contract_ok;

-- Reuse one real active enrollment so the policy is tested through the canonical patient wall.
SELECT organization_id AS patient_org, platform_user_id AS patient_id
FROM public.org_enrollments
WHERE status = 'active'
ORDER BY created_at
LIMIT 1
\gset

SELECT
  'reference-patient-' || floor(extract(epoch FROM clock_timestamp()))::bigint AS patient_nonce,
  pg_backend_pid() AS patient_backend_pid,
  floor(extract(epoch FROM clock_timestamp()))::bigint + 120 AS patient_expires
\gset

SELECT encode(app_ext.hmac(
  concat_ws('|', 'v1', :'patient_nonce', :'patient_backend_pid', :'patient_expires',
    :'patient_org', :'patient_id', ''),
  (SELECT secret FROM app.context_signing_secrets WHERE id = true),
  'sha256'
), 'hex') AS patient_signature
\gset

SET LOCAL ROLE app_patient;
SELECT app.install_signed_context(
  :'patient_nonce', :'patient_backend_pid'::int, :'patient_expires'::bigint,
  :'patient_org'::uuid, :'patient_id'::uuid, NULL, :'patient_signature'
);
SELECT app.current_org_id() AS smoke_patient_org,
       app.current_patient_user_id() AS smoke_patient_id,
       (SELECT count(*) FROM public.org_enrollments) AS visible_enrollments,
       (SELECT count(*) FROM public.reference_items WHERE organization_id = :'patient_org'::uuid) AS visible_reference_items;
SELECT 1 / (
  (SELECT count(*) FROM public.reference_items WHERE organization_id = :'patient_org'::uuid) > 0
  AND (SELECT count(*) FROM public.reference_items
       WHERE organization_id = 'fa180000-0000-4000-8000-000000000002') = 0
)::int AS patient_active_enrollment_read_wall_ok;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.reference_items (organization_id, category_id, code, title)
    SELECT organization_id, id, 'patient_write_forbidden', 'forbidden'
    FROM public.reference_categories
    WHERE organization_id = app.current_org_id()
    LIMIT 1;
    RAISE EXCEPTION 'patient reference write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
SELECT app.release_principal_context();
RESET ROLE;

SELECT
  'reference-staff-' || floor(extract(epoch FROM clock_timestamp()))::bigint AS staff_nonce,
  pg_backend_pid() AS staff_backend_pid,
  floor(extract(epoch FROM clock_timestamp()))::bigint + 120 AS staff_expires
\gset
SELECT encode(app_ext.hmac(
  concat_ws('|', 'v1', :'staff_nonce', :'staff_backend_pid', :'staff_expires',
    'fa180000-0000-4000-8000-000000000001', '', ''),
  (SELECT secret FROM app.context_signing_secrets WHERE id = true),
  'sha256'
), 'hex') AS staff_signature
\gset

SET LOCAL ROLE app_staff;
SELECT app.install_signed_context(
  :'staff_nonce', :'staff_backend_pid'::int, :'staff_expires'::bigint,
  'fa180000-0000-4000-8000-000000000001', NULL, NULL, :'staff_signature'
);
SELECT 1 / (
  (SELECT count(*) FROM public.reference_items
   WHERE organization_id = 'fa180000-0000-4000-8000-000000000001') > 0
  AND (SELECT count(*) FROM public.reference_items
       WHERE organization_id = 'fa180000-0000-4000-8000-000000000002') = 0
)::int AS staff_force_org_wall_ok;
SELECT app.release_principal_context();
RESET ROLE;

SELECT 1 / bool_and(relforcerowsecurity)::int AS reference_tables_force_enabled
FROM pg_class
WHERE oid IN ('public.reference_categories'::regclass, 'public.reference_items'::regclass);

ROLLBACK;
\echo 'smoke-reference-catalog-force-rls: OK'
