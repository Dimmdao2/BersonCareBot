#!/usr/bin/env node
/**
 * #1069 §5a stage 5.3/5.7 — executable last-slot proof for the `branches` квота.
 *
 * Extracts the verbatim SQL text `assertStockQuotaAvailable` (src/infra/repos/stockQuotaCheck.ts)
 * and `createPhysicalBranchWithDefaultColor`'s usage-count query
 * (src/infra/repos/pgBookingEngine.ts) issue, and replays them through a real, disposable
 * PostgreSQL 16 server with two concurrent connections — same pattern as
 * check-c4a-843-clinic-invite-concurrency.mjs. Never reads application env or a configured DB.
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
  throw new Error(`branches quota race proof failed: ${message}`);
}

// ---------------------------------------------------------------------------
// Extraction: pull the exact SQL text out of the real production sources.
// ---------------------------------------------------------------------------

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

export function extractBranchesUsageSql(bookingEngineSource) {
  const marker = "assertStockQuotaAvailable(tx, input.organizationId, 'branches'";
  const start = bookingEngineSource.indexOf(marker);
  if (start < 0) fail('could not locate the branches assertStockQuotaAvailable call');
  const slice = bookingEngineSource.slice(start);
  const match = slice.match(/`([^`]*)`/s);
  if (!match) fail('could not locate the branches usage-count SQL fragment');
  return match[1];
}

// ---------------------------------------------------------------------------
// Private disposable PostgreSQL 16 cluster.
// ---------------------------------------------------------------------------

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_branches_quota_race_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const db = `bcb_branches_quota_race_${stamp}`;
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
      CREATE TABLE public.be_branches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        title text NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);
  });
}

/** Faithful replay of `createPhysicalBranchWithDefaultColor`'s quota-then-insert control flow. */
async function createBranchProof(connection, organizationId, title) {
  await connection.query(LOCK_SQL, [`saas_quota:branches:${organizationId}`]);
  const capacity = await connection.query(CAPACITY_SQL, [organizationId, 'branches']);
  const row = capacity.rows[0];
  if (row?.tariff_id) {
    const quota = row.quota_json;
    if (!quota || (quota.kind !== 'numeric' && quota.kind !== 'unlimited')) {
      return { ok: false, code: 'saas_quota_reached:branches' };
    }
    if (quota.kind === 'numeric') {
      if (quota.limit === null) return { ok: false, code: 'saas_quota_reached:branches' };
      const usage = await connection.query(USAGE_SQL, [organizationId]);
      const used = usage.rows[0]?.used_value ?? 0;
      if (used >= quota.limit) return { ok: false, code: 'saas_quota_reached:branches' };
    }
  }

  const inserted = await connection.query(
    `INSERT INTO public.be_branches (organization_id, title, is_active) VALUES ($1, $2, true) RETURNING id`,
    [organizationId, title],
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

async function proveLastSlotRace() {
  const org = '20000000-0000-4000-8000-000000000001';
  const tariff = '10000000-0000-4000-8000-000000000001';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"branches":{"kind":"numeric","limit":1}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const a = client();
  const b = client();
  await Promise.all([a.connect(), b.connect()]);
  try {
    const [resultA, resultB] = await Promise.all([
      runInTransaction(a, (c) => createBranchProof(c, org, 'Branch A')),
      runInTransaction(b, (c) => createBranchProof(c, org, 'Branch B')),
    ]);
    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => r.ok).length;
    const denied = outcomes.filter((r) => !r.ok && r.code === 'saas_quota_reached:branches').length;
    if (succeeded !== 1 || denied !== 1) {
      fail('two concurrent branch creates at the final slot did not resolve to exactly one success and one denial');
    }
    const count = await withClient((c) =>
      c.query(`SELECT count(*)::int AS c FROM public.be_branches WHERE organization_id = $1`, [org]),
    );
    if (count.rows[0]?.c !== 1) fail('expected exactly one committed branch after the race');
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    await Promise.all([a.end(), b.end()]);
  }
}

async function proveDeactivatingFreesSlot() {
  const org = '20000000-0000-4000-8000-000000000002';
  const tariff = '10000000-0000-4000-8000-000000000002';
  await withClient((c) =>
    c.query(
      `INSERT INTO public.saas_tariffs (id, quotas) VALUES ($1, '{"branches":{"kind":"numeric","limit":1}}')`,
      [tariff],
    ),
  );
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, $2)`, [org, tariff]));

  const seeded = await withClient((c) => runInTransaction(c, (cx) => createBranchProof(cx, org, 'First')));
  if (!seeded.ok) fail('seeding the first branch at the limit must succeed');

  const blocked = await withClient((c) => runInTransaction(c, (cx) => createBranchProof(cx, org, 'Second')));
  if (blocked.ok || blocked.code !== 'saas_quota_reached:branches') {
    fail('a second branch at the limit must be denied');
  }

  // Deactivating an existing branch frees its slot (§5a 5.3: the release action for this mechanic).
  await withClient((c) => c.query(`UPDATE public.be_branches SET is_active = false WHERE id = $1`, [seeded.id]));

  const afterDeactivate = await withClient((c) => runInTransaction(c, (cx) => createBranchProof(cx, org, 'Third')));
  if (!afterDeactivate.ok) fail('deactivating the existing branch must free its slot for a new one');
}

async function proveNoTariffIsCompatibilityUnlimited() {
  const org = '20000000-0000-4000-8000-000000000003';
  await withClient((c) => c.query(`INSERT INTO public.be_organizations (id, tariff_id) VALUES ($1, NULL)`, [org]));
  const first = await withClient((c) => runInTransaction(c, (cx) => createBranchProof(cx, org, 'A')));
  const second = await withClient((c) => runInTransaction(c, (cx) => createBranchProof(cx, org, 'B')));
  if (!first.ok || !second.ok) fail('an organization without a tariff must allow unlimited branch creation');
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
  const bookingEngineSource = readFileSync(
    path.join(root, 'apps/webapp/src/infra/repos/pgBookingEngine.ts'),
    'utf8',
  );
  const fragments = extractStockQuotaSqlFragments(stockQuotaSource);
  LOCK_SQL = fragments.lockSql;
  CAPACITY_SQL = fragments.capacitySql;
  USAGE_SQL = extractBranchesUsageSql(bookingEngineSource);

  await installSchema();
  await proveLastSlotRace();
  await proveDeactivatingFreesSlot();
  await proveNoTariffIsCompatibilityUnlimited();

  console.log(
    'branches quota race proof: OK — last-slot race, deactivating frees a slot, no-tariff ' +
      'compatibility unlimited, all verified against a real private PostgreSQL 16 server',
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
