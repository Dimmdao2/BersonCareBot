import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-account-purge-disabled.mjs");

function writeFixture(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function makePassingFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bcb-pr03a0-"));
  writeFixture(
    root,
    "src/app/api/doctor/clients/[userId]/permanent-delete/route.ts",
    'const error = "account_purge_disabled";\n',
  );
  writeFixture(root, "src/app/app/doctor/clients/DoctorClientLifecycleActions.tsx", "export const archive = true;\n");
  writeFixture(
    root,
    "scripts/user-phone-admin.ts",
    [
      "const ACCOUNT_PURGE_DISABLED = true;",
      'rejectAccountPurge("reset-user");',
      'rejectAccountPurge("purge-by-id");',
      'rejectAccountPurge("integrator-clear-phone");',
      'rejectAccountPurge("integrator-purge-user-id");',
      "",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/infra/strictPlatformUserPurge.ts",
    "export async function runStrictPurgePlatformUser() {}\n",
  );
  writeFixture(
    root,
    "src/app/api/internal/media-pending-delete/purge/route.ts",
    "void purgePendingMediaDeleteBatch;\n",
  );
  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker, "--repo-root", root], { encoding: "utf8" });
}

test("accepts fail-closed account purge while preserving internal and resource-specific cleanup", () => {
  const root = makePassingFixture();
  try {
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PR-03A0 account-purge invariant: PASS/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a synthetic administrative route that calls the strict purge core", () => {
  const root = makePassingFixture();
  try {
    writeFixture(
      root,
      "src/app/api/doctor/clients/[userId]/permanent-delete/route.ts",
      'const error = "account_purge_disabled";\nrunStrictPurgePlatformUser();\n',
    );
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /route:reachable_strict_purge/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects synthetic integrator account deletion in an operational command", () => {
  const root = makePassingFixture();
  try {
    writeFixture(
      root,
      "scripts/user-phone-admin.ts",
      fs.readFileSync(path.join(root, "scripts/user-phone-admin.ts"), "utf8") +
        "await integratorPurgeUserById(arg1);\ndelete from integrator.users where id = $1;\n",
    );
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /operations:reachable_integrator_account_delete/);
    assert.match(result.stderr, /operations:reachable_integrator_purge_user/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
