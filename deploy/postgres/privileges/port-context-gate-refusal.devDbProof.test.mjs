/**
 * Живое доказательство одного свойства гейта `app.require_accepted_context` на именованной
 * DEV-базе. Opt-in: без `RUN_PORT_CONTEXT_GATE_DB=1` файл пропускается, поэтому в CI он не ходит
 * в базу.
 *
 * Какую поломку ловит (одной строкой): гейт перестаёт отказывать — пропускает запрос, под который
 * не установлена принятая строка контекста, или перестаёт различать цель (`purpose`).
 *
 * Почему проверка появилась 19.08. Из тела гейта убрано регулярное выражение
 * `p_purpose ~ '^[a-z][a-z0-9._:-]{0,127}$'`: в пути RLS оно проверяло литерал из текста политики,
 * то есть константу, и стоило ~5.5 мкс из ~22 мкс вызова. Форма `purpose` проверяется там, где
 * значение входит в систему — в `app.install_port_context` и CHECK-ограничением на
 * `app_ext.port_context_capabilities.purpose`, — а здесь испорченная цель просто не находит
 * принятой строки и получает тот же `42501`.
 *
 * Убирая проверку, надо оставить доказательство того, что отказ на месте. Его не было: ни один
 * офлайн-тест не краснел, когда тело гейта переставало отказывать вовсе (проверено внесением
 * поломки 19.08 — 99 тестов остались зелёными). Этот файл закрывает ровно этот пробел.
 *
 * Отказ дорогой и молчаливый одновременно: гейт стоит в `USING`-выражении политик, поэтому
 * ослабленный гейт не даёт ошибки — он тихо отдаёт чужие строки.
 *
 * Проверка идёт против ЖИВОГО тела в базе, а не против текста файла, и потому не зависит от того,
 * как гейт написан. Второй тест — самопроверка: заведомо ослабленная копия того же тела ОБЯЗАНА
 * пропустить вектор, который настоящий гейт отвергает. Без неё батарея векторов могла бы быть
 * зелёной просто потому, что ничего не проверяет.
 *
 * Наблюдать приватную таблицу шва может только её владелец или суперпользователь, поэтому проба
 * идёт локальным админ-сокетом (`sudo -n -u postgres psql`), как читающие проверки в AGENTS.md §6.
 * Вся работа идёт в транзакции, которая заканчивается ROLLBACK: DEV-данные не меняются.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PORT_CONTEXT_GATE_DB=1 node --test \
 *     deploy/postgres/privileges/port-context-gate-refusal.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_PORT_CONTEXT_GATE_DB === '1';
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

// Литералы цели, которые прежде отвергало регулярное выражение, плюс те, что оно пропускало,
// но которые не совпадают с принятой строкой. Все обязаны получить 42501.
const REFUSED_PURPOSES = [
  ['цель не совпадает с принятой строкой', `'other.purpose'`],
  ['верхний регистр', `'RELATION'`],
  ['ведущая цифра', `'1relation'`],
  ['пробел внутри', `'rel ation'`],
  ['SQL-мусор', `'relation''; DROP TABLE x--'`],
  ['длиннее 128 символов', `('r' || repeat('a', 128))`],
  ['пустая строка', `''`],
  ['NULL', `NULL::text`],
];

const RESULTS_TABLE =
  'CREATE TEMP TABLE bcb_gate_proof_results(ord serial PRIMARY KEY, value text NOT NULL);';

// Один установленный контекст: purpose 'relation', function_identity NULL — ровно та форма,
// которую использует путь RLS.
const INSTALL_CONTEXT = `
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, session_user,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex')
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database()
   AND c.purpose = 'relation' AND c.function_identity IS NULL AND c.target_role = 'app_staff'
 LIMIT 1;`;

// Вызов гейта, обёрнутый так, чтобы 42501 стал строкой, а не падением psql. Результат кладётся
// во временную таблицу, а не в RAISE NOTICE: NOTICE уходит в stderr, и тест его не увидел бы.
function probe(functionCall) {
  return `
  BEGIN
    PERFORM ${functionCall};
    INSERT INTO bcb_gate_proof_results(value) VALUES ('ALLOW');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO bcb_gate_proof_results(value) VALUES ('42501');
  END;`;
}

function gateCall(fn, purposeSql) {
  return `${fn}(tgt, tgt, cls, ${purposeSql}, h, NULL::regprocedure)`;
}

const PREAMBLE = `
  DECLARE
    tgt name; cls app.port_context_class;
    h constant bytea := decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex');
  BEGIN
    SELECT target_role, context_class INTO tgt, cls FROM app_ext.accepted_port_contexts
     WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
    IF tgt IS NULL THEN RAISE EXCEPTION 'no accepted context was installed by the fixture'; END IF;`;

function runVectors(fn, purposes, { dropContextFirst = false } = {}) {
  const body = purposes
    .map(([, purposeSql]) => probe(gateCall(fn, purposeSql)))
    .join('\n');
  const drop = dropContextFirst
    ? `DELETE FROM app_ext.accepted_port_contexts
        WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();`
    : '';
  const out = psql(`
BEGIN;
${RESULTS_TABLE}
${INSTALL_CONTEXT}
DO $proof$
${PREAMBLE}
    ${drop}
${body}
  END
$proof$;
SELECT value FROM bcb_gate_proof_results ORDER BY ord;
ROLLBACK;`);
  return out.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

test('the port-context gate allows an installed context and refuses every other purpose',
  { skip: !ENABLED }, () => {
    const allowed = runVectors('app.require_accepted_context', [['совпадающая цель', `'relation'`]]);
    assert.deepEqual(allowed, ['ALLOW'],
      'the gate must allow the exact purpose of the installed context');

    const refused = runVectors('app.require_accepted_context', REFUSED_PURPOSES);
    assert.equal(refused.length, REFUSED_PURPOSES.length);
    REFUSED_PURPOSES.forEach(([label], index) => {
      assert.equal(refused[index], '42501', `purpose vector '${label}' must be refused with 42501`);
    });
  });

test('the port-context gate refuses when no context is installed at all',
  { skip: !ENABLED }, () => {
    const result = runVectors('app.require_accepted_context', [['совпадающая цель', `'relation'`]],
      { dropContextFirst: true });
    assert.deepEqual(result, ['42501'],
      'without an accepted context row the gate must refuse even the correct purpose');
  });

// Самопроверка батареи: ослабленная копия обязана покраснеть. Копия повторяет тело гейта, но не
// смотрит на принятую строку — ровно та поломка, ради которой файл написан.
test('the vector battery detects a gate body that stopped refusing', { skip: !ENABLED }, () => {
  const weakened = `
CREATE FUNCTION pg_temp.weakened_gate(p_effective_role name, p_target_role name,
  p_context_class app.port_context_class, p_purpose text, p_typed_args_hash bytea,
  p_function_identity regprocedure)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, app, app_ext, pg_temp AS $w$
BEGIN
  RETURN true;
END $w$;`;
  const body = REFUSED_PURPOSES
    .map(([, purposeSql]) => probe(gateCall('pg_temp.weakened_gate', purposeSql)))
    .join('\n');
  const out = psql(`
BEGIN;
${RESULTS_TABLE}
${INSTALL_CONTEXT}
${weakened}
DO $proof$
${PREAMBLE}
${body}
  END
$proof$;
SELECT value FROM bcb_gate_proof_results ORDER BY ord;
ROLLBACK;`);
  const results = out.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  assert.equal(results.length, REFUSED_PURPOSES.length);
  assert.ok(results.every((value) => value === 'ALLOW'),
    'the weakened fixture must allow every vector — otherwise the battery proves nothing');
});
