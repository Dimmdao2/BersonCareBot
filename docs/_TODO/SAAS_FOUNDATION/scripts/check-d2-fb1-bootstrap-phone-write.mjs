#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md",
  log: "docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  taskA: "docs/_TODO/SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md",
  c0Adr: "docs/_TODO/SAAS_FOUNDATION/SAAS_C0_LOCKED_TOPOLOGY_ADR.md",
  grantSql: "deploy/postgres/d2-fb1-bootstrap-phone-write-grants.sql",
  forceSql: "deploy/postgres/phase4-force-rls-cutover.sql",
  p2bSql: "deploy/postgres/p2-b-protected-principal-context.sql",
  phoneHistoryRepo: "apps/webapp/src/infra/repos/pgPhoneHistory.ts",
  contactsRepo: "apps/webapp/src/infra/repos/pgPlatformUserContacts.ts",
  userByPhoneRepo: "apps/webapp/src/infra/repos/pgUserByPhone.ts",
  messengerBindRepo: "apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts",
  bookingContactUpsert: "apps/webapp/src/modules/platform-user-contacts/bookingContactUpsert.ts",
  rehearsal: "docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-multitenant-isolation.mjs",
  r2Smoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-r2-real-policy-isolation.mjs",
  phase4ForceCheck: "docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-force-cutover-sql.mjs",
  packageJson: "package.json",
  testDeploySaas: "deploy/host/deploy-test-saas.sh",
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) {
      fail(`${label} must not contain forbidden fragment: ${fragment}`);
    }
  }
}

function requireBlockFragments(label, text, startFragment, endFragment, fragments) {
  const startIndex = text.indexOf(startFragment);
  if (startIndex < 0) fail(`${label} missing block start: ${startFragment}`);
  const endIndex = text.indexOf(endFragment, startIndex);
  if (endIndex < 0) fail(`${label} missing block end after start: ${endFragment}`);
  const block = text.slice(startIndex, endIndex + endFragment.length);
  requireFragments(label, block, fragments);
}

function getBlock(label, text, startFragment, endFragment) {
  const startIndex = text.indexOf(startFragment);
  if (startIndex < 0) fail(`${label} missing block start: ${startFragment}`);
  const endIndex = text.indexOf(endFragment, startIndex);
  if (endIndex < 0) fail(`${label} missing block end after start: ${endFragment}`);
  return text.slice(startIndex, endIndex + endFragment.length);
}

function requireOrderedFragments(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const nextIndex = text.indexOf(fragment, cursor);
    if (nextIndex < 0) {
      fail(`${label} missing ordered fragment after offset ${cursor}: ${fragment}`);
    }
    cursor = nextIndex + fragment.length;
  }
}

function assertCleanupIsNotBestEffort(testDeploySaasText) {
  const cleanupBlocks = [
    ["revoke_bypass", getBlock("revoke_bypass", testDeploySaasText, "revoke_bypass(){", "\n}")],
    [
      "revoke_migrator_membership",
      getBlock("revoke_migrator_membership", testDeploySaasText, "revoke_migrator_membership(){", "\n}"),
    ],
    ["assert_cleanup_elevation", getBlock("assert_cleanup_elevation", testDeploySaasText, "assert_cleanup_elevation(){", "\n}")],
    ["cleanup_elevation", getBlock("cleanup_elevation", testDeploySaasText, "\ncleanup_elevation(){", "\n}")],
    ["cleanup_exit", getBlock("cleanup_exit", testDeploySaasText, "\ncleanup_exit(){", "\n}")],
  ];

  for (const [name, block] of cleanupBlocks) {
    forbidFragments(`${files.testDeploySaas} ${name}`, block, ["|| true"]);
  }

  requireOrderedFragments(
    `${files.testDeploySaas} revoke_migrator_membership flag clearing`,
    cleanupBlocks[1][1],
    [
      "if sudo -u postgres psql -v ON_ERROR_STOP=1 -c \"REVOKE \\\"$DBROLE\\\" FROM \\\"$MIGRATOR_ROLE\\\";\"; then",
      "MIGRATOR_OWNER_MEMBERSHIP_ADDED=0",
    ],
  );
}

function assertPreExistingMigratorMembershipFails(testDeploySaasText) {
  const grantBlock = getBlock(
    "grant_migrator_owner_membership",
    testDeploySaasText,
    "grant_migrator_owner_membership(){",
    "\n}",
  );
  requireOrderedFragments(`${files.testDeploySaas} pre-existing migrator membership residue guard`, grantBlock, [
    "[ \"$role_name\" = \"$DBROLE\" ] && return 0",
    "membership_exists=\"$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc \"SELECT pg_has_role('$role_name', '$DBROLE', 'member');\")\"",
    "if [ \"$membership_exists\" = \"t\" ]; then",
    "FATAL: role $role_name already has membership in $DBROLE before deploy; clean up this pre-existing residue before rerunning deploy-test-saas.sh",
    "exit 1",
    "fi",
    "sudo -u postgres psql -v ON_ERROR_STOP=1 -c \"GRANT \\\"$DBROLE\\\" TO \\\"$role_name\\\";\" >/dev/null",
  ]);
  forbidFragments(`${files.testDeploySaas} grant_migrator_owner_membership`, grantBlock, [
    "[ \"$membership_exists\" = \"t\" ] && return 0",
  ]);
}

function assertBootstrapOldHistorySeedNull(rehearsalText) {
  const insertMatches = rehearsalText.matchAll(
    /INSERT INTO public\.user_phone_history\s*\((?<columns>[^)]*)\)\s*VALUES\s*(?<values>[\s\S]*?);/g,
  );
  for (const match of insertMatches) {
    const columns = match.groups?.columns ?? "";
    const values = match.groups?.values ?? "";
    if (!columns.includes("organization_id") || !values.includes("bootstrapOldHistoryId")) {
      continue;
    }
    const bootstrapTuple = values
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes("bootstrapOldHistoryId"));
    if (!bootstrapTuple) {
      fail(`${files.rehearsal} has bootstrapOldHistoryId outside a user_phone_history VALUES tuple`);
    }
    if (!/,\s*NULL\)?[,;]?$/.test(bootstrapTuple)) {
      fail(`${files.rehearsal} must seed bootstrapOldHistoryId with organization_id NULL`);
    }
    return;
  }
  fail(`${files.rehearsal} missing user_phone_history INSERT for bootstrapOldHistoryId`);
}

function assertPackageScript(packageJsonText) {
  const packageJson = JSON.parse(packageJsonText);
  const expected =
    "node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-d2-fb1-bootstrap-phone-write.mjs && node --check docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-multitenant-isolation.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-force-cutover-sql.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-d2-fb1-bootstrap-phone-write.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-d2-fb1-bootstrap-phone-write.mjs --self-test";
  if (packageJson.scripts?.["check:saas-d2-fb1-bootstrap-phone-write"] !== expected) {
    fail("package.json has an unexpected check:saas-d2-fb1-bootstrap-phone-write script");
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.roadmap, loaded.roadmap, [
    "### Phase D2 — FB#1 bootstrap phone-write closure",
    "Grant `app_runtime_nonstaff_login` the minimal direct bootstrap DML/function surface chosen in C0",
    "Exercise real OTP/contact/phone-history close+insert",
    "application repository path, not only handcrafted SQL",
    "Prove nonstaff bootstrap cannot read/write unrelated org PII and staff cannot see bootstrap NULL PII.",
    "strict+FORCE with the production topology",
  ]);

  requireFragments(files.taskA, loaded.taskA, [
    "**FB#1-bootstrap [HIGH] prove the bootstrap/OTP phone-write path under enforce**",
    "permission denied for table user_phone_history",
    "faithfully model the prod bootstrap connection-role topology",
    "NULL-org active row",
    "app.close_active_user_phone_history",
  ]);

  requireFragments(files.c0Adr, loaded.c0Adr, [
    "`app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS`",
    "Bootstrap also uses the nonstaff pool but remains the base login after",
    "bootstrap DML is exactly allowlisted",
    "does not leak scoped-table DML",
  ]);

  requireFragments(files.grantSql, loaded.grantSql, [
    "d2_fb1_bootstrap_base_role",
    "GRANT USAGE ON SCHEMA public, app TO :\"d2_fb1_bootstrap_base_role\";",
    "GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO :\"d2_fb1_bootstrap_base_role\";",
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :\"d2_fb1_bootstrap_base_role\";",
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :\"d2_fb1_bootstrap_base_role\";",
    "REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_phone_history FROM :\"d2_fb1_bootstrap_base_role\";",
    "REVOKE SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts FROM :\"d2_fb1_bootstrap_base_role\";",
  ]);
  forbidFragments(files.grantSql, loaded.grantSql, [
    "BYPASSRLS",
    "ALTER ROLE",
    "app_owner",
    "/opt/env",
    "api.prod",
    "webapp.prod",
    "bcb_webapp_prod",
    "bcb_webapp_dev",
  ]);

  requireFragments(files.forceSql, loaded.forceSql, [
    "phase4_bootstrap_base_role_nobypassrls_not_staff_member",
    "phase4_bootstrap_base_role_can_close_phone_history",
    "phase4_bootstrap_base_role_user_phone_history_dml",
    "phase4_bootstrap_base_role_platform_user_contacts_dml",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.user_phone_history', 'SELECT')",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.user_phone_history', 'INSERT')",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.user_phone_history', 'UPDATE')",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'SELECT')",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'INSERT')",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'UPDATE')",
    "phase4_owner_role_bypassrls",
    "phase4_owner_role_can_update_user_phone_history",
  ]);
  forbidFragments(files.forceSql, loaded.forceSql, [
    "/opt/env",
    "api.prod",
    "webapp.prod",
    "bcb_webapp_prod",
    "bcb_webapp_dev",
  ]);

  requireFragments(files.phase4ForceCheck, loaded.phase4ForceCheck, [
    "phase4_bootstrap_base_role_user_phone_history_dml",
    "phase4_bootstrap_base_role_platform_user_contacts_dml",
    "has_table_privilege(:'phase4_bootstrap_base_role', 'public.platform_user_contacts', 'UPDATE')",
  ]);

  requireFragments(files.p2bSql, loaded.p2bSql, [
    "CREATE OR REPLACE FUNCTION app.close_active_user_phone_history(p_user uuid) RETURNS void",
    "SECURITY DEFINER",
    "UPDATE public.user_phone_history SET valid_to = now()",
    "WHERE platform_user_id = p_user AND valid_to IS NULL",
    "AND (app.current_patient_user_id() IS NULL OR platform_user_id = app.current_patient_user_id())",
    "ALTER FUNCTION app.close_active_user_phone_history(uuid) OWNER TO :\"p2_b_owner_role\";",
    "GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO :\"p2_b_staff_role\", :\"p2_b_patient_role\";",
  ]);

  requireFragments(files.phoneHistoryRepo, loaded.phoneHistoryRepo, [
    "buildDbPrincipalApplyOptionsFromEnv(process.env).mode",
    "if (principalMode === \"locked\")",
    "\"SELECT app.close_active_user_phone_history($1::uuid)\"",
    "getCurrentDbPrincipalOrganizationId() ?? null",
    "INSERT INTO user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source, organization_id)",
  ]);
  requireBlockFragments(
    `${files.phoneHistoryRepo} locked close branch`,
    loaded.phoneHistoryRepo,
    "if (principalMode === \"locked\")",
    "const p = opts.newPhoneNormalized?.trim();",
    [
      "SELECT app.close_active_user_phone_history($1::uuid)",
      "UPDATE user_phone_history SET valid_to = now()",
    ],
  );

  requireFragments(files.contactsRepo, loaded.contactsRepo, [
    "getCurrentDbPrincipalOrganizationId",
    "const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;",
    "organizationId,",
    "organizationId: sql`COALESCE(${platformUserContacts.organizationId}, EXCLUDED.organization_id)`",
  ]);

  requireFragments(files.userByPhoneRepo, loaded.userByPhoneRepo, [
    "applyPlatformUserPhoneHistoryTransition(client, {",
    "source: \"otp\"",
    "trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind)",
  ]);
  requireFragments(files.messengerBindRepo, loaded.messengerBindRepo, [
    "applyPlatformUserPhoneHistoryTransition(client, {",
    "source: \"messenger\"",
  ]);
  requireFragments(files.bookingContactUpsert, loaded.bookingContactUpsert, [
    "upsertBookingFormContactsBestEffort",
    "await service.upsert({",
    "contactType: \"phone\"",
    "source: \"booking\"",
  ]);

  requireFragments(files.rehearsal, loaded.rehearsal, [
    "d2Fb1BootstrapGrantSqlPath",
    "applying D2 FB#1 bootstrap phone-write direct grants to the nonstaff base login",
    "`d2_fb1_bootstrap_base_role=${patientLoginRole}`",
    "function provePhoneHistoryTransitionUnderForce()",
    "proving FB#1 through the webapp phone-history repository path",
    "pnpm\", [\"--dir\", \"apps/webapp\", \"exec\", \"tsx\", \"--tsconfig\", \"tsconfig.json\", \"-e\", appRepoSmoke]",
    "runWithDbStaffPrincipal",
    "runWithDbBootstrapPrincipal",
    "withTransaction",
    "applyPlatformUserPhoneHistoryTransition",
    "D2_FB1_APP_ORG_STAMPED_USER_ID",
    "D2_FB1_APP_NULL_TO_ORG_USER_ID",
    "D2_FB1_APP_BOOTSTRAP_USER_ID",
    "fb1_app_null_to_org_old_closed_ok",
    "fb1_app_bootstrap_new_null_ok",
    "fb1_staff_bootstrap_null_hidden_ok",
    "fb1_bootstrap_org_pii_hidden_ok",
    "FB#1 bootstrap base role cannot write org-stamped phone-history PII.",
  ]);

  requireFragments(files.testDeploySaas, loaded.testDeploySaas, [
    "assert_test_db_owner_ready",
    "discover_webapp_migrator_role",
    "grant_migrator_owner_membership",
    "revoke_migrator_membership",
    "run_test_db_owner_sql_file",
    "MIGRATOR_OWNER_MEMBERSHIP_ADDED=0",
    "MIGRATOR_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0",
    "cleanup_elevation(){",
    "cleanup_exit(){",
    "trap cleanup_exit EXIT",
    "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB';",
    "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_users';",
    "SELECT current_user || '|' || current_database();",
    "SELECT pg_has_role('$role_name', '$DBROLE', 'member');",
    "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$DBROLE';",
    "SELECT pg_has_role('$MIGRATOR_ROLE', '$DBROLE', 'member');",
    "MIGRATOR_OWNER_MEMBERSHIP_ADDED=1",
    "MIGRATOR_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=1",
    "printf 'SET ROLE \"%s\";\\n' \"$DBROLE\"",
    "sudo -u deploy cat \"$sql_file\"",
    "| sudo -u postgres psql -d \"$DB\" -X -v ON_ERROR_STOP=1",
    "run_test_db_owner_sql_file \"$DEPLOY_REPO/$DATAFIX\"",
    "MIGRATOR_ROLE=\"$(discover_webapp_migrator_role)\"",
    "grant_migrator_owner_membership \"$MIGRATOR_ROLE\"",
    "export PGOPTIONS='-c role=$DBROLE'",
    "cleanup_elevation",
  ]);
  requireBlockFragments(
    `${files.testDeploySaas} cleanup elevation contract`,
    loaded.testDeploySaas,
    "\ncleanup_elevation(){",
    "}",
    ["revoke_migrator_membership", "revoke_bypass"],
  );
  requireBlockFragments(
    `${files.testDeploySaas} cleanup EXIT contract`,
    loaded.testDeploySaas,
    "\ncleanup_exit(){",
    "}",
    [
      "local original_status=$?",
      "cleanup_elevation",
      "if [ \"$original_status\" -eq 0 ] && [ \"$cleanup_status\" -ne 0 ]; then",
      "exit \"$cleanup_status\"",
      "exit \"$original_status\"",
    ],
  );
  forbidFragments(files.testDeploySaas, loaded.testDeploySaas, [
    "psql \\\"\\$DATABASE_URL\\\" -v ON_ERROR_STOP=1 -f '$DATAFIX'",
    "psql \\\"\\$DATABASE_URL\\\" -v ON_ERROR_STOP=1 -f \"$DATAFIX\"",
  ]);
  assertCleanupIsNotBestEffort(loaded.testDeploySaas);
  assertPreExistingMigratorMembershipFails(loaded.testDeploySaas);

  assertBootstrapOldHistorySeedNull(loaded.rehearsal);
  requireBlockFragments(
    `${files.rehearsal} fb1_staff_bootstrap_null_hidden_ok assertion`,
    loaded.rehearsal,
    "AS fb1_staff_bootstrap_null_hidden_ok",
    "\\gset",
    ["WHERE id = ${quoteLiteral(bootstrapOldHistoryId)}::uuid"],
  );
  requireBlockFragments(
    `${files.rehearsal} fb1_bootstrap_org_pii_hidden_ok assertion`,
    loaded.rehearsal,
    "AS fb1_bootstrap_org_pii_hidden_ok",
    "\\gset",
    ["WHERE id = ${quoteLiteral(orgOldHistoryId)}::uuid"],
  );
  requireBlockFragments(
    `${files.rehearsal} bootstrap forbidden org-stamped insert`,
    loaded.rehearsal,
    "\\set ON_ERROR_STOP off\nINSERT INTO public.user_phone_history",
    "\\set ON_ERROR_STOP on",
    ["bootstrapForbiddenHistoryId", "${quoteLiteral(defaultOrgId)}::uuid"],
  );
  requireBlockFragments(
    `${files.rehearsal} app repository smoke`,
    loaded.rehearsal,
    "const appRepoSmoke = String.raw`",
    "D2_FB1_MARKER: marker,",
    [
      "import { withTransaction } from \"./src/infra/db/withClient\";",
      "import { applyPlatformUserPhoneHistoryTransition } from \"./src/infra/repos/pgPhoneHistory\";",
      "runWithDbStaffPrincipal",
      "runWithDbBootstrapPrincipal",
      "newPhoneNormalized: marker + \":fb1:app:null-to-org:new\"",
      "newPhoneNormalized: marker + \":fb1:app:bootstrap:new\"",
      "DATABASE_URL_STAFF: fullScratchStaffUrl",
      "DATABASE_URL_NONSTAFF: fullScratchPatientUrl",
      "DB_PRINCIPAL_CONTEXT_MODE: \"locked\"",
    ],
  );

  requireFragments(files.r2Smoke, loaded.r2Smoke, [
    "staff_puc_null_hidden_ok",
    "staff_uph_null_hidden_ok",
    "bootstrap_puc_org_a_hidden_ok",
    "bootstrap_uph_null_write_ok",
    "bootstrap (no-context, non-staff) reads/writes only NULL-org rows",
  ]);

  requireFragments(files.doc, loaded.doc, [
    "# D2 FB#1 bootstrap phone-write closure",
    "Repo/scratch-safe evidence package",
    "does not claim final D2 exit",
    "deploy/postgres/d2-fb1-bootstrap-phone-write-grants.sql",
    "phase4_bootstrap_base_role_user_phone_history_dml",
    "phase4_bootstrap_base_role_platform_user_contacts_dml",
    "applyPlatformUserPhoneHistoryTransition",
    "pre-existing NULL",
    "org-stamped rows",
    "staff cannot see bootstrap NULL phone-history PII",
    "bootstrap cannot",
    "org-stamped phone-history PII",
    "Future owner-authorized strict+FORCE production-topology gate",
  ]);

  assertPackageScript(loaded.packageJson);
}

if (process.argv.includes("--self-test")) {
  const cases = [
    {
      grantSql: read(files.grantSql).replace(
        "GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :\"d2_fb1_bootstrap_base_role\";",
        "-- removed by self-test",
      ),
    },
    {
      forceSql: read(files.forceSql).replace("phase4_bootstrap_base_role_user_phone_history_dml", "phase4_missing"),
    },
    {
      phoneHistoryRepo: read(files.phoneHistoryRepo).replace(
        "SELECT app.close_active_user_phone_history($1::uuid)",
        "UPDATE user_phone_history SET valid_to = now()",
      ),
    },
    {
      rehearsal: read(files.rehearsal).replaceAll("runWithDbBootstrapPrincipal", "runWithoutBootstrapPrincipal"),
    },
    {
      rehearsal: read(files.rehearsal).replaceAll("fb1_bootstrap_org_pii_hidden_ok", "fb1_bootstrap_org_pii_missing"),
    },
    {
      rehearsal: read(files.rehearsal).replace(
        "(${quoteLiteral(bootstrapOldHistoryId)}::uuid, ${quoteLiteral(bootstrapUserId)}::uuid, ${quoteLiteral(`${marker}:fb1:bootstrap:old`)}, now(), NULL, 'otp', NULL)",
        "(${quoteLiteral(bootstrapOldHistoryId)}::uuid, ${quoteLiteral(bootstrapUserId)}::uuid, ${quoteLiteral(`${marker}:fb1:bootstrap:old`)}, now(), NULL, 'otp', ${quoteLiteral(defaultOrgId)}::uuid)",
      ),
    },
    {
      rehearsal: read(files.rehearsal).replace(
        "AS fb1_staff_bootstrap_null_hidden_ok\nFROM public.user_phone_history\nWHERE id = ${quoteLiteral(bootstrapOldHistoryId)}::uuid",
        "AS fb1_staff_bootstrap_null_hidden_ok\nFROM public.user_phone_history\nWHERE id = ${quoteLiteral(orgOldHistoryId)}::uuid",
      ),
    },
    {
      rehearsal: read(files.rehearsal).replace(
        "AS fb1_bootstrap_org_pii_hidden_ok\nFROM public.user_phone_history\nWHERE id = ${quoteLiteral(orgOldHistoryId)}::uuid",
        "AS fb1_bootstrap_org_pii_hidden_ok\nFROM public.user_phone_history\nWHERE id = ${quoteLiteral(bootstrapOldHistoryId)}::uuid",
      ),
    },
    {
      rehearsal: read(files.rehearsal).replace(
        "VALUES (${quoteLiteral(bootstrapForbiddenHistoryId)}::uuid, ${quoteLiteral(bootstrapUserId)}::uuid, ${quoteLiteral(`${marker}:fb1:bootstrap:forbidden-org`)}, now(), now(), 'otp', ${quoteLiteral(defaultOrgId)}::uuid);",
        "VALUES (${quoteLiteral(orgOldHistoryId)}::uuid, ${quoteLiteral(bootstrapUserId)}::uuid, ${quoteLiteral(`${marker}:fb1:bootstrap:forbidden-org`)}, now(), now(), 'otp', ${quoteLiteral(defaultOrgId)}::uuid);",
      ),
    },
    {
      rehearsal: read(files.rehearsal).replace(
        "VALUES (${quoteLiteral(bootstrapForbiddenHistoryId)}::uuid, ${quoteLiteral(bootstrapUserId)}::uuid, ${quoteLiteral(`${marker}:fb1:bootstrap:forbidden-org`)}, now(), now(), 'otp', ${quoteLiteral(defaultOrgId)}::uuid);",
        "VALUES (${quoteLiteral(bootstrapForbiddenHistoryId)}::uuid, ${quoteLiteral(bootstrapUserId)}::uuid, ${quoteLiteral(`${marker}:fb1:bootstrap:forbidden-org`)}, now(), now(), 'otp', NULL);",
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        "run_test_db_owner_sql_file \"$DEPLOY_REPO/$DATAFIX\"",
        "sudo -u deploy bash -lc \"cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && psql \\\"\\$DATABASE_URL\\\" -v ON_ERROR_STOP=1 -f '$DATAFIX'\"",
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace("trap cleanup_exit EXIT", "trap revoke_bypass EXIT"),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        "trap cleanup_exit EXIT   # NEVER leave BYPASSRLS or owner-role membership on",
        "# trap removed by self-test",
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        "sudo -u postgres psql -v ON_ERROR_STOP=1 -c \"ALTER ROLE \\\"$DBROLE\\\" NOBYPASSRLS;\"",
        "sudo -u postgres psql -v ON_ERROR_STOP=1 -c \"ALTER ROLE \\\"$DBROLE\\\" NOBYPASSRLS;\" || true",
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        "if sudo -u postgres psql -v ON_ERROR_STOP=1 -c \"REVOKE \\\"$DBROLE\\\" FROM \\\"$MIGRATOR_ROLE\\\";\"; then\n      MIGRATOR_OWNER_MEMBERSHIP_ADDED=0",
        "MIGRATOR_OWNER_MEMBERSHIP_ADDED=0\n    if sudo -u postgres psql -v ON_ERROR_STOP=1 -c \"REVOKE \\\"$DBROLE\\\" FROM \\\"$MIGRATOR_ROLE\\\";\"; then",
      ),
    },
    {
      testDeploySaas: read(files.testDeploySaas).replace(
        `if [ "$membership_exists" = "t" ]; then
    echo "FATAL: role $role_name already has membership in $DBROLE before deploy; clean up this pre-existing residue before rerunning deploy-test-saas.sh" >&2
    exit 1
  fi`,
        `[ "$membership_exists" = "t" ] && return 0`,
      ),
    },
  ];
  let detected = 0;
  for (const testCase of cases) {
    try {
      runChecks(testCase);
    } catch {
      detected += 1;
    }
  }
  if (detected === cases.length) {
    console.log("check-d2-fb1-bootstrap-phone-write self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect all D2 contract regressions");
}

try {
  runChecks();
  console.log("check-d2-fb1-bootstrap-phone-write: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-d2-fb1-bootstrap-phone-write: ${message}`);
  process.exit(1);
}
