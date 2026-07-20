import assert from "node:assert/strict";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openCanonicalSqlFile } from "./stream-canonical-sql.mjs";

const wrapperPath = fileURLToPath(new URL("./dev-runtime-overlay-rehydrate.sh", import.meta.url));
const libraryPath = fileURLToPath(new URL("./runtime-overlay-rehydrate-lib.sh", import.meta.url));
const refreshPath = fileURLToPath(new URL("./refresh-dev-from-test.sh", import.meta.url));
const sqlStreamerPath = fileURLToPath(new URL("./stream-canonical-sql.mjs", import.meta.url));
const envParserPath = fileURLToPath(new URL("./parse-dev-database-url.mjs", import.meta.url));

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
    runtime_overlay_apply_post_migration_chain ${JSON.stringify(fakeRepo)} bcb_webapp_dev bcb_dev_runtime_nonstaff_login 1
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
  assert.match(readFileSync(calls, "utf8"), /-v e1_webapp_runtime_role=bcb_dev_runtime_nonstaff_login/u);
});

test("shared topology guard rejects owner equals runtime and accepts separate C0 runtime", () => {
  const rejected = spawnSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      `source ${JSON.stringify(libraryPath)}; runtime_overlay_assert_separate_roles DEV bcb_webapp_dev_user bcb_webapp_dev_user`,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /runtime role must be distinct from the owner\/migrator role/u);

  const accepted = spawnSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      `source ${JSON.stringify(libraryPath)}; runtime_overlay_assert_separate_roles DEV bcb_webapp_dev_user bcb_dev_runtime_nonstaff_login`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(accepted.status, 0, accepted.stderr);
});

test("DEV wrapper separates owner and runtime before any overlay and proves live capabilities", () => {
  const source = readFileSync(wrapperPath, "utf8");
  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /TARGET_OWNER_ROLE="bcb_webapp_dev_user"/u);
  assert.match(source, /TARGET_RUNTIME_ROLE="bcb_dev_runtime_nonstaff_login"/u);
  assert.match(source, /P2_B_OWNER_ROLE="app_owner"/u);
  assert.match(source, /P2_B_STAFF_ROLE="app_staff"/u);
  assert.match(source, /P2_B_PATIENT_ROLE="app_patient"/u);
  assert.equal(source.split('--snapshot-stream "$DEV_ENV"').length - 1, 1);
  assert.doesNotMatch(source, /DEV_ENV_PARSER" --(?:nonstaff|context-mode|signing-secret)/u);
  assert.match(source, /descriptor-pinned env snapshot/u);
  assert.doesNotMatch(source, /\bsource\s+["']?\$DEV_ENV/u);
  assert.match(source, /env -i/u);
  assert.match(source, /PGPASSFILE=\/dev\/null/u);
  assert.match(source, /runtime_overlay_parse_database_identity/u);
  assert.ok(
    source.indexOf("dev_base_runtime_role_safe_before_overlay") <
      source.indexOf(
        'runtime_overlay_admin_psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 -f "$P0_5B_GRANTS"',
      ),
  );
  assert.match(source, /dev_database_owner_exact/u);
  assert.match(source, /dev_runtime_roles_safe/u);
  assert.match(source, /rolconnlimit = -1/u);
  assert.match(source, /member_role\.rolname IN \('app_owner', 'app_staff', 'app_patient'\)/u);
  assert.match(source, /dev_base_runtime_role_safe_before_overlay/u);
  assert.match(source, /dev_p2_b_exact_owner_handoff_preconditions/u);
  assert.match(source, /dev_p2_b_pgcrypto_move_precondition/u);
  assert.match(source, /ALTER TABLE %s OWNER TO %I/u);
  assert.match(source, /ALTER FUNCTION %s OWNER TO %I/u);
  assert.match(source, /app\.context_signing_secrets/u);
  assert.match(source, /app\.install_signed_context\(text,integer,bigint,uuid,uuid,bigint,text\)/u);
  assert.match(source, /"\$NODE_BIN" "\$SQL_STREAMER" "\$P2_B_CONTEXT"/u);
  assert.match(source, /dev_p2_b_owner_context_postcheck/u);
  assert.match(source, /aclexplode\(COALESCE\(relation\.relacl/u);
  assert.match(source, /aclexplode\(COALESCE\(procedure\.proacl/u);
  assert.match(source, /privilege\.grantee = 0/u);
  assert.ok(
    source.indexOf("dev_p2_b_owner_context_postcheck") <
      source.indexOf(
        'runtime_overlay_admin_psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 -f "$P0_5B_GRANTS"',
      ),
  );
  assert.doesNotMatch(source, /-v\s+p2_b_signing_secret=/u);
  assert.doesNotMatch(source, /P2_B_SIGNING_SECRET_VALUE/u);
  assert.match(source, /\\copy pg_temp\.dev_p2_b_secret_input\(secret\) FROM STDIN/u);
  assert.match(source, /cat <&"\$DEV_SNAPSHOT_READ_FD"/u);
  assert.match(source, /SET LOCAL log_statement = 'none'/u);
  assert.match(source, /SET LOCAL log_min_error_statement = 'panic'/u);
  assert.match(source, /SET LOCAL log_parameter_max_length_on_error = 0/u);
  assert.doesNotMatch(source, /REASSIGN\s+OWNED|DROP\s+OWNED|p2_b_down/iu);
  assert.match(source, /NOT rolcreatedb/u);
  assert.match(source, /NOT rolcreaterole/u);
  assert.match(source, /NOT rolreplication/u);
  assert.match(source, /NOT pg_has_role\(:'expected_runtime_role', 'app_owner', 'MEMBER'\)/u);
  assert.match(source, /pg_has_role\(:'expected_runtime_role', relation\.relowner, 'MEMBER'\)/u);
  assert.match(source, /namespace\.nspname IN \('public', 'integrator', 'app'\)/u);
  assert.match(source, /dev_protected_context_bundle_complete/u);
  assert.match(source, /dev_runtime_patient_role_boundary/u);
  assert.match(source, /runtime_overlay_apply_post_migration_chain "\$REPO_ROOT" "\$TARGET_DB" "\$TARGET_RUNTIME_ROLE" 1/u);
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

test("P2-B transport suppresses inherited xtrace and keeps the actual secret out of SQL literals", () => {
  const source = readFileSync(wrapperPath, "utf8");
  const functionStart = source.indexOf("stream_dev_p2_b_input() {");
  const functionEnd = source.indexOf(
    '\n}\n\necho "[dev-runtime-overlay] atomically reinstalling',
    functionStart,
  );
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = `${source.slice(functionStart, functionEnd)}\n}`;

  const fakeRepo = mkdtempSync(join(tmpdir(), "bcb-dev-p2b-secret-"));
  const canonicalDir = join(fakeRepo, "deploy/postgres");
  const canonicalSql = join(canonicalDir, "p2-b-protected-principal-context.sql");
  const secretFile = join(fakeRepo, "private-secret.txt");
  const fixtureSecret = "fixture-secret-never-in-xtrace-or-sql-123456789";
  mkdirSync(canonicalDir, { recursive: true });
  writeFileSync(canonicalSql, "-- canonical fixture\n");
  writeFileSync(secretFile, `${fixtureSecret}\n`, { mode: 0o600 });

  const harness = `
    set -Eeuo pipefail
    P2_B_OWNER_ROLE=app_owner
    P2_B_STAFF_ROLE=app_staff
    P2_B_PATIENT_ROLE=app_patient
    NODE_BIN=${JSON.stringify(process.execPath)}
    SQL_STREAMER=${JSON.stringify(sqlStreamerPath)}
    P2_B_CONTEXT=${JSON.stringify(canonicalSql)}
    REPO_ROOT=${JSON.stringify(fakeRepo)}
    DEV_SNAPSHOT_READ_FD=3
    ${functionSource}
    exec 3<${JSON.stringify(secretFile)}
    stream_dev_p2_b_input
  `;
  const result = spawnSync("bash", ["--noprofile", "--norc", "-x", "-c", harness], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, new RegExp(fixtureSecret, "u"));
  assert.equal(result.stdout.split(fixtureSecret).length - 1, 1);
  assert.doesNotMatch(source, new RegExp(fixtureSecret, "u"));
  const secretLine = result.stdout.split("\n").findIndex((line) => line === fixtureSecret);
  const copyLine = result.stdout
    .split("\n")
    .findIndex((line) => line.startsWith("\\copy pg_temp.dev_p2_b_secret_input"));
  assert.ok(copyLine >= 0 && secretLine === copyLine + 1);
});

test("DEV env parser validates protected-context mode and keeps signing values argv-free", () => {
  const selfTest = spawnSync(process.execPath, [envParserPath, "--self-test"], { encoding: "utf8" });
  assert.equal(selfTest.status, 0, selfTest.stderr);
  assert.match(selfTest.stdout, /self-test: OK/u);

  const source = readFileSync(envParserPath, "utf8");
  assert.match(source, /value !== "shadow" && value !== "locked"/u);
  assert.match(source, /Buffer\.byteLength\(value, "utf8"\) < 32/u);
  assert.match(source, /\^\[A-Za-z0-9\._~\+\/=-\]\+\$/u);
});

test("DEV admin callback streams one canonical SQL file and rejects unsafe file arguments", () => {
  const source = readFileSync(wrapperPath, "utf8");
  const callbackStart = source.indexOf("runtime_overlay_admin_psql() {");
  const callbackEnd = source.indexOf("\n}\n\nowner_identity", callbackStart);
  assert.ok(callbackStart >= 0 && callbackEnd > callbackStart);
  const callbackSource = `${source.slice(callbackStart, callbackEnd)}\n}`;

  const fakeRepo = mkdtempSync(join(tmpdir(), "bcb-dev-overlay-stdin-"));
  const canonicalDir = join(fakeRepo, "deploy/postgres");
  const canonicalFile = join(canonicalDir, "fixture.sql");
  const secondFile = join(canonicalDir, "second.sql");
  const outsideFile = join(fakeRepo, "outside.sql");
  const symlinkFile = join(canonicalDir, "link.sql");
  const fifoFile = join(canonicalDir, "fifo.sql");
  const calls = join(fakeRepo, "calls.txt");
  const stdinCapture = join(fakeRepo, "stdin.sql");
  mkdirSync(canonicalDir, { recursive: true });
  writeFileSync(canonicalFile, "SELECT 'canonical';\n");
  writeFileSync(secondFile, "SELECT 'second';\n");
  writeFileSync(outsideFile, "SELECT 'outside';\n");
  symlinkSync(canonicalFile, symlinkFile);
  const fifoResult = spawnSync("mkfifo", [fifoFile], { encoding: "utf8" });
  assert.equal(fifoResult.status, 0, fifoResult.stderr);

  const harness = `
    set -Eeuo pipefail
    REPO_ROOT=${JSON.stringify(fakeRepo)}
    TARGET_DB=bcb_webapp_dev
    TARGET_RUNTIME_ROLE=bcb_dev_runtime_nonstaff_login
    NODE_BIN=${JSON.stringify(process.execPath)}
    SQL_STREAMER=${JSON.stringify(sqlStreamerPath)}
    run_dev_admin_psql() {
      printf '%s\\n' "$*" > ${JSON.stringify(calls)}
      cat > ${JSON.stringify(stdinCapture)}
    }
    ${callbackSource}
  `;
  const runCallback = (args) =>
    spawnSync(
      "bash",
      ["--noprofile", "--norc", "-c", `${harness}\nruntime_overlay_admin_psql "$@"`, "callback", ...args],
      { encoding: "utf8", timeout: 2000 },
    );

  const accepted = runCallback(["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(readFileSync(calls, "utf8"), "-d bcb_webapp_dev -X -v ON_ERROR_STOP=1\n");
  assert.equal(readFileSync(stdinCapture, "utf8"), "SELECT 'canonical';\n");

  const acceptedE1 = runCallback([
    "-d",
    "bcb_webapp_dev",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "e1_webapp_runtime_role=bcb_dev_runtime_nonstaff_login",
    "-f",
    secondFile,
  ]);
  assert.equal(acceptedE1.status, 0, acceptedE1.stderr);
  assert.equal(
    readFileSync(calls, "utf8"),
    "-d bcb_webapp_dev -X -v ON_ERROR_STOP=1 -v e1_webapp_runtime_role=bcb_dev_runtime_nonstaff_login\n",
  );
  assert.equal(readFileSync(stdinCapture, "utf8"), "SELECT 'second';\n");

  const rejectedCases = [
    ["-d", "bcb_webapp_dev"],
    ["-d", "bcb_webapp_dev", "-f"],
    ["-d", "bcb_webapp_dev", `-f${canonicalFile}`],
    ["-d", "bcb_webapp_dev", "--file", canonicalFile],
    ["--dbname=bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    ["-dbcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1", "-f", canonicalFile],
    ["-d", "other_db", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    ["-X", "-d", "bcb_webapp_dev", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile, "extra"],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile, "-f", secondFile],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", outsideFile],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", symlinkFile],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", fifoFile],
  ];
  for (const args of rejectedCases) {
    const rejected = runCallback(args);
    assert.notEqual(rejected.status, 0, `unexpectedly accepted ${args.join(" ")}`);
    assert.match(rejected.stderr, /FATAL: (?:DEV runtime overlay|canonical SQL reader)/u);
  }
});

test("canonical SQL reader anchors the opened descriptor and rejects symlinks and FIFOs", () => {
  const fakeRepo = mkdtempSync(join(tmpdir(), "bcb-sql-reader-"));
  const canonicalDir = join(fakeRepo, "deploy/postgres");
  const canonicalFile = join(canonicalDir, "fixture.sql");
  const movedFile = join(canonicalDir, "opened.sql");
  const symlinkFile = join(canonicalDir, "link.sql");
  const fifoFile = join(canonicalDir, "fifo.sql");
  mkdirSync(canonicalDir, { recursive: true });
  writeFileSync(canonicalFile, "SELECT 'opened';\n");
  symlinkSync(canonicalFile, symlinkFile);
  const fifoResult = spawnSync("mkfifo", [fifoFile], { encoding: "utf8" });
  assert.equal(fifoResult.status, 0, fifoResult.stderr);

  assert.throws(() => openCanonicalSqlFile(symlinkFile, canonicalDir));
  assert.throws(() => openCanonicalSqlFile(fifoFile, canonicalDir));

  const descriptor = openCanonicalSqlFile(canonicalFile, canonicalDir);
  try {
    renameSync(canonicalFile, movedFile);
    writeFileSync(canonicalFile, "SELECT 'replacement';\n");
    assert.equal(readFileSync(descriptor, "utf8"), "SELECT 'opened';\n");
  } finally {
    closeSync(descriptor);
  }
});

test("TEST to DEV refresh runs rehydrate after migrations and before DEV unlock", () => {
  const source = readFileSync(refreshPath, "utf8");
  const preflightIndex = source.indexOf('bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --preflight');
  const dumpIndex = source.indexOf("pg_dump -Fc");
  const migrateIndex = source.indexOf("exec pnpm run migrate");
  const rehydrateIndex = source.indexOf('bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --execute');
  const unlockIndex = source.indexOf('bash "$DEV_POST_REFRESH_UNLOCK" --execute');
  const passIndex = source.indexOf("PASS: DEV now mirrors TEST data plus current branch migrations");

  assert.ok(preflightIndex >= 0);
  assert.ok(dumpIndex > preflightIndex);
  assert.ok(migrateIndex >= 0);
  assert.ok(rehydrateIndex > migrateIndex);
  assert.ok(unlockIndex > rehydrateIndex);
  assert.ok(passIndex > unlockIndex);
  assert.match(source, /DEV runtime overlay rehydrate path guard failed/u);
  assert.match(source, /never an ordinary code-only deploy path/u);
  assert.match(source, /reinstalling P2-B owner\/context and runtime overlays after migrations/u);
});

test("wrapper defaults to usage and performs no operation without the exact execute flag", () => {
  const result = spawnSync("bash", [wrapperPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--execute/u);
  assert.equal(result.stderr, "");
});

test("owner-equals-runtime configuration is rejected before the canonical overlay call", () => {
  const source = readFileSync(wrapperPath, "utf8");
  const aliasGuard = source.indexOf('runtime_overlay_assert_separate_roles "DEV" "$owner_role" "$runtime_role"');
  const overlayCall = source.indexOf("runtime_overlay_apply_post_migration_chain");
  assert.ok(aliasGuard >= 0);
  assert.ok(overlayCall > aliasGuard);
});
