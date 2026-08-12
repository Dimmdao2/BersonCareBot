import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  generateCatalogClosureVerifierSql,
  generatePortContextCapabilitySeedSql,
  renderEnvSql,
  renderPortContextRuntimeEnv,
  resolvePortContextCapabilities,
} from './generate.mjs';

const EXPECTED = {
  webapp: 64,
  integrator: 22,
};

test('one declaration renders the exact DB catalog and both runtime JSON catalogs', () => {
  const rows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  assert.equal(rows.length, 86);
  assert.equal(new Set(rows.map((row) => row.capabilityId)).size, 86);
  assert.ok(new Set(rows.map((row) => [
    row.port,
    row.sessionLogin,
    row.targetRole,
    row.contextClass,
    row.purpose,
    row.functionIdentity ?? '',
  ].join('\0'))).size <= rows.length, 'capability IDs remain the authority even when descriptive tuples coincide');

  for (const [port, count] of Object.entries(EXPECTED)) {
    const rendered = renderPortContextRuntimeEnv(
      declaration,
      'test',
      'bersoncarebot_test',
      port,
    );
    const descriptors = JSON.parse(rendered.value);
    assert.equal(Object.keys(descriptors).length, count);
    for (const row of rows.filter((candidate) => candidate.port === port)) {
      assert.deepEqual(descriptors[row.runtimeName], {
        capabilityId: row.capabilityId,
        targetRole: row.targetRole,
        contextClass: row.contextClass,
        purpose: row.purpose,
        ...(row.functionIdentity ? { functionIdentity: row.functionIdentity } : {}),
        ...(row.runtimeSources?.length ? { runtimeSources: row.runtimeSources } : {}),
      });
    }
  }

  const integrator = JSON.parse(renderPortContextRuntimeEnv(
    declaration, 'test', 'bersoncarebot_test', 'integrator',
  ).value);
  const webapp = JSON.parse(renderPortContextRuntimeEnv(
    declaration, 'test', 'bersoncarebot_test', 'webapp',
  ).value);
  for (const name of ['delivery', 'scheduler', 'service', 'resolver']) {
    assert.equal(integrator[name].purpose, 'relation');
    if (name !== 'resolver') assert.ok(integrator[name].runtimeSources.length > 0);
  }
  for (const name of ['worker', 'telemetry']) {
    assert.equal(webapp[name].purpose, 'relation');
    assert.ok(webapp[name].runtimeSources.length > 0);
  }
  assert.equal(webapp.pre_session, undefined, 'anonymous bootstrap has no relation-wide fallback');
  assert.equal(webapp.tenant_service, undefined);
  assert.equal(webapp.service, undefined);

  const seed = generatePortContextCapabilitySeedSql(declaration, 'bersoncarebot_test');
  const roots = rows.filter((row) => row.functionIdentity);
  assert.equal(roots.length, 72);
  const identityResolvers = roots.filter(
    (row) => row.functionIdentity === 'app.pre_session_resolve_identity(uuid)',
  );
  assert.deepEqual(
    identityResolvers.map((row) => [row.runtimeName, row.sessionLogin]),
    [
      ['globalAdmin_identity_resolve', 'bcb_test_webapp_global_admin'],
      ['patient_identity_resolve', 'bcb_test_webapp_patient'],
      ['staff_identity_resolve', 'bcb_test_webapp_staff'],
    ],
  );
  for (const row of rows) {
    assert.match(seed, new RegExp(row.capabilityId));
    if (row.functionIdentity) {
      assert.match(seed, new RegExp(row.functionIdentity.replace(/[()]/g, '\\$&')));
    }
  }
  assert.equal((seed.match(/NULL::regprocedure/g) ?? []).length, rows.length - roots.length);
  assert.match(seed, /DELETE FROM app_ext\.accepted_port_contexts;/);
  assert.match(seed, /DELETE FROM app_ext\.port_context_capabilities;/);
  assert.doesNotMatch(seed, /existing\.function_identity IS NOT NULL/);
});

test('relation capability mutations are visible to the declaration-owned seed', () => {
  const mutated = structuredClone(declaration);
  const descriptor = mutated.portContext.capabilities.integrator_delivery_relation;
  descriptor.contextClass = 'integrator';
  const seed = generatePortContextCapabilitySeedSql(mutated, 'bersoncarebot_test');
  const original = generatePortContextCapabilitySeedSql(declaration, 'bersoncarebot_test');
  assert.notEqual(seed, original);
  assert.match(seed, /'app_operational_delivery_worker'::name, 'integrator'::app\.port_context_class/);
});

test('capability IDs are stable per database and do not cross environments', () => {
  const testRows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  const devRows = resolvePortContextCapabilities(declaration, 'bcb_webapp_dev');
  assert.deepEqual(
    resolvePortContextCapabilities(declaration, 'bersoncarebot_test'),
    testRows,
  );
  assert.equal(
    testRows.some((row) => devRows.some((candidate) => candidate.capabilityId === row.capabilityId)),
    false,
  );
});

test('every descriptor target is SET-able by its exact session login', () => {
  assert.doesNotThrow(() => resolvePortContextCapabilities(declaration, 'bersoncarebot_test'));

  const unreachable = structuredClone(declaration);
  const staffLogin = unreachable.envMapping.test.bcb_test_webapp_staff;
  staffLogin.memberships = staffLogin.memberships.filter((membership) => membership.role !== 'app_worker');
  assert.throws(
    () => resolvePortContextCapabilities(unreachable, 'bersoncarebot_test'),
    /bcb_test_webapp_staff must have exactly one SET-able membership in app_worker/,
  );
});

test('env login render restores app schema usage after the deny-by-default artifact', () => {
  const sql = renderEnvSql(declaration, 'test', 'bersoncarebot_test');
  assert.match(sql, /SET LOCAL password_encryption = 'scram-sha-256';/);
  for (const login of [
    'bcb_test_webapp_staff', 'bcb_test_webapp_patient',
    'bcb_test_webapp_global_admin', 'bcb_test_integrator',
  ]) {
    assert.match(sql, new RegExp(`GRANT USAGE ON SCHEMA "app" TO "${login}";`));
  }
  assert.doesNotMatch(sql, /GRANT USAGE ON SCHEMA "app_ext" TO "bcb_test_/);
});

test('staff and global-admin login memberships stay disjoint at the platform boundary', () => {
  const staff = declaration.envMapping.test.bcb_test_webapp_staff.memberships.map(({ role }) => role);
  const globalAdmin = declaration.envMapping.test.bcb_test_webapp_global_admin.memberships.map(({ role }) => role);
  assert.equal(staff.includes('app_platform_settings') || staff.includes('app_platform_admin'), false);
  for (const role of ['app_staff', 'app_patient', 'app_clinic_billing', 'app_worker']) {
    assert.equal(globalAdmin.includes(role), false, role);
  }
  assert.deepEqual(globalAdmin, ['app_platform_settings', 'app_platform_admin']);
});

test('catalog closure requires one exact owner policy on every private relation', () => {
  const sql = generateCatalogClosureVerifierSql(declaration, 'bersoncarebot_test');
  for (const [identity, relation] of Object.entries(declaration.portContext.privateRelations)) {
    const [schema, name] = identity.split('.');
    assert.match(sql, new RegExp(`bcb_private_owner_${schema}_${name}`));
    assert.match(sql, new RegExp(relation.owner));
  }
  assert.match(sql, /private relation owner policy missing or non-exact/);
});
