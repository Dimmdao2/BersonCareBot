#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repoRoot = process.cwd();
const migrationPath = "apps/webapp/db/drizzle-migrations/0218_u6b_organization_slug_claims.sql";
const suffix = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_u6b_slug_scratch_${suffix}`;
const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error("unsafe_scratch_database_name");
}

function run(command, args, input, expectFailureText) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    stdio: input === undefined ? "pipe" : ["pipe", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (expectFailureText) {
    if (result.status === 0 || !output.includes(expectFailureText)) {
      process.stdout.write(output);
      throw new Error(`expected_failure_not_observed:${expectFailureText}`);
    }
    return;
  }
  if (result.status !== 0) {
    process.stdout.write(output);
    throw new Error(`${command}_failed:${result.status ?? "unknown"}`);
  }
}

function postgres(command, args, input, expectFailureText) {
  run("sudo", ["-n", "-u", "postgres", command, ...args], input, expectFailureText);
}

function psql(sql, expectFailureText) {
  postgres("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-d", dbName], sql, expectFailureText);
}

try {
  postgres("createdb", [dbName]);
  psql(`
    CREATE SCHEMA app;
    CREATE FUNCTION app.current_org_id() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.be_organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.platform_users (id uuid PRIMARY KEY);
    CREATE TABLE public.clinic_public_directory_entries (
      organization_id uuid PRIMARY KEY REFERENCES public.be_organizations(id),
      slug text NOT NULL UNIQUE,
      is_published boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.be_organizations (id) VALUES ('${orgA}'), ('${orgB}');
    INSERT INTO public.clinic_public_directory_entries (organization_id, slug)
      VALUES ('${orgA}', 'clinic-old');
  `);

  psql(readFileSync(migrationPath, "utf8"));

  psql(
    `UPDATE public.clinic_public_directory_entries
       SET slug = 'directory-diverged'
     WHERE organization_id = '${orgA}';`,
    "clinic directory slug must match the organization current claim",
  );

  // Absence is valid: remove the optional projection, commit, then recreate it from current truth.
  psql(`
    DELETE FROM public.clinic_public_directory_entries WHERE organization_id = '${orgA}';
    SELECT 1 / (count(*) = 0)::int
    FROM public.clinic_public_directory_entries WHERE organization_id = '${orgA}';
    INSERT INTO public.clinic_public_directory_entries (organization_id, slug)
      VALUES ('${orgA}', 'clinic-old');
  `);

  // Exercise the complete rename transaction against the real deferred and immediate triggers.
  psql(`
    INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
      VALUES ('clinic-new', 'reservation', '${orgA}');
    BEGIN;
    DELETE FROM public.organization_slug_claims
      WHERE organization_id = '${orgA}' AND kind = 'reservation' AND slug = 'clinic-new';
    UPDATE public.organization_slug_claims SET slug = 'clinic-new'
      WHERE organization_id = '${orgA}' AND kind = 'current';
    UPDATE public.clinic_public_directory_entries SET slug = 'clinic-new'
      WHERE organization_id = '${orgA}';
    INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
      VALUES ('clinic-old', 'alias', '${orgA}');
    INSERT INTO public.organization_slug_rename_events
      (organization_id, previous_slug, next_slug)
      VALUES ('${orgA}', 'clinic-old', 'clinic-new');
    COMMIT;

    SELECT 1 / (count(*) = 1)::int FROM public.organization_slug_claims
      WHERE organization_id = '${orgA}' AND kind = 'current' AND slug = 'clinic-new';
    SELECT 1 / (count(*) = 1)::int FROM public.organization_slug_claims
      WHERE organization_id = '${orgA}' AND kind = 'alias' AND slug = 'clinic-old';
    SELECT 1 / (count(*) = 1)::int FROM public.clinic_public_directory_entries
      WHERE organization_id = '${orgA}' AND slug = 'clinic-new';
  `);

  psql(
    `INSERT INTO public.clinic_public_directory_entries (organization_id, slug)
       VALUES ('${orgB}', 'orphan-directory');`,
    "clinic directory slug must match the organization current claim",
  );

  psql(
    `UPDATE public.organization_slug_claims SET slug = 'partial-rename'
       WHERE organization_id = '${orgA}' AND kind = 'current';`,
    "organization slug rename requires retained alias, synchronized directory and audit event",
  );

} finally {
  postgres("dropdb", ["--if-exists", "--force", dbName]);
}

console.log("smoke-u6b-organization-slug-invariants: OK (scratch DB removed)");
