import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  BUSINESS_SEAM_FUNCTIONS,
  BUSINESS_SEAM_STATS,
  LEGACY_DEFINER_CENSUS_COUNT,
  OBSOLETE_CONTEXT_SIGNATURES,
} from './function-census.ts';
import { collectGaps, generateFunctionCensusSql } from './generate.mjs';

const DATABASES = ['bersoncarebot_test', 'bcb_webapp_dev'];
const TEST_ONLY = [
  'app.read_saas_isolation_test_scenario_fixture_counts()',
  'app.set_saas_isolation_test_scenario(text)',
].sort();
const GENUINE_PRE_SESSION_FUNCTIONS = `
auth_login_token_confirm
auth_login_token_create
auth_login_token_mark_session_issued
auth_login_token_read
auth_oauth_find_user
auth_oauth_upsert_binding
auth_rate_limit_check_and_record
email_auth_find_email_otp_lock
email_auth_register_email_otp_lockout
email_auth_reset_email_otp_lockout
get_public_reference_baseline
read_saas_billing_payment_provider_preauth
resolve_patient_acquiring_webhook_organization
is_organization_slug_available
is_smtp_outbound_configured
integrator_event_idempotency_read
integrator_event_idempotency_store
phone_auth_find_latest_challenge_created_at
phone_auth_find_otp_lock
phone_auth_register_otp_lockout
phone_auth_reset_otp_lockout
phone_challenge_store_delete
phone_challenge_store_delete_by_phone
phone_challenge_store_increment_attempts
phone_challenge_store_read
phone_challenge_store_upsert
phone_otp_public_booking_consume_challenge
phone_otp_public_booking_issue_challenge
`.trim().split('\n');

const functionsFor = (database) => Object.entries(declaration.portContext.functions)
  .filter(([, fn]) => !fn.databases || fn.databases.includes(database));

test('legacy 244/42 census is restored without obsolete context and overlaid by rev10', () => {
  assert.equal(LEGACY_DEFINER_CENSUS_COUNT, 244);
  assert.deepEqual(BUSINESS_SEAM_STATS, {
    functions: 229,
    owners: 40,
    test: 229,
    dev: 227,
    triggers: 3,
    relationEdges: 470,
  });
  assert.equal(Object.keys(BUSINESS_SEAM_FUNCTIONS).length, 229);
  assert.equal(new Set(Object.keys(BUSINESS_SEAM_FUNCTIONS)).size, 229);
  for (const signature of OBSOLETE_CONTEXT_SIGNATURES) {
    assert.equal(declaration.portContext.functions[signature], undefined, signature);
  }
  for (const signature of [
    'app.install_port_context(uuid,app.port_context_claims)',
    'app.clear_port_context()',
    'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)',
    'app.require_attested_target_role(name,name[])',
    'app.require_platform_principal()',
    'app.current_actor_user_id()',
    'app_ext.resolve_variant_a_identity(uuid)',
  ]) assert.ok(declaration.portContext.functions[signature], signature);

  const testFunctions = functionsFor('bersoncarebot_test');
  const devFunctions = functionsFor('bcb_webapp_dev');
  assert.equal(testFunctions.filter(([, fn]) => fn.security === 'DEFINER').length, 317);
  assert.equal(devFunctions.filter(([, fn]) => fn.security === 'DEFINER').length, 315);
  assert.equal(testFunctions.length, 333);
  assert.equal(devFunctions.length, 331);
  assert.equal(new Set(testFunctions.filter(([, fn]) => fn.security === 'DEFINER').map(([, fn]) => fn.owner)).size, 44);
  assert.deepEqual(Object.entries(BUSINESS_SEAM_FUNCTIONS)
    .filter(([, fn]) => fn.databases.length === 1).map(([signature]) => signature).sort(), TEST_ONLY);
  const proconfigExceptions = Object.entries(BUSINESS_SEAM_FUNCTIONS)
    .filter(([, fn]) => fn.proconfig[0] !== 'search_path=pg_catalog')
    .map(([signature, fn]) => [signature, fn.proconfig[0]]);
  assert.equal(Object.values(BUSINESS_SEAM_FUNCTIONS)
    .filter((fn) => fn.proconfig[0] === 'search_path=pg_catalog').length, 223);
  assert.deepEqual(proconfigExceptions, [
    ['app.accept_org_invite(text,uuid,text)', 'search_path=pg_catalog, app, public, pg_temp'],
    ['app.close_active_user_phone_history(uuid)', 'search_path=app, public, pg_catalog'],
    ['app.list_web_push_reminder_organization_ids(timestamp with time zone)', 'search_path=pg_catalog, public'],
    ['app.read_outbound_provider_incident_health()', 'search_path=pg_catalog, public'],
    ['app.resolve_saas_billing_invoice_for_webhook(text,text)', 'search_path=pg_catalog, app, public, pg_temp'],
    ['app.resolve_saas_billing_refund_for_webhook(text,text)', 'search_path=pg_catalog, app, public, pg_temp'],
  ]);
});

test('all 43 application seam owners and function callers have the closed role shape', () => {
  const owners = new Set(Object.values(declaration.portContext.functions)
    .filter((fn) => fn.security === 'DEFINER' && fn.owner !== 'postgres').map((fn) => fn.owner));
  assert.equal(owners.size, 43);
  const loginNames = new Set(Object.values(declaration.envMapping).flatMap((records) => Object.keys(records)));
  for (const owner of owners) {
    const role = declaration.cluster.roles[owner];
    assert.ok(role, owner);
    assert.equal(role.login, false, owner);
    assert.equal(role.superuser, false, owner);
    assert.equal(role.bypassrls, false, owner);
    assert.equal(role.inherit, false, owner);
    assert.deepEqual(role.members, [], owner);
  }
  for (const [signature, fn] of Object.entries(BUSINESS_SEAM_FUNCTIONS)) {
    assert.equal(fn.execute.some((role) => loginNames.has(role) || role === 'PUBLIC'), false, signature);
    if (fn.invocation === 'trigger' || fn.invocation === 'internal') {
      assert.deepEqual(fn.execute, [], signature);
    }
    else assert.ok(fn.execute.length > 0, signature);
    assert.ok(fn.relationSurfaces.length > 0 || fn.delegatesTo.length > 0, signature);
    for (const surface of fn.relationSurfaces) {
      assert.ok(surface.columns.length > 0, `${signature}:${surface.relation}`);
      assert.ok(surface.operations.length > 0, `${signature}:${surface.relation}`);
    }
  }
});

test('all 28 genuine pre-session roots have app_pre_session as their only caller', () => {
  assert.equal(GENUINE_PRE_SESSION_FUNCTIONS.length, 28);
  for (const functionName of GENUINE_PRE_SESSION_FUNCTIONS) {
    const matches = Object.entries(BUSINESS_SEAM_FUNCTIONS)
      .filter(([signature]) => signature.startsWith(`app.${functionName}(`));
    assert.equal(matches.length, 1, functionName);
    assert.deepEqual(matches[0][1].execute, ['app_pre_session'], matches[0][0]);
  }
});

test('dedicated bot relation carries its runtime resolver and non-runtime trigger as two seams', () => {
  for (const database of DATABASES) {
    const access = declaration.databases[database].tables['public.clinic_dedicated_bot_bindings'].access;
    assert.equal(access.kind, 'named-seams');
    assert.equal(access.seams.length, 2);
    assert.deepEqual(access.seams[0], {
      regprocedure: 'app.resolve_clinic_dedicated_bot_organization(text,text)',
      owner: 'app_seam_dedicated_bot_owner',
      callers: ['app_integrator_resolver'],
      invocation: 'runtime',
      columns: ['channel', 'organization_id', 'credential_fingerprint', 'is_active'],
      operations: ['SELECT'],
      purpose: 'evidence/25+30 narrow seam owned by app_seam_dedicated_bot_owner: public.clinic_dedicated_bot_bindings',
    });
    assert.equal(access.seams[1].regprocedure, 'app.sync_clinic_dedicated_bot_binding()');
    assert.equal(access.seams[1].invocation, 'trigger');
    assert.equal(access.seams[1].caller, undefined);
  }
  const mutated = structuredClone(declaration);
  mutated.databases.bersoncarebot_test.tables['public.clinic_dedicated_bot_bindings'].access.seams.push(
    structuredClone(mutated.databases.bersoncarebot_test.tables['public.clinic_dedicated_bot_bindings'].access.seams[0]),
  );
  assert.ok(collectGaps(mutated, 'bersoncarebot_test').some((gap) => gap.reason.includes('duplicate seam')));
});

test('complete relation APIs leave no generation gap', () => {
  for (const database of DATABASES) {
    const gaps = collectGaps(declaration, database);
    assert.equal(gaps.length, 0);
  }
});

test('per-DB function SQL is deterministic and contains the bilateral metadata check', () => {
  for (const database of DATABASES) {
    const first = generateFunctionCensusSql(declaration, database);
    assert.equal(generateFunctionCensusSql(declaration, database), first);
    assert.match(first, /function census catalog mismatch/);
    assert.match(first, /n\.nspname IN \('public', 'app', 'integrator', 'app_ext', 'app_control', 'drizzle'\)/);
    assert.match(first, /am\.member = 'app_seam_dedicated_bot_owner'::regrole/);
    assert.match(first, /am\.roleid = 'app_seam_dedicated_bot_owner'::regrole/);
    assert.match(first, /REVOKE ALL ON FUNCTION app\.resolve_clinic_dedicated_bot_organization\(text,text\) FROM PUBLIC/);
    assert.match(first, /BCB_FUNCTION_BODY_SURFACES_VERIFIED rows=/);
    assert.match(first, /ON CONFLICT DO UPDATE requires undeclared UPDATE/);
    assert.match(first, /ON CONFLICT DO UPDATE requires undeclared SELECT for conflict\/update row/);
    assert.match(first, /targeted ON CONFLICT DO NOTHING requires undeclared SELECT for conflict row/);
    assert.match(first, /targetless ON CONFLICT DO NOTHING was classified as requiring SELECT/);
    assert.match(first, /indexed ON CONFLICT DO NOTHING was not classified as requiring SELECT/);
    assert.match(first, /constrained ON CONFLICT DO NOTHING was not classified as requiring SELECT/);
    assert.match(first, /UPDATE predicate\/RETURNING requires undeclared SELECT/);
    assert.match(first, /app\.record_operator_outbound_probe_run\(text,timestamp with time zone,text,jsonb\)/);
    assert.doesNotMatch(first, /install_signed_context|release_principal_context|reset_principal_context/);
    for (const signature of TEST_ONLY) {
      if (database === 'bersoncarebot_test') assert.ok(first.includes(`ALTER FUNCTION ${signature} OWNER TO`), signature);
      else assert.equal(first.includes(`ALTER FUNCTION ${signature} OWNER TO`), false, signature);
    }
  }
});
