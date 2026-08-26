/**
 * Живое доказательство двери `app.record_public_booking_merge_candidates` на именованной DEV-базе.
 * Opt-in: без `RUN_PUBLIC_BOOKING_MERGE_CANDIDATES_DB=1` файл пропускается, в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): back-office очередь «похожих людей» для сотрудников снова
 * молча пустая — до этой ветки `pgPublicBookingMergeCandidates` читал `platform_users`/`user_contacts`
 * бэрым `Pool` без единого принципала и падал на КАЖДОМ вызове с «Missing declared webapp port
 * capability: pre_session», а вызывающий код это ловил, логировал и терял (см. комментарий на
 * `createVerifiedPublicBooking.ts`, Track D synthesis 26.08).
 *
 * Свойства (по одному на тест, все — про поведение базы):
 *   1. Кандидат на слияние действительно появляется — совпадение по ФИО среди клиентов БЕЗ телефона,
 *      как и раньше делал прежний TS-запрос (COALESCE-джойн через `user_identity`).
 *   2. Повторный вызов с теми же аргументами не плодит вторую строку (`ON CONFLICT ... DO NOTHING`
 *      на `(organization_id, anchor_user_id, candidate_user_id) WHERE status = 'pending'`).
 *   3. Без принятого контекста дверь отказывает `42501`, а не молчит и не пишет с пустым принципалом.
 *   4. Принятый контекст без организации (identity-only) отказывает `42501` — дверь не пишет строку
 *      без организационной привязки, которую потом некому будет открыть в кабинете клиники.
 *   5. Аргумент `organizationId`, не совпадающий с организацией ПРИНЯТОГО контекста, отказывает
 *      `42501` базой, а не приложением — это добавленная в этой же ветке проверка
 *      `app.current_org_id()`, которой у прежнего кода не было вовсе (аргумент шёл откуда угодно).
 *
 * Приём контекста ставится строкой в `app_ext.accepted_port_contexts` от имени администратора, тем же
 * приёмом, что и `public-booking-write-walls.devDbProof.test.mjs`, потому что `app.begin_port_context`
 * выдан только логинам с mTLS, а доказывать надо ПРАВИЛО ДВЕРИ, а не клиентские сертификаты. Строка
 * каталога возможностей для НОВОЙ двери в живой DEV ещё не завезена реконсайлом (эта ветка деплой не
 * делает), поэтому фикстура вставляет её сама — ровно ту же строку, что вывел генератор.
 *
 * Вся работа идёт в транзакции, которая заканчивается ROLLBACK: функция, гранты, строка каталога
 * возможностей и любые фикстурные аккаунты в DEV не остаются.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PUBLIC_BOOKING_MERGE_CANDIDATES_DB=1 node --test \
 *     deploy/postgres/privileges/public-booking-merge-candidates.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PUBLIC_BOOKING_MERGE_CANDIDATES_DB === '1';
const DATABASE = process.env.PUBLIC_BOOKING_MERGE_CANDIDATES_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATION = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations',
  '20260826T140000_platform_support_and_public_booking_merge_doors.sql');
const PRIVILEGES = path.join(repoRoot, 'deploy/postgres/generated', `privileges.${DATABASE}.sql`);
const CAPABILITIES = path.join(repoRoot, 'deploy/postgres/generated',
  `port-context-capabilities.${DATABASE}.sql`);

const IDENTITY = 'app.record_public_booking_merge_candidates(uuid,uuid,text,uuid)';
const SEAM_OWNER = 'app_seam_patient_booking_owner';
const PATIENT_ROLE = 'app_patient';
const PURPOSE = 'booking.public-merge-candidates.record';
const FIXTURE_CAPABILITY_ID = '00000000-0000-4000-8000-0000000000fe';

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim();
}

function lastLine(output) {
  return output.split('\n').map((l) => l.trim()).filter((l) => l !== '').pop();
}

function fixtureRow(sql, what) {
  const value = psql(sql);
  assert.notEqual(value, '', `DEV-база не содержит фикстуры: ${what}`);
  return value.split('|');
}

/** Ровно те строки доступа, которые генератор вывел из декларации — не переписанные руками. */
function generatedLine(file, needle, what) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.includes(needle));
  assert.ok(line, `в ${path.basename(file)} нет строки ${what} — артефакт не перегенерирован`);
  return line.trim();
}

/** Обе RLS-политики именованного владельца — дословно из candidate-артефакта reconcile. */
function generatedNamedRootPolicies(relation) {
  const marker = `ON "public"."${relation}"`;
  const lines = fs.readFileSync(PRIVILEGES, 'utf8').split('\n').filter((row) =>
    row.startsWith('CREATE POLICY')
      && row.includes(marker)
      && row.includes(`"${SEAM_OWNER}"`)
      && (row.includes('rev10_named_root_owner_gate_') || row.includes('rev10_seam_business_')),
  );
  assert.equal(lines.length, 2,
    `в ${path.basename(PRIVILEGES)} нет обеих RLS-политик ${SEAM_OWNER} для ${relation}`);
  const drops = lines.map((line) => {
    const policyName = /^CREATE POLICY "([^"]+)"/u.exec(line)?.[1];
    assert.ok(policyName, `имя policy не извлекается из candidate-строки для ${relation}`);
    return `DROP POLICY IF EXISTS "${policyName}" ON "public"."${relation}";`;
  });
  return [...drops, ...lines].join('\n');
}

/** Тело ВТОРОЙ функции миграции (после `--> statement-breakpoint`, до конца файла). */
function secondFunctionBody() {
  const text = fs.readFileSync(MIGRATION, 'utf8');
  const breakpoint = text.indexOf('--> statement-breakpoint');
  assert.ok(breakpoint > -1, 'разделитель statement-breakpoint не найден — файл миграции переименован?');
  const start = text.indexOf('CREATE OR REPLACE FUNCTION', breakpoint);
  assert.ok(start > -1, 'вторая функция миграции не найдена');
  return text.slice(start);
}

function fixture() {
  const executeGrant = generatedLine(PRIVILEGES,
    `ON FUNCTION ${IDENTITY} TO "${PATIENT_ROLE}"`, 'EXECUTE-гранта двери');
  const platformUsersSelect = generatedLine(PRIVILEGES,
    `GRANT SELECT ("id", "merged_into_id", "role") ON TABLE "public"."platform_users" TO "${SEAM_OWNER}"`,
    'колоночного SELECT-гранта platform_users владельцу шва');
  const userIdentitySelect = generatedLine(PRIVILEGES,
    `GRANT SELECT ("display_name", "platform_user_id") ON TABLE "public"."user_identity" TO "${SEAM_OWNER}"`,
    'колоночного SELECT-гранта user_identity владельцу шва');
  const userContactsSelect = generatedLine(PRIVILEGES,
    'GRANT SELECT ("contact_kind", "is_primary", "platform_user_id", "value_normalized") ON TABLE'
      + ` "public"."user_contacts" TO "${SEAM_OWNER}"`,
    'колоночного SELECT-гранта user_contacts владельцу шва');
  const mergeCandidatesSelect = generatedLine(PRIVILEGES,
    'GRANT SELECT ("anchor_user_id", "candidate_user_id", "organization_id", "payload", "reason",'
      + ` "status", "trigger_appointment_id") ON TABLE "public"."patient_merge_candidates" TO "${SEAM_OWNER}"`,
    'колоночного SELECT-гранта patient_merge_candidates владельцу шва');
  const mergeCandidatesInsert = generatedLine(PRIVILEGES,
    'GRANT INSERT ("anchor_user_id", "candidate_user_id", "organization_id", "payload", "reason",'
      + ` "status", "trigger_appointment_id") ON TABLE "public"."patient_merge_candidates" TO "${SEAM_OWNER}"`,
    'колоночного INSERT-гранта patient_merge_candidates владельцу шва');
  const capabilityValues = generatedLine(CAPABILITIES, 'record_public_booking_merge_candidates',
    'строки каталога возможностей').replace(/,$/, '');

  return [
    'BEGIN;',
    // Мигратор даёт владельцу шва ровно это на время своего statement и снимает после; здесь то же
    // самое делает транзакция, которая всё равно откатится.
    `GRANT CREATE ON SCHEMA app TO ${SEAM_OWNER};`,
    `GRANT USAGE ON LANGUAGE plpgsql TO ${SEAM_OWNER};`,
    `SET LOCAL ROLE ${SEAM_OWNER};`,
    secondFunctionBody(),
    'RESET ROLE;',
    executeGrant, platformUsersSelect, userIdentitySelect, userContactsSelect,
    mergeCandidatesSelect, mergeCandidatesInsert,
    // Живой DEV ещё не реконсайлился из candidate checkout. Одних грантов при FORCE RLS
    // недостаточно: применяем ровно две candidate-политики владельца шва для новых поверхностей.
    generatedNamedRootPolicies('user_identity'),
    generatedNamedRootPolicies('patient_merge_candidates'),
    // Строка каталога возможностей — та, что вывел генератор из декларации; в живом DEV эта ветка
    // её ещё не реконсайлила, поэтому фикстура кладёт её сама, под РЕАЛЬНЫМ логином из артефакта.
    'INSERT INTO app_ext.port_context_capabilities (capability_id, port, session_login, target_role,'
      + ` context_class, purpose, function_identity) VALUES ${capabilityValues};`,
  ].join('\n');
}

/**
 * Ставит принятую строку контекста класса `patient` от имени администратора — форма пересобрана из
 * только что вставленной генератором-строки способности (порт, роль, класс, назначение, функция),
 * отличаясь только логином, ровно как в `public-booking-write-walls.devDbProof.test.mjs`.
 */
function acceptPatientContext({ typedArgsSql, actorRef, organizationId }) {
  return `
DO $mint$ BEGIN PERFORM set_config('bcb.proof_subject_ref', app_ext.resolve_variant_a_identity(
  (SELECT r.physical_user_id FROM app_ext.variant_a_identity_refs r
    WHERE r.opaque_ref = '${actorRef}'::uuid), 'subject')::text, false); END $mint$;
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '${FIXTURE_CAPABILITY_ID}'::uuid, c.port, session_user,
       c.target_role, c.context_class, c.purpose, c.function_identity
  FROM app_ext.port_context_capabilities c
 WHERE c.purpose = '${PURPOSE}'
   AND c.function_identity = '${IDENTITY}'::regprocedure
   AND c.capability_id <> '${FIXTURE_CAPABILITY_ID}'::uuid
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
   AND c.capability_id = '${FIXTURE_CAPABILITY_ID}'::uuid
 LIMIT 1;`;
}

function typedArgsSql({ organizationId, anchorUserId, contactName, triggerAppointmentId }) {
  return `ARRAY[
    ROW('uuid@1', pg_catalog.uuid_send('${organizationId}'::uuid))::app.port_typed_arg,
    ROW('uuid@1', pg_catalog.uuid_send('${anchorUserId}'::uuid))::app.port_typed_arg,
    ROW('text@1', pg_catalog.textsend('${contactName}'))::app.port_typed_arg,
    ROW('uuid@1', pg_catalog.uuid_send('${triggerAppointmentId}'::uuid))::app.port_typed_arg]`;
}

function call({ organizationId, anchorUserId, contactName, triggerAppointmentId }) {
  return `app.record_public_booking_merge_candidates('${organizationId}'::uuid,`
    + ` '${anchorUserId}'::uuid, '${contactName}'::text, '${triggerAppointmentId}'::uuid)`;
}

/** Возвращает 'ALLOW|<значение>' либо '<SQLSTATE>|<сообщение>' — один прогон покрывает оба исхода. */
function callDoor({ context, callSql }) {
  return lastLine(psql(`
${fixture()}
${context}
DO $proof$
DECLARE v_out text;
BEGIN
  SELECT (${callSql})::text INTO v_out;
  PERFORM set_config('bcb.door_result', 'ALLOW|' || COALESCE(v_out, '<null>'), false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.door_result', SQLSTATE || '|' || SQLERRM, false);
END
$proof$;
SELECT current_setting('bcb.door_result');
ROLLBACK;`));
}

/**
 * Реальная завершённая часть пути: акторская Variant-A ссылка, пациент, клиника и существующий
 * приём. Дверь вызывается только после создания канонического приёма, поэтому выдуманный UUID здесь
 * не был допустимой фикстурой — внешний ключ правильно его отвергал.
 */
function anchorWithAppointment() {
  return fixtureRow(`
SELECT ref.opaque_ref || '|' || appointment.platform_user_id || '|'
       || appointment.organization_id || '|' || appointment.id
  FROM public.be_appointments appointment
  JOIN app_ext.variant_a_identity_refs ref
    ON ref.physical_user_id = appointment.platform_user_id AND ref.ref_kind = 'actor'
  JOIN public.platform_users person
    ON person.id = appointment.platform_user_id AND person.role = 'client'
 WHERE appointment.platform_user_id IS NOT NULL
 LIMIT 1;`, 'канонический приём клиента с акторской ссылкой личности');
}

const CONTACT_NAME = 'Дубликат Тестович';

/** Superuser-фикстура: клиент-«кандидат» без телефона и с тем же ФИО, что назовёт вызов двери. */
function insertCandidateSql(candidateId) {
  return `
INSERT INTO public.platform_users (id, role, created_at, updated_at)
VALUES ('${candidateId}'::uuid, 'client', now(), now());
INSERT INTO public.user_identity (platform_user_id, display_name)
VALUES ('${candidateId}'::uuid, '${CONTACT_NAME}');`;
}

test('находит кандидата на слияние по ФИО среди клиентов без телефона', { skip: !ENABLED }, () => {
  const [actorRef, anchorId, organizationId, triggerAppointmentId] = anchorWithAppointment();
  const candidateId = '11111111-2222-4333-8444-000000000001';
  const args = { organizationId, anchorUserId: anchorId, contactName: CONTACT_NAME,
    triggerAppointmentId };

  const result = lastLine(psql(`
${fixture()}
${insertCandidateSql(candidateId)}
${acceptPatientContext({ typedArgsSql: typedArgsSql(args), actorRef, organizationId })}
SELECT ${call(args)};
SELECT count(*)::text || '|' || (SELECT status FROM public.patient_merge_candidates
    WHERE organization_id = '${organizationId}'::uuid AND anchor_user_id = '${anchorId}'::uuid
      AND candidate_user_id = '${candidateId}'::uuid)
  FROM public.patient_merge_candidates
 WHERE organization_id = '${organizationId}'::uuid AND anchor_user_id = '${anchorId}'::uuid
   AND candidate_user_id = '${candidateId}'::uuid;
ROLLBACK;`));

  assert.equal(result, '1|pending',
    `кандидат на слияние не появился строкой pending: ${result}`);
});

test('повторный вызов с теми же аргументами не плодит вторую строку кандидата', { skip: !ENABLED }, () => {
  const [actorRef, anchorId, organizationId, triggerAppointmentId] = anchorWithAppointment();
  const candidateId = '11111111-2222-4333-8444-000000000002';
  const args = { organizationId, anchorUserId: anchorId, contactName: CONTACT_NAME,
    triggerAppointmentId };

  const result = lastLine(psql(`
${fixture()}
${insertCandidateSql(candidateId)}
${acceptPatientContext({ typedArgsSql: typedArgsSql(args), actorRef, organizationId })}
SELECT set_config('bcb.first_count', ${call(args)}::text, false);
SELECT set_config('bcb.second_count', ${call(args)}::text, false);
SELECT current_setting('bcb.first_count') || '|' || current_setting('bcb.second_count') || '|' || (
  SELECT count(*)::text FROM public.patient_merge_candidates
   WHERE organization_id = '${organizationId}'::uuid AND anchor_user_id = '${anchorId}'::uuid
     AND candidate_user_id = '${candidateId}'::uuid
);
ROLLBACK;`));

  assert.equal(result, '1|0|1',
    `повторный вызов не был идемпотентным (первый счёт|второй счёт|итоговых строк): ${result}`);
});

test('без принятого контекста дверь отказывает 42501, а не молчит и не теряет запись',
  { skip: !ENABLED }, () => {
    const [, anchorId, organizationId, triggerAppointmentId] = anchorWithAppointment();
    const args = { organizationId, anchorUserId: anchorId, contactName: CONTACT_NAME,
      triggerAppointmentId };

    const refusal = callDoor({ context: '', callSql: call(args) });
    assert.equal(refusal, '42501|accepted port context required',
      `вызов без принятого контекста прошёл или отказал не той причиной: ${refusal}`);
  });

test('принятый контекст без организации (identity-only) дверь отказывает 42501',
  { skip: !ENABLED }, () => {
    const [actorRef, anchorId, organizationId, triggerAppointmentId] = anchorWithAppointment();
    const args = { organizationId, anchorUserId: anchorId, contactName: CONTACT_NAME,
      triggerAppointmentId };

    const refusal = callDoor({
      context: acceptPatientContext({ typedArgsSql: typedArgsSql(args), actorRef, organizationId: null }),
      callSql: call(args),
    });
    assert.equal(refusal, '42501|public_booking_merge_candidates_principal_required',
      `identity-only контекст без организации записал кандидата или отказал не той причиной: ${refusal}`);
  });

test('аргумент organizationId, чужой относительно принятого контекста, отказывает 42501',
  { skip: !ENABLED }, () => {
    const [actorRef, anchorId, organizationId, triggerAppointmentId] = anchorWithAppointment();
    const [foreignOrg] = fixtureRow(
      `SELECT id FROM public.be_organizations WHERE id <> '${organizationId}'::uuid LIMIT 1;`,
      'вторая организация, отличная от организации анкера',
    );
    // Аргумент называет ЧУЖУЮ организацию; принятый контекст — свою. Хеш типизированных аргументов
    // считается по НАЗВАННОМУ (чужому) аргументу — ровно так дверь получила бы его от вызывающего
    // кода, который передал бы organizationId интента, а не организацию своего принципала.
    const args = { organizationId: foreignOrg, anchorUserId: anchorId, contactName: CONTACT_NAME,
      triggerAppointmentId };

    const refusal = callDoor({
      context: acceptPatientContext({ typedArgsSql: typedArgsSql(args), actorRef, organizationId }),
      callSql: call(args),
    });
    assert.equal(refusal, '42501|public_booking_merge_candidates_principal_mismatch',
      `чужая организация в аргументе была принята дверью или отказ не той причиной: ${refusal}`);
  });
