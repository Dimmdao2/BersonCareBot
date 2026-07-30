#!/usr/bin/env node
// ARCHIVE ONLY: Rubitime retired 2026-07-27. Do not use as a current operator entrypoint.
throw new Error('ARCHIVE ONLY: retired Rubitime clean-dump preflight is not executable');

/**
 * Aggregate-only preflight for an isolated Rubitime R1 clean-dump rehearsal.
 *
 * The script is read-only, requires an explicit loopback DATABASE_URL, refuses
 * production-shaped database names, and never selects row ids or PII fields.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REQUIRED_COLUMNS = {
  'public.appointment_records': [
    'integrator_record_id',
    'record_at',
    'status',
    'payload_json',
    'branch_id',
    'deleted_at',
    'platform_user_id',
  ],
  'public.be_appointments': [
    'organization_id',
    'branch_id',
    'specialist_id',
    'service_id',
    'platform_user_id',
    'source',
    'status',
    'deleted_at',
  ],
  'public.be_external_entity_mappings': [
    'organization_id',
    'entity_type',
    'canonical_id',
    'external_system',
    'external_id',
    'metadata',
  ],
  'public.be_organizations': ['id'],
  'public.be_specialists': ['id', 'organization_id', 'is_active'],
  'public.be_branches': ['id', 'organization_id'],
  'public.be_clinic_services': ['id', 'organization_id'],
  'public.be_organization_members': [
    'organization_id',
    'platform_user_id',
    'specialist_id',
    'role',
    'status',
  ],
  'public.be_appointment_events': ['organization_id', 'appointment_id'],
  'public.be_appointment_history_events': ['organization_id', 'appointment_id'],
  'public.platform_users': ['id'],
  'public.platform_user_contacts': ['platform_user_id', 'value_normalized'],
  'public.branches': ['id', 'integrator_branch_id'],
  'public.system_settings': ['key', 'scope', 'organization_id', 'value_json'],
  'integrator.rubitime_records': ['rubitime_record_id', 'record_at', 'status'],
  'integrator.rubitime_events': ['id'],
};

function parseArgs(argv) {
  const args = { csvPath: null, allowTestTarget: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--allow-test-target') args.allowTestTarget = true;
    else if (arg.startsWith('--csv=')) args.csvPath = arg.slice('--csv='.length).trim() || null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  DATABASE_URL='postgresql://.../bcb_*_dev_*' \\
    node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs \\
      --csv=<fresh-rubitime-csv>

Pass --allow-test-target only for an explicitly approved TEST rehearsal.

The database must be isolated, loopback-only, and already migrated to the current HEAD.
Output is aggregate-only JSON. A non-zero exit means the R1 replay must not start.
`);
}

function databaseInfo(databaseUrl, allowTestTarget) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const database = url.pathname.replace(/^\//, '');
  const host = url.hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Refusing non-loopback database host: ${host || '<empty>'}`);
  }
  const normalized = database.toLowerCase();
  const isTest = /(^|[_-])test($|[_-])/i.test(normalized) || normalized.endsWith('_test');
  if (
    normalized.includes('prod') ||
    (!normalized.includes('dev') &&
      !normalized.includes('rehearsal') &&
      !(allowTestTarget && isTest))
  ) {
    throw new Error(`Refusing non-rehearsal database name: ${database || '<empty>'}`);
  }
  return { database, host, port: url.port || null };
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', databaseUrl], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `psql exited ${result.status}`);
  return result.stdout.trim();
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function schemaSql() {
  const expected = Object.entries(REQUIRED_COLUMNS)
    .flatMap(([qualifiedTable, columns]) => {
      const [schema, table] = qualifiedTable.split('.');
      return columns.map(
        (column) => `(${sqlString(schema)}, ${sqlString(table)}, ${sqlString(column)})`,
      );
    })
    .join(',\n');
  return `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH expected(schema_name, table_name, column_name) AS (
  VALUES ${expected}
), missing AS (
  SELECT e.schema_name || '.' || e.table_name || '.' || e.column_name AS item
  FROM expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = e.schema_name
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
  WHERE c.column_name IS NULL
)
SELECT jsonb_build_object(
  'current_database', current_database(),
  'missing_required_columns', coalesce((SELECT jsonb_agg(item ORDER BY item) FROM missing), '[]'::jsonb)
)::text;
ROLLBACK;
`;
}

const COUNTS_SQL = `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT jsonb_build_object(
  'legacy_total', (SELECT count(*)::int FROM public.appointment_records),
  'legacy_live', (SELECT count(*)::int FROM public.appointment_records WHERE deleted_at IS NULL),
  'canonical_rubitime_projection_total', (SELECT count(*)::int FROM public.be_appointments WHERE source = 'rubitime_projection'),
  'canonical_rubitime_projection_live', (SELECT count(*)::int FROM public.be_appointments WHERE source = 'rubitime_projection' AND deleted_at IS NULL),
  'rubitime_appointment_mappings', (SELECT count(*)::int FROM public.be_external_entity_mappings WHERE external_system = 'rubitime' AND entity_type = 'appointment'),
  'rubitime_branch_mappings', (SELECT count(*)::int FROM public.be_external_entity_mappings WHERE external_system = 'rubitime' AND entity_type = 'branch'),
  'rubitime_specialist_mappings', (SELECT count(*)::int FROM public.be_external_entity_mappings WHERE external_system = 'rubitime' AND entity_type = 'specialist'),
  'rubitime_service_or_availability_mappings', (SELECT count(*)::int FROM public.be_external_entity_mappings WHERE external_system = 'rubitime' AND entity_type IN ('service', 'availability')),
  'active_specialists', (SELECT count(*)::int FROM public.be_specialists WHERE is_active = true),
  'canonical_branches', (SELECT count(*)::int FROM public.be_branches),
  'canonical_services', (SELECT count(*)::int FROM public.be_clinic_services),
  'active_specialist_linked_members', (SELECT count(*)::int FROM public.be_organization_members WHERE status = 'active' AND specialist_id IS NOT NULL),
  'platform_user_contacts', (SELECT count(*)::int FROM public.platform_user_contacts),
  'integrator_rubitime_records', (SELECT count(*)::int FROM integrator.rubitime_records),
  'integrator_rubitime_events', (SELECT count(*)::int FROM integrator.rubitime_events),
  'default_org_setting_rows', (SELECT count(*)::int FROM public.system_settings WHERE key = 'booking_default_organization_id' AND scope = 'admin' AND organization_id IS NULL),
  'bridge_setting_rows', (SELECT count(*)::int FROM public.system_settings WHERE key = 'booking_rubitime_bridge_enabled' AND scope = 'admin' AND organization_id IS NULL)
)::text;
ROLLBACK;
`;

function parseCsv(text) {
  const rows = [];
  let field = '';
  let inQuotes = false;
  let row = [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseRuDay(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function csvShape(csvPath) {
  if (!csvPath || !existsSync(csvPath)) return null;
  const stat = statSync(csvPath);
  if (!stat.isFile()) return null;
  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  const ids = new Set();
  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const row of rows.slice(1)) {
    const id = String(row[0] ?? '').trim();
    if (id) ids.add(id);
    const day = parseRuDay(row[10]);
    if (day != null) {
      minDay = Math.min(minDay, day);
      maxDay = Math.max(maxDay, day);
    }
  }
  if (ids.size === 0 || !Number.isFinite(minDay) || !Number.isFinite(maxDay)) return null;
  return {
    basename: path.basename(csvPath),
    bytes: stat.size,
    physicalLines: text.length === 0 ? 0 : text.split(/\r?\n/).filter(Boolean).length,
    headerFields: rows[0]?.length ?? 0,
    parsedRubitimeIds: ids.size,
    dateSpan: `${new Date(minDay).toISOString().slice(0, 10)}...${new Date(maxDay).toISOString().slice(0, 10)}`,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL must be provided explicitly');
  const info = databaseInfo(databaseUrl, args.allowTestTarget);
  const schema = JSON.parse(runPsql(databaseUrl, schemaSql()));
  if (schema.current_database !== info.database) {
    throw new Error(`Connected database mismatch: ${schema.current_database || '<empty>'}`);
  }
  const csv = csvShape(args.csvPath);
  const failures = [];
  const missing = schema.missing_required_columns ?? [];
  if (missing.length > 0) failures.push('schema_not_current');
  if (!csv) failures.push('fresh_rubitime_csv_missing');

  let counts = null;
  if (missing.length === 0) {
    counts = JSON.parse(runPsql(databaseUrl, COUNTS_SQL));
    const requiredPositive = [
      'legacy_total',
      'canonical_rubitime_projection_total',
      'rubitime_appointment_mappings',
      'rubitime_branch_mappings',
      'rubitime_specialist_mappings',
      'rubitime_service_or_availability_mappings',
      'active_specialists',
      'canonical_branches',
      'canonical_services',
      'active_specialist_linked_members',
      'platform_user_contacts',
      'integrator_rubitime_records',
      'default_org_setting_rows',
      'bridge_setting_rows',
    ];
    for (const key of requiredPositive) {
      if (!Number.isInteger(counts[key]) || counts[key] <= 0) failures.push(`missing_seed:${key}`);
    }
  }

  const output = {
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    database: info,
    csv,
    missingRequiredColumns: missing,
    counts,
    failures,
    safety: {
      readOnly: true,
      aggregateOnly: true,
      loopbackOnly: true,
      explicitTestTarget: args.allowTestTarget,
    },
  };
  console.log(JSON.stringify(output, null, 2));
  if (failures.length > 0) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`rubitime-r1-clean-dump-preflight failed: ${message}`);
  process.exit(1);
}
