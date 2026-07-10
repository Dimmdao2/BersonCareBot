#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  migration: "apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql",
  drizzleSchema: "apps/webapp/db/schema/schema.ts",
  webappRepo: "apps/webapp/src/infra/repos/pgSystemSettings.ts",
  integratorPublicReader: "apps/integrator/src/infra/db/publicSystemSettings.ts",
  integratorMirrorSync: "apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts",
  integratorTemplatePort: "apps/integrator/src/infra/db/repos/notifTemplatePort.ts",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function fail(message) {
  throw new Error(message);
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    fail(`${name} missing required text: ${needle}`);
  }
}

function assertBefore(name, text, earlier, later) {
  const earlierIndex = text.indexOf(earlier);
  const laterIndex = text.indexOf(later);
  if (earlierIndex === -1) fail(`${name} missing required text: ${earlier}`);
  if (laterIndex === -1) fail(`${name} missing required text: ${later}`);
  if (earlierIndex > laterIndex) {
    fail(`${name} has ${earlier} after ${later}`);
  }
}

function runChecks(overrides = {}) {
  const migration = overrides.migration ?? read(files.migration);
  const drizzleSchema = overrides.drizzleSchema ?? read(files.drizzleSchema);
  const webappRepo = overrides.webappRepo ?? read(files.webappRepo);
  const integratorPublicReader = overrides.integratorPublicReader ?? read(files.integratorPublicReader);
  const integratorMirrorSync = overrides.integratorMirrorSync ?? read(files.integratorMirrorSync);
  const integratorTemplatePort = overrides.integratorTemplatePort ?? read(files.integratorTemplatePort);

  assertBefore(
    files.migration,
    migration,
    'ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "organization_id" uuid;',
    'CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings"',
  );
  assertBefore(
    files.migration,
    migration,
    'ALTER TABLE "integrator"."system_settings" ADD COLUMN IF NOT EXISTS "organization_id" uuid;',
    'CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "integrator"."system_settings"',
  );

  for (const needle of [
    'CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_global_key_scope_uidx"',
    'WHERE "organization_id" IS NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_org_key_scope_uidx"',
    'WHERE "organization_id" IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS "integrator_system_settings_global_key_scope_uidx"',
    'CREATE UNIQUE INDEX IF NOT EXISTS "integrator_system_settings_org_key_scope_uidx"',
    'ALTER TABLE "public"."system_settings" DROP CONSTRAINT IF EXISTS "system_settings_pkey";',
    'ALTER TABLE "integrator"."system_settings" DROP CONSTRAINT IF EXISTS "system_settings_pkey";',
    'ADD CONSTRAINT "system_settings_organization_id_fkey"',
    'ADD CONSTRAINT "integrator_system_settings_organization_id_fkey"',
    'REFERENCES "public"."be_organizations"("id")',
  ]) {
    assertContains(files.migration, migration, needle);
  }

  assertContains(files.drizzleSchema, drizzleSchema, 'organizationId: uuid("organization_id"),');
  assertContains(files.drizzleSchema, drizzleSchema, 'uniqueIndex("system_settings_global_key_scope_uidx")');
  assertContains(files.drizzleSchema, drizzleSchema, 'uniqueIndex("system_settings_org_key_scope_uidx")');
  if (/primaryKey\(\{\s*columns:\s*\[table\.key,\s*table\.scope\][\s\S]*system_settings_pkey/.test(drizzleSchema)) {
    fail(`${files.drizzleSchema} still declares the legacy (key, scope) system_settings primary key`);
  }

  assertContains(files.webappRepo, webappRepo, "WHERE key = $1 AND scope = ANY($2::text[])");
  assertContains(files.webappRepo, webappRepo, "AND organization_id IS NULL");
  assertContains(files.integratorPublicReader, integratorPublicReader, "AND organization_id IS NULL");

  for (const [name, text] of [
    [files.webappRepo, webappRepo],
    [files.integratorMirrorSync, integratorMirrorSync],
  ]) {
    assertContains(name, text, "ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE");
  }

  for (const forbidden of [
    "export async function setNotifTemplate",
    "INSERT INTO public.system_settings",
    "ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE",
  ]) {
    if (integratorTemplatePort.includes(forbidden)) {
      fail(`${files.integratorTemplatePort} still contains forbidden direct settings writer text: ${forbidden}`);
    }
  }
}

if (process.argv.includes("--self-test")) {
  const migration = read(files.migration).replace(
    'ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "organization_id" uuid;',
    "-- missing public system_settings organization_id",
  );
  try {
    runChecks({ migration });
  } catch {
    console.log("check-p0-11-system-settings-storage self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect missing public system_settings organization_id");
}

try {
  runChecks();
  console.log("check-p0-11-system-settings-storage: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-11-system-settings-storage: ${message}`);
  process.exit(1);
}
