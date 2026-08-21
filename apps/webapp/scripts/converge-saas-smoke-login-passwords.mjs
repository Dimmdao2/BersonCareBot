#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import argon2 from 'argon2';
import pg from 'pg';
import { readSmokeLoginPacket } from '../../../deploy/host/smoke-login-packet.mjs';

const { Client } = pg;
const REQUIRED_DATABASE = 'bersoncarebot_test';
const REQUIRED_DB_USER = 'postgres';
const REQUIRED_ACTORS = Object.freeze(['doctor', 'global_admin', 'patient']);
const ACTOR_SPECS = Object.freeze({
  doctor: Object.freeze({
    emailKey: 'SAAS_SMOKE_DOCTOR_EMAIL',
    passwordKey: 'SAAS_SMOKE_DOCTOR_PASSWORD',
    platformRole: 'doctor',
    requiresClinicOwnerMembership: true,
  }),
  global_admin: Object.freeze({
    emailKey: 'SAAS_SMOKE_GLOBAL_ADMIN_EMAIL',
    passwordKey: 'SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD',
    platformRole: 'admin',
    requiresClinicOwnerMembership: false,
  }),
  patient: Object.freeze({
    emailKey: 'SAAS_SMOKE_PATIENT_EMAIL',
    passwordKey: 'SAAS_SMOKE_PATIENT_PASSWORD',
    platformRole: 'client',
    requiresClinicOwnerMembership: false,
    fallbackPhone: '+79189000782',
  }),
});
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const ACCOUNT_FAILURE_SCOPE = 'auth.password_account_failure';
const IDENTIFIER_FAILURE_SCOPE = 'auth.password_identifier_failure';
const IDENTIFIER_LOCK_SCOPE = 'auth.password_identifier_lock';

function fail(code) {
  throw new Error(code);
}

function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail('invalid_email');
  return email;
}

function validatePassword(value) {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    fail('invalid_password_length');
  }
  return value;
}

export function smokeLoginAccountsFromPacket(packet) {
  const accounts = REQUIRED_ACTORS.map((actor) => {
    const spec = ACTOR_SPECS[actor];
    return Object.freeze({
      actor,
      email: normalizeEmail(packet[spec.emailKey]),
      password: validatePassword(packet[spec.passwordKey]),
    });
  });
  if (new Set(accounts.map(({ email }) => email)).size !== accounts.length) {
    fail('duplicate_actor_email');
  }
  return Object.freeze(accounts);
}

export function passwordIdentifierRateLimitKey(emailNormalized) {
  const digest = createHash('sha256').update(emailNormalized).digest('hex');
  return `password-email:v1:${digest}`;
}

export async function hashSmokeLoginPassword(plainPassword) {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifySmokeLoginPassword(passwordHash, plainPassword) {
  return argon2.verify(passwordHash, plainPassword);
}

export function assertSmokeLoginAccountFact(actor, fact) {
  const spec = ACTOR_SPECS[actor];
  if (!spec || !fact) fail('account_not_ready');
  if (fact.role !== spec.platformRole) fail('account_role_mismatch');
  if (fact.email_verified !== true) fail('account_email_not_verified');
  if (fact.is_blocked === true) fail('account_blocked');
  if (
    spec.requiresClinicOwnerMembership &&
    (Number(fact.active_memberships) !== 1 ||
      Number(fact.owner_memberships) !== 1 ||
      Number(fact.owner_specialist_memberships) !== 1)
  ) {
    fail('doctor_membership_shape_mismatch');
  }
}

function validateAccountsInput(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.accounts)
  ) {
    fail('invalid_input');
  }
  if (value.accounts.length !== REQUIRED_ACTORS.length) fail('invalid_actor_count');
  const byActor = new Map();
  for (const candidate of value.accounts) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      fail('invalid_actor');
    if (!REQUIRED_ACTORS.includes(candidate.actor) || byActor.has(candidate.actor))
      fail('invalid_actor');
    byActor.set(
      candidate.actor,
      Object.freeze({
        actor: candidate.actor,
        email: normalizeEmail(candidate.email),
        password: validatePassword(candidate.password),
      }),
    );
  }
  const accounts = REQUIRED_ACTORS.map((actor) => byActor.get(actor));
  if (new Set(accounts.map(({ email }) => email)).size !== accounts.length)
    fail('duplicate_actor_email');
  return accounts;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('invalid_input');
  }
}

async function ensureTestAccountEmail(client, account) {
  const existing = await client.query(
    `SELECT id::text AS user_id
     FROM public.platform_users
     WHERE EXISTS (
       SELECT 1 FROM public.user_contacts AS contact
       WHERE contact.platform_user_id = platform_users.id
         AND contact.contact_kind = 'email'
         AND contact.value_normalized = $1
     )
       AND merged_into_id IS NULL
       AND is_archived IS FALSE`,
    [account.email],
  );
  if (existing.rows.length === 1) return;
  if (existing.rows.length > 1) fail('account_not_ready');

  const spec = ACTOR_SPECS[account.actor];
  if (!spec?.fallbackPhone) fail('account_not_ready');
  const fallback = await client.query(
    `SELECT id::text AS user_id, role
     FROM public.platform_users
     WHERE EXISTS (
       SELECT 1 FROM public.user_contacts AS contact
       WHERE contact.platform_user_id = platform_users.id
         AND contact.contact_kind = 'phone'
         AND contact.value_normalized = $1
     )
       AND merged_into_id IS NULL
       AND is_archived IS FALSE
     FOR UPDATE`,
    [spec.fallbackPhone],
  );
  if (fallback.rows.length !== 1 || fallback.rows[0].role !== spec.platformRole) {
    fail('account_not_ready');
  }
  const userId = fallback.rows[0].user_id;
  const conflict = await client.query(
    `SELECT platform_user_id::text AS user_id
     FROM public.user_contacts
     WHERE contact_kind = 'email' AND value_normalized = $1`,
    [account.email],
  );
  if (conflict.rows.some((row) => row.user_id !== userId)) fail('duplicate_actor_email');

  await client.query(
    `INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized, is_primary,
       confirmed_at, source_origin, updated_at
     ) VALUES ($2::uuid, 'email', $1, true, statement_timestamp(), 'direct', statement_timestamp())
     ON CONFLICT (value_normalized) WHERE contact_kind = 'email' DO UPDATE
     SET is_primary = true,
         confirmed_at = COALESCE(user_contacts.confirmed_at, EXCLUDED.confirmed_at),
         source_origin = 'direct',
         updated_at = statement_timestamp()
     WHERE user_contacts.platform_user_id = EXCLUDED.platform_user_id`,
    [account.email, userId],
  );
}

async function findAccountFact(client, account) {
  await ensureTestAccountEmail(client, account);
  const result = await client.query(
    `SELECT
       users.id::text AS user_id,
       users.role,
       (email_contact.confirmed_at IS NOT NULL) AS email_verified,
       users.is_blocked,
       count(*) FILTER (
         WHERE memberships.status = 'active'
       )::integer AS active_memberships,
       count(*) FILTER (
         WHERE memberships.role = 'owner'
           AND memberships.status = 'active'
       )::integer AS owner_memberships,
       count(*) FILTER (
         WHERE memberships.role = 'owner'
           AND memberships.status = 'active'
           AND memberships.specialist_id IS NOT NULL
       )::integer AS owner_specialist_memberships
     FROM public.platform_users AS users
     LEFT JOIN public.be_organization_members AS memberships
       ON memberships.platform_user_id = users.id
     INNER JOIN public.user_contacts AS email_contact
       ON email_contact.platform_user_id = users.id
      AND email_contact.contact_kind = 'email'
      AND email_contact.value_normalized = $1
     WHERE true
       AND users.merged_into_id IS NULL
       AND users.is_archived IS FALSE
     GROUP BY users.id, users.role, email_contact.confirmed_at, users.is_blocked`,
    [account.email],
  );
  if (result.rows.length !== 1) fail('account_not_ready');
  return result.rows[0];
}

async function convergeAccount(client, account) {
  const fact = await findAccountFact(client, account);
  assertSmokeLoginAccountFact(account.actor, fact);

  const contactConflict = await client.query(
    `SELECT platform_user_id::text AS user_id
     FROM public.user_contacts
     WHERE contact_kind = 'email'
       AND value_normalized = $1
       AND platform_user_id <> $2::uuid`,
    [account.email, fact.user_id],
  );
  if (contactConflict.rows.length !== 0) fail('duplicate_actor_email');

  await client.query(
    `INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized, is_primary,
       confirmed_at, source_origin, updated_at
     )
     VALUES ($1::uuid, 'email', $2, true,
             statement_timestamp(), 'direct', statement_timestamp())
     ON CONFLICT (value_normalized) WHERE contact_kind = 'email' DO UPDATE
     SET is_primary = true,
         confirmed_at = EXCLUDED.confirmed_at,
         source_origin = 'direct',
         updated_at = statement_timestamp()
     WHERE user_contacts.platform_user_id = EXCLUDED.platform_user_id`,
    [fact.user_id, account.email],
  );

  const credentialResult = await client.query(
    `SELECT password_hash, algo
     FROM public.user_password_credentials
     WHERE user_id = $1::uuid
     FOR UPDATE`,
    [fact.user_id],
  );
  const credential = credentialResult.rows[0];
  let passwordMatches = false;
  if (credential?.algo === 'argon2id') {
    try {
      passwordMatches = await argon2.verify(credential.password_hash, account.password);
    } catch {
      passwordMatches = false;
    }
  }

  if (passwordMatches) {
    await client.query(
      `UPDATE public.user_password_credentials
       SET failed_attempts = 0,
           locked_until = NULL
       WHERE user_id = $1::uuid`,
      [fact.user_id],
    );
  } else {
    const passwordHash = await hashSmokeLoginPassword(account.password);
    await client.query(
      `INSERT INTO public.user_password_credentials (
         user_id, password_hash, algo, failed_attempts, locked_until, updated_at
       )
       VALUES ($1::uuid, $2::text, 'argon2id', 0, NULL, statement_timestamp())
       ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           algo = EXCLUDED.algo,
           failed_attempts = 0,
           locked_until = NULL,
           updated_at = statement_timestamp()`,
      [fact.user_id, passwordHash],
    );
  }

  await client.query(
    `DELETE FROM public.auth_rate_limit_events
     WHERE (scope = $1::text AND key = $2::text)
        OR (scope = ANY($3::text[]) AND key = $4::text)`,
    [
      ACCOUNT_FAILURE_SCOPE,
      fact.user_id,
      [IDENTIFIER_FAILURE_SCOPE, IDENTIFIER_LOCK_SCOPE],
      passwordIdentifierRateLimitKey(account.email),
    ],
  );
  return passwordMatches ? 'unchanged' : 'changed';
}

async function applyTestAccountsFromStdin() {
  const accounts = validateAccountsInput(await readStdinJson());
  const client = new Client({
    database: REQUIRED_DATABASE,
    host: '/var/run/postgresql',
    user: REQUIRED_DB_USER,
  });
  await client.connect();
  let changed = 0;
  try {
    const identity = await client.query(
      `SELECT
         current_database() = $1::text AS database_ok,
         current_user = $2::text AS user_ok,
         (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser_ok`,
      [REQUIRED_DATABASE, REQUIRED_DB_USER],
    );
    const row = identity.rows[0];
    if (!row?.database_ok || !row?.user_ok || !row?.superuser_ok)
      fail('test_database_guard_failed');

    await client.query('BEGIN');
    try {
      for (const account of accounts) {
        if ((await convergeAccount(client, account)) === 'changed') changed += 1;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
  process.stdout.write(
    `smoke-login passwords converged: actors=doctor,clinic_admin,global_admin,patient changed=${changed} unchanged=${accounts.length - changed}\n`,
  );
}

function parseParentArgs(argv) {
  if (argv.length !== 1 || !argv[0].startsWith('--packet=')) fail('usage');
  const packetPath = argv[0].slice('--packet='.length);
  if (!packetPath) fail('usage');
  return packetPath;
}

function convergeFromPacket(argv) {
  if (process.env.SAAS_SMOKE_PASSWORD_CONVERGENCE_TEST_ONLY !== '1') {
    fail('test_only_enable_required');
  }
  if (process.getuid?.() !== 0) fail('root_required');
  const packetPath = parseParentArgs(argv);
  const accounts = smokeLoginAccountsFromPacket(readSmokeLoginPacket(packetPath));
  const result = spawnSync(
    'sudo',
    [
      '-u',
      REQUIRED_DB_USER,
      process.execPath,
      fileURLToPath(import.meta.url),
      '--apply-test-from-stdin',
    ],
    {
      input: JSON.stringify({ accounts }),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        NODE_ENV: 'production',
      },
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    fail('test_password_convergence_failed');
  }
  process.stdout.write(result.stdout);
}

async function selfTest() {
  const packet = {
    SAAS_SMOKE_DOCTOR_EMAIL: 'doctor@example.test',
    SAAS_SMOKE_DOCTOR_PASSWORD: 'doctor-password',
    SAAS_SMOKE_GLOBAL_ADMIN_EMAIL: 'admin@example.test',
    SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD: 'admin-password',
    SAAS_SMOKE_PATIENT_EMAIL: 'patient@example.test',
    SAAS_SMOKE_PATIENT_PASSWORD: 'patient-password',
  };
  const accounts = smokeLoginAccountsFromPacket(packet);
  if (accounts.length !== 3 || accounts[0].actor !== 'doctor') fail('self_test_accounts');
  assertSmokeLoginAccountFact('doctor', {
    role: 'doctor',
    email_verified: true,
    is_blocked: false,
    active_memberships: 1,
    owner_memberships: 1,
    owner_specialist_memberships: 1,
  });
  const passwordHash = await hashSmokeLoginPassword('self-test-password');
  if (!passwordHash.startsWith('$argon2id$')) fail('self_test_hash_type');
  if (!(await verifySmokeLoginPassword(passwordHash, 'self-test-password')))
    fail('self_test_hash_verify');
  process.stdout.write('converge-saas-smoke-login-passwords self-test: OK\n');
}

async function main() {
  if (process.argv[2] === '--apply-test-from-stdin') {
    await applyTestAccountsFromStdin();
  } else if (process.argv[2] === '--self-test') {
    await selfTest();
  } else {
    convergeFromPacket(process.argv.slice(2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof Error ? error.message : 'unknown_error';
    process.stderr.write(
      `converge-saas-smoke-login-passwords: ${code}; transaction rolled back\n`,
    );
    process.exitCode = 1;
  });
}
