#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot, resolveTrustedPostgresBinaries } from './a0-greenfield-baseline-lib.mjs';

const operatorRole = 'bcb_b3_operator';
const postgresPort = String(57000 + (process.pid % 1000));
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_hardening_b3_'));
const dataDir = path.join(scratchRoot, 'data');
const socketDir = path.join(scratchRoot, 'socket');
const databaseName = 'bcb_hardening_b3_scratch';
const postgresBinaries = resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
fs.mkdirSync(socketDir, { mode: 0o700 });

const scrubbedEnvironmentKeys = Object.freeze([
  'DATABASE_URL',
  'DATABASE_URL_STAFF',
  'DATABASE_URL_NONSTAFF',
  'INTEGRATOR_DATABASE_URL',
  'PGDATABASE',
  'PGHOST',
  'PGHOSTADDR',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGUSER',
]);

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const key of scrubbedEnvironmentKeys) delete environment[key];
  return { ...environment, ...overrides };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env ?? cleanEnvironment(),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    const timeout = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The child may have exited between timeout scheduling and signal delivery.
      }
    }, options.timeout ?? 180_000);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      const stdoutText = Buffer.concat(stdout).toString('utf8');
      const stderrText = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) {
        reject(
          new Error(
            `${options.label ?? command}_failed:${code ?? signal ?? 'unknown'}\n` +
              `${stderrText.slice(-12000)}\n${stdoutText.slice(-12000)}`,
          ),
        );
        return;
      }
      resolve(stdoutText);
    });
    child.stdin.end(options.input ?? undefined);
  });
}

const schemaSql = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE be_clinic_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buffer_after_minutes integer NOT NULL DEFAULT 0
);

CREATE TABLE be_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid,
  room_id uuid,
  specialist_id uuid,
  service_id uuid,
  platform_user_id uuid,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  chain_id uuid,
  chain_position integer,
  source text NOT NULL,
  status text NOT NULL,
  original_start_at timestamptz,
  reschedule_count integer NOT NULL DEFAULT 0,
  payment_ref text,
  package_usage_ref text,
  phone_normalized text,
  attribution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  b3_backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
  CHECK (end_at > start_at)
);
CREATE INDEX idx_b3_appointments_org_start ON be_appointments (organization_id, start_at);

CREATE TABLE be_appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE be_appointment_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE be_patient_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  domain text NOT NULL,
  event_type text NOT NULL,
  linked_object_type text NOT NULL,
  linked_object_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE be_schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  specialist_id uuid,
  branch_id uuid,
  room_id uuid,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  block_type text NOT NULL,
  title text,
  created_by_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION b3_assert_org_principal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NULLIF(current_setting('app.org', true), '')::uuid IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'b3_missing_or_wrong_org_principal';
  END IF;
  PERFORM pg_sleep(0.15);
  RETURN NEW;
END
$$;
CREATE TRIGGER b3_require_org_principal
BEFORE INSERT ON be_appointments
FOR EACH ROW EXECUTE FUNCTION b3_assert_org_principal();
`;

let started = false;
let cleaning = false;
function cleanup(exitCode = null) {
  if (cleaning) return;
  cleaning = true;
  if (started) {
    spawnSync(postgresBinaries.pg_ctl, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
      cwd: repoRoot,
      env: cleanEnvironment(),
      stdio: 'ignore',
    });
  }
  const expectedPrefix = path.join(fs.realpathSync(os.tmpdir()), 'bcb_hardening_b3_');
  const canonicalScratch = fs.realpathSync(scratchRoot);
  if (!canonicalScratch.startsWith(expectedPrefix) || path.dirname(dataDir) !== scratchRoot) {
    throw new Error('unsafe_scratch_cleanup_target');
  }
  fs.rmSync(scratchRoot, { recursive: true, force: true });
  if (exitCode !== null) process.exit(exitCode);
}

for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
]) {
  process.once(signal, () => cleanup(exitCode));
}

try {
  await run(
    postgresBinaries.initdb,
    ['-D', dataDir, `--username=${operatorRole}`, '--auth=trust', '--no-locale'],
    { label: 'b3_initdb' },
  );
  started = true;
  await run(
    postgresBinaries.pg_ctl,
    [
      '-D',
      dataDir,
      '-o',
      `-F -k ${socketDir} -p ${postgresPort} -c listen_addresses=''`,
      '-w',
      'start',
      '-l',
      path.join(scratchRoot, 'postgres.log'),
    ],
    { label: 'b3_pg_start' },
  );
  const psqlBase = [
    '-h',
    socketDir,
    '-p',
    postgresPort,
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    operatorRole,
  ];
  await run(
    postgresBinaries.psql,
    [...psqlBase, '-d', 'postgres', '-c', `CREATE DATABASE ${databaseName}`],
    {
      label: 'b3_create_database',
    },
  );
  await run(postgresBinaries.psql, [...psqlBase, '-d', databaseName, '-f', '-'], {
    label: 'b3_schema',
    input: schemaSql,
  });

  const databaseUrl = `postgresql://${operatorRole}@localhost:${postgresPort}/${databaseName}?host=${encodeURIComponent(socketDir)}`;
  const output = await run(
    '/usr/bin/env',
    ['pnpm', '--dir', 'apps/webapp', 'exec', 'tsx', 'scripts/run-b3-booking-concurrency.ts'],
    {
      label: 'b3_two_connection_runtime_proof',
      env: cleanEnvironment({
        NODE_ENV: 'test',
        USE_REAL_DATABASE: '1',
        DATABASE_URL: databaseUrl,
        DB_PRINCIPAL_CONTEXT_MODE: 'legacy-guc',
        CI: 'true',
      }),
    },
  );
  const evidence = JSON.parse(output.trim().split('\n').at(-1));
  if (evidence.status !== 'PASS') throw new Error('b3_runtime_proof_missing_pass');
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        transport: 'private-unix-socket-ephemeral-postgresql',
        workingDatabaseTouched: false,
        ...evidence,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `verify-b3-booking-concurrency: ${error instanceof Error ? error.message : 'unknown_error'}`,
  );
  cleanup();
  process.exit(1);
} finally {
  cleanup();
}
