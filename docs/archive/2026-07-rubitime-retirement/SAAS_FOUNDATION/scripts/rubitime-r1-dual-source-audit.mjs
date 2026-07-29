#!/usr/bin/env node
// ARCHIVE ONLY: Rubitime retired 2026-07-27. Do not use as a current operator entrypoint.
throw new Error('ARCHIVE ONLY: retired Rubitime dual-source audit is not executable');

/**
 * R1 Rubitime retirement dual-source audit.
 *
 * Read-only by construction:
 * - refuses non-dev DATABASE_URL values;
 * - uses `BEGIN READ ONLY` / `SET TRANSACTION READ ONLY`;
 * - executes SELECT-only aggregate SQL through psql;
 * - never selects names, phones, emails or payload_json.
 *
 * Output contains aggregate counts and optional hash-only external ids.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
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
  node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs [--threshold-minutes=5] [--sample-size=0] [--allow-test-target]

Requires DATABASE_URL for the dev database. The script also loads local .env and
apps/webapp/.env.dev when present. It refuses /opt env paths and non-dev DB names.

Samples are disabled by default. If --sample-size is set above 0, external ids are
reported as hash-only values with a per-run salt that is not printed.
`);
}

function parseArgs(argv) {
  const args = {
    thresholdMinutes: 5,
    sampleSize: 0,
    allowTestTarget: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--allow-test-target') args.allowTestTarget = true;
    else if (arg.startsWith('--threshold-minutes=')) {
      const n = Number(arg.slice('--threshold-minutes='.length));
      if (Number.isFinite(n) && n >= 0) args.thresholdMinutes = Math.trunc(n);
    } else if (arg.startsWith('--sample-size=')) {
      const n = Number(arg.slice('--sample-size='.length));
      if (Number.isFinite(n) && n >= 0) args.sampleSize = Math.min(100, Math.trunc(n));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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
  // An explicit process URL is the safest input for disposable rehearsal DBs and
  // should not be blocked by unreadable/secret-mounted repo env files.
  if (process.env.DATABASE_URL?.trim()) return [];
  const loaded = [];
  for (const file of DEFAULT_ENV_FILES) {
    if (!existsSync(file)) continue;
    if (file.startsWith('/opt/')) {
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
  const sensitivePathVars = [
    'BASH_ENV',
    'DOTENV_CONFIG_PATH',
    'ENV_FILE',
    'PGPASSFILE',
    'PGSERVICEFILE',
  ];
  for (const key of sensitivePathVars) {
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
  const database = url.pathname.replace(/^\//, '');
  return {
    database,
    host: url.hostname,
    port: url.port || null,
  };
}

function assertDevDatabase(info, allowTestTarget) {
  const name = info.database.toLowerCase();
  const isTest = /(^|[_-])test($|[_-])/i.test(name) || name.endsWith('_test');
  if (allowTestTarget && isTest && !['127.0.0.1', 'localhost', '::1'].includes(info.host)) {
    throw new Error(`Refusing non-loopback TEST database host: ${info.host || '<empty>'}`);
  }
  if (name.includes('prod') || (!name.includes('dev') && !(allowTestTarget && isTest))) {
    throw new Error(`Refusing to query non-dev database name: ${info.database}`);
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

function verifyConnectedDevDatabase(databaseUrl, allowTestTarget) {
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
  const isTest = /(^|[_-])test($|[_-])/i.test(normalized) || normalized.endsWith('_test');
  if (
    normalized.includes('prod') ||
    (!normalized.includes('dev') && !(allowTestTarget && isTest))
  ) {
    throw new Error(`Refusing connected non-dev database: ${currentDatabase || '<empty>'}`);
  }
  return currentDatabase;
}

function buildSql({ thresholdMinutes, sampleSize }) {
  return `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, integrator;
WITH
params AS (
  SELECT ${thresholdMinutes}::int AS threshold_minutes, ${sampleSize}::int AS sample_size
),
table_checks AS (
  SELECT
    to_regclass('public.appointment_records') IS NOT NULL AS has_appointment_records,
    to_regclass('integrator.rubitime_records') IS NOT NULL AS has_integrator_rubitime_records,
    to_regclass('public.be_appointments') IS NOT NULL AS has_be_appointments,
    to_regclass('public.be_external_entity_mappings') IS NOT NULL AS has_be_external_entity_mappings,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appointment_records' AND column_name = 'deleted_at'
    ) AS has_appointment_records_deleted_at,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'be_appointments' AND column_name = 'deleted_at'
    ) AS has_be_appointments_deleted_at,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'be_external_entity_mappings' AND column_name = 'organization_id'
    ) AS has_mapping_organization_id,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'be_external_entity_mappings' AND column_name = 'metadata'
    ) AS has_mapping_metadata
),
legacy AS (
  SELECT
    integrator_record_id AS external_id,
    status,
    record_at,
    updated_at,
    deleted_at
  FROM public.appointment_records
  WHERE integrator_record_id IS NOT NULL
    AND btrim(integrator_record_id) <> ''
),
raw AS (
  SELECT rubitime_record_id AS external_id, status, record_at, updated_at
  FROM integrator.rubitime_records
  WHERE rubitime_record_id IS NOT NULL
    AND btrim(rubitime_record_id) <> ''
),
shared AS (
  SELECT
    l.external_id,
    l.status AS legacy_status,
    r.status AS raw_status,
    l.record_at AS legacy_record_at,
    r.record_at AS raw_record_at,
    l.updated_at AS legacy_updated_at,
    r.updated_at AS raw_updated_at
  FROM legacy l
  JOIN raw r ON r.external_id = l.external_id
),
raw_only AS (
  SELECT r.external_id
  FROM raw r
  LEFT JOIN legacy l ON l.external_id = r.external_id
  WHERE l.external_id IS NULL
),
legacy_only AS (
  SELECT l.external_id
  FROM legacy l
  LEFT JOIN raw r ON r.external_id = l.external_id
  WHERE r.external_id IS NULL
),
status_mismatch AS (
  SELECT external_id
  FROM shared
  WHERE raw_status IS DISTINCT FROM legacy_status
),
record_at_mismatch AS (
  SELECT external_id
  FROM shared, params
  WHERE abs(extract(epoch FROM (raw_record_at - legacy_record_at))) > (params.threshold_minutes * 60)
),
raw_newer_updated_at AS (
  SELECT external_id
  FROM shared, params
  WHERE raw_updated_at IS NOT NULL
    AND legacy_updated_at IS NOT NULL
    AND raw_updated_at > legacy_updated_at + (params.threshold_minutes * interval '1 minute')
),
legacy_newer_updated_at AS (
  SELECT external_id
  FROM shared, params
  WHERE raw_updated_at IS NOT NULL
    AND legacy_updated_at IS NOT NULL
    AND legacy_updated_at > raw_updated_at + (params.threshold_minutes * interval '1 minute')
),
raw_record_at_null_legacy_not_null AS (
  SELECT external_id
  FROM shared
  WHERE raw_record_at IS NULL AND legacy_record_at IS NOT NULL
),
legacy_record_at_null_raw_not_null AS (
  SELECT external_id
  FROM shared
  WHERE legacy_record_at IS NULL AND raw_record_at IS NOT NULL
),
legacy_mapping AS (
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE m.id IS NOT NULL)::int AS mapped,
    count(*) FILTER (WHERE m.id IS NULL)::int AS unmapped,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NULL)::int AS mapped_to_missing_canonical,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL AND a.deleted_at IS NOT NULL)::int AS mapped_to_deleted_canonical,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL AND m.organization_id IS DISTINCT FROM a.organization_id)::int AS organization_mismatch,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL AND a.source IS DISTINCT FROM 'rubitime_projection')::int AS unexpected_canonical_source,
    count(*) FILTER (
      WHERE m.id IS NOT NULL
        AND NOT (
          m.metadata ? 'projectedFrom'
          OR m.metadata ? 'sourceTable'
          OR m.metadata ? 'manualRecovery'
        )
    )::int AS missing_expected_mapping_metadata
  FROM legacy l
  LEFT JOIN public.be_external_entity_mappings m
    ON m.external_system = 'rubitime'
   AND m.entity_type = 'appointment'
   AND m.external_id = l.external_id
  LEFT JOIN public.be_appointments a ON a.id = m.canonical_id
),
raw_mapping AS (
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE m.id IS NOT NULL)::int AS mapped,
    count(*) FILTER (WHERE m.id IS NULL)::int AS unmapped,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NULL)::int AS mapped_to_missing_canonical,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL AND a.deleted_at IS NOT NULL)::int AS mapped_to_deleted_canonical,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL AND m.organization_id IS DISTINCT FROM a.organization_id)::int AS organization_mismatch,
    count(*) FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL AND a.source IS DISTINCT FROM 'rubitime_projection')::int AS unexpected_canonical_source,
    count(*) FILTER (
      WHERE m.id IS NOT NULL
        AND NOT (
          m.metadata ? 'projectedFrom'
          OR m.metadata ? 'sourceTable'
          OR m.metadata ? 'manualRecovery'
        )
    )::int AS missing_expected_mapping_metadata
  FROM raw r
  LEFT JOIN public.be_external_entity_mappings m
    ON m.external_system = 'rubitime'
   AND m.entity_type = 'appointment'
   AND m.external_id = r.external_id
  LEFT JOIN public.be_appointments a ON a.id = m.canonical_id
),
canonical_projection AS (
  SELECT
    count(*)::int AS rubitime_projection_total,
    count(*) FILTER (WHERE deleted_at IS NULL)::int AS rubitime_projection_live,
    max(start_at) AS max_start_at
  FROM public.be_appointments
  WHERE source = 'rubitime_projection'
),
mapping_orphans AS (
  SELECT count(*)::int AS count
  FROM public.be_external_entity_mappings m
  LEFT JOIN public.be_appointments a ON a.id = m.canonical_id
  WHERE m.external_system = 'rubitime'
    AND m.entity_type = 'appointment'
    AND a.id IS NULL
),
mapping_canonical_validation AS (
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE a.id IS NULL)::int AS missing_canonical_appointment,
    count(*) FILTER (WHERE a.id IS NOT NULL AND a.deleted_at IS NOT NULL)::int AS canonical_appointment_deleted,
    count(*) FILTER (WHERE a.id IS NOT NULL AND m.organization_id IS DISTINCT FROM a.organization_id)::int AS organization_mismatch,
    count(*) FILTER (WHERE a.id IS NOT NULL AND a.source IS DISTINCT FROM 'rubitime_projection')::int AS unexpected_canonical_source,
    count(*) FILTER (
      WHERE NOT (
        m.metadata ? 'projectedFrom'
        OR m.metadata ? 'sourceTable'
        OR m.metadata ? 'manualRecovery'
      )
    )::int AS missing_expected_mapping_metadata
  FROM public.be_external_entity_mappings m
  LEFT JOIN public.be_appointments a ON a.id = m.canonical_id
  WHERE m.external_system = 'rubitime'
    AND m.entity_type = 'appointment'
),
mapping_totals AS (
  SELECT
    count(*)::int AS total,
    count(DISTINCT external_id)::int AS distinct_external_ids,
    count(DISTINCT canonical_id)::int AS distinct_canonical_ids
  FROM public.be_external_entity_mappings
  WHERE external_system = 'rubitime'
    AND entity_type = 'appointment'
)
SELECT jsonb_pretty(jsonb_build_object(
  'mode', 'read-only',
  'table_checks', (SELECT row_to_json(table_checks) FROM table_checks),
  'threshold_minutes', (SELECT threshold_minutes FROM params),
  'sources', jsonb_build_object(
    'appointment_records', jsonb_build_object(
      'total_with_non_null_external_id', (SELECT count(*)::int FROM legacy),
      'deleted', (SELECT count(*)::int FROM legacy WHERE deleted_at IS NOT NULL),
      'record_at_null', (SELECT count(*)::int FROM legacy WHERE record_at IS NULL),
      'record_at_not_null', (SELECT count(*)::int FROM legacy WHERE record_at IS NOT NULL),
      'live_created_updated_not_deleted', (SELECT count(*)::int FROM legacy WHERE deleted_at IS NULL AND status IN ('created','updated')),
      'canceled', (SELECT count(*)::int FROM legacy WHERE status = 'canceled'),
      'max_record_at', (SELECT max(record_at) FROM legacy),
      'max_updated_at', (SELECT max(updated_at) FROM legacy)
    ),
    'integrator_rubitime_records', jsonb_build_object(
      'total_with_non_null_external_id', (SELECT count(*)::int FROM raw),
      'record_at_null', (SELECT count(*)::int FROM raw WHERE record_at IS NULL),
      'record_at_not_null', (SELECT count(*)::int FROM raw WHERE record_at IS NOT NULL),
      'live_created_updated', (SELECT count(*)::int FROM raw WHERE status IN ('created','updated')),
      'canceled', (SELECT count(*)::int FROM raw WHERE status = 'canceled'),
      'max_record_at', (SELECT max(record_at) FROM raw),
      'max_updated_at', (SELECT max(updated_at) FROM raw)
    ),
    'canonical_rubitime_projection', (SELECT row_to_json(canonical_projection) FROM canonical_projection)
  ),
  'reconciliation', jsonb_build_object(
    'shared_count', (SELECT count(*)::int FROM shared),
    'raw_only_count', (SELECT count(*)::int FROM raw_only),
    'legacy_only_count', (SELECT count(*)::int FROM legacy_only),
    'status_mismatch_count', (SELECT count(*)::int FROM status_mismatch),
    'record_at_mismatch_count', (SELECT count(*)::int FROM record_at_mismatch),
    'raw_newer_updated_at_count', (SELECT count(*)::int FROM raw_newer_updated_at),
    'legacy_newer_updated_at_count', (SELECT count(*)::int FROM legacy_newer_updated_at),
    'raw_record_at_null_legacy_not_null_count', (SELECT count(*)::int FROM raw_record_at_null_legacy_not_null),
    'legacy_record_at_null_raw_not_null_count', (SELECT count(*)::int FROM legacy_record_at_null_raw_not_null)
  ),
  'mapping_coverage', jsonb_build_object(
    'legacy', (SELECT row_to_json(legacy_mapping) FROM legacy_mapping),
    'raw', (SELECT row_to_json(raw_mapping) FROM raw_mapping),
    'mapping_totals', (SELECT row_to_json(mapping_totals) FROM mapping_totals),
    'canonical_validation', (SELECT row_to_json(mapping_canonical_validation) FROM mapping_canonical_validation),
    'mapping_orphans_without_canonical_appointment', (SELECT count FROM mapping_orphans)
  ),
  'masked_samples', jsonb_build_object(
    'raw_only', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM raw_only ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'legacy_only', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM legacy_only ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'status_mismatch', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM status_mismatch ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'record_at_mismatch', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM record_at_mismatch ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'raw_newer_updated_at', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM raw_newer_updated_at ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'legacy_newer_updated_at', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM legacy_newer_updated_at ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'raw_record_at_null_legacy_not_null', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM raw_record_at_null_legacy_not_null ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'legacy_record_at_null_raw_not_null', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM legacy_record_at_null_raw_not_null ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s)
  )
));
ROLLBACK;
`;
}

function maskExternalId(value, salt) {
  const raw = String(value);
  const hash = createHash('sha256').update(`rubitime-r1:${salt}:${raw}`).digest('hex').slice(0, 16);
  return `sha256:${hash}`;
}

function maskSamples(value, salt) {
  if (Array.isArray(value)) return value.map((item) => maskExternalId(item, salt));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) value[key] = maskSamples(item, salt);
  }
  return value;
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
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set after loading local .env files.');
    process.exit(2);
  }
  const info = databaseInfo(databaseUrl);
  assertDevDatabase(info, args.allowTestTarget);
  const connectedDatabase = verifyConnectedDevDatabase(databaseUrl, args.allowTestTarget);

  const sql = buildSql(args);
  const raw = runPsql(databaseUrl, sql);
  const parsed = JSON.parse(raw);
  parsed.run = {
    script: path.relative(repoRoot, fileURLToPath(import.meta.url)),
    envFilesLoaded: loadedEnvFiles,
    database: info.database,
    connectedDatabase,
    host: info.host,
    port: info.port,
    sampleSize: args.sampleSize,
    explicitTestTarget: args.allowTestTarget,
  };
  parsed.masked_samples = maskSamples(parsed.masked_samples, randomBytes(16).toString('hex'));
  console.log(JSON.stringify(parsed, null, 2));
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`rubitime-r1-dual-source-audit failed: ${message}`);
  process.exit(1);
}
