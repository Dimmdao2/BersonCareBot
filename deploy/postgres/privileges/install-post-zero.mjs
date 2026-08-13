#!/usr/bin/env node
/**
 * Atomic post-zero installer. This is intentionally not a deploy entry point:
 * a later host wrapper must prove mTLS readiness and pass its validated local
 * administrator socket. It never accepts application login names as authority.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');
const value = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`--${name} is required`);
  return process.argv[at + 1];
};
const identifier = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error(`unsafe identifier '${name}'`);
  return name;
};
const db = identifier(value('db'));
const env = value('env');
if (!['dev', 'test'].includes(env)) throw new Error('--env must be a declaration environment');
const requestedSocket = value('admin-socket');
if (!existsSync(requestedSocket)) throw new Error('--admin-socket must be an existing local PostgreSQL socket directory');
const adminSocket = realpathSync(requestedSocket);
if (!adminSocket.startsWith('/')) throw new Error('--admin-socket must resolve to an absolute local path');
const requestedPort = process.argv.includes('--admin-port') ? value('admin-port') : '5432';
if (!/^[1-9][0-9]{0,4}$/u.test(requestedPort) || Number(requestedPort) > 65535) throw new Error('--admin-port must be a TCP port number');
const files = [
  'deploy/postgres/port-context/contract.sql',
  'deploy/postgres/privileges/post-zero-roots.sql',
  `deploy/postgres/generated/org-allowlist.${db}.sql`,
  `deploy/postgres/generated/privileges.${db}.sql`,
];
for (const file of files) if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);

function generator(...args) {
  const result = spawnSync('node', ['--experimental-strip-types',
    resolve(root, 'deploy/postgres/privileges/generate-cli.mjs'), ...args], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(result.stderr || `generator failed (${result.status})`);
  return result.stdout;
}

// These calls validate db↔env identity by declaration. No caller supplied login
// identifier can influence the cutover authority.
const zeroVerifier = generator('--db', db, '--zero-state-verify');
const sharedRoleBaseline = generator('--shared-role-baseline');
const shells = generator('--env', env, '--db', db, '--env-login-shells');
const envRender = generator('--env', env, '--db', db);
const envVerifier = generator('--env', env, '--db', db, '--env-verify');
const capabilityVerifier = generator('--db', db, '--port-context-verify');
const relationWallRegistry = generator('--db', db, '--relation-wall-registry');
const sql = [
  '\\set ON_ERROR_STOP on',
  `\\set DBNAME ${db}`,
  'BEGIN;',
  zeroVerifier,
  sharedRoleBaseline,
  shells,
  `\\i ${resolve(root, files[0])}`,
  relationWallRegistry,
  `\\i ${resolve(root, files[1])}`,
  `\\i ${resolve(root, files[2])}`,
  `\\i ${resolve(root, files[3])}`,
  // Passwords are read by psql via \\getenv; neither argv nor this program logs them.
  envRender,
  capabilityVerifier,
  envVerifier,
  'COMMIT;',
].join('\n');
const result = spawnSync('psql', ['-X', '-h', adminSocket, '-p', requestedPort, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8', env: process.env });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`post-zero installer committed for declaration env=${env} database=${db}; local admin socket=${adminSocket}`);
