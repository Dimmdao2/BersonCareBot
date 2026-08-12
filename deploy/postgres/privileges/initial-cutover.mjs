#!/usr/bin/env node
/**
 * Initial/restored-dump access cutover for exactly one declared environment/database.
 *
 * Legacy schema/data migrations are intentionally external and must already be committed.
 * This primitive owns only: database zero -> zero proof -> dependency-gated target-login
 * cleanup -> idempotent shared-role baseline -> declaration/context install -> exact proof.
 * It never drops or creates a database and never applies object DDL to a sibling database.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, fchownSync, openSync, readFileSync, realpathSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');

function value(name, fallback = undefined) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  const result = process.argv[at + 1];
  if (!result || result.startsWith('--')) throw new Error(`--${name} requires a value`);
  return result;
}

const allowedArgs = new Set(['--env', '--db', '--admin-socket', '--admin-port', '--backup-file']);
for (let index = 2; index < process.argv.length; index += 2) {
  if (!allowedArgs.has(process.argv[index]) || !process.argv[index + 1]) {
    throw new Error(`unsupported argument '${process.argv[index] ?? ''}'`);
  }
}

const envName = value('env');
if (!/^[a-z][a-z0-9_-]*$/u.test(envName)) throw new Error(`unsafe environment '${envName}'`);
const dbName = value('db');
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(dbName)) throw new Error(`unsafe database identifier '${dbName}'`);
const requestedSocket = value('admin-socket');
if (!existsSync(requestedSocket)) {
  throw new Error('--admin-socket must be an existing local PostgreSQL socket directory');
}
const adminSocket = realpathSync(requestedSocket);
if (!adminSocket.startsWith('/')) throw new Error('--admin-socket must resolve to an absolute path');
const adminPort = value('admin-port', '5432');
if (!/^[1-9][0-9]{0,4}$/u.test(adminPort) || Number(adminPort) > 65535) {
  throw new Error('--admin-port must be a TCP port number');
}
const requestedBackupFile = value('backup-file');
if (!requestedBackupFile.startsWith('/')) throw new Error('--backup-file must be an absolute path');
const backupParent = realpathSync(dirname(requestedBackupFile));
if (!statSync(backupParent).isDirectory()) throw new Error('--backup-file parent must be a directory');
if (new Set(['/', '/home', '/home/dev', root]).has(backupParent)) {
  throw new Error('--backup-file parent is too broad; use a dedicated backup directory');
}
const backupFile = resolve(backupParent, basename(requestedBackupFile));
if (backupFile === backupParent || existsSync(backupFile)) {
  throw new Error('--backup-file must name a new file; refusing overwrite');
}

const files = [
  `deploy/postgres/generated/zero-state.${dbName}.sql`,
  `deploy/postgres/generated/org-allowlist.${dbName}.sql`,
  `deploy/postgres/generated/privileges.${dbName}.sql`,
  'deploy/postgres/port-context/contract.sql',
  'deploy/postgres/privileges/post-zero-roots.sql',
];
for (const file of files) {
  if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);
}

function command(commandName, args, options = {}) {
  const requiresPostgresIdentity = process.getuid?.() === 0
    && new Set(['psql', 'pg_dump', 'pg_restore']).has(commandName);
  const executable = requiresPostgresIdentity ? 'runuser' : commandName;
  const executableArgs = requiresPostgresIdentity
    ? ['-u', 'postgres', '--', commandName, ...args]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${commandName} failed (${result.status ?? result.signal}):\n${result.stderr ?? ''}${result.stdout ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function generator(...args) {
  return command('node', [
    '--experimental-strip-types',
    resolve(root, 'deploy/postgres/privileges/generate-cli.mjs'),
    ...args,
  ]);
}

function psql(database, sql, singleTransaction = false) {
  return command('psql', [
    '-X', '-A', '-t', ...(singleTransaction ? ['-1'] : []),
    '-h', adminSocket, '-p', adminPort, '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1',
  ], { input: sql });
}

function applyDatabaseZero() {
  const sql = readFileSync(resolve(root, `deploy/postgres/generated/zero-state.${dbName}.sql`), 'utf8');
  psql(dbName, sql, true);
}

function verifyDatabaseZero() {
  psql(dbName, generator('--db', dbName, '--zero-state-verify'), true);
}

function assertArtifactsCurrent() {
  generator('--db', dbName, '--check');
  generator('--db', dbName, '--zero-state', '--check');
}

function assertTargetQuiescent() {
  const count = psql(
    'postgres',
    `SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname='${dbName}' AND pid<>pg_backend_pid();`,
  ).trim();
  if (count !== '0') throw new Error(`target database is not quiescent: ${count} non-admin session(s)`);
}

function createVerifiedBackup() {
  const handle = openSync(backupFile, 'wx', 0o600);
  if (process.getuid?.() === 0) {
    const postgresUid = Number(spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).stdout?.trim());
    const postgresGid = Number(spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).stdout?.trim());
    if (!Number.isSafeInteger(postgresUid) || !Number.isSafeInteger(postgresGid)) {
      closeSync(handle);
      unlinkSync(backupFile);
      throw new Error('could not resolve postgres operating-system identity');
    }
    fchownSync(handle, postgresUid, postgresGid);
  }
  closeSync(handle);
  try {
    command('pg_dump', [
      '-Fc', '-h', adminSocket, '-p', adminPort, '-U', 'postgres', '-d', dbName, '-f', backupFile,
    ]);
    chmodSync(backupFile, 0o600);
    const listing = command('pg_restore', ['--list', backupFile]);
    const magic = readFileSync(backupFile, { encoding: null, flag: 'r' }).subarray(0, 5).toString('ascii');
    if (magic !== 'PGDMP' || listing.trim().length === 0) {
      throw new Error('backup is not a readable PostgreSQL custom-format archive');
    }
  } catch (error) {
    try { unlinkSync(backupFile); } catch { /* best effort for an unverified partial archive */ }
    throw error;
  }
}

function cleanupTargetLogins() {
  psql('postgres', generator('--env', envName, '--db', dbName, '--target-login-cleanup'), true);
}

function installAndVerifyTarget() {
  const sql = [
    '\\set ON_ERROR_STOP on',
    `\\set DBNAME ${dbName}`,
    'BEGIN;',
    generator('--shared-role-baseline'),
    generator('--env', envName, '--db', dbName, '--env-login-shells'),
    `\\i ${resolve(root, 'deploy/postgres/port-context/contract.sql')}`,
    generator('--db', dbName, '--relation-wall-registry'),
    `\\i ${resolve(root, 'deploy/postgres/privileges/post-zero-roots.sql')}`,
    `\\i ${resolve(root, `deploy/postgres/generated/org-allowlist.${dbName}.sql`)}`,
    `\\i ${resolve(root, `deploy/postgres/generated/privileges.${dbName}.sql`)}`,
    // Passwords are read by psql via \getenv; neither argv nor this process logs them.
    generator('--env', envName, '--db', dbName),
    generator('--db', dbName, '--port-context-verify'),
    generator('--env', envName, '--db', dbName, '--env-verify'),
    generator('--db', dbName, '--catalog-closure-verify'),
    'COMMIT;',
  ].join('\n');
  psql(dbName, sql);
}

assertArtifactsCurrent();
assertTargetQuiescent();
createVerifiedBackup();

let databaseZeroVerified = false;
try {
  applyDatabaseZero();
  verifyDatabaseZero();
  databaseZeroVerified = true;
  cleanupTargetLogins();
  installAndVerifyTarget();
} catch (error) {
  const original = error instanceof Error ? error.message : String(error);
  try {
    // All install DDL is one transaction. Reapplying target-only zero is safe and proves
    // the promised fail-closed state even if the failure occurred between stages.
    applyDatabaseZero();
    verifyDatabaseZero();
    databaseZeroVerified = true;
  } catch (cleanupError) {
    throw new Error(
      `single-target cutover failed and target zero could not be proven: ${
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      }\noriginal: ${original}`,
    );
  }
  throw new Error(`single-target cutover failed; database ${dbName} remains at verified zero: ${original}`);
}

if (!databaseZeroVerified) throw new Error(`internal error: zero was not proven for ${dbName}`);
console.log(
  `single-target initial cutover committed: env=${envName} database=${dbName}; local admin socket=${adminSocket}`,
);
