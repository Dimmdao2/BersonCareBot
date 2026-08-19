import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  generateCatalogClosureVerifierSql,
  generateEnvLoginVariableSql,
  generatePortContextCapabilitySeedSql,
  generatePrivilegesSql,
  generateSharedRoleVerifierSql,
  renderEnvSql,
  renderPortContextRuntimeEnv,
  resolvePortContextCapabilities,
} from './generate.mjs';

// +3 (19.08): три возможности миграции 0030 — один корень аудитории доставки под `tenant_service`
// и два класса (`pre_session`, `service`) на одном теле операторских адресатов.
const EXPECTED = {
  // 183 → 184 (19.08): `retention_sweep` — одна дверь уборки по сроку хранения (миграция 0031).
  // 184 → 186 (19.08): `patient_outbound_message_enqueue` + `staff_outbound_message_enqueue` —
  // одна дверь постановки исходящего сообщения, два класса контекста (миграция 0033).
  // 186 → 187 (19.08): `appointment_reminder_generation_replace` — миграция 0034.
  // 187 → 189 (19.08): два корня контактов формы записи из миграции 0037.
  // 189 → 190 (19.08): `health_digest_last_sent_read` — одна дверь чтения времени последней
  // подтверждённой отправки сводки (миграция 0038).
  // 190 → 192 (19.08): `delivery_queue_health_read` + `health_digest_enqueue` — миграция 0039.
  // 192 → 194 (19.08): `operator_alert_staff_push_audience_read` + `saas_renewal_due_list` (0040).
  // 194 → 195 (19.08): `critical_incident_open` — миграция 0041.
  // 195 → 196 (19.08): `platform_analytics_dashboard` — дашборд глобального админа читал
  // девятнадцать таблиц отношением и отдавал 500 на первом же 42501 (миграция 0043).
  // 196 → 200 (19.08): четыре двери публичной записи — миграция 0047 (ex-0043). Резолвер арендатора
  // в классе `pre_session`, три остальные — именованные корни арендаторского класса
  // `tenant_service`, которому сквозной `purpose: 'relation'` у порта `webapp` не выдаётся.
<<<<<<< HEAD
  // 200 → 202 (19.08): две двери ЗАПИСИ публичной воронки (миграция 0051).
  // 202 → 203 (19.08): компенсация неудавшейся записи (миграция 0052).
  webapp: 203,
=======
  webapp: 202,
>>>>>>> 63afa779b7be68a902e5474ba7f9f775390e6177
  integrator: 34,
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  // 217 → 218 (19.08): `webapp_retention_sweep` — одна дверь уборки по сроку хранения на четыре
  // запертые арендаторские таблицы (миграция 0031). Прибавка одна, а не по одной на таблицу.
  // 218 → 220 (19.08): пациент и staff идут в ОДИН корень постановки исходящего сообщения
  // (`outbound.message.enqueue`). Возможности две, потому что классов контекста два; дверь одна —
  // это и есть «роль и права и контекст подставлять надо в одном месте».
  // 220 → 221 (19.08): `appointment_reminder_generation_replace` — одна дверь замены поколения
  // напоминаний о записи (миграция 0034).
  // 221 → 223 (19.08): два корня контактов формы записи из миграции 0037.
  // 223 → 224 (19.08): `webapp_health_digest_last_sent_read` — миграция 0038.
  // 224 → 226 (19.08): `webapp_delivery_queue_health_read` + `webapp_health_digest_enqueue` (0039).
  // 226 → 228 (19.08): аудитория staff-веб-пуша операторского алерта и межарендное перечисление
  // подписок к продлению — миграция 0040.
  // 228 → 229 (19.08): открытие критического инцидента — миграция 0041.
  // 229 → 230 (19.08): корень платформенного дашборда — миграция 0043.
  // 230 → 234 (19.08): четыре двери публичной записи (миграция 0047, ex-0043).
<<<<<<< HEAD
  // 234 → 236 (19.08): две двери ЗАПИСИ публичной воронки — личность посетителя и его отношение
  // с клиникой (миграция 0051).
  // 236 → 237 (19.08): компенсация неудавшейся записи — отношение, заведённое ради записи, которой
  // не случилось, снимается той же воронкой (миграция 0052).
  assert.equal(rows.length, 237);
  assert.equal(new Set(rows.map((row) => row.capabilityId)).size, 237);
=======
  // 234 → 236 (19.08): две двери визитки клиники.
  assert.equal(rows.length, 236);
  assert.equal(new Set(rows.map((row) => row.capabilityId)).size, 236);
>>>>>>> 63afa779b7be68a902e5474ba7f9f775390e6177
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
  // 202 → 203 (19.08): корень уборки по сроку хранения `app.prune_retention_target(...)`.
  // 203 → 205 (19.08): ОДИН корень постановки исходящего сообщения, две возможности — пациент и
  // staff; счётчик считает возможности с функцией, а не функции.
  // 205 → 206 (19.08): корень замены поколения напоминаний о записи (миграция 0034).
  // 206 → 208 (19.08): два корня контактов формы записи (миграция 0037).
  // 208 → 209 (19.08): корень времени последней подтверждённой сводки (миграция 0038).
  // 209 → 211 (19.08): корень снимка здоровья очереди и корень постановки сводки (миграция 0039).
  // 211 → 213 (19.08): корень аудитории staff-веб-пуша и корень перечисления подписок (0040).
  // 213 → 214 (19.08): корень открытия критического инцидента (0041).
  // 214 → 215 (19.08): корень платформенного дашборда (0043).
  // 215 → 219 (19.08): все четыре возможности публичной записи — именованные корни (0047, ex-0043).
<<<<<<< HEAD
  // 219 → 221 (19.08): две двери ЗАПИСИ публичной воронки — тоже именованные корни (0051).
  // 221 → 222 (19.08): корень компенсации неудавшейся записи (0052).
  assert.equal(roots.length, 222);
=======
  // 219 → 221 (19.08): обе двери визитки клиники — именованные корни.
  assert.equal(roots.length, 221);
>>>>>>> 63afa779b7be68a902e5474ba7f9f775390e6177
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
      assert.match(seed, new RegExp(escapeRegExp(row.functionIdentity)));
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

test('repeatable reconcile receives exactly four declaration-owned contract login variables', () => {
  const sql = generateEnvLoginVariableSql(declaration, 'dev', 'bcb_webapp_dev');
  assert.deepEqual(
    sql.split('\n').filter((line) => line.startsWith('\\set ')),
    [
      '\\set integrator_login bcb_dev_integrator',
      '\\set app_global_admin_login bcb_dev_webapp_global_admin',
      '\\set app_patient_login bcb_dev_webapp_patient',
      '\\set app_staff_login bcb_dev_webapp_staff',
    ],
  );
  assert.doesNotMatch(sql, /CREATE ROLE|PASSWORD|secret/iu);
});

test('target-only access reconcile contains no cluster role or shared membership mutation', () => {
  const sql = generatePrivilegesSql(declaration, 'bcb_webapp_dev', {
    source: 'deploy/postgres/privileges/declaration.ts',
    includeClusterState: false,
  });
  assert.doesNotMatch(sql, /^CREATE ROLE /mu);
  assert.doesNotMatch(sql, /^ALTER ROLE /mu);
  assert.doesNotMatch(sql, /^GRANT "[^"]+" TO "[^"]+" WITH ADMIN /mu);
  assert.doesNotMatch(sql, /^REVOKE "[^"]+" FROM /mu);
  assert.doesNotMatch(sql, /DROP ROUTINE/u);
  assert.match(sql, /Target-only reconcile: cluster-role baseline is a separate host operation/u);
  assert.match(sql, /Target-only reconcile: shared seam-owner memberships are verified, not mutated/u);
  assert.match(sql, /undeclared SECURITY DEFINER routines fail the bilateral audit/u);
});

test('database-local port-context contract contains no cluster role baseline', () => {
  const contract = readFileSync(
    new URL('../port-context/contract.sql', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(contract, /\bCREATE ROLE\b/u);
  assert.doesNotMatch(contract, /\bALTER ROLE\b/u);
  assert.doesNotMatch(contract, /^GRANT\s+.+\s+TO\s+:"[^"]+"\s+WITH\s+(?:ADMIN|INHERIT|SET)/mu);
  assert.match(contract, /Shared cluster roles must\n-- already exist through the declaration-owned shared-role baseline/u);
});

test('per-target reconcile can verify shared roles without mutating them', () => {
  const sql = generateSharedRoleVerifierSql(declaration);
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE) ROLE\b/u);
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE)\s+[^;]+\s+(?:TO|FROM)\s+/u);
  assert.match(sql, /shared role baseline drift/u);
  assert.match(sql, /granted\.rolname IN \(SELECT role_name FROM bcb_expected_shared_roles\) OR member\.rolname IN/u);
  assert.match(sql, /app_staff'::name,'bcb_dev_webapp_staff'::name,false,false,true,false/u);
  assert.match(sql, /WHERE expected\.required/u);
  assert.match(sql, /BCB_SHARED_ROLE_BASELINE_VERIFIED/u);
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

test('declared definer delegation propagates context without widening direct execute', () => {
  const sql = generatePrivilegesSql(declaration, 'bersoncarebot_test');
  assert.match(
    sql,
    /app\.saas_billing_effective_tariff\(uuid,uuid\).*require_attested_context_for_roles[^\n]+app_clinic_billing[^\n]+app_patient[^\n]+app_platform_settings[^\n]+app_staff/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION app\.saas_billing_effective_tariff\(uuid,uuid\) TO "app_platform_settings", "app_tenant_service";/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION app\.saas_billing_effective_tariff\(uuid,uuid\) TO [^;]*"app_staff"/,
  );
  assert.match(
    sql,
    /app\.read_org_enforced_quota_usage\(uuid\).*require_attested_context_for_roles[^\n]+app_clinic_billing[^\n]+app_platform_settings/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION app\.read_org_enforced_quota_usage\(uuid\) TO "app_platform_settings";/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION app\.read_org_enforced_quota_usage\(uuid\) TO [^;]*"app_clinic_billing"/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION app\.require_staff_security_self_user_id\(\) TO "app_patient", "app_seam_password_auth_owner", "app_seam_self_security_owner", "app_seam_specialist_provision_owner", "app_staff";/,
  );
});

test('runtime gate reconciliation replaces single gates and validates every multi-context token', () => {
  const sql = generatePrivilegesSql(declaration, 'bcb_webapp_dev');
  assert.doesNotMatch(
    sql,
    /gate\.mode IN \('exact','exact_existing'\).*THEN CONTINUE/,
  );
  assert.match(
    sql,
    /guard_at := CASE gate\.mode[\s\S]*overlay\(routine\.prosrc, guard_source, guard_at, guard_length\)[\s\S]*IF new_source = routine\.prosrc THEN CONTINUE/,
  );
  assert.match(sql, /runtime definer gate is not a standalone statement/);
  assert.match(sql, /l\.lanname='plpgsql'[\s\S]*\^BEGIN\[\[:space:\]\]\+PERFORM/);
  const multiContextRow = sql.match(
    /\('app\.resolve_staff_workspace_memberships\(uuid\)', 'exact_existing',[^\n]+/,
  )?.[0] ?? '';
  for (const token of [
    'app_seam_org_directory_owner',
    'app_pre_session',
    'pre_session',
    'app_staff',
    'staff',
    'auth.staff-workspace.resolve',
    'app.hash_port_typed_args',
    'app.resolve_staff_workspace_memberships(uuid)',
  ]) {
    assert.ok(multiContextRow.includes(token), token);
  }
});

test('dependent sequences are revoked even when the current table grants no writes', () => {
  const sql = generatePrivilegesSql(declaration, 'bcb_webapp_dev');
  const start = sql.indexOf('-- ── app.context_signing_secrets');
  const end = sql.indexOf('-- ── ', start + 4);
  assert.ok(start >= 0 && end > start);
  const section = sql.slice(start, end);
  assert.match(section, /exact revoke/);
  assert.match(section, /REVOKE ALL ON SEQUENCE/);
  assert.doesNotMatch(section, /GRANT USAGE, SELECT ON SEQUENCE/);
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
