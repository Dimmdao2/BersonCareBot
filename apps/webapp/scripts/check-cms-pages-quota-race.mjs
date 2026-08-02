#!/usr/bin/env node
/**
 * #1069 executable last-slot proof for cms_pages. It starts a private PostgreSQL 16 cluster below
 * /tmp, extracts the authoritative trigger function from the CMS quota migration, and runs two
 * independent connections against it. It never reads application env files or a configured DB.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const osUser = userInfo().username;
const migrationDir = path.join(root, 'apps/webapp/db/drizzle-migrations');
const c5aRuntimePath = path.join(root, 'deploy/postgres/c5a-platform-operations-runtime.sql');

function fail(message) {
  throw new Error(`CMS pages quota race proof failed: ${message}`);
}

const migrationNames = readdirSync(migrationDir).filter((name) =>
  name.endsWith('_cms_pages_snapshot_quota.sql'),
);
if (migrationNames.length !== 1) {
  fail(
    `expected exactly one *_cms_pages_snapshot_quota.sql migration, found ${migrationNames.length}`,
  );
}
const migrationPath = path.join(migrationDir, migrationNames[0]);

export function extractQuotaFunction(migration) {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION app.enforce_cms_pages_snapshot_quota()',
  );
  const end = migration.indexOf('ALTER FUNCTION app.enforce_cms_pages_snapshot_quota()', start);
  if (start < 0 || end < 0) {
    fail('could not extract app.enforce_cms_pages_snapshot_quota from the CMS quota migration');
  }
  return migration.slice(start, end);
}

export function extractUsageFunction(migration) {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION app.cms_pages_snapshot_usage(');
  const end = migration.indexOf('ALTER FUNCTION app.cms_pages_snapshot_usage(uuid)', start);
  if (start < 0 || end < 0) {
    fail('could not extract app.cms_pages_snapshot_usage from the CMS quota migration');
  }
  return migration.slice(start, end);
}

export function extractEnforcedQuotaUsageFunction(runtime) {
  const start = runtime.indexOf('CREATE OR REPLACE FUNCTION app.read_org_enforced_quota_usage(');
  const bodyStart = runtime.indexOf('AS $function$', start);
  const end = runtime.indexOf('$function$', bodyStart + 'AS $function$'.length);
  if (start < 0 || bodyStart < 0 || end < 0) {
    fail('could not extract app.read_org_enforced_quota_usage from the C5A runtime overlay');
  }
  return runtime.slice(start, end + '$function$'.length);
}

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_cms_pages_quota_race_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const db = `bcb_cms_pages_quota_race_${stamp}`;
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
let serverStarted = false;
let port;

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: safeEnv });
  if (result.error || result.status !== 0) fail(`${label}: ${result.stderr ?? result.error}`);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('private port reservation failed');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function client() {
  return new pg.Client({ host: socket, port, database: db, user: osUser, ssl: false });
}

async function withClient(fn) {
  const connection = client();
  await connection.connect();
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function installSchema() {
  const migration = readFileSync(migrationPath, 'utf8');
  const runtime = readFileSync(c5aRuntimePath, 'utf8');
  const quotaFunction = extractQuotaFunction(migration);
  const usageFunction = extractUsageFunction(migration);
  const enforcedUsageFunction = extractEnforcedQuotaUsageFunction(runtime);
  await withClient(async (connection) => {
    await connection.query(`
      CREATE EXTENSION pgcrypto;
      CREATE SCHEMA app;
      CREATE ROLE app_owner NOLOGIN BYPASSRLS;
      CREATE ROLE app_platform_settings NOLOGIN NOINHERIT NOBYPASSRLS;
      GRANT USAGE, CREATE ON SCHEMA app TO app_owner;
      GRANT USAGE ON SCHEMA app TO app_platform_settings;
      CREATE TABLE public.be_organizations (
        id uuid PRIMARY KEY,
        tariff_id uuid,
        is_active boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.saas_tariffs (
        id uuid PRIMARY KEY,
        quotas jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE public.saas_organization_trials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        tariff_id uuid NOT NULL,
        ends_at timestamptz NOT NULL,
        grace_ends_at timestamptz NOT NULL,
        post_trial_behavior text NOT NULL,
        post_trial_tariff_id uuid,
        status text NOT NULL
      );
      CREATE TABLE public.saas_org_entitlement_overrides (
        organization_id uuid NOT NULL,
        mechanic text NOT NULL,
        quota jsonb,
        expires_at timestamptz,
        PRIMARY KEY (organization_id, mechanic)
      );
      CREATE TABLE public.content_pages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        section text NOT NULL,
        slug text NOT NULL,
        title text NOT NULL,
        deleted_at timestamptz,
        UNIQUE (section, slug)
      );
      CREATE TABLE public.courses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL
      );
      CREATE TABLE public.be_organization_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        status text NOT NULL,
        specialist_id uuid
      );
      CREATE TABLE public.organization_member_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        invited_email text NOT NULL,
        invited_role text NOT NULL,
        status text NOT NULL,
        expires_at timestamptz NOT NULL,
        accepted_membership_id uuid
      );
      CREATE TABLE public.org_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.patient_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        size_bytes bigint NOT NULL
      );
      GRANT SELECT ON TABLE
        public.be_organizations,
        public.saas_tariffs,
        public.saas_organization_trials,
        public.saas_org_entitlement_overrides,
        public.content_pages,
        public.courses,
        public.be_organization_members,
        public.organization_member_invites,
        public.org_enrollments,
        public.patient_files
      TO app_owner;
      GRANT UPDATE (updated_at) ON TABLE public.be_organizations TO app_owner;
      INSERT INTO public.saas_tariffs (id, quotas) VALUES (
        '10000000-0000-4000-8000-000000000001',
        '{"cms_pages":{"kind":"numeric","limit":1,"unit":"items","period":"snapshot","usagePolicy":"snapshot"}}'
      );
      INSERT INTO public.be_organizations (id, tariff_id) VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001'
      );
      ${usageFunction}
      ALTER FUNCTION app.cms_pages_snapshot_usage(uuid) OWNER TO app_owner;
      ${enforcedUsageFunction};
      ALTER FUNCTION app.read_org_enforced_quota_usage(uuid) OWNER TO app_owner;
      REVOKE ALL ON FUNCTION app.read_org_enforced_quota_usage(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION app.read_org_enforced_quota_usage(uuid)
        TO app_platform_settings;
      ${quotaFunction}
      ALTER FUNCTION app.enforce_cms_pages_snapshot_quota() OWNER TO app_owner;
      CREATE TRIGGER content_pages_snapshot_quota_guard
        BEFORE INSERT ON public.content_pages
        FOR EACH ROW EXECUTE FUNCTION app.enforce_cms_pages_snapshot_quota();
    `);
  });
}

async function proveCountOnlyQuotaUsage() {
  await withClient(async (connection) => {
    const organizationId = '20000000-0000-4000-8000-000000000001';
    const otherOrganizationId = '20000000-0000-4000-8000-000000000002';
    const acceptedMembershipId = '30000000-0000-4000-8000-000000000002';
    await connection.query('INSERT INTO public.courses (organization_id) VALUES ($1), ($1)', [
      organizationId,
    ]);
    await connection.query(
      `INSERT INTO public.be_organization_members
         (id, organization_id, status, specialist_id)
       VALUES
         ('30000000-0000-4000-8000-000000000001', $1, 'active',
          '40000000-0000-4000-8000-000000000001'),
         ($2, $1, 'active', NULL)`,
      [organizationId, acceptedMembershipId],
    );
    await connection.query(
      `INSERT INTO public.org_enrollments (organization_id, status)
       VALUES
         ($1, 'invited'),
         ($1, 'active'),
         ($1, 'archived'),
         ($2, 'active')`,
      [organizationId, otherOrganizationId],
    );
    await connection.query(
      `INSERT INTO public.patient_files (organization_id, size_bytes)
       VALUES ($1, 400), ($1, 600), ($2, 9000)`,
      [organizationId, otherOrganizationId],
    );
    await connection.query(
      `INSERT INTO public.organization_member_invites
         (organization_id, invited_email, invited_role, status, expires_at,
          accepted_membership_id)
       VALUES
         ($1, 'pending@example.invalid', 'doctor', 'pending', now() + interval '1 day', NULL),
         ($1, 'accepted@example.invalid', 'doctor', 'accepted', now() + interval '1 day', $2)`,
      [organizationId, acceptedMembershipId],
    );
    await connection.query('SET ROLE app_platform_settings');
    const usage = await connection.query(
      'SELECT * FROM app.read_org_enforced_quota_usage($1::uuid)',
      [organizationId],
    );
    await connection.query('RESET ROLE');
    if (
      usage.rows[0]?.clinic_team_used !== 3 ||
      usage.rows[0]?.patient_count_used !== 2 ||
      usage.rows[0]?.files_used !== '1000'
    ) {
      fail(`count-only quota accessor returned ${JSON.stringify(usage.rows[0])}`);
    }
    await connection.query('SET ROLE app_platform_settings');
    const emptyUsage = await connection.query(
      'SELECT * FROM app.read_org_enforced_quota_usage($1::uuid)',
      ['20000000-0000-4000-8000-000000000003'],
    );
    await connection.query('RESET ROLE');
    if (
      emptyUsage.rows[0]?.clinic_team_used !== 0 ||
      emptyUsage.rows[0]?.patient_count_used !== 0 ||
      emptyUsage.rows[0]?.files_used !== '0'
    ) {
      fail(`empty count-only quota accessor returned ${JSON.stringify(emptyUsage.rows[0])}`);
    }
    const privileges = await connection.query(`
      SELECT
        has_table_privilege(
          'app_platform_settings', 'public.organization_member_invites', 'SELECT'
        ) AS invites_select,
        has_table_privilege(
          'app_platform_settings', 'public.org_enrollments', 'SELECT'
        ) AS enrollments_select,
        has_table_privilege(
          'app_platform_settings', 'public.patient_files', 'SELECT'
        ) AS patient_files_select
    `);
    if (
      privileges.rows[0]?.invites_select ||
      privileges.rows[0]?.enrollments_select ||
      privileges.rows[0]?.patient_files_select
    ) {
      fail('platform role retained direct sensitive row SELECT beside the count-only accessor');
    }
    for (const relation of [
      'organization_member_invites',
      'org_enrollments',
      'patient_files',
    ]) {
      await connection.query('SET ROLE app_platform_settings');
      try {
        await connection.query(`SELECT 1 FROM public.${relation} LIMIT 1`);
        fail(`platform role read ${relation} directly beside the count-only accessor`);
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== '42501') throw error;
      } finally {
        await connection.query('RESET ROLE');
      }
    }
  });
}

async function proveLastSlotRace() {
  const first = client();
  const second = client();
  await Promise.all([first.connect(), second.connect()]);
  try {
    await first.query('BEGIN');
    await second.query('BEGIN');
    await first.query(
      'INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)',
      ['20000000-0000-4000-8000-000000000001', 'lessons', 'first', 'First'],
    );
    const secondInsert = second.query(
      'INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)',
      ['20000000-0000-4000-8000-000000000001', 'lessons', 'second', 'Second'],
    );
    await first.query('COMMIT');
    await secondInsert.then(
      () => fail('second concurrent last-slot insert unexpectedly succeeded'),
      (error) => {
        if (!String(error.message).includes('saas_quota_reached:cms_pages')) throw error;
      },
    );
    await second.query('ROLLBACK');
    const count = await withClient(async (connection) => {
      const result = await connection.query(
        'SELECT count(*)::int AS count FROM public.content_pages',
      );
      return result.rows[0]?.count;
    });
    if (count !== 1) fail(`expected exactly one committed CMS page, found ${count}`);
  } finally {
    await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
    await Promise.all([first.end(), second.end()]);
  }
}

async function proveAtLimitUpsert() {
  await withClient(async (connection) => {
    const result = await connection.query(
      `INSERT INTO public.content_pages (organization_id, section, slug, title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (section, slug) DO UPDATE SET title = EXCLUDED.title
       RETURNING title`,
      ['20000000-0000-4000-8000-000000000001', 'lessons', 'first', 'Updated'],
    );
    if (result.rows[0]?.title !== 'Updated') {
      fail('at-limit upsert did not update the existing CMS page');
    }
    const countResult = await connection.query(
      'SELECT count(*)::int AS count FROM public.content_pages',
    );
    if (countResult.rows[0]?.count !== 1) {
      fail(`at-limit upsert consumed a new slot; found ${countResult.rows[0]?.count} pages`);
    }
  });
}

async function proveRepeatableReadUnderLimit() {
  await withClient(async (connection) => {
    await connection.query(`
      UPDATE public.saas_tariffs
      SET quotas = '{"cms_pages":{"kind":"numeric","limit":2,"unit":"items","period":"snapshot","usagePolicy":"snapshot"}}'
    `);
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    try {
      const result = await connection.query(
        'INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)',
        ['20000000-0000-4000-8000-000000000001', 'lessons', 'repeatable-read', 'RR'],
      );
      if (result.rowCount !== 1) fail('under-limit REPEATABLE READ insert did not succeed');
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    }
  });
}

async function proveRepeatableReadStaleSnapshotCannotOverflow() {
  const stale = client();
  const winner = client();
  await Promise.all([stale.connect(), winner.connect()]);
  try {
    await winner.query(`
      UPDATE public.saas_tariffs
      SET quotas = '{"cms_pages":{"kind":"numeric","limit":3,"unit":"items","period":"snapshot","usagePolicy":"snapshot"}}'
    `);
    await stale.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await stale.query('SELECT updated_at FROM public.be_organizations WHERE id = $1', [
      '20000000-0000-4000-8000-000000000001',
    ]);
    await winner.query(
      'INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)',
      ['20000000-0000-4000-8000-000000000001', 'lessons', 'rr-winner', 'Winner'],
    );
    await stale
      .query(
        'INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)',
        ['20000000-0000-4000-8000-000000000001', 'lessons', 'rr-stale', 'Stale'],
      )
      .then(
        () => fail('stale REPEATABLE READ insert exceeded the final slot'),
        (error) => {
          if (error.code !== '40001') throw error;
        },
      );
    await stale.query('ROLLBACK');

    const count = await winner.query('SELECT count(*)::int AS count FROM public.content_pages');
    if (count.rows[0]?.count !== 3) {
      fail(`expected three CMS pages after RR serialization, found ${count.rows[0]?.count}`);
    }
  } finally {
    await Promise.allSettled([stale.query('ROLLBACK'), winner.query('ROLLBACK')]);
    await Promise.all([stale.end(), winner.end()]);
  }
}

try {
  if (!existsSync(path.join(pgBin, 'initdb'))) fail('PostgreSQL 16 binaries are unavailable');
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale'], 'private initdb');
  run(
    path.join(pgBin, 'pg_ctl'),
    ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    'private PostgreSQL startup',
  );
  serverStarted = true;
  run(
    path.join(pgBin, 'createdb'),
    ['-h', socket, '-p', String(port), db],
    'private database creation',
  );
  await installSchema();
  await proveCountOnlyQuotaUsage();
  await proveLastSlotRace();
  await proveAtLimitUpsert();
  await proveRepeatableReadUnderLimit();
  await proveRepeatableReadStaleSnapshotCannotOverflow();
  console.log(
    'CMS pages quota race proof: OK — owner ACL, final slot, at-limit upsert, and RR serialization',
  );
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
      encoding: 'utf8',
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
