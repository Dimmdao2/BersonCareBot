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
  'apps/webapp/db/drizzle-migrations/0385_port_context_exact_relation_roots_local.sql',
  `deploy/postgres/generated/port-context-capabilities.${db}.sql`,
  `deploy/postgres/generated/org-allowlist.${db}.sql`,
  `deploy/postgres/generated/privileges.${db}.sql`,
];
for (const file of files) if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);

// This is deliberately catalog evidence, not a transcript marker.  The zero
// migration makes all data relations FORCE RLS without policies and removes
// every managed role/login before this installer is allowed to create them.
const zeroProof = `
DO $$
DECLARE bad_relations bigint; bad_policies bigint; bad_roles bigint;
BEGIN
  SELECT count(*) INTO bad_relations
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','integrator')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
  SELECT count(*) INTO bad_policies
    FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('public','integrator');
  SELECT count(*) INTO bad_roles FROM pg_catalog.pg_roles
   WHERE rolname IN ('${staff}','${patient}','${integrator}') OR rolname LIKE 'app\\_%' ESCAPE '\\';
  IF bad_relations <> 0 OR bad_policies <> 0 OR bad_roles <> 0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE=format('post-zero catalog required (relations=%s policies=%s managed-roles=%s)', bad_relations,bad_policies,bad_roles);
  END IF;
END $$;`;

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
