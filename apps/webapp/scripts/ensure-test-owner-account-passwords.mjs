#!/usr/bin/env node

import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const { Client } = pg;

const TEST_DATABASE = 'bersoncarebot_test';
const TEST_PASSWORD = '123456testTEST';
const EXPECTED_ACCOUNTS = [
  { email: 'dimmdao@yandex.ru', role: 'doctor', fallbackPhone: '+79643805480' },
  { email: 'dimmdao@gmail.com', role: 'admin', fallbackPhone: null },
  { email: 'kinesiospace@gmail.com', role: 'client', fallbackPhone: '+79189000782' },
];

function fail(message) {
  throw new Error(message);
}

function identifierKey(email) {
  return `password-email:v1:${createHash('sha256').update(email).digest('hex')}`;
}

function parseArgs(argv) {
  const execute = argv.includes('--execute');
  const confirmed = argv.includes('--confirm-test-owner-password-reset');
  const selfTest = argv.includes('--self-test');
  const known = new Set(['--execute', '--confirm-test-owner-password-reset', '--self-test']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) fail(`unknown arguments: ${unknown.join(', ')}`);
  if (selfTest && (execute || confirmed)) fail('--self-test cannot be combined with execution');
  if (!selfTest && (!execute || !confirmed)) {
    fail('execution requires --execute --confirm-test-owner-password-reset');
  }
  return { selfTest };
}

function runSelfTest() {
  if (EXPECTED_ACCOUNTS.length !== 3) fail('expected exactly three owner accounts');
  for (const account of EXPECTED_ACCOUNTS) {
    if (!/^password-email:v1:[0-9a-f]{64}$/.test(identifierKey(account.email))) {
      fail(`invalid password protection key for ${account.email}`);
    }
  }
  console.log('ensure-test-owner-account-passwords self-test: OK');
}

async function execute() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('DATABASE_URL is required');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const context = await client.query('SELECT current_database() AS database_name, current_user AS user_name');
    const databaseName = context.rows[0]?.database_name;
    const userName = context.rows[0]?.user_name;
    if (databaseName !== TEST_DATABASE) fail(`refusing database ${String(databaseName)}`);
    if (userName !== 'postgres') fail(`refusing database user ${String(userName)}`);

    let accountsUpdated = 0;
    let contactsRestored = 0;
    for (const account of EXPECTED_ACCOUNTS) {
      const accountRows = await client.query(
        `SELECT person.id::text AS user_id,
                person.role,
                email_contact.value_normalized AS email,
                email_contact.confirmed_at IS NOT NULL AS email_confirmed
           FROM public.platform_users AS person
           LEFT JOIN public.user_contacts AS email_contact
             ON email_contact.platform_user_id = person.id
            AND email_contact.contact_kind = 'email'
            AND email_contact.is_primary = true
          WHERE person.merged_into_id IS NULL
            AND person.is_archived IS FALSE
            AND (
              email_contact.value_normalized = $1::text
              OR (
                $2::text IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.user_contacts AS phone_contact
                  WHERE phone_contact.platform_user_id = person.id
                    AND phone_contact.contact_kind = 'phone'
                    AND phone_contact.is_primary = true
                    AND phone_contact.value_normalized = $2::text
                )
              )
            )`,
        [account.email, account.fallbackPhone],
      );
      if (accountRows.rowCount !== 1) {
        fail(`expected one live ${account.role} owner account for ${account.email}, got ${accountRows.rowCount}`);
      }
      const row = accountRows.rows[0];
      if (row.role !== account.role) {
        fail(`owner account role mismatch for ${account.email}`);
      }

      if (row.email !== account.email) {
        await client.query(
          `INSERT INTO public.user_contacts (
             platform_user_id, contact_kind, value_normalized, is_primary,
             confirmed_at, source_origin, created_at, updated_at
           ) VALUES ($1::uuid, 'email', $2::text, true, statement_timestamp(), 'direct',
                     statement_timestamp(), statement_timestamp())`,
          [row.user_id, account.email],
        );
        contactsRestored += 1;
      } else if (row.email_confirmed !== true) {
        fail(`owner account email is not confirmed for ${account.email}`);
      }

      const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
      await client.query(
        `INSERT INTO public.user_password_credentials (
           user_id, password_hash, algo, failed_attempts, next_allowed_at, locked_until,
           verification_lease_token, verification_lease_until, updated_at
         ) VALUES ($1::uuid, $2::text, 'argon2id', 0, NULL, NULL, NULL, NULL, statement_timestamp())
         ON CONFLICT (user_id) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           algo = EXCLUDED.algo,
           failed_attempts = 0,
           next_allowed_at = NULL,
           locked_until = NULL,
           verification_lease_token = NULL,
           verification_lease_until = NULL,
           updated_at = statement_timestamp()`,
        [row.user_id, passwordHash],
      );

      await client.query(
        `INSERT INTO public.password_login_identifier_protection (
           identifier_key, failed_attempts, next_allowed_at, locked_until,
           verification_lease_token, verification_lease_until, leased_user_id, updated_at
         ) VALUES ($1::text, 0, NULL, NULL, NULL, NULL, NULL, statement_timestamp())
         ON CONFLICT (identifier_key) DO UPDATE SET
           failed_attempts = 0,
           next_allowed_at = NULL,
           locked_until = NULL,
           verification_lease_token = NULL,
           verification_lease_until = NULL,
           leased_user_id = NULL,
           updated_at = statement_timestamp()`,
        [identifierKey(account.email)],
      );
      accountsUpdated += 1;
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'pass', accountsUpdated, contactsRestored, secretsPrinted: false }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) runSelfTest();
  else await execute();
} catch (error) {
  console.error(`ensure-test-owner-account-passwords: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
