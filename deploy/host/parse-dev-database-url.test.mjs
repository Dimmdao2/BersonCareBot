import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertExactLocalDevDatabaseUrl,
  assertExactLocalDevNonstaffDatabaseUrl,
  parseDatabaseUrlFromDotenv,
  parseDatabaseUrlKeyFromDotenv,
} from "./parse-dev-database-url.mjs";

const scriptPath = fileURLToPath(new URL("./parse-dev-database-url.mjs", import.meta.url));
const wrapperPath = fileURLToPath(new URL("./refresh-dev-from-test.sh", import.meta.url));
const validUrl = "postgresql://bcb_webapp_dev_user:secret@127.0.0.1:5432/bcb_webapp_dev";
const validNonstaffUrl =
  "postgresql://bcb_dev_runtime_nonstaff_login:runtime-secret@127.0.0.1:5432/bcb_webapp_dev";
const validSigningSecret = "dev-signing-secret-at-least-32-bytes-123456";

test("dotenv parser accepts one exact local DEV URL without evaluating shell", () => {
  assert.equal(
    assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(`A=1\nDATABASE_URL=${validUrl}\n`)),
    validUrl,
  );
});

test("dotenv parser requires a distinct exact local DEV nonstaff runtime URL", () => {
  const text = `DATABASE_URL=${validUrl}\nDATABASE_URL_NONSTAFF=${validNonstaffUrl}\n`;
  assert.equal(
    assertExactLocalDevNonstaffDatabaseUrl(
      parseDatabaseUrlKeyFromDotenv(text, "DATABASE_URL_NONSTAFF"),
    ),
    validNonstaffUrl,
  );
  for (const forbiddenUrl of [
    validUrl,
    "postgresql://app_runtime_nonstaff_login:secret@127.0.0.1:5432/bcb_webapp_dev",
    "postgresql://bcb_test_operational_nonstaff:secret@127.0.0.1:5432/bcb_webapp_dev",
  ]) {
    assert.throws(() =>
      assertExactLocalDevNonstaffDatabaseUrl(
        parseDatabaseUrlKeyFromDotenv(
          `DATABASE_URL_NONSTAFF=${forbiddenUrl}\n`,
          "DATABASE_URL_NONSTAFF",
        ),
      ),
    );
  }
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

test("exact DEV URL rejects every query or fragment connection override", () => {
  const base = "postgresql://bcb_webapp_dev_user:secret@127.0.0.1:5432/bcb_webapp_dev";
  for (const suffix of [
    "?host=/var/run/postgresql",
    "?host=example.test",
    "?port=5433",
    "?user=postgres",
    "?service=foreign",
    "?servicefile=/tmp/foreign.conf",
    "?sslmode=require",
    "?dbname=bcb_webapp_prod",
    "?",
    "#fragment",
    "#",
  ]) {
    assert.throws(
      () => assertExactLocalDevDatabaseUrl(`${base}${suffix}`),
      /database_url_query_or_fragment_forbidden/u,
    );
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
  assert.match(result.stderr, /canonical input is not a regular file/u);
  assert.doesNotMatch(result.stderr, /postgresql:/u);
});

test("snapshot CLI parses one env image and releases the secret only after GO", () => {
  const dir = mkdtempSync(join(tmpdir(), "bcb-dev-env-snapshot-"));
  const envPath = join(dir, "runtime.env");
  writeFileSync(
    envPath,
    [
      `DATABASE_URL=${validUrl}`,
      `DATABASE_URL_NONSTAFF=${validNonstaffUrl}`,
      "DB_PRINCIPAL_CONTEXT_MODE=locked",
      `DB_PRINCIPAL_SIGNING_SECRET=${validSigningSecret}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  const released = spawnSync(process.execPath, [scriptPath, "--snapshot-stream", envPath], {
    encoding: "utf8",
    input: "GO\n",
  });
  assert.equal(released.status, 0, released.stderr);
  assert.deepEqual(released.stdout.trimEnd().split("\n"), [
    validUrl,
    validNonstaffUrl,
    "locked",
    validSigningSecret,
  ]);

  const withheld = spawnSync(process.execPath, [scriptPath, "--snapshot-stream", envPath], {
    encoding: "utf8",
    input: "ABORT\n",
  });
  assert.equal(withheld.status, 0, withheld.stderr);
  assert.doesNotMatch(withheld.stdout, new RegExp(validSigningSecret, "u"));
  assert.doesNotMatch(withheld.stderr, new RegExp(validSigningSecret, "u"));
});

test("snapshot coprocess abort closes without waiting for a duplicated parent descriptor", () => {
  const dir = mkdtempSync(join(tmpdir(), "bcb-dev-env-coproc-abort-"));
  const envPath = join(dir, "runtime.env");
  writeFileSync(
    envPath,
    [
      `DATABASE_URL=${validUrl}`,
      `DATABASE_URL_NONSTAFF=${validNonstaffUrl}`,
      "DB_PRINCIPAL_CONTEXT_MODE=locked",
      `DB_PRINCIPAL_SIGNING_SECRET=${validSigningSecret}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  const harness = `
    set -Eeuo pipefail
    coproc SNAPSHOT { ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} --snapshot-stream ${JSON.stringify(envPath)}; }
    snapshot_pid="$SNAPSHOT_PID"
    coproc_read_fd="\${SNAPSHOT[0]}"
    coproc_write_fd="\${SNAPSHOT[1]}"
    exec {read_fd}<&"$coproc_read_fd"
    exec {write_fd}>&"$coproc_write_fd"
    exec {coproc_read_fd}<&-
    exec {coproc_write_fd}>&-
    IFS= read -r _owner <&"$read_fd"
    IFS= read -r _runtime <&"$read_fd"
    IFS= read -r _mode <&"$read_fd"
    printf 'ABORT\\n' >&"$write_fd"
    exec {write_fd}>&-
    exec {read_fd}<&-
    wait "$snapshot_pid" 2>/dev/null || true
  `;
  const result = spawnSync("bash", ["--noprofile", "--norc", "-c", harness], {
    encoding: "utf8",
    timeout: 2_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(validSigningSecret, "u"));
  assert.doesNotMatch(result.stderr, new RegExp(validSigningSecret, "u"));
});

test("duplicated snapshot descriptor reaches the execute GO pipeline without leaking the secret", () => {
  const dir = mkdtempSync(join(tmpdir(), "bcb-dev-env-coproc-go-"));
  const envPath = join(dir, "runtime.env");
  writeFileSync(
    envPath,
    [
      `DATABASE_URL=${validUrl}`,
      `DATABASE_URL_NONSTAFF=${validNonstaffUrl}`,
      "DB_PRINCIPAL_CONTEXT_MODE=locked",
      `DB_PRINCIPAL_SIGNING_SECRET=${validSigningSecret}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  const harness = `
    set -Eeuo pipefail
    coproc SNAPSHOT { ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} --snapshot-stream ${JSON.stringify(envPath)}; }
    snapshot_pid="$SNAPSHOT_PID"
    coproc_read_fd="\${SNAPSHOT[0]}"
    coproc_write_fd="\${SNAPSHOT[1]}"
    exec {read_fd}<&"$coproc_read_fd"
    exec {write_fd}>&"$coproc_write_fd"
    exec {coproc_read_fd}<&-
    exec {coproc_write_fd}>&-
    IFS= read -r _owner <&"$read_fd"
    IFS= read -r _runtime <&"$read_fd"
    IFS= read -r _mode <&"$read_fd"
    printf 'GO\\n' >&"$write_fd"
    exec {write_fd}>&-
    stream_secret() { cat <&"$read_fd"; }
    stream_secret | { IFS= read -r released; [[ "$released" == ${JSON.stringify(validSigningSecret)} ]]; }
    exec {read_fd}<&-
    wait "$snapshot_pid"
  `;
  const result = spawnSync("bash", ["--noprofile", "--norc", "-c", harness], {
    encoding: "utf8",
    timeout: 2_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(validSigningSecret, "u"));
  assert.doesNotMatch(result.stderr, new RegExp(validSigningSecret, "u"));
});

test("wrapper parses the fixed env as data and completes all guards before DROP", () => {
  const source = readFileSync(wrapperPath, "utf8");
  assert.doesNotMatch(source, /\bsource\s+["']?\$DEV_ENV/u);
  assert.match(source, /-L "\$DEV_ENV"/u);
  assert.match(source, /realpath "\$DEV_ENV"/u);
  assert.match(source, /DEV_DATABASE_URL="\$\(node "\$DEV_ENV_PARSER" "\$DEV_ENV"\)"/u);
  assert.match(source, /DEV_MIGRATE="\$REPO_ROOT\/deploy\/host\/migrate-dev\.sh"/u);
  assert.match(source, /DEV migration wrapper path guard failed/u);
  assert.ok(source.indexOf('bash "$DEV_MIGRATE" --preflight') < source.indexOf("actual_source="));
  assert.ok(source.indexOf("actual_source=") < source.indexOf("DROP DATABASE"));
  assert.ok(source.indexOf("actual_target_before=") < source.indexOf("DROP DATABASE"));
  assert.ok(
    source.indexOf('"${POSTGRES[@]}" pg_restore') <
      source.indexOf('bash "$DEV_MIGRATE" --execute'),
  );
  assert.ok(
    source.indexOf('bash "$DEV_MIGRATE" --execute') <
      source.indexOf('bash "$DEV_POST_REFRESH_UNLOCK" --execute'),
  );
  assert.doesNotMatch(source, /\/opt\/env\/bersoncarebot/u);
  assert.doesNotMatch(source, /DEV_RUNTIME_OVERLAY_REHYDRATE|SAFE_MIGRATION_ENV/u);
  assert.doesNotMatch(source, /pnpm run migrate/u);
  assert.doesNotMatch(source, /\bPGSERVICE(?:FILE)?=/u);
  assert.doesNotMatch(source, /\bPGOPTIONS=/u);
});
