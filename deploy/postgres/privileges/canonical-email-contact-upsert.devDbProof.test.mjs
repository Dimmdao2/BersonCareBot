/**
 * Живое доказательство того, что двери, пишущие каноническую почту в `public.user_contacts`,
 * называют СУЩЕСТВУЮЩИЙ уникальный индекс. Opt-in: без `RUN_CANONICAL_EMAIL_CONTACT_UPSERT_DB=1`
 * файл пропускается и в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): успешная ветка входа по коду из почты снова умирает
 * `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`, либо
 * — противоположная крайность — начинает молча перевешивать чужую подтверждённую почту.
 *
 * Откуда взялась. D15b/6 (22.08.2026): `20260821T040000_cut_over_canonical_contacts.sql` увёл почту
 * из `platform_users` в `public.user_contacts` и в четырёх телах написал
 * `ON CONFLICT (platform_user_id, contact_kind, value_normalized)`. Такого индекса нет и не будет:
 * канон — `uq_user_contacts_email UNIQUE (value_normalized) WHERE contact_kind = 'email'`, одна
 * подтверждённая почта принадлежит РОВНО ОДНОМУ аккаунту, иначе рушится «вход в один аккаунт по
 * любому его подтверждённому контакту». Пока перед дверью стоял отказ прав, ошибка была не видна:
 * `42P10` — ошибка ПЛАНИРОВЩИКА, она возникает раньше проверки прав и раньше гейта контекста.
 *
 * Проверяется ПОВЕДЕНИЕ живых тел в базе, а не текст миграции: каждый тест зовёт саму дверь и
 * смотрит, что стало со строками. Тест красный на сломанном продукте (все три вызова отдают
 * `42P10`) и зелёный после того, как правка приземлилась.
 *
 * Предусловия прогона, обе — состояние базы, а не этого файла:
 *   1. применены миграции `20260822T090000_the_email_contact_door_names_its_real_index.sql`,
 *      `20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql` и
 *      `20260822T110000_the_email_verify_root_demotes_the_previous_primary.sql` (последняя нужна
 *      только тесту про смену почты — без неё он падает `23505 uq_user_contacts_primary_email`);
 *   2. привилегии сведены с `deploy/postgres/generated/privileges.<база>.sql` — без этого
 *      `app.email_otp_public_consume_latest_challenge` отказывает `42501` на блокировке строки
 *      `platform_users` ещё до записи контакта (см. `ROW_LOCK_SURFACES` в `declaration.ts`).
 * Оба предусловия видны в самом падении: тест печатает SQLSTATE и текст отказа.
 *
 * Контекст порта ставится строкой в `app_ext.accepted_port_contexts` от имени администратора — как в
 * соседних доказательствах (`port-context-gate-refusal`, `public-booking-write-walls`): доказывать
 * надо ПРАВИЛО ДВЕРИ, а не клиентские сертификаты `app.begin_port_context`. Наблюдать приватные
 * таблицы швов может только владелец или суперпользователь, поэтому проба идёт локальным
 * админ-сокетом (AGENTS.md §6). Каждая проба — одна транзакция, заканчивающаяся `ROLLBACK`:
 * постоянных строк на DEV не остаётся.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_CANONICAL_EMAIL_CONTACT_UPSERT_DB=1 node --test \
 *     deploy/postgres/privileges/canonical-email-contact-upsert.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_CANONICAL_EMAIL_CONTACT_UPSERT_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

/** Значения проб живут только внутри транзакции пробы, но на всякий случай они узнаваемы. */
const EMAIL_BOUND_BY_DOOR = 'd15b6-proof-bound@example.test';
const EMAIL_OWNED_UPFRONT = 'd15b6-proof-owned@example.test';
/** Прежняя первичная почта четвёртого человека и новая, на которую он её меняет. */
const EMAIL_OLD_PRIMARY = 'd15b6-proof-old-primary@example.test';
const EMAIL_NEW_PRIMARY = 'd15b6-proof-new-primary@example.test';

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/**
 * Три пустых человека и одна ЧУЖАЯ подтверждённая почта у третьего. Все строки заводятся здесь, а не
 * берутся из DEV-данных: доказательство про правило двери не должно зависеть от того, кто сегодня
 * лежит в базе.
 */
const FIXTURE = `
CREATE TEMP TABLE probe_ids(k text PRIMARY KEY, v uuid);
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('d15b6 proof one', 'client')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p1', id FROM created;
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('d15b6 proof two', 'client')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p2', id FROM created;
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('d15b6 proof three', 'client')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p3', id FROM created;
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('d15b6 proof four', 'client')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p4', id FROM created;
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', '${EMAIL_OWNED_UPFRONT}', true, now(), 'direct', now()
  FROM probe_ids WHERE k = 'p3';
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', '${EMAIL_OLD_PRIMARY}', true, now(), 'direct', now()
  FROM probe_ids WHERE k = 'p4';

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, k text NOT NULL, v text NOT NULL);
`;

/**
 * Приём контекста порта. Строка способности ПЕРЕСНИМАЕТСЯ с объявленной, отличаясь только логином:
 * заявку ставит администратор, а оба гейта (`require_accepted_context` и
 * `require_attested_context_for_roles`) соединяют принятый контекст со способностью ПО ЛОГИНУ.
 * Форма (порт, роль, класс, назначение, функция) берётся из объявленной строки, поэтому связь с
 * декларацией не теряется. Строка принятого контекста в транзакции может быть только одна — ключ
 * (база, бэкенд, транзакция), — поэтому helper сначала снимает предыдущую.
 */
const ACCEPT_HELPER = `
CREATE OR REPLACE FUNCTION pg_temp.accept_context(
  p_identity text, p_purpose text, p_target_role text, p_args app.port_typed_arg[])
RETURNS void LANGUAGE plpgsql AS $accept$
BEGIN
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id();
  DELETE FROM app_ext.port_context_capabilities
   WHERE capability_id = '00000000-0000-4000-8000-0000000000fc'::uuid;
  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT '00000000-0000-4000-8000-0000000000fc'::uuid, c.port, session_user,
         c.target_role, c.context_class, c.purpose, c.function_identity
    FROM app_ext.port_context_capabilities c
   WHERE c.purpose = p_purpose
     AND c.target_role = p_target_role
     AND c.function_identity IS NOT DISTINCT FROM p_identity::regprocedure
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no declared port capability for % / % / %', p_identity, p_purpose, p_target_role;
  END IF;
  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash)
  SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login,
         c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
         app.hash_port_typed_args(p_args)
    FROM pg_database d, app_ext.port_context_capabilities c
   WHERE d.datname = current_database()
     AND c.capability_id = '00000000-0000-4000-8000-0000000000fc'::uuid;
END $accept$;
`;

/**
 * `app.email_auth_verify_user_email` закрыт СТРОГИМ гейтом класса `pre_session`
 * (`20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql`): сверяются и
 * функция, и назначение, и сами аргументы. Поэтому контекст пересоздаётся ПЕРЕД КАЖДЫМ вызовом
 * двери и несёт ровно те значения, с которыми дверь зовут: другой e-mail — другой хэш — другой
 * контекст. Прежняя редакция брала способность `relation` роли `app_patient` один раз на пробу; это
 * было верно, пока дверь стояла под аттестованным гейтом, и перестало быть верным вместе с ним.
 */
const acceptVerifyDoor = (userExpr, emailExpr) => `PERFORM pg_temp.accept_context(
    'app.email_auth_verify_user_email(uuid,text)', 'auth.email-otp.email.verify', 'app_pre_session',
    ARRAY[ROW('uuid@1', pg_catalog.uuid_send(${userExpr}))::app.port_typed_arg,
          ROW('text@1', pg_catalog.textsend(${emailExpr}))::app.port_typed_arg]);`;

/** `app.email_otp_public_consume_latest_challenge` закрыт строгим гейтом: сверяются и аргументы. */
const acceptConsumeDoor = (email, codeHash) => `PERFORM pg_temp.accept_context(
    'app.email_otp_public_consume_latest_challenge(text,text)',
    'auth.email-otp.challenge.consume', 'app_pre_session',
    ARRAY[ROW('text@1', pg_catalog.textsend('${email}'))::app.port_typed_arg,
          ROW('text@1', pg_catalog.textsend('${codeHash}'))::app.port_typed_arg]);`;

/** Гоняет пробу в транзакции с ROLLBACK и отдаёт её `probe_out` как объект `ключ -> значение`. */
function probe(body) {
  const raw = psql(`BEGIN;
${FIXTURE}
${ACCEPT_HELPER}
DO $probe$
DECLARE p1 uuid; p2 uuid; p3 uuid; p4 uuid; r record; s text;
BEGIN
  SELECT v INTO p1 FROM probe_ids WHERE k = 'p1';
  SELECT v INTO p2 FROM probe_ids WHERE k = 'p2';
  SELECT v INTO p3 FROM probe_ids WHERE k = 'p3';
  SELECT v INTO p4 FROM probe_ids WHERE k = 'p4';
${body}
END $probe$;
SELECT k || '=' || v FROM probe_out ORDER BY ord;
ROLLBACK;`);
  return Object.fromEntries(
    raw.split('\n').filter((line) => line.includes('=')).map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
}

const countRows = (email, key) => `
  INSERT INTO probe_out(k, v) SELECT '${key}', count(*)::text FROM public.user_contacts
   WHERE contact_kind = 'email' AND value_normalized = '${email}';`;

test('свою почту дверь подтверждает повторно: без отказа и без второй строки',
  { skip: !ENABLED }, () => {
    // Смысл: человек второй раз вводит код на ту же свою почту. `42P10` здесь и был блокером D15b/6,
    // а вторая строка сломала бы `uq_user_contacts_email` и вход по этой почте вообще.
    const out = probe(`
  BEGIN
    ${acceptVerifyDoor('p1', "'D15b6-Proof-Bound@Example.Test'")}
    PERFORM app.email_auth_verify_user_email(p1, 'D15b6-Proof-Bound@Example.Test');
    ${acceptVerifyDoor('p1', `'${EMAIL_BOUND_BY_DOOR}'`)}
    PERFORM app.email_auth_verify_user_email(p1, '${EMAIL_BOUND_BY_DOOR}');
    s := 'ok';
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
${countRows(EMAIL_BOUND_BY_DOOR, 'rows')}
  INSERT INTO probe_out(k, v) SELECT 'state',
         (platform_user_id = p1)::text || '/' || is_primary::text || '/'
         || (confirmed_at IS NOT NULL)::text
    FROM public.user_contacts
   WHERE contact_kind = 'email' AND value_normalized = '${EMAIL_BOUND_BY_DOOR}';`);

    assert.equal(out.outcome, 'ok', `дверь отказала на своей же почте: ${out.outcome}`);
    assert.equal(out.rows, '1', `повторное подтверждение оставило не одну строку: ${out.rows}`);
    assert.equal(out.state, 'true/true/true',
      `строка принадлежит не тому человеку либо не подтверждена/не основная: ${out.state}`);
  });

test('чужую почту дверь подтверждения отбивает конфликтом и не перевешивает строку',
  { skip: !ENABLED }, () => {
    // Смысл: `app.email_auth_verify_user_email` возвращает `void` — сказать «занято» ей нечем,
    // поэтому отказ обязан быть ошибкой. Тихий успех означал бы, что человек считает почту
    // привязанной, а войдёт по ней ЧУЖОЙ аккаунт.
    const out = probe(`
  BEGIN
    ${acceptVerifyDoor('p2', `'${EMAIL_OWNED_UPFRONT}'`)}
    PERFORM app.email_auth_verify_user_email(p2, '${EMAIL_OWNED_UPFRONT}');
    s := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
${countRows(EMAIL_OWNED_UPFRONT, 'rows')}
  INSERT INTO probe_out(k, v) SELECT 'owner', (platform_user_id = p3)::text
    FROM public.user_contacts
   WHERE contact_kind = 'email' AND value_normalized = '${EMAIL_OWNED_UPFRONT}';`);

    assert.match(out.outcome, /^23505 /u,
      `чужая почта не отбита уникальным индексом: ${out.outcome}`);
    assert.equal(out.rows, '1', `чужая почта размножилась по строкам: ${out.rows}`);
    assert.equal(out.owner, 'true', 'чужая подтверждённая почта перевешена на другой аккаунт');
  });

test('вход по коду из почты доходит до конца: дверь отдаёт хозяина почты, а не 42P10',
  { skip: !ENABLED }, () => {
    // Ровно тот вызов, который владелец видел падающим: код верный, человек — хозяин почты.
    const out = probe(`
  INSERT INTO public.email_challenges(user_id, email, code_hash, expires_at, purpose, created_at)
  VALUES (p3, '${EMAIL_OWNED_UPFRONT}', 'd15b6-proof-owner-hash',
          extract(epoch FROM clock_timestamp())::bigint + 600, 'login', now());
  ${acceptConsumeDoor(EMAIL_OWNED_UPFRONT, 'd15b6-proof-owner-hash')}
  BEGIN
    SELECT * INTO r FROM app.email_otp_public_consume_latest_challenge(
      '${EMAIL_OWNED_UPFRONT}', 'd15b6-proof-owner-hash');
    s := r.ok::text || '/' || COALESCE(r.code, '<null>') || '/' || (r.user_id = p3)::text;
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
${countRows(EMAIL_OWNED_UPFRONT, 'rows')}`);

    assert.equal(out.outcome, 'true/<null>/true',
      `дверь входа по коду не довела вход до конца: ${out.outcome}`);
    assert.equal(out.rows, '1', `подтверждение своей почты завело лишнюю строку: ${out.rows}`);
  });

test('чужую почту дверь входа по коду отдаёт как email_conflict, а не как успех',
  { skip: !ENABLED }, () => {
    // Второй аккаунт заказал код на почту, которая уже подтверждена у первого. Правильный ответ —
    // отказ с названной причиной; неправильный — тихо переподтвердить чужую строку и впустить.
    const out = probe(`
  INSERT INTO public.email_challenges(user_id, email, code_hash, expires_at, purpose, created_at)
  VALUES (p2, '${EMAIL_OWNED_UPFRONT}', 'd15b6-proof-foreign-hash',
          extract(epoch FROM clock_timestamp())::bigint + 600, 'login', now());
  ${acceptConsumeDoor(EMAIL_OWNED_UPFRONT, 'd15b6-proof-foreign-hash')}
  BEGIN
    SELECT * INTO r FROM app.email_otp_public_consume_latest_challenge(
      '${EMAIL_OWNED_UPFRONT}', 'd15b6-proof-foreign-hash');
    s := r.ok::text || '/' || COALESCE(r.code, '<null>');
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
${countRows(EMAIL_OWNED_UPFRONT, 'rows')}
  INSERT INTO probe_out(k, v) SELECT 'owner', (platform_user_id = p3)::text
    FROM public.user_contacts
   WHERE contact_kind = 'email' AND value_normalized = '${EMAIL_OWNED_UPFRONT}';`);

    assert.equal(out.outcome, 'false/email_conflict',
      `чужая почта пропущена дверью входа по коду: ${out.outcome}`);
    assert.equal(out.rows, '1', `отказ по чужой почте всё-таки завёл строку: ${out.rows}`);
    assert.equal(out.owner, 'true', 'чужая подтверждённая почта перевешена на другой аккаунт');
  });

test('смена почты: новая становится первичной, прежняя перестаёт ею быть, дубля нет',
  { skip: !ENABLED }, () => {
    // Смысл: `uq_user_contacts_primary_email` — `UNIQUE (platform_user_id) WHERE contact_kind =
    // 'email' AND is_primary`, поэтому две первичные почты у одного человека физически невозможны.
    // Понижением прежней занимался ВТОРОЙ, дублирующий проход из `pgEmailAuth.verifyUserEmail`
    // (`mutateCanonicalUserContacts`, CTE `demoted_primary`), который под bootstrap-принципалом
    // просил несуществующую способность `pre_session` и падал. Убрать его, не перенеся понижение в
    // корень, значило заменить один отказ другим: замер на живой `bcb_webapp_dev` 22.08 давал
    // `23505 ... "uq_user_contacts_primary_email"` ровно на этом сценарии.
    //
    // Тест красный на сломанном продукте (корень без `demoted_other_primary` отдаёт 23505) и
    // зелёный после `20260822T110000_the_email_verify_root_demotes_the_previous_primary.sql`.
    const out = probe(`
  BEGIN
    ${acceptVerifyDoor('p4', `'${EMAIL_NEW_PRIMARY}'`)}
    PERFORM app.email_auth_verify_user_email(p4, '${EMAIL_NEW_PRIMARY}');
    s := 'ok';
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
  INSERT INTO probe_out(k, v) SELECT 'primaries', count(*)::text FROM public.user_contacts
   WHERE platform_user_id = p4 AND contact_kind = 'email' AND is_primary = true;
  INSERT INTO probe_out(k, v) SELECT 'new', is_primary::text || '/' || (confirmed_at IS NOT NULL)::text
    FROM public.user_contacts
   WHERE platform_user_id = p4 AND contact_kind = 'email'
     AND value_normalized = '${EMAIL_NEW_PRIMARY}';
  INSERT INTO probe_out(k, v) SELECT 'old', is_primary::text || '/' || (confirmed_at IS NOT NULL)::text
    FROM public.user_contacts
   WHERE platform_user_id = p4 AND contact_kind = 'email'
     AND value_normalized = '${EMAIL_OLD_PRIMARY}';`);

    assert.equal(out.outcome, 'ok', `дверь отказала на смене почты: ${out.outcome}`);
    assert.equal(out.primaries, '1', `первичных почт у человека стало не одна: ${out.primaries}`);
    assert.equal(out.new, 'true/true', `новая почта не стала подтверждённой первичной: ${out.new}`);
    // Прежняя почта не удаляется и не «разподтверждается»: человеку разрешено держать несколько
    // подтверждённых адресов (`IDENTITY_AND_MERGE_SCHEME.md` §2), первичный из них — один.
    assert.equal(out.old, 'false/true', `прежняя почта осталась первичной либо потеряна: ${out.old}`);
  });
