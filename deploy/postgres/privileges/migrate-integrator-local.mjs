#!/usr/bin/env node
/**
 * Post-cutover integrator migration adapter for local PostgreSQL.
 *
 * Files and the ledger are read by the repository owner.  SQL is executed through local postgres,
 * but each pending migration runs as the exact ordinary object owner via the stationary NOLOGIN
 * migrator.  One file and its ledger row form one transaction; any error is fatal and is never
 * converted into an "already applied" row.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const B0_LEDGER_BASELINE_MARKER = /^-- BCB-INTEGRATOR-LEDGER-BASELINE: B0\s*$/mu;

function value(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`--${name} is required`);
  return process.argv[at + 1];
}

function identifier(raw) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(raw)) throw new Error(`unsafe identifier '${raw}'`);
  return `"${raw}"`;
}

function literal(raw) {
  return `'${String(raw).replaceAll("'", "''")}'`;
}

function regularDirectory(path, label) {
  const resolved = realpathSync(resolve(path));
  if (!statSync(resolved).isDirectory()) throw new Error(`${label} is not a directory`);
  return resolved;
}

function requiredLanguages(source) {
  const languages = new Set();
  if (/^\s*DO(?:\s|\$)/imu.test(source) || /\bLANGUAGE\s+'?plpgsql'?\b/iu.test(source)) {
    languages.add('plpgsql');
  }
  if (/\bLANGUAGE\s+'?sql'?\b/iu.test(source)) languages.add('sql');
  return [...languages].sort();
}

const allowed = new Set([
  '--db',
  '--migrator',
  '--owner',
  '--root',
  '--before-date',
  '--sudo-postgres',
]);
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!allowed.has(arg)) throw new Error(`unsupported argument '${arg}'`);
  if (arg !== '--sudo-postgres') index += 1;
}

const db = value('db');
const migrator = value('migrator');
const owner = value('owner');
identifier(db);
const qMigrator = identifier(migrator);
const qOwner = identifier(owner);
const root = regularDirectory(value('root'), 'integrator root');
const beforeDateRaw = process.argv.includes('--before-date') ? value('before-date') : null;
if (beforeDateRaw !== null && !/^\d{8}$/u.test(beforeDateRaw)) {
  throw new Error('--before-date must be YYYYMMDD');
}
const beforeDate = beforeDateRaw === null ? null : Number(beforeDateRaw);
const useSudoPostgres = process.argv.includes('--sudo-postgres');

function psql(args, options = {}) {
  const executable = useSudoPostgres ? 'sudo' : 'psql';
  const executableArgs = useSudoPostgres ? ['-n', '-u', 'postgres', 'psql', ...args] : args;
  const result = spawnSync(executable, executableArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.stdout.write(result.stdout ?? '');
    throw new Error(`psql failed (${result.status ?? result.signal})`);
  }
  return String(result.stdout ?? '');
}

function sqlFiles(directory, scope) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.sql') &&
        !entry.name.toLowerCase().includes('example'),
    )
    .map((entry) => ({
      scope,
      fileName: entry.name,
      path: realpathSync(resolve(directory, entry.name)),
      version: `${scope}:${entry.name}`,
    }));
}

const migrations = [
  ...sqlFiles(resolve(root, 'src/infra/db/migrations/core'), 'core'),
  ...readdirSync(resolve(root, 'src/integrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      sqlFiles(resolve(root, 'src/integrations', entry.name, 'db/migrations'), entry.name),
    ),
].sort((left, right) => left.fileName.localeCompare(right.fileName));

const eligible =
  beforeDate === null
    ? migrations
    : migrations.filter((migration) => {
        const match = /^(\d{8})_/u.exec(migration.fileName);
        return match?.[1] === undefined || Number(match[1]) < beforeDate;
      });

const ledgerColumn = psql([
  '-X',
  '-d',
  db,
  '-v',
  'ON_ERROR_STOP=1',
  '-Atqc',
  `SELECT CASE
     WHEN pg_catalog.to_regclass('integrator.schema_migrations') IS NULL THEN 'missing'
     WHEN EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute
       WHERE attrelid = 'integrator.schema_migrations'::regclass AND attname = 'version' AND NOT attisdropped
     ) THEN 'version'
     WHEN EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute
       WHERE attrelid = 'integrator.schema_migrations'::regclass AND attname = 'filename' AND NOT attisdropped
     ) THEN 'filename'
     ELSE 'invalid'
   END;`,
]).trim();
if (ledgerColumn !== 'version' && ledgerColumn !== 'filename') {
  throw new Error(`integrator migration ledger is ${ledgerColumn || 'invalid'}`);
}

const appliedValues = new Set(
  psql([
    '-X',
    '-d',
    db,
    '-v',
    'ON_ERROR_STOP=1',
    '-Atqc',
    `SELECT ${ledgerColumn} FROM integrator.schema_migrations ORDER BY ${ledgerColumn};`,
  ])
    .split('\n')
    .filter(Boolean),
);
const pending = eligible.filter(
  (migration) =>
    !appliedValues.has(ledgerColumn === 'version' ? migration.version : migration.fileName),
);

for (const migration of pending) {
  const source = readFileSync(migration.path, 'utf8');
  const resetsLedgerToB0 = B0_LEDGER_BASELINE_MARKER.test(source);
  if (/^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\s*;/imu.test(source)) {
    throw new Error(
      `pending integrator migration contains transaction control: ${migration.version}`,
    );
  }
  const ledgerValue = ledgerColumn === 'version' ? migration.version : migration.fileName;
  const temporaryLanguages = requiredLanguages(source);
  const sql = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    `GRANT ${qOwner} TO ${qMigrator} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`,
    ...temporaryLanguages.map(
      (language) => `GRANT USAGE ON LANGUAGE ${identifier(language)} TO ${qOwner};`,
    ),
    `SET LOCAL SESSION AUTHORIZATION ${qMigrator};`,
    `SET LOCAL ROLE ${qOwner};`,
    source,
    'RESET ROLE;',
    'RESET SESSION AUTHORIZATION;',
    ...(resetsLedgerToB0 ? ['DELETE FROM integrator.schema_migrations;'] : []),
    `INSERT INTO integrator.schema_migrations(${ledgerColumn}) VALUES (${literal(ledgerValue)});`,
    ...temporaryLanguages.map(
      (language) => `REVOKE USAGE ON LANGUAGE ${identifier(language)} FROM ${qOwner};`,
    ),
    `REVOKE ${qOwner} FROM ${qMigrator};`,
    `DO $$ BEGIN
       IF EXISTS (
         SELECT 1 FROM pg_catalog.pg_auth_members
         WHERE member = '${migrator}'::regrole AND roleid = '${owner}'::regrole
       ) THEN RAISE EXCEPTION 'temporary integrator migration membership survived'; END IF;
       IF (SELECT rolcanlogin OR rolinherit OR rolbypassrls OR rolpassword IS NOT NULL
           FROM pg_catalog.pg_authid WHERE rolname = '${migrator}')
       THEN RAISE EXCEPTION 'integrator migrator post-state is not stationary'; END IF;
     END $$;`,
    'COMMIT;',
  ].join('\n');
  psql(['-X', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: sql });
  console.log(`integrator owner-ordered migration committed: ${migration.version}`);
}

const soleMigration = migrations.length === 1 ? migrations[0] : null;
if (soleMigration) {
  const soleSource = readFileSync(soleMigration.path, 'utf8');
  const soleLedgerValue = ledgerColumn === 'version' ? soleMigration.version : soleMigration.fileName;
  if (B0_LEDGER_BASELINE_MARKER.test(soleSource) && appliedValues.has(soleLedgerValue)) {
    psql([
      '-X',
      '-d',
      db,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `DELETE FROM integrator.schema_migrations WHERE ${ledgerColumn} <> ${literal(soleLedgerValue)};`,
    ]);
  }
}

console.log(
  `integrator owner-ordered migrations current for ${identifier(db)}: pending=${pending.length} eligible=${eligible.length} total=${migrations.length}`,
);
