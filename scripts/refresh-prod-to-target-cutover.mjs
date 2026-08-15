#!/usr/bin/env node
/**
 * Refresh or verify the exact schema-B inputs consumed by prod-to-target-cutover.sql.
 *
 * Source is fixed to the existing local bcb_webapp_dev database. The command never restores,
 * creates, drops or migrates a database; migrate-dev.sh --execute is the only preceding writer.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(repoRoot, 'deploy/postgres/generated/prod-to-target');
const database = 'bcb_webapp_dev';

const artifacts = [
  {
    file: 'schema-pre.sql',
    restrictKey: 'nWtjyBeP1kaN7rDBMHL6kRFv5HeZBf2ix1LExAsn9NhYTKcFdAMQbKcXvISeUTn',
    args: ['--schema-only', '--section=pre-data'],
    transform: (sql) => sql.replace(
      /^CREATE SCHEMA (app|app_control|app_ext|drizzle|integrator);$/gmu,
      'CREATE SCHEMA IF NOT EXISTS $1;',
    ),
  },
  {
    file: 'schema-post.sql',
    restrictKey: 'VDILCdWDLrtgsAi05DRibKYGuJsuS0NQ9kSaFgv4afgfloUq45O3UwSg2t8hlKI',
    args: ['--schema-only', '--section=post-data'],
  },
  {
    file: 'ledgers-and-baseline.sql',
    restrictKey: '6xzycw3O74f0f9FxN40D7hBJa1BUoZPri2X8OgBphy4ZCgHYN04UzAxR2bLbMUg',
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
  },
  {
    file: 'runtime-settings.sql',
    restrictKey: 'zuW9L5uzqzBzeUZ4w0j4VjwaxfagL7ZbzDDIja2kue9OpChHcJnzVk9ak4FJIHp',
    args: ['--data-only', '--column-inserts', '--table=public.app_runtime_settings'],
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
    `--restrict-key=${artifact.restrictKey}`,
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

const journal = JSON.parse(readFileSync(
  resolve(repoRoot, 'apps/webapp/db/drizzle-migrations/meta/_journal.json'),
  'utf8',
));
const latestWhen = String(journal.entries.at(-1)?.when ?? '');
const databaseLatestWhen = scalar('SELECT max(created_at)::text FROM drizzle.__drizzle_migrations;');
if (!latestWhen || databaseLatestWhen !== latestWhen) {
  fail(`DEV migration ledger is not current: repo=${latestWhen || 'missing'} db=${databaseLatestWhen || 'missing'}`);
}

const deliveryBodyState = scalar(
  "SELECT (p.prosrc LIKE '%notification_delivery_attempts%')::text || '|' || "
  + "(p.prosrc LIKE '%op-inc:%')::text FROM pg_catalog.pg_proc AS p "
  + "JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace "
  + "WHERE n.nspname='app' AND p.proname='record_operator_delivery_attempt';",
);
if (deliveryBodyState !== 'true|false') fail(`delivery audit root is stale: ${deliveryBodyState}`);

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
