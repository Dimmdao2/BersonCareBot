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
  'app.list_google_calendar_probe_organization_ids()',
  'app.open_or_touch_operator_probe_incident(text,text,text)',
  'app.read_integrator_clinic_delivery_credential(text,uuid)',
  'app.read_integrator_google_calendar_setting(text,uuid)',
  'app.read_integrator_runtime_setting(text)',
  'app.read_operational_verbose_log_flag()',
  'app.read_operator_health_probe_config()',
  'app.read_operator_outbound_probe_meta()',
  'app.read_saas_isolation_test_scenario_fixture_counts()',
  'app.record_operational_delivery_attempt_audit(text,text,text,text,text,integer,text,jsonb,timestamp with time zone)',
  'app.record_operator_outbound_probe_run(text,timestamp with time zone,text,jsonb)',
  'app.resolve_operator_probe_incidents(text)',
  'app.set_saas_isolation_test_scenario(text)',
].sort();

const functionsFor = (database) => Object.entries(declaration.portContext.functions)
  .filter(([, fn]) => !fn.databases || fn.databases.includes(database));

test('legacy 244/42 census is restored without obsolete context and overlaid by rev10', () => {
  assert.equal(LEGACY_DEFINER_CENSUS_COUNT, 244);
  assert.deepEqual(BUSINESS_SEAM_STATS, {
    functions: 238,
    owners: 41,
    test: 238,
    dev: 225,
    triggers: 3,
    relationEdges: 467,
  });
  assert.equal(Object.keys(BUSINESS_SEAM_FUNCTIONS).length, 238);
  assert.equal(new Set(Object.keys(BUSINESS_SEAM_FUNCTIONS)).size, 238);
  for (const signature of OBSOLETE_CONTEXT_SIGNATURES) {
    assert.equal(declaration.portContext.functions[signature], undefined, signature);
  }
  for (const signature of [
    'app.install_port_context(uuid,app.port_context_claims)',
    'app.clear_port_context()',
    'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)',
    'app.require_platform_principal()',
    'app.current_actor_user_id()',
    'app_ext.resolve_variant_a_identity(uuid)',
  ]) assert.ok(declaration.portContext.functions[signature], signature);

  const testFunctions = functionsFor('bersoncarebot_test');
  const devFunctions = functionsFor('bcb_webapp_dev');
  assert.equal(testFunctions.filter(([, fn]) => fn.security === 'DEFINER').length, 247);
  assert.equal(devFunctions.filter(([, fn]) => fn.security === 'DEFINER').length, 234);
  assert.equal(testFunctions.length, 249);
  assert.equal(devFunctions.length, 236);
  assert.equal(new Set(testFunctions.filter(([, fn]) => fn.security === 'DEFINER').map(([, fn]) => fn.owner)).size, 42);
  assert.deepEqual(Object.entries(BUSINESS_SEAM_FUNCTIONS)
    .filter(([, fn]) => fn.databases.length === 1).map(([signature]) => signature).sort(), TEST_ONLY);
  const proconfigExceptions = Object.entries(BUSINESS_SEAM_FUNCTIONS)
    .filter(([, fn]) => fn.proconfig[0] !== 'search_path=pg_catalog')
    .map(([signature, fn]) => [signature, fn.proconfig[0]]);
  assert.equal(Object.values(BUSINESS_SEAM_FUNCTIONS)
    .filter((fn) => fn.proconfig[0] === 'search_path=pg_catalog').length, 235);
  assert.deepEqual(proconfigExceptions, [
    ['app.close_active_user_phone_history(uuid)', 'search_path=app, public, pg_catalog'],
    ['app.list_web_push_reminder_organization_ids(timestamp with time zone)', 'search_path=pg_catalog, public'],
    ['app.read_outbound_provider_incident_health()', 'search_path=pg_catalog, public'],
  ]);
});

test('all 42 seam owners and function callers have the closed role shape', () => {
  const owners = new Set(Object.values(declaration.portContext.functions)
    .filter((fn) => fn.security === 'DEFINER').map((fn) => fn.owner));
  assert.equal(owners.size, 42);
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
    if (fn.invocation === 'trigger') assert.deepEqual(fn.execute, [], signature);
    else assert.ok(fn.execute.length > 0, signature);
    assert.ok(fn.relationSurfaces.length > 0 || fn.delegatesTo.length > 0, signature);
    for (const surface of fn.relationSurfaces) {
      assert.ok(surface.columns.length > 0, `${signature}:${surface.relation}`);
      assert.ok(surface.operations.length > 0, `${signature}:${surface.relation}`);
    }
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
      caller: 'app_integrator_resolver',
      invocation: 'runtime',
      columns: ['channel', 'organization_id', 'credential_fingerprint', 'is_active'],
      operations: ['SELECT'],
      purpose: 'resolve one active dedicated-bot binding by channel and credential fingerprint',
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

test('unimplemented relation APIs remain explicit fail-closed generation gaps', () => {
  for (const database of DATABASES) {
    const gaps = collectGaps(declaration, database);
    assert.equal(gaps.length, 223);
    for (const relation of ['public.booking_calendar_map', 'public.phone_messenger_bind_secrets']) {
      assert.ok(gaps.some((gap) => gap.site.includes(relation) && gap.reason.includes('missing named API')), `${database}:${relation}`);
    }
  }
});

test('per-DB function SQL is deterministic and contains the bilateral metadata check', () => {
  for (const database of DATABASES) {
    const first = generateFunctionCensusSql(declaration, database);
    assert.equal(generateFunctionCensusSql(declaration, database), first);
    assert.match(first, /function census catalog mismatch/);
    assert.match(first, /REVOKE ALL ON FUNCTION app\.resolve_clinic_dedicated_bot_organization\(text,text\) FROM PUBLIC/);
    assert.doesNotMatch(first, /install_signed_context|release_principal_context|reset_principal_context/);
    for (const signature of TEST_ONLY) {
      if (database === 'bersoncarebot_test') assert.ok(first.includes(`ALTER FUNCTION ${signature} OWNER TO`), signature);
      else assert.equal(first.includes(`ALTER FUNCTION ${signature} OWNER TO`), false, signature);
    }
  }
});
