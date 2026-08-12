#!/usr/bin/env node
/**
 * Atomic local cutover for the post-zero privilege layer.
 *
 * This intentionally accepts no DATABASE_URL.  It is for a local PostgreSQL
 * administrator connection only, and refuses to run unless the target is the
 * revoke-only zero catalog.  Roles are PostgreSQL transactional DDL, so the
 * contract, roots, capability seed, generated ACL and bilateral verifier all
 * share one transaction.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
if (env !== 'dev' && env !== 'test') throw new Error('--env must be dev or test');
const staff = identifier(value('staff-login'));
const patient = identifier(value('patient-login'));
const integrator = identifier(value('integrator-login'));
const files = [
  'deploy/postgres/port-context/contract.sql',
  'deploy/postgres/privileges/post-zero-roots.sql',
  `deploy/postgres/generated/port-context-capabilities.${db}.sql`,
  `deploy/postgres/generated/org-allowlist.${db}.sql`,
  `deploy/postgres/generated/privileges.${db}.sql`,
];
for (const file of files) if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);

// Do not duplicate a weaker list of catalog checks here.  The installer extracts
// the verifier emitted by the same zero generator that made the target state;
// relation/table/sequence/function/type/schema/default ACL, ownership, policy,
// FORCE RLS and membership drift therefore fail before any persistent cutover DDL.
const zeroArtifact = spawnSync('node', ['--experimental-strip-types',
  resolve(root, 'deploy/postgres/privileges/generate-cli.mjs'), '--db', db, '--zero-state', '--stdout'],
{ encoding: 'utf8', env: process.env });
if (zeroArtifact.status !== 0) {
  process.stderr.write(zeroArtifact.stderr ?? '');
  process.exit(zeroArtifact.status ?? 1);
}
const zeroRoleInsert = zeroArtifact.stdout.match(/INSERT INTO bcb_zero_state_roles SELECT[^\n]+;/u)?.[0];
const zeroVerifier = zeroArtifact.stdout.match(/-- Bilateral zero-state verifier:[\s\S]*?-- end zero-state database migration\./u)?.[0];
if (!zeroRoleInsert || !zeroVerifier) throw new Error('generated zero-state artifact has no extractable bilateral verifier');
const zeroProof = [
  'CREATE TEMP TABLE bcb_zero_state_roles (role_name name PRIMARY KEY) ON COMMIT DROP;',
  zeroRoleInsert,
  zeroVerifier,
].join('\n');

const verifier = spawnSync('node', ['--experimental-strip-types',
  resolve(root, 'deploy/postgres/privileges/generate-cli.mjs'), '--db', db, '--port-context-verify'],
{ encoding: 'utf8', env: process.env });
if (verifier.status !== 0) {
  process.stderr.write(verifier.stderr ?? '');
  process.exit(verifier.status ?? 1);
}
const sql = [
  '\\set ON_ERROR_STOP on',
  'BEGIN;',
  zeroProof,
  `\\i ${resolve(root, files[0])}`,
  `\\i ${resolve(root, files[1])}`,
  `\\i ${resolve(root, files[2])}`,
  `\\i ${resolve(root, files[3])}`,
  `\\i ${resolve(root, files[4])}`,
  verifier.stdout,
  'COMMIT;',
].join('\n');
const result = spawnSync('psql', ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1',
  '-v', `app_staff_login=${staff}`, '-v', `app_patient_login=${patient}`, '-v', `integrator_login=${integrator}`],
{ input: sql, encoding: 'utf8', env: process.env });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`post-zero cutover committed for ${db}; live zero proof and bilateral verifier passed`);
