#!/usr/bin/env node
/**
 * R1 Rubitime retirement dual-source audit.
 *
 * Read-only by construction:
 * - refuses non-dev DATABASE_URL values;
 * - uses `BEGIN READ ONLY` / `SET TRANSACTION READ ONLY`;
 * - executes SELECT-only aggregate SQL through psql;
 * - never selects names, phones, emails or payload_json.
 *
 * Output contains aggregate counts and masked/hash-short external ids only.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const DEFAULT_ENV_FILES = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, "apps/webapp/.env.dev"),
];

function usage() {
  console.log(`Usage:
  node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs [--threshold-minutes=5] [--sample-size=20]

Requires DATABASE_URL for the dev database. The script also loads local .env and
apps/webapp/.env.dev when present. It refuses /opt env paths and non-dev DB names.
`);
}

function parseArgs(argv) {
  const args = {
    thresholdMinutes: 5,
    sampleSize: 20,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--threshold-minutes=")) {
      const n = Number(arg.slice("--threshold-minutes=".length));
      if (Number.isFinite(n) && n >= 0) args.thresholdMinutes = Math.trunc(n);
    } else if (arg.startsWith("--sample-size=")) {
      const n = Number(arg.slice("--sample-size=".length));
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
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eqIdx = normalized.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = normalized.slice(0, eqIdx).trim();
    let value = normalized.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadLocalEnv() {
  const loaded = [];
  for (const file of DEFAULT_ENV_FILES) {
    if (!existsSync(file)) continue;
    if (file.startsWith("/opt/")) {
      throw new Error(`Refusing to load production env path: ${file}`);
    }
    const parsed = parseEnvFile(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
    }
    loaded.push(path.relative(repoRoot, file));
  }
  return loaded;
}

function databaseInfo(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const database = url.pathname.replace(/^\//, "");
  return {
    database,
    host: url.hostname,
    port: url.port || null,
  };
}

function assertDevDatabase(info) {
  const name = info.database.toLowerCase();
  if (!name.includes("dev") || name.includes("prod")) {
    throw new Error(`Refusing to query non-dev database name: ${info.database}`);
  }
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
    to_regclass('public.be_external_entity_mappings') IS NOT NULL AS has_be_external_entity_mappings
),
legacy AS (
  SELECT integrator_record_id AS external_id, status, record_at, updated_at
  FROM public.appointment_records
  WHERE deleted_at IS NULL AND record_at IS NOT NULL
),
raw AS (
  SELECT rubitime_record_id AS external_id, status, record_at, updated_at
  FROM integrator.rubitime_records
  WHERE record_at IS NOT NULL
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
legacy_mapping AS (
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE m.id IS NOT NULL)::int AS mapped,
    count(*) FILTER (WHERE m.id IS NULL)::int AS unmapped
  FROM legacy l
  LEFT JOIN public.be_external_entity_mappings m
    ON m.external_system = 'rubitime'
   AND m.entity_type = 'appointment'
   AND m.external_id = l.external_id
),
raw_mapping AS (
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE m.id IS NOT NULL)::int AS mapped,
    count(*) FILTER (WHERE m.id IS NULL)::int AS unmapped
  FROM raw r
  LEFT JOIN public.be_external_entity_mappings m
    ON m.external_system = 'rubitime'
   AND m.entity_type = 'appointment'
   AND m.external_id = r.external_id
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
      'total_with_record_at_not_deleted', (SELECT count(*)::int FROM legacy),
      'live_created_updated', (SELECT count(*)::int FROM legacy WHERE status IN ('created','updated')),
      'canceled', (SELECT count(*)::int FROM legacy WHERE status = 'canceled'),
      'max_record_at', (SELECT max(record_at) FROM legacy),
      'max_updated_at', (SELECT max(updated_at) FROM legacy)
    ),
    'integrator_rubitime_records', jsonb_build_object(
      'total_with_record_at', (SELECT count(*)::int FROM raw),
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
    'raw_newer_updated_at_count', (SELECT count(*)::int FROM raw_newer_updated_at)
  ),
  'mapping_coverage', jsonb_build_object(
    'legacy', (SELECT row_to_json(legacy_mapping) FROM legacy_mapping),
    'raw', (SELECT row_to_json(raw_mapping) FROM raw_mapping),
    'mapping_totals', (SELECT row_to_json(mapping_totals) FROM mapping_totals),
    'mapping_orphans_without_canonical_appointment', (SELECT count FROM mapping_orphans)
  ),
  'masked_samples', jsonb_build_object(
    'raw_only', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM raw_only ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'legacy_only', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM legacy_only ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'status_mismatch', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM status_mismatch ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'record_at_mismatch', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM record_at_mismatch ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s),
    'raw_newer_updated_at', (SELECT coalesce(jsonb_agg(external_id), '[]'::jsonb) FROM (SELECT external_id FROM raw_newer_updated_at ORDER BY external_id LIMIT (SELECT sample_size FROM params)) s)
  )
));
ROLLBACK;
`;
}

function maskExternalId(value) {
  const raw = String(value);
  const hash = createHash("sha256").update(`rubitime-r1:${raw}`).digest("hex").slice(0, 12);
  const tail = raw.length > 4 ? raw.slice(-4) : raw;
  return `sha256:${hash}:tail:${tail}`;
}

function maskSamples(value) {
  if (Array.isArray(value)) return value.map(maskExternalId);
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) value[key] = maskSamples(item);
  }
  return value;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const loadedEnvFiles = loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set after loading local .env files.");
    process.exit(2);
  }
  const info = databaseInfo(databaseUrl);
  assertDevDatabase(info);

  const sql = buildSql(args);
  const result = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", databaseUrl], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  const raw = result.stdout.trim();
  const parsed = JSON.parse(raw);
  parsed.run = {
    script: path.relative(repoRoot, fileURLToPath(import.meta.url)),
    envFilesLoaded: loadedEnvFiles,
    database: info.database,
    host: info.host,
    port: info.port,
  };
  parsed.masked_samples = maskSamples(parsed.masked_samples);
  console.log(JSON.stringify(parsed, null, 2));
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`rubitime-r1-dual-source-audit failed: ${message}`);
  process.exit(1);
}
