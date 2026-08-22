/**
 * Живое доказательство того, что дверь переотправки кода регистрации находит НЕПОДТВЕРЖДЁННЫЙ
 * черновик — того самого человека, ради которого ветка переотправки и написана. Opt-in: без
 * `RUN_REGISTRATION_RESEND_CANDIDATE_DB=1` файл пропускается и в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): повторная регистрация той же почтой и тем же паролём снова
 * отвечает `409 duplicate_email` вместо того, чтобы прислать код ещё раз, и человек запирается вне
 * регистрации навсегда.
 *
 * Откуда взялась. Находка владельца на живом прогоне TEST 22.08.2026:
 * `POST /api/auth/specialist-signup/start` с той же почтой и тем же паролём отдавал
 * `409 {"ok":false,"error":"duplicate_email"}`. Маршрут на отказ дубля не отбивает — он зовёт
 * `tryResendRegistrationChallenge` (`apps/webapp/src/infra/repos/pgUserPasswordCredentials.ts`),
 * а тот берёт `app.email_password_find_login_candidate(text)` и фильтрует
 * `WHERE email_verified = false`. Тело двери искало человека через
 * `app.find_platform_user_ids_by_any_confirmed_email`, где стоит `uc.confirmed_at IS NOT NULL`:
 * у того, кому нужна переотправка, почта не подтверждена ПО ОПРЕДЕЛЕНИЮ. Ветка не могла сработать
 * никогда, ровно в том случае, ради которого написана.
 *
 * Проверяется ПОВЕДЕНИЕ живого тела в базе, а не текст миграции: каждая проба зовёт саму дверь тем
 * же запросом, каким её зовёт репозиторный слой, и смотрит на строки. Отдельная проба ВОЗВРАЩАЕТ
 * прежнее тело (поиск по подтверждённой почте) внутри своей транзакции и требует, чтобы черновик
 * перестал находиться, — без неё зелёный цвет остальных проб ничего не значил бы.
 *
 * Два режима, оба против `bcb_webapp_dev`:
 *   • по умолчанию проверяется ЖИВОЕ тело в базе — это гейт ПОСЛЕ того, как миграция приземлена
 *     через `bash deploy/host/migrate-dev.sh --execute`;
 *   • `RESEND_CANDIDATE_PROOF_APPLY_CANDIDATE=1` — тело кандидата берётся из самого файла миграции
 *     `20260822T130000_the_registration_resend_door_finds_the_unconfirmed_draft.sql` и
 *     применяется ВНУТРИ транзакции пробы, которая заканчивается `ROLLBACK`. Это режим автора до
 *     приземления: DEV ведёт главное дерево, `--execute` из ветки запрещён, а доказать поведение
 *     надо здесь и сейчас. `CREATE OR REPLACE` владельца не меняет, поэтому дверь остаётся за
 *     `app_seam_password_auth_owner` и после применения.
 *
 * Контекст порта ставится строкой в `app_ext.accepted_port_contexts` от имени администратора — как
 * в соседних доказательствах (`canonical-email-contact-upsert`, `port-context-gate-refusal`):
 * доказывать надо ПРАВИЛО ДВЕРИ, а не клиентские сертификаты `app.begin_port_context`. Гейт двери
 * СТРОГИЙ и сверяет сами аргументы, поэтому контекст пересоздаётся перед каждым вызовом и несёт
 * ровно ту строку почты, с которой дверь зовут (другая строка — другой хэш — другой контекст).
 * Наблюдать приватные таблицы швов может только владелец или суперпользователь, поэтому проба идёт
 * локальным админ-сокетом (AGENTS.md §6). Постоянных строк на DEV не остаётся.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_REGISTRATION_RESEND_CANDIDATE_DB=1 RESEND_CANDIDATE_PROOF_APPLY_CANDIDATE=1 node --test \
 *     deploy/postgres/privileges/registration-resend-candidate.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_REGISTRATION_RESEND_CANDIDATE_DB === '1';
const APPLY_CANDIDATE = process.env.RESEND_CANDIDATE_PROOF_APPLY_CANDIDATE === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const CANDIDATE_MIGRATION = path.join(
  repoRoot, 'apps', 'webapp', 'db', 'drizzle-migrations',
  '20260822T130000_the_registration_resend_door_finds_the_unconfirmed_draft.sql',
);

/** Тело кандидата — из файла миграции, а не копией в тесте: проверяется продукт, не пересказ. */
const CANDIDATE_BODY = APPLY_CANDIDATE ? fs.readFileSync(CANDIDATE_MIGRATION, 'utf8') : '';

/**
 * Прежнее (сломанное) тело двери — дословно из
 * `20260821T040000_cut_over_canonical_contacts.sql` + гейт из
 * `20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql`. Живёт здесь
 * ровно для одной пробы — инъекции неисправности, — и только внутри транзакции с `ROLLBACK`.
 */
const SHIPPED_BROKEN_BODY = `
CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)
 RETURNS TABLE(user_id uuid, password_hash text, email_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $broken$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.registration.resend-candidate', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_password_find_login_candidate(text)'::regprocedure);

  RETURN QUERY
  SELECT upc.user_id, upc.password_hash,
         (matched_email.confirmed_at IS NOT NULL OR fpu.matched_primary = false) AS email_verified
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  INNER JOIN app.find_platform_user_ids_by_any_confirmed_email(p_email_norm) AS fpu ON fpu.user_id = upc.user_id
  LEFT JOIN public.user_contacts AS matched_email
    ON matched_email.platform_user_id = pu.id
   AND matched_email.contact_kind = 'email'
   AND matched_email.value_normalized = lower(btrim(p_email_norm))
  WHERE pu.merged_into_id IS NULL
  LIMIT 1;
END
$broken$;
`;

/** Значения проб живут только внутри транзакции пробы, но на всякий случай они узнаваемы. */
const EMAIL_DRAFT = 'resend-proof-draft@example.test';
const EMAIL_CONFIRMED = 'resend-proof-confirmed@example.test';
const EMAIL_MERGED = 'resend-proof-merged@example.test';
const EMAIL_NO_PASSWORD = 'resend-proof-nopassword@example.test';
const HASH_DRAFT = 'argon2-proof-draft-hash';
const HASH_CONFIRMED = 'argon2-proof-confirmed-hash';

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/**
 * Четверо, все заводятся здесь, а не берутся из DEV-данных: правило двери не должно зависеть от
 * того, кто сегодня лежит в базе.
 *   p1 — черновик регистрации ровно в том виде, в каком его оставляет
 *        `app.email_password_register_pending`: первичная почта, `confirmed_at IS NULL`, пароль есть;
 *   p2 — состоявшийся аккаунт с ПОДТВЕРЖДЁННОЙ почтой и паролем;
 *   p3 — слитый (`merged_into_id`) аккаунт с неподтверждённой почтой и паролем;
 *   p4 — неподтверждённая почта БЕЗ пароля (вход по коду), переотправлять регистрацию нечего.
 */
const FIXTURE = `
CREATE TEMP TABLE probe_ids(k text PRIMARY KEY, v uuid);
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('resend proof draft', 'doctor')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p1', id FROM created;
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('resend proof confirmed', 'doctor')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p2', id FROM created;
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('resend proof merged', 'doctor')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p3', id FROM created;
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('resend proof nopassword', 'client')
  RETURNING id)
INSERT INTO probe_ids(k, v) SELECT 'p4', id FROM created;

INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', '${EMAIL_DRAFT}', true, NULL, 'direct', now() FROM probe_ids WHERE k = 'p1';
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', '${EMAIL_CONFIRMED}', true, now(), 'direct', now() FROM probe_ids WHERE k = 'p2';
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', '${EMAIL_MERGED}', true, NULL, 'direct', now() FROM probe_ids WHERE k = 'p3';
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', '${EMAIL_NO_PASSWORD}', true, NULL, 'direct', now() FROM probe_ids WHERE k = 'p4';

INSERT INTO public.user_password_credentials(user_id, password_hash, updated_at)
SELECT v, '${HASH_DRAFT}', now() FROM probe_ids WHERE k = 'p1';
INSERT INTO public.user_password_credentials(user_id, password_hash, updated_at)
SELECT v, '${HASH_CONFIRMED}', now() FROM probe_ids WHERE k = 'p2';
INSERT INTO public.user_password_credentials(user_id, password_hash, updated_at)
SELECT v, 'argon2-proof-merged-hash', now() FROM probe_ids WHERE k = 'p3';

UPDATE public.platform_users SET merged_into_id = (SELECT v FROM probe_ids WHERE k = 'p1')
 WHERE id = (SELECT v FROM probe_ids WHERE k = 'p3');

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, k text NOT NULL, v text NOT NULL);
`;

/** Приём контекста порта: форма берётся из ОБЪЯВЛЕННОЙ строки, отличие только в логине. */
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
   WHERE capability_id = '00000000-0000-4000-8000-0000000000fb'::uuid;
  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT '00000000-0000-4000-8000-0000000000fb'::uuid, c.port, session_user,
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
     AND c.capability_id = '00000000-0000-4000-8000-0000000000fb'::uuid;
END $accept$;
`;

/** Гейт двери строгий: контекст несёт ровно ту строку, которую получит сама дверь. */
const acceptResendDoor = (rawEmailLiteral) => `PERFORM pg_temp.accept_context(
    'app.email_password_find_login_candidate(text)', 'auth.password.registration.resend-candidate',
    'app_pre_session',
    ARRAY[ROW('text@1', pg_catalog.textsend(${rawEmailLiteral}))::app.port_typed_arg]);`;

/**
 * Гоняет пробу в транзакции с `ROLLBACK` и отдаёт `probe_out` как объект. `redefine` — SQL, который
 * применяется к телу двери ПЕРЕД пробой (кандидат либо инъекция неисправности) и откатывается вместе
 * со всем остальным.
 */
function probe(body, redefine = CANDIDATE_BODY) {
  const raw = psql(`BEGIN;
${FIXTURE}
${redefine}
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

/**
 * Дословно тот запрос, которым дверь зовёт `tryResendRegistrationChallenge`
 * (`pgUserPasswordCredentials.ts`), включая его `WHERE email_verified = false`: проверяется решение
 * ПРОДУКТА «переотправлять или нет», а не удобная выборка теста.
 */
const callerQuery = (rawEmailLiteral, key) => `
  ${acceptResendDoor(rawEmailLiteral)}
  s := '<none>';
  FOR r IN SELECT user_id::text AS id, password_hash
             FROM app.email_password_find_login_candidate(${rawEmailLiteral})
            WHERE email_verified = false
  LOOP
    s := r.id || '/' || r.password_hash;
  END LOOP;
  INSERT INTO probe_out(k, v) VALUES ('${key}', s);`;

test('неподтверждённый черновик регистрации найден: переотправка кода снова возможна',
  { skip: !ENABLED }, () => {
    // Ровно тот случай, который владелец видел падающим: та же почта, тот же пароль, кода нет.
    const out = probe(`
${callerQuery(`'${EMAIL_DRAFT}'`, 'resend')}
  INSERT INTO probe_out(k, v) VALUES ('expected', p1::text || '/${HASH_DRAFT}');`);

    assert.equal(out.resend, out.expected,
      `дверь не отдала черновик под переотправку: ${out.resend} (ждали ${out.expected})`);
  });

test('подтверждённый аккаунт под переотправку не идёт: маршрут остаётся при 409',
  { skip: !ENABLED }, () => {
    // Граница безопасности: письмо на ЧУЖОЙ подтверждённый адрес уходить не должно ни при каком
    // пароле. Дверь строку отдаёт, но с `email_verified = true`, и фильтр вызывающего её снимает.
    const out = probe(`
${callerQuery(`'${EMAIL_CONFIRMED}'`, 'resend')}
  ${acceptResendDoor(`'${EMAIL_CONFIRMED}'`)}
  SELECT * INTO r FROM app.email_password_find_login_candidate('${EMAIL_CONFIRMED}');
  INSERT INTO probe_out(k, v) VALUES ('verified', r.email_verified::text);
  INSERT INTO probe_out(k, v) VALUES ('owner', (r.user_id = p2)::text);`);

    assert.equal(out.resend, '<none>',
      `подтверждённая почта прошла под переотправку: ${out.resend}`);
    assert.equal(out.verified, 'true', `подтверждённая почта считается неподтверждённой: ${out.verified}`);
    assert.equal(out.owner, 'true', 'дверь отдала не того человека');
  });

test('регистр и пробелы вокруг адреса на поиск черновика не влияют',
  { skip: !ENABLED }, () => {
    // `lower(btrim(...))` внутри двери: человек второй раз печатает адрес иначе, чем в первый.
    const out = probe(`
${callerQuery(`'  Resend-Proof-Draft@Example.Test '`, 'resend')}
  INSERT INTO probe_out(k, v) VALUES ('expected', p1::text || '/${HASH_DRAFT}');`);

    assert.equal(out.resend, out.expected,
      `тот же адрес в другом регистре черновик не нашёл: ${out.resend}`);
  });

test('слитый аккаунт под переотправку не идёт', { skip: !ENABLED }, () => {
  // `merged_into_id IS NULL` в теле: у слитого человека своя строка контакта остаётся, но живым
  // владельцем адреса он уже не является.
  const out = probe(`${callerQuery(`'${EMAIL_MERGED}'`, 'resend')}`);
  assert.equal(out.resend, '<none>', `слитый аккаунт прошёл под переотправку: ${out.resend}`);
});

test('неподтверждённая почта без пароля под переотправку не идёт', { skip: !ENABLED }, () => {
  // Переотправлять нечего: регистрации по паролю у этого человека не начиналось.
  const out = probe(`${callerQuery(`'${EMAIL_NO_PASSWORD}'`, 'resend')}`);
  assert.equal(out.resend, '<none>', `аккаунт без пароля прошёл под переотправку: ${out.resend}`);
});

test('инъекция неисправности: прежнее тело (поиск по подтверждённой) черновик не находит',
  { skip: !ENABLED }, () => {
    // Красит проверку: без этой пробы зелёный цвет остальных ничего не доказывает. Прежнее тело
    // возвращается только внутри транзакции пробы и откатывается вместе с ней.
    const out = probe(`${callerQuery(`'${EMAIL_DRAFT}'`, 'resend')}`, SHIPPED_BROKEN_BODY);
    assert.equal(out.resend, '<none>',
      `прежнее тело внезапно находит черновик — проба не отличает продукт от поломки: ${out.resend}`);
  });
