/**
 * Живое доказательство порядка и внешней работы стены рождения отношений на
 * именованной DEV-базе. Opt-in: без `RUN_RELATION_BIRTH_WALL_DB=1` файл
 * пропускается, поэтому CI не ходит в PostgreSQL.
 *
 * Какую поломку ловит (одной строкой): `contract.sql` не снимает старый event
 * trigger до собственного `ALTER TABLE app_ext.port_context_capabilities` при
 * пустом реестре либо после контракта разрешает незаявленную relation.
 *
 * Оракул — exit code/SQLSTATE живого PostgreSQL, не текст SQL: внутри
 * транзакции временно очищается реестр стены. Это воспроизводит существенное
 * состояние schema-only snapshot B (стена включена, строк реестра нет), но не
 * создаёт snapshot, отдельную БД или роль. `contract.sql` исполняется целиком
 * против текущей `bcb_webapp_dev`; его собственный `ALTER TABLE` обязан пройти
 * только потому, что первый оператор снял старую стену.
 *
 * Каждое обращение к БД содержит `BEGIN … ROLLBACK`. Включение/выключение
 * event trigger, очистка и заполнение реестра, contract DDL и пробные таблицы
 * поэтому никогда не сохраняются в DEV. При намеренном SQL-отказе psql
 * завершает соединение с незакоммиченной транзакцией, и PostgreSQL также её
 * откатывает.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_RELATION_BIRTH_WALL_DB=1 node --test \
 *     deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_RELATION_BIRTH_WALL_DB === '1';
const DATABASE = process.env.RELATION_BIRTH_WALL_PROOF_DB ?? 'bcb_webapp_dev';
const CONTRACT_PATH = fileURLToPath(new URL('../port-context/contract.sql', import.meta.url));
const CONTRACT_SQL = readFileSync(CONTRACT_PATH, 'utf8');
const INITIAL_DISARM = 'DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql, variables = {}) {
  const args = [
    '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
    '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
  ];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  args.push('-f', '-');
  const result = spawnSync('sudo', args, {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function sqlState(result) {
  return /ERROR:\s+([0-9A-Z]{5}):/u.exec(result.stderr)?.[1] ?? null;
}

function resultDetails(result) {
  return `exit=${result.exitCode}, SQLSTATE=${sqlState(result) ?? 'none'}, stderr=${result.stderr}`;
}

function assertSucceeded(result, operation) {
  assert.equal(result.exitCode, 0, `${operation} must succeed (${resultDetails(result)})`);
}

function assertRejectedByBirthWall(result, operation) {
  assert.equal(result.exitCode, 3, `${operation} must stop psql with exit 3 (${resultDetails(result)})`);
  assert.equal(sqlState(result), '42501', `${operation} must be refused with 42501 (${resultDetails(result)})`);
}

function contractVariables() {
  return {
    DBNAME: DATABASE,
    app_staff_login: 'postgres',
    app_patient_login: 'postgres',
    app_global_admin_login: 'postgres',
    integrator_login: 'postgres',
  };
}

// The deletion is the intentionally minimal fixture for snapshot B. It and every statement below
// it share one transaction with ROLLBACK; the named DEV database is never left changed.
function runWithEmptyRegistry(contractSql, afterContract = '') {
  return psql(`
BEGIN;
DELETE FROM app_control.relation_wall_registry;
${contractSql}
${afterContract}
ROLLBACK;
`, contractVariables());
}

function assertProbeTablesAbsent() {
  const state = psql(`
BEGIN;
SELECT to_regclass('app_ext.bcb_birth_wall_undeclared_proof') IS NULL
  AND to_regclass('app_ext.bcb_birth_wall_declared_proof') IS NULL;
ROLLBACK;
`);
  assertSucceeded(state, 'inspect probe-table cleanup before the proof');
  assert.equal(state.stdout, 't', 'a previous proof left a relation-birth-wall probe table in DEV');
}

function assertWallRestored(stdout) {
  assert.match(stdout, /^0\|O$/mu,
    'contract must restore an enabled wall while the registry is empty before reconcile seeds it');
}

function withoutInitialDisarm(sql) {
  const index = sql.indexOf(INITIAL_DISARM);
  if (index < 0) throw new Error('fault injection cannot remove the contract disarm statement');
  return `${sql.slice(0, index)}-- fault injection: initial relation-birth-wall disarm removed\n${sql.slice(index + INITIAL_DISARM.length)}`;
}

test('contract crosses the empty-registry state and restores the relation birth wall', { skip: !ENABLED }, () => {
  assertProbeTablesAbsent();
  const contract = runWithEmptyRegistry(CONTRACT_SQL, `
SELECT (SELECT count(*) FROM app_control.relation_wall_registry)::text
  || '|' || (SELECT evtenabled FROM pg_event_trigger WHERE evtname = 'bcb_relation_birth_wall')::text;
`);
  assertSucceeded(contract, 'apply current contract with an enabled wall and an empty registry');
  assertWallRestored(contract.stdout);
});

test('the restored wall rejects an undeclared table with 42501', { skip: !ENABLED }, () => {
  const undeclared = runWithEmptyRegistry(CONTRACT_SQL,
    'CREATE TABLE app_ext.bcb_birth_wall_undeclared_proof (id integer);');
  assertRejectedByBirthWall(undeclared, 'create undeclared table after contract');
});

test('the restored wall allows a declared table and enables forced RLS', { skip: !ENABLED }, () => {
  const declared = runWithEmptyRegistry(CONTRACT_SQL, `
INSERT INTO app_control.relation_wall_registry (schema_name, table_name, data_class, wall, expected_owner)
VALUES ('app_ext', 'bcb_birth_wall_declared_proof', 'S', 'proof', 'postgres');
CREATE TABLE app_ext.bcb_birth_wall_declared_proof (id integer);
SELECT relrowsecurity::text || '|' || relforcerowsecurity::text
  FROM pg_class WHERE oid = 'app_ext.bcb_birth_wall_declared_proof'::regclass;
`);
  assertSucceeded(declared, 'create declared table after contract');
  assert.equal(declared.stdout, 'true|true', 'declared table must receive ENABLE and FORCE RLS from the wall');
});

test('self-check: removing the contract disarm makes the empty-registry run fail with 42501',
  { skip: !ENABLED }, () => {
    const brokenContract = runWithEmptyRegistry(withoutInitialDisarm(CONTRACT_SQL));
    assertRejectedByBirthWall(brokenContract, 'apply fault-injected contract without its initial disarm');
  });

test('self-check: the rejection assertion turns red when the restored wall is disabled',
  { skip: !ENABLED }, () => {
    const disabled = runWithEmptyRegistry(CONTRACT_SQL, `
ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE;
CREATE TABLE app_ext.bcb_birth_wall_undeclared_proof (id integer);
SELECT to_regclass('app_ext.bcb_birth_wall_undeclared_proof') IS NOT NULL;
`);
    assertSucceeded(disabled, 'disable relation birth wall for fault injection');
    assert.equal(disabled.stdout, 't', 'disabled wall must actually let the undeclared table exist');
    assert.throws(
      () => assertRejectedByBirthWall(disabled, 'create undeclared table after contract'),
      /must stop psql with exit 3/,
      'the normal external-wall assertion must turn red for the disabled-trigger fault',
    );
  });
