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
import {
  expandCanonicalSqlFile,
  openCanonicalSqlFile,
} from "./stream-canonical-sql.mjs";

const wrapperPath = fileURLToPath(new URL("./dev-runtime-overlay-rehydrate.sh", import.meta.url));
const libraryPath = fileURLToPath(new URL("./runtime-overlay-rehydrate-lib.sh", import.meta.url));
const refreshPath = fileURLToPath(new URL("./refresh-dev-from-test.sh", import.meta.url));
const sqlStreamerPath = fileURLToPath(new URL("./stream-canonical-sql.mjs", import.meta.url));
const envParserPath = fileURLToPath(new URL("./parse-dev-database-url.mjs", import.meta.url));
const repoRoot = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const appOwnerHandoffPath = fileURLToPath(
  new URL("../postgres/runtime-overlay-app-owner-handoff.sql", import.meta.url),
);
const e1OverlayPath = fileURLToPath(
  new URL("../postgres/e1-webapp-runtime-config.sql", import.meta.url),
);
const d34BootstrapPath = fileURLToPath(
  new URL("../postgres/d3-4-bootstrap-base-login-read-grants.sql", import.meta.url),
);
const phase4LockedPoliciesPath = fileURLToPath(
  new URL("../postgres/phase4-locked-helper-rls-policies.sql", import.meta.url),
);
const e1MigrationPaths = [
  "apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql",
  "apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql",
  "apps/webapp/db/drizzle-migrations/0195_e1_patient_maintenance_history.sql",
  "apps/webapp/db/drizzle-migrations/0197_patient_plan_opened_capability.sql",
  "apps/webapp/db/drizzle-migrations/0198_patient_visible_catalog_reads.sql",
  "apps/webapp/db/drizzle-migrations/0199_current_patient_booking_rows.sql",
  "apps/webapp/db/drizzle-migrations/0200_current_patient_product_analytics.sql",
  "apps/webapp/db/drizzle-migrations/0201_e1_webapp_auth_role_runtime_config.sql",
  "apps/webapp/db/drizzle-migrations/0202_current_patient_ui_capabilities.sql",
  "apps/webapp/db/drizzle-migrations/0216_current_patient_organization_context.sql",
];

const canonicalOrder = [
  "deploy/postgres/organization-member-invites-rls.sql",
  "deploy/postgres/patient-invites-rls.sql",
  "deploy/postgres/store-p0-entitlements-rls.sql",
  "deploy/postgres/patient-course-assignment-wall.sql",
  "deploy/postgres/specialist-signup-public-bootstrap-rls.sql",
  "deploy/postgres/specialist-owner-provisioning-rls.sql",
  "deploy/postgres/c5a-platform-operations-runtime.sql",
  "deploy/postgres/runtime-overlay-app-owner-handoff.sql",
  "deploy/postgres/reference-catalog-rls.sql",
  "deploy/postgres/patient-visible-catalog-rls.sql",
  "deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
  "deploy/postgres/public-booking-bootstrap-resolver.sql",
  "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
  "deploy/postgres/e1-webapp-runtime-config.sql",
];

const exactProtectedOverlaySignatures = [
  "app.get_web_push_vapid_public_key()",
  "app.resolve_public_booking_organization(uuid,uuid,uuid)",
  "app.resolve_public_organization_by_slug(text)",
];

const protectedReplacements = [
  {
    relativePath: "deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
    path: fileURLToPath(
      new URL("../postgres/patient-web-push-vapid-public-key-accessor.sql", import.meta.url),
    ),
    definitionPattern: /CREATE OR REPLACE FUNCTION app\.get_web_push_vapid_public_key\(\)/u,
    signature: "app.get_web_push_vapid_public_key()",
  },
  {
    relativePath: "deploy/postgres/public-booking-bootstrap-resolver.sql",
    path: fileURLToPath(
      new URL("../postgres/public-booking-bootstrap-resolver.sql", import.meta.url),
    ),
    definitionPattern:
      /CREATE OR REPLACE FUNCTION app\.resolve_public_booking_organization\(\s*p_branch_id uuid,\s*p_service_id uuid,\s*p_branch_service_id uuid\s*\)/u,
    signature: "app.resolve_public_booking_organization(uuid,uuid,uuid)",
  },
  {
    relativePath: "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
    path: fileURLToPath(
      new URL("../postgres/public-clinic-slug-bootstrap-resolver.sql", import.meta.url),
    ),
    definitionPattern:
      /CREATE OR REPLACE FUNCTION app\.resolve_public_organization_by_slug\(\s*p_slug text\s*\)/u,
    signature: "app.resolve_public_organization_by_slug(text)",
  },
];

function assertExactOwnerHandoffCoverage(source) {
  const targetBlocks = [...source.matchAll(/WITH exact_targets\(signature\) AS \(\n {2}VALUES\n([\s\S]*?)\n\)/gu)];
  assert.equal(
    targetBlocks.length,
    3,
    "expected source-owner, catalog-driven handoff, and existing-target postcheck exact sets",
  );
  for (const block of targetBlocks) {
    const signatures = [...block[1].matchAll(/\('([^']+)'\)/gu)].map((match) => match[1]);
    assert.deepEqual(signatures, exactProtectedOverlaySignatures);
  }
  assert.equal((source.match(/JOIN pg_proc AS procedure/gu) ?? []).length, 3);
  assert.doesNotMatch(source, /LEFT JOIN pg_proc AS procedure/u);
  assert.doesNotMatch(source, /count\(target\.signature\)|count\(procedure\.oid\)/u);
  assert.doesNotMatch(source, /targets_present|missing_target_abort/u);
  assert.match(source, /runtime_overlay_app_owner_handoff_existing_targets_owned/u);
  assert.match(
    source,
    /WHERE procedure\.proowner <> \(SELECT oid FROM pg_roles WHERE rolname = 'app_owner'\)/u,
  );
  assert.doesNotMatch(source, /ALTER FUNCTION IF EXISTS/u);
  assert.match(
    source,
    /SELECT format\('ALTER FUNCTION %s OWNER TO app_owner', procedure\.oid::regprocedure\)[\s\S]*\\gexec/u,
  );
}

function simulateExactOwnerHandoff(existingOwners, databaseOwner = "database_owner") {
  const result = new Map(existingOwners);
  for (const signature of exactProtectedOverlaySignatures) {
    const owner = result.get(signature);
    if (owner === undefined) continue;
    if (owner !== databaseOwner && owner !== "app_owner") {
      throw new Error(`unexpected owner for ${signature}`);
    }
    result.set(signature, "app_owner");
  }
  return result;
}

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

test("missing-capable handoff targets map exactly to later overlay creation and final app_owner", () => {
  const handoff = readFileSync(appOwnerHandoffPath, "utf8");
  assertExactOwnerHandoffCoverage(handoff);

  const detectedSetRoleReplacements = canonicalOrder.filter((relativePath) => {
    if (!relativePath.startsWith("deploy/postgres/") || relativePath === canonicalOrder.at(-1)) {
      return false;
    }
    const overlay = readFileSync(join(repoRoot, relativePath), "utf8");
    return /SET ROLE app_owner;[\s\S]*CREATE OR REPLACE FUNCTION app\./u.test(overlay);
  });
  assert.deepEqual(
    detectedSetRoleReplacements,
    protectedReplacements.map((replacement) => replacement.relativePath),
  );

  const handoffIndex = canonicalOrder.indexOf("deploy/postgres/runtime-overlay-app-owner-handoff.sql");
  for (const replacement of protectedReplacements) {
    const overlay = readFileSync(replacement.path, "utf8");
    assert.ok(canonicalOrder.indexOf(replacement.relativePath) > handoffIndex);
    assert.match(overlay, /SET ROLE app_owner;/u);
    assert.match(overlay, replacement.definitionPattern);
    assert.ok(
      handoff.includes(`('${replacement.signature}')`),
      `missing safe-source gate for ${replacement.signature}`,
    );
    const spacedSignature = replacement.signature.replaceAll(",", ", ");
    assert.ok(
      overlay.includes(`ALTER FUNCTION ${spacedSignature} OWNER TO app_owner;`),
      `exact overlay must establish existence and final owner for ${replacement.signature}`,
    );
  }

  assert.match(handoff, /procedure\.proowner NOT IN/u);
  assert.match(handoff, /database_owner\.datdba/u);
  assert.match(handoff, /rolname = 'app_owner'/u);
  assert.match(handoff, /rolcanlogin = false/u);
  assert.match(handoff, /rolbypassrls = true/u);
  assert.doesNotMatch(handoff, /REASSIGN\s+OWNED|DROP\s+OWNED/iu);
  assert.doesNotMatch(handoff, /ALTER FUNCTION IF EXISTS/u);
  assert.match(handoff, /procedure\.oid::regprocedure/u);
  assert.match(handoff, /\\gexec/u);
});

test("protected owner handoff allows two absent targets and rejects an existing unexpected owner", () => {
  const handoff = readFileSync(appOwnerHandoffPath, "utf8");
  assertExactOwnerHandoffCoverage(handoff);

  const oneExisting = simulateExactOwnerHandoff(
    new Map([["app.get_web_push_vapid_public_key()", "database_owner"]]),
  );
  assert.deepEqual([...oneExisting], [["app.get_web_push_vapid_public_key()", "app_owner"]]);

  assert.throws(
    () =>
      simulateExactOwnerHandoff(
        new Map([
          ["app.get_web_push_vapid_public_key()", "database_owner"],
          ["app.resolve_public_booking_organization(uuid,uuid,uuid)", "unexpected_owner"],
        ]),
      ),
    /unexpected owner for app\.resolve_public_booking_organization/u,
  );
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

test("D3.4 exposes an explicit DEV webapp-only composition without weakening TEST defaults", () => {
  const source = readFileSync(d34BootstrapPath, "utf8");
  assert.match(source, /\\set d3_4_skip_media_worker 0/u);
  assert.match(source, /d3_4_skip_media_worker_is_boolean/u);
  assert.match(source, /d3_4_skip_media_worker_role_must_be_absent/u);
  assert.match(source, /\\set d3_4_skip_bootstrap_role_normalization 0/u);
  assert.match(source, /d3_4_skip_bootstrap_role_normalization_is_boolean/u);
  assert.match(source, /d3_4_skip_flags_form_exact_supported_composition/u);
  assert.match(
    source,
    /\\if :d3_4_skip_media_worker\n\\if :\{\?d3_4_media_worker_runtime_role\}/u,
  );
  assert.match(
    source,
    /\\else\n\\if :\{\?d3_4_media_worker_runtime_role\}[\s\S]*d3_4_media_worker_runtime_role_has_exact_supported_capability;\n\\endif/u,
  );
  for (const statement of [
    'GRANT USAGE ON SCHEMA app TO :"d3_4_media_worker_runtime_role";',
    'GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_media_worker_runtime_role";',
    'GRANT SELECT ON TABLE public.app_runtime_settings TO :"d3_4_media_worker_runtime_role";',
    'REVOKE USAGE ON SCHEMA app FROM :"d3_4_media_worker_runtime_role";',
    'REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM :"d3_4_media_worker_runtime_role";',
    'REVOKE SELECT ON TABLE public.app_runtime_settings FROM :"d3_4_media_worker_runtime_role";',
  ]) {
    const escapedStatement = statement.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert.match(
      source,
      new RegExp(
        `\\\\if :d3_4_skip_media_worker\\n\\\\else\\n${escapedStatement}\\n\\\\endif`,
        "u",
      ),
    );
  }
  assert.match(
    source,
    /\\if :d3_4_skip_bootstrap_role_normalization\n\\else\nALTER ROLE :"d3_4_bootstrap_base_role"[\s\S]*GRANT app_patient TO :"d3_4_bootstrap_base_role"[\s\S]*WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;\n\\endif\nREVOKE SELECT ON TABLE public\.app_runtime_settings/u,
  );
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
  assert.match(source, /d3-4-bootstrap-base-login-read-grants\.sql/u);
  assert.match(source, /runtime-overlay-app-owner-handoff\.sql/u);
  assert.match(
    source,
    /PHASE4_LOCKED_POLICIES="\$REPO_ROOT\/deploy\/postgres\/phase4-locked-helper-rls-policies\.sql"/u,
  );
  assert.match(
    source,
    /"\$PHASE4_LOCKED_POLICIES\|\$REPO_ROOT\/deploy\/postgres\/phase4-locked-helper-rls-policies\.sql\|Phase 4 strict locked-helper policies"/u,
  );
  assert.equal(source.split('--snapshot-stream "$DEV_ENV"').length - 1, 1);
  assert.match(source, /DEV_SNAPSHOT_COPROC_READ_FD="\$\{DEV_ENV_SNAPSHOT_PROCESS\[0\]\}"/u);
  assert.match(source, /DEV_SNAPSHOT_COPROC_WRITE_FD="\$\{DEV_ENV_SNAPSHOT_PROCESS\[1\]\}"/u);
  assert.match(source, /exec \{DEV_SNAPSHOT_READ_FD\}<&"\$DEV_SNAPSHOT_COPROC_READ_FD"/u);
  assert.match(source, /exec \{DEV_SNAPSHOT_WRITE_FD\}>&"\$DEV_SNAPSHOT_COPROC_WRITE_FD"/u);
  assert.match(source, /DEV_SNAPSHOT_READ_FD_OPEN=1/u);
  assert.match(source, /DEV_SNAPSHOT_WRITE_FD_OPEN=1/u);
  assert.match(source, /close_dev_snapshot_write_fd/u);
  assert.match(source, /close_dev_snapshot_read_fd/u);
  assert.match(source, /exec \{DEV_SNAPSHOT_COPROC_READ_FD\}<&-/u);
  assert.match(source, /exec \{DEV_SNAPSHOT_COPROC_WRITE_FD\}>&-/u);
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
  assert.match(source, /dev_runtime_incoming_memberships_exact/u);
  assert.match(source, /actual\.granted_role = 'app_owner'/u);
  assert.match(source, /pg_has_role\(candidate_role\.oid, owner_role\.oid, 'MEMBER'\)/u);
  assert.match(source, /NOT \(candidate_role\.rolsuper AND candidate_role\.rolname = 'postgres'\)/u);
  assert.match(source, /SELECT \* FROM actual_protected_membership[\s\S]*EXCEPT[\s\S]*SELECT \* FROM active_expected/u);
  assert.match(source, /SELECT \* FROM active_expected[\s\S]*EXCEPT[\s\S]*SELECT \* FROM actual_protected_membership/u);
  for (const roleName of [
    "bcb_dev_runtime_staff_login",
    "bcb_dev_runtime_nonstaff_login",
    "bcb_test_staff_login",
    "bcb_test_integrator_login",
    "bcb_test_nonstaff_login",
  ]) {
    assert.match(source, new RegExp(roleName, "u"));
  }
  assert.match(source, /'bcb_test_staff_login',\s+false, true,\s+true, true,\s+ARRAY\['search_path=public, integrator'\]/u);
  assert.match(source, /member_role\.rolinherit <> expected\.member_inherit/u);
  assert.match(source, /member_role\.rolconfig IS DISTINCT FROM expected\.member_config/u);
  assert.match(source, /member_role\.rolsuper/u);
  assert.match(source, /member_role\.rolcreatedb/u);
  assert.match(source, /member_role\.rolcreaterole/u);
  assert.match(source, /member_role\.rolreplication/u);
  assert.match(source, /member_role\.rolbypassrls/u);
  assert.match(source, /CROSS JOIN \(VALUES \('app_staff'\), \('app_patient'\)\) AS wall/u);
  assert.match(source, /pg_has_role\(candidate_role\.oid, wall_role\.oid, 'MEMBER'\)/u);
  assert.match(source, /expected\.member_role = candidate_role\.rolname/u);
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
  assert.match(
    source,
    /-v phase4_enforce_locked_context=1 \\\n {2}-f "\$PHASE4_LOCKED_POLICIES"/u,
  );
  assert.match(
    source,
    /runtime_overlay_apply_post_migration_chain\s+\\?\s*"\$REPO_ROOT" "\$TARGET_DB" "\$TARGET_RUNTIME_ROLE" 1/u,
  );
  assert.match(source, /d3_4_bootstrap_base_role=\$TARGET_RUNTIME_ROLE/u);
  assert.match(source, /d3_4_skip_media_worker=1/u);
  assert.match(source, /d3_4_skip_bootstrap_role_normalization=1/u);
  assert.doesNotMatch(source, /d3_4_media_worker_runtime_role=/u);
  assert.match(source, /DEV C0 dual-pool runtime requires locked principal-context mode/u);
  assert.doesNotMatch(source, /requires shadow or locked mode/u);
  assert.match(source, /dev_runtime_overlay_exact_owner_acl/u);
  assert.match(source, /SELECT app\.release_principal_context\(\);/u);
  assert.match(source, /DEV nonstaff base-login D3\.4 bootstrap surface is incomplete/u);
  assert.match(
    source,
    /has_function_privilege\(current_user, 'app\.resolve_public_organization_by_slug\(text\)', 'EXECUTE'\)/u,
  );
  const sharedOverlayIndex = source.indexOf("runtime_overlay_apply_post_migration_chain");
  const strictBasePolicyIndex = source.indexOf(
    '-v phase4_enforce_locked_context=1 \\\n  -f "$PHASE4_LOCKED_POLICIES"',
  );
  const d34Index = source.indexOf("d3_4_skip_media_worker=1", sharedOverlayIndex);
  const releaseProofIndex = source.indexOf(
    'run_dev_runtime_psql -Atc "SELECT app.release_principal_context();"',
    d34Index,
  );
  assert.ok(
    strictBasePolicyIndex >= 0 &&
      sharedOverlayIndex > strictBasePolicyIndex &&
      d34Index > sharedOverlayIndex &&
      releaseProofIndex > d34Index,
  );
  assert.match(source, /app\.read_public_runtime_setting\('oauth_google_enabled','admin'\)/u);
  assert.match(source, /SET LOCAL ROLE app_patient/u);
  assert.match(source, /app\.read_current_patient_booking_rows\('upcoming', now\(\)\)/u);
  assert.doesNotMatch(source, /pg_dump|pg_restore|DROP\s+(?:DATABASE|SCHEMA|TABLE)|CREATE\s+DATABASE/iu);
  assert.doesNotMatch(
    source,
    /\/opt\/env\/bersoncarebot|bersoncarebot_test|bcb_webapp_prod|bersoncarebot_prod/iu,
  );
  assert.doesNotMatch(source, /phase4-force-rls-cutover/u);
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

test("post-GO failure closes the snapshot transport idempotently without leaking its secret", () => {
  const source = readFileSync(wrapperPath, "utf8");
  const cleanupStart = source.indexOf("close_dev_snapshot_write_fd() {");
  const cleanupEnd = source.indexOf("\ntrap abort_dev_env_snapshot EXIT", cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart);
  const cleanupSource = source.slice(cleanupStart, cleanupEnd);
  const fixtureSecret = "fixture-post-go-secret-never-print-123456789";
  const harness = `
    set -Eeuo pipefail
    coproc FIXTURE_SNAPSHOT_PROCESS {
      printf '%s\n' owner-url runtime-url locked
      IFS= read -r signal
      [[ "$signal" == "GO" ]] || exit 71
      printf '%s\n' ${JSON.stringify(fixtureSecret)}
    }
    DEV_ENV_SNAPSHOT_PID_VALUE="$FIXTURE_SNAPSHOT_PROCESS_PID"
    DEV_SNAPSHOT_COPROC_READ_FD="\${FIXTURE_SNAPSHOT_PROCESS[0]}"
    DEV_SNAPSHOT_COPROC_WRITE_FD="\${FIXTURE_SNAPSHOT_PROCESS[1]}"
    exec {DEV_SNAPSHOT_READ_FD}<&"$DEV_SNAPSHOT_COPROC_READ_FD"
    exec {DEV_SNAPSHOT_WRITE_FD}>&"$DEV_SNAPSHOT_COPROC_WRITE_FD"
    DEV_SNAPSHOT_READ_FD_OPEN=1
    DEV_SNAPSHOT_WRITE_FD_OPEN=1
    exec {DEV_SNAPSHOT_COPROC_READ_FD}<&-
    exec {DEV_SNAPSHOT_COPROC_WRITE_FD}>&-
    IFS= read -r _owner <&"$DEV_SNAPSHOT_READ_FD"
    IFS= read -r _runtime <&"$DEV_SNAPSHOT_READ_FD"
    IFS= read -r _mode <&"$DEV_SNAPSHOT_READ_FD"
    ${cleanupSource}
    trap abort_dev_env_snapshot EXIT
    printf 'GO\n' >&"$DEV_SNAPSHOT_WRITE_FD"
    close_dev_snapshot_write_fd
    close_dev_snapshot_write_fd
    false | true
    printf 'unreachable\n'
  `;
  const result = spawnSync("bash", ["--noprofile", "--norc", "-c", harness], {
    encoding: "utf8",
    timeout: 2000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /Bad file descriptor/u);
  assert.doesNotMatch(result.stdout, new RegExp(fixtureSecret, "u"));
  assert.doesNotMatch(result.stderr, new RegExp(fixtureSecret, "u"));
  assert.doesNotMatch(result.stdout, /unreachable/u);
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
  const migrationDir = join(fakeRepo, "apps/webapp/db/drizzle-migrations");
  const canonicalFile = join(canonicalDir, "fixture.sql");
  const secondFile = join(canonicalDir, "second.sql");
  const includedFile = join(migrationDir, "included.sql");
  const outsideFile = join(fakeRepo, "outside.sql");
  const symlinkFile = join(canonicalDir, "link.sql");
  const fifoFile = join(canonicalDir, "fifo.sql");
  const calls = join(fakeRepo, "calls.txt");
  const stdinCapture = join(fakeRepo, "stdin.sql");
  mkdirSync(canonicalDir, { recursive: true });
  mkdirSync(migrationDir, { recursive: true });
  writeFileSync(
    canonicalFile,
    "SELECT 'canonical';\n\\ir ../../apps/webapp/db/drizzle-migrations/included.sql\n",
  );
  writeFileSync(
    secondFile,
    "SELECT 'before-include';\n\\ir ../../apps/webapp/db/drizzle-migrations/included.sql\nSELECT 'after-include';\n",
  );
  writeFileSync(includedFile, "SELECT 'included';\n");
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
  assert.equal(
    readFileSync(stdinCapture, "utf8"),
    "SELECT 'canonical';\n\\ir ../../apps/webapp/db/drizzle-migrations/included.sql\n",
  );

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
  assert.equal(
    readFileSync(stdinCapture, "utf8"),
    "SELECT 'before-include';\nSELECT 'included';\nSELECT 'after-include';\n",
  );

  const acceptedStrictPolicies = runCallback([
    "-d",
    "bcb_webapp_dev",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "phase4_enforce_locked_context=1",
    "-f",
    canonicalFile,
  ]);
  assert.equal(acceptedStrictPolicies.status, 0, acceptedStrictPolicies.stderr);
  assert.equal(
    readFileSync(calls, "utf8"),
    "-d bcb_webapp_dev -X -v ON_ERROR_STOP=1 -v phase4_enforce_locked_context=1\n",
  );
  assert.equal(
    readFileSync(stdinCapture, "utf8"),
    "SELECT 'canonical';\n\\ir ../../apps/webapp/db/drizzle-migrations/included.sql\n",
  );

  const acceptedD34 = runCallback([
    "-d",
    "bcb_webapp_dev",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "d3_4_bootstrap_base_role=bcb_dev_runtime_nonstaff_login",
    "-v",
    "d3_4_skip_media_worker=1",
    "-v",
    "d3_4_skip_bootstrap_role_normalization=1",
    "-f",
    canonicalFile,
  ]);
  assert.equal(acceptedD34.status, 0, acceptedD34.stderr);
  assert.equal(
    readFileSync(calls, "utf8"),
    "-d bcb_webapp_dev -X -v ON_ERROR_STOP=1 -v d3_4_bootstrap_base_role=bcb_dev_runtime_nonstaff_login -v d3_4_skip_media_worker=1 -v d3_4_skip_bootstrap_role_normalization=1\n",
  );
  assert.equal(
    readFileSync(stdinCapture, "utf8"),
    "SELECT 'canonical';\n\\ir ../../apps/webapp/db/drizzle-migrations/included.sql\n",
  );

  const rejectedCases = [
    ["-d", "bcb_webapp_dev"],
    ["-d", "bcb_webapp_dev", "-f"],
    ["-d", "bcb_webapp_dev", `-f${canonicalFile}`],
    ["-d", "bcb_webapp_dev", "--file", canonicalFile],
    ["--dbname=bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    ["-dbcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    ["-d", "bcb_webapp_dev", "-X", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1", "-f", canonicalFile],
    ["-d", "other_db", "-X", "-v", "ON_ERROR_STOP=1", "-f", canonicalFile],
    [
      "-d",
      "bcb_webapp_dev",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "phase4_enforce_locked_context=0",
      "-f",
      canonicalFile,
    ],
    [
      "-d",
      "bcb_webapp_dev",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "d3_4_bootstrap_base_role=bcb_dev_runtime_nonstaff_login",
      "-v",
      "d3_4_skip_media_worker=1",
      "-f",
      canonicalFile,
    ],
    [
      "-d",
      "bcb_webapp_dev",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "d3_4_bootstrap_base_role=bcb_dev_runtime_nonstaff_login",
      "-v",
      "d3_4_skip_media_worker=0",
      "-f",
      canonicalFile,
    ],
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

test("E1 canonical expansion pins all ten relative migrations in declared order", () => {
  const expanded = expandCanonicalSqlFile(e1OverlayPath, dirname(e1OverlayPath), repoRoot);
  let cursor = 0;
  for (const relativePath of e1MigrationPaths) {
    const migration = readFileSync(join(repoRoot, relativePath), "utf8");
    const migrationIndex = expanded.indexOf(migration, cursor);
    assert.ok(migrationIndex >= cursor, `missing or out-of-order E1 migration: ${relativePath}`);
    cursor = migrationIndex + migration.length;
  }
  assert.doesNotMatch(expanded, /^[\t ]*\\ir\b/gmu);
  assert.ok(expanded.indexOf("GRANT SELECT ON TABLE", cursor) >= cursor);
});

test("relative SQL expansion rejects absolute, escaping, malformed, unsafe, and cyclic includes", () => {
  const fakeRepo = mkdtempSync(join(tmpdir(), "bcb-sql-includes-"));
  const canonicalDir = join(fakeRepo, "deploy/postgres");
  const includeDir = join(fakeRepo, "includes");
  mkdirSync(canonicalDir, { recursive: true });
  mkdirSync(includeDir, { recursive: true });

  const realInclude = join(includeDir, "real.sql");
  const symlinkInclude = join(includeDir, "link.sql");
  const fifoInclude = join(includeDir, "pipe.sql");
  const nonSqlInclude = join(includeDir, "not-sql.txt");
  writeFileSync(realInclude, "SELECT 'real';\n");
  writeFileSync(nonSqlInclude, "SELECT 'not-sql';\n");
  symlinkSync(realInclude, symlinkInclude);
  const fifoResult = spawnSync("mkfifo", [fifoInclude], { encoding: "utf8" });
  assert.equal(fifoResult.status, 0, fifoResult.stderr);

  const assertRejectedDirective = (name, directive, errorPattern) => {
    const primary = join(canonicalDir, `${name}.sql`);
    writeFileSync(primary, `${directive}\n`);
    assert.throws(
      () => expandCanonicalSqlFile(primary, canonicalDir, fakeRepo),
      errorPattern,
    );
  };

  assertRejectedDirective("absolute", "\\ir /tmp/absolute.sql", /malformed canonical SQL/u);
  assertRejectedDirective("escape", "\\ir ../../../outside.sql", /include path rejected/u);
  assertRejectedDirective(
    "malformed",
    "\\ir '../../includes/real.sql'",
    /malformed canonical SQL/u,
  );
  assertRejectedDirective("non-sql", "\\ir ../../includes/not-sql.txt", /include path rejected/u);
  assertRejectedDirective("symlink", "\\ir ../../includes/link.sql", /not a regular file/u);
  assertRejectedDirective("fifo", "\\ir ../../includes/pipe.sql", /not a regular file/u);

  const cycleA = join(includeDir, "cycle-a.sql");
  const cycleB = join(includeDir, "cycle-b.sql");
  writeFileSync(cycleA, "\\ir cycle-b.sql\n");
  writeFileSync(cycleB, "\\ir cycle-a.sql\n");
  assertRejectedDirective("cycle", "\\ir ../../includes/cycle-a.sql", /include cycle rejected/u);
});

test("TEST to DEV refresh delegates migration and rehydrate to one wrapper before DEV unlock", () => {
  const source = readFileSync(refreshPath, "utf8");
  const preflightIndex = source.indexOf('bash "$DEV_MIGRATE" --preflight');
  const dumpIndex = source.indexOf("pg_dump -Fc");
  const restoreIndex = source.indexOf('"${POSTGRES[@]}" pg_restore');
  const migrateIndex = source.indexOf('bash "$DEV_MIGRATE" --execute');
  const unlockIndex = source.indexOf('bash "$DEV_POST_REFRESH_UNLOCK" --execute');
  const passIndex = source.indexOf("PASS: DEV now mirrors TEST data plus current branch migrations");

  assert.ok(preflightIndex >= 0);
  assert.ok(dumpIndex > preflightIndex);
  assert.ok(restoreIndex > dumpIndex);
  assert.ok(migrateIndex > restoreIndex);
  assert.ok(unlockIndex > migrateIndex);
  assert.ok(passIndex > unlockIndex);
  assert.match(source, /DEV migration wrapper path guard failed/u);
  assert.match(source, /never an ordinary code-only deploy path/u);
  assert.doesNotMatch(source, /DEV_RUNTIME_OVERLAY_REHYDRATE|pnpm run migrate/u);
  assert.match(source, /applying current migrations and the canonical DEV runtime closure/u);
});

test("DEV strict base policy source retains the locked phone-history predicate", () => {
  const source = readFileSync(phase4LockedPoliciesPath, "utf8");
  const phoneHistoryStart = source.indexOf("-- public.user_phone_history");
  const nextTableStart = source.indexOf("\n-- public.", phoneHistoryStart + 1);
  assert.ok(phoneHistoryStart >= 0 && nextTableStart > phoneHistoryStart);
  const phoneHistoryPolicy = source.slice(phoneHistoryStart, nextTableStart);

  assert.match(phoneHistoryPolicy, /\\if :phase4_enforce_locked_context/u);
  assert.match(phoneHistoryPolicy, /app\.current_org_id\(\) IS NOT NULL/u);
  assert.match(phoneHistoryPolicy, /"organization_id" = app\.current_org_id\(\)/u);
  assert.match(phoneHistoryPolicy, /app\.current_patient_user_id\(\) IS NULL/u);
  assert.match(phoneHistoryPolicy, /app\.current_integrator_user_id\(\) IS NULL/u);
  assert.match(phoneHistoryPolicy, /NOT app\.is_staff\(\)/u);
  assert.doesNotMatch(phoneHistoryPolicy, /current_setting\('app\.org'/u);
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
