#!/usr/bin/env node
// ARCHIVE ONLY: Rubitime retired 2026-07-27. Do not use as a current operator entrypoint.
throw new Error('ARCHIVE ONLY: retired Rubitime blocker classifier is not executable');

/**
 * R1 Rubitime retirement blocker classifier.
 *
 * Read-only and PII-safe by construction:
 * - loads only repo-local dev env files;
 * - refuses /opt env references and non-dev DATABASE_URL values;
 * - runs inside `BEGIN READ ONLY`;
 * - never prints row ids, names, phones, emails, payloads or external ids.
 *
 * The output is owner-facing aggregate JSON for R1 decisions only. It does not
 * authorize cleanup, R2, table drops or runtime removal.
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
const DEFAULT_CSV =
  '/home/dev/.codex/attachments/93a21b5a-de4f-4138-9bac-7ff81cf31aaa/records-2.csv';
const TEST_BLOCK_NAME_MARKERS = ['тест', 'test', 'блок окна'];

function usage() {
  console.log(`Usage:
  node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs [--csv=<path>] [--allow-test-target]

Default CSV path:
  ${DEFAULT_CSV}

The script prints aggregate JSON only. It refuses non-dev DBs and never writes.
`);
}

function parseArgs(argv) {
  const args = { csvPath: DEFAULT_CSV, allowTestTarget: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--allow-test-target') args.allowTestTarget = true;
    else if (arg.startsWith('--csv=')) args.csvPath = arg.slice('--csv='.length).trim();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.csvPath) throw new Error('--csv path is empty');
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

function assertDevDatabase(info, allowTestTarget) {
  const normalized = info.database.toLowerCase();
  const isTest = /(^|[_-])test($|[_-])/i.test(normalized) || normalized.endsWith('_test');
  if (allowTestTarget && isTest && !['127.0.0.1', 'localhost', '::1'].includes(info.host)) {
    throw new Error(`Refusing non-loopback TEST database host: ${info.host || '<empty>'}`);
  }
  if (
    normalized.includes('prod') ||
    (!normalized.includes('dev') && !(allowTestTarget && isTest))
  ) {
    throw new Error(`Refusing to query non-dev database name: ${info.database}`);
  }
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let inQuotes = false;
  let row = [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseRuDay(raw) {
  const match = String(raw ?? '')
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function loadCsvShape(csvPath) {
  if (!existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  const content = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);
  const ids = new Set();
  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const row of rows.slice(1)) {
    const id = String(row[0] ?? '').trim();
    if (id) ids.add(id);
    const day = parseRuDay(row[10] ?? '');
    if (day != null) {
      minDay = Math.min(minDay, day);
      maxDay = Math.max(maxDay, day);
    }
  }
  if (ids.size === 0 || !Number.isFinite(minDay) || !Number.isFinite(maxDay)) {
    throw new Error('CSV has no parseable Rubitime ids/date span');
  }
  return {
    basename: path.basename(csvPath),
    physicalLines: content.endsWith('\n')
      ? content.split(/\r?\n/).length - 1
      : content.split(/\r?\n/).length,
    headerFields: rows[0]?.length ?? 0,
    parsedRubitimeIds: ids.size,
    minIso: new Date(minDay).toISOString(),
    maxIso: new Date(maxDay).toISOString(),
    maxExclusiveIso: new Date(maxDay + 86_400_000).toISOString(),
    ids: [...ids],
  };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonDollar(value) {
  return `$rubitime_r1_json$${JSON.stringify(value)}$rubitime_r1_json$::jsonb`;
}

function sqlTextArray(values) {
  return `ARRAY[${values.map((value) => sqlString(value)).join(', ')}]::text[]`;
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', databaseUrl], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
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

function buildSql(csv) {
  const csvIdsJson = jsonDollar(csv.ids);
  const minIso = sqlString(csv.minIso);
  const maxExclusiveIso = sqlString(csv.maxExclusiveIso);
  const testMarkers = sqlTextArray(TEST_BLOCK_NAME_MARKERS);

  return `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '45s';
SET LOCAL search_path = public, integrator;
WITH
params AS (
  SELECT
    ${minIso}::timestamptz AS csv_min_at,
    ${maxExclusiveIso}::timestamptz AS csv_max_exclusive_at,
    ${testMarkers} AS test_markers
),
csv_ids AS (
  SELECT value AS external_id FROM jsonb_array_elements_text(${csvIdsJson})
),
solo_specialist AS (
  SELECT CASE WHEN count(*) = 1 THEN min(id::text)::uuid ELSE NULL END AS id
  FROM public.be_specialists
  WHERE is_active = true
),
default_org AS (
  SELECT min(organization_id::text)::uuid AS id
  FROM public.be_specialists
),
mapping_refs AS (
  SELECT external_system, entity_type, external_id, min(canonical_id::text)::uuid AS canonical_id
  FROM public.be_external_entity_mappings
  WHERE external_system = 'rubitime'
  GROUP BY external_system, entity_type, external_id
),
legacy_base AS (
  SELECT
    ar.integrator_record_id AS external_id,
    ar.status,
    ar.record_at,
    ar.updated_at,
    ar.deleted_at,
    ar.platform_user_id,
    ar.phone_normalized,
    coalesce(ar.payload_json->>'branch_id', ar.payload_json->>'rubitime_branch_id', ar.payload_json->>'branchId') AS rubitime_branch_id,
    coalesce(ar.payload_json->>'service_id', ar.payload_json->>'rubitime_service_id') AS rubitime_service_id,
    coalesce(ar.payload_json->>'cooperator_id', ar.payload_json->>'rubitime_cooperator_id', ar.payload_json->>'specialist_id') AS rubitime_cooperator_id,
    CASE
      WHEN coalesce(ar.payload_json->>'duration_minutes', ar.payload_json->>'durationMinutes', ar.payload_json->>'service_duration', ar.payload_json->>'duration') ~ '^[0-9]+(\\.[0-9]+)?$'
      THEN greatest(1, round(coalesce(ar.payload_json->>'duration_minutes', ar.payload_json->>'durationMinutes', ar.payload_json->>'service_duration', ar.payload_json->>'duration')::numeric))::int
      ELSE 60
    END AS duration_minutes,
    (
      EXISTS (
        SELECT 1 FROM params, unnest(test_markers) marker
        WHERE lower(coalesce(ar.payload_json->>'name', ar.payload_json->>'contact_name', '')) LIKE '%' || marker || '%'
      )
    ) AS test_like
  FROM public.appointment_records ar
  WHERE ar.integrator_record_id IS NOT NULL
    AND btrim(ar.integrator_record_id) <> ''
),
legacy AS (
  SELECT
    lb.*,
    lb.record_at + (lb.duration_minutes * interval '1 minute') AS computed_end_at,
    c.external_id IS NOT NULL AS present_in_owner_csv,
    rr.rubitime_record_id IS NOT NULL AS present_in_integrator_raw,
    mb.canonical_id AS mapped_branch_id,
    coalesce(ms.canonical_id, ma.canonical_id) AS mapped_service_id,
    mc.canonical_id AS mapped_specialist_id,
    coalesce(mc.canonical_id, (SELECT id FROM solo_specialist)) AS resolved_specialist_id,
    mm.canonical_id AS mapped_appointment_id,
    a.id AS canonical_id,
    a.deleted_at AS canonical_deleted_at,
    a.source AS canonical_source,
    a.status AS canonical_status
  FROM legacy_base lb
  LEFT JOIN csv_ids c ON c.external_id = lb.external_id
  LEFT JOIN integrator.rubitime_records rr ON rr.rubitime_record_id = lb.external_id
  LEFT JOIN mapping_refs mb ON mb.entity_type = 'branch' AND mb.external_id = lb.rubitime_branch_id
  LEFT JOIN mapping_refs ms ON ms.entity_type = 'service' AND ms.external_id = lb.rubitime_service_id
  LEFT JOIN mapping_refs ma ON ma.entity_type = 'availability' AND ma.external_id = lb.rubitime_service_id
  LEFT JOIN mapping_refs mc ON mc.entity_type = 'specialist' AND mc.external_id = lb.rubitime_cooperator_id
  LEFT JOIN mapping_refs mm ON mm.entity_type = 'appointment' AND mm.external_id = lb.external_id
  LEFT JOIN public.be_appointments a ON a.id = mm.canonical_id
),
raw AS (
  SELECT rubitime_record_id AS external_id, status, record_at, updated_at
  FROM integrator.rubitime_records
  WHERE rubitime_record_id IS NOT NULL
    AND btrim(rubitime_record_id) <> ''
),
live AS (
  SELECT *
  FROM legacy, params
  WHERE deleted_at IS NULL
    AND record_at IS NOT NULL
),
stale AS (
  SELECT *
  FROM live, params
  WHERE NOT present_in_owner_csv
    AND record_at >= params.csv_min_at
    AND record_at < params.csv_max_exclusive_at
),
duplicate_members AS (
  SELECT l.*,
    count(*) OVER (PARTITION BY l.record_at, coalesce(l.phone_normalized, '')) AS cluster_size,
    count(*) FILTER (WHERE l.status = 'canceled') OVER (PARTITION BY l.record_at, coalesce(l.phone_normalized, '')) AS cluster_canceled_rows,
    count(*) FILTER (WHERE l.status <> 'canceled') OVER (PARTITION BY l.record_at, coalesce(l.phone_normalized, '')) AS cluster_non_canceled_rows,
    count(l.mapped_appointment_id) OVER (PARTITION BY l.record_at, coalesce(l.phone_normalized, '')) AS cluster_mapped_rows,
    count(*) FILTER (
      WHERE NOT l.present_in_owner_csv
        AND l.record_at >= (SELECT csv_min_at FROM params)
        AND l.record_at < (SELECT csv_max_exclusive_at FROM params)
    ) OVER (PARTITION BY l.record_at, coalesce(l.phone_normalized, '')) AS cluster_stale_rows
  FROM live l
),
duplicate_rows AS (
  SELECT * FROM duplicate_members WHERE cluster_size > 1
),
duplicate_clusters AS (
  SELECT
    record_at,
    coalesce(phone_normalized, '') AS phone_key,
    count(*)::int AS row_count,
    count(*) FILTER (WHERE status = 'canceled')::int AS canceled_rows,
    count(*) FILTER (WHERE status <> 'canceled')::int AS non_canceled_rows,
    count(mapped_appointment_id)::int AS mapped_rows,
    count(*) FILTER (WHERE mapped_appointment_id IS NULL)::int AS unmapped_rows,
    count(*) FILTER (
      WHERE NOT present_in_owner_csv
        AND record_at >= (SELECT csv_min_at FROM params)
        AND record_at < (SELECT csv_max_exclusive_at FROM params)
    )::int AS stale_rows
  FROM duplicate_members
  WHERE cluster_size > 1
  GROUP BY record_at, coalesce(phone_normalized, '')
),
unmapped_real_active AS (
  SELECT *
  FROM live
  WHERE mapped_appointment_id IS NULL
    AND status <> 'canceled'
    AND NOT test_like
),
recoverable_same_slot AS (
  SELECT u.external_id, count(a.id)::int AS count
  FROM unmapped_real_active u
  JOIN public.be_appointments a
    ON a.organization_id = coalesce(
      (SELECT organization_id FROM public.be_specialists WHERE id = u.resolved_specialist_id),
      (SELECT id FROM default_org)
    )
   AND a.source = 'rubitime_projection'
   AND a.deleted_at IS NULL
   AND a.start_at = u.record_at
   AND a.end_at = u.computed_end_at
   AND (
     u.phone_normalized IS NULL
     OR a.phone_normalized IS NOT DISTINCT FROM u.phone_normalized
   )
  GROUP BY u.external_id
),
recoverable_near_slot AS (
  SELECT u.external_id, count(a.id)::int AS count
  FROM unmapped_real_active u
  JOIN public.be_appointments a
    ON a.source = 'rubitime_projection'
   AND a.deleted_at IS NULL
   AND u.phone_normalized IS NOT NULL
   AND a.phone_normalized IS NOT DISTINCT FROM u.phone_normalized
   AND u.resolved_specialist_id IS NOT NULL
   AND a.specialist_id IS NOT DISTINCT FROM u.resolved_specialist_id
   AND abs(extract(epoch FROM (a.start_at - u.record_at))) <= 120
   AND abs(extract(epoch FROM (a.end_at - u.computed_end_at))) <= 120
  GROUP BY u.external_id
),
slot_conflicts AS (
  SELECT u.external_id, count(a.id)::int AS count
  FROM unmapped_real_active u
  JOIN public.be_appointments a
    ON u.resolved_specialist_id IS NOT NULL
   AND a.specialist_id = u.resolved_specialist_id
   AND a.deleted_at IS NULL
   AND a.status <> ALL (ARRAY[
      'cancelled_by_patient'::text,
      'cancelled_by_specialist'::text,
      'late_cancellation'::text,
      'no_show'::text,
      'completed'::text,
      'visit_confirmed'::text
    ])
   AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(u.record_at, u.computed_end_at, '[)')
  GROUP BY u.external_id
),
unmapped_real_active_classified AS (
  SELECT
    u.*,
    (dm.external_id IS NOT NULL) AS duplicate_overlap,
    (s.external_id IS NOT NULL) AS stale_overlap,
    coalesce(rss.count, 0) + coalesce(rns.count, 0) AS recoverable_existing_count,
    coalesce(sc.count, 0) AS slot_conflict_count,
    CASE
      WHEN s.external_id IS NOT NULL THEN 'blocked_stale_vs_owner_csv'
      WHEN dm.external_id IS NOT NULL THEN 'needs_manual_duplicate_review'
      WHEN coalesce(sc.count, 0) > 0 AND coalesce(rss.count, 0) + coalesce(rns.count, 0) = 0 THEN 'needs_manual_slot_conflict_or_mapping_fix'
      WHEN u.resolved_specialist_id IS NULL THEN 'script_may_insert_but_missing_specialist_mapping'
      WHEN coalesce(rss.count, 0) + coalesce(rns.count, 0) > 0 THEN 'likely_recoverable_by_current_script'
      ELSE 'likely_insertable_by_current_script'
    END AS importability_bucket
  FROM unmapped_real_active u
  LEFT JOIN (SELECT DISTINCT external_id FROM duplicate_rows) dm ON dm.external_id = u.external_id
  LEFT JOIN stale s ON s.external_id = u.external_id
  LEFT JOIN recoverable_same_slot rss ON rss.external_id = u.external_id
  LEFT JOIN recoverable_near_slot rns ON rns.external_id = u.external_id
  LEFT JOIN slot_conflicts sc ON sc.external_id = u.external_id
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
legacy_only AS (
  SELECT l.*
  FROM legacy l
  LEFT JOIN raw r ON r.external_id = l.external_id
  WHERE r.external_id IS NULL
),
status_mismatch AS (
  SELECT * FROM shared WHERE raw_status IS DISTINCT FROM legacy_status
),
record_at_mismatch AS (
  SELECT *
  FROM shared
  WHERE abs(extract(epoch FROM (raw_record_at - legacy_record_at))) > 300
),
mapping_anomalies AS (
  SELECT
    l.*,
    CASE
      WHEN l.mapped_appointment_id IS NULL THEN 'unmapped'
      WHEN l.canonical_id IS NULL THEN 'mapped_to_missing_canonical'
      WHEN l.canonical_deleted_at IS NOT NULL THEN 'mapped_to_deleted_canonical'
      WHEN l.canonical_source IS DISTINCT FROM 'rubitime_projection' THEN 'unexpected_canonical_source'
      ELSE 'mapped_expected'
    END AS mapping_state,
    NOT (
      m.metadata ? 'projectedFrom'
      OR m.metadata ? 'sourceTable'
      OR m.metadata ? 'manualRecovery'
    ) AS missing_expected_mapping_metadata
  FROM legacy l
  LEFT JOIN public.be_external_entity_mappings m
    ON m.external_system = 'rubitime'
   AND m.entity_type = 'appointment'
   AND m.external_id = l.external_id
),
mapping_anomaly_rows AS (
  SELECT *
  FROM mapping_anomalies
  WHERE mapping_state <> 'mapped_expected'
     OR missing_expected_mapping_metadata
),
month_counts_stale AS (
  SELECT to_char(record_at AT TIME ZONE 'Europe/Moscow', 'YYYY-MM') AS bucket, count(*)::int AS count
  FROM stale GROUP BY 1 ORDER BY 1
),
month_counts_unmapped AS (
  SELECT to_char(record_at AT TIME ZONE 'Europe/Moscow', 'YYYY-MM') AS bucket, count(*)::int AS count
  FROM unmapped_real_active_classified GROUP BY 1 ORDER BY 1
),
month_counts_legacy_only AS (
  SELECT to_char(record_at AT TIME ZONE 'Europe/Moscow', 'YYYY-MM') AS bucket, count(*)::int AS count
  FROM legacy_only WHERE record_at IS NOT NULL GROUP BY 1 ORDER BY 1
)
SELECT jsonb_pretty(jsonb_build_object(
  'mode', 'read-only aggregate classification',
  'stale_vs_owner_csv', jsonb_build_object(
    'total', (SELECT count(*)::int FROM stale),
    'status_buckets', (SELECT coalesce(jsonb_object_agg(status, count), '{}'::jsonb) FROM (SELECT status, count(*)::int AS count FROM stale GROUP BY status ORDER BY status) s),
    'month_buckets', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', bucket, 'count', count)), '[]'::jsonb) FROM month_counts_stale),
    'mapping_buckets', (SELECT coalesce(jsonb_object_agg(mapping_state, count), '{}'::jsonb) FROM (SELECT CASE WHEN mapped_appointment_id IS NULL THEN 'unmapped' WHEN canonical_id IS NULL THEN 'mapped_to_missing_canonical' WHEN canonical_deleted_at IS NOT NULL THEN 'mapped_to_deleted_canonical' ELSE 'mapped_to_existing_canonical' END AS mapping_state, count(*)::int AS count FROM stale GROUP BY 1 ORDER BY 1) s),
    'raw_presence', (SELECT jsonb_build_object('present_in_integrator_raw', count(*) FILTER (WHERE present_in_integrator_raw), 'absent_from_integrator_raw', count(*) FILTER (WHERE NOT present_in_integrator_raw)) FROM stale),
    'safety_buckets', (SELECT jsonb_build_object('cancelled', count(*) FILTER (WHERE status = 'canceled'), 'active_non_test', count(*) FILTER (WHERE status <> 'canceled' AND NOT test_like), 'test_like', count(*) FILTER (WHERE test_like)) FROM stale),
    'duplicate_overlap_rows', (SELECT count(*)::int FROM stale s JOIN duplicate_rows d ON d.external_id = s.external_id),
    'owner_csv_presence', jsonb_build_object('present', 0, 'absent_within_csv_range', (SELECT count(*)::int FROM stale))
  ),
  'unmapped_real_active', jsonb_build_object(
    'total', (SELECT count(*)::int FROM unmapped_real_active_classified),
    'status_buckets', (SELECT coalesce(jsonb_object_agg(status, count), '{}'::jsonb) FROM (SELECT status, count(*)::int AS count FROM unmapped_real_active_classified GROUP BY status ORDER BY status) s),
    'month_buckets', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', bucket, 'count', count)), '[]'::jsonb) FROM month_counts_unmapped),
    'owner_csv_presence', (SELECT jsonb_build_object('present_in_owner_csv', count(*) FILTER (WHERE present_in_owner_csv), 'absent_within_csv_range', count(*) FILTER (WHERE stale_overlap), 'outside_csv_range_or_unjudged', count(*) FILTER (WHERE NOT present_in_owner_csv AND NOT stale_overlap)) FROM unmapped_real_active_classified),
    'integrator_raw_presence', (SELECT jsonb_build_object('present_in_integrator_raw', count(*) FILTER (WHERE present_in_integrator_raw), 'absent_from_integrator_raw', count(*) FILTER (WHERE NOT present_in_integrator_raw)) FROM unmapped_real_active_classified),
    'duplicate_overlap_rows', (SELECT count(*)::int FROM unmapped_real_active_classified WHERE duplicate_overlap),
    'canonical_ref_gaps', (SELECT jsonb_build_object('missing_specialist_mapping_or_fallback', count(*) FILTER (WHERE resolved_specialist_id IS NULL), 'missing_branch_mapping', count(*) FILTER (WHERE rubitime_branch_id IS NOT NULL AND mapped_branch_id IS NULL), 'missing_service_mapping', count(*) FILTER (WHERE rubitime_service_id IS NOT NULL AND mapped_service_id IS NULL)) FROM unmapped_real_active_classified),
    'current_script_importability', (SELECT coalesce(jsonb_object_agg(importability_bucket, count), '{}'::jsonb) FROM (SELECT importability_bucket, count(*)::int AS count FROM unmapped_real_active_classified GROUP BY importability_bucket ORDER BY importability_bucket) s),
    'slot_conflict_rows', (SELECT count(*)::int FROM unmapped_real_active_classified WHERE slot_conflict_count > 0),
    'recoverable_existing_rows', (SELECT count(*)::int FROM unmapped_real_active_classified WHERE recoverable_existing_count > 0)
  ),
  'duplicate_clusters', jsonb_build_object(
    'clusters', (SELECT count(*)::int FROM duplicate_clusters),
    'rows', (SELECT coalesce(sum(row_count), 0)::int FROM duplicate_clusters),
    'shape', (SELECT coalesce(jsonb_object_agg(shape, count), '{}'::jsonb) FROM (SELECT CASE WHEN canceled_rows = row_count THEN 'all_cancelled' WHEN canceled_rows = 0 THEN 'all_non_cancelled' ELSE 'mixed_cancelled_and_active' END AS shape, count(*)::int AS count FROM duplicate_clusters GROUP BY 1 ORDER BY 1) s),
    'mapped_row_buckets', (SELECT jsonb_build_object('mapped_rows', coalesce(sum(mapped_rows), 0), 'unmapped_rows', coalesce(sum(unmapped_rows), 0), 'clusters_with_any_unmapped', count(*) FILTER (WHERE unmapped_rows > 0), 'clusters_with_all_rows_mapped', count(*) FILTER (WHERE unmapped_rows = 0)) FROM duplicate_clusters),
    'stale_overlap', (SELECT jsonb_build_object('clusters_with_any_stale_row', count(*) FILTER (WHERE stale_rows > 0), 'stale_rows_inside_duplicate_clusters', coalesce(sum(stale_rows), 0)) FROM duplicate_clusters),
    'broad_collapse_unsafe_reasons', (SELECT jsonb_build_object('clusters_with_non_cancelled_rows', count(*) FILTER (WHERE non_canceled_rows > 0), 'clusters_with_mixed_statuses', count(*) FILTER (WHERE canceled_rows > 0 AND non_canceled_rows > 0), 'clusters_with_unmapped_rows', count(*) FILTER (WHERE unmapped_rows > 0), 'clusters_with_stale_overlap', count(*) FILTER (WHERE stale_rows > 0)) FROM duplicate_clusters)
  ),
  'mismatches', jsonb_build_object(
    'status_mismatches_total', (SELECT count(*)::int FROM status_mismatch),
    'status_pairs', (SELECT coalesce(jsonb_agg(jsonb_build_object('raw_status', raw_status, 'legacy_status', legacy_status, 'count', count) ORDER BY raw_status, legacy_status), '[]'::jsonb) FROM (SELECT raw_status, legacy_status, count(*)::int AS count FROM status_mismatch GROUP BY raw_status, legacy_status) s),
    'record_at_mismatches_total', (SELECT count(*)::int FROM record_at_mismatch),
    'record_at_direction', (SELECT jsonb_build_object('raw_later_than_legacy', count(*) FILTER (WHERE raw_record_at > legacy_record_at), 'legacy_later_than_raw', count(*) FILTER (WHERE legacy_record_at > raw_record_at), 'same_or_null_unexpected', count(*) FILTER (WHERE raw_record_at IS NOT DISTINCT FROM legacy_record_at OR raw_record_at IS NULL OR legacy_record_at IS NULL)) FROM record_at_mismatch),
    'updated_at_direction_for_shared', (SELECT jsonb_build_object('raw_newer_over_5m', count(*) FILTER (WHERE raw_updated_at > legacy_updated_at + interval '5 minutes'), 'legacy_newer_over_5m', count(*) FILTER (WHERE legacy_updated_at > raw_updated_at + interval '5 minutes'), 'within_5m_or_null', count(*) FILTER (WHERE NOT (raw_updated_at > legacy_updated_at + interval '5 minutes') AND NOT (legacy_updated_at > raw_updated_at + interval '5 minutes'))) FROM shared)
  ),
  'legacy_only_and_mapping_anomalies', jsonb_build_object(
    'legacy_only_total', (SELECT count(*)::int FROM legacy_only),
    'legacy_only_status_buckets', (SELECT coalesce(jsonb_object_agg(status, count), '{}'::jsonb) FROM (SELECT status, count(*)::int AS count FROM legacy_only GROUP BY status ORDER BY status) s),
    'legacy_only_month_buckets', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', bucket, 'count', count)), '[]'::jsonb) FROM month_counts_legacy_only),
    'legacy_only_mapping_buckets', (SELECT coalesce(jsonb_object_agg(mapping_state, count), '{}'::jsonb) FROM (SELECT CASE WHEN mapped_appointment_id IS NULL THEN 'unmapped' WHEN canonical_id IS NULL THEN 'mapped_to_missing_canonical' WHEN canonical_deleted_at IS NOT NULL THEN 'mapped_to_deleted_canonical' ELSE 'mapped_to_existing_canonical' END AS mapping_state, count(*)::int AS count FROM legacy_only GROUP BY 1 ORDER BY 1) s),
    'overlap_with_other_blockers', jsonb_build_object(
      'legacy_only_and_stale_rows', (SELECT count(*)::int FROM legacy_only lo JOIN stale s ON s.external_id = lo.external_id),
      'legacy_only_and_unmapped_real_active_rows', (SELECT count(*)::int FROM legacy_only lo JOIN unmapped_real_active ura ON ura.external_id = lo.external_id),
      'legacy_only_and_duplicate_rows', (SELECT count(*)::int FROM legacy_only lo JOIN duplicate_rows d ON d.external_id = lo.external_id)
    ),
    'mapping_anomaly_buckets', (SELECT coalesce(jsonb_object_agg(bucket, count), '{}'::jsonb) FROM (SELECT mapping_state AS bucket, count(*)::int AS count FROM mapping_anomaly_rows GROUP BY mapping_state UNION ALL SELECT 'missing_expected_mapping_metadata' AS bucket, count(*)::int AS count FROM mapping_anomaly_rows WHERE missing_expected_mapping_metadata) s),
    'mapping_anomaly_overlap', jsonb_build_object(
      'anomaly_rows_total', (SELECT count(*)::int FROM mapping_anomaly_rows),
      'anomaly_rows_in_legacy_only', (SELECT count(*)::int FROM mapping_anomaly_rows ma JOIN legacy_only lo ON lo.external_id = ma.external_id),
      'anomaly_rows_in_stale', (SELECT count(*)::int FROM mapping_anomaly_rows ma JOIN stale s ON s.external_id = ma.external_id),
      'anomaly_rows_in_unmapped_real_active', (SELECT count(*)::int FROM mapping_anomaly_rows ma JOIN unmapped_real_active ura ON ura.external_id = ma.external_id)
    )
  )
));
ROLLBACK;
`;
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
  assertDevDatabase(info, args.allowTestTarget);
  const connectedDatabase = verifyConnectedDevDatabase(databaseUrl, args.allowTestTarget);
  const csv = loadCsvShape(args.csvPath);
  const parsed = JSON.parse(runPsql(databaseUrl, buildSql(csv)));
  parsed.run = {
    script: path.relative(repoRoot, fileURLToPath(import.meta.url)),
    envFilesLoaded: loadedEnvFiles,
    database: info.database,
    connectedDatabase,
    host: info.host,
    port: info.port,
  };
  parsed.csv = {
    basename: csv.basename,
    physicalLines: csv.physicalLines,
    headerFields: csv.headerFields,
    parsedRubitimeIds: csv.parsedRubitimeIds,
    dateSpan: `${csv.minIso.slice(0, 10)}...${new Date(Date.parse(csv.maxExclusiveIso) - 1).toISOString().slice(0, 10)}`,
  };
  parsed.safety = {
    noCommit: true,
    noCleanupFlags: true,
    noRowSamples: true,
    noPiiFieldsPrinted: true,
    r2NotStarted: true,
    explicitTestTarget: args.allowTestTarget,
  };
  console.log(JSON.stringify(parsed, null, 2));
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`rubitime-r1-classify-blockers failed: ${message}`);
  process.exit(1);
}
