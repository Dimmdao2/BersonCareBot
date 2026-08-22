/**
 * Живое доказательство того, что пробная подписка при регистрации клиники ЗАВОДИТСЯ, а не падает:
 * `app.start_provisioned_organization_trial()` — второй шаг `app.provision_specialist_owner(uuid)` —
 * называет колонки, которые у его таблиц действительно есть, и кладёт строку трила на тариф
 * регистрации со сроками, посчитанными из политики. Opt-in: без
 * `RUN_PROVISIONED_ORGANIZATION_TRIAL_DB=1` файл пропускается и в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): тело трила снова называет колонку, которой у таблицы нет, —
 * регистрация клиники доходит до подтверждения кода и умирает `503 provisioning_pending`.
 *
 * Откуда взялась (Б2, 22.08.2026). Живая регистрация на TEST падала на выдаче, а в журнале
 * PostgreSQL в ту же секунду стояло `42703 ERROR: column policy.tariff_id does not exist`. Тело в
 * каталоге осталось в редакции ДО перестройки триальной модели (#1069 Т5/Т6) и называло четыре
 * несуществующих имени: `policy.tariff_id`, `v_policy.tariff_id`, `v_policy.grace_days` и колонку
 * вставки `grace_ends_at`. Соседнее доказательство
 * `specialist-owner-provisioning.devDbProof.test.mjs` этого не видело: оно приносит тело из
 * runtime-overlay `deploy/postgres/c5a-platform-operations-runtime.sql`, где редакция уже правильная
 * и в каталог никогда не доезжала. Поэтому здесь источник ровно один и ровно тот, который
 * ПРИЗЕМЛЯЕТСЯ, — файл миграции.
 *
 * Что тест приносит в транзакцию ИЗ РЕПОЗИТОРИЯ, а не выдумывает:
 *   — тело `app.start_provisioned_organization_trial()` из файла миграции (кандидат, который
 *     применяет `deploy/host/migrate-dev.sh`);
 *   — гранты шва из `deploy/postgres/generated/privileges.<база>.sql` — то, что кладёт reconcile:
 *     тем самым проверяется, что ОБЪЯВЛЕННЫХ прав хватает телу ВЫПОЛНИТЬСЯ (AGENTS.md §1);
 *   — выражение аттестованного гейта оттуда же — тест сверяет, что тело миграции несёт ИМЕННО его,
 *     иначе reconcile переписал бы тело и в каталоге оказалась бы третья редакция.
 * Ни одна из этих строк здесь не сочиняется.
 *
 * Проверяется ПОВЕДЕНИЕ живого тела: тест зовёт саму дверь и смотрит, какая строка трила появилась.
 * Транзакция кончается `ROLLBACK` — постоянных строк на DEV не остаётся. Приватные таблицы швов
 * видит только владелец или суперпользователь, поэтому проба идёт локальным админ-сокетом
 * (AGENTS.md §6).
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PROVISIONED_ORGANIZATION_TRIAL_DB=1 node --test \
 *     deploy/postgres/privileges/provisioned-organization-trial.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ENABLED = process.env.RUN_PROVISIONED_ORGANIZATION_TRIAL_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const ARTIFACT = path.join(REPO_ROOT, `deploy/postgres/generated/privileges.${DATABASE}.sql`);
const MIGRATION = path.join(
  REPO_ROOT,
  'apps/webapp/db/drizzle-migrations',
  '20260822T120000_the_provisioned_trial_names_the_columns_its_tables_have.sql',
);
const SIGNATURE = 'app.start_provisioned_organization_trial()';
const SEAM_OWNER = 'app_seam_specialist_provision_owner';

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
function gateExpressionFromArtifact() {
  const marker = `  ('${SIGNATURE}', 'attested', '`;
  const line = readFileSync(ARTIFACT, 'utf8').split('\n').find((row) => row.startsWith(marker));
  if (!line) throw new Error(`no attested gate row for ${SIGNATURE} in ${ARTIFACT}`);
  const rest = line.slice(marker.length);
  const end = rest.indexOf("', ARRAY[");
  if (end === -1) throw new Error(`unreadable attested gate row for ${SIGNATURE}`);
  return rest.slice(0, end).replaceAll("''", "'");
}

/** Тело кандидата — побайтно из файла миграции; каталог DEV может нести более старую редакцию. */
function migrationFunction() {
  const source = readFileSync(MIGRATION, 'utf8');
  const at = source.indexOf(`CREATE OR REPLACE FUNCTION ${SIGNATURE}`);
  if (at === -1) throw new Error(`${SIGNATURE} not found in ${MIGRATION}`);
  const end = source.indexOf('$function$;', at);
  if (end === -1) throw new Error(`${SIGNATURE} body is not terminated in ${MIGRATION}`);
  return `${source.slice(at, end + '$function$;'.length)}\n`;
}

/**
 * Тело кандидата ставится от ВЛАДЕЛЬЦА шва теми же временными грантами, что даёт раннер миграций
 * (`migrate-local.mjs`), а не от суперпользователя: иначе проверялось бы не то, что применит
 * `migrate-dev.sh`. Гранты снимаются тут же, в той же транзакции.
 */
function installAsSeamOwner(body) {
  return `GRANT CREATE ON SCHEMA app TO ${SEAM_OWNER};
GRANT USAGE ON LANGUAGE plpgsql TO ${SEAM_OWNER};
SET LOCAL ROLE ${SEAM_OWNER};
${body}RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM ${SEAM_OWNER};
`;
}

/**
 * Политики платформы приводятся к ИЗВЕСТНЫМ значениям внутри транзакции: на стенде окно скидки
 * может стоять нулём, и тогда проверка «`discount_ends_at` считается из `discount_window_days`»
 * прошла бы вхолостую при любом теле. Тариф берётся живой активный — выдумывать его нельзя, на нём
 * висит внешний ключ.
 */
const POLICY = `
CREATE TEMP TABLE ids(k text PRIMARY KEY, v uuid);
INSERT INTO ids(k, v)
SELECT 'tariff', t.id FROM public.saas_tariffs AS t WHERE t.is_active ORDER BY t.name LIMIT 1;
DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ids WHERE k = 'tariff') THEN
    RAISE EXCEPTION 'no active tariff on this stand: nothing a trial could run on';
  END IF;
END $policy$;

INSERT INTO public.saas_registration_tariff_policy(key, tariff_id, updated_at)
SELECT 'global', v, now() FROM ids WHERE k = 'tariff'
ON CONFLICT (key) DO UPDATE SET tariff_id = excluded.tariff_id, updated_at = now();

INSERT INTO public.saas_trial_policy(
  key, duration_days, discount_window_days, start_event, post_trial_behavior,
  post_trial_tariff_id, is_active, updated_at)
VALUES ('global', 14, 5, 'organization_provisioned', 'blocked', NULL, true, now())
ON CONFLICT (key) DO UPDATE SET
  duration_days = 14, discount_window_days = 5, start_event = 'organization_provisioned',
  post_trial_behavior = 'blocked', post_trial_tariff_id = NULL, is_active = true, updated_at = now();
`;

/** Один человек с подтверждённой почтой и одно намерение регистрации — всё внутри транзакции. */
const FIXTURE = `
WITH created AS (
  INSERT INTO public.platform_users(display_name, role) VALUES ('b2 trial proof', 'client')
  RETURNING id)
INSERT INTO ids(k, v) SELECT 'u', id FROM created;
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at)
SELECT v, 'email', 'b2-trial-proof@example.test', true, now(), 'direct', now() FROM ids WHERE k='u';
INSERT INTO ids(k, v) VALUES ('ch', gen_random_uuid());
INSERT INTO public.specialist_signup_intents(
  user_id, challenge_id, email_normalized, organization_title, specialist_full_name, status, organization_slug)
SELECT (SELECT v FROM ids WHERE k='u'), (SELECT v FROM ids WHERE k='ch'),
       'b2-trial-proof@example.test', 'Проба Трил', 'Проба Специалист', 'pending',
       'b2-trial-proof-clinic';

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, k text NOT NULL, v text NOT NULL);
`;

/** Приём контекста порта: форма берётся из ОБЪЯВЛЕННОЙ строки способности, меняется только логин. */
const ACCEPT_HELPER = `
CREATE OR REPLACE FUNCTION pg_temp.accept_relation_context(p_target_role text, p_subject uuid)
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
     AND c.capability_id = '00000000-0000-4000-8000-0000000000fc'::uuid;
END $accept$;
`;

/** Гоняет пробу в транзакции с ROLLBACK и отдаёт `probe_out` как объект `ключ -> значение`. */
function probe(body, functionSql = migrationFunction()) {
  const raw = psql(`BEGIN;
${seamGrantsFromArtifact()}
${installAsSeamOwner(functionSql)}
${POLICY}
${FIXTURE}
${ACCEPT_HELPER}
DO $probe$
DECLARE u uuid; ch uuid; opaque uuid; r record; s text; provisioned boolean := false;
BEGIN
  SELECT v INTO u FROM ids WHERE k = 'u';
  SELECT v INTO ch FROM ids WHERE k = 'ch';
  opaque := app_ext.resolve_variant_a_identity(u, 'actor');
  PERFORM pg_temp.accept_relation_context('app_patient', opaque);
  BEGIN
    SELECT * INTO r FROM app.provision_specialist_owner(ch);
    s := r.ok::text || '/' || COALESCE(r.code, '<null>');
    provisioned := r.ok;
  EXCEPTION WHEN OTHERS THEN s := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO probe_out(k, v) VALUES ('outcome', s);
  IF NOT provisioned THEN RETURN; END IF;
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

/** Проба трила — общая для рабочего прогона и для инъекций неисправности. */
const TRIAL_PROBE = `
  -- Трил НЕ несёт своего тарифа (#1069 Т5, решение владельца 03.08): он идёт на ПЕРВЫЙ тариф
  -- организации, а на пути автоматической выдачи первый тариф — настройка регистрации.
  INSERT INTO probe_out(k, v) SELECT 'trial',
         (t.tariff_id = (SELECT v FROM ids WHERE k = 'tariff'))::text || '/' || t.status || '/'
         || (t.ends_at - t.started_at)::text || '/' || (t.discount_ends_at - t.ends_at)::text || '/'
         || t.post_trial_behavior || '/' || COALESCE(t.post_trial_tariff_id::text, '<null>') || '/'
         || (t.created_by = u)::text
    FROM public.saas_organization_trials AS t WHERE t.organization_id = r.organization_id;
  -- Организация получает тот же первый тариф: иначе трил висит на одном, а доступ считается по другому.
  INSERT INTO probe_out(k, v) SELECT 'organization_tariff',
         (o.tariff_id = (SELECT v FROM ids WHERE k = 'tariff'))::text
    FROM public.be_organizations AS o WHERE o.id = r.organization_id;
  INSERT INTO probe_out(k, v) SELECT 'audit', a.action || '/' || a.status || '/'
         || ((a.details -> 'after' ->> 'tariffId')::uuid = (SELECT v FROM ids WHERE k = 'tariff'))::text
         || '/' || (a.details -> 'after' ->> 'durationDays')
         || '/' || (a.details -> 'after' ->> 'discountWindowDays')
    FROM public.admin_audit_log AS a
   WHERE a.organization_id = r.organization_id AND a.action = 'saas_trial_start';`;

test('гейт кандидата — ровно тот, который рендерит генератор', { skip: !ENABLED }, () => {
  // Если тело миграции несёт другое выражение, reconcile перепишет его на своё, и в каталоге
  // окажется третья редакция, которую не проверял никто.
  assert.ok(
    migrationFunction().includes(`PERFORM ${gateExpressionFromArtifact()};`),
    'тело миграции не несёт выражение аттестованного гейта из артефакта',
  );
});

test('пробная подписка заводится на тариф регистрации со сроками из политики',
  { skip: !ENABLED }, () => {
    const out = probe(TRIAL_PROBE);

    assert.equal(out.outcome, 'true/<null>', `выдача не дошла до конца: ${out.outcome}`);
    // Политика в транзакции: 14 дней трила, окно скидки 5 дней, после трила — `blocked` без тарифа.
    assert.equal(out.trial, 'true/active/14 days/5 days/blocked/<null>/true',
      `строка трила не отвечает политике: ${out.trial}`);
    assert.equal(out.organization_tariff, 'true',
      `организация не получила первый тариф: ${out.organization_tariff}`);
    assert.equal(out.audit, 'saas_trial_start/ok/true/14/5',
      `аудит старта трила не записан: ${out.audit}`);
  });

/**
 * Инъекция неисправности. Каждая возвращает в тело ОДНО имя колонки, которого у таблицы нет —
 * ровно то, на чём умирала живая регистрация, — и проба обязана покраснеть `42703`. Без этого
 * зелёный тест выше не доказывает ничего: он мог бы проходить и на теле, которое до трила не доходит.
 */
for (const [label, broken] of [
  ['policy.tariff_id (колонки нет у saas_trial_policy)', (sql) => sql.replace(
    '  FROM public.saas_trial_policy AS policy\n',
    '  FROM public.saas_trial_policy AS policy\n'
    + '  INNER JOIN public.saas_tariffs AS tariff\n'
    + '    ON tariff.id = policy.tariff_id\n'
    + '   AND tariff.is_active\n',
  )],
  ['grace_ends_at (колонка saas_organization_trials зовётся discount_ends_at)', (sql) => sql.replace(
    'started_at, ends_at, discount_ends_at,', 'started_at, ends_at, grace_ends_at,',
  )],
]) {
  test(`несуществующая колонка снова роняет выдачу: ${label}`, { skip: !ENABLED }, () => {
    const sql = broken(migrationFunction());
    assert.notEqual(sql, migrationFunction(), 'инъекция ничего не изменила — проверять нечего');
    const out = probe(TRIAL_PROBE, sql);
    assert.match(out.outcome, /^42703 /u,
      `тело с несуществующей колонкой не уронило выдачу: ${out.outcome}`);
    assert.equal(out.trial, undefined, 'трил всё-таки завёлся на сломанном теле');
  });
}
