/**
 * Живое доказательство двери `app.platform_support_account_action` на именованной DEV-базе. Opt-in:
 * без `RUN_PLATFORM_SUPPORT_ACCOUNT_ACTION_DB=1` файл пропускается и в CI в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): экран поддержки платформы (`/api/doctor/clients/support-account`)
 * снова отдаёт 500 на КАЖДЫЙ вызов, либо глобальная блокировка перестаёт разлогинивать активные
 * сессии, либо разблокировка тихо оживляет старую cookie.
 *
 * Почему офлайн-проверок не хватает. Пайплайн сверяет «объявлено == лежит в базе» и молчит о том,
 * ДОСТАТОЧНО ли объявленного (AGENTS §1). До этой ветки `app_platform_settings` не имел НИ ОДНОГО
 * гранта на `platform_users`/`user_contacts`/`user_channel_bindings` — маршрут падал `42501` на
 * первом же живом вызове, зелёным проходя миграцию, reconcile и деплой.
 *
 * Оракул здесь — не число, а ИНВАРИАНТ `session_epoch`, дословно записанный владельцем
 * (`docs/OWNER_DECISIONS.md`, «Blocked — глобальная блокировка учётки», «Действующая сессия должна
 * перестать давать доступ», 25.08): epoch поднимается РОВНО на переходе «не заблокирован → заблокирован»
 * и никогда не опускается и не поднимается второй раз на уже заблокированном — иначе либо cookie,
 * выданная до блокировки, снова проходит проверку равенства эпох в `modules/auth/service.ts` после
 * разблокировки, либо повторная блокировка зря разлогинивает уже отрезанного человека второй раз.
 *
 * Один вызов двери — один принятый контекст: `app_ext.accepted_port_contexts` несёт ровно одну
 * строку на транзакцию (первичный ключ «база+backend+транзакция»), поэтому у каждого свойства —
 * своя транзакция с ROLLBACK, а не цепочка вызовов внутри одной.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_PLATFORM_SUPPORT_ACCOUNT_ACTION_DB=1 node --test \
 *     deploy/postgres/privileges/platform-support-account-action.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PLATFORM_SUPPORT_ACCOUNT_ACTION_DB === '1';
const DATABASE = process.env.PLATFORM_SUPPORT_ACCOUNT_ACTION_PROOF_DB ?? 'bcb_webapp_dev';

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

const IDENTITY =
  'app.platform_support_account_action(text,uuid,uuid,boolean,text,text,text,text,text)';
const SEAM_OWNER = 'app_seam_identity_lookup_owner';
const PLATFORM_ROLE = 'app_platform_settings';
const PURPOSE = 'platform.support-account.action';
const FIXTURE_CAPABILITY_ID = '00000000-0000-4000-8000-0000000000fc';

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

/** Ровно те строки доступа, которые генератор вывел из декларации — не переписанные руками. */
function generatedLine(file, needle, what) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.includes(needle));
  assert.ok(line, `в ${path.basename(file)} нет строки ${what} — артефакт не перегенерирован`);
  return line.trim();
}

/** Тело ПЕРВОЙ функции миграции (до первого `--> statement-breakpoint`). */
function firstFunctionBody() {
  const text = fs.readFileSync(MIGRATION, 'utf8');
  const start = text.indexOf('CREATE OR REPLACE FUNCTION');
  const end = text.indexOf('--> statement-breakpoint');
  assert.ok(start > -1 && end > start, 'первая функция миграции не найдена — файл переименован?');
  return text.slice(start, end);
}

function fixture({ withExecuteGrant = true } = {}) {
  const executeGrant = generatedLine(PRIVILEGES,
    `ON FUNCTION ${IDENTITY} TO "${PLATFORM_ROLE}"`, 'EXECUTE-гранта двери');
  const platformUsersUpdate = generatedLine(PRIVILEGES,
    'GRANT UPDATE ("blocked_at", "blocked_by", "blocked_reason", "id", "is_blocked", "session_epoch",'
      + ` "updated_at") ON TABLE "public"."platform_users" TO "${SEAM_OWNER}"`,
    'колоночного UPDATE-гранта platform_users владельцу шва');
  const contactsDelete = generatedLine(PRIVILEGES,
    `GRANT DELETE ON TABLE "public"."user_contacts" TO "${SEAM_OWNER}"`,
    'DELETE-гранта user_contacts владельцу шва');
  const contactsSelect = generatedLine(PRIVILEGES,
    'GRANT SELECT ("contact_kind", "platform_user_id", "value_normalized") ON TABLE'
      + ` "public"."user_contacts" TO "${SEAM_OWNER}"`,
    'колоночного SELECT-гранта user_contacts владельцу шва');
  const bindingsDelete = generatedLine(PRIVILEGES,
    `GRANT DELETE ON TABLE "public"."user_channel_bindings" TO "${SEAM_OWNER}"`,
    'DELETE-гранта user_channel_bindings владельцу шва');
  const bindingsSelect = generatedLine(PRIVILEGES,
    'GRANT SELECT ("channel_code", "external_id", "user_id") ON TABLE'
      + ` "public"."user_channel_bindings" TO "${SEAM_OWNER}"`,
    'колоночного SELECT-гранта user_channel_bindings владельцу шва');
  const capabilityValues = generatedLine(CAPABILITIES, 'platform_support_account_action',
    'строки каталога возможностей').replace(/,$/, '');

  return [
    'BEGIN;',
    // Мигратор даёт владельцу шва ровно это на время своего statement и снимает после; здесь то же
    // самое делает транзакция, которая всё равно откатится.
    `GRANT CREATE ON SCHEMA app TO ${SEAM_OWNER};`,
    `GRANT USAGE ON LANGUAGE plpgsql TO ${SEAM_OWNER};`,
    `SET LOCAL ROLE ${SEAM_OWNER};`,
    firstFunctionBody(),
    'RESET ROLE;',
    ...(withExecuteGrant ? [executeGrant] : []),
    platformUsersUpdate, contactsDelete, contactsSelect, bindingsDelete, bindingsSelect,
    'INSERT INTO app_ext.port_context_capabilities (capability_id, port, session_login, target_role,'
      + ` context_class, purpose, function_identity) VALUES ${capabilityValues};`,
  ].join('\n');
}

// Тег типа ОБЯЗАН присутствовать даже для NULL-аргумента — `app.hash_port_typed_args` отвергает
// строку с пустым тегом («invalid port typed arg tag»); NULL допустим только как ЗНАЧЕНИЕ внутри
// строки, ровно как это делает тело двери через `pg_catalog.textsend(p_reason)` при NULL-аргументе.
function textArg(value) {
  return value === null
    ? "ROW('text@1', pg_catalog.textsend(NULL::text))::app.port_typed_arg"
    : `ROW('text@1', pg_catalog.textsend('${value}'))::app.port_typed_arg`;
}
function uuidArg(value) {
  return `ROW('uuid@1', pg_catalog.uuid_send('${value}'::uuid))::app.port_typed_arg`;
}
function boolArg(value) {
  return value === null
    ? "ROW('boolean@1', pg_catalog.boolsend(NULL::boolean))::app.port_typed_arg"
    : `ROW('boolean@1', pg_catalog.boolsend(${value}))::app.port_typed_arg`;
}

/** Тот же порядок и та же типизация девяти аргументов, что и в теле двери. */
function typedArgsSql(a) {
  return `ARRAY[${[
    textArg(a.action), uuidArg(a.userId), uuidArg(a.actorId), boolArg(a.blocked), textArg(a.reason),
    textArg(a.contactKind), textArg(a.valueNormalized), textArg(a.channelCode), textArg(a.externalId),
  ].join(', ')}]`;
}

function castedArg(value, cast) {
  if (value === null || value === undefined) return `NULL::${cast}`;
  if (cast === 'boolean') return value ? 'true' : 'false';
  return `'${value}'::${cast}`;
}

function call(a) {
  return `app.platform_support_account_action(${castedArg(a.action, 'text')},`
    + ` ${castedArg(a.userId, 'uuid')}, ${castedArg(a.actorId, 'uuid')}, ${castedArg(a.blocked, 'boolean')},`
    + ` ${castedArg(a.reason, 'text')}, ${castedArg(a.contactKind, 'text')},`
    + ` ${castedArg(a.valueNormalized, 'text')}, ${castedArg(a.channelCode, 'text')},`
    + ` ${castedArg(a.externalId, 'text')})`;
}

/**
 * Принимает тот же контекст, который порт уже проверил бы до входа в дверь. DEV-proof проверяет
 * правило самой двери, поэтому, как соседние DB-proofs, переснимает объявленную capability под
 * admin socket и кладёт принятую строку напрямую. Так тест не зависит от клиентского mTLS и не
 * пытается повторно пройти identity-seam, который имеет собственные доказательства.
 */
function openPlatformContext(a) {
  const actorRef = psql(`SELECT r.opaque_ref::text FROM app_ext.variant_a_identity_refs r
      JOIN public.platform_users u ON u.id = r.physical_user_id
     WHERE u.role = 'admin' AND r.ref_kind = 'actor' ORDER BY u.created_at LIMIT 1;`);
  assert.match(actorRef, /^[0-9a-f-]{36}$/u,
    `на базе ${DATABASE} нет ни одного глобального админа с Variant-A ссылкой — доказывать нечем`);

  return [
    `INSERT INTO app_ext.port_context_capabilities (capability_id, port, session_login, target_role,`
      + ` context_class, purpose, function_identity)`,
    `SELECT '${FIXTURE_CAPABILITY_ID}'::uuid, c.port, session_user, c.target_role, c.context_class,`
      + ` c.purpose, c.function_identity FROM app_ext.port_context_capabilities c`,
    ` WHERE c.purpose = '${PURPOSE}' AND c.function_identity = '${IDENTITY}'::regprocedure LIMIT 1;`,
    `INSERT INTO app_ext.accepted_port_contexts (database_oid, backend_pid, transaction_id,`
      + ` capability_id, session_login, port, target_role, context_class, purpose, function_identity,`
      + ` typed_args_hash, actor_ref)`,
    `SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login, c.port,`
      + ` c.target_role, c.context_class, c.purpose, c.function_identity,`
      + ` app.hash_port_typed_args(${typedArgsSql(a)}), '${actorRef}'::uuid`,
    ` FROM pg_database d, app_ext.port_context_capabilities c WHERE d.datname = current_database()`
      + ` AND c.capability_id = '${FIXTURE_CAPABILITY_ID}'::uuid;`,
    `SET LOCAL ROLE ${PLATFORM_ROLE};`,
  ].join('\n');
}

const ANY_USER_ID = () => psql('SELECT id::text FROM public.platform_users ORDER BY created_at LIMIT 1;');

const NULL_REVOKE_FIELDS = { contactKind: null, valueNormalized: null, channelCode: null, externalId: null };

test('первая блокировка поднимает session_epoch ровно на 1 и проставляет метаданные',
  { skip: !ENABLED }, () => {
    const userId = ANY_USER_ID();
    assert.match(userId, /^[0-9a-f-]{36}$/u, `на базе ${DATABASE} нет ни одного platform_users — доказывать нечем`);
    const args = { action: 'set_blocked', userId, actorId: userId, blocked: true, reason: 'proof-block',
      ...NULL_REVOKE_FIELDS };

    const result = lastLine(psql(`
${fixture()}
UPDATE public.platform_users SET is_blocked = false, session_epoch = 10, blocked_at = NULL,
  blocked_reason = NULL, blocked_by = NULL WHERE id = '${userId}'::uuid;
${openPlatformContext(args)}
SELECT ${call(args)};
RESET ROLE;
SELECT is_blocked::text || '|' || session_epoch::text || '|' || (blocked_at IS NOT NULL)::text
       || '|' || blocked_reason || '|' || (blocked_by = '${userId}'::uuid)::text
  FROM public.platform_users WHERE id = '${userId}'::uuid;
ROLLBACK;`));

    assert.equal(result, 'true|11|true|proof-block|true',
      `блокировка не подняла epoch на 1 или не проставила метаданные: ${result}`);
  });

test('повторная блокировка уже заблокированного не поднимает epoch второй раз',
  { skip: !ENABLED }, () => {
    const userId = ANY_USER_ID();
    assert.match(userId, /^[0-9a-f-]{36}$/u, `на базе ${DATABASE} нет ни одного platform_users — доказывать нечем`);
    const args = { action: 'set_blocked', userId, actorId: userId, blocked: true, reason: 'proof-reblock',
      ...NULL_REVOKE_FIELDS };

    const result = lastLine(psql(`
${fixture()}
UPDATE public.platform_users SET is_blocked = true, session_epoch = 10, blocked_at = now(),
  blocked_reason = 'already blocked', blocked_by = '${userId}'::uuid WHERE id = '${userId}'::uuid;
${openPlatformContext(args)}
SELECT ${call(args)};
RESET ROLE;
SELECT is_blocked::text || '|' || session_epoch::text
  FROM public.platform_users WHERE id = '${userId}'::uuid;
ROLLBACK;`));

    assert.equal(result, 'true|10',
      `повторная блокировка уже заблокированного account подняла epoch второй раз: ${result}`);
  });

test('разблокировка не трогает session_epoch — старая cookie не оживает',
  { skip: !ENABLED }, () => {
    const userId = ANY_USER_ID();
    assert.match(userId, /^[0-9a-f-]{36}$/u, `на базе ${DATABASE} нет ни одного platform_users — доказывать нечем`);
    const args = { action: 'set_blocked', userId, actorId: userId, blocked: false, reason: null,
      ...NULL_REVOKE_FIELDS };

    const result = lastLine(psql(`
${fixture()}
UPDATE public.platform_users SET is_blocked = true, session_epoch = 10, blocked_at = now(),
  blocked_reason = 'review', blocked_by = '${userId}'::uuid WHERE id = '${userId}'::uuid;
${openPlatformContext(args)}
SELECT ${call(args)};
RESET ROLE;
SELECT is_blocked::text || '|' || session_epoch::text || '|' || (blocked_at IS NULL)::text
       || '|' || (blocked_reason IS NULL)::text || '|' || (blocked_by IS NULL)::text
  FROM public.platform_users WHERE id = '${userId}'::uuid;
ROLLBACK;`));

    // ГЛАВНОЕ свойство теста: epoch остался «10», тем же числом, что был у заблокированного —
    // разблокировка не подняла и не понизила его, поэтому cookie, выданная ДО блокировки, с более
    // низким epoch, остаётся отвергнутой навсегда, как того требует владелец.
    assert.equal(result, 'false|10|true|true|true',
      `разблокировка изменила epoch или не сняла метаданные блокировки: ${result}`);
  });

test('revoke_contact удаляет ровно совпавшую запись контакта и не трогает остальные',
  { skip: !ENABLED }, () => {
    const userId = ANY_USER_ID();
    assert.match(userId, /^[0-9a-f-]{36}$/u, `на базе ${DATABASE} нет ни одного platform_users — доказывать нечем`);
    const args = { action: 'revoke_contact', userId, actorId: userId, blocked: null, reason: null,
      contactKind: 'phone', valueNormalized: '+70009990001', channelCode: null, externalId: null };

    const result = lastLine(psql(`
${fixture()}
INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, value_normalized, is_primary, source_origin, updated_at)
VALUES ('${userId}'::uuid, 'phone', '+70009990001', false, 'direct', now()),
       ('${userId}'::uuid, 'phone', '+70009990002', false, 'direct', now());
${openPlatformContext(args)}
SELECT ${call(args)};
RESET ROLE;
SELECT COALESCE(string_agg(value_normalized, ',' ORDER BY value_normalized), '<empty>')
  FROM public.user_contacts WHERE platform_user_id = '${userId}'::uuid
   AND value_normalized IN ('+70009990001', '+70009990002');
ROLLBACK;`));

    assert.equal(result, '+70009990002',
      `дверь удалила не ровно ту запись контакта или задела соседнюю: осталось «${result}»`);
  });

test('revoke_channel_binding удаляет ровно совпавшую привязку канала и не трогает остальные',
  { skip: !ENABLED }, () => {
    const userId = ANY_USER_ID();
    assert.match(userId, /^[0-9a-f-]{36}$/u, `на базе ${DATABASE} нет ни одного platform_users — доказывать нечем`);
    const args = { action: 'revoke_channel_binding', userId, actorId: userId, blocked: null, reason: null,
      contactKind: null, valueNormalized: null, channelCode: 'telegram', externalId: 'proof-ext-1' };

    const result = lastLine(psql(`
${fixture()}
INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
VALUES ('${userId}'::uuid, 'telegram', 'proof-ext-1'),
       ('${userId}'::uuid, 'telegram', 'proof-ext-2');
${openPlatformContext(args)}
SELECT ${call(args)};
RESET ROLE;
SELECT COALESCE(string_agg(external_id, ',' ORDER BY external_id), '<empty>')
  FROM public.user_channel_bindings WHERE user_id = '${userId}'::uuid
   AND external_id IN ('proof-ext-1', 'proof-ext-2');
ROLLBACK;`));

    assert.equal(result, 'proof-ext-2',
      `дверь удалила не ровно ту привязку или задела соседнюю: осталось «${result}»`);
  });

test('без EXECUTE у платформенной роли дверь отказывает 42501, а не молчит', { skip: !ENABLED }, () => {
  const userId = ANY_USER_ID();
  const args = { action: 'set_blocked', userId, actorId: userId, blocked: true, reason: 'proof',
    ...NULL_REVOKE_FIELDS };

  let refusal = null;
  try {
    psql(`
${fixture({ withExecuteGrant: false })}
${openPlatformContext(args)}
SELECT ${call(args)};
ROLLBACK;`);
  } catch (error) {
    refusal = String(error.stderr ?? error.message);
  }
  assert.ok(refusal, 'без EXECUTE вызов обязан упасть — иначе дверь никем не охраняется');
  assert.match(refusal, /permission denied for function platform_support_account_action/u);
});

test('без принятого контекста дверь отказывает 42501, даже с EXECUTE и правами владельца шва',
  { skip: !ENABLED }, () => {
    const userId = ANY_USER_ID();
    const args = { action: 'set_blocked', userId, actorId: userId, blocked: true, reason: 'proof',
      ...NULL_REVOKE_FIELDS };

    // Никакого begin_port_context — вызов идёт напрямую под ролью платформы, минуя порт целиком.
    // Прямой SELECT, не DO-блок: у `app_platform_settings` нет USAGE ON LANGUAGE plpgsql (и не должно
    // быть — вызов SECURITY DEFINER функции его не требует), а анонимный DO-блок потребовал бы.
    let refusal = null;
    try {
      psql(`
${fixture()}
SET LOCAL ROLE ${PLATFORM_ROLE};
SELECT ${call(args)};
ROLLBACK;`);
    } catch (error) {
      refusal = String(error.stderr ?? error.message);
    }
    assert.ok(refusal, 'вызов без принятого контекста обязан упасть — иначе дверь не охраняет себя изнутри');
    assert.match(refusal, /ERROR:\s+accepted port context required/u,
      `вызов без принятого контекста прошёл или отказал не той причиной: ${refusal}`);
  });
