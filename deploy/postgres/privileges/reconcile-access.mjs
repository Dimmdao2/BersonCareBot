#!/usr/bin/env node
/**
 * Repeatable access reconcile for one database that has already completed initial cutover.
 * It never runs legacy cleanup, zero-state, target-login cleanup, or database restore.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

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

const allowedArgs = new Set(['--env', '--db', '--admin-socket', '--admin-port']);
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
if (!adminSocket.startsWith('/')) throw new Error('--admin-socket must resolve to an absolute local path');
const adminPort = value('admin-port', '5432');
if (!/^[1-9][0-9]{0,4}$/u.test(adminPort) || Number(adminPort) > 65535) {
  throw new Error('--admin-port must be a TCP port number');
}

const files = [
  'deploy/postgres/port-context/contract.sql',
  `deploy/postgres/generated/org-allowlist.${dbName}.sql`,
];
for (const file of files) {
  if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);
}

function command(commandName, args, options = {}) {
  const postgresIdentity = process.getuid?.() === 0 && commandName === 'psql';
  const executable = postgresIdentity ? 'runuser' : commandName;
  const executableArgs = postgresIdentity ? ['-u', 'postgres', '--', commandName, ...args] : args;
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

function repositorySql(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

generator('--db', dbName, '--check');
const sql = [
  '\\set ON_ERROR_STOP on',
  `\\set DBNAME ${dbName}`,
  generator('--env', envName, '--db', dbName, '--env-login-variables'),
  'BEGIN;',
  `SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bcb-access-reconcile:' || current_database(), 0));`,
  // Target login shells, attributes, memberships and passwords are the only
  // allowed cluster mutations in a per-target reconcile.
  generator('--env', envName, '--db', dbName),
  // Verify the complete shared graph after repairing this target's exact four
  // login edges. Sibling or rogue edges are never repaired here.
  generator('--shared-role-verify'),
  repositorySql('deploy/postgres/port-context/contract.sql'),
  generator('--db', dbName, '--relation-wall-registry'),
  repositorySql(`deploy/postgres/generated/org-allowlist.${dbName}.sql`),
  generator('--db', dbName, '--target-access-only'),
  // The deny-by-default target artifact revokes login ACLs before rebuilding
  // canonical-role access. Reapply the same four target logins last so their
  // exact CONNECT/schema ACLs and memberships are the committed final state.
  generator('--env', envName, '--db', dbName),
  generator('--db', dbName, '--port-context-verify'),
  generator('--env', envName, '--db', dbName, '--env-verify'),
  generator('--db', dbName, '--catalog-closure-verify'),
  'COMMIT;',
].join('\n');

command('psql', [
  '-X', '-h', adminSocket, '-p', adminPort, '-U', 'postgres', '-d', dbName,
  '-v', 'ON_ERROR_STOP=1',
], { input: sql });
console.log(
  `access reconcile committed: env=${envName} database=${dbName}; local admin socket=${adminSocket}`,
);
