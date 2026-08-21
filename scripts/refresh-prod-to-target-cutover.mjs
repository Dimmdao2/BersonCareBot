#!/usr/bin/env node
/**
 * Refresh or verify the exact schema-B inputs consumed by prod-to-target-cutover.sql.
 *
 * Source is fixed to the existing local bcb_webapp_dev database. The command never restores,
 * creates, drops or migrates a database; migrate-dev.sh --execute is the only preceding writer.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFolder, selectPendingMigrations } from '../deploy/postgres/privileges/migration-order.mjs';
import {
  filterAndValidateTargetTariffCatalog,
  removeRetiredRuntimeSettings,
  sanitizeRuntimeSettingsForCutover,
  sanitizeSingletonPolicyAuditMetadata,
} from './prod-to-target-baseline-policy.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(repoRoot, 'deploy/postgres/generated/prod-to-target');
const database = 'bcb_webapp_dev';

function canonicalizePolicyRoleOrder(sql) {
  return sql.replace(
    /^(CREATE POLICY .*?\bTO )([^;]+?)(?=(?: USING| WITH CHECK|;))/gmu,
    (_statement, prefix, roles) => {
      const orderedRoles = roles
        .split(',')
        .map((role) => role.trim())
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
      return `${prefix}${orderedRoles.join(', ')}`;
    },
  );
}

/**
 * `pg_dump --restrict-key` задаёт строку, которой psql обрамляет вывод (`\restrict`/`\unrestrict`).
 * Без неё pg_dump берёт случайную строку на каждый прогон, и `--check` не совпал бы никогда, поэтому
 * ключ обязан быть стабильным. Раньше здесь лежали четыре высокоэнтропийные константы — секретами они
 * не были, но gitleaks справедливо не умеет отличить их от ключа API и валил Security-проверку.
 * Выводим ключ из имени артефакта: та же стабильность, тот же вид на выходе, но в исходнике не лежит
 * ничего, что похоже на секрет, и глушить сканер не нужно.
 */
function restrictKeyFor(file) {
  return createHash('sha256').update(`prod-to-target-cutover:${file}`).digest('hex').slice(0, 63);
}

const artifacts = [
  {
    file: 'schema-pre.sql',
    args: ['--schema-only', '--section=pre-data'],
    transform: (sql) => removeRetiredRuntimeSettings(sql.replace(
      /^CREATE SCHEMA (app|app_control|app_ext|drizzle|integrator);$/gmu,
      'CREATE SCHEMA IF NOT EXISTS $1;',
    )),
  },
  {
    file: 'schema-post.sql',
    args: ['--schema-only', '--section=post-data'],
    transform: canonicalizePolicyRoleOrder,
  },
  {
    file: 'ledgers-and-baseline.sql',
    args: [
      '--data-only',
      '--column-inserts',
      '--table=drizzle.__drizzle_migrations',
      '--table=integrator.schema_migrations',
      '--table=public.saas_billing_periods',
      '--table=public.saas_tariffs',
      '--table=public.saas_paid_period_policy',
      '--table=public.saas_registration_tariff_policy',
      '--table=public.saas_trial_policy',
    ],
    transform: (sql) => sanitizeSingletonPolicyAuditMetadata(
      filterAndValidateTargetTariffCatalog(sql),
    ),
  },
  {
    file: 'runtime-settings.sql',
    args: ['--data-only', '--column-inserts', '--table=public.app_runtime_settings'],
    transform: sanitizeRuntimeSettingsForCutover,
  },
];

function fail(message) {
  throw new Error(`refresh-prod-to-target-cutover: ${message}`);
}

function postgres(command, args, options = {}) {
  return execFileSync('sudo', ['-n', '-u', 'postgres', command, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function scalar(sql) {
  return postgres('psql', [
    '-X', '-h', '/var/run/postgresql', '-p', '5432', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql,
  ]).trim();
}

function dump(artifact) {
  const raw = postgres('pg_dump', [
    '-h', '/var/run/postgresql', '-p', '5432', '-d', database,
    '--no-owner', '--no-privileges', '--no-comments',
    `--restrict-key=${restrictKeyFor(artifact.file)}`,
    ...artifact.args,
  ]);
  const transformed = artifact.transform ? artifact.transform(raw) : raw;
  return transformed.replace(/[ \t]+$/gmu, '').replace(/\n+$/u, '\n');
}

function firstDifference(expected, actual) {
  const limit = Math.min(expected.length, actual.length);
  let at = 0;
  while (at < limit && expected[at] === actual[at]) at += 1;
  const line = expected.slice(0, at).split('\n').length;
  return `first difference at line ${line}, byte ${at}`;
}

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--confirm-local-dev-target-refresh'].includes(mode)) {
  fail('use --check or --confirm-local-dev-target-refresh');
}

const identity = scalar(
  "SELECT current_database() || '|' || pg_catalog.pg_get_userbyid(datdba) "
  + 'FROM pg_catalog.pg_database WHERE datname = current_database();',
);
if (identity !== `${database}|postgres`) fail(`unexpected source identity ${identity}`);

// The DEV migration ledger's identity column is `tag`, not the frozen, no-longer-appended
// `meta/_journal.json` `when` map (AGENTS.md "Миграции после baseline B0"): pending is whatever
// filename the ledger cannot name, order is the filename, same as migration-order.mjs enforces for
// every runner. A `when`-based staleness check would never notice a new post-B0 migration, because
// post-B0 migrations do not append to the frozen journal.
const migrations = readMigrationFolder(resolve(repoRoot, 'apps/webapp/db/drizzle-migrations'));
const ledgerTagsRaw = postgres('psql', [
  '-X', '-h', '/var/run/postgresql', '-p', '5432', '-d', database,
  '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', "SELECT coalesce(tag, '') FROM drizzle.__drizzle_migrations ORDER BY id;",
]);
const ledgerRows = ledgerTagsRaw.split('\n').filter((line) => line.length > 0).map((tag) => ({ tag }));
const pending = selectPendingMigrations(migrations, ledgerRows);
if (pending.length > 0) {
  fail(`DEV migration ledger is not current: pending=${pending.map((migration) => migration.tag).join(',')}`);
}

const deliveryBodyState = scalar(
  "SELECT (p.prosrc LIKE '%notification_delivery_attempts%')::text || '|' || "
  + "(p.prosrc LIKE '%op-inc:%')::text FROM pg_catalog.pg_proc AS p "
  + "JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace "
  + "WHERE n.nspname='app' AND p.proname='record_operator_delivery_attempt';",
);
if (deliveryBodyState !== 'true|false') fail(`delivery audit root is stale: ${deliveryBodyState}`);

const retiredDeliveryAttemptHistoryState = scalar(
  "SELECT (to_regclass('integrator.delivery_attempt_logs') IS NULL)::text || '|' || "
  + "(to_regclass('integrator.delivery_attempt_logs_id_seq') IS NULL)::text || '|' || "
  + "(to_regprocedure('app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)') IS NULL)::text;",
);
if (retiredDeliveryAttemptHistoryState !== 'true|true|true') {
  fail('D10a delivery-attempt history retirement is not applied; refresh only after the named DEV migration drops its table, sequence and legacy root');
}

if (mode === '--confirm-local-dev-target-refresh') mkdirSync(outputRoot, { recursive: true });

let differences = 0;
for (const artifact of artifacts) {
  const target = resolve(outputRoot, artifact.file);
  const rendered = dump(artifact);
  if (mode === '--check') {
    const committed = readFileSync(target, 'utf8');
    if (committed !== rendered) {
      console.error(`DRIFT ${artifact.file}: ${firstDifference(committed, rendered)}`);
      differences += 1;
    } else {
      console.log(`ok ${artifact.file}`);
    }
    continue;
  }

  const temporary = `${target}.tmp`;
  writeFileSync(temporary, rendered, { encoding: 'utf8', mode: 0o644 });
  renameSync(temporary, target);
  chmodSync(target, 0o644);
  console.log(`refreshed ${artifact.file}`);
}

if (differences > 0) fail(`${differences} committed artifact(s) differ from current DEV schema B`);
console.log(
  mode === '--check'
    ? 'prod-to-target cutover snapshot matches current DEV schema B'
    : 'prod-to-target cutover snapshot refreshed from current DEV schema B',
);
