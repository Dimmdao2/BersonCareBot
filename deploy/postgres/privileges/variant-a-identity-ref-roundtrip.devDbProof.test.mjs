/**
 * Живое доказательство ОДНОГО свойства карты личностей на именованной DEV-базе. Opt-in: без
 * `RUN_VARIANT_A_IDENTITY_REF_DB=1` файл пропускается, поэтому в CI он в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): непрозрачная ссылка перестала разрешаться в физический id —
 * либо потому, что резолвер не смог выдать ссылку НОВОМУ человеку, либо потому, что ссылка
 * известного человека стала разрешаться не в него.
 *
 * Зачем именно сейчас (D15b/7a Ш1–Ш2, 22.08). Шаг 1 добавил в `app_ext.variant_a_identity_refs`
 * колонку вида `ref_kind`, шаг 2 перевёл первичный ключ на `(physical_user_id, ref_kind)`; обе
 * правки живут в `deploy/postgres/port-context/contract.sql` — авторитете объектов `app_ext`. Обе
 * обязаны быть невидимы снаружи: вход человека и разрешение ссылки должны работать ровно так же.
 * Одна из них невидимой НЕ является сама по себе — `ON CONFLICT (<колонки>)` в
 * `app_ext.resolve_variant_a_identity` есть вывод индекса, и после смены ключа спецификация,
 * называющая один `physical_user_id`, не совпадает ни с одним индексом: `42P10`. Ровно эта поломка
 * убила почтовую дверь входа 22.08 (`20260822T090000_the_email_contact_door_names_its_real_index`),
 * и ловится она только на пути ВСТАВКИ — на человеке, которого в карте ещё нет. Поэтому проба ниже
 * не довольствуется уже лежащей строкой, а требует ссылку у никому не известного uuid.
 *
 * Проверяется ПОВЕДЕНИЕ пары резолверов, а не текст их исходника и не наличие колонки:
 *   1. известный человек: `resolve_variant_a_identity(id)` → `resolve_variant_a_physical(ref)` = id,
 *      и повторный вызов на том же человеке отдаёт ТУ ЖЕ ссылку (карта append-only);
 *   2. новый человек: тот же круг проходит целиком, то есть путь вставки жив;
 *   3. выдуманная ссылка отвергается `42501`, а не отдаёт чужой id.
 * Проба идёт под локальным админ-сокетом (`sudo -n -u postgres psql`, AGENTS.md §6): обе функции
 * SECURITY DEFINER и EXECUTE на них есть только у своего шва, а доказывается здесь правило, а не
 * маршрут клиентских логинов — сквозной вход тремя учётками проверяется живьём на :5200.
 *
 * Ничего не остаётся в базе: вставка нового человека идёт внутри `BEGIN … ROLLBACK`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_VARIANT_A_IDENTITY_REF_DB=1 node --test \
 *     deploy/postgres/privileges/variant-a-identity-ref-roundtrip.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_VARIANT_A_IDENTITY_REF_DB === '1';
const DATABASE = process.env.VARIANT_A_IDENTITY_PROOF_DB ?? 'bcb_webapp_dev';

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

/**
 * Исход одного круга «физический id → ссылка → физический id» на ОДНОМ человеке.
 * Возвращает `ref|ref_повторно|обратно_разрешённый_id` либо `SQLSTATE|сообщение`.
 */
const ROUND_TRIP = (physicalIdSql) => `
BEGIN;
DO $$
DECLARE person uuid; first_ref uuid; second_ref uuid; back uuid;
BEGIN
  person := ${physicalIdSql};
  IF person IS NULL THEN
    PERFORM set_config('bcb.round_trip', 'no-fixture', false);
    RETURN;
  END IF;
  first_ref := app_ext.resolve_variant_a_identity(person);
  second_ref := app_ext.resolve_variant_a_identity(person);
  back := app_ext.resolve_variant_a_physical(first_ref);
  PERFORM set_config('bcb.round_trip',
    first_ref::text || '|' || second_ref::text || '|' || back::text || '|' || person::text, false);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bcb.round_trip', SQLSTATE || '|' || SQLERRM, false);
END $$;
SELECT current_setting('bcb.round_trip');
ROLLBACK;
`;

function roundTrip(physicalIdSql) {
  const raw = psql(ROUND_TRIP(physicalIdSql));
  assert.notEqual(raw, 'no-fixture', 'DEV-база не содержит фикстуры для круга разрешения ссылки');
  const parts = raw.split('|');
  assert.equal(parts.length, 4, `круг разрешения ссылки не прошёл: ${raw}`);
  const [firstRef, secondRef, back, person] = parts;
  return { firstRef, secondRef, back, person };
}

test('известный человек: ссылка разрешается обратно в него и не меняется между вызовами',
  { skip: !ENABLED }, () => {
    const result = roundTrip(
      '(SELECT physical_user_id FROM app_ext.variant_a_identity_refs ORDER BY created_at LIMIT 1)');
    assert.equal(result.back, result.person,
      'обратное разрешение вернуло не того человека');
    assert.equal(result.secondRef, result.firstRef,
      'повторный вызов выдал другую ссылку — карта перестала быть append-only');
  });

test('новый человек: путь ВСТАВКИ в карту жив, ссылка выдана и разрешается обратно',
  { skip: !ENABLED }, () => {
    // Человек, которого в карте заведомо нет: если бы арбитр `ON CONFLICT` называл индекс,
    // которого больше не существует, именно этот вызов упал бы `42P10`.
    const result = roundTrip(`(SELECT candidate.id FROM (SELECT gen_random_uuid() AS id) AS candidate
      WHERE NOT EXISTS (SELECT 1 FROM app_ext.variant_a_identity_refs known
                         WHERE known.physical_user_id = candidate.id))`);
    assert.equal(result.back, result.person,
      'ссылка нового человека разрешилась не в него');
    assert.equal(result.secondRef, result.firstRef,
      'второй вызов на новом человеке выдал другую ссылку');
  });

test('выдуманная ссылка отвергается 42501, а не отдаёт чужой физический id',
  { skip: !ENABLED }, () => {
    const outcome = psql(`
DO $$
DECLARE invented uuid := '11111111-2222-4333-8444-555555555555';
BEGIN
  PERFORM app_ext.resolve_variant_a_physical(invented);
  PERFORM set_config('bcb.invented', 'accepted', false);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bcb.invented', SQLSTATE, false);
END $$;
SELECT current_setting('bcb.invented');
`);
    assert.equal(outcome, '42501', `выдуманная ссылка не была отвергнута: ${outcome}`);
  });
