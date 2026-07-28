#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const dbArg = process.argv.find((arg) => arg.startsWith('--db='));
const db = dbArg?.slice('--db='.length) ?? '';
const safeDbPattern = /^bcb_saas_[a-z0-9_]+_(scratch|rehearsal)_[a-z0-9_]+$/;
const forbiddenDbToken = /(^|_)(prod|production|test|testing|dev|development)(_|$)/;

if (!process.argv.includes('--execute') || !safeDbPattern.test(db) || forbiddenDbToken.test(db)) {
  throw new Error(
    'usage: node rehearse-patient-content-diary-rls.mjs --execute --db=bcb_saas_<name>_(scratch|rehearsal)_<suffix>',
  );
}

const sql = String.raw`
\set ON_ERROR_STOP on
BEGIN;

SELECT 1 / (to_regclass('public.content_pages') IS NOT NULL)::int;
SELECT 1 / (to_regclass('public.reference_items') IS NOT NULL)::int;
SELECT 1 / has_table_privilege('app_patient', 'public.content_pages', 'SELECT')::int;
SELECT 1 / has_table_privilege('app_patient', 'public.org_enrollments', 'SELECT')::int;
SELECT 1 / (NOT has_table_privilege('app_patient', 'public.org_enrollments', 'INSERT'))::int;
SELECT 1 / (NOT has_table_privilege('app_patient', 'public.org_enrollments', 'UPDATE'))::int;
SELECT 1 / (NOT has_table_privilege('app_patient', 'public.org_enrollments', 'DELETE'))::int;

-- Give each walkthrough clinic one published page. These rows exist only inside this rolled-back
-- proof transaction and make the positive and negative content policy checks deterministic.
INSERT INTO public.content_pages (section, slug, title, organization_id, is_published)
VALUES
  ('rehearsal', 'patient-content-a-' || pg_backend_pid()::text, 'Patient content A', '53000000-0000-4000-8000-0000000000a1', true),
  ('rehearsal', 'patient-content-b-' || pg_backend_pid()::text, 'Patient content B', '53000000-0000-4000-8000-0000000000b1', true);

-- Clinic A representative patient: visible current-org content and diary reference rows,
-- with Clinic B remaining invisible even when explicitly addressed.
DO $proof$ DECLARE n text := 'content-diary-a-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
  SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id = true;
  h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a101',''),s,'sha256'),'hex');
  PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a101',NULL,h);
END $proof$;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT count(*) FROM public.content_pages) > 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.content_pages
  WHERE organization_id <> '53000000-0000-4000-8000-0000000000a1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.reference_items item
  JOIN public.reference_categories category ON category.id = item.category_id
  WHERE category.code = 'symptom_type') > 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.reference_items
  WHERE organization_id = '53000000-0000-4000-8000-0000000000b1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id = '53000000-0000-4000-8000-00000000a101'
    AND organization_id = '53000000-0000-4000-8000-0000000000a1') = 1)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id <> '53000000-0000-4000-8000-00000000a101') = 0)::int;
RESET SESSION AUTHORIZATION;
DO $proof$ BEGIN PERFORM app.reset_principal_context(); END $proof$;

-- Clinic B representative patient gets the symmetric result.
DO $proof$ DECLARE n text := 'content-diary-b-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
  SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id = true;
  h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a201',''),s,'sha256'),'hex');
  PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a201',NULL,h);
END $proof$;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT count(*) FROM public.content_pages) > 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.content_pages
  WHERE organization_id <> '53000000-0000-4000-8000-0000000000b1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.reference_items item
  JOIN public.reference_categories category ON category.id = item.category_id
  WHERE category.code = 'symptom_type') > 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.reference_items
  WHERE organization_id = '53000000-0000-4000-8000-0000000000a1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id = '53000000-0000-4000-8000-00000000a201'
    AND organization_id = '53000000-0000-4000-8000-0000000000b1') = 1)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id <> '53000000-0000-4000-8000-00000000a201') = 0)::int;
RESET SESSION AUTHORIZATION;
DO $proof$ BEGIN PERFORM app.reset_principal_context(); END $proof$;

-- Cross-org forgery: patient A is not enrolled in B, therefore both surfaces fail closed.
DO $proof$ DECLARE n text := 'content-diary-cross-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
  SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id = true;
  h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a101',''),s,'sha256'),'hex');
  PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a101',NULL,h);
END $proof$;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT count(*) FROM public.content_pages) = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.reference_items) = 0)::int;
-- The enrollment wall is patient-owned (organization selection remains an application filter):
-- the forged B context cannot reveal a B enrollment or another patient, but patient A may still
-- see its own legitimate A enrollment.
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id <> '53000000-0000-4000-8000-00000000a101') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE organization_id = '53000000-0000-4000-8000-0000000000b1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id = '53000000-0000-4000-8000-00000000a101'
    AND organization_id = '53000000-0000-4000-8000-0000000000a1') = 1)::int;
RESET SESSION AUTHORIZATION;
DO $proof$ BEGIN PERFORM app.reset_principal_context(); END $proof$;

-- Shared patient is legitimately enrolled in both organizations; the selected org remains narrow.
DO $proof$ DECLARE n text := 'content-diary-shared-a-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
  SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id = true;
  h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a301',''),s,'sha256'),'hex');
  PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a301',NULL,h);
END $proof$;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT count(*) FROM public.content_pages) > 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.content_pages
  WHERE organization_id <> '53000000-0000-4000-8000-0000000000a1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments) = 2)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id <> '53000000-0000-4000-8000-00000000a301') = 0)::int;
RESET SESSION AUTHORIZATION;
DO $proof$ BEGIN PERFORM app.reset_principal_context(); END $proof$;

DO $proof$ DECLARE n text := 'content-diary-shared-b-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
  SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id = true;
  h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a301',''),s,'sha256'),'hex');
  PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a301',NULL,h);
END $proof$;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((SELECT count(*) FROM public.content_pages) > 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.content_pages
  WHERE organization_id <> '53000000-0000-4000-8000-0000000000b1') = 0)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments) = 2)::int;
SELECT 1 / ((SELECT count(*) FROM public.org_enrollments
  WHERE platform_user_id <> '53000000-0000-4000-8000-00000000a301') = 0)::int;
RESET SESSION AUTHORIZATION;

ROLLBACK;
`;

const result = spawnSync(
  'sudo',
  ['-n', '-u', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', db],
  { encoding: 'utf8', input: sql },
);

if (result.status !== 0) {
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  throw new Error(`patient content/diary RLS rehearsal failed: ${result.status}`);
}

console.log(
  'Patient content/diary RLS rehearsal: PASS (A/B/cross-org/shared; transaction rolled back)',
);
