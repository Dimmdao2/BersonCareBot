/**
 * Поведенческое доказательство pre-session дверей входа на именованной DEV-базе.
 * Кандидатные тела, сгенерированные права и capability применяются только внутри транзакции с
 * ROLLBACK; migration runner и `--execute` этот тест не вызывает.
 *
 * Ловит две живые регрессии D15b/6: опознание почты снова пытается читать отношения напрямую либо
 * телефонный вход вызывает preferred-channel root без его exact capability либо
 * профиль пациента вызывает pre-session root. Каждая дверь обязана отказать с чужим
 * контекстом и вернуть тот же продуктовый результат со своим exact-контекстом.
 *
 * Запуск:
 *   RUN_PRESESSION_LOGIN_DOORS_DB=1 node --test \
 *     deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
 *
 * Fault injection нового почтового корня:
 *   RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=email node --test \
 *     deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
 *
 * Fault injection корня default-channel:
 *   RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=default_channel node --test \
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
if (!['', 'email', 'pre_session', 'patient', 'default_channel'].includes(FAULT)) {
  throw new Error(`unknown PRESESSION_LOGIN_DOORS_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const LOGIN_MIGRATION = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260823T002500_pre_session_login_uses_two_named_doors.sql',
);
const DEFAULT_CHANNEL_MIGRATION = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260823T023138_pre_session_default_auth_otp_channel.sql',
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
const PATIENT_CHANNEL_IDENTITY = 'app.get_current_patient_preferred_auth_channel_code()';
const PATIENT_CHANNEL_PURPOSE = 'patient.preferred-auth-channel.read';
const DEFAULT_CHANNEL_IDENTITY = 'app.pre_session_get_default_auth_otp_channel(uuid)';
const DEFAULT_CHANNEL_PURPOSE = 'auth.phone-login.default-channel';
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
    { input: `\\set VERBOSITY verbose\n${sql}`, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim();
}

function generatedLine(file, needle, what) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.includes(needle));
  assert.ok(line, `в ${path.basename(file)} нет ${what}`);
  return line.trim();
}

function candidateBlocks() {
  let source = fs.readFileSync(LOGIN_MIGRATION, 'utf8');
  let defaultChannelSource = fs.readFileSync(DEFAULT_CHANNEL_MIGRATION, 'utf8');
  // The named DEV may already contain the earlier doors. Candidate proof must replace their bodies
  // inside its rollback-only transaction instead of failing before any principal assertion.
  source = source.replaceAll('CREATE FUNCTION ', 'CREATE OR REPLACE FUNCTION ');
  defaultChannelSource = defaultChannelSource.replaceAll(
    'CREATE FUNCTION ',
    'CREATE OR REPLACE FUNCTION ',
  );
  if (FAULT === 'email') {
    const healthy = ') AS has_password\n  FROM public.platform_users AS users';
    const broken = ') AND false AS has_password\n  FROM public.platform_users AS users';
    assert.ok(source.includes(healthy), 'fault injection не нашла выражение has_password');
    source = source.replace(healthy, broken);
  }
  if (FAULT === 'pre_session') {
    const healthy = "'auth.phone-login.preferred-channel', app.hash_port_typed_args";
    const broken = "'auth.phone-login.preferred-channel.broken', app.hash_port_typed_args";
    assert.ok(source.includes(healthy), 'fault injection не нашла pre-session purpose');
    source = source.replace(healthy, broken);
  }
  if (FAULT === 'patient') {
    const healthy = "'patient.preferred-auth-channel.read', app.hash_port_typed_args";
    const broken = "'patient.preferred-auth-channel.read.broken', app.hash_port_typed_args";
    assert.ok(source.includes(healthy), 'fault injection не нашла patient purpose');
    source = source.replace(healthy, broken);
  }
  if (FAULT === 'default_channel') {
    const healthy = "'auth.phone-login.default-channel', app.hash_port_typed_args";
    const broken = "'auth.phone-login.default-channel.broken', app.hash_port_typed_args";
    assert.ok(defaultChannelSource.includes(healthy), 'fault injection не нашла default-channel purpose');
    defaultChannelSource = defaultChannelSource.replace(healthy, broken);
  }
  const blocks = source.split('--> statement-breakpoint');
  assert.equal(blocks.length, 4, 'кандидатная миграция должна содержать четыре owner-секции');
  assert.equal(
    defaultChannelSource.split('--> statement-breakpoint').length,
    1,
    'default-channel миграция должна содержать одну owner-секцию',
  );
  return { blocks, defaultChannelSource };
}

function capabilityValue(identity) {
  return generatedLine(CAPABILITIES, `'${identity}'::regprocedure`, `capability ${identity}`)
    .replace(/,$/u, '');
}

function generatedSetup() {
  const { blocks, defaultChannelSource } = candidateBlocks();
  const [emailBlock, ...identityBlocks] = blocks;
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
    generatedLine(PRIVILEGES,
      `GRANT EXECUTE ON FUNCTION ${PATIENT_CHANNEL_IDENTITY} TO "app_patient"`,
      'EXECUTE patient preferred-channel двери'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("channel_code", "is_preferred_for_auth", "platform_user_id", "user_id") ON TABLE "public"."user_channel_preferences" TO "app_seam_identity_lookup_owner"`,
      'SELECT общему preferred-channel helper'),
    generatedLine(PRIVILEGES,
      `GRANT EXECUTE ON FUNCTION ${DEFAULT_CHANNEL_IDENTITY} TO "app_pre_session"`,
      'EXECUTE default-channel двери'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("confirming_channel", "platform_user_id", "valid_to") ON TABLE "public"."user_phone_history" TO "app_seam_identity_lookup_owner"`,
      'SELECT user_phone_history default-channel двери'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("channel_code", "created_at", "user_id") ON TABLE "public"."user_channel_bindings" TO "app_seam_identity_lookup_owner"`,
      'SELECT user_channel_bindings default-channel двери'),
    generatedLine(PRIVILEGES,
      `GRANT SELECT ("confirmed_at", "contact_kind", "is_primary", "platform_user_id") ON TABLE "public"."user_contacts" TO "app_seam_identity_lookup_owner"`,
      'SELECT user_contacts default-channel двери'),
  ];
  const emailCapability = capabilityValue(EMAIL_IDENTITY);
  const channelCapability = capabilityValue(CHANNEL_IDENTITY);
  const patientChannelCapability = capabilityValue(PATIENT_CHANNEL_IDENTITY);
  const defaultChannelCapability = capabilityValue(DEFAULT_CHANNEL_IDENTITY);

  return `BEGIN;
GRANT CREATE ON SCHEMA app, app_ext TO app_seam_password_auth_owner, app_seam_identity_lookup_owner;
GRANT USAGE ON LANGUAGE plpgsql, sql TO app_seam_password_auth_owner, app_seam_identity_lookup_owner;
SET LOCAL ROLE app_seam_password_auth_owner;
${emailBlock}
RESET ROLE;
SET LOCAL ROLE app_seam_identity_lookup_owner;
${identityBlocks.join('\n')}
${defaultChannelSource}
RESET ROLE;
${grants.join('\n')}
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES
  ${emailCapability},
  ${channelCapability},
  ${patientChannelCapability},
  ${defaultChannelCapability}
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
SELECT id::text, id, 'telegram', true FROM presession_probe_user;
INSERT INTO public.user_phone_history(
  platform_user_id, phone_normalized, source, confirming_channel)
SELECT id, '+799900000d6', 'otp', 'max' FROM presession_probe_user;`;
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

function patientContextFixture() {
  const row = psql(`
WITH candidate AS (
  SELECT patient.id AS patient_id,
         enrollment.organization_id,
         actor_ref.opaque_ref AS actor_ref,
         subject_ref.opaque_ref AS subject_ref
  FROM public.platform_users AS patient
  INNER JOIN public.org_enrollments AS enrollment
    ON enrollment.platform_user_id = patient.id
   AND enrollment.status = 'active'
  INNER JOIN app_ext.variant_a_identity_refs AS actor_ref
    ON actor_ref.physical_user_id = patient.id
   AND actor_ref.ref_kind = 'actor'
  INNER JOIN app_ext.variant_a_identity_refs AS subject_ref
    ON subject_ref.physical_user_id = patient.id
   AND subject_ref.ref_kind = 'subject'
  WHERE patient.role = 'client'
  ORDER BY patient.id
  LIMIT 1
), capability AS (
  SELECT capability_id, session_login
  FROM app_ext.port_context_capabilities
  WHERE context_class = 'patient'::app.port_context_class
    AND target_role = 'app_patient'::name
    AND purpose = 'relation'
    AND function_identity IS NULL
    AND active_until IS NULL
  ORDER BY session_login
  LIMIT 1
)
SELECT candidate.patient_id::text || '|' || candidate.organization_id::text || '|'
       || candidate.actor_ref::text || '|' || candidate.subject_ref::text || '|'
       || capability.capability_id::text || '|' || capability.session_login::text
FROM candidate CROSS JOIN capability;`);
  const parts = row.split('|');
  assert.equal(parts.length, 6, 'DEV needs an enrolled patient and active relation capability');
  return {
    userId: parts[0],
    organizationId: parts[1],
    actorRef: parts[2],
    subjectRef: parts[3],
    capabilityId: parts[4],
    login: parts[5],
  };
}

function openPatientRelationContext(fixture) {
  return `SET LOCAL SESSION AUTHORIZATION ${fixture.login};
SELECT app.begin_port_context(
  '${fixture.capabilityId}'::uuid,
  ROW(
    1::smallint,
    'patient'::app.port_context_class,
    'app_patient'::name,
    'relation',
    NULL::regprocedure,
    decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'),
    '${fixture.actorRef}'::uuid,
    '${fixture.subjectRef}'::uuid,
    '${fixture.organizationId}'::uuid,
    NULL::bigint,
    NULL::uuid
  )::app.port_context_claims
);`;
}

function openPatientNamedContext(fixture) {
  return `SET LOCAL SESSION AUTHORIZATION ${fixture.login};
SELECT app.begin_port_context(
  '${capabilityId(PATIENT_CHANNEL_IDENTITY)}'::uuid,
  ROW(
    1::smallint,
    'patient'::app.port_context_class,
    'app_patient'::name,
    '${PATIENT_CHANNEL_PURPOSE}',
    '${PATIENT_CHANNEL_IDENTITY}'::regprocedure,
    decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'),
    '${fixture.actorRef}'::uuid,
    '${fixture.subjectRef}'::uuid,
    '${fixture.organizationId}'::uuid,
    NULL::bigint,
    NULL::uuid
  )::app.port_context_claims
);`;
}

function withoutContext(identity, callSql) {
  const login = loginFromCapability(identity);
  const targetRole = identity === PATIENT_CHANNEL_IDENTITY ? 'app_patient' : 'app_pre_session';
  try {
    psql(`${generatedSetup()}
SET LOCAL SESSION AUTHORIZATION ${login};
SET LOCAL ROLE ${targetRole};
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

test('pre-session preferred-channel дверь отказывает с принятым patient-контекстом',
  { skip: !ENABLED, concurrency: false }, () => {
    const patient = patientContextFixture();
    assert.throws(
      () => psql(`${generatedSetup()}
${openPatientRelationContext(patient)}
SELECT app.get_preferred_auth_channel_code('${patient.userId}'::uuid);
ROLLBACK;`),
      /accepted port context required/u,
    );
  });

test('patient preferred-channel дверь отказывает без своего exact-контекста',
  { skip: !ENABLED, concurrency: false }, () => {
    withoutContext(PATIENT_CHANNEL_IDENTITY,
      'SELECT app.get_current_patient_preferred_auth_channel_code();');
  });

test('patient preferred-channel дверь с exact context возвращает канал самого пациента',
  { skip: !ENABLED, concurrency: false }, () => {
    const patient = patientContextFixture();
    const out = psql(`${generatedSetup()}
INSERT INTO public.user_channel_preferences(
  user_id, platform_user_id, channel_code, is_preferred_for_auth)
VALUES ('${patient.userId}', '${patient.userId}'::uuid, 'max', true)
ON CONFLICT (user_id, channel_code) DO UPDATE SET
  platform_user_id = EXCLUDED.platform_user_id,
  is_preferred_for_auth = true;
${openPatientNamedContext(patient)}
SELECT app.get_current_patient_preferred_auth_channel_code();
ROLLBACK;`);
    assert.equal(out, 'max');
  });

test('default-channel дверь с exact pre-session context возвращает канал текущего телефона',
  { skip: !ENABLED, concurrency: false }, () => {
    const out = psql(`${generatedSetup()}
${openContext(
    DEFAULT_CHANNEL_IDENTITY,
    DEFAULT_CHANNEL_PURPOSE,
    `ARRAY[ROW('uuid@1', pg_catalog.uuid_send('${USER_ID}'::uuid))::app.port_typed_arg]`,
  )}
SELECT app.pre_session_get_default_auth_otp_channel('${USER_ID}'::uuid);
ROLLBACK;`);
    assert.equal(out, 'max');
  });

test('default-channel дверь отказывает 42501 с принятым patient-контекстом',
  { skip: !ENABLED, concurrency: false }, () => {
    const patient = patientContextFixture();
    assert.throws(
      () => psql(`${generatedSetup()}
${openPatientRelationContext(patient)}
SELECT app.pre_session_get_default_auth_otp_channel('${patient.userId}'::uuid);
ROLLBACK;`),
      /42501/u,
    );
  });
