#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const scanRoots = [
  "apps/webapp/src",
  "apps/integrator/src",
  "apps/media-worker/src",
];

const allowedFiles = new Set([
  "apps/webapp/src/infra/repos/pgSystemSettings.ts",
  "apps/integrator/src/infra/db/publicSystemSettings.ts",
  "apps/media-worker/src/pipelineEnabled.ts",
  "apps/media-worker/src/watermarkEnabled.ts",
]);

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(path));
      continue;
    }
    if (
      name.endsWith(".ts") &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".spec.ts") &&
      !name.endsWith(".d.ts")
    ) {
      out.push(path);
    }
  }
  return out;
}

function hasDirectSystemSettingsRead(src) {
  return (
    /SELECT[\s\S]{0,300}\bFROM\s+(?:public\.)?system_settings\b/i.test(src) ||
    /\.from\(\s*systemSettings\s*\)/.test(src)
  );
}

const offenders = [];

for (const root of scanRoots) {
  for (const abs of listTsFiles(join(repoRoot, root))) {
    const rel = relative(repoRoot, abs).replace(/\\/g, "/");
    if (allowedFiles.has(rel)) continue;
    const src = readFileSync(abs, "utf8");
    if (hasDirectSystemSettingsRead(src)) offenders.push(rel);
  }
}

if (offenders.length > 0) {
  console.error("check-system-settings-accessors: direct system_settings reads outside canonical accessors:");
  for (const rel of offenders) console.error(`  - ${rel}`);
  process.exit(1);
}

console.log("check-system-settings-accessors: OK");
