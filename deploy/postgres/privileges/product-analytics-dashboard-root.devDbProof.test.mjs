/**
 * Живое доказательство двери `app.read_product_analytics_dashboard` на именованной DEV-базе.
 * Opt-in: без `RUN_PRODUCT_ANALYTICS_ROOT_DB=1` файл пропускается и в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): экран «Приложение» снова отдаёт 500 — либо у
 * `app_platform_settings` нет EXECUTE на дверь, либо владельцу шва не хватает права на колонку или
 * политики RLS на таблице, которую читает ТЕЛО, и вызов падает `42501` на первом живом обращении.
 *
 * Почему офлайн-проверок не хватает. Пайплайн сверяет «объявлено == лежит в базе» и молчит о том,
 * ДОСТАТОЧНО ли объявленного (AGENTS §1). Здесь этого мало вдвойне: тело читает две таблицы, на
 * которых шва `app_seam_platform_analytics_owner` раньше не было ВОВСЕ, — значит проверять надо не
 * только колоночный грант, но и то, что restrictive-политика `rev10_named_root_owner_gate`
 * пропускает нового владельца. Такая нехватка проходит миграцию, reconcile и деплой зелёными.
 *
 * Оракул НЕ придуман здесь: те же числа считаются вторым запросом от суперпользователя, написанным
 * НЕЗАВИСИМО — схлопывание ключей страниц в нём выписано `CASE`-цепочкой, а не тем списком правил,
 * который дверь получает параметром. Совпадение доказывает и цифры, и то, что интерпретатор правил
 * в SQL применяет их так же, как приложение.
 *
 * Вся работа идёт в транзакции, которая заканчивается ROLLBACK: функция, гранты, политики и строка
 * каталога возможностей в DEV не остаются. `--execute` по DEV эта ветка не делает.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PRODUCT_ANALYTICS_ROOT_DB=1 node --test \
 *     deploy/postgres/privileges/product-analytics-dashboard-root.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PRODUCT_ANALYTICS_ROOT_DB === '1';
const DATABASE = process.env.PRODUCT_ANALYTICS_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATION = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations',
  '20260822T173000_the_product_analytics_screen_reads_an_aggregate.sql');
const PRIVILEGES = path.join(repoRoot, 'deploy/postgres/generated', `privileges.${DATABASE}.sql`);
const CAPABILITIES = path.join(repoRoot, 'deploy/postgres/generated',
  `port-context-capabilities.${DATABASE}.sql`);
const PAGE_KEY_SOURCE = path.join(repoRoot,
  'apps/webapp/src/modules/product-analytics/productAnalyticsPageKey.ts');

const IDENTITY = 'app.read_product_analytics_dashboard(timestamp with time zone,'
  + 'timestamp with time zone,text,text,text)';
const SEAM_OWNER = 'app_seam_platform_analytics_owner';
const PLATFORM_ROLE = 'app_platform_settings';
const PURPOSE = 'analytics.product-dashboard.read';

const START = '2026-05-01T00:00:00.000Z';
const END = '2026-08-22T21:00:00.000Z';
const IANA = 'Europe/Moscow';
// То же, что строит `platformAudienceJson(..., { excludeStaffRoles: true })` на этом экране.
const AUDIENCE = JSON.stringify({
  excludeStaffRoles: true,
  staffRoles: ['admin', 'doctor'],
  excludedPhones: ['+70000000000'],
  telegramIds: [],
  maxIds: [],
});

/**
 * Правила схлопывания берутся ИЗ ИСХОДНИКА приложения, а не переписываются сюда: копия в тесте
 * разъехалась бы с единственным источником молча, и тест перестал бы доказывать то, ради чего есть.
 */
function pageGroupsJson() {
  const source = fs.readFileSync(PAGE_KEY_SOURCE, 'utf8');
  const prefix = /PRODUCT_ANALYTICS_PAGE_GROUP_SCOPE_PREFIX = '([^']+)'/u.exec(source)?.[1];
  assert.ok(prefix, 'в исходнике нет PRODUCT_ANALYTICS_PAGE_GROUP_SCOPE_PREFIX');
  const block = /PRODUCT_ANALYTICS_PAGE_GROUP_RULES[^=]*=\s*\[([\s\S]*?)\n\] as const;/u
    .exec(source)?.[1];
  assert.ok(block, 'в исходнике нет списка PRODUCT_ANALYTICS_PAGE_GROUP_RULES');
  const rules = [...block.matchAll(
    /\{\s*match:\s*'(exact|prefix)',\s*value:\s*'([^']+)',\s*group:\s*(null|'[^']*')\s*\}/gu,
  )].map(([, match, value, group]) => ({
    match, value, group: group === 'null' ? null : group.slice(1, -1),
  }));
  assert.ok(rules.length >= 10, `правил распознано ${rules.length} — регулярка отстала от исходника`);
  return JSON.stringify({ scopePrefix: prefix, rules });
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

/** Ровно те строки доступа, которые генератор вывел из декларации — не переписанные руками. */
function generatedLine(file, needle, what) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.includes(needle));
  assert.ok(line, `в ${path.basename(file)} нет строки ${what} — артефакт не перегенерирован`);
  return line.trim();
}

function fixture({ withExecuteGrant = true, withSeamPolicies = true } = {}) {
  const migrationSource = fs.readFileSync(MIGRATION, 'utf8');
  const migrationBody = migrationSource.slice(migrationSource.indexOf('CREATE OR REPLACE FUNCTION'));
  const executeGrant = generatedLine(PRIVILEGES,
    `ON FUNCTION ${IDENTITY} TO "${PLATFORM_ROLE}"`, 'EXECUTE-гранта двери');
  const seamGrants = [
    [`GRANT SELECT ("id", "role") ON TABLE "public"."platform_users" TO "${SEAM_OWNER}"`,
      'колоночного гранта platform_users владельцу шва'],
    [`"warmup_slogan_key") ON TABLE "public"."product_analytics_events_recent" TO "${SEAM_OWNER}"`,
      'колоночного гранта product_analytics_events_recent владельцу шва'],
    [`"push_opens", "user_id") ON TABLE "public"."product_analytics_user_hourly" TO "${SEAM_OWNER}"`,
      'колоночного гранта product_analytics_user_hourly владельцу шва'],
    [`ON TABLE "public"."product_push_notifications" TO "${SEAM_OWNER}"`,
      'колоночного гранта product_push_notifications владельцу шва'],
  ].map(([needle, what]) => generatedLine(PRIVILEGES, needle, what));
  // Двух таблиц у этого шва раньше не было вовсе — без пересозданной restrictive-политики
  // владелец не прочитает их даже с колоночным грантом.
  const seamPolicies = [
    ['rev10_named_root_owner_gate_157', 'product_analytics_events_recent'],
    ['rev10_seam_business_157', 'product_analytics_events_recent'],
    ['rev10_named_root_owner_gate_160', 'product_push_notifications'],
    ['rev10_seam_business_160', 'product_push_notifications'],
  ].flatMap(([policy, relation]) => [
    `DROP POLICY IF EXISTS "${policy}" ON "public"."${relation}";`,
    generatedLine(PRIVILEGES, `CREATE POLICY "${policy}" ON "public"."${relation}"`,
      `политики ${policy}`),
  ]);
  const capabilityValues = generatedLine(CAPABILITIES, 'read_product_analytics_dashboard',
    'строки каталога возможностей').replace(/,$/, '');

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
    ...seamGrants,
    ...(withSeamPolicies ? seamPolicies : []),
    'INSERT INTO app_ext.port_context_capabilities (capability_id, port, session_login, target_role,'
      + ` context_class, purpose, function_identity) VALUES ${capabilityValues};`,
  ].join('\n');
}

/** Настоящий путь порта: тот же логин, та же возможность, тот же хеш типизированных аргументов. */
function openPlatformContext(pageGroups) {
  const capabilityLine = generatedLine(CAPABILITIES, 'read_product_analytics_dashboard',
    'строки каталога');
  const capabilityId = /^\('([0-9a-f-]{36})'/u.exec(capabilityLine)?.[1];
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
      ROW('text@1', pg_catalog.textsend($aud$${AUDIENCE}$aud$))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($grp$${pageGroups}$grp$))::app.port_typed_arg]), 'hex');`);

  return [
    `SET LOCAL SESSION AUTHORIZATION ${login};`,
    `SELECT app.begin_port_context('${capabilityId}'::uuid,`
      + ` ROW(1::smallint, 'platform'::app.port_context_class, '${PLATFORM_ROLE}'::name,`
      + ` '${PURPOSE}', '${IDENTITY}'::regprocedure, decode('${argsHash}', 'hex'),`
      + ` '${actorRef}'::uuid, NULL::uuid, NULL::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims);`,
  ].join('\n');
}

function call(pageGroups) {
  return `SELECT app.read_product_analytics_dashboard('${START}'::timestamptz,`
    + ` '${END}'::timestamptz, '${IANA}', $aud$${AUDIENCE}$aud$, $grp$${pageGroups}$grp$);`;
}

/**
 * Оракул: те же величины, посчитанные независимо от суперпользователя. Схлопывание выписано
 * `CASE`-цепочкой намеренно — дверь применяет присланный СПИСОК правил, и совпадение чисел
 * означает, что интерпретатор списка ведёт себя как правила.
 */
const ORACLE = `
WITH excluded AS (
  SELECT pu.id FROM platform_users pu WHERE pu.role IN ('admin', 'doctor')
  UNION
  SELECT pu.id FROM platform_users pu
   WHERE EXISTS (SELECT 1 FROM user_contacts uc
                  WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone'
                    AND uc.value_normalized IN ('+70000000000'))
),
win AS (
  SELECT h.* FROM product_analytics_user_hourly h
   WHERE h.bucket_hour >= '${START}'::timestamptz AND h.bucket_hour < '${END}'::timestamptz
     AND h.user_id NOT IN (SELECT id FROM excluded)
),
act AS (SELECT * FROM win WHERE app_opens + page_views + push_opens + active_minutes > 0),
grp AS (
  SELECT a.user_id,
         CASE
           WHEN btrim(a.page_key) NOT LIKE '/app/patient%' THEN btrim(a.page_key)
           WHEN btrim(a.page_key) LIKE '/app/patient/treatment%' THEN '/app/patient/treatment/program'
           WHEN btrim(a.page_key) = '/app/patient/go/daily-warmup' THEN '/app/patient/warmup'
           WHEN btrim(a.page_key) = '/app/patient/warmup' THEN '/app/patient/warmup'
           WHEN btrim(a.page_key) = '/app/patient/go/plan-start-lesson' THEN '/app/patient/treatment/program'
           WHEN btrim(a.page_key) LIKE '/app/patient/go/%' THEN btrim(a.page_key)
           WHEN btrim(a.page_key) LIKE '/app/patient/booking%' THEN '/app/patient/booking'
           WHEN btrim(a.page_key) LIKE '/app/patient/content/%' THEN '/app/patient/content/page'
           WHEN btrim(a.page_key) LIKE '/app/patient/help/%' THEN '/app/patient/help'
           WHEN btrim(a.page_key) = '/app/patient/help' THEN '/app/patient/help'
           WHEN btrim(a.page_key) LIKE '/app/patient/sections/%' THEN '/app/patient/sections'
           WHEN btrim(a.page_key) = '/app/patient/sections' THEN '/app/patient/sections'
           WHEN btrim(a.page_key) LIKE '/app/patient/memberships/%' THEN '/app/patient/memberships'
           WHEN btrim(a.page_key) LIKE '/app/patient/broadcasts/%' THEN '/app/patient/broadcasts'
           WHEN btrim(a.page_key) LIKE '/app/patient/intake/%' THEN '/app/patient/intake'
           WHEN btrim(a.page_key) LIKE '/app/patient/diary/%' THEN '/app/patient/diary'
           ELSE btrim(a.page_key)
         END AS g
    FROM act a WHERE btrim(a.page_key) <> '__all__' AND a.page_views > 0
)
SELECT (SELECT count(DISTINCT user_id) FROM act)::text
 || '|' || (SELECT COALESCE(sum(active_minutes), 0) FROM win)::text
 || '|' || (SELECT count(DISTINCT user_id) FROM grp WHERE g = '/app/patient/treatment/program')::text
 || '|' || (SELECT count(*) FROM (SELECT DISTINCT g FROM grp) q)::text
 || '|' || (SELECT count(*) FROM product_analytics_events_recent e
             WHERE e.occurred_at >= '${START}'::timestamptz AND e.occurred_at < '${END}'::timestamptz
               AND (e.user_id IS NULL OR e.user_id NOT IN (SELECT id FROM excluded))
               AND e.event_type = 'app_open')::text
 || '|' || (SELECT count(*) FROM product_push_notifications n
             WHERE n.created_at >= '${START}'::timestamptz AND n.created_at < '${END}'::timestamptz
               AND n.user_id NOT IN (SELECT id FROM excluded))::text;`;

const PERSONAL_KEYS = ['userId', 'displayName', 'firstName', 'lastName', 'phone', 'email',
  'lastSeenAt', 'clientActivity', 'channels'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function personalTraces(value, at = '$') {
  if (Array.isArray(value)) return value.flatMap((v, i) => personalTraces(v, `${at}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => {
      const here = `${at}.${key}`;
      return [...(PERSONAL_KEYS.includes(key) ? [here] : []), ...personalTraces(v, here)];
    });
  }
  if (typeof value === 'string' && UUID_RE.test(value.trim())) return [at];
  return [];
}

test('платформенный принципал получает через дверь настоящие числа экрана', { skip: !ENABLED }, () => {
  const groups = pageGroupsJson();
  const snapshot = JSON.parse(
    psql([fixture(), openPlatformContext(groups), call(groups), 'ROLLBACK;'].join('\n')),
  );
  const [uniqueUsers, activeMinutes, treatmentUsers, pageGroupCount, appOpens, pushSent] =
    psql(ORACLE).split('|').map(Number);

  assert.equal(snapshot.userAggregates.uniqueActiveUsers, uniqueUsers);
  assert.equal(snapshot.userAggregates.totalActiveMinutes, activeMinutes);
  assert.equal(snapshot.userAggregates.pageUniqueUsers.length, pageGroupCount);
  assert.equal(
    snapshot.userAggregates.pageUniqueUsers
      .find((r) => r.pageKey === '/app/patient/treatment/program')?.uniqueUsers,
    treatmentUsers,
    'схлопывание ключей в двери разошлось с независимым CASE-оракулом',
  );

  const sumOf = (eventType) => snapshot.hourly
    .filter((r) => r.eventType === eventType)
    .reduce((acc, r) => acc + r.eventCount, 0);
  assert.equal(sumOf('app_open'), appOpens);
  assert.equal(sumOf('push_sent'), pushSent);

  // ЛОВУШКА ПУСТОТЫ: на базе без активности «числа совпали» истинно даром.
  assert.ok(uniqueUsers > 0 && appOpens > 0 && pushSent > 0,
    `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: в окне ${START}..${END} нет ни активных людей, `
    + 'ни заходов, ни отправленных push. Совпадение нулей ничего не значит.');
  assert.ok(snapshot.userAggregates.activeUsersDaily.length > 0,
    'дверь вернула суммы без разбивки по дням — график на экране остался бы пустым');
  assert.ok(snapshot.warmupSloganSamples.length > 0,
    'дверь не вернула ни одного текста слогана — таблица разминок на экране осталась бы пустой');
});

test('в ответе двери нет ни одного человека — ни имени, ни контакта, ни id', { skip: !ENABLED }, () => {
  const groups = pageGroupsJson();
  const snapshot = JSON.parse(
    psql([fixture(), openPlatformContext(groups), call(groups), 'ROLLBACK;'].join('\n')),
  );
  assert.deepEqual(personalTraces(snapshot), [],
    'дверь вернула поле, указывающее на конкретного человека');
});

test('без EXECUTE у платформенной роли дверь отказывает, а не молчит', { skip: !ENABLED }, () => {
  // Инъекция неисправности: единственное, чего лишается сценарий, — грант EXECUTE.
  const groups = pageGroupsJson();
  let refusal = null;
  try {
    psql([fixture({ withExecuteGrant: false }), openPlatformContext(groups), call(groups),
      'ROLLBACK;'].join('\n'));
  } catch (error) {
    refusal = String(error.stderr ?? error.message);
  }
  assert.ok(refusal, 'без EXECUTE вызов обязан упасть — иначе дверь никем не охраняется');
  assert.match(refusal, /permission denied for function read_product_analytics_dashboard/u);
});

test('без пересозданной политики шва тело не читает телеметрию — и это видно', { skip: !ENABLED }, () => {
  // Вторая инъекция: гранты на месте, а restrictive-политика на двух новых для шва таблицах —
  // прежняя. Колоночного гранта мало; если проверка остаётся зелёной, она не доказывает ничего.
  const groups = pageGroupsJson();
  const snapshot = JSON.parse(
    psql([fixture({ withSeamPolicies: false }), openPlatformContext(groups), call(groups),
      'ROLLBACK;'].join('\n')),
  );
  const appOpens = snapshot.hourly
    .filter((r) => r.eventType === 'app_open')
    .reduce((acc, r) => acc + r.eventCount, 0);
  assert.equal(appOpens, 0,
    'события прочитались без политики для владельца шва — значит политика ничего не решает, '
    + 'и проверка её наличия бессмысленна');
});

test('табличных прав платформенной роли дверь не добавляет', { skip: !ENABLED }, () => {
  // §3 брифа, живьём: числа появились, а читать строки людей и телеметрию роли по-прежнему нечем.
  const answer = psql(`${fixture()}
SELECT has_table_privilege('${PLATFORM_ROLE}', 'public.product_analytics_user_hourly', 'SELECT')::text
    || '|' || has_table_privilege('${PLATFORM_ROLE}', 'public.product_analytics_events_recent', 'SELECT')::text
    || '|' || has_table_privilege('${PLATFORM_ROLE}', 'public.product_push_notifications', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.product_analytics_user_hourly', 'user_id', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.platform_users', 'role', 'SELECT')::text
    || '|' || has_column_privilege('${PLATFORM_ROLE}', 'public.platform_users', 'id', 'SELECT')::text;
ROLLBACK;`);
  assert.deepEqual(answer.split('|'),
    ['false', 'false', 'false', 'false', 'false', 'true'],
    'роль экрана получила табличное чтение людей — это противоречит решению владельца Р-АДМИН');
});
