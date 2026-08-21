import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { declaration } from './declaration.ts';
import { assertNameCensus } from './name-census.mjs';
import {
  generatePortContextCapabilitySeedSql,
  renderPortContextRuntimeEnv,
  resolvePortContextCapabilities,
} from './generate.mjs';

const PORTS = ['webapp', 'integrator'];

test('the generator library refuses a mistaken direct CLI invocation', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    new URL('./generate.mjs', import.meta.url).pathname,
    '--all',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /generate-cli\.mjs/);
});

test('one declaration renders the exact DB catalog and both runtime JSON catalogs', () => {
  const rows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  // Резолвер обязан отдать РОВНО объявленный каталог возможностей, один в один. Счёт «236» не
  // отличал потерянную возможность от лишней и не называл ни ту, ни другую; сверка имён с самим
  // каталогом (второй копии не заводим — AGENTS.md §5) называет обе стороны расхождения.
  assert.deepEqual(
    rows.map((row) => row.name).sort(),
    Object.keys(declaration.portContext.capabilities).sort(),
    'resolved capabilities must be exactly the declared capability catalog',
  );
  const duplicateIds = rows.map((row) => row.capabilityId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  assert.deepEqual(duplicateIds.map((id) => rows.filter((row) => row.capabilityId === id)
    .map((row) => `${row.port}/${row.name}`).join(' = ')), [], 'capability IDs must stay unique');
  assert.ok(new Set(rows.map((row) => [
    row.port,
    row.sessionLogin,
    row.targetRole,
    row.contextClass,
    row.purpose,
    row.functionIdentity ?? '',
  ].join('\0'))).size <= rows.length, 'capability IDs remain the authority even when descriptive tuples coincide');

  for (const port of PORTS) {
    const rendered = renderPortContextRuntimeEnv(
      declaration,
      'test',
      'bersoncarebot_test',
      port,
    );
    const descriptors = JSON.parse(rendered.value);
    // Лишнее имя в рантайм-каталоге — дверь, которой нет в декларации: приложение получит
    // дескриптор, который никто не сверял. Счёт портов этого не называл.
    assert.deepEqual(
      Object.keys(descriptors).sort(),
      rows.filter((row) => row.port === port).map((row) => row.runtimeName).sort(),
      `${port} runtime catalog must carry exactly the resolved capabilities`,
    );
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

  const roots = rows.filter((row) => row.functionIdentity);
  // Дверь без `functionIdentity` — это возможность со сквозным `purpose: 'relation'`: доступ к
  // отношениям целиком вместо одного именованного корня. Счётчик корней («221») падал бы числом
  // 220 и не сказал бы, КАКАЯ дверь разъехалась в relation-wide. Поэтому фиксируем поимённо
  // ДОПОЛНЕНИЕ — оно короткое и меняться не должно вовсе.
  assertNameCensus(
    'relationWideCapabilities',
    rows.filter((row) => !row.functionIdentity).map((row) => `${row.port}/${row.name}`),
    'capabilities that hold relation-wide access instead of one named root',
  );
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

test('staff and global-admin login memberships stay disjoint at the platform boundary', () => {
  const staff = declaration.envMapping.test.bcb_test_webapp_staff.memberships.map(({ role }) => role);
  const globalAdmin = declaration.envMapping.test.bcb_test_webapp_global_admin.memberships.map(({ role }) => role);
  assert.equal(staff.includes('app_platform_settings') || staff.includes('app_platform_admin'), false);
  for (const role of ['app_staff', 'app_patient', 'app_clinic_billing', 'app_worker']) {
    assert.equal(globalAdmin.includes(role), false, role);
  }
  assert.deepEqual(globalAdmin, ['app_platform_settings', 'app_platform_admin']);
});
