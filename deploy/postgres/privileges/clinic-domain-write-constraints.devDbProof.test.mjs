/**
 * Opt-in live DEV proof for B1a/B2.  It writes through PostgreSQL constraints inside one
 * transaction and always rolls it back: a service label cannot become a clinic slug, and a
 * second organization cannot claim the same non-empty custom hostname.
 *
 * Run: RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test \
 *   deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB === '1';
const DATABASE = process.env.CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n',
      '-u',
      'postgres',
      'psql',
      '-X',
      '-A',
      '-t',
      '-q',
      '-h',
      '/var/run/postgresql',
      '-p',
      '5432',
      '-d',
      DATABASE,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

test('database write rejects a service label as an organization slug', { skip: !ENABLED }, () => {
  const result = psql(`
BEGIN;
DO $$
DECLARE
  v_org uuid;
  v_actor uuid;
  v_constraint text;
BEGIN
  SELECT id INTO v_org FROM public.be_organizations ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM public.platform_users ORDER BY id LIMIT 1;
  IF v_org IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'DEV fixture requires one organization and one platform user';
  END IF;
  BEGIN
    INSERT INTO public.organization_slug_claims
      (slug, kind, organization_id, created_by_platform_user_id)
    VALUES ('www', 'reservation', v_org, v_actor);
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'organization_slug_claims_slug_reserved_check' THEN
      RAISE;
    END IF;
    PERFORM set_config('bcb.result', 'reserved_slug_rejected', false);
  END;
  IF current_setting('bcb.result', true) IS DISTINCT FROM 'reserved_slug_rejected' THEN
    RAISE EXCEPTION 'reserved slug write unexpectedly succeeded';
  END IF;
END $$;
SELECT current_setting('bcb.result');
ROLLBACK;
`);
  assert.equal(result, 'reserved_slug_rejected');
});

test(
  'database write rejects an all-numeric label reserved by the application policy',
  { skip: !ENABLED },
  () => {
    const result = psql(`
BEGIN;
DO $$
DECLARE
  v_org uuid;
  v_actor uuid;
  v_constraint text;
BEGIN
  SELECT id INTO v_org FROM public.be_organizations ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM public.platform_users ORDER BY id LIMIT 1;
  IF v_org IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'DEV fixture requires one organization and one platform user';
  END IF;
  BEGIN
    INSERT INTO public.organization_slug_claims
      (slug, kind, organization_id, created_by_platform_user_id)
    VALUES ('123', 'reservation', v_org, v_actor);
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'organization_slug_claims_slug_numeric_check' THEN
      RAISE;
    END IF;
    PERFORM set_config('bcb.result', 'numeric_slug_rejected', false);
  END;
  IF current_setting('bcb.result', true) IS DISTINCT FROM 'numeric_slug_rejected' THEN
    RAISE EXCEPTION 'all-numeric reserved slug write unexpectedly succeeded';
  END IF;
END $$;
SELECT current_setting('bcb.result');
ROLLBACK;
`);
    assert.equal(result, 'numeric_slug_rejected');
  },
);

test(
  'database write rejects a custom hostname already claimed by another organization',
  { skip: !ENABLED },
  () => {
    const result = psql(`
BEGIN;
DO $$
DECLARE
  v_first_org uuid;
  v_second_org uuid;
  v_hostname text := 'b1-' || txid_current()::text || '.example.test';
  v_constraint text;
BEGIN
  SELECT id INTO v_first_org FROM public.be_organizations ORDER BY id LIMIT 1;
  SELECT id INTO v_second_org
    FROM public.be_organizations WHERE id <> v_first_org ORDER BY id LIMIT 1;
  IF v_first_org IS NULL OR v_second_org IS NULL THEN
    RAISE EXCEPTION 'DEV fixture requires two organizations';
  END IF;
  INSERT INTO public.system_settings (key, scope, organization_id, value_json)
  VALUES ('org_custom_domain_hostname', 'admin', v_first_org, jsonb_build_object('value', v_hostname));
  BEGIN
    INSERT INTO public.system_settings (key, scope, organization_id, value_json)
    VALUES ('org_custom_domain_hostname', 'admin', v_second_org, jsonb_build_object('value', upper(v_hostname)));
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'system_settings_org_custom_domain_hostname_uidx' THEN
      RAISE;
    END IF;
    PERFORM set_config('bcb.result', 'duplicate_hostname_rejected', false);
  END;
  IF current_setting('bcb.result', true) IS DISTINCT FROM 'duplicate_hostname_rejected' THEN
    RAISE EXCEPTION 'duplicate custom hostname write unexpectedly succeeded';
  END IF;
END $$;
SELECT current_setting('bcb.result');
ROLLBACK;
`);
    assert.equal(result, 'duplicate_hostname_rejected');
  },
);
