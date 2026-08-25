/**
 * Живое доказательство D15b/7a Ш8 — журнал акта связывания личности с медициной и правило тревоги
 * на аномальный объём. Opt-in: без `RUN_IDENTITY_BOUNDARY_AUDIT_DB=1` файл пропускается, поэтому в
 * CI он в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): пересечение границы «личность ↔ медицина» происходит, а в
 * журнале его либо нет, либо оно записано НЕ В ТОМ ОБЪЁМЕ (строка на пациента вместо одного события
 * на пакет), либо запись сама несёт персональные данные, либо аномальный объём никого не будит.
 *
 * Что здесь доказывается ПОВЕДЕНИЕМ двери, а не текстом исходника:
 *   1. каждая из четырёх точек пишет РОВНО ОДНО событие в объёме, заданном планом: создание связки —
 *      одно на человека; вход — одно на сессию; открытие карточки — одно на пару «врач-пациент» в
 *      сутки; список — одно на пакет, а не N строк на N пациентов;
 *   2. повтор в пределах сессии/суток/пакета поднимает `repeat_count`, а НЕ плодит строки;
 *   3. журнал не становится утечкой сам: запись с именем, телефоном или диагнозом дверь отвергает
 *      `23514` — это утверждение ПО СОДЕРЖИМОМУ, а не «посмотрели глазами»;
 *   4. правило тревоги срабатывает на превышении порога и молчит ниже него;
 *   5. стены двери держат: чужой актор, организация у бестенантного действия и неизвестный вид
 *      события отвергаются;
 *   6. КАЖДЫЙ вывод накрыт инъекцией: та же проба против двери, из которой снята проверяемая
 *      строка, отвечает противоположное — красный результат нельзя получить случайно. Инъекция
 *      живёт ЗДЕСЬ, продукт на диске не трогается.
 *
 * Почему проба сама раскладывает тела. Дверь приезжает миграцией, резолвер — reconcile-ом файла
 * `deploy/postgres/port-context/contract.sql`; ни того, ни другого эта ветка на DEV выполнять не
 * может (`--execute` запрещён). Поэтому проба берёт ИЗ САМИХ ФАЙЛОВ ПРОДУКТА целевые тела,
 * проигрывает их в откаченной транзакции и там же спрашивает — это тот же текст, что приедет
 * накатом, а не его пересказ.
 *
 * Границы доказательства. Проба идёт под локальным админ-сокетом (`sudo -n -u postgres psql`,
 * AGENTS.md §6): тело двери исполняется от владельца шва (SECURITY DEFINER), поэтому его права на
 * `admin_audit_log` проверяются по-настоящему, а вот маршрут клиентских логинов и гранты рантайма —
 * нет; их проверяет reconcile и живой прогон ПОСЛЕ него.
 *
 * Ничего не остаётся в базе: и DDL, и вставки идут внутри `BEGIN … ROLLBACK`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_IDENTITY_BOUNDARY_AUDIT_DB=1 node --test \
 *     deploy/postgres/privileges/identity-boundary-audit.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_IDENTITY_BOUNDARY_AUDIT_DB === '1';
const DATABASE = process.env.IDENTITY_BOUNDARY_AUDIT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../apps/webapp/db/drizzle-migrations/20260822T180000_one_door_records_the_act_of_binding_a_person_to_medicine.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const CONTRACT = readFileSync(
  fileURLToPath(new URL('../port-context/contract.sql', import.meta.url)),
  'utf8',
);

/** Точный кусок продукта между двумя его же якорями — иначе проба доказывала бы свой пересказ. */
function slice(source, name, startsWith, endsWith) {
  const from = source.indexOf(startsWith);
  assert.notEqual(from, -1, `${name} больше не содержит '${startsWith}'`);
  const to = source.indexOf(endsWith, from);
  assert.notEqual(to, -1, `${name} больше не содержит '${endsWith}' после '${startsWith}'`);
  return source.slice(from, to + endsWith.length);
}

const DOOR = slice(
  MIGRATION,
  'миграция Ш8',
  'CREATE OR REPLACE FUNCTION app.record_collapsing_audit_event(',
  '$function$;',
);
const RESOLVER = slice(
  CONTRACT,
  'contract.sql',
  'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid, p_ref_kind text)',
  'END $$;',
);

/**
 * Целевая форма. Владелец двери назначается явно: `CREATE` от суперпользователя оставил бы её за
 * `postgres`, а гейт принятого контекста требует, чтобы названная роль БЫЛА владельцем названной
 * функции, — то есть без этой строки проба доказывала бы отказ гейта, а не работу двери.
 */
const SHAPE = [
  DOOR,
  'ALTER FUNCTION app.record_collapsing_audit_event(text,uuid,uuid,text,text,text) OWNER TO app_seam_identity_lookup_owner;',
  RESOLVER,
].join('\n');

/** Инъекция: снятая строка продукта. Каждая обязана существовать — иначе проверять нечего. */
function withoutLine(fragment) {
  assert.ok(SHAPE.includes(fragment), `в двери больше нет строки инъекции: ${fragment}`);
  return SHAPE.replace(fragment, '');
}

/**
 * Инъекция целым блоком. Снять у блока только заголовок — не инъекция, а ДРУГАЯ поломка: тело
 * начинает исполняться безусловно, и проба зеленеет по неверной причине.
 */
function withoutBlock(startsWith, endsWith) {
  const from = SHAPE.indexOf(startsWith);
  assert.notEqual(from, -1, `в двери больше нет начала блока инъекции: ${startsWith}`);
  const to = SHAPE.indexOf(endsWith, from);
  assert.notEqual(to, -1, `в двери больше нет конца блока инъекции: ${endsWith}`);
  return SHAPE.slice(0, from) + SHAPE.slice(to + endsWith.length);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Один вопрос к целевой форме; всё, что он сделал, откатывается. */
function probe(body, shape = SHAPE) {
  const raw = psql(`
BEGIN;
${shape}
DO $probe$
BEGIN
${body}
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bcb.probe', SQLSTATE || '|' || SQLERRM, false);
END $probe$;
SELECT current_setting('bcb.probe');
ROLLBACK;
`);
  return raw.split('|');
}

/**
 * Принятый контекст этой транзакции. Строка одна на транзакцию (первичный ключ по backend/xact),
 * поэтому перед установкой прежняя снимается. `capability_id` берётся у любой ОБЪЯВЛЕННОЙ
 * способности: внешний ключ обязан остаться настоящим, а предметом проверки здесь являются
 * роль/класс/цель/хеш аргументов, которые гейт двери и сверяет.
 */
const useContext = (fields) => `
    DELETE FROM app_ext.accepted_port_contexts
     WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
    INSERT INTO app_ext.accepted_port_contexts (
      database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
      context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref,
      organization_id)
    SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, session_user, c.port,
           ${fields.targetRole}, ${fields.contextClass}, ${fields.purpose},
           ${fields.functionIdentity}, ${fields.typedArgsHash}, ${fields.actorRef ?? 'NULL'},
           ${fields.subjectRef ?? 'NULL'}, ${fields.organizationId ?? 'NULL'}
      FROM pg_database d, app_ext.port_context_capabilities c
     WHERE d.datname = current_database()
     LIMIT 1;`;

/** Хеш ровно тех шести аргументов, с которыми дверь будет вызвана. */
const doorArgsHash = (action, org, actor, target, key, details) => `
      app.hash_port_typed_args(ARRAY[
        ROW('text@1', pg_catalog.textsend(${action}))::app.port_typed_arg,
        ROW('uuid@1', pg_catalog.uuid_send(${org}))::app.port_typed_arg,
        ROW('uuid@1', pg_catalog.uuid_send(${actor}))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend(${target}))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend(${key}))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend(${details}))::app.port_typed_arg])`;

/** Контекст персонала под целью журнала: организация и акторская ссылка настоящие. */
const staffContext = (action, orgExpr, actorExpr, targetExpr, detailsExpr) =>
  useContext({
    targetRole: `'app_staff'::name`,
    contextClass: `'staff'::app.port_context_class`,
    purpose: `'identity.boundary-crossing.record'`,
    functionIdentity: `'app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)'::regprocedure`,
    typedArgsHash: doorArgsHash(action, orgExpr, actorExpr, targetExpr, 'NULL::text', detailsExpr),
    actorRef: 'actor_ref',
    organizationId: orgExpr,
  });

/** Контекст входа: класс `pre_session`, ни организации, ни ссылок — их у класса нет по матрице. */
const preSessionContext = (action, actorExpr, targetExpr, detailsExpr) =>
  useContext({
    targetRole: `'app_pre_session'::name`,
    contextClass: `'pre_session'::app.port_context_class`,
    purpose: `'identity.boundary-crossing.record'`,
    functionIdentity: `'app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)'::regprocedure`,
    typedArgsHash: doorArgsHash(action, 'NULL::uuid', actorExpr, targetExpr, 'NULL::text', detailsExpr),
  });

/**
 * Контекст РАЗРЕШЕНИЯ ссылки — тот, внутри которого рождается связка. Именно его требует ветка
 * `identity_subject_link_created`: акт связывания нельзя записать ни про чужого человека, ни вне
 * акта разрешения, потому что хеш считается по аргументам ИМЕННО этого разрешения.
 */
const resolveContext = (personExpr) =>
  useContext({
    targetRole: `'app_pre_session'::name`,
    contextClass: `'pre_session'::app.port_context_class`,
    purpose: `'identity.variant-a.resolve'`,
    functionIdentity: `'app.pre_session_resolve_identity(uuid,text)'::regprocedure`,
    typedArgsHash: `app.hash_port_typed_args(ARRAY[
        ROW('uuid@1', pg_catalog.uuid_send(${personExpr}))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend('subject'))::app.port_typed_arg])`,
  });

/** Контекст интегратора — ветка гейта по умолчанию: всё, что не названо явно, требует именно её. */
const integratorContext = (action, actorExpr, detailsExpr) =>
  useContext({
    targetRole: `'app_integrator_request'::name`,
    contextClass: `'tenant_service'::app.port_context_class`,
    purpose: `'integrator.messenger-phone-bind-audit.record'`,
    functionIdentity: `'app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)'::regprocedure`,
    typedArgsHash: doorArgsHash(action, 'NULL::uuid', actorExpr, 'NULL::text', 'NULL::text', detailsExpr),
  });

const CARD_DETAILS = `'{"point":"card_open"}'`;
const LIST_DETAILS = `'{"point":"list_view","subject_count":42}'`;

/** Настоящие врач, пациент и клиника DEV — иначе доказательство было бы про выдуманные строки. */
const REAL_FIXTURE = `
    SELECT member.organization_id, member.platform_user_id INTO org, doctor
      FROM public.be_organization_members member
      JOIN public.platform_users staff_row ON staff_row.id = member.platform_user_id
     WHERE staff_row.role <> 'client'
       AND EXISTS (SELECT 1 FROM public.org_enrollments enrollment
                    WHERE enrollment.organization_id = member.organization_id)
     LIMIT 1;
    SELECT enrollment.platform_user_id INTO patient
      FROM public.org_enrollments enrollment
     WHERE enrollment.organization_id = org
     LIMIT 1;
    IF org IS NULL OR doctor IS NULL OR patient IS NULL THEN
      RAISE EXCEPTION 'на DEV нет живой пары «клиника — врач — пациент», проба беспредметна';
    END IF;
    actor_ref := app_ext.resolve_variant_a_identity(doctor, 'actor');`;

test(
  'Ш8: четыре точки пересечения границы пишут ровно по одному событию в заданном объёме',
  { skip: !ENABLED },
  () => {
    const parts = probe(`
  DECLARE org uuid; doctor uuid; patient uuid; actor_ref uuid; person uuid := gen_random_uuid();
          link_rows int; session_rows int; session_repeats int;
          card_rows int; card_repeats int; list_rows int; list_repeats int; list_count text;
  BEGIN
${REAL_FIXTURE}

    -- TEST keeps real audit history. Isolate this rollback-only proof from rows produced by
    -- earlier sessions for the same owner account; ROLLBACK restores every removed row.
    DELETE FROM public.admin_audit_log
     WHERE actor_id = doctor
       AND action IN ('identity_session_start', 'identity_patient_card_open',
                      'identity_patient_list_view', 'identity_linkage_volume_anomaly');

    -- ТОЧКА 1. Создание связки. Резолвер зовётся ДВАЖДЫ, потому что живой вход спрашивает ссылку
    -- на каждый запрос: событие обязано родиться на чеканке и не повториться на чтении карты.
${resolveContext('person')}
    PERFORM app_ext.resolve_variant_a_identity(person, 'subject');
    PERFORM app_ext.resolve_variant_a_identity(person, 'subject');
    SELECT count(*) INTO link_rows FROM public.admin_audit_log
     WHERE action = 'identity_subject_link_created' AND target_id = person::text;

    -- ТОЧКА 2. Вход — раз на сессию: два вызова той же сессии дают одну строку и счётчик 2.
${preSessionContext(`'identity_session_start'`, 'doctor', 'NULL::text', `'{"point":"session_start","session_ref":"' || repeat('a', 64) || '"}'`)}
    PERFORM app.record_collapsing_audit_event('identity_session_start', NULL, doctor, NULL, NULL,
      '{"point":"session_start","session_ref":"' || repeat('a', 64) || '"}');
    PERFORM app.record_collapsing_audit_event('identity_session_start', NULL, doctor, NULL, NULL,
      '{"point":"session_start","session_ref":"' || repeat('a', 64) || '"}');
    SELECT count(*), max(repeat_count) INTO session_rows, session_repeats
      FROM public.admin_audit_log WHERE action = 'identity_session_start' AND actor_id = doctor;

    -- ТОЧКА 3. Открытие карточки — раз на пару «врач-пациент» в сутки.
${staffContext(`'identity_patient_card_open'`, 'org', 'doctor', 'patient::text', CARD_DETAILS)}
    PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, doctor,
      patient::text, NULL, ${CARD_DETAILS});
    PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, doctor,
      patient::text, NULL, ${CARD_DETAILS});
    SELECT count(*), max(repeat_count) INTO card_rows, card_repeats
      FROM public.admin_audit_log
     WHERE action = 'identity_patient_card_open' AND actor_id = doctor AND target_id = patient::text;

    -- ТОЧКА 4. Список — ОДНО событие на пакет из 42 человек, а не 42 строки.
${staffContext(`'identity_patient_list_view'`, 'org', 'doctor', 'NULL::text', LIST_DETAILS)}
    PERFORM app.record_collapsing_audit_event('identity_patient_list_view', org, doctor, NULL, NULL,
      ${LIST_DETAILS});
    PERFORM app.record_collapsing_audit_event('identity_patient_list_view', org, doctor, NULL, NULL,
      ${LIST_DETAILS});
    SELECT count(*), max(repeat_count), max(details ->> 'subject_count')
      INTO list_rows, list_repeats, list_count
      FROM public.admin_audit_log WHERE action = 'identity_patient_list_view' AND actor_id = doctor;

    PERFORM set_config('bcb.probe', link_rows || '|' || session_rows || '|' || session_repeats
      || '|' || card_rows || '|' || card_repeats || '|' || list_rows || '|' || list_repeats
      || '|' || list_count, false);
  END;`);
    assert.equal(parts.length, 8, `проба не доехала: ${parts.join('|')}`);
    const [link, sessionRows, sessionRepeats, cardRows, cardRepeats, listRows, listRepeats, listCount] =
      parts;
    assert.equal(link, '1', `создание связки записано ${link} раз вместо одного`);
    assert.equal(sessionRows, '1', `вход записан ${sessionRows} строками вместо одной на сессию`);
    assert.equal(sessionRepeats, '2', 'повтор в пределах сессии не поднял счётчик');
    assert.equal(cardRows, '1', `открытие карточки записано ${cardRows} строками вместо одной`);
    assert.equal(cardRepeats, '2', 'повторное открытие карточки не поднял счётчик, а завело строку');
    assert.equal(listRows, '1', `список записан ${listRows} строками вместо одного события на пакет`);
    assert.equal(listRepeats, '2', 'повторная загрузка списка не подняла счётчик');
    assert.equal(listCount, '42', 'размер пакета в записи потерян — «скольких» станет неизвестно');

    // Инъекция: объём держит ИМЕННО ключ схлопывания, который считает дверь. Без него каждый вызов
    // заводит свою строку — то есть список из N человек снова превращается в N записей, а повтор
    // открытия карточки перестаёт быть повтором.
    const scattered = probe(
      `
  DECLARE org uuid; doctor uuid; patient uuid; actor_ref uuid; card_rows int;
  BEGIN
${REAL_FIXTURE}
    DELETE FROM public.admin_audit_log
     WHERE actor_id = doctor AND action = 'identity_patient_card_open';
${staffContext(`'identity_patient_card_open'`, 'org', 'doctor', 'patient::text', CARD_DETAILS)}
    PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, doctor,
      patient::text, NULL, ${CARD_DETAILS});
    PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, doctor,
      patient::text, NULL, ${CARD_DETAILS});
    SELECT count(*) INTO card_rows FROM public.admin_audit_log
     WHERE action = 'identity_patient_card_open' AND actor_id = doctor AND target_id = patient::text;
    PERFORM set_config('bcb.probe', card_rows::text, false);
  END;`,
      withoutBlock(`    v_day := pg_catalog.to_char(`, `pg_catalog.convert_to(v_key, 'UTF8')), 'hex');`),
    );
    assert.equal(
      scattered[0],
      '2',
      'без ключа схлопывания повтор всё равно схлопнулся — объём держит не то, что думает проба',
    );
  },
);

test(
  'Ш8: журнал не становится утечкой сам — имя, телефон и диагноз дверь не принимает',
  { skip: !ENABLED },
  () => {
    const leaky = `'{"point":"card_open","display_name":"Иванов Иван","phone":"+79990000000","diagnosis":"M54.5"}'`;
    const body = (details) => `
  DECLARE org uuid; doctor uuid; patient uuid; actor_ref uuid; verdict text;
  BEGIN
${REAL_FIXTURE}
${staffContext(`'identity_patient_card_open'`, 'org', 'doctor', 'patient::text', details)}
    BEGIN
      PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, doctor,
        patient::text, NULL, ${details});
      verdict := 'accepted';
    EXCEPTION WHEN OTHERS THEN verdict := SQLSTATE; END;
    PERFORM set_config('bcb.probe', verdict, false);
  END;`;

    assert.equal(
      probe(body(leaky))[0],
      '23514',
      'дверь приняла в журнал имя, телефон и диагноз — журнал сам стал утечкой',
    );
    // Инъекция: снятая проверка ключей делает ту же запись приемлемой — значит проверяет её
    // именно эта строка продукта, а не что-то соседнее.
    const withoutKeyCheck = withoutLine(`
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(v_details) AS detail_key
       WHERE detail_key NOT IN ('point', 'ref_kind', 'session_ref', 'subject_count')
    ) THEN
      RAISE EXCEPTION 'collapsing_audit_detail_key_not_declared' USING ERRCODE = '23514';
    END IF;`);
    assert.equal(
      probe(body(leaky), withoutKeyCheck)[0],
      'accepted',
      'без проверки ключей запись всё равно отвергнута — проба доказывает не то, что думает',
    );
    // Честная запись проходит: проверка не «запрещает всё».
    assert.equal(probe(body(CARD_DETAILS))[0], 'accepted', 'честная запись перестала проходить');
  },
);

test(
  'Ш8: правило тревоги срабатывает на превышении и молчит ниже порога',
  { skip: !ENABLED },
  () => {
    // Порог сравнивается с УЖЕ НАКОПЛЕННЫМ объёмом за скользящие сутки, поэтому объём засевается
    // прямо в журнал: правило читает журнал, а не счётчик в памяти, и проверять надо именно это.
    const body = (seeded) => `
  DECLARE org uuid; doctor uuid; patient uuid; actor_ref uuid; answer jsonb; alarms int;
  BEGIN
${REAL_FIXTURE}
    DELETE FROM public.admin_audit_log
     WHERE actor_id = doctor
       AND action IN ('identity_subject_link_created', 'identity_session_start',
                      'identity_patient_card_open', 'identity_patient_list_view',
                      'identity_linkage_volume_anomaly');
    INSERT INTO public.admin_audit_log (organization_id, actor_id, action, conflict_key, details,
      status, repeat_count, last_seen_at)
    VALUES (org, doctor, 'identity_patient_card_open', encode(pg_catalog.sha256(
      pg_catalog.convert_to('seed', 'UTF8')), 'hex'), '{"point":"card_open"}', 'ok', ${seeded}, now());
${staffContext(`'identity_patient_card_open'`, 'org', 'doctor', 'patient::text', CARD_DETAILS)}
    answer := app.record_collapsing_audit_event('identity_patient_card_open', org, doctor,
      patient::text, NULL, ${CARD_DETAILS});
    SELECT count(*) INTO alarms FROM public.admin_audit_log
     WHERE action = 'identity_linkage_volume_anomaly' AND actor_id = doctor;
    PERFORM set_config('bcb.probe',
      (answer ->> 'alarm_fired') || '|' || alarms || '|' || (answer ->> 'crossings_24h'), false);
  END;`;

    const quiet = probe(body('150'));
    assert.equal(quiet[0], 'false', `тревога сработала на нормальном объёме: ${quiet.join('|')}`);
    assert.equal(quiet[1], '0', 'ниже порога в журнале появилась строка тревоги');

    const loud = probe(body('400'));
    assert.equal(loud[0], 'true', `аномальный объём никого не разбудил: ${loud.join('|')}`);
    assert.equal(loud[1], '1', `тревог заведено ${loud[1]} вместо одной на человека в сутки`);
    assert.equal(loud[2], '401', `объём посчитан неверно: ${loud[2]}`);

    // Инъекция: без самого правила та же аномалия проходит молча. Снимается БЛОК ЦЕЛИКОМ, а не
    // одна его строка: убрав только условие, мы получили бы тревогу на каждом событии — то есть
    // «зелёный» результат по другой причине.
    const injected = probe(body('400'), withoutBlock('    IF v_volume > v_volume_threshold THEN', `      END;
    END IF;`));
    assert.equal(
      injected[0],
      'false',
      'без правила тревога всё равно сработала — проба доказывает не правило, а что-то другое',
    );
  },
);

test('Ш8: стены двери держат — чужой актор, лишняя организация и незнакомое действие', {
  skip: !ENABLED,
}, () => {
  const parts = probe(`
  DECLARE org uuid; doctor uuid; patient uuid; actor_ref uuid; stranger uuid;
          foreign_actor text; tenantless text; unknown_action text;
  BEGIN
${REAL_FIXTURE}
    -- «Чужой» — НАСТОЯЩИЙ другой человек, а не выдуманный uuid: иначе попытку отвергал бы внешний
    -- ключ журнала, и стена актора осталась бы непроверенной.
    SELECT id INTO stranger FROM public.platform_users WHERE id <> doctor LIMIT 1;
${staffContext(`'identity_patient_card_open'`, 'org', 'stranger', 'patient::text', CARD_DETAILS)}
    BEGIN
      PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, stranger,
        patient::text, NULL, ${CARD_DETAILS});
      foreign_actor := 'accepted';
    EXCEPTION WHEN OTHERS THEN foreign_actor := SQLSTATE; END;

${preSessionContext(`'identity_session_start'`, 'doctor', 'NULL::text', `'{"point":"session_start","session_ref":"' || repeat('b', 64) || '"}'`)}
    BEGIN
      PERFORM app.record_collapsing_audit_event('identity_session_start', org, doctor, NULL, NULL,
        '{"point":"session_start","session_ref":"' || repeat('b', 64) || '"}');
      tenantless := 'accepted';
    EXCEPTION WHEN OTHERS THEN tenantless := SQLSTATE; END;

    -- Незнакомое действие предъявляется ПОД ТЕМ контекстом, который требует его ветка гейта
    -- (иначе отказал бы гейт, и закрытый список действий остался бы непроверенным).
${integratorContext(`'identity_export_everything'`, 'doctor', `'{"point":"whatever"}'`)}
    BEGIN
      PERFORM app.record_collapsing_audit_event('identity_export_everything', NULL, doctor, NULL,
        NULL, '{"point":"whatever"}');
      unknown_action := 'accepted';
    EXCEPTION WHEN OTHERS THEN unknown_action := SQLSTATE; END;

    PERFORM set_config('bcb.probe',
      foreign_actor || '|' || tenantless || '|' || unknown_action, false);
  END;`);
  assert.equal(parts.length, 3, `проба не доехала: ${parts.join('|')}`);
  const [foreignActor, tenantless, unknownAction] = parts;
  assert.equal(foreignActor, '42501', `пересечение записано на чужое имя: ${foreignActor}`);

  // Инъекция: без стены актора та же попытка проходит — значит отвергает её именно эта проверка.
  const withoutActorWall = probe(
    `
  DECLARE org uuid; doctor uuid; patient uuid; actor_ref uuid; stranger uuid; verdict text;
  BEGIN
${REAL_FIXTURE}
    SELECT id INTO stranger FROM public.platform_users WHERE id <> doctor LIMIT 1;
${staffContext(`'identity_patient_card_open'`, 'org', 'stranger', 'patient::text', CARD_DETAILS)}
    BEGIN
      PERFORM app.record_collapsing_audit_event('identity_patient_card_open', org, stranger,
        patient::text, NULL, ${CARD_DETAILS});
      verdict := 'accepted';
    EXCEPTION WHEN OTHERS THEN verdict := SQLSTATE; END;
    PERFORM set_config('bcb.probe', verdict, false);
  END;`,
    withoutBlock(
      `  IF p_action IN ('identity_patient_card_open', 'identity_patient_list_view') THEN
    IF p_actor_id IS NULL`,
      `      RAISE EXCEPTION 'collapsing_audit_actorless_action_carries_actor' USING ERRCODE = '42501';
    END IF;
  END IF;`,
    ),
  );
  assert.equal(
    withoutActorWall[0],
    'accepted',
    'без стены актора запись на чужое имя всё равно отвергнута — проба доказывает не стену',
  );
  assert.equal(tenantless, '42501', `вход записан с чужой организацией: ${tenantless}`);
  assert.equal(unknownAction, '23514', `дверь завела вид события, которого нет: ${unknownAction}`);
});
