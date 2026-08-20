/**
 * Живое доказательство порядка и внешней работы стены рождения отношений. Opt-in: без
 * `RUN_RELATION_BIRTH_WALL_DB=1` файл пропускается, поэтому CI не создаёт базу и не ходит в
 * PostgreSQL.
 *
 * Какую поломку ловит (одной строкой): после schema-only snapshot B `contract.sql` либо не может
 * применить свой DDL при пустом реестре, либо возвращает выключенную стену и даёт незаявленной
 * таблице тихо появиться в охраняемой схеме.
 *
 * Отказ дорогой и молчаливый: отключённая стена не ломает deploy — она разрешает новую
 * неклассифицированную relation, которая обходит декларацию и RLS-модель. Тест появился после
 * инцидента 20.08: прежняя проверка читала текст SQL и оставалась зелёной при `ALTER EVENT TRIGGER
 * ... DISABLE`, хотя живая незаявленная таблица создавалась с exit 0.
 *
 * Фикстура — не самодельная схема: она исполняет `schema-pre.sql` и `schema-post.sql`, то есть
 * актуальный schema-only snapshot B. После него event trigger уже установлен, а реестр пуст,
 * потому что schema dump не содержит его строк. На этой же живой базе исполняется `contract.sql`.
 * Текст контракта читается только чтобы передать его psql и сделать намеренно сломанную временную
 * копию для fault injection; oracle — исключительно exit code/SQLSTATE живого PostgreSQL.
 *
 * Каждая проверка создаёт собственную БД из template0 и удаляет её в finally, в том числе при
 * падении. `bersoncarebot_test` и `bcb_webapp_dev` не используются. Тест не создаёт роли и не
 * выдаёт/отзывает права самостоятельно: database-local ACL исполняет только проверяемый контракт
 * внутри одноразовой БД. Запуск идёт через локальный админ-сокет, как остальные DB proofs.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_RELATION_BIRTH_WALL_DB=1 node --test \
 *     deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_RELATION_BIRTH_WALL_DB === '1';
const CONTRACT_PATH = fileURLToPath(new URL('../port-context/contract.sql', import.meta.url));
const SNAPSHOT_PRE_PATH = fileURLToPath(new URL('../generated/prod-to-target/schema-pre.sql', import.meta.url));
const SNAPSHOT_POST_PATH = fileURLToPath(new URL('../generated/prod-to-target/schema-post.sql', import.meta.url));
const CONTRACT_SQL = readFileSync(CONTRACT_PATH, 'utf8');
const SNAPSHOT_PRE_SQL = readFileSync(SNAPSHOT_PRE_PATH, 'utf8');
const SNAPSHOT_POST_SQL = readFileSync(SNAPSHOT_POST_PATH, 'utf8');
const INITIAL_DISARM = 'DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;';

function psql(database, sql, variables = {}) {
  const args = [
    '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
    '-h', '/var/run/postgresql', '-p', '5432', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
  ];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-v', `${key}=${value}`);
  }
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

function databaseName(label) {
  return `bcb_birth_wall_${label}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

function admin(sql) {
  return psql('postgres', sql);
}

function createFreshSnapshot(label, body) {
  const database = databaseName(label);
  let created = false;
  try {
    assertSucceeded(admin(`CREATE DATABASE ${database} TEMPLATE template0;`), `create disposable ${label} database`);
    created = true;
    assertSucceeded(psql(database, SNAPSHOT_PRE_SQL), `load schema-pre snapshot into ${label} database`);
    assertSucceeded(psql(database, SNAPSHOT_POST_SQL), `load schema-post snapshot into ${label} database`);
    const snapshotState = psql(database, `
SELECT (SELECT count(*) FROM app_control.relation_wall_registry)::text
  || '|' || (SELECT evtenabled FROM pg_event_trigger WHERE evtname = 'bcb_relation_birth_wall')::text;
`);
    assertSucceeded(snapshotState, `inspect ${label} snapshot state`);
    assert.equal(snapshotState.stdout, '0|O',
      `${label} must reproduce snapshot B: enabled trigger and empty relation-wall registry`);
    return body(database);
  } finally {
    if (created) {
      const dropped = admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
      assertSucceeded(dropped, `drop disposable ${label} database`);
      const absent = admin(`SELECT count(*) FROM pg_database WHERE datname = '${database}';`);
      assertSucceeded(absent, `verify removal of disposable ${label} database`);
      assert.equal(absent.stdout, '0', `disposable ${label} database must be gone after the proof`);
    }
  }
}

function applyContract(database, sql) {
  return psql(database, sql, {
    DBNAME: database,
    app_staff_login: 'postgres',
    app_patient_login: 'postgres',
    app_global_admin_login: 'postgres',
    integrator_login: 'postgres',
  });
}

function assertWallRestored(database) {
  const state = psql(database, `
SELECT (SELECT count(*) FROM app_control.relation_wall_registry)::text
  || '|' || (SELECT evtenabled FROM pg_event_trigger WHERE evtname = 'bcb_relation_birth_wall')::text;
`);
  assertSucceeded(state, 'inspect relation birth wall after contract');
  assert.equal(state.stdout, '0|O',
    'contract must restore an enabled wall while the registry is still empty before reconcile seeds it');
}

function createUndeclaredTable(database) {
  return psql(database, 'CREATE TABLE app_ext.bcb_birth_wall_undeclared_proof (id integer);');
}

function createDeclaredTable(database) {
  const declaration = psql(database, `
INSERT INTO app_control.relation_wall_registry (schema_name, table_name, data_class, wall, expected_owner)
VALUES ('app_ext', 'bcb_birth_wall_declared_proof', 'S', 'proof', 'postgres');
`);
  assertSucceeded(declaration, 'seed the declared relation-wall probe');
  const created = psql(database, 'CREATE TABLE app_ext.bcb_birth_wall_declared_proof (id integer);');
  assertSucceeded(created, 'create declared table outside contract');
  const rls = psql(database, `
SELECT relrowsecurity::text || '|' || relforcerowsecurity::text
  FROM pg_class WHERE oid = 'app_ext.bcb_birth_wall_declared_proof'::regclass;
`);
  assertSucceeded(rls, 'inspect RLS placed by birth wall on declared table');
  assert.equal(rls.stdout, 'true|true', 'declared table must receive ENABLE and FORCE RLS from the wall');
}

function withoutInitialDisarm(sql) {
  const index = sql.indexOf(INITIAL_DISARM);
  if (index < 0) throw new Error('fault injection cannot remove the contract disarm statement');
  return `${sql.slice(0, index)}-- fault injection: initial relation-birth-wall disarm removed\n${sql.slice(index + INITIAL_DISARM.length)}`;
}

test('contract crosses empty-registry snapshot B and restores the relation birth wall', { skip: !ENABLED }, () => {
  createFreshSnapshot('current', (database) => {
    const contract = applyContract(database, CONTRACT_SQL);
    assertSucceeded(contract, 'apply current contract with snapshot trigger and empty registry');
    assertWallRestored(database);

    const undeclared = createUndeclaredTable(database);
    assertRejectedByBirthWall(undeclared, 'create undeclared table after contract');
    createDeclaredTable(database);
  });
});

test('self-check: removing the contract disarm makes the same empty-registry run fail with 42501',
  { skip: !ENABLED }, () => {
    createFreshSnapshot('no_disarm', (database) => {
      const brokenContract = applyContract(database, withoutInitialDisarm(CONTRACT_SQL));
      assertRejectedByBirthWall(brokenContract, 'apply fault-injected contract without its initial disarm');
    });
  });

test('self-check: the normal rejection assertion turns red when the restored trigger is disabled',
  { skip: !ENABLED }, () => {
    createFreshSnapshot('disabled', (database) => {
      const contract = applyContract(database, CONTRACT_SQL);
      assertSucceeded(contract, 'apply current contract before disabling the wall');
      assertWallRestored(database);

      const disabled = psql(database, 'ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE;');
      assertSucceeded(disabled, 'disable relation birth wall for fault injection');
      const undeclared = createUndeclaredTable(database);
      assertSucceeded(undeclared,
        'fault injection must let an undeclared table create with exit 0 before the assertion detects it');
      const exists = psql(database,
        `SELECT to_regclass('app_ext.bcb_birth_wall_undeclared_proof') IS NOT NULL;`);
      assertSucceeded(exists, 'inspect undeclared table created while wall was disabled');
      assert.equal(exists.stdout, 't', 'disabled wall must actually let the undeclared table exist');

      assert.throws(
        () => assertRejectedByBirthWall(undeclared, 'create undeclared table after contract'),
        /must stop psql with exit 3/,
        'the normal external-wall assertion must turn red for the disabled-trigger fault',
      );
    });
  });
