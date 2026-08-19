/**
 * Живое доказательство стен ЗАПИСИ публичной воронки на именованной DEV-базе. Opt-in: без
 * `RUN_PUBLIC_BOOKING_WRITE_WALLS_DB=1` файл пропускается, поэтому в CI он в базу не ходит.
 *
 * Что доказывается (по одному свойству на тест, все — про поведение базы, не про текст кода):
 *
 *   1. Дверь зачисления НЕ верит аргументу-организации: неопубликованная клиника и выдуманный
 *      идентификатор отвергаются самой базой с 42501, хотя вызывающий назвал их явно. Публичная
 *      запись — анонимная поверхность; если бы дверь верила аргументу, любой посетитель заводил бы
 *      себе отношение с клиникой, которая снаружи не существует.
 *   2. Дверь зачисления берёт человека ИЗ КОНТЕКСТА, а не из аргумента: аргумента с человеком у неё
 *      нет вовсе, и строка `org_enrollments` появляется ровно у субъекта принятого контекста.
 *      Это то, что мешает анониму записать ЧУЖОГО человека в клиенты опубликованной клиники —
 *      то есть показать его имя и телефон её персоналу.
 *   3. Выписанного (`discharged`) или архивного (`archived`) клиента дверь обратно не открывает:
 *      это отказ 42501, а не тихое воскрешение строки.
 *   4. ЧУЖОЙ идентификатор организации в создании приёма отвергает БАЗА, а не код приложения:
 *      корень `app.create_current_patient_booking_appointments` сверяет `organizationId` полезной
 *      нагрузки с организацией принятого контекста и падает, даже если приложение пропустило.
 *
 * Приём контекста ставится строкой в `app_ext.accepted_port_contexts` от имени администратора —
 * так же, как это делает соседнее доказательство гейта (`port-context-gate-refusal.devDbProof`),
 * потому что `app.begin_port_context` выдан только логинам с mTLS, а доказывать надо ПРАВИЛО ДВЕРИ,
 * а не клиентские сертификаты. Вся работа идёт в транзакции, которая заканчивается ROLLBACK:
 * DEV-данные не меняются.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PUBLIC_BOOKING_WRITE_WALLS_DB=1 node --test \
 *     deploy/postgres/privileges/public-booking-write-walls.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_PUBLIC_BOOKING_WRITE_WALLS_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const INVENTED_ORG = '11111111-2222-4333-8444-555555555555';

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

/**
 * Ставит принятую строку контекста класса `patient` под указанную способность и типизированные
 * аргументы. `typedArgsSql` считается ЗДЕСЬ, от имени администратора: `app.hash_port_typed_args`
 * рабочим ролям не выдан, и это правильно — его зовут изнутри дверей.
 */
function acceptPatientContext({ purpose, functionIdentity, typedArgsSql, subjectRef, organizationId }) {
  return `
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref, organization_id)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, session_user,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       app.hash_port_typed_args(${typedArgsSql}),
       '${subjectRef}'::uuid, '${subjectRef}'::uuid,
       ${organizationId ? `'${organizationId}'::uuid` : 'NULL::uuid'}
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database()
   AND c.purpose = '${purpose}'
   AND c.function_identity = '${functionIdentity}'::regprocedure
 LIMIT 1;`;
}

/** Возвращает 'ALLOW|<значение>' либо '<SQLSTATE>|<сообщение>' — один прогон покрывает оба исхода. */
function callDoor({ context, call }) {
  return psql(`
BEGIN;
${context}
DO $proof$
DECLARE v_out text;
BEGIN
  SELECT (${call})::text INTO v_out;
  PERFORM set_config('bcb.door_result', 'ALLOW|' || COALESCE(v_out, '<null>'), false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.door_result', SQLSTATE || '|' || SQLERRM, false);
END
$proof$;
SELECT current_setting('bcb.door_result');
ROLLBACK;`).trim();
}

const ENROL_PURPOSE = 'booking.public-client.enroll';
const ENROL_FN = 'app.enroll_current_patient_in_public_booking_clinic(uuid)';
const enrolTypedArgs = (organizationId) =>
  `ARRAY[ROW('uuid@1', pg_catalog.uuid_send('${organizationId}'::uuid))::app.port_typed_arg]`;

function enrol({ subjectRef, organizationId }) {
  return callDoor({
    context: acceptPatientContext({
      purpose: ENROL_PURPOSE,
      functionIdentity: ENROL_FN,
      typedArgsSql: enrolTypedArgs(organizationId),
      subjectRef,
    }),
    call: `app.enroll_current_patient_in_public_booking_clinic('${organizationId}'::uuid)`,
  });
}

/** Личность, у которой ЕСТЬ разрешаемая ссылка variant-a: без неё контекст не назовёт человека. */
function anyPatientRef() {
  return fixture(
    `SELECT ref.opaque_ref
       FROM app_ext.variant_a_identity_refs ref
       JOIN public.platform_users u ON u.id = ref.physical_user_id
      WHERE u.merged_into_id IS NULL AND u.role = 'client'
      LIMIT 1;`,
    'клиент с разрешаемой ссылкой личности',
  )[0];
}

function publishedOrg() {
  return fixture(
    `SELECT organization_id FROM public.clinic_public_directory_entries
      WHERE is_published = true LIMIT 1;`,
    'опубликованная клиника',
  )[0];
}

test('дверь зачисления не верит аргументу: неопубликованная и выдуманная клиника отвергнуты базой',
  { skip: !ENABLED }, () => {
    const subjectRef = anyPatientRef();

    const published = publishedOrg();
    const accepted = enrol({ subjectRef, organizationId: published });
    assert.match(accepted, /^ALLOW\|(active|invited)$/u,
      `опубликованная клиника не приняла посетителя: ${accepted}`);

    const [unpublished] = fixture(
      `SELECT o.id FROM public.be_organizations o
        WHERE NOT EXISTS (SELECT 1 FROM public.clinic_public_directory_entries d
                           WHERE d.organization_id = o.id AND d.is_published = true)
        LIMIT 1;`,
      'клиника без публикации',
    );

    for (const [label, organizationId] of [
      ['неопубликованная', unpublished],
      ['выдуманная', INVENTED_ORG],
    ]) {
      const refusal = enrol({ subjectRef, organizationId });
      assert.match(refusal, /^42501\|/u, `${label} клиника принята дверью: ${refusal}`);
    }
  });

test('дверь зачисления берёт человека из контекста, а не из аргумента', { skip: !ENABLED }, () => {
  const subjectRef = anyPatientRef();
  const organizationId = publishedOrg();

  // Аргумент с человеком у двери отсутствует по сигнатуре — это и есть стена. Проверяется, что
  // строка появляется ровно у субъекта принятого контекста.
  const owner = psql(`
BEGIN;
${acceptPatientContext({
  purpose: ENROL_PURPOSE,
  functionIdentity: ENROL_FN,
  typedArgsSql: enrolTypedArgs(organizationId),
  subjectRef,
})}
DELETE FROM public.org_enrollments
 WHERE organization_id = '${organizationId}'::uuid
   AND platform_user_id = app_ext.resolve_variant_a_physical('${subjectRef}'::uuid);
SELECT app.enroll_current_patient_in_public_booking_clinic('${organizationId}'::uuid);
SELECT (e.platform_user_id = app_ext.resolve_variant_a_physical('${subjectRef}'::uuid))::text
       || '|' || e.status || '|' || COALESCE(e.portal_activated_via, '<null>')
  FROM public.org_enrollments e
 WHERE e.organization_id = '${organizationId}'::uuid
   AND e.platform_user_id = app_ext.resolve_variant_a_physical('${subjectRef}'::uuid);
ROLLBACK;`)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .pop();

  assert.equal(owner, 'true|active|public_booking_phone_otp',
    `зачисление легло не на субъекта контекста или не тем статусом: ${owner}`);
});

test('выписанного и архивного клиента дверь зачисления обратно не открывает', { skip: !ENABLED }, () => {
  const subjectRef = anyPatientRef();
  const organizationId = publishedOrg();

  for (const status of ['discharged', 'archived']) {
    const refusal = psql(`
BEGIN;
${acceptPatientContext({
  purpose: ENROL_PURPOSE,
  functionIdentity: ENROL_FN,
  typedArgsSql: enrolTypedArgs(organizationId),
  subjectRef,
})}
INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
VALUES ('${organizationId}'::uuid, app_ext.resolve_variant_a_physical('${subjectRef}'::uuid), '${status}')
ON CONFLICT (organization_id, platform_user_id) DO UPDATE SET status = '${status}',
  portal_activated_at = NULL, portal_activated_via = NULL;
DO $proof$
BEGIN
  PERFORM app.enroll_current_patient_in_public_booking_clinic('${organizationId}'::uuid);
  PERFORM set_config('bcb.door_result', 'ALLOW', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.door_result', SQLSTATE || '|' || SQLERRM, false);
END
$proof$;
SELECT current_setting('bcb.door_result');
ROLLBACK;`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .pop();

    assert.match(refusal, /^42501\|/u, `клиент в статусе ${status} открыт заново: ${refusal}`);
  }
});

test('чужой идентификатор организации в создании приёма отвергает база, а не приложение',
  { skip: !ENABLED }, () => {
    // Фикстура нарочно НАСТОЯЩАЯ с обеих сторон: клиент с действующим зачислением в своей клинике,
    // и ЖИВАЯ, публично записываемая тройка «филиал+специалист+услуга» ЧУЖОЙ клиники. Иначе тест
    // ничего не доказывает: выдуманные идентификаторы каталога роняют вызов на проверке каталога
    // (42501) независимо от того, сверяется ли организация вообще — проверено внесением поломки.
    const [subjectRef, patientId, ownOrg, foreignOrg, branchId, specialistId, serviceId] = fixture(`
SELECT ref.opaque_ref || '|' || ref.physical_user_id || '|' || own.organization_id || '|'
       || a.organization_id || '|' || a.branch_id || '|' || a.specialist_id || '|' || a.service_id
  FROM app_ext.variant_a_identity_refs ref
  JOIN public.org_enrollments own
    ON own.platform_user_id = ref.physical_user_id AND own.status = 'active'
  JOIN public.be_specialist_service_availability a ON a.organization_id <> own.organization_id
  JOIN public.be_specialists sp
    ON sp.id = a.specialist_id AND sp.organization_id = a.organization_id AND sp.is_active
  JOIN public.be_branches b
    ON b.id = a.branch_id AND b.organization_id = a.organization_id AND b.is_active
  JOIN public.be_clinic_services s
    ON s.id = a.service_id AND s.organization_id = a.organization_id AND s.is_active
   AND s.public_widget_visible AND NOT s.admin_manual_only
 WHERE a.is_active
 LIMIT 1;`, 'клиент своей клиники и живая публичная тройка каталога чужой клиники');

    // Всё в полезной нагрузке настоящее и согласованное, кроме одного: организация ЧУЖАЯ, а принятый
    // контекст — на свою. Единственное, что может её отвергнуть, — сверка организации.
    const payload = JSON.stringify([{
      organizationId: foreignOrg,
      branchId,
      specialistId,
      serviceId,
      roomId: null,
      platformUserId: patientId,
      startAt: '2027-01-01T10:00:00.000Z',
      endAt: '2027-01-01T11:00:00.000Z',
      durationMinutes: 60,
      status: 'confirmed',
      source: 'public_widget',
    }]).replaceAll("'", "''");

    const refusal = callDoor({
      context: acceptPatientContext({
        purpose: 'booking.patient-appointments.create',
        functionIdentity: 'app.create_current_patient_booking_appointments(text)',
        typedArgsSql: `ARRAY[ROW('text@1', pg_catalog.textsend('${payload}'::text))::app.port_typed_arg]`,
        subjectRef,
        organizationId: ownOrg,
      }),
      call: `app.create_current_patient_booking_appointments('${payload}'::text)`,
    });

    // Ровно 22023 «invalid current patient appointment payload» — отказ ИМЕННО по организации.
    // Если сверку организации убрать, вызов доходит до проверки каталога и отвечает 42501, поэтому
    // широкая маска здесь была бы зелёной на сломанной двери.
    assert.match(refusal, /^22023\|/u,
      `приём создан или отвергнут не по организации: ${refusal}`);
  });
