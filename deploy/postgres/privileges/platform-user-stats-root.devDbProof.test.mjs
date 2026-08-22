/**
 * Живое доказательство двери `app.read_platform_user_stats` на именованной DEV-базе. Opt-in: без
 * `RUN_PLATFORM_USER_STATS_ROOT_DB=1` файл пропускается и в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): экраны «Регистрации и слияния» и «Подписчики приложения»
 * снова отдают 500 — либо у `app_platform_settings` нет EXECUTE на дверь, либо у владельца шва не
 * хватает права на колонку, которую читает ТЕЛО, и вызов падает `42501` на первом живом обращении.
 *
 * Почему офлайн-проверок не хватает. Пайплайн сверяет «объявлено == лежит в базе» и молчит о том,
 * ДОСТАТОЧНО ли объявленного (AGENTS §1). Функция с недостающим правом проходит миграцию,
 * reconcile и деплой зелёными и краснеет только на живом вызове — ровно так оба экрана и отдавали
 * 500 с `42501` до этой ветки (живой обход TEST 22.08.2026).
 *
 * Оракул НЕ придуман здесь: те же три числа считаются вторым запросом — ПРЕЖНИМ SQL кода, слово в
 * слово, от суперпользователя. Дверь обязана повторить их до единицы; иначе агрегат не заменяет
 * прежнее чтение отношений, а меняет цифры на экране.
 *
 * Вся работа идёт в транзакции, которая заканчивается ROLLBACK: функция, гранты и строка каталога
 * возможностей в DEV не остаются. `--execute` по DEV эта ветка не делает — базу ведёт соседняя.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PLATFORM_USER_STATS_ROOT_DB=1 node --test \
 *     deploy/postgres/privileges/platform-user-stats-root.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PLATFORM_USER_STATS_ROOT_DB === '1';
const DATABASE = process.env.PLATFORM_USER_STATS_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATION = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations',
  '20260822T161000_the_platform_user_stats_screens_read_an_aggregate.sql');
const PRIVILEGES = path.join(repoRoot, 'deploy/postgres/generated', `privileges.${DATABASE}.sql`);
const CAPABILITIES = path.join(repoRoot, 'deploy/postgres/generated',
  `port-context-capabilities.${DATABASE}.sql`);

const IDENTITY =
  'app.read_platform_user_stats(timestamp with time zone,timestamp with time zone,text,text)';
const SEAM_OWNER = 'app_seam_platform_analytics_owner';
const PLATFORM_ROLE = 'app_platform_settings';
const PURPOSE = 'analytics.platform-user-stats.read';

const START = '2026-07-01T21:00:00.000Z';
const END = '2026-08-22T21:00:00.000Z';
const IANA = 'Europe/Moscow';
// То же, что строит `platformAudienceJson(..., { excludeStaffRoles: false })` на этих двух экранах.
const AUDIENCE = JSON.stringify({
  excludeStaffRoles: false,
  staffRoles: ['admin', 'doctor'],
  excludedPhones: ['+70000000000'],
  telegramIds: [],
  maxIds: [],
});

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim();
}

/** Ровно те строки доступа, которые генератор вывел из декларации — не переписанные руками. */
function generatedLine(file, needle, what) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.includes(needle));
  assert.ok(line, `в ${path.basename(file)} нет строки ${what} — артефакт не перегенерирован`);
  return line.trim();
}

function fixture({ withExecuteGrant = true } = {}) {
  const migrationBody = fs.readFileSync(MIGRATION, 'utf8')
    .slice(fs.readFileSync(MIGRATION, 'utf8').indexOf('CREATE OR REPLACE FUNCTION'));
  const executeGrant = generatedLine(PRIVILEGES,
    `ON FUNCTION ${IDENTITY} TO "${PLATFORM_ROLE}"`, 'EXECUTE-гранта двери');
  const platformUsersGrant = generatedLine(PRIVILEGES,
    `"merged_at", "merged_into_id", "role") ON TABLE "public"."platform_users" TO "${SEAM_OWNER}"`,
    'колоночного гранта platform_users владельцу шва');
  const bindingsGrant = generatedLine(PRIVILEGES,
    `"bot_blocked_at", "channel_code", "created_at", "external_id", "user_id") ON TABLE "public"."user_channel_bindings" TO "${SEAM_OWNER}"`,
    'колоночного гранта user_channel_bindings владельцу шва');
  const capabilityValues = generatedLine(CAPABILITIES, 'read_platform_user_stats', 'строки каталога возможностей')
    .replace(/,$/, '');

  return [
    'BEGIN;',
    // Мигратор даёт владельцу шва ровно это на время своего statement и снимает после; здесь то же
    // самое делает транзакция, которая всё равно откатится.
    `GRANT CREATE ON SCHEMA app TO ${SEAM_OWNER};`,
    `GRANT USAGE ON LANGUAGE plpgsql TO ${SEAM_OWNER};`,
    `SET LOCAL ROLE ${SEAM_OWNER};`,
    migrationBody,
    'RESET ROLE;',
    ...(withExecuteGrant ? [executeGrant] : []),
    platformUsersGrant,
    bindingsGrant,
    'INSERT INTO app_ext.port_context_capabilities (capability_id, port, session_login, target_role,'
      + ` context_class, purpose, function_identity) VALUES ${capabilityValues};`,
  ].join('\n');
}

/** Настоящий путь порта: тот же логин, та же возможность, тот же хеш типизированных аргументов. */
function openPlatformContext() {
  const capabilityLine = generatedLine(CAPABILITIES, 'read_platform_user_stats', 'строки каталога');
  const capabilityId = /^\('([0-9a-f-]{36})'/u.exec(capabilityLine.replace(/^\(/, '('))?.[1];
  assert.ok(capabilityId, 'capability_id не извлекается из артефакта');
  const login = /'(bcb_[a-z0-9_]+)'::name/u.exec(capabilityLine)?.[1];
  assert.ok(login, 'session_login не извлекается из артефакта');

  const actorRef = psql(`SELECT r.opaque_ref::text FROM app_ext.variant_a_identity_refs r
      JOIN public.platform_users u ON u.id = r.physical_user_id
     WHERE u.role = 'admin' ORDER BY u.created_at LIMIT 1;`);
  assert.match(actorRef, /^[0-9a-f-]{36}$/u,
    `на базе ${DATABASE} нет ни одного глобального админа с Variant-A ссылкой — доказывать нечем`);

  const argsHash = psql(`SELECT encode(app.hash_port_typed_args(ARRAY[
      ROW('timestamptz@1', pg_catalog.timestamptz_send('${START}'::timestamptz))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send('${END}'::timestamptz))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('${IANA}'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($aud$${AUDIENCE}$aud$))::app.port_typed_arg]), 'hex');`);

  return [
    `SET LOCAL SESSION AUTHORIZATION ${login};`,
    `SELECT app.begin_port_context('${capabilityId}'::uuid,`
      + ` ROW(1::smallint, 'platform'::app.port_context_class, '${PLATFORM_ROLE}'::name,`
      + ` '${PURPOSE}', '${IDENTITY}'::regprocedure, decode('${argsHash}', 'hex'),`
      + ` '${actorRef}'::uuid, NULL::uuid, NULL::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims);`,
  ].join('\n');
}

const CALL = `SELECT app.read_platform_user_stats('${START}'::timestamptz, '${END}'::timestamptz,`
  + ` '${IANA}', $aud$${AUDIENCE}$aud$);`;

/**
 * Оракул: прежние запросы кода, слово в слово. Исключение служебных учёток здесь тоже прежнее —
 * по ПЕРВИЧНОМУ телефону, как его резолвил `drizzlePrimaryPhoneCol`.
 */
const ORACLE = `
WITH excluded AS (
  SELECT pu.id FROM platform_users pu
   WHERE (SELECT uc.value_normalized FROM user_contacts uc
           WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true
           LIMIT 1) IN ('+70000000000')
)
SELECT
 (SELECT count(*) FROM platform_users pu WHERE pu.role = 'client'
    AND pu.created_at >= '${START}'::timestamptz AND pu.created_at < '${END}'::timestamptz
    AND NOT (pu.merged_at IS NOT NULL AND pu.merged_at >= '${START}'::timestamptz
             AND pu.merged_at < '${END}'::timestamptz)
    AND pu.id <> ALL (SELECT id FROM excluded))::text
 || '|' ||
 (SELECT count(*) FROM platform_users pu WHERE pu.merged_into_id IS NOT NULL AND pu.merged_at IS NOT NULL
    AND pu.merged_at >= '${START}'::timestamptz AND pu.merged_at < '${END}'::timestamptz
    AND pu.id <> ALL (SELECT id FROM excluded))::text
 || '|' ||
 (SELECT count(*) FROM (
    SELECT pu.id FROM platform_users pu
      INNER JOIN user_channel_bindings ucb ON ucb.user_id = pu.id
        AND ucb.channel_code IN ('telegram', 'max') AND ucb.bot_blocked_at IS NULL
     WHERE pu.role = 'client' AND pu.merged_into_id IS NULL AND COALESCE(pu.is_archived, false) = false
       AND pu.id <> ALL (SELECT id FROM excluded)
     GROUP BY pu.id HAVING MIN(ucb.created_at) < '${START}'::timestamptz) q)::text;`;

test('платформенный принципал получает через дверь те же числа, что считал прежний код',
  { skip: !ENABLED }, () => {
    const stats = JSON.parse(psql([fixture(), openPlatformContext(), CALL, 'ROLLBACK;'].join('\n')));
    const [registrations, merges, subscribersBefore] = psql(ORACLE).split('|').map(Number);

    assert.equal(stats.registrations.total, registrations);
    assert.equal(stats.merges.total, merges);
    assert.equal(stats.subscribers.countBeforeStart, subscribersBefore);

    // ЛОВУШКА ПУСТОТЫ: на базе без единой регистрации и подписчика «числа совпали» истинно даром.
    assert.ok(registrations + merges + subscribersBefore > 0,
      `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: в окне ${START}..${END} нет ни регистраций, ни слияний, `
      + 'ни подписчиков. Совпадение нулей ничего не значит.');
    assert.ok(Object.keys(stats.registrations.byDay).length > 0,
      'дверь вернула суммы без разбивки по дням — график на экране остался бы пустым');
  });

test('без EXECUTE у платформенной роли дверь отказывает 42501, а не молчит',
  { skip: !ENABLED }, () => {
    // Инъекция неисправности: единственное, чего лишается сценарий, — грант EXECUTE. Если проверка
    // остаётся зелёной и без него, она не доказывает ничего.
    let refusal = null;
    try {
      psql([fixture({ withExecuteGrant: false }), openPlatformContext(), CALL, 'ROLLBACK;'].join('\n'));
    } catch (error) {
      refusal = String(error.stderr ?? error.message);
    }
    assert.ok(refusal, 'без EXECUTE вызов обязан упасть — иначе дверь никем не охраняется');
    assert.match(refusal, /permission denied for function read_platform_user_stats/u);
  });

test('табличных прав платформенной роли дверь не добавляет', { skip: !ENABLED }, () => {
  // §4 брифа, живьём: числа появились, а читать строки людей роли по-прежнему нечем.
  const answer = psql(`${fixture()}
SELECT has_table_privilege('${PLATFORM_ROLE}', 'public.user_channel_bindings', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.user_channel_bindings', 'external_id', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.platform_users', 'role', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.platform_users', 'created_at', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.platform_users', 'id', 'SELECT')::text;
ROLLBACK;`);
  assert.deepEqual(answer.split('|'), ['false', 'false', 'false', 'false', 'true'],
    'роль экрана получила табличное чтение людей — это противоречит решению владельца Р-АДМИН');
});
