#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const repoRoot = process.cwd();
const dbName = `bcb_saas_p0_11_1_scratch_${process.pid}_${Date.now()}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : "inherit",
    input: options.input,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function psql(sql) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", dbName], { input: sql });
}

const migration = readFileSync(
  join(repoRoot, "apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql"),
  "utf8",
);

const setupSql = `
CREATE SCHEMA integrator;

CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY
);

CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY
);

CREATE TABLE public.system_settings (
  key text NOT NULL,
  scope text DEFAULT 'global' NOT NULL,
  value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT system_settings_pkey PRIMARY KEY (key, scope),
  CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id),
  CONSTRAINT system_settings_scope_check CHECK (scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text]))
);

CREATE TABLE integrator.system_settings (
  key text NOT NULL,
  scope text DEFAULT 'global' NOT NULL,
  value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by text,
  CONSTRAINT system_settings_pkey PRIMARY KEY (key, scope),
  CONSTRAINT system_settings_scope_check CHECK (scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text]))
);

CREATE TABLE public.platform_user_contacts (
  id uuid PRIMARY KEY,
  organization_id uuid
);

CREATE TABLE public.user_phone_history (
  id uuid PRIMARY KEY,
  organization_id uuid
);
`;

const assertionSql = `
INSERT INTO public.be_organizations (id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.system_settings (key, scope, value_json)
VALUES ('p0_11_smoke', 'admin', '{"value":"global"}'::jsonb);

INSERT INTO public.system_settings (key, scope, organization_id, value_json)
VALUES
  ('p0_11_smoke', 'admin', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"value":"org-a"}'::jsonb),
  ('p0_11_smoke', 'admin', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"value":"org-b"}'::jsonb);

INSERT INTO public.system_settings (key, scope, value_json)
VALUES ('p0_11_smoke', 'admin', '{"value":"updated-global"}'::jsonb)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json;

DO $$
BEGIN
  INSERT INTO public.system_settings (key, scope, value_json)
  VALUES ('p0_11_smoke', 'admin', '{"value":"duplicate-global"}'::jsonb);
  RAISE EXCEPTION 'expected duplicate global row to fail';
EXCEPTION
  WHEN unique_violation THEN NULL;
END $$;

DO $$
BEGIN
  INSERT INTO public.system_settings (key, scope, organization_id, value_json)
  VALUES ('p0_11_smoke', 'admin', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"value":"duplicate-org"}'::jsonb);
  RAISE EXCEPTION 'expected duplicate org row to fail';
EXCEPTION
  WHEN unique_violation THEN NULL;
END $$;

DO $$
BEGIN
  INSERT INTO public.system_settings (key, scope, organization_id, value_json)
  VALUES ('p0_11_smoke', 'admin', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"value":"missing-org"}'::jsonb);
  RAISE EXCEPTION 'expected missing org FK to fail';
EXCEPTION
  WHEN foreign_key_violation THEN NULL;
END $$;

INSERT INTO integrator.system_settings (key, scope, value_json)
VALUES ('p0_11_smoke', 'admin', '{"value":"global"}'::jsonb);

INSERT INTO integrator.system_settings (key, scope, organization_id, value_json)
VALUES ('p0_11_smoke', 'admin', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"value":"org-a"}'::jsonb);

INSERT INTO integrator.system_settings (key, scope, value_json)
VALUES ('p0_11_smoke', 'admin', '{"value":"updated-global"}'::jsonb)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json;
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql(setupSql);
  psql(migration);
  psql(assertionSql);
  console.log(`smoke-p0-11-system-settings-storage: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
}
