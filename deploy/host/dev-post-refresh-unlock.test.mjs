import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const wrapperPath = fileURLToPath(new URL("./dev-post-refresh-unlock.sh", import.meta.url));
const refreshPath = fileURLToPath(new URL("./refresh-dev-from-test.sh", import.meta.url));
const sqlPath = fileURLToPath(new URL("../postgres/dev-post-refresh-unlock.sql", import.meta.url));

test("DEV unlock SQL guards the exact database before narrowly scoped DDL", () => {
  const source = readFileSync(sqlPath, "utf8");
  const firstDrop = source.indexOf("DROP TRIGGER");

  assert.notEqual(firstDrop, -1);
  assert.ok(source.indexOf("current_database() <> 'bcb_webapp_dev'") < firstDrop);
  assert.deepEqual(
    [...source.matchAll(/^DROP TRIGGER IF EXISTS (.+);$/gmu)].map((match) => match[1]),
    [
      "system_settings_test_lock ON public.system_settings",
      "system_settings_test_lock ON integrator.system_settings",
    ],
  );
  assert.deepEqual(
    [...source.matchAll(/^DROP FUNCTION IF EXISTS (.+);$/gmu)].map((match) => match[1]),
    [
      "public.system_settings_test_lock_guard()",
      "integrator.system_settings_test_lock_guard()",
    ],
  );
  assert.doesNotMatch(source, /\bCASCADE\b|\bDROP\s+(?:TABLE|SCHEMA|DATABASE|ROLE)\b|\b(?:DELETE|UPDATE|INSERT|ALTER)\b/iu);
  assert.doesNotMatch(source, /bcb_webapp_prod|bersoncarebot_test|\/opt\/env/iu);
  assert.match(source, /refused unexpected public lock function/u);
  assert.match(source, /refused unexpected integrator lock function/u);
  assert.match(source, /trigger_row\.tgfoid IS DISTINCT FROM public_guard_oid/u);
  assert.match(source, /trigger_row\.tgfoid IS DISTINCT FROM integrator_guard_oid/u);
  assert.match(source, /DEV post-refresh unlock did not remove the exact TEST-only lock objects/u);
});

test("independent wrapper parses the canonical DEV env as data and sanitizes psql", () => {
  const source = readFileSync(wrapperPath, "utf8");

  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /"\$NODE_BIN" "\$DEV_ENV_PARSER" "\$DEV_ENV"/u);
  assert.doesNotMatch(source, /\bsource\s+["']?\$DEV_ENV/u);
  assert.match(source, /actual_database=.*SELECT current_database/u);
  assert.ok(source.indexOf("exact DEV database guard failed") < source.indexOf("--file=\"$UNLOCK_SQL\""));
  assert.match(source, /env -i/u);
  assert.match(source, /"\$PSQL_BIN" "\$DEV_DATABASE_URL"/u);
  assert.match(source, /PGPASSFILE=\/dev\/null/u);
  assert.match(source, /--single-transaction/u);
  assert.doesNotMatch(source, /sudo|\/opt\/env|bcb_webapp_prod|bersoncarebot_test/u);
  assert.doesNotMatch(source, /DROP\s+(?:DATABASE|TABLE|SCHEMA)|pg_dump|pg_restore/iu);
});

test("TEST to DEV refresh invokes unlock only after current-branch migrations", () => {
  const source = readFileSync(refreshPath, "utf8");
  const migrateIndex = source.indexOf("exec pnpm run migrate");
  const unlockIndex = source.indexOf('bash "$DEV_POST_REFRESH_UNLOCK" --execute');
  const passIndex = source.indexOf("PASS: DEV now mirrors TEST data plus current branch migrations");

  assert.notEqual(migrateIndex, -1);
  assert.ok(unlockIndex > migrateIndex);
  assert.ok(passIndex > unlockIndex);
  assert.match(source, /DEV post-refresh unlock path guard failed/u);
});
