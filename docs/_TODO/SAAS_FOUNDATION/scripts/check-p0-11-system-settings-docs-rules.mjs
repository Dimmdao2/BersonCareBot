#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  criticalRule: ".cursor/rules/000-critical-integration-config-in-db.mdc",
  runtimeRule: ".cursor/rules/runtime-config-env-vs-db.mdc",
  mirrorRule: ".cursor/rules/system-settings-integrator-mirror.mdc",
  agents: "AGENTS.md",
  configDoc: "docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md",
  unifiedDbDoc: "docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md",
  saasRuleDoc: "docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md",
  checklist: "docs/_TODO/SAAS_FOUNDATION/P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md",
  readme: "docs/_TODO/SAAS_FOUNDATION/README.md",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertContains(path, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${path} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const criticalRule = overrides.criticalRule ?? read(files.criticalRule);
  const runtimeRule = overrides.runtimeRule ?? read(files.runtimeRule);
  const mirrorRule = overrides.mirrorRule ?? read(files.mirrorRule);
  const agents = overrides.agents ?? read(files.agents);
  const configDoc = overrides.configDoc ?? read(files.configDoc);
  const unifiedDbDoc = overrides.unifiedDbDoc ?? read(files.unifiedDbDoc);
  const saasRuleDoc = overrides.saasRuleDoc ?? read(files.saasRuleDoc);
  const checklist = overrides.checklist ?? read(files.checklist);
  const readme = overrides.readme ?? read(files.readme);

  for (const [path, text] of [
    [files.criticalRule, criticalRule],
    [files.runtimeRule, runtimeRule],
    [files.mirrorRule, mirrorRule],
    [files.agents, agents],
    [files.configDoc, configDoc],
    [files.unifiedDbDoc, unifiedDbDoc],
    [files.saasRuleDoc, saasRuleDoc],
  ]) {
    assertContains(path, text, "organization_id IS NULL");
    assertContains(path, text, "org");
  }

  for (const [path, text] of [
    [files.criticalRule, criticalRule],
    [files.mirrorRule, mirrorRule],
    [files.agents, agents],
    [files.configDoc, configDoc],
    [files.unifiedDbDoc, unifiedDbDoc],
  ]) {
    assertContains(path, text, "(key, scope, organization_id)");
  }

  assertContains(files.criticalRule, criticalRule, "The current admin");
  assertContains(files.runtimeRule, runtimeRule, "Current Settings UI writes global defaults");
  assertContains(files.mirrorRule, mirrorRule, "Pass `organizationId` only when the write is intentionally org-scoped");
  assertContains(files.configDoc, configDoc, "текущие admin Settings формы пишут глобальные строки");
  assertContains(files.configDoc, configDoc, "Чтения с org context должны сначала искать org row и затем fallback на global NULL row");
  assertContains(files.checklist, checklist, "- [x] Admin UI remains global unless a setting is explicitly org-scoped.");
  assertContains(files.checklist, checklist, "- [x] `ALLOWED_KEYS` unchanged unless a real setting key is added.");
  assertContains(files.checklist, checklist, "- [x] Rules mention public/integrator mirror lockstep with org dimension.");
  assertContains(files.checklist, checklist, "- [x] Docs explain NULL global fallback and org-specific override.");
  assertContains(files.readme, readme, "P0.11.1-P0.11.4 system_settings storage/read/write/rules-docs are implemented");
}

if (process.argv.includes("--self-test")) {
  const mirrorRule = read(files.mirrorRule).replaceAll("(key, scope, organization_id)", "(key, scope)");
  try {
    runChecks({ mirrorRule });
  } catch {
    console.log("check-p0-11-system-settings-docs-rules self-test: OK");
    process.exit(0);
  }
  throw new Error("self-test did not detect stale mirror identity text");
}

try {
  runChecks();
  console.log("check-p0-11-system-settings-docs-rules: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-11-system-settings-docs-rules: ${message}`);
  process.exit(1);
}
