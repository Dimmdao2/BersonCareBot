#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  ports: "apps/webapp/src/modules/system-settings/ports.ts",
  service: "apps/webapp/src/modules/system-settings/service.ts",
  webappRepo: "apps/webapp/src/infra/repos/pgSystemSettings.ts",
  integratorPublicReader: "apps/integrator/src/infra/db/publicSystemSettings.ts",
  mediaPipeline: "apps/media-worker/src/pipelineEnabled.ts",
  mediaWatermark: "apps/media-worker/src/watermarkEnabled.ts",
  accessorGuard: "apps/webapp/scripts/check-system-settings-accessors.mjs",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const ports = overrides.ports ?? read(files.ports);
  const service = overrides.service ?? read(files.service);
  const webappRepo = overrides.webappRepo ?? read(files.webappRepo);
  const integratorPublicReader = overrides.integratorPublicReader ?? read(files.integratorPublicReader);
  const mediaPipeline = overrides.mediaPipeline ?? read(files.mediaPipeline);
  const mediaWatermark = overrides.mediaWatermark ?? read(files.mediaWatermark);
  const accessorGuard = overrides.accessorGuard ?? read(files.accessorGuard);

  assertContains(files.ports, ports, "export type SystemSettingsReadOptions");
  assertContains(files.ports, ports, "organizationId?: string | null");
  assertContains(files.ports, ports, "options?: SystemSettingsReadOptions");
  assertContains(files.service, service, "options?: SystemSettingsReadOptions");
  assertContains(files.service, service, "return port.getByKey(key, scope, options)");
  assertContains(files.service, service, "return port.getByScope(scope, options)");

  for (const needle of [
    "SELECT DISTINCT ON (scope)",
    "SELECT DISTINCT ON (key)",
    "organization_id = $3::uuid OR organization_id IS NULL",
    "organization_id = $2::uuid OR organization_id IS NULL",
    "ORDER BY scope, organization_id IS NULL ASC",
    "ORDER BY key, organization_id IS NULL ASC",
    "ORDER BY organization_id IS NULL ASC",
  ]) {
    assertContains(files.webappRepo, webappRepo, needle);
  }

  assertContains(files.integratorPublicReader, integratorPublicReader, "export type PublicSystemSettingsReadOptions");
  assertContains(files.integratorPublicReader, integratorPublicReader, "organizationId?: string | null");
  assertContains(files.integratorPublicReader, integratorPublicReader, "organization_id = ${organizationId}::uuid OR organization_id IS NULL");
  assertContains(files.integratorPublicReader, integratorPublicReader, "ORDER BY organization_id IS NULL ASC");

  assertContains(files.mediaPipeline, mediaPipeline, "organization_id IS NULL");
  assertContains(files.mediaWatermark, mediaWatermark, "organization_id IS NULL");
  assertContains(files.accessorGuard, accessorGuard, "apps/media-worker/src/pipelineEnabled.ts");
  assertContains(files.accessorGuard, accessorGuard, "apps/media-worker/src/watermarkEnabled.ts");
}

if (process.argv.includes("--self-test")) {
  const webappRepo = read(files.webappRepo).replace("SELECT DISTINCT ON (key)", "SELECT key");
  try {
    runChecks({ webappRepo });
  } catch {
    console.log("check-p0-11-system-settings-read-path self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect missing getByScope merge query");
}

try {
  runChecks();
  console.log("check-p0-11-system-settings-read-path: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-11-system-settings-read-path: ${message}`);
  process.exit(1);
}
