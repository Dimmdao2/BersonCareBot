#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const dbName = `bcb_saas_p0_11_3_scratch_${process.pid}_${Date.now()}`;

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('scratch')) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status ?? 'unknown status'}`,
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(sql) {
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', dbName], {
    input: sql,
  });
}

const migration = readFileSync(
  join(repoRoot, 'apps/webapp/db/drizzle-migrations/0164_p0_11_3_system_settings_audit_org.sql'),
  'utf8',
);

const setupSql = `
CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY
);

CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY
);

CREATE TABLE public.system_settings_audit (
  id uuid PRIMARY KEY,
  key text NOT NULL,
  scope text NOT NULL,
  old_value_json jsonb,
  new_value_json jsonb NOT NULL,
  changed_by uuid REFERENCES public.platform_users(id),
  changed_at timestamptz DEFAULT now() NOT NULL,
  source text
);
`;

const assertionSql = `
INSERT INTO public.be_organizations (id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.system_settings_audit (id, key, scope, organization_id, new_value_json)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'support_contact_url', 'admin', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"value":"org"}'::jsonb);

DO $$
BEGIN
  INSERT INTO public.system_settings_audit (id, key, scope, organization_id, new_value_json)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'support_contact_url', 'admin', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"value":"missing"}'::jsonb);
  RAISE EXCEPTION 'expected missing org FK to fail';
EXCEPTION
  WHEN foreign_key_violation THEN NULL;
END $$;
`;

try {
  run('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);
  psql(setupSql);
  psql(migration);
  psql(assertionSql);
  console.log(`smoke-p0-11-system-settings-write-path: OK (${dbName})`);
} finally {
  run('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
}
