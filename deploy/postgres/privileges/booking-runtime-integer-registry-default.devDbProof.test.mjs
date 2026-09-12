/**
 * Живое доказательство фикса 2026-09-12: живой аудит нашёл, что пациентский визард записи
 * отскакивал с шага услуги обратно в список записи для ЛЮБОЙ организации без per-org строки
 * `booking_max_consecutive_slot_hours` в `system_settings` — `app.read_current_patient_booking_
 * runtime_integer` падал SQLSTATE 22023, приложение тихо ловило это как generic redirect. Тот же
 * пробел был и у `booking_min_notice_hours`. Соседние два ключа (`booking_availability_horizon_
 * days`, `booking_prepayment_wait_minutes`) уже деградировали к реестровому дефолту (BAH-01/F2) —
 * миграции `20260912T094500_...` и `20260912T095500_...` закрывают тот же класс для оставшихся
 * двух ключей и для дублирующей проверки внутри `app.read_current_patient_booking_slot_snapshot`.
 *
 * Что доказывается (про поведение базы, не про текст кода):
 *   1. Организация БЕЗ per-org строки для ключа получает реестровый дефолт (registry.ts:
 *      booking_max_consecutive_slot_hours='3', booking_min_notice_hours='0'), а не 22023.
 *   2. Организация с ЯВНОЙ, но СЛОМАННОЙ (не числовой) строкой по-прежнему падает громко —
 *      фикс не сделал тихим сохранённое, но битое значение.
 *
 * Opt-in: без `RUN_BOOKING_RUNTIME_INTEGER_REGISTRY_DEFAULT_DB=1` файл пропускается, в CI он в
 * базу не ходит. Вся работа — в транзакции с ROLLBACK; DEV-данные не меняются.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_BOOKING_RUNTIME_INTEGER_REGISTRY_DEFAULT_DB=1 node --test \
 *     deploy/postgres/privileges/booking-runtime-integer-registry-default.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_BOOKING_RUNTIME_INTEGER_REGISTRY_DEFAULT_DB === '1';
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

function fixture(sql, what) {
  const value = psql(sql);
  assert.notEqual(value, '', `DEV-база не содержит фикстуры: ${what}`);
  return value.split('|');
}

/** Same shape as public-booking-write-walls.devDbProof.test.mjs's helper — kept local to avoid a
 * cross-file import between independent devDbProof proofs. */
function acceptPatientContext({ purpose, functionIdentity, typedArgsSql, actorRef, organizationId }) {
  return `
DO $mint$ BEGIN PERFORM set_config('bcb.proof_subject_ref', app_ext.resolve_variant_a_identity(
  (SELECT r.physical_user_id FROM app_ext.variant_a_identity_refs r
    WHERE r.opaque_ref = '${actorRef}'::uuid), 'subject')::text, false); END $mint$;
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '00000000-0000-4000-8000-0000000000fe'::uuid, c.port, session_user,
       c.target_role, c.context_class, c.purpose, c.function_identity
  FROM app_ext.port_context_capabilities c
 WHERE c.purpose = '${purpose}'
   AND c.function_identity = '${functionIdentity}'::regprocedure
 LIMIT 1;
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref, organization_id)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       app.hash_port_typed_args(${typedArgsSql}),
       '${actorRef}'::uuid, current_setting('bcb.proof_subject_ref')::uuid,
       ${organizationId ? `'${organizationId}'::uuid` : 'NULL::uuid'}
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database()
   AND c.capability_id = '00000000-0000-4000-8000-0000000000fe'::uuid
 LIMIT 1;`;
}

const RUNTIME_INT_PURPOSE = 'booking.patient-runtime-integer.read';
const RUNTIME_INT_FN = 'app.read_current_patient_booking_runtime_integer(text)';
const typedArgsForKey = (key) =>
  `ARRAY[ROW('text@1', pg_catalog.textsend('${key}'))::app.port_typed_arg]`;

function anyEnrolledActorAndOrg() {
  return fixture(
    `SELECT ref.opaque_ref || '|' || enrollment.organization_id
       FROM public.org_enrollments enrollment
       JOIN app_ext.variant_a_identity_refs ref
         ON ref.physical_user_id = enrollment.platform_user_id AND ref.ref_kind = 'actor'
      WHERE enrollment.status = 'active'
      LIMIT 1;`,
    'пациент с активным зачислением и разрешаемой акторской ссылкой',
  );
}

/** Runs the door once for `key` with the org's own row for that key temporarily removed, all
 * inside the ROLLBACK-scoped transaction — DEV data for the row is untouched on exit. */
function readWithoutOwnRow({ actorRef, organizationId, key }) {
  return psql(`
BEGIN;
DELETE FROM public.system_settings
 WHERE key = '${key}' AND scope = 'admin' AND organization_id = '${organizationId}'::uuid;
${acceptPatientContext({
  purpose: RUNTIME_INT_PURPOSE,
  functionIdentity: RUNTIME_INT_FN,
  typedArgsSql: typedArgsForKey(key),
  actorRef,
  organizationId,
})}
DO $proof$
DECLARE v_out text;
BEGIN
  SELECT (app.read_current_patient_booking_runtime_integer('${key}'))::text INTO v_out;
  PERFORM set_config('bcb.door_result', 'ALLOW|' || COALESCE(v_out, '<null>'), false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.door_result', SQLSTATE || '|' || SQLERRM, false);
END
$proof$;
SELECT current_setting('bcb.door_result');
ROLLBACK;`).trim();
}

/** Same as above, but with a stored value that is present and NOT numeric — must still raise. */
function readWithBrokenOwnRow({ actorRef, organizationId, key }) {
  return psql(`
BEGIN;
DELETE FROM public.system_settings
 WHERE key = '${key}' AND scope = 'admin' AND organization_id = '${organizationId}'::uuid;
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
VALUES ('${key}', 'admin', '${organizationId}'::uuid, jsonb_build_object('value', 'not-a-number'), now());
${acceptPatientContext({
  purpose: RUNTIME_INT_PURPOSE,
  functionIdentity: RUNTIME_INT_FN,
  typedArgsSql: typedArgsForKey(key),
  actorRef,
  organizationId,
})}
DO $proof$
DECLARE v_out text;
BEGIN
  SELECT (app.read_current_patient_booking_runtime_integer('${key}'))::text INTO v_out;
  PERFORM set_config('bcb.door_result', 'ALLOW|' || COALESCE(v_out, '<null>'), false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.door_result', SQLSTATE || '|' || SQLERRM, false);
END
$proof$;
SELECT current_setting('bcb.door_result');
ROLLBACK;`).trim();
}

test(
  'организация без per-org строки booking_max_consecutive_slot_hours получает реестровый дефолт 3',
  { skip: !ENABLED },
  () => {
    const [actorRef, organizationId] = anyEnrolledActorAndOrg();
    const result = readWithoutOwnRow({ actorRef, organizationId, key: 'booking_max_consecutive_slot_hours' });
    assert.equal(result, 'ALLOW|3', `отсутствующая строка не выдала реестровый дефолт 3: ${result}`);
  },
);

test(
  'организация без per-org строки booking_min_notice_hours получает реестровый дефолт 0',
  { skip: !ENABLED },
  () => {
    const [actorRef, organizationId] = anyEnrolledActorAndOrg();
    const result = readWithoutOwnRow({ actorRef, organizationId, key: 'booking_min_notice_hours' });
    assert.equal(result, 'ALLOW|0', `отсутствующая строка не выдала реестровый дефолт 0: ${result}`);
  },
);

test(
  'сохранённое, но не числовое значение booking_max_consecutive_slot_hours по-прежнему падает громко',
  { skip: !ENABLED },
  () => {
    const [actorRef, organizationId] = anyEnrolledActorAndOrg();
    const result = readWithBrokenOwnRow({ actorRef, organizationId, key: 'booking_max_consecutive_slot_hours' });
    assert.match(result, /^22023\|/u, `битое сохранённое значение не отвергнуто громко: ${result}`);
  },
);
