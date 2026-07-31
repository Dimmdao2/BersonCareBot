#!/usr/bin/env node
/**
 * #987/#1069 §5a stage 5.4/5.7 — executable last-byte proof for the `files` (объём) квота.
 *
 * Extracts the verbatim SQL text of `assertStockQuotaAvailable` (src/infra/repos/stockQuotaCheck.ts)
 * and replays it through a real, disposable PostgreSQL 16 server with two concurrent connections —
 * same pattern as check-branches-quota-race.mjs / check-patient-count-quota-race.mjs.
 *
 * `files` usage is computed by pgPatientFiles.ts through Drizzle's query builder
 * (`select({...COALESCE(SUM(...))...}).from(patientFiles).where(...)`), not a raw `$1..$n` SQL
 * template like the other two mechanics, so its usage query text cannot be extracted the same
 * way. Instead this script guards the decisive SHAPE of that call by substring (aggregate
 * function, column, mechanic key, increment argument) and replays an equivalent hand-written SQL
 * query against the private schema — if any guarded substring disappears from the real source,
 * the guard fails loudly instead of silently drifting from production behaviour.
 *
 * Never reads application env or a configured DB.
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
  throw new Error(`storage quota race proof failed: ${message}`);
}

// ---------------------------------------------------------------------------
// Extraction: pull the exact SQL text / guard the exact call shape out of the real sources.
// ---------------------------------------------------------------------------

const REQUIRED_DECISION_LINES = [
  'if (!quota) throw new StockQuotaReachedError(mechanic);',
  "if (quota.kind === 'unlimited') return;",
  'if (quota.limit === null) throw new StockQuotaReachedError(mechanic);',
  'if (used + increment > quota.limit) throw new StockQuotaReachedError(mechanic);',
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

const REQUIRED_FILES_USAGE_SUBSTRINGS = [
  "assertStockQuotaAvailable(\n          tx,\n          organizationId,\n          'files',",
  'COALESCE(SUM(${patientFiles.sizeBytes}), 0)::bigint',
  '.where(eq(patientFiles.organizationId, organizationId));',
  'params.sizeBytes,',
];

export function assertFilesUsageQueryShape(pgPatientFilesSource) {
  for (const needle of REQUIRED_FILES_USAGE_SUBSTRINGS) {
    if (!pgPatientFilesSource.includes(needle)) {
      fail(`pgPatientFiles.ts no longer contains the guarded files-quota shape: ${needle}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Private disposable PostgreSQL 16 cluster.
// ---------------------------------------------------------------------------

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_storage_quota_race_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const db = `bcb_storage_quota_race_${stamp}`;
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
// Equivalent of pgPatientFiles.ts's Drizzle SUM query, guarded by assertFilesUsageQueryShape above.
const USAGE_SQL = `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used_value
   FROM public.patient_files
   WHERE organization_id = $1`;

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
      CREATE TABLE public.patient_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        size_bytes bigint NOT NULL
      );
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);
  });
}

/** Faithful replay of `pgPatientFiles.createFile`'s quota-then-insert control flow. */
async function createFileProof(connection, organizationId, sizeBytes) {
  await connection.query(LOCK_SQL, [`saas_quota:files:${organizationId}`]);
  const capacity = await connection.query(CAPACITY_SQL, [organizationId, 'files']);
  const row = capacity.rows[0];
  if (row?.tariff_id) {
    const quota = row.quota_json;
    if (!quota || (quota.kind !== 'numeric' && quota.kind !== 'unlimited')) {
      return { ok: false, code: 'saas_quota_reached:files' };
    }
    if (quota.kind === 'numeric') {
      if (quota.limit === null) return { ok: false, code: 'saas_quota_reached:files' };
      const usage = await connection.query(USAGE_SQL, [organizationId]);
      const used = Number(usage.rows[0]?.used_value ?? 0);
      if (used + sizeBytes > quota.limit) return { ok: false, code: 'saas_quota_reached:files' };
    }
  }

  const inserted = await connection.query(
    `INSERT INTO public.patient_files (organization_id, size_bytes) VALUES ($1, $2) RETURNING id`,
    [organizationId, sizeBytes],
  );
  return { ok: true, id: inserted.rows[0].id };
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

async function proveLastBytesRace() {
  const org = '30000000-0000-4000-8000-000000000001';
  const tariff = '40000000-0000-4000-8000-000000000001';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"files":{"kind":"numeric","limit":100}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const a = client();
  const b = client();
  await Promise.all([a.connect(), b.connect()]);
  try {
    const [resultA, resultB] = await Promise.all([
      runInTransaction(a, (c) => createFileProof(c, org, 100)),
      runInTransaction(b, (c) => createFileProof(c, org, 100)),
    ]);
    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => r.ok).length;
    const denied = outcomes.filter((r) => !r.ok && r.code === 'saas_quota_reached:files').length;
    if (succeeded !== 1 || denied !== 1) {
      fail('two concurrent uploads for the last free bytes did not resolve to exactly one success and one denial');
    }
    const sum = await withClient((c) =>
      c.query(`SELECT COALESCE(SUM(size_bytes), 0)::bigint AS s FROM public.patient_files WHERE organization_id = $1`, [org]),
    );
    if (Number(sum.rows[0]?.s) !== 100) fail('expected exactly 100 committed bytes after the race');
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    await Promise.all([a.end(), b.end()]);
  }
}

async function proveUploadWithinLimitPassesAndOverflowFails() {
  const org = '30000000-0000-4000-8000-000000000002';
  const tariff = '40000000-0000-4000-8000-000000000002';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"files":{"kind":"numeric","limit":50}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const within = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 50)));
  if (!within.ok) fail('an upload that exactly fills the remaining bytes must succeed');

  const overflow = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 1)));
  if (overflow.ok || overflow.code !== 'saas_quota_reached:files') {
    fail('an upload past the limit must be denied');
  }
}

async function proveDeletingFreesBytes() {
  const org = '30000000-0000-4000-8000-000000000003';
  const tariff = '40000000-0000-4000-8000-000000000003';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"files":{"kind":"numeric","limit":10}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const seeded = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 10)));
  if (!seeded.ok) fail('seeding the first file at the byte limit must succeed');

  const blocked = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 1)));
  if (blocked.ok || blocked.code !== 'saas_quota_reached:files') {
    fail('a second upload at the byte limit must be denied');
  }

  // Deleting the file's row is the release action: usage is a live SUM, not a stored counter, so
  // no separate "free the slot" step exists — the next SUM simply no longer sees the row.
  await withClient((c) => c.query(`DELETE FROM public.patient_files WHERE id = $1`, [seeded.id]));

  const afterDelete = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 10)));
  if (!afterDelete.ok) fail('deleting the existing file must free its bytes for a new upload');
}

async function proveReadsIgnoreTheLimit() {
  const org = '30000000-0000-4000-8000-000000000004';
  const tariff = '40000000-0000-4000-8000-000000000004';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"files":{"kind":"numeric","limit":1}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));
  // Seed usage far past the configured limit directly (as if the limit was lowered after upload) —
  // §5a stage 5.4 item 2: old files stay visible/downloadable no matter how far over the limit.
  await withClient((c) =>
    c.query(`INSERT INTO public.patient_files (organization_id, size_bytes) VALUES ($1, 999)`, [org]),
  );

  const overLimit = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 1)));
  if (overLimit.ok || overLimit.code !== 'saas_quota_reached:files') {
    fail('a new upload once already over the limit must still be denied');
  }

  // No quota check gates a plain read: the existing over-limit row is still fully listed/selectable.
  const rows = await withClient((c) =>
    c.query(`SELECT size_bytes FROM public.patient_files WHERE organization_id = $1`, [org]),
  );
  if (rows.rows.length !== 1 || Number(rows.rows[0].size_bytes) !== 999) {
    fail('reading existing files must be unaffected by an exhausted storage limit');
  }
}

async function proveNoTariffIsCompatibilityUnlimited() {
  const org = '30000000-0000-4000-8000-000000000005';
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, NULL)`, [org]));
  const first = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 1_000_000)));
  const second = await withClient((c) => runInTransaction(c, (cx) => createFileProof(cx, org, 1_000_000)));
  if (!first.ok || !second.ok) fail('an organization without a tariff must allow unlimited file uploads');
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
  const pgPatientFilesSource = readFileSync(
    path.join(root, 'apps/webapp/src/infra/repos/pgPatientFiles.ts'),
    'utf8',
  );
  const fragments = extractStockQuotaSqlFragments(stockQuotaSource);
  LOCK_SQL = fragments.lockSql;
  CAPACITY_SQL = fragments.capacitySql;
  assertFilesUsageQueryShape(pgPatientFilesSource);

  await installSchema();
  await proveLastBytesRace();
  await proveUploadWithinLimitPassesAndOverflowFails();
  await proveDeletingFreesBytes();
  await proveReadsIgnoreTheLimit();
  await proveNoTariffIsCompatibilityUnlimited();

  console.log(
    'storage quota race proof: OK — last-bytes race, within-limit/overflow, deleting frees bytes, ' +
      'reads ignore the limit, no-tariff compatibility unlimited, all verified against a real ' +
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
