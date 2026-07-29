#!/usr/bin/env node
// ARCHIVE ONLY: Rubitime retired 2026-07-27. Do not use as a current operator entrypoint.
throw new Error('ARCHIVE ONLY: retired Rubitime state-history proof is not executable');

/**
 * RR-PROOF-02-STATE-HISTORY.
 *
 * Read-only, aggregate-only proof that Rubitime-projected canonical appointments
 * have durable canonical state/history rows and that webapp runtime does not read
 * raw provider event archive (`integrator.rubitime_events`) for product state.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const DEFAULT_ENV_FILES = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, 'apps/webapp/.env.dev'),
];

function usage() {
  console.log(`Usage:
  node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-state-history-proof.mjs

Optional:
  DATABASE_URL='postgresql://.../bcb_*_dev_*' node ...

Output is aggregate-only JSON. The script refuses non-dev DBs and never writes.
`);
}

function parseArgs(argv) {
  const args = { help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parseEnvFile(content) {
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eqIdx = normalized.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = normalized.slice(0, eqIdx).trim();
    let value = normalized.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadLocalEnv() {
  if (process.env.DATABASE_URL?.trim()) return [];
  const loaded = [];
  for (const file of DEFAULT_ENV_FILES) {
    if (!existsSync(file)) continue;
    if (path.resolve(file).startsWith('/opt/')) {
      throw new Error(`Refusing to load production env path: ${file}`);
    }
    const parsed = parseEnvFile(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
    }
    loaded.push(path.relative(repoRoot, file));
  }
  return loaded;
}

function assertNoOptEnvReferences() {
  for (const key of ['BASH_ENV', 'DOTENV_CONFIG_PATH', 'ENV_FILE', 'PGPASSFILE', 'PGSERVICEFILE']) {
    const value = process.env[key];
    if (value && path.resolve(value).startsWith('/opt/')) {
      throw new Error(`Refusing to use /opt-backed environment reference: ${key}`);
    }
  }
}

function databaseInfo(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  return {
    database: url.pathname.replace(/^\//, ''),
    host: url.hostname,
    port: url.port || null,
  };
}

function assertDevDatabase(info) {
  const normalized = info.database.toLowerCase();
  if (!normalized.includes('dev') || normalized.includes('prod')) {
    throw new Error(`Refusing to query non-dev database name: ${info.database}`);
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(info.host)) {
    throw new Error(`Refusing non-loopback database host: ${info.host || '<empty>'}`);
  }
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', databaseUrl], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function verifyConnectedDevDatabase(databaseUrl) {
  const sql = `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT jsonb_build_object('current_database', current_database())::text;
ROLLBACK;
`;
  const parsed = JSON.parse(runPsql(databaseUrl, sql));
  const currentDatabase = String(parsed.current_database ?? '');
  const normalized = currentDatabase.toLowerCase();
  if (!normalized.includes('dev') || normalized.includes('prod')) {
    throw new Error(`Refusing connected non-dev database: ${currentDatabase || '<empty>'}`);
  }
  return currentDatabase;
}

const PROOF_SQL = `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH rubi AS (
  SELECT
    a.id,
    a.deleted_at IS NULL AS live,
    a.status,
    a.source
  FROM public.be_appointments a
  WHERE a.source = 'rubitime_projection'
),
agg AS (
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE live)::int AS live,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.be_appointment_events e WHERE e.appointment_id = r.id))::int AS with_events,
    count(*) FILTER (WHERE live AND EXISTS (SELECT 1 FROM public.be_appointment_events e WHERE e.appointment_id = r.id))::int AS live_with_events,
    count(*) FILTER (WHERE live AND NOT EXISTS (SELECT 1 FROM public.be_appointment_events e WHERE e.appointment_id = r.id))::int AS live_missing_events,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.be_appointment_history_events h WHERE h.appointment_id = r.id))::int AS with_history,
    count(*) FILTER (WHERE live AND EXISTS (SELECT 1 FROM public.be_appointment_history_events h WHERE h.appointment_id = r.id))::int AS live_with_history,
    count(*) FILTER (WHERE live AND NOT EXISTS (SELECT 1 FROM public.be_appointment_history_events h WHERE h.appointment_id = r.id))::int AS live_missing_history,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.be_appointment_history_events h
        WHERE h.appointment_id = r.id
          AND h.event_type IN (
            'projected_from_rubitime',
            'rubitime_projection_synced',
            'rubitime_projection_mapping_recovered'
          )
      )
    )::int AS with_rubitime_baseline_or_sync_history,
    count(*) FILTER (
      WHERE live AND NOT EXISTS (
        SELECT 1
        FROM public.be_appointment_history_events h
        WHERE h.appointment_id = r.id
          AND h.event_type IN (
            'projected_from_rubitime',
            'rubitime_projection_synced',
            'rubitime_projection_mapping_recovered'
          )
      )
    )::int AS live_missing_rubitime_baseline_or_sync_history
  FROM rubi r
),
status_buckets AS (
  SELECT status, count(*)::int AS count FROM rubi WHERE live GROUP BY status ORDER BY status
),
event_buckets AS (
  SELECT e.event_type, count(*)::int AS count
  FROM public.be_appointment_events e
  JOIN rubi r ON r.id = e.appointment_id
  GROUP BY e.event_type
),
history_buckets AS (
  SELECT h.event_type, count(*)::int AS count
  FROM public.be_appointment_history_events h
  JOIN rubi r ON r.id = h.appointment_id
  GROUP BY h.event_type
),
table_counts AS (
  SELECT jsonb_build_object(
    'be_appointments_rubitime_projection', (SELECT count(*)::int FROM rubi),
    'be_appointment_events', (SELECT count(*)::int FROM public.be_appointment_events),
    'be_appointment_history_events', (SELECT count(*)::int FROM public.be_appointment_history_events),
    'integrator_rubitime_events', (SELECT count(*)::int FROM integrator.rubitime_events),
    'integrator_rubitime_records', (SELECT count(*)::int FROM integrator.rubitime_records),
    'appointment_records', (SELECT count(*)::int FROM public.appointment_records)
  ) AS value
)
SELECT jsonb_pretty(jsonb_build_object(
  'state_history_verdict',
    CASE
      WHEN (SELECT live_missing_events FROM agg) = 0
       AND (SELECT live_missing_history FROM agg) = 0
       AND (SELECT live_missing_rubitime_baseline_or_sync_history FROM agg) = 0
      THEN 'PASS'
      ELSE 'FAIL'
    END,
  'rubitime_projection_coverage', (SELECT to_jsonb(agg) FROM agg),
  'live_status_buckets', (SELECT coalesce(jsonb_object_agg(status, count), '{}'::jsonb) FROM status_buckets),
  'appointment_event_types', (SELECT coalesce(jsonb_object_agg(event_type, count), '{}'::jsonb) FROM event_buckets),
  'appointment_history_event_types', (SELECT coalesce(jsonb_object_agg(event_type, count), '{}'::jsonb) FROM history_buckets),
  'table_counts', (SELECT value FROM table_counts)
));
ROLLBACK;
`;

function rgFiles(pattern, roots) {
  const result = spawnSync('rg', ['-l', pattern, ...roots], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr.trim() || `rg exited ${result.status}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  assertNoOptEnvReferences();
  const loadedEnvFiles = loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not set after loading local env files');
  const info = databaseInfo(databaseUrl);
  assertDevDatabase(info);
  const connectedDatabase = verifyConnectedDevDatabase(databaseUrl);
  const proof = JSON.parse(runPsql(databaseUrl, PROOF_SQL));
  proof.run = {
    script: path.relative(repoRoot, fileURLToPath(import.meta.url)),
    envFilesLoaded: loadedEnvFiles,
    database: info.database,
    connectedDatabase,
    host: info.host,
    port: info.port,
  };
  proof.static_refs = {
    webapp_src_rubitime_events_files: rgFiles('rubitime_events', ['apps/webapp/src']),
    integrator_src_rubitime_events_files: rgFiles('rubitime_events', ['apps/integrator/src']),
  };
  proof.safety = {
    readOnly: true,
    aggregateOnly: true,
    noRowSamples: true,
    noPiiFieldsPrinted: true,
    noRuntimeRawProviderEventReadClaim: proof.static_refs.webapp_src_rubitime_events_files.every(
      (file) => file === 'apps/webapp/src/infra/platformUserFullPurge.ts',
    ),
  };
  console.log(JSON.stringify(proof, null, 2));
  if (proof.state_history_verdict !== 'PASS') process.exitCode = 2;
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`rubitime-r1-state-history-proof failed: ${message}`);
  process.exit(1);
}
