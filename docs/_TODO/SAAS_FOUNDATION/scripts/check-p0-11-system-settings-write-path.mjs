#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();

const files = {
  ports: "apps/webapp/src/modules/system-settings/ports.ts",
  service: "apps/webapp/src/modules/system-settings/service.ts",
  webappRepo: "apps/webapp/src/infra/repos/pgSystemSettings.ts",
  syncToIntegrator: "apps/webapp/src/modules/system-settings/syncToIntegrator.ts",
  m2mPosts: "apps/webapp/src/infra/integrator-push/integratorM2mPosts.ts",
  integratorSyncRoute: "apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts",
  migration: "apps/webapp/db/drizzle-migrations/0164_p0_11_3_system_settings_audit_org.sql",
  journal: "apps/webapp/db/drizzle-migrations/meta/_journal.json",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(path));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

function assertNoRouteLevelSyncCall() {
  const offenders = [];
  for (const abs of listTsFiles(join(repoRoot, "apps/webapp/src/app"))) {
    if (abs.endsWith(".test.ts") || abs.endsWith(".test.tsx")) {
      continue;
    }
    const src = readFileSync(abs, "utf8");
    if (src.includes("syncSettingToIntegrator")) {
      offenders.push(relative(repoRoot, abs).replace(/\\/g, "/"));
    }
  }
  if (offenders.length > 0) {
    throw new Error(`route-level syncSettingToIntegrator calls found: ${offenders.join(", ")}`);
  }
}

function runChecks(overrides = {}) {
  const ports = overrides.ports ?? read(files.ports);
  const service = overrides.service ?? read(files.service);
  const webappRepo = overrides.webappRepo ?? read(files.webappRepo);
  const syncToIntegrator = overrides.syncToIntegrator ?? read(files.syncToIntegrator);
  const m2mPosts = overrides.m2mPosts ?? read(files.m2mPosts);
  const integratorSyncRoute = overrides.integratorSyncRoute ?? read(files.integratorSyncRoute);
  const migration = overrides.migration ?? read(files.migration);
  const journal = overrides.journal ?? read(files.journal);

  assertContains(files.ports, ports, "export type SystemSettingsWriteOptions");
  assertContains(files.ports, ports, "organizationId?: string | null");
  assertContains(files.ports, ports, "options?: SystemSettingsWriteOptions");
  assertContains(files.service, service, "options: SystemSettingsWriteOptions = {}");
  assertContains(files.service, service, "const organizationId = options.organizationId?.trim() || null");
  assertContains(files.service, service, "organizationId: result.organizationId ?? null");
  assertContains(files.service, service, "organizationId: s.organizationId ?? null");

  for (const needle of [
    "ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE",
    "ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE",
    "INSERT INTO system_settings_audit",
    "(key, scope, organization_id, old_value_json, new_value_json, changed_by, source)",
  ]) {
    assertContains(files.webappRepo, webappRepo, needle);
  }

  assertContains(files.syncToIntegrator, syncToIntegrator, 'idempotencyKey: `settings:${organizationKey}:${input.scope}:${input.key}`');
  assertContains(files.syncToIntegrator, syncToIntegrator, "organizationId: input.organizationId ?? null");
  assertContains(files.m2mPosts, m2mPosts, "organizationId?: string | null");
  assertContains(files.m2mPosts, m2mPosts, "organizationId: input.organizationId ?? null");
  assertContains(files.integratorSyncRoute, integratorSyncRoute, "organizationId: z.string().uuid().nullable().optional()");
  assertContains(files.integratorSyncRoute, integratorSyncRoute, "ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE");
  assertContains(files.integratorSyncRoute, integratorSyncRoute, "ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE");

  assertContains(files.migration, migration, 'ALTER TABLE "public"."system_settings_audit" ADD COLUMN IF NOT EXISTS "organization_id" uuid;');
  assertContains(files.migration, migration, 'ADD CONSTRAINT "system_settings_audit_organization_id_fkey"');
  assertContains(files.migration, migration, 'CREATE INDEX IF NOT EXISTS "idx_system_settings_audit_org_key_at"');
  assertContains(files.journal, journal, '"tag": "0164_p0_11_3_system_settings_audit_org"');
  assertNoRouteLevelSyncCall();
}

if (process.argv.includes("--self-test")) {
  const service = read(files.service).replace("organizationId: result.organizationId ?? null", "organizationId: null");
  try {
    runChecks({ service });
  } catch {
    console.log("check-p0-11-system-settings-write-path self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect missing sync result organizationId");
}

try {
  runChecks();
  console.log("check-p0-11-system-settings-write-path: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-11-system-settings-write-path: ${message}`);
  process.exit(1);
}
