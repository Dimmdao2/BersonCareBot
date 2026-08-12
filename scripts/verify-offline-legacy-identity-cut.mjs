#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot, resolveTrustedPostgresBinaries } from './a0-greenfield-baseline-lib.mjs';

const migrationPath = path.join(
  repoRoot,
  'apps',
  'integrator',
  'src',
  'infra',
  'db',
  'migrations',
  'core',
  '20260812_0001_offline_drop_legacy_identity.sql',
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const postgres = resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_legacy_identity_cut_'));
const dataDir = path.join(scratchRoot, 'data');
const socketDir = path.join(scratchRoot, 'socket');
const postgresLog = path.join(scratchRoot, 'postgres.log');
const port = String(55000 + (process.pid % 5000));
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

const baseSchemaSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DROP SCHEMA IF EXISTS integrator CASCADE;
CREATE SCHEMA integrator;
TRUNCATE TABLE public.user_channel_bindings, public.platform_users CASCADE;

CREATE TABLE integrator.users (
  id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integrator.identities (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES integrator.users(id) ON DELETE CASCADE,
  resource text NOT NULL,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource, external_id)
);
CREATE TABLE integrator.telegram_state (
  identity_id bigint PRIMARY KEY REFERENCES integrator.identities(id) ON DELETE CASCADE,
  username text,
  first_name text,
  last_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integrator.message_drafts (
  id bigint PRIMARY KEY,
  identity_id bigint NOT NULL REFERENCES integrator.identities(id) ON DELETE CASCADE
);
`;

const publicSchemaSql = `
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_user_id bigint UNIQUE,
  display_name text NOT NULL DEFAULT '',
  first_name text,
  last_name text,
  role text NOT NULL DEFAULT 'client',
  merged_into_id uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_channel_bindings (
  user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  channel_code text NOT NULL,
  external_id text NOT NULL,
  display_handle text,
  bot_blocked_at timestamptz,
  bot_blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_code, external_id)
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

  psql(publicSchemaSql);
  psql(`${baseSchemaSql}
INSERT INTO integrator.users(id) VALUES (10), (11), (12), (13);
INSERT INTO integrator.identities(id, user_id, resource, external_id) VALUES
  (1, 10, 'telegram', '100'),
  (2, 11, 'max', '200'),
  (3, 12, 'telegram', '300'),
  (4, 13, 'telegram', '400');
INSERT INTO public.platform_users(id, integrator_user_id, display_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10, 'canonical'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 'merge target'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 12, 'tombstone'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', NULL, 'existing binding');
UPDATE public.platform_users
   SET merged_into_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
INSERT INTO public.user_channel_bindings(user_id, channel_code, external_id)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'telegram', '400');
INSERT INTO integrator.telegram_state(identity_id, username, first_name, last_name, is_active) VALUES
  (1, '@alice', 'must', 'not-copy', false),
  (3, '@merged', NULL, NULL, true),
  (4, '@existing', NULL, NULL, true);
BEGIN;
${migrationSql}
COMMIT;
BEGIN;
${migrationSql}
COMMIT;
DO $verify_positive$
DECLARE
  bad bigint;
BEGIN
  IF to_regclass('integrator.telegram_state') IS NOT NULL
     OR to_regclass('integrator.message_drafts') IS NOT NULL
     OR to_regclass('integrator.identities') IS NOT NULL
     OR to_regclass('integrator.users') IS NOT NULL THEN
    RAISE EXCEPTION 'positive proof retained a legacy table';
  END IF;
  SELECT count(*) INTO bad FROM public.user_channel_bindings;
  IF bad <> 4 THEN RAISE EXCEPTION 'positive proof expected four bindings, got %', bad; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_channel_bindings
     WHERE channel_code = 'telegram' AND external_id = '100'
       AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       AND display_handle = 'alice' AND bot_blocked_at IS NOT NULL
       AND bot_blocked_reason = 'legacy_telegram_state_inactive'
  ) THEN RAISE EXCEPTION 'positive proof lost telegram channel facts'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_channel_bindings
     WHERE channel_code = 'telegram' AND external_id = '300'
       AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) THEN RAISE EXCEPTION 'positive proof did not resolve merged platform user'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_users user_row
    JOIN public.user_channel_bindings binding ON binding.user_id = user_row.id
     WHERE user_row.integrator_user_id = 11 AND binding.channel_code = 'max'
       AND binding.external_id = '200' AND user_row.display_name = ''
  ) THEN RAISE EXCEPTION 'positive proof did not create the credential-free binding owner'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_users
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       AND (first_name IS NOT NULL OR last_name IS NOT NULL)
  ) THEN RAISE EXCEPTION 'positive proof copied duplicate person names'; END IF;
END
$verify_positive$;
`);

  psql(
    `${baseSchemaSql}
INSERT INTO integrator.users(id) VALUES (20);
INSERT INTO integrator.identities(id, user_id, resource, external_id)
VALUES (20, 20, 'telegram', 'atomic-rollback');
CREATE TABLE integrator.unexpected_identity_consumer (
  identity_id bigint REFERENCES integrator.identities(id)
);
BEGIN;
${migrationSql}
COMMIT;
`,
    false,
  );
  psql(`DO $verify_rollback$
BEGIN
  IF to_regclass('integrator.telegram_state') IS NULL
     OR to_regclass('integrator.message_drafts') IS NULL
     OR to_regclass('integrator.identities') IS NULL
     OR to_regclass('integrator.users') IS NULL THEN
    RAISE EXCEPTION 'negative proof did not roll back all legacy drops';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_channel_bindings
     WHERE channel_code = 'telegram' AND external_id = 'atomic-rollback'
  ) THEN RAISE EXCEPTION 'negative proof did not roll back the binding write'; END IF;
END
$verify_rollback$;`);

  psql(
    `${baseSchemaSql}
INSERT INTO integrator.users(id) VALUES (30);
INSERT INTO integrator.identities(id, user_id, resource, external_id)
VALUES (30, 30, 'unknown-channel', 'must-not-disappear');
BEGIN;
${migrationSql}
COMMIT;
`,
    false,
  );
  psql(`DO $verify_unknown$
BEGIN
  IF to_regclass('integrator.identities') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM integrator.identities
        WHERE resource = 'unknown-channel' AND external_id = 'must-not-disappear'
     ) THEN
    RAISE EXCEPTION 'unsupported-channel proof lost its source row';
  END IF;
END
$verify_unknown$;`);

  process.stdout.write(
    'offline legacy identity cut: OK (positive, idempotent, atomic rollback, unsupported channel)\n',
  );
} finally {
  if (started) {
    run(postgres.pg_ctl, ['-D', dataDir, '-m', 'immediate', 'stop'], undefined, true);
  }
  const canonicalScratch = fs.realpathSync(scratchRoot);
  const expectedPrefix = path.join(fs.realpathSync(os.tmpdir()), 'bcb_legacy_identity_cut_');
  if (!canonicalScratch.startsWith(expectedPrefix))
    throw new Error('unsafe scratch cleanup target');
  fs.rmSync(scratchRoot, { recursive: true, force: true });
}
