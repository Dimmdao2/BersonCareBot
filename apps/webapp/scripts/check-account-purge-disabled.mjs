#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootFlagIndex = process.argv.indexOf("--repo-root");
const webappRoot =
  repoRootFlagIndex >= 0 && process.argv[repoRootFlagIndex + 1]
    ? path.resolve(process.argv[repoRootFlagIndex + 1])
    : path.resolve(scriptDir, "..");

const files = {
  route: "src/app/api/doctor/clients/[userId]/permanent-delete/route.ts",
  ui: "src/app/app/doctor/clients/DoctorClientLifecycleActions.tsx",
  operations: "scripts/user-phone-admin.ts",
  strictCore: "src/infra/strictPlatformUserPurge.ts",
  mediaCleanup: "src/app/api/internal/media-pending-delete/purge/route.ts",
};

const failures = [];

function readRequired(key) {
  const relativePath = files[key];
  const absolutePath = path.join(webappRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${key}:missing_file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(key, source, needle, rule) {
  if (!source.includes(needle)) failures.push(`${key}:${rule}`);
}

function forbidText(key, source, needle, rule) {
  if (source.includes(needle)) failures.push(`${key}:${rule}`);
}

function forbidPattern(key, source, pattern, rule) {
  if (pattern.test(source)) failures.push(`${key}:${rule}`);
}

function runtimeSources(relativeRoot) {
  const absoluteRoot = path.join(webappRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const found = [];
  const visit = (absolutePath) => {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolutePath)) visit(path.join(absolutePath, entry));
      return;
    }
    if (!/\.(?:[cm]?js|tsx?)$/.test(absolutePath) || /\.(?:test|spec)\.[^.]+$/.test(absolutePath)) return;
    found.push({
      relativePath: path.relative(webappRoot, absolutePath),
      source: fs.readFileSync(absolutePath, "utf8"),
    });
  };
  visit(absoluteRoot);
  return found;
}

const route = readRequired("route");
const ui = readRequired("ui");
const operations = readRequired("operations");
const strictCore = readRequired("strictCore");
const mediaCleanup = readRequired("mediaCleanup");

requireText("route", route, "account_purge_disabled", "missing_fail_closed_response");
forbidText("route", route, "runStrictPurgePlatformUser", "reachable_strict_purge");

forbidText("ui", ui, "/permanent-delete", "reachable_permanent_delete_request");
forbidText("ui", ui, "doctor-client-permanent-delete-btn", "destructive_action_visible");

requireText("operations", operations, "ACCOUNT_PURGE_DISABLED", "missing_fail_closed_marker");
for (const command of [
  "reset-user",
  "purge-by-id",
  "integrator-clear-phone",
  "integrator-purge-user-id",
]) {
  requireText(
    "operations",
    operations,
    `rejectAccountPurge("${command}")`,
    `missing_fail_closed_command:${command}`,
  );
}
forbidText("operations", operations, "runStrictPurgePlatformUser", "reachable_strict_purge");
forbidPattern(
  "operations",
  operations,
  /\bDELETE\s+FROM\s+(?:public\.)?platform_users\b/i,
  "reachable_direct_account_delete",
);
forbidPattern(
  "operations",
  operations,
  /\bDELETE\s+FROM\s+(?:integrator\.)?users\b/i,
  "reachable_integrator_account_delete",
);
forbidPattern(
  "operations",
  operations,
  /\bDELETE\s+FROM\s+(?:integrator\.)?rubitime_(?:records|events)\b/i,
  "reachable_integrator_history_delete",
);
forbidText("operations", operations, "await resetUser(arg1)", "reachable_reset_user_delete");
forbidText("operations", operations, "await purgeUserByPlatformId(arg1)", "reachable_purge_by_id");
forbidText("operations", operations, "await integratorClearPhone(arg1)", "reachable_integrator_clear_phone");
forbidText("operations", operations, "await integratorPurgeUserById(arg1)", "reachable_integrator_purge_user");

for (const item of runtimeSources("src/app")) {
  forbidText(item.relativePath, item.source, "runStrictPurgePlatformUser", "runtime_strict_purge_entrypoint");
  forbidText(item.relativePath, item.source, "purgePlatformUserByPlatformId", "runtime_full_purge_entrypoint");
}
for (const item of runtimeSources("src/app/app/doctor")) {
  forbidText(item.relativePath, item.source, "/permanent-delete", "destructive_account_purge_ui");
  forbidText(item.relativePath, item.source, "doctor-client-permanent-delete-btn", "destructive_account_purge_ui");
}
for (const item of runtimeSources("scripts")) {
  if (item.relativePath.endsWith("check-account-purge-disabled.mjs")) continue;
  forbidText(item.relativePath, item.source, "runStrictPurgePlatformUser", "operational_strict_purge_entrypoint");
  forbidText(item.relativePath, item.source, "purgePlatformUserByPlatformId", "operational_full_purge_entrypoint");
  forbidPattern(
    item.relativePath,
    item.source,
    /\bDELETE\s+FROM\s+(?:public\.)?platform_users\b/i,
    "operational_direct_account_delete",
  );
  forbidPattern(
    item.relativePath,
    item.source,
    /\bDELETE\s+FROM\s+(?:integrator\.)?users\b/i,
    "operational_integrator_account_delete",
  );
}

requireText(
  "strictCore",
  strictCore,
  "export async function runStrictPurgePlatformUser",
  "strict_purge_core_removed",
);
requireText(
  "mediaCleanup",
  mediaCleanup,
  "purgePendingMediaDeleteBatch",
  "resource_cleanup_removed",
);

if (failures.length > 0) {
  console.error("PR-03A0 account-purge invariant: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PR-03A0 account-purge invariant: PASS");
console.log("Administrative account purge is fail-closed; strict core and media cleanup remain present.");
