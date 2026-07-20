import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const wrapperPath = fileURLToPath(new URL("./migrate-dev.sh", import.meta.url));
const source = readFileSync(wrapperPath, "utf8");

test("DEV migration wrapper is explicit and rejects destructive database flows", () => {
  assert.match(source, /--preflight\|--execute/u);
  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /TARGET_ROLE="bcb_webapp_dev_user"/u);
  for (const forbidden of [
    "DROP DATABASE",
    "CREATE DATABASE",
    "pg_dump",
    "pg_restore",
    "refresh-dev-from-test.sh",
    "/opt/env/",
    "bersoncarebot_test",
    "bcb_webapp_prod",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "u"));
  }
});

test("preflight reuses the exact DEV parser and runtime topology guard before writes", () => {
  const parserAt = source.indexOf('node "$DEV_ENV_PARSER" "$DEV_ENV"');
  const overlayPreflightAt = source.indexOf('bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --preflight');
  const trapAt = source.indexOf("trap cleanup_exit EXIT");
  const grantAt = source.indexOf('-c "GRANT \\"$APP_OWNER_ROLE\\" TO \\"$TARGET_ROLE\\";"');
  assert.ok(parserAt >= 0);
  assert.ok(overlayPreflightAt > parserAt);
  assert.ok(trapAt > overlayPreflightAt);
  assert.ok(grantAt > trapAt);
});

test("migration privilege window has mandatory cleanup on success and failure", () => {
  assert.match(source, /flock -n 9/u);
  assert.match(source, /cleanup_exit\(\)/u);
  assert.match(source, /REVOKE \\"\$APP_OWNER_ROLE\\" FROM \\"\$TARGET_ROLE\\"/u);
  assert.match(source, /ALTER ROLE \\"\$TARGET_ROLE\\" NOBYPASSRLS/u);
  assert.match(source, /pg_has_role\('\$TARGET_ROLE', '\$APP_OWNER_ROLE', 'member'\)/u);
  assert.match(source, /rolbypassrls::text/u);
  assert.match(source, /trap cleanup_exit EXIT/u);
});

test("migration child is sanitized and runs the existing ordered migration chain", () => {
  assert.match(source, /env -i/u);
  assert.match(source, /API_ENV_FILE="\$SAFE_MIGRATION_ENV"/u);
  assert.match(source, /WEBAPP_ENV_FILE="\$SAFE_MIGRATION_ENV"/u);
  assert.match(source, /PGOPTIONS="-c role=\$TARGET_ROLE"/u);
  assert.match(source, /pnpm run migrate/u);
});

test("post-migrate steps reuse the canonical online index and runtime closure", () => {
  const migrateAt = source.indexOf("pnpm run migrate");
  const indexAt = source.indexOf("c4d-platform-lfk-media-owner-online-index.sql", migrateAt);
  const cleanupAt = source.indexOf("cleanup_elevation", indexAt);
  const overlayAt = source.indexOf('bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --execute', cleanupAt);
  const ledgerAt = source.indexOf("drizzle.__drizzle_migrations", overlayAt);
  assert.ok(migrateAt >= 0);
  assert.ok(indexAt > migrateAt);
  assert.ok(cleanupAt > indexAt);
  assert.ok(overlayAt > cleanupAt);
  assert.ok(ledgerAt > overlayAt);
  assert.match(source, /integrator\.schema_migrations/u);
  assert.match(source, /idx_media_files_owner/u);
});
