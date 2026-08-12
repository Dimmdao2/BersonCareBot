#!/usr/bin/env node
/**
 * Offline DEV+TEST shared-cluster access cutover.
 *
 * Both databases live in one PostgreSQL cluster, so application roles cannot be removed and
 * recreated safely one database at a time. This entrypoint owns the only supported order:
 * per-database zero for both -> cluster role zero -> bilateral zero proof -> post-zero base for
 * both -> environment render for both -> bilateral target proof. Services and all other
 * target-database sessions must already be stopped. A failure after the first target commit
 * immediately returns both databases to zero.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');
const targets = [
  { env: 'dev', db: 'bcb_webapp_dev' },
  { env: 'test', db: 'bersoncarebot_test' },
];

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

const allowedArgs = new Set(['--admin-socket', '--admin-port']);
for (let index = 2; index < process.argv.length; index += 2) {
  if (!allowedArgs.has(process.argv[index]) || !process.argv[index + 1]) {
    throw new Error(`unsupported argument '${process.argv[index] ?? ''}'`);
  }
}

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

const files = targets.flatMap(({ db }) => [
  `deploy/postgres/generated/zero-state.${db}.sql`,
  `deploy/postgres/generated/org-allowlist.${db}.sql`,
  `deploy/postgres/generated/privileges.${db}.sql`,
]);
files.push(
  'deploy/postgres/generated/zero-state.cluster.sql',
  'deploy/postgres/port-context/contract.sql',
  'deploy/postgres/privileges/post-zero-roots.sql',
);
for (const file of files) {
  if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
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

function psql(database, sql, options = {}) {
  const { singleTransaction = false, ...spawnOptions } = options;
  return command(
    'psql',
    [
      '-X',
      '-A',
      '-t',
      ...(singleTransaction ? ['-1'] : []),
      '-h',
      adminSocket,
      '-p',
      adminPort,
      '-U',
      'postgres',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, ...spawnOptions },
  );
}

function assertArtifactsCurrent() {
  generator('--check');
  generator('--all', '--zero-state', '--check');
  generator('--zero-state-cluster', '--check');
}

function assertQuiescent() {
  const databaseList = targets.map(({ db }) => `'${db}'`).join(',');
  const count = psql(
    'postgres',
    `SELECT count(*) FROM pg_catalog.pg_stat_activity
      WHERE datname IN (${databaseList}) AND pid <> pg_backend_pid();`,
    { stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
  if (count !== '0') {
    throw new Error(`target databases are not quiescent: ${count} non-admin session(s)`);
  }
}

function applyDatabaseZero(db) {
  command('psql', [
    '-X', '-1', '-h', adminSocket, '-p', adminPort, '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-f', resolve(root, `deploy/postgres/generated/zero-state.${db}.sql`),
  ]);
}

function applyClusterZero() {
  command('psql', [
    '-X', '-1', '-h', adminSocket, '-p', adminPort, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-f', resolve(root, 'deploy/postgres/generated/zero-state.cluster.sql'),
  ]);
}

function verifyBilateralZero() {
  for (const { db } of targets) {
    psql(db, generator('--db', db, '--zero-state-verify'), { singleTransaction: true });
  }
  applyClusterZero();
}

function installTargetBase({ env, db }) {
  const sql = [
    '\\set ON_ERROR_STOP on',
    `\\set DBNAME ${db}`,
    'BEGIN;',
    generator('--env', env, '--db', db, '--env-login-shells'),
    `\\i ${resolve(root, 'deploy/postgres/port-context/contract.sql')}`,
    `\\i ${resolve(root, 'deploy/postgres/privileges/post-zero-roots.sql')}`,
    `\\i ${resolve(root, `deploy/postgres/generated/org-allowlist.${db}.sql`)}`,
    `\\i ${resolve(root, `deploy/postgres/generated/privileges.${db}.sql`)}`,
    'COMMIT;',
  ].join('\n');
  psql(db, sql);
}

function finalizeTarget({ env, db }) {
  const sql = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    // Passwords are read by psql via \\getenv; neither argv nor this program logs them.
    generator('--env', env, '--db', db),
    generator('--db', db, '--port-context-verify'),
    'COMMIT;',
  ].join('\n');
  psql(db, sql);
}

function verifyBilateralTarget() {
  for (const { env, db } of targets) {
    psql(db, generator('--db', db, '--port-context-verify'), { singleTransaction: true });
    psql(db, generator('--env', env, '--db', db, '--env-verify'));
  }
}

function forceZeroAfterFailure(originalError) {
  const cleanupErrors = [];
  for (const { db } of targets) {
    try {
      applyDatabaseZero(db);
    } catch (error) {
      cleanupErrors.push(`${db}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    applyClusterZero();
  } catch (error) {
    cleanupErrors.push(`cluster: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (cleanupErrors.length === 0) {
    try {
      for (const { db } of targets) {
        psql(db, generator('--db', db, '--zero-state-verify'), { singleTransaction: true });
      }
    } catch (error) {
      cleanupErrors.push(`zero verification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new Error(
      `shared cutover failed and fail-closed cleanup was incomplete:\n${cleanupErrors.join('\n')}\noriginal: ${
        originalError instanceof Error ? originalError.message : String(originalError)
      }`,
    );
  }
  throw new Error(
    `shared cutover failed; both databases were returned to verified zero: ${
      originalError instanceof Error ? originalError.message : String(originalError)
    }`,
  );
}

assertArtifactsCurrent();
assertQuiescent();
try {
  for (const { db } of targets) applyDatabaseZero(db);
  applyClusterZero();
  verifyBilateralZero();
  // Each database privilege artifact deliberately closes shared-role memberships. Therefore both
  // base artifacts must finish before either environment's exact LOGIN memberships are rendered.
  for (const target of targets) installTargetBase(target);
  for (const target of targets) finalizeTarget(target);
  verifyBilateralTarget();
} catch (error) {
  forceZeroAfterFailure(error);
}

console.log(
  `shared DEV+TEST cutover committed: ${targets.map(({ env, db }) => `${env}:${db}`).join(', ')}; `
    + `local admin socket=${adminSocket}`,
);
