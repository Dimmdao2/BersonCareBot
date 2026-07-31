#!/usr/bin/env node
/**
 * #1069 §5a stage 5.2/5.7 — executable last-slot proof for the `patient_count` квота.
 *
 * Extracts the verbatim SQL text `assertStockQuotaAvailable` (src/infra/repos/stockQuotaCheck.ts)
 * and `ensureInvitedOrganizationClientRelationship`'s usage-count query
 * (src/infra/repos/pgPatientOrganizationEnrollment.ts) issue, and replays them through a real,
 * disposable PostgreSQL 16 server with two concurrent connections — same pattern as
 * check-c4a-843-clinic-invite-concurrency.mjs (extract real SQL, hand-written control-flow glue
 * that mirrors the source function 1:1). Never reads application env or a configured DB.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const osUser = userInfo().username;

function fail(message) {
  throw new Error(`patient_count quota race proof failed: ${message}`);
}

// ---------------------------------------------------------------------------
// Extraction: pull the exact SQL text out of the real production sources.
// ---------------------------------------------------------------------------

// This proof's JS replay hand-glues the same four decision branches as the real
// `assertStockQuotaAvailable` (not just its SQL text) — recounting is meaningless if the
// comparison it feeds were ever weakened or removed. Asserting these exact lines are still
// present in the source is what makes THIS mutation (e.g. dropping the final `>=` throw) turn the
// proof red instead of silently passing against stale hand-glue.
const REQUIRED_DECISION_LINES = [
  'if (!quota) throw new StockQuotaReachedError(mechanic);',
  "if (quota.kind === 'unlimited') return;",
  'if (quota.limit === null) throw new StockQuotaReachedError(mechanic);',
  'if (used >= quota.limit) throw new StockQuotaReachedError(mechanic);',
];

export function extractStockQuotaSqlFragments(stockQuotaSource) {
  const start = stockQuotaSource.indexOf('export async function assertStockQuotaAvailable');
  if (start < 0) fail('could not locate assertStockQuotaAvailable in stockQuotaCheck.ts');
  const slice = stockQuotaSource.slice(start);
  for (const line of REQUIRED_DECISION_LINES) {
    if (!slice.includes(line)) {
      fail(`assertStockQuotaAvailable no longer contains the required decision line: ${line}`);
    }
  }
  const fragments = [...slice.matchAll(/`([^`]*)`/gs)]
    .map((m) => m[1])
    .filter((text) => !text.includes('${'));
  if (fragments.length !== 2) {
    fail(`expected exactly 2 pure-SQL fragments in assertStockQuotaAvailable, found ${fragments.length}`);
  }
  const [lockSql, capacitySql] = fragments;
  return { lockSql, capacitySql };
}

export function extractPatientCountUsageSql(enrollmentSource) {
  const marker = "assertStockQuotaAvailable(tx, organizationId, 'patient_count'";
  const start = enrollmentSource.indexOf(marker);
  if (start < 0) fail('could not locate the patient_count assertStockQuotaAvailable call');
  const slice = enrollmentSource.slice(start);
  const match = slice.match(/`([^`]*)`/s);
  if (!match) fail('could not locate the patient_count usage-count SQL fragment');
  return match[1];
}

// ---------------------------------------------------------------------------
// Private disposable PostgreSQL 16 cluster.
// ---------------------------------------------------------------------------

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_patient_count_quota_race_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const db = `bcb_patient_count_quota_race_${stamp}`;
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
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
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

let LOCK_SQL;
let CAPACITY_SQL;
let USAGE_SQL;

async function installSchema() {
  await withClient(async (connection) => {
    await connection.query(`
      CREATE TABLE public.be_organizations (
        id uuid PRIMARY KEY,
        tariff_id uuid
      );
      CREATE TABLE public.saas_tariffs (
        id uuid PRIMARY KEY,
        quotas jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE public.saas_org_entitlement_overrides (
        organization_id uuid NOT NULL,
        mechanic text NOT NULL,
        quota jsonb,
        expires_at timestamptz,
        PRIMARY KEY (organization_id, mechanic)
      );
      CREATE TABLE public.org_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        platform_user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        UNIQUE (organization_id, platform_user_id)
      );
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);
  });
}

/** Faithful replay of `ensureInvitedOrganizationClientRelationship`'s control flow. */
async function ensureInvitedRelationshipProof(connection, organizationId, platformUserId) {
  const existing = await connection.query(
    `SELECT status FROM public.org_enrollments WHERE organization_id = $1 AND platform_user_id = $2`,
    [organizationId, platformUserId],
  );
  if (existing.rows[0]) {
    const status = existing.rows[0].status;
    if (status === 'invited' || status === 'active') return { ok: true, status };
    return { ok: false, code: 'inactive_enrollment' };
  }

  await connection.query(LOCK_SQL, [`saas_quota:patient_count:${organizationId}`]);
  const capacity = await connection.query(CAPACITY_SQL, [organizationId, 'patient_count']);
  const row = capacity.rows[0];
  if (row?.tariff_id) {
    const quota = row.quota_json;
    if (!quota || (quota.kind !== 'numeric' && quota.kind !== 'unlimited')) {
      return { ok: false, code: 'saas_quota_reached:patient_count' };
    }
    if (quota.kind === 'numeric') {
      if (quota.limit === null) return { ok: false, code: 'saas_quota_reached:patient_count' };
      const usage = await connection.query(USAGE_SQL, [organizationId]);
      const used = usage.rows[0]?.used_value ?? 0;
      if (used >= quota.limit) return { ok: false, code: 'saas_quota_reached:patient_count' };
    }
  }

  await connection.query(
    `INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
     VALUES ($1, $2, 'invited')
     ON CONFLICT (organization_id, platform_user_id) DO NOTHING`,
    [organizationId, platformUserId],
  );
  return { ok: true, status: 'invited' };
}

async function runInTransaction(connection, fn) {
  await connection.query('BEGIN');
  const result = await fn(connection);
  await connection.query('COMMIT');
  return result;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function proveLastSlotRace() {
  const org = '20000000-0000-4000-8000-000000000001';
  const tariff = '10000000-0000-4000-8000-000000000001';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"patient_count":{"kind":"numeric","limit":1}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const a = client();
  const b = client();
  await Promise.all([a.connect(), b.connect()]);
  try {
    const [resultA, resultB] = await Promise.all([
      runInTransaction(a, (c) =>
        ensureInvitedRelationshipProof(c, org, '30000000-0000-4000-8000-000000000001'),
      ),
      runInTransaction(b, (c) =>
        ensureInvitedRelationshipProof(c, org, '30000000-0000-4000-8000-000000000002'),
      ),
    ]);
    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => r.ok).length;
    const denied = outcomes.filter((r) => !r.ok && r.code === 'saas_quota_reached:patient_count').length;
    if (succeeded !== 1 || denied !== 1) {
      fail('two concurrent different-patient creates at the final slot did not resolve to exactly one success and one denial');
    }
    const count = await withClient((c) =>
      c.query(`SELECT count(*)::int AS c FROM public.org_enrollments WHERE organization_id = $1`, [org]),
    );
    if (count.rows[0]?.c !== 1) fail('expected exactly one committed patient enrollment after the race');
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    await Promise.all([a.end(), b.end()]);
  }
}

async function proveArchivingFreesSlot() {
  const org = '20000000-0000-4000-8000-000000000002';
  const tariff = '10000000-0000-4000-8000-000000000002';
  const patientA = '30000000-0000-4000-8000-0000000000a1';
  const patientB = '30000000-0000-4000-8000-0000000000a2';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"patient_count":{"kind":"numeric","limit":1}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const seeded = await withClient((c) => runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, patientA)));
  if (!seeded.ok) fail('seeding the first patient at the limit must succeed');

  const blocked = await withClient((c) => runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, patientB)));
  if (blocked.ok || blocked.code !== 'saas_quota_reached:patient_count') {
    fail('a second distinct patient at the limit must be denied');
  }

  // Archiving the existing patient frees its slot (§5a 5.2: archiving is the release action).
  await withClient((c) =>
    c.query(`UPDATE public.org_enrollments SET status = 'archived' WHERE organization_id = $1 AND platform_user_id = $2`, [
      org,
      patientA,
    ]),
  );

  const afterArchive = await withClient((c) => runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, patientB)));
  if (!afterArchive.ok) fail('archiving the existing patient must free its slot for a new one');
}

async function proveExistingPatientNeverBlockedAtLimit() {
  const org = '20000000-0000-4000-8000-000000000003';
  const tariff = '10000000-0000-4000-8000-000000000003';
  const patient = '30000000-0000-4000-8000-0000000000b1';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"patient_count":{"kind":"numeric","limit":1}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));
  const seeded = await withClient((c) => runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, patient)));
  if (!seeded.ok) fail('seeding the only patient at the limit must succeed');

  // §5a 5.2: touching an ALREADY-enrolled patient at/over the limit must never be blocked.
  const revisited = await withClient((c) => runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, patient)));
  if (!revisited.ok) fail('re-touching an existing patient at the limit must never be blocked');
}

async function proveNoTariffIsCompatibilityUnlimited() {
  const org = '20000000-0000-4000-8000-000000000004';
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, NULL)`, [org]));
  const first = await withClient((c) =>
    runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, '30000000-0000-4000-8000-0000000000c1')),
  );
  const second = await withClient((c) =>
    runInTransaction(c, (cx) => ensureInvitedRelationshipProof(cx, org, '30000000-0000-4000-8000-0000000000c2')),
  );
  if (!first.ok || !second.ok) fail('an organization without a tariff must allow unlimited patient creation');
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
  run(path.join(pgBin, 'createdb'), ['-h', socket, '-p', String(port), db], 'private database creation');

  const stockQuotaSource = readFileSync(
    path.join(root, 'apps/webapp/src/infra/repos/stockQuotaCheck.ts'),
    'utf8',
  );
  const enrollmentSource = readFileSync(
    path.join(root, 'apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts'),
    'utf8',
  );
  const fragments = extractStockQuotaSqlFragments(stockQuotaSource);
  LOCK_SQL = fragments.lockSql;
  CAPACITY_SQL = fragments.capacitySql;
  USAGE_SQL = extractPatientCountUsageSql(enrollmentSource);

  await installSchema();
  await proveLastSlotRace();
  await proveArchivingFreesSlot();
  await proveExistingPatientNeverBlockedAtLimit();
  await proveNoTariffIsCompatibilityUnlimited();

  console.log(
    'patient_count quota race proof: OK — last-slot race, archiving frees a slot, existing ' +
      'patients never blocked, no-tariff compatibility unlimited, all verified against a real ' +
      'private PostgreSQL 16 server',
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
