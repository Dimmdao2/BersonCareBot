/**
 * Живое доказательство FAIL-CLOSED ПО ВИДУ непрозрачной ссылки на именованной DEV-базе. Opt-in: без
 * `RUN_VARIANT_A_IDENTITY_REF_DB=1` файл пропускается, поэтому в CI он в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): ссылку, выданную как акторская, предъявляют субъектом (или
 * наоборот), и база это МОЛЧА разрешает — то есть заявитель сам решает, кем он «о ком данные».
 *
 * Зачем именно сейчас (D15b/7a Ш5, 22.08). Оракул просит резолвер, который «не принимает actor-ref
 * вместо subject-ref» (`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15b/7). До Ш5
 * требование было невыполнимо по частям: Ш1-2 дали карте вид, Ш3 дал обратному резолверу аргумент
 * вида (и НАРОЧНО не сравнивал его), Ш4 сделал две ссылки человека разными значениями. Ш5 — тот и
 * только тот шаг, где аргумент становится предикатом поиска, и подмена перестаёт быть вопросом
 * договорённости приложения.
 *
 * Что здесь доказывается ПОВЕДЕНИЕМ функций, а не текстом исходника:
 *   1. акторская ссылка, предъявленная субъектом, и субъектная, предъявленная актором, дают `42501`
 *      — тем же кодом и тем же текстом, что и выдуманная ссылка (по отказу нельзя узнать, что
 *      предъявленное значение вообще чья-то живая ссылка);
 *   2. правильная пара проходит: гейт заявки принимает пациента, у которого `actor_ref` акторская,
 *      `subject_ref` субъектная, а человек один;
 *   3. аксессоры контекста читают СВОИМ видом — `app.current_actor_user_id` акторским,
 *      `app.current_patient_user_id` субъектным; акторская ссылка, положенная в `subject_ref`,
 *      роняет чтение пациента `42501`, а не отдаёт физический id. Это и есть путь, которым Ш5 ломал
 *      бы вход, оставь мы вызывающих на однопараметрической сигнатуре;
 *   4. вход ТРЕХ учётных записей владельца (админ, доктор, пациент) не ломается: каждая проходит
 *      свою заявку и своим аксессором получает СВОЙ физический id;
 *   5. проверка вида ЛОЖИТСЯ В ОСНОВУ пробы, а не украшает её: тот же вопрос против контракта, из
 *      которого удалена одна строка проверки, отвечает «принято» — то есть красный тест невозможно
 *      получить случайно (инъекция живёт ЗДЕСЬ, продукт на диске не трогается).
 *
 * Почему проба сама раскладывает контракт. `deploy/postgres/port-context/contract.sql` — авторитет
 * рождения объектов `app_ext`, и он приезжает на базу шагом reconcile, который эта ветка вести не
 * может (DEV ведёт соседняя ветка; `migrate-dev.sh --execute` этой работе запрещён). Поэтому проба
 * берёт ИЗ САМОГО ФАЙЛА ПРОДУКТА целевую форму карты, тела резолверов, аксессоров и приёмного шва,
 * проигрывает их в откаченной транзакции и там же спрашивает. Это тот же текст, что приедет
 * reconcile-ом, а не его пересказ.
 *
 * Границы доказательства. Проба идёт под локальным админ-сокетом (`sudo -n -u postgres psql`,
 * AGENTS.md §6), то есть проверяет ПОВЕДЕНИЕ и значения, а не маршрут клиентских логинов и не права:
 * права проверяет reconcile (`--port-context-verify`), сквозной вход — живой прогон на :5200 ПОСЛЕ
 * reconcile. Код этой ветки без reconcile вход ломает — дескриптор порта против каталога базы, —
 * поэтому код и reconcile обязаны ехать ОДНОЙ выкаткой.
 *
 * Ничего не остаётся в базе: и DDL, и вставки, и чеканка ссылок идут внутри `BEGIN … ROLLBACK`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_VARIANT_A_IDENTITY_REF_DB=1 node --test \
 *     deploy/postgres/privileges/variant-a-identity-ref-kind-fail-closed.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_VARIANT_A_IDENTITY_REF_DB === '1';
const DATABASE = process.env.VARIANT_A_IDENTITY_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const CONTRACT = readFileSync(
  fileURLToPath(new URL('../port-context/contract.sql', import.meta.url)), 'utf8');

// Имена параметров — РОВНО те, что у живой двери Ш8: `CREATE OR REPLACE` не умеет переименовывать
// входной параметр и отвечает «cannot change name of input parameter "p_action"». Пока дверь лежала
// в неприменённой миграции, безымянная заглушка создавалась с нуля и вопрос не вставал; после Ш8
// она роняет КАЖДУЮ пробу этого файла, то есть резолвер остаётся без единой живой проверки.
const AUDIT_STUB = `CREATE OR REPLACE FUNCTION app.record_collapsing_audit_event(
  p_action text, p_organization_id uuid, p_actor_id uuid,
  p_target_id text, p_conflict_key text, p_details text
) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)
  TO app_seam_identity_lookup_owner;`;

/** Точный кусок продукта между двумя его же якорями — иначе проба доказывала бы свой пересказ. */
function contractSlice(startsWith, endsWith) {
  const from = CONTRACT.indexOf(startsWith);
  assert.notEqual(from, -1, `contract.sql больше не содержит '${startsWith}'`);
  const to = CONTRACT.indexOf(endsWith, from);
  assert.notEqual(to, -1, `contract.sql больше не содержит '${endsWith}' после '${startsWith}'`);
  return CONTRACT.slice(from, to + endsWith.length);
}

/**
 * Карта (Ш1-2), оба kind-aware резолвера, ОБА аксессора контекста и приёмный шов —
 * дословно из контракта. Аксессоры здесь не для полноты: именно они читают `actor_ref`/`subject_ref`
 * в каждом запросе живого человека, и именно они падают, если вид назван не тот.
 */
const CONTRACT_SHAPE = [
  contractSlice('CREATE TABLE IF NOT EXISTS app_ext.variant_a_identity_refs (', '$variant_a_kind$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid, p_ref_kind text)',
    'END $$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid, p_expected_ref_kind text)',
    'END $$;'),
  contractSlice('CREATE OR REPLACE FUNCTION app.current_actor_user_id()', 'END $$;'),
  contractSlice('CREATE OR REPLACE FUNCTION app.current_patient_user_id()', 'END $$;'),
  contractSlice('CREATE OR REPLACE FUNCTION app_ext.assert_port_context_claim(', 'END $$;'),
  AUDIT_STUB,
].join('\n');

/** Та самая ОДНА строка, которую снимает откат шага (см. Ш5 «Откат» в схеме). */
const KIND_CHECK = " AND ref_kind = p_expected_ref_kind";

const CONTRACT_WITHOUT_KIND_CHECK = (() => {
  assert.ok(CONTRACT_SHAPE.includes(KIND_CHECK),
    'проверка вида исчезла из contract.sql — инъекции больше нечего снимать');
  return CONTRACT_SHAPE.replace(KIND_CHECK, '');
})();

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Один вопрос к целевой форме контракта; всё, что он сделал, откатывается. */
function probe(body, shape = CONTRACT_SHAPE) {
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
 * Строка ПРИНЯТОГО контекста под уже объявленную способность: аксессоры читают именно её. Способность
 * не выдумывается — берётся любая объявленная, чтобы внешний ключ остался настоящим; предмет проверки
 * здесь не способность, а вид ссылки в полях `actor_ref`/`subject_ref`.
 */
const acceptContext = (actorRefExpr, subjectRefExpr) => `
    INSERT INTO app_ext.accepted_port_contexts (
      database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
      context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref)
    SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, session_user, c.port,
           'app_patient'::name, c.context_class, c.purpose, c.function_identity,
           pg_catalog.sha256(''::bytea), ${actorRefExpr}, ${subjectRefExpr}
      FROM pg_database d, app_ext.port_context_capabilities c
     WHERE d.datname = current_database()
     LIMIT 1;`;

/** Человек владельца по его подтверждённому адресу — фикстура берётся из базы, а не зашита. */
const OWNER_ACCOUNTS = [
  { email: 'dimmdao@gmail.com', what: 'глобальный админ' },
  { email: 'dimmdao@yandex.ru', what: 'доктор' },
  { email: 'kinesiospace@gmail.com', what: 'пациент' },
];

test('Ш5: вид ссылки — предикат, а не украшение: подмена в обе стороны даёт 42501',
  { skip: !ENABLED }, () => {
    // Симметрия здесь — предмет проверки. Проверить только «actor вместо subject» значило бы
    // оставить открытой обратную подмену, которой закрывается ровно тот же одной строкой предикат.
    const parts = probe(`
  DECLARE person uuid := gen_random_uuid(); actor_ref uuid; subject_ref uuid;
          as_subject text; as_actor text; invented text; honest text;
  BEGIN
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    subject_ref := app_ext.resolve_variant_a_identity(person, 'subject');
    BEGIN PERFORM app_ext.resolve_variant_a_physical(actor_ref, 'subject'); as_subject := 'accepted';
    EXCEPTION WHEN OTHERS THEN as_subject := SQLSTATE || '/' || SQLERRM; END;
    BEGIN PERFORM app_ext.resolve_variant_a_physical(subject_ref, 'actor'); as_actor := 'accepted';
    EXCEPTION WHEN OTHERS THEN as_actor := SQLSTATE || '/' || SQLERRM; END;
    BEGIN PERFORM app_ext.resolve_variant_a_physical(gen_random_uuid(), 'actor'); invented := 'accepted';
    EXCEPTION WHEN OTHERS THEN invented := SQLSTATE || '/' || SQLERRM; END;
    honest := app_ext.resolve_variant_a_physical(actor_ref, 'actor')::text || '/'
           || app_ext.resolve_variant_a_physical(subject_ref, 'subject')::text || '/' || person::text;
    PERFORM set_config('bcb.probe',
      as_subject || '|' || as_actor || '|' || invented || '|' || honest, false);
  END;`);
    assert.equal(parts.length, 4, `проба не доехала: ${parts.join('|')}`);
    const [asSubject, asActor, invented, honest] = parts;
    assert.match(asSubject, /^42501\//u, `акторская ссылка принята субъектной: ${asSubject}`);
    assert.match(asActor, /^42501\//u, `субъектная ссылка принята акторской: ${asActor}`);
    assert.equal(asSubject, invented,
      `отказ по виду отличим от отказа по неизвестной ссылке — по нему видно, что ссылка живая: ${asSubject}`);
    assert.equal(asActor, invented,
      `отказ по виду отличим от отказа по неизвестной ссылке: ${asActor}`);
    const [resolvedActor, resolvedSubject, expected] = honest.split('/');
    assert.equal(resolvedActor, expected, 'правильная акторская пара перестала разрешаться');
    assert.equal(resolvedSubject, expected, 'правильная субъектная пара перестала разрешаться');
  });

test('Ш5: аксессоры контекста читают своим видом — акторская ссылка в subject_ref роняет чтение пациента',
  { skip: !ENABLED }, () => {
    // Это тот путь, которым Ш5 ломал бы ВХОД: `app.current_patient_user_id` читает `subject_ref`, и
    // однопараметрический вызов назвал бы там 'actor'. После Ш4 приложение кладёт в это поле
    // субъектную ссылку — значит каждое чтение пациента отвечало бы 42501 при зелёном reconcile.
    const honest = probe(`
  DECLARE person uuid := gen_random_uuid(); actor_ref uuid; subject_ref uuid;
          seen_actor uuid; seen_subject uuid;
  BEGIN
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    subject_ref := app_ext.resolve_variant_a_identity(person, 'subject');
${acceptContext('actor_ref', 'subject_ref')}
    seen_actor := app.current_actor_user_id();
    seen_subject := app.current_patient_user_id();
    PERFORM set_config('bcb.probe',
      seen_actor::text || '|' || seen_subject::text || '|' || person::text, false);
  END;`);
    assert.equal(honest.length, 3, `правильная пара не прошла аксессоры: ${honest.join('|')}`);
    assert.equal(honest[0], honest[2], 'акторский аксессор вернул не того человека');
    assert.equal(honest[1], honest[2], 'субъектный аксессор вернул не того человека');

    const swapped = probe(`
  DECLARE person uuid := gen_random_uuid(); actor_ref uuid; seen uuid;
  BEGIN
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    PERFORM app_ext.resolve_variant_a_identity(person, 'subject');
${acceptContext('actor_ref', 'actor_ref')}
    seen := app.current_patient_user_id();
    PERFORM set_config('bcb.probe', 'accepted|' || seen::text, false);
  END;`);
    assert.equal(swapped[0], '42501',
      `акторская ссылка в поле субъекта отдала физический id: ${swapped.join('|')}`);
  });

test('Ш5: гейт заявки разводит поля по видам — правильная пара принята, подмена отвергнута',
  { skip: !ENABLED }, () => {
    // Берётся НАСТОЯЩИЙ клиент DEV и его настоящая клиника: иначе доказательство было бы про
    // выдуманные строки. Проверка `actor_id IS DISTINCT FROM subject_id` обязана продолжать
    // пропускать пациента, у которого ссылки разные, а человек один.
    const parts = probe(`
  DECLARE person uuid; org uuid; actor_ref uuid; subject_ref uuid; honest text; swapped text;
  BEGIN
    SELECT enrollment.platform_user_id, enrollment.organization_id INTO person, org
      FROM public.org_enrollments enrollment
      JOIN app_ext.variant_a_identity_refs known
        ON known.physical_user_id = enrollment.platform_user_id AND known.ref_kind = 'actor'
     LIMIT 1;
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    subject_ref := app_ext.resolve_variant_a_identity(person, 'subject');
    BEGIN
      PERFORM app_ext.assert_port_context_claim('patient', 'app_patient', actor_ref, subject_ref, org, NULL);
      honest := 'accepted';
    EXCEPTION WHEN OTHERS THEN honest := SQLSTATE; END;
    BEGIN
      PERFORM app_ext.assert_port_context_claim('patient', 'app_patient', actor_ref, actor_ref, org, NULL);
      swapped := 'accepted';
    EXCEPTION WHEN OTHERS THEN swapped := SQLSTATE; END;
    PERFORM set_config('bcb.probe', honest || '|' || swapped, false);
  END;`);
    assert.equal(parts[0], 'accepted',
      `гейт отверг пациента с правильной парой ссылок: ${parts.join('|')}`);
    assert.equal(parts[1], '42501',
      `гейт принял акторскую ссылку в поле субъекта: ${parts.join('|')}`);
  });

for (const { email, what } of OWNER_ACCOUNTS) {
  test(`Ш5: вход не ломается — учётная запись владельца «${what}» (${email})`,
    { skip: !ENABLED }, () => {
      // Три учётки владельца — единственные живые входы на DEV и TEST, и именно ими он проверяет
      // работу. Здесь проходится их путь до физического id: заявка своего класса + аксессор,
      // который этот класс зовёт в каждом запросе. Класс берётся из роли, а не из имени адреса.
      const parts = probe(`
  DECLARE person uuid; person_role text; org uuid; actor_ref uuid; subject_ref uuid;
          claim_result text; seen uuid;
  BEGIN
    SELECT u.id, u.role INTO person, person_role
      FROM public.user_contacts c
      JOIN public.platform_users u ON u.id = c.platform_user_id
     WHERE c.contact_kind = 'email' AND c.value_normalized = '${email}'
     LIMIT 1;
    IF person IS NULL THEN
      PERFORM set_config('bcb.probe', 'no-account', false); RETURN;
    END IF;
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');

    IF person_role = 'client' THEN
      subject_ref := app_ext.resolve_variant_a_identity(person, 'subject');
      SELECT e.organization_id INTO org FROM public.org_enrollments e
       WHERE e.platform_user_id = person LIMIT 1;
      BEGIN
        PERFORM app_ext.assert_port_context_claim('patient', 'app_patient', actor_ref, subject_ref, org, NULL);
        claim_result := 'accepted';
      EXCEPTION WHEN OTHERS THEN claim_result := SQLSTATE || '/' || SQLERRM; END;
${acceptContext('actor_ref', 'subject_ref')}
      seen := app.current_patient_user_id();
    ELSIF person_role = 'admin' THEN
      BEGIN
        PERFORM app_ext.assert_port_context_claim('platform', 'app_platform_admin', actor_ref, NULL, NULL, NULL);
        claim_result := 'accepted';
      EXCEPTION WHEN OTHERS THEN claim_result := SQLSTATE || '/' || SQLERRM; END;
${acceptContext('actor_ref', 'NULL::uuid')}
      seen := app.current_actor_user_id();
    ELSE
      SELECT m.organization_id INTO org FROM public.be_organization_members m
       WHERE m.platform_user_id = person AND m.status = 'active' LIMIT 1;
      BEGIN
        PERFORM app_ext.assert_port_context_claim('staff', 'app_staff', actor_ref, NULL, org, NULL);
        claim_result := 'accepted';
      EXCEPTION WHEN OTHERS THEN claim_result := SQLSTATE || '/' || SQLERRM; END;
${acceptContext('actor_ref', 'NULL::uuid')}
      seen := app.current_actor_user_id();
    END IF;

    PERFORM set_config('bcb.probe',
      claim_result || '|' || seen::text || '|' || person::text || '|' || person_role, false);
  END;`);
      assert.notEqual(parts[0], 'no-account',
        `учётной записи владельца ${email} нет на ${DATABASE} — доказательство пустое`);
      assert.equal(parts[0], 'accepted', `заявка учётки владельца отвергнута: ${parts.join('|')}`);
      assert.equal(parts[1], parts[2],
        `аксессор вернул не того человека: ${parts.join('|')}`);
    });
}

test('Ш5: проверка вида — основа пробы: без одной строки контракта подмена снова проходит',
  { skip: !ENABLED }, () => {
    // Инъекция живёт ЗДЕСЬ, а не в продукте: из проигрываемого текста удаляется ровно та строка,
    // которую снимает откат шага (`AND ref_kind = p_expected_ref_kind`), и тот же вопрос отвечает
    // «принято». Значит зелёные проверки выше держатся на ней, а не на удачном стечении фикстур.
    // Файл `contract.sql` при этом не трогается — он побайтно тот, что приедет reconcile-ом.
    const parts = probe(`
  DECLARE person uuid := gen_random_uuid(); actor_ref uuid; resolved uuid;
  BEGIN
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    resolved := app_ext.resolve_variant_a_physical(actor_ref, 'subject');
    PERFORM set_config('bcb.probe', resolved::text || '|' || person::text, false);
  END;`, CONTRACT_WITHOUT_KIND_CHECK);
    assert.equal(parts.length, 2, `инъекция не воспроизвела прежнее поведение: ${parts.join('|')}`);
    assert.equal(parts[0], parts[1],
      'без проверки вида подмена всё равно отвергнута — проба доказывает не то, что заявлено');
  });
