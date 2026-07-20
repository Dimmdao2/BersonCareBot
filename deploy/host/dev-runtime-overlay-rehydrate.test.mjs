import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const wrapperPath = fileURLToPath(new URL("./dev-runtime-overlay-rehydrate.sh", import.meta.url));
const libraryPath = fileURLToPath(new URL("./runtime-overlay-rehydrate-lib.sh", import.meta.url));
const refreshPath = fileURLToPath(new URL("./refresh-dev-from-test.sh", import.meta.url));

const canonicalOrder = [
  "deploy/postgres/organization-member-invites-rls.sql",
  "deploy/postgres/store-p0-entitlements-rls.sql",
  "deploy/postgres/patient-course-assignment-wall.sql",
  "deploy/postgres/specialist-signup-public-bootstrap-rls.sql",
  "deploy/postgres/specialist-owner-provisioning-rls.sql",
  "deploy/postgres/reference-catalog-rls.sql",
  "deploy/postgres/patient-visible-catalog-rls.sql",
  "deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
  "deploy/postgres/public-booking-bootstrap-resolver.sql",
  "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
  "deploy/postgres/e1-webapp-runtime-config.sql",
];

test("shared runtime-overlay library owns one exact protected closure order", () => {
  const source = readFileSync(libraryPath, "utf8");
  let cursor = 0;
  for (const relativePath of canonicalOrder) {
    const index = source.indexOf(relativePath, cursor);
    assert.notEqual(index, -1, `missing ordered overlay ${relativePath}`);
    cursor = index + relativePath.length;
    assert.equal(source.split(relativePath).length - 1, 1, `duplicate overlay ${relativePath}`);
  }
  assert.match(source, /protected_context_installed.*!= "0".*!= "1"/su);
  assert.match(source, /declare -F runtime_overlay_admin_psql/u);
  assert.match(source, /runtime overlay repository root path guard failed/u);
  assert.match(source, /runtime_overlay_parse_database_identity/u);
});

test("shared closure executes the canonical list and forwards the E1 runtime role", () => {
  const fakeRepo = mkdtempSync(join(tmpdir(), "bcb-overlay-lib-"));
  const calls = join(fakeRepo, "calls.txt");
  for (const relativePath of canonicalOrder) {
    const absolutePath = join(fakeRepo, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, "-- fixture\n");
  }

  const command = `
    set -Eeuo pipefail
    source ${JSON.stringify(libraryPath)}
    runtime_overlay_admin_psql() { printf '%s\\n' "$*" >> ${JSON.stringify(calls)}; }
    runtime_overlay_apply_post_migration_chain ${JSON.stringify(fakeRepo)} bcb_webapp_dev bcb_webapp_dev_user 1
  `;
  const result = spawnSync("bash", ["--noprofile", "--norc", "-c", command], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const applied = readFileSync(calls, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.match(/-f (\S+)$/u)?.[1]?.slice(fakeRepo.length + 1));
  assert.deepEqual(applied, canonicalOrder);
  assert.match(readFileSync(calls, "utf8"), /-v e1_webapp_runtime_role=bcb_webapp_dev_user/u);
});

test("DEV wrapper is exact-local, non-destructive and proves owner, ACL and live capabilities", () => {
  const source = readFileSync(wrapperPath, "utf8");
  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /TARGET_ROLE="bcb_webapp_dev_user"/u);
  assert.match(source, /"\$NODE_BIN" "\$DEV_ENV_PARSER" "\$DEV_ENV"/u);
  assert.doesNotMatch(source, /\bsource\s+["']?\$DEV_ENV/u);
  assert.match(source, /env -i/u);
  assert.match(source, /PGPASSFILE=\/dev\/null/u);
  assert.match(source, /runtime_overlay_parse_database_identity/u);
  assert.ok(
    source.indexOf("runtime_identity=") <
      source.indexOf('run_dev_admin_psql -d "$TARGET_DB" -f "$P0_5B_GRANTS"'),
  );
  assert.match(source, /dev_database_owner_exact/u);
  assert.match(source, /dev_runtime_roles_safe/u);
  assert.match(source, /dev_protected_context_bundle_complete/u);
  assert.match(source, /dev_runtime_can_set_classified_roles/u);
  assert.match(source, /runtime_overlay_apply_post_migration_chain "\$REPO_ROOT" "\$TARGET_DB" "\$TARGET_ROLE" 1/u);
  assert.match(source, /dev_runtime_overlay_exact_owner_acl/u);
  assert.match(source, /app\.read_public_runtime_setting\('oauth_google_enabled','admin'\)/u);
  assert.match(source, /SET LOCAL ROLE app_patient/u);
  assert.match(source, /app\.read_current_patient_booking_rows\('upcoming', now\(\)\)/u);
  assert.doesNotMatch(source, /pg_dump|pg_restore|DROP\s+(?:DATABASE|SCHEMA|TABLE)|CREATE\s+DATABASE/iu);
  assert.doesNotMatch(
    source,
    /\/opt\/env\/bersoncarebot|bersoncarebot_test|bcb_webapp_prod|bersoncarebot_prod/iu,
  );
});

test("TEST to DEV refresh runs rehydrate after migrations and before DEV unlock", () => {
  const source = readFileSync(refreshPath, "utf8");
  const migrateIndex = source.indexOf("exec pnpm run migrate");
  const rehydrateIndex = source.indexOf('bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --execute');
  const unlockIndex = source.indexOf('bash "$DEV_POST_REFRESH_UNLOCK" --execute');
  const passIndex = source.indexOf("PASS: DEV now mirrors TEST data plus current branch migrations");

  assert.ok(migrateIndex >= 0);
  assert.ok(rehydrateIndex > migrateIndex);
  assert.ok(unlockIndex > rehydrateIndex);
  assert.ok(passIndex > unlockIndex);
  assert.match(source, /DEV runtime overlay rehydrate path guard failed/u);
});

test("wrapper defaults to usage and performs no operation without the exact execute flag", () => {
  const result = spawnSync("bash", [wrapperPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--execute/u);
  assert.equal(result.stderr, "");
});
