/**
 * Поведенческое доказательство двух pre-session дверей на именованной DEV-базе.
 * Кандидатные тела, сгенерированные права и capability применяются только внутри транзакции с
 * ROLLBACK; migration runner и `--execute` этот тест не вызывает.
 *
 * Ловит две живые регрессии D15b/6: опознание почты снова пытается читать отношения напрямую либо
 * телефонный вход вызывает preferred-channel root без его exact capability. Каждая дверь обязана
 * отказать без принятого контекста и вернуть продуктовый результат с точным контекстом.
 *
 * Запуск:
 *   RUN_PRESESSION_LOGIN_DOORS_DB=1 node --test \
 *     deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
 *
 * Fault injection нового почтового корня:
 *   RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=email node --test \
 *     deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_PRESESSION_LOGIN_DOORS_DB === '1';
const DATABASE = process.env.PRESESSION_LOGIN_DOORS_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.PRESESSION_LOGIN_DOORS_FAULT ?? '';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (FAULT !== '' && FAULT !== 'email') {
  throw new Error(`unknown PRESESSION_LOGIN_DOORS_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATION = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260823T002500_pre_session_login_uses_two_named_doors.sql',
);
const PRIVILEGES = path.join(repoRoot, 'deploy/postgres/generated', `privileges.${DATABASE}.sql`);
const CAPABILITIES = path.join(
  repoRoot,
  'deploy/postgres/generated',
  `port-context-capabilities.${DATABASE}.sql`,
);

const EMAIL_IDENTITY = 'app.pre_session_load_email_auth_state(text)';
const EMAIL_PURPOSE = 'auth.email-password.account-state';
const CHANNEL_IDENTITY = 'app.get_preferred_auth_channel_code(uuid)';
const CHANNEL_PURPOSE = 'auth.phone-login.preferred-channel';
const EMAIL = 'presession-login-door-proof@example.test';
const USER_ID = '00000000-0000-4000-8000-0000000000d6';

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim();
}

function generatedLine(file, needle, what) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.includes(needle));
  assert.ok(line, `в ${path.basename(file)} нет ${what}`);
  return line.trim();
}

function candidateBlocks() {
  let source = fs.readFileSync(MIGRATION, 'utf8');
  if (FAULT === 'email') {
    const healthy = ') AS has_password\n  FROM public.platform_users AS users';
    const broken = ') AND false AS has_password\n  FROM public.platform_users AS users';
    assert.ok(source.includes(healthy), 'fault injection не нашла выражение has_password');
    source = source.replace(healthy, broken);
  }
  const blocks = source.split('--> statement-breakpoint');
  assert.equal(blocks.length, 2, 'кандидатная миграция должна содержать две owner-секции');
  return blocks;
}

function capabilityValue(identity) {
  return generatedLine(CAPABILITIES, `'${identity}'::regprocedure`, `capability ${identity}`)
    .replace(/,$/u, '');
}

function generatedSetup() {
  const [emailBlock, channelBlock] = candidateBlocks();
  const grants = [
    generatedLine(PRIVILEGES,
      `GRANT EXECUTE ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text)`,
      'EXECUTE делегата почтовому seam-owner'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("id", "merged_into_id") ON TABLE "public"."platform_users" TO "app_seam_password_auth_owner"`,
      'SELECT platform_users почтовому seam-owner'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("confirmed_at", "contact_kind", "is_primary", "platform_user_id") ON TABLE "public"."user_contacts" TO "app_seam_password_auth_owner"`,
      'SELECT user_contacts почтовому seam-owner'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("user_id") ON TABLE "public"."user_password_credentials" TO "app_seam_password_auth_owner"`,
      'SELECT user_password_credentials почтовому seam-owner'),
    generatedLine(PRIVILEGES,
      `GRANT EXECUTE ON FUNCTION ${EMAIL_IDENTITY} TO "app_pre_session"`,
      'EXECUTE почтовой двери'),
    generatedLine(PRIVILEGES,
      `GRANT EXECUTE ON FUNCTION ${CHANNEL_IDENTITY}`,
      'EXECUTE preferred-channel двери'),
  ];
  const emailCapability = capabilityValue(EMAIL_IDENTITY);
  const channelCapability = capabilityValue(CHANNEL_IDENTITY);

  return `BEGIN;
GRANT CREATE ON SCHEMA app TO app_seam_password_auth_owner, app_seam_identity_lookup_owner;
GRANT USAGE ON LANGUAGE plpgsql TO app_seam_password_auth_owner, app_seam_identity_lookup_owner;
SET LOCAL ROLE app_seam_password_auth_owner;
${emailBlock}
RESET ROLE;
SET LOCAL ROLE app_seam_identity_lookup_owner;
${channelBlock}
RESET ROLE;
${grants.join('\n')}
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES
  ${emailCapability},
  ${channelCapability}
ON CONFLICT (capability_id) DO UPDATE SET
  port = EXCLUDED.port,
  session_login = EXCLUDED.session_login,
  target_role = EXCLUDED.target_role,
  context_class = EXCLUDED.context_class,
  purpose = EXCLUDED.purpose,
  function_identity = EXCLUDED.function_identity,
  active_from = clock_timestamp(),
  active_until = NULL;
CREATE TEMP TABLE presession_probe_user(id uuid NOT NULL);
WITH created AS (
  INSERT INTO public.platform_users(id, display_name, role)
  VALUES ('${USER_ID}'::uuid, 'pre-session login door proof', 'client')
  RETURNING id
)
INSERT INTO presession_probe_user SELECT id FROM created;
INSERT INTO public.user_contacts(
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin)
SELECT id, 'email', '${EMAIL}', false, now(), 'direct'
FROM presession_probe_user;
INSERT INTO public.user_password_credentials(user_id, password_hash)
SELECT id, 'argon2-proof-hash' FROM presession_probe_user;
INSERT INTO public.user_channel_preferences(
  user_id, platform_user_id, channel_code, is_preferred_for_auth)
SELECT id::text, id, 'telegram', true FROM presession_probe_user;`;
}

function loginFromCapability(identity) {
  const line = capabilityValue(identity);
  const login = /'(bcb_[a-z0-9_]+)'::name/u.exec(line)?.[1];
  assert.ok(login, `capability ${identity} не содержит login`);
  return login;
}

function capabilityId(identity) {
  const id = /^\('([0-9a-f-]{36})'/u.exec(capabilityValue(identity))?.[1];
  assert.ok(id, `capability ${identity} не содержит capability_id`);
  return id;
}

function openContext(identity, purpose, typedArgsSql) {
  const login = loginFromCapability(identity);
  const argsHash = psql(
    `SELECT encode(app.hash_port_typed_args(${typedArgsSql}), 'hex');`,
  );
  assert.match(argsHash, /^[0-9a-f]{64}$/u, `не получен typed_args_hash для ${identity}`);
  return `SET LOCAL SESSION AUTHORIZATION ${login};
SELECT app.begin_port_context(
  '${capabilityId(identity)}'::uuid,
  ROW(
    1::smallint,
    'pre_session'::app.port_context_class,
    'app_pre_session'::name,
    '${purpose}',
    '${identity}'::regprocedure,
    decode('${argsHash}', 'hex'),
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::bigint,
    gen_random_uuid()
  )::app.port_context_claims
);`;
}

function withoutContext(identity, callSql) {
  const login = loginFromCapability(identity);
  try {
    psql(`${generatedSetup()}
SET LOCAL SESSION AUTHORIZATION ${login};
SET LOCAL ROLE app_pre_session;
${callSql}
ROLLBACK;`);
  } catch (error) {
    const diagnostic = `${error?.stderr ?? ''}${error?.message ?? ''}`;
    assert.match(diagnostic, /accepted port context required/u);
    return;
  }
  assert.fail(`${identity} исполнилась без принятого контекста`);
}

test('почтовая дверь отказывает без принятого контекста',
  { skip: !ENABLED, concurrency: false }, () => {
  withoutContext(EMAIL_IDENTITY,
    `SELECT * FROM app.pre_session_load_email_auth_state('${EMAIL}');`);
});

test('почтовая дверь с exact context возвращает id, email_verified и has_password',
  { skip: !ENABLED, concurrency: false }, () => {
    const out = psql(`${generatedSetup()}
${openContext(
    EMAIL_IDENTITY,
    EMAIL_PURPOSE,
    `ARRAY[ROW('text@1', pg_catalog.textsend('${EMAIL}'))::app.port_typed_arg]`,
  )}
SELECT state.id::text || '|' || state.email_verified::text || '|' || state.has_password::text
FROM app.pre_session_load_email_auth_state('${EMAIL}') AS state;
ROLLBACK;`);
    assert.equal(out, `${USER_ID}|true|true`);
  });

test('preferred-channel дверь отказывает без принятого контекста',
  { skip: !ENABLED, concurrency: false }, () => {
  withoutContext(CHANNEL_IDENTITY,
    `SELECT app.get_preferred_auth_channel_code('${USER_ID}'::uuid);`);
});

test('preferred-channel дверь с exact context возвращает настроенный канал',
  { skip: !ENABLED, concurrency: false }, () => {
    const out = psql(`${generatedSetup()}
${openContext(
    CHANNEL_IDENTITY,
    CHANNEL_PURPOSE,
    `ARRAY[ROW('uuid@1', pg_catalog.uuid_send('${USER_ID}'::uuid))::app.port_typed_arg]`,
  )}
SELECT app.get_preferred_auth_channel_code('${USER_ID}'::uuid);
ROLLBACK;`);
    assert.equal(out, 'telegram');
  });
