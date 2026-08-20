/**
 * Живое доказательство одного свойства шва port-context на именованной DEV-базе. Opt-in: без
 * `RUN_PORT_CONTEXT_LIFETIME_DB=1` файл пропускается, поэтому в CI он не ходит в базу.
 *
 * Какую поломку ловит (одной строкой): строка `app_ext.accepted_port_contexts` переживает
 * транзакцию, которая её поставила, — и тогда таблица растёт без предела, а каждая port-транзакция
 * платит за неё полным сканом.
 *
 * Отказ дорогой и молчаливый одновременно, и он уже случился 18.08 на `bersoncarebot_test`:
 * 120 616 строк / 71 МБ за 110 минут трафика, 105 млн прочитанных строк и 8.4 с на одну загрузку
 * `/app/doctor`. Ошибки при этом не было ни одной — страницы просто становились медленнее.
 *
 * Свойство проверяется на уровне таблицы, а не одного писателя: гарантию даёт отложенный
 * constraint-триггер `accepted_port_contexts_expire_at_commit`, и он обязан снимать строку любого
 * писателя, а не только `app.install_port_context`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PORT_CONTEXT_LIFETIME_DB=1 node --test \
 *     deploy/postgres/privileges/port-context-transaction-lifetime.devDbProof.test.mjs
 * Наблюдать приватную таблицу шва может только её владелец или суперпользователь, поэтому проба
 * идёт локальным админ-сокетом (`sudo -n -u postgres psql`), как читающие проверки в AGENTS.md §6.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_PORT_CONTEXT_LIFETIME_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

test('an accepted port context does not outlive the transaction that installed it', { skip: !ENABLED }, () => {
  const capability = psql('SELECT capability_id FROM app_ext.port_context_capabilities LIMIT 1;');
  assert.notEqual(capability, '', 'app_ext.port_context_capabilities is empty — the seam is not provisioned');

  // Одна сессия: строка ставится, наблюдается внутри своей транзакции, затем транзакция
  // фиксируется. Идентификатор транзакции печатается ДО COMMIT — после него его уже не получить.
  const inside = psql(`
BEGIN;
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, typed_args_hash)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), '${capability}'::uuid, 'proof_session'::name,
       c.port, c.target_role, c.context_class, c.purpose,
       decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex')
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database() AND c.capability_id = '${capability}'::uuid;
SELECT 'visible=' || count(*) FROM app_ext.accepted_port_contexts
 WHERE transaction_id = pg_current_xact_id() AND backend_pid = pg_backend_pid();
SELECT 'xid=' || pg_current_xact_id();
COMMIT;
`);
  const visible = /visible=(\d+)/u.exec(inside)?.[1];
  const xid = /xid=(\d+)/u.exec(inside)?.[1];
  assert.equal(visible, '1', 'the context must be readable inside its own transaction');
  assert.ok(xid, 'pg_current_xact_id() was not reported');

  const survived = psql(
    `SELECT count(*) FROM app_ext.accepted_port_contexts WHERE transaction_id = '${xid}'::xid8;`,
  );
  assert.equal(
    survived, '0',
    `context of transaction ${xid} survived COMMIT — accepted_port_contexts accumulates again`,
  );
});
