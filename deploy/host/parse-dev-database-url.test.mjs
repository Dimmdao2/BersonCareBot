import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertExactLocalDevDatabaseUrl,
  parseDatabaseUrlFromDotenv,
} from "./parse-dev-database-url.mjs";

const scriptPath = fileURLToPath(new URL("./parse-dev-database-url.mjs", import.meta.url));
const wrapperPath = fileURLToPath(new URL("./refresh-dev-from-test.sh", import.meta.url));
const validUrl = "postgresql://bcb_webapp_dev_user:secret@127.0.0.1:5432/bcb_webapp_dev";

test("dotenv parser accepts one exact local DEV URL without evaluating shell", () => {
  assert.equal(
    assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(`A=1\nDATABASE_URL=${validUrl}\n`)),
    validUrl,
  );
});

test("dotenv parser rejects duplicate, shell-like, foreign and PROD URLs", () => {
  for (const value of [
    `DATABASE_URL=${validUrl}\nDATABASE_URL=${validUrl}\n`,
    "DATABASE_URL=$(cat /opt/env/bersoncarebot/webapp.prod)\n",
    "DATABASE_URL=postgresql://dev:secret@example.test:5432/bcb_webapp_dev\n",
    "DATABASE_URL=postgresql://dev:secret@127.0.0.1:5432/bcb_webapp_prod\n",
    "DATABASE_URL=postgresql://wrong_user:secret@127.0.0.1:5432/bcb_webapp_dev\n",
  ]) {
    assert.throws(() => assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(value)));
  }
});

test("CLI refuses a symlink even when its target contains a valid URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "bcb-dev-env-parser-"));
  const real = join(dir, "real.env");
  const link = join(dir, "linked.env");
  writeFileSync(real, `DATABASE_URL=${validUrl}\n`, { mode: 0o600 });
  symlinkSync(real, link);

  const result = spawnSync(process.execPath, [scriptPath, link], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsafe_env_file/u);
  assert.doesNotMatch(result.stderr, /secret/u);
});

test("wrapper parses the fixed env as data and completes all guards before DROP", () => {
  const source = readFileSync(wrapperPath, "utf8");
  assert.doesNotMatch(source, /\bsource\s+["']?\$DEV_ENV/u);
  assert.match(source, /-L "\$DEV_ENV"/u);
  assert.match(source, /realpath "\$DEV_ENV"/u);
  assert.match(source, /DEV_DATABASE_URL="\$\(node "\$DEV_ENV_PARSER" "\$DEV_ENV"\)"/u);
  assert.ok(source.indexOf("actual_source=") < source.indexOf("DROP DATABASE"));
  assert.ok(source.indexOf("actual_target_before=") < source.indexOf("DROP DATABASE"));
  assert.doesNotMatch(source, /\/opt\/env\/bersoncarebot/u);
  assert.match(source, /env -i/u);
  assert.match(source, /PNPM_LAUNCHER="\$\(type -P pnpm\)"/u);
  assert.match(source, /realpath "\$\(dirname "\$PNPM_LAUNCHER"\)"/u);
  assert.match(source, /lib\/node_modules\/corepack\/dist\/pnpm\.js/u);
  assert.match(source, /API_ENV_FILE="\$SAFE_MIGRATION_ENV"/u);
  assert.match(source, /WEBAPP_ENV_FILE="\$SAFE_MIGRATION_ENV"/u);
  assert.match(source, /safe migration env must contain comments\/blank lines only/u);
  assert.match(source, /PGDATABASE="\$TARGET_DB"/u);
  assert.match(source, /sanitized migration child target guard failed/u);
  assert.ok(source.indexOf("sanitized migration child target guard failed") < source.indexOf("exec pnpm run migrate"));
});

test("actual host pnpm launcher is in the Node bin and resolves to that Corepack installation", () => {
  const lookup = spawnSync("bash", ["--noprofile", "--norc", "-c", "type -P pnpm"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  assert.equal(lookup.status, 0);
  const pnpmLauncher = lookup.stdout.trim();
  const nodeBin = realpathSync(process.execPath);
  const toolchainBin = dirname(nodeBin);
  assert.equal(realpathSync(dirname(pnpmLauncher)), toolchainBin);
  assert.equal(
    realpathSync(pnpmLauncher),
    join(dirname(toolchainBin), "lib/node_modules/corepack/dist/pnpm.js"),
  );
});
