#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot, resolveTrustedPostgresBinaries } from './a0-greenfield-baseline-lib.mjs';

const migrationSql = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0386_offline_drop_legacy_appointment_records_local.sql',
  ),
  'utf8',
);
const postgres = resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_legacy_appointment_cut_'));
const dataDir = path.join(scratchRoot, 'data');
const socketDir = path.join(scratchRoot, 'socket');
const postgresLog = path.join(scratchRoot, 'postgres.log');
const port = String(56000 + (process.pid % 4000));
fs.mkdirSync(socketDir, { mode: 0o700 });
let started = false;

function run(command, args, input = undefined, expectSuccess = true) {
  const environment = { ...process.env };
  for (const key of ['PGDATABASE', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGPASSWORD']) {
    delete environment[key];
  }
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: environment,
    input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (expectSuccess && result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed (${result.status ?? result.signal}):\n${result.stderr}${result.stdout}`,
    );
  }
  if (!expectSuccess && result.status === 0) {
    throw new Error(`${path.basename(command)} unexpectedly succeeded`);
  }
  return result;
}

function psql(sql, expectSuccess = true) {
  return run(
    postgres.psql,
    ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socketDir, '-p', port, '-U', 'dev', '-d', 'postgres'],
    sql,
    expectSuccess,
  );
}

const fixtureSql = `
DROP TABLE IF EXISTS public.unexpected_appointment_consumer;
DROP TABLE IF EXISTS public.clinical_visit;
DROP TABLE IF EXISTS public.appointment_records;
DROP TABLE IF EXISTS public.be_external_entity_mappings;
DROP TABLE IF EXISTS public.be_appointments;
CREATE TABLE public.be_appointments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL
);
CREATE TABLE public.be_external_entity_mappings (
  external_system text NOT NULL,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  canonical_id uuid NOT NULL REFERENCES public.be_appointments(id),
  UNIQUE (external_system, entity_type, external_id)
);
CREATE TABLE public.appointment_records (
  id uuid PRIMARY KEY,
  integrator_record_id text NOT NULL UNIQUE
);
CREATE TABLE public.clinical_visit (
  id uuid PRIMARY KEY,
  appointment_record_id uuid REFERENCES public.appointment_records(id) ON DELETE SET NULL,
  canonical_appointment_id uuid REFERENCES public.be_appointments(id) ON DELETE SET NULL
);
`;

try {
  run(postgres.initdb, ['-D', dataDir, '--username=dev', '--auth=trust', '--no-locale']);
  run(postgres.pg_ctl, [
    '-D',
    dataDir,
    '-l',
    postgresLog,
    '-o',
    `-F -k ${socketDir} -p ${port} -c listen_addresses=''`,
    '-w',
    'start',
  ]);
  started = true;

  psql(`${fixtureSql}
INSERT INTO public.be_appointments(id, organization_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.be_external_entity_mappings(external_system, entity_type, external_id, canonical_id)
VALUES ('rubitime', 'appointment', 'legacy-2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
INSERT INTO public.appointment_records(id, integrator_record_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'be:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('10000000-0000-0000-0000-000000000002', 'legacy-2');
INSERT INTO public.clinical_visit(id, appointment_record_id) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
BEGIN;
${migrationSql}
COMMIT;
BEGIN;
${migrationSql}
COMMIT;
DO $verify$
BEGIN
  IF to_regclass('public.appointment_records') IS NOT NULL THEN
    RAISE EXCEPTION 'positive proof retained public.appointment_records';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid = 'public.clinical_visit'::regclass
       AND attname = 'appointment_record_id' AND NOT attisdropped
  ) THEN RAISE EXCEPTION 'positive proof retained clinical_visit.appointment_record_id'; END IF;
  IF (SELECT count(*) FROM public.clinical_visit
       WHERE canonical_appointment_id IN (
         'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
         'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
       )) <> 2 THEN
    RAISE EXCEPTION 'positive proof did not preserve both canonical visit links';
  END IF;
END
$verify$;
`);

  psql(`${fixtureSql}
INSERT INTO public.appointment_records(id, integrator_record_id)
VALUES ('10000000-0000-0000-0000-000000000003', 'unresolved');
INSERT INTO public.clinical_visit(id, appointment_record_id)
VALUES ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003');
BEGIN;
${migrationSql}
COMMIT;
`, false);
  psql(`DO $verify$
BEGIN
  IF to_regclass('public.appointment_records') IS NULL THEN
    RAISE EXCEPTION 'unresolved-link failure was not atomic';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid = 'public.clinical_visit'::regclass
       AND attname = 'appointment_record_id' AND NOT attisdropped
  ) THEN RAISE EXCEPTION 'unresolved-link failure dropped the source column'; END IF;
END
$verify$;`);

  psql(`${fixtureSql}
INSERT INTO public.be_appointments(id, organization_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.appointment_records(id, integrator_record_id)
VALUES ('10000000-0000-0000-0000-000000000004', 'be:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO public.clinical_visit(id, appointment_record_id)
VALUES ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004');
CREATE TABLE public.unexpected_appointment_consumer (
  appointment_record_id uuid REFERENCES public.appointment_records(id)
);
BEGIN;
${migrationSql}
COMMIT;
`, false);
  psql(`DO $verify$
BEGIN
  IF to_regclass('public.appointment_records') IS NULL
     OR to_regclass('public.unexpected_appointment_consumer') IS NULL THEN
    RAISE EXCEPTION 'unexpected-FK failure was not atomic';
  END IF;
  IF (SELECT canonical_appointment_id FROM public.clinical_visit LIMIT 1) IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected-FK failure retained a partial backfill';
  END IF;
END
$verify$;`);

  console.log(`offline legacy appointment cut: OK (${scratchRoot})`);
} finally {
  if (started) {
    run(postgres.pg_ctl, ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
  }
  fs.rmSync(scratchRoot, { recursive: true, force: true });
}
