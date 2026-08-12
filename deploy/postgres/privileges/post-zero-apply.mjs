#!/usr/bin/env node
/**
 * Refuse unsafe post-zero privilege installation.
 *
 * Zero-state is intentionally a different migration.  This command accepts a
 * verifier transcript for that already-completed step, then requires the
 * declaration to have no unresolved relation surface before it opens a single
 * psql transaction for the role/context/grant artifacts.  It never falls back
 * to the old application DATABASE_URL migration lane.
 */
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../..');
const generated = join(repoRoot, 'deploy/postgres/generated');
const contract = join(repoRoot, 'deploy/postgres/port-context/contract.sql');

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith('--')) throw new Error(`unexpected argument '${flag}'`);
    if (flag === '--self-test') {
      values.set(flag, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  return values;
}

function safeIdentifier(value, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`${name} must be a PostgreSQL identifier`);
  return value;
}

function required(values, name) {
  const value = values.get(name);
  if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

function requireZeroPass(path) {
  if (!existsSync(path)) throw new Error(`--zero-proof does not exist: ${path}`);
  const proof = readFileSync(path, 'utf8');
  if (!proof.includes('zero-state acceptance: PASS')) {
    throw new Error('--zero-proof is not a successful zero-state acceptance transcript');
  }
}

function requireCompleteDeclaration(db) {
  const result = run('node', ['deploy/postgres/privileges/generate-cli.mjs', '--db', db, '--gaps']);
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error('post-zero installation refused: declaration still has unresolved relation access gaps');
  }
}

function requireCommittedArtifacts(db) {
  const result = run('node', ['deploy/postgres/privileges/generate-cli.mjs', '--db', db, '--check']);
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error('post-zero installation refused: generated artifacts do not match the declaration');
  }
}

function shellLogins(staffLogin, patientLogin, integratorLogin) {
  return `DO $$\nDECLARE role_name name;\nBEGIN\n  FOREACH role_name IN ARRAY ARRAY[${[staffLogin, patientLogin, integratorLogin].map((name) => `'${name}'`).join(', ')}]::name[] LOOP\n    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN\n      EXECUTE pg_catalog.format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', role_name);\n    END IF;\n  END LOOP;\nEND $$;\n`;
}

function apply(values) {
  const db = safeIdentifier(required(values, '--db'), '--db');
  const staffLogin = safeIdentifier(required(values, '--staff-login'), '--staff-login');
  const patientLogin = safeIdentifier(required(values, '--patient-login'), '--patient-login');
  const integratorLogin = safeIdentifier(required(values, '--integrator-login'), '--integrator-login');
  const zeroProof = resolve(required(values, '--zero-proof'));
  requireZeroPass(zeroProof);
  requireCompleteDeclaration(db);
  requireCommittedArtifacts(db);

  const privilegeSql = join(generated, `privileges.${db}.sql`);
  const capabilitySql = join(generated, `port-context-capabilities.${db}.sql`);
  for (const path of [contract, privilegeSql, capabilitySql]) {
    if (!existsSync(path)) throw new Error(`required post-zero artifact does not exist: ${path}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'bcb-post-zero-apply.'));
  const driver = join(tempDir, 'apply.sql');
  try {
    writeFileSync(driver, [
      '\\set ON_ERROR_STOP on',
      'BEGIN;',
      shellLogins(staffLogin, patientLogin, integratorLogin),
      `\\i ${contract}`,
      `\\i ${privilegeSql}`,
      `\\i ${capabilitySql}`,
      'COMMIT;',
      '',
    ].join('\n'));
    const result = run('psql', ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1',
      '-v', `DBNAME=${db}`, '-v', `app_staff_login=${staffLogin}`,
      '-v', `app_patient_login=${patientLogin}`, '-v', `integrator_login=${integratorLogin}`, '-f', driver]);
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    if (result.status !== 0) throw new Error('post-zero installation rolled back');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function selfTest() {
  const currentDb = 'bersoncarebot_test';
  const result = run('node', ['deploy/postgres/privileges/generate-cli.mjs', '--db', currentDb, '--gaps']);
  if (result.status === 0) throw new Error('self-test expected current incomplete relation matrix to refuse installation');
  if (!`${result.stdout}\n${result.stderr}`.includes('unresolved access census')) {
    throw new Error('self-test expected a named unresolved relation-access gap');
  }
  console.log('post-zero apply self-test: PASS (incomplete declaration is fail-closed)');
}

try {
  const values = parseArgs(process.argv.slice(2));
  if (values.get('--self-test') === true) selfTest();
  else apply(values);
} catch (error) {
  console.error(`post-zero apply: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
}
