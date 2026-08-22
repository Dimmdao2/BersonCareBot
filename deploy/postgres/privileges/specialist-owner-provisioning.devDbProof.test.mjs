/**
 * Живое доказательство того, что выдача специалиста при регистрации клиники доходит до конца:
 * `app.provision_specialist_owner(uuid)` под контекстом пациента заводит организацию, членство
 * владельца и его собственного специалиста. Opt-in: без `RUN_SPECIALIST_OWNER_PROVISIONING_DB=1`
 * файл пропускается и в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): последний шаг регистрации клиники снова умирает `42501` —
 * либо на правах (`permission denied for table organization_slug_claims`), либо на контексте
 * (`accepted port context required`), — и человек, подтвердивший почту, остаётся без клиники.
 *
 * Откуда взялась (Б2, 22.08.2026). Регистрация доходила до `specialist-signup/confirm` и умирала на
 * выдаче. Замер показал ДВЕ разные стены на одном пути, обе — расхождение декларации с тем, что телу
 * нужно, чтобы ВЫПОЛНИТЬСЯ (AGENTS.md §1 «Перед приземлением миграции — разбор её прав»):
 *   1. триггер `clinic_public_directory_current_slug_guard` — SECURITY INVOKER, значит его SELECT по
 *      `public.organization_slug_claims` идёт от владельца definer-функции, у которого был объявлен
 *      только INSERT;
 *   2. `app.start_provisioned_organization_trial()` и `app.current_provisioned_owner_organization()`
 *      брали человека из `app.current_patient_user_id()` (нужен контекст `app_patient`), а их
 *      аттестованный гейт называл одну лишь `app_platform_settings`. Принятая строка контекста в
 *      транзакции ровно одна — пара недостижима ни при каком вызове.
 * Обе закрыты декларацией (`declaration.ts`), не миграцией: гейт и гранты принадлежат генератору.
 *
 * Проверяется ПОВЕДЕНИЕ живых тел в базе, а не текст декларации: тест зовёт саму дверь и смотрит,
 * какие строки появились. Транзакция кончается `ROLLBACK` — постоянных строк на DEV не остаётся.
 *
 * Что тест приносит в транзакцию ИЗ РЕПОЗИТОРИЯ, а не выдумывает:
 *   — гранты шва из `deploy/postgres/generated/privileges.<база>.sql` (то, что кладёт reconcile);
 *   — выражения аттестованных гейтов оттуда же, наложенные ровно как их накладывает reconcile;
 *   — тело `app.start_provisioned_organization_trial()` из
 *     `deploy/postgres/c5a-platform-operations-runtime.sql` (runtime-overlay, его кладёт rehydrate).
 * Смысл: DEV сводится другой веткой и отстаёт; доказывать надо, что ОБЪЯВЛЕННОГО набора хватает,
 * а не то, в каком состоянии кластер оказался сегодня. Ни одна из этих строк не сочиняется здесь.
 *
 * Контекст порта ставится строкой в `app_ext.accepted_port_contexts` от имени администратора — как в
 * соседнем доказательстве (`canonical-email-contact-upsert.devDbProof.test.mjs`): доказывать надо
 * ПРАВИЛО ДВЕРИ, а не клиентские сертификаты `app.begin_port_context`. Приватные таблицы швов видит
 * только владелец или суперпользователь, поэтому проба идёт локальным админ-сокетом (AGENTS.md §6).
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_SPECIALIST_OWNER_PROVISIONING_DB=1 node --test \
 *     deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ENABLED = process.env.RUN_SPECIALIST_OWNER_PROVISIONING_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const ARTIFACT = path.join(REPO_ROOT, `deploy/postgres/generated/privileges.${DATABASE}.sql`);
const RUNTIME_OVERLAY = path.join(REPO_ROOT, 'deploy/postgres/c5a-platform-operations-runtime.sql');
const SEAM_OWNER = 'app_seam_specialist_provision_owner';

/** Функции, чей аттестованный гейт обязан принимать контекст пациента, чтобы выдача дошла до конца. */
const GATED_DELEGATES = [
  'app.start_provisioned_organization_trial()',
  'app.current_provisioned_owner_organization()',
];

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Гранты шва — построчно из артефакта, без переписывания. */
function seamGrantsFromArtifact() {
  const grants = readFileSync(ARTIFACT, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('GRANT ') && line.endsWith(`TO "${SEAM_OWNER}";`));
  if (grants.length === 0) throw new Error(`no seam grants for ${SEAM_OWNER} in ${ARTIFACT}`);
  return `${grants.join('\n')}\n`;
}

/** Выражение аттестованного гейта — из той же строки артефакта, что применяет reconcile. */
function gateExpressionFromArtifact(signature) {
  const marker = `  ('${signature}', 'attested', '`;
  const line = readFileSync(ARTIFACT, 'utf8').split('\n').find((row) => row.startsWith(marker));
  if (!line) throw new Error(`no attested gate row for ${signature} in ${ARTIFACT}`);
  const rest = line.slice(marker.length);
  const end = rest.indexOf("', ARRAY[");
  if (end === -1) throw new Error(`unreadable attested gate row for ${signature}`);
  // В артефакте выражение лежит внутри SQL-литерала, поэтому кавычки удвоены; сюда оно едет как код.
  return rest.slice(0, end).replaceAll("''", "'");
}

/** Тело runtime-overlay — побайтно из репозитория; DEV может нести более старую редакцию. */
function runtimeOverlayFunction(signature) {
  const source = readFileSync(RUNTIME_OVERLAY, 'utf8');
  const at = source.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  if (at === -1) throw new Error(`${signature} not found in ${RUNTIME_OVERLAY}`);
  const end = source.indexOf('$function$;', at);
  if (end === -1) throw new Error(`${signature} body is not terminated in ${RUNTIME_OVERLAY}`);
  return `${source.slice(at, end + '$function$;'.length)}\n`;
}

/**
 * Наложение выражений гейта — тот же алгоритм, что в артефакте: заменить существующий вызов, а если
 * его нет (тело только что приехало из runtime-overlay) — внедрить `PERFORM` сразу за первым `BEGIN`.
 */
function gateRewrite() {
  const rows = GATED_DELEGATES
    .map((signature) => `    ('${signature}', $gate$${gateExpressionFromArtifact(signature)}$gate$)`)
    .join(',\n');
  return `
DO $rewrite$
DECLARE g record; r record; new_src text; at int; len int; def text;
BEGIN
  FOR g IN SELECT * FROM (VALUES
${rows}) AS t(sig, expr) LOOP
    SELECT oid, prosrc, (SELECT lanname FROM pg_language WHERE oid = prolang) AS lang
      INTO r FROM pg_proc WHERE oid = g.sig::regprocedure;
    at := position('app.require_attested_context_for_roles' IN r.prosrc);
    IF at > 0 THEN
      len := position(';' IN substr(r.prosrc, at)) - 1;
      new_src := overlay(r.prosrc PLACING g.expr FROM at FOR len);
    ELSIF r.lang = 'sql' THEN
      new_src := 'SELECT ' || g.expr || ';' || E'\\n' || r.prosrc;
    ELSE
      new_src := regexp_replace(r.prosrc, '(^|\\n)([[:space:]]*)BEGIN',
        E'\\\\1\\\\2BEGIN\\n\\\\2  PERFORM ' || g.expr || ';', 1, 1, 'in');
    END IF;
    def := pg_get_functiondef(r.oid);
    EXECUTE overlay(def PLACING new_src FROM position(r.prosrc IN def) FOR char_length(r.prosrc));
  END LOOP;
END $rewrite$;
`;
}

/** Один человек с подтверждённой почтой и одно намерение регистрации — всё внутри транзакции. */
const FIXTURE = `
CREATE TEMP TABLE ids(k text PRIMARY KEY, v uuid);
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('b2 provision proof', 'client')
  RETURNING id)
INSERT INTO ids(k, v) SELECT 'u', id FROM created;
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', 'b2-provision-proof@example.test', true, now(), 'direct', now() FROM ids WHERE k='u';
INSERT INTO ids(k, v) VALUES ('ch', gen_random_uuid());
INSERT INTO public.specialist_signup_intents(
  user_id, challenge_id, email_normalized, organization_title, specialist_full_name, status, organization_slug)
SELECT (SELECT v FROM ids WHERE k='u'), (SELECT v FROM ids WHERE k='ch'),
       'b2-provision-proof@example.test', 'Проба Клиника', 'Проба Специалист', 'pending',
       'b2-provision-proof-clinic';

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, k text NOT NULL, v text NOT NULL);
`;

/**
 * Приём контекста порта. Строка способности переснимается с ОБЪЯВЛЕННОЙ, отличаясь только логином:
 * заявку ставит администратор, а гейт соединяет принятый контекст со способностью ПО ЛОГИНУ. Форма
 * (порт, роль, класс, назначение) берётся из объявленной строки, поэтому связь с декларацией цела.
 */
const ACCEPT_HELPER = `
CREATE OR REPLACE FUNCTION pg_temp.accept_relation_context(p_target_role text, p_subject uuid)
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
   WHERE c.purpose = 'relation' AND c.target_role = p_target_role
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no declared relation capability for %', p_target_role;
  END IF;
  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash, subject_ref)
  SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login, c.port,
         c.target_role, c.context_class, c.purpose, c.function_identity,
         app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), p_subject
    FROM pg_database d, app_ext.port_context_capabilities c
   WHERE d.datname = current_database()
     AND c.capability_id = '00000000-0000-4000-8000-0000000000fb'::uuid;
END $accept$;
`;

/** Гоняет пробу в транзакции с ROLLBACK и отдаёт `probe_out` как объект `ключ -> значение`. */
function probe(body) {
  const raw = psql(`BEGIN;
${seamGrantsFromArtifact()}
${runtimeOverlayFunction('app.start_provisioned_organization_trial()')}
${gateRewrite()}
${FIXTURE}
${ACCEPT_HELPER}
DO $probe$
DECLARE u uuid; ch uuid; opaque uuid; r record; s text;
BEGIN
  SELECT v INTO u FROM ids WHERE k = 'u';
  SELECT v INTO ch FROM ids WHERE k = 'ch';
  opaque := app_ext.resolve_variant_a_identity(u);
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

test('регистрация клиники доходит до конца: организация, членство владельца и его специалист',
  { skip: !ENABLED }, () => {
    // Ровно тот вызов, который делает `POST /api/auth/specialist-signup/confirm` после подтверждения
    // почты: принципал — identity-self пациента (`enterStaffSecuritySelfPrincipal`), обращение к базе
    // РЕЛЯЦИОННОЕ, поэтому контекст — объявленная способность `relation` роли `app_patient`.
    const out = probe(`
  PERFORM pg_temp.accept_relation_context('app_patient', opaque);
  BEGIN
    SELECT * INTO r FROM app.provision_specialist_owner(ch);
    s := r.ok::text || '/' || COALESCE(r.code, '<null>');
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
  IF r.ok IS NOT TRUE THEN RETURN; END IF;

  -- Мёртвая мастерская (owner-reported): членство без specialist_id навсегда лишает клинику
  -- clinical.workspace. Проверяем связку, а не только факт трёх идентификаторов.
  INSERT INTO probe_out(k, v) SELECT 'membership',
         (m.organization_id = r.organization_id)::text || '/' || m.role || '/' || m.status || '/'
         || (m.specialist_id = r.specialist_id)::text
    FROM public.be_organization_members AS m WHERE m.id = r.membership_id;
  INSERT INTO probe_out(k, v) SELECT 'specialist',
         (sp.organization_id = r.organization_id)::text || '/' || sp.is_active::text
    FROM public.be_specialists AS sp WHERE sp.id = r.specialist_id;
  -- Публичный адрес клиники: заявка на слаг и карточка каталога — обе, иначе клиника не открывается
  -- по своему адресу. Карточку и ловил отказ SELECT по organization_slug_claims из триггера.
  INSERT INTO probe_out(k, v) SELECT 'slug_claim', count(*)::text
    FROM public.organization_slug_claims AS c
   WHERE c.organization_id = r.organization_id AND c.kind = 'current'
     AND c.slug = 'b2-provision-proof-clinic';
  INSERT INTO probe_out(k, v) SELECT 'directory', count(*)::text
    FROM public.clinic_public_directory_entries AS e
   WHERE e.organization_id = r.organization_id AND e.slug = 'b2-provision-proof-clinic'
     AND e.is_published;
  -- Человек становится доктором, а намерение — исполненным ровно один раз.
  INSERT INTO probe_out(k, v) SELECT 'user_role', pu.role FROM public.platform_users AS pu WHERE pu.id = u;
  INSERT INTO probe_out(k, v) SELECT 'intent',
         i.status || '/' || (i.provisioned_organization_id = r.organization_id)::text || '/'
         || (i.provisioned_specialist_id = r.specialist_id)::text
    FROM public.specialist_signup_intents AS i WHERE i.challenge_id = ch;
  -- Каталог-снимок клиники заводится в той же транзакции: без него новый кабинет пуст.
  INSERT INTO probe_out(k, v) SELECT 'catalog_receipt', count(*)::text
    FROM public.reference_catalog_snapshot_receipts AS rc WHERE rc.organization_id = r.organization_id;`);

    assert.equal(out.outcome, 'true/<null>', `выдача специалиста не дошла до конца: ${out.outcome}`);
    assert.equal(out.membership, 'true/owner/active/true',
      `членство владельца не связано со своим специалистом: ${out.membership}`);
    assert.equal(out.specialist, 'true/true', `специалист не заведён в своей организации: ${out.specialist}`);
    assert.equal(out.slug_claim, '1', `заявка на публичный адрес клиники не создана: ${out.slug_claim}`);
    assert.equal(out.directory, '1', `карточка клиники в каталоге не создана: ${out.directory}`);
    assert.equal(out.user_role, 'doctor', `регистрирующийся не стал доктором: ${out.user_role}`);
    assert.equal(out.intent, 'provisioned/true/true', `намерение не отмечено исполненным: ${out.intent}`);
    assert.equal(out.catalog_receipt, '1', `снимок справочников клиники не заведён: ${out.catalog_receipt}`);
  });

test('без принятого контекста дверь выдачи по-прежнему отказывает 42501, а не заводит клинику',
  { skip: !ENABLED }, () => {
    // Стена на месте: расширение гейтов делегатов ролью пациента не должно открывать выдачу тому,
    // кто вообще не назвал контекст. Иначе любая транзакция заводила бы себе клинику.
    const out = probe(`
  BEGIN
    SELECT * INTO r FROM app.provision_specialist_owner(ch);
    s := 'ALLOWED ' || r.ok::text;
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
  INSERT INTO probe_out(k, v) SELECT 'organizations', count(*)::text
    FROM public.be_organizations AS o WHERE o.title = 'Проба Клиника';`);

    assert.match(out.outcome, /^42501 /u, `дверь выдачи пропустила вызов без контекста: ${out.outcome}`);
    assert.equal(out.organizations, '0', `отказанный вызов всё-таки завёл организацию: ${out.organizations}`);
  });
