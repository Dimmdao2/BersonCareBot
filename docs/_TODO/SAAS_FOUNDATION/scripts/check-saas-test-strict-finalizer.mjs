#!/usr/bin/env node

import { readFileSync } from "node:fs";

const files = {
  finalizer: "deploy/postgres/test-strict-rls-finalizer.sql",
  force: "deploy/postgres/phase4-force-rls-cutover.sql",
  invites: "deploy/postgres/organization-member-invites-rls.sql",
  courses: "deploy/postgres/patient-course-assignment-wall.sql",
  appWorker: "deploy/postgres/phase4-app-worker-narrow-rls.sql",
  patientPlayback: "deploy/postgres/patient-media-playback-telemetry-accessors.sql",
  hard: "deploy/host/deploy-test-saas.sh",
  codeOnly: "deploy/host/deploy-test.sh",
  prod: "deploy/host/deploy-prod.sh",
  webappProd: "deploy/host/deploy-webapp-prod.sh",
  fixtureValidator: "deploy/host/validate-saas-product-smoke-fixture.sh",
  protocol: "docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md",
  patientTestResults: "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
};

function fail(message) {
  throw new Error(message);
}

function load(overrides = {}) {
  return Object.fromEntries(Object.entries(files).map(([key, path]) => [
    key,
    overrides[key] ?? readFileSync(path, "utf8"),
  ]));
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(`${label} missing required fragment: ${fragment}`);
  }
}

function requireOrdered(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor);
    if (index < 0) fail(`${label} missing ordered fragment after ${cursor}: ${fragment}`);
    cursor = index + fragment.length;
  }
}

function methodSlice(label, text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) fail(`${label} missing method start: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (endIndex < 0) fail(`${label} missing method end: ${end}`);
  return text.slice(startIndex, endIndex);
}

function runChecks(overrides = {}) {
  const loaded = load(overrides);

  requireFragments(files.finalizer, loaded.finalizer, [
    "current_database() = :'test_expected_database'",
    "current_database() = 'bersoncarebot_test'",
    "test_allow_disposable_database",
    "^bcb_saas_[a-z0-9_]*(scratch|rehearsal)_[a-z0-9_]+$",
    "current_database() !~ '(prod|test|dev)'",
    "\\set phase4_enforce_locked_context 1",
    "\\ir phase4-locked-helper-rls-policies.sql",
    "\\ir organization-member-invites-rls.sql",
    "\\ir patient-course-assignment-wall.sql",
    "\\ir phase4-app-worker-narrow-rls.sql",
    "\\ir patient-media-playback-telemetry-accessors.sql",
    "\\ir phase4-force-rls-cutover.sql",
    "test_strict_specialized_policy_assertions",
    "test_strict_courses_assignment_policy_missing",
    "test_strict_invites_fail_closed_policy_missing",
    "test_strict_app_worker_media_policy_missing",
  ]);
  requireOrdered(files.finalizer, loaded.finalizer, [
    "current_database() = 'bersoncarebot_test'",
    "\\ir phase4-locked-helper-rls-policies.sql",
    "\\ir organization-member-invites-rls.sql",
    "\\ir patient-course-assignment-wall.sql",
    "\\ir phase4-app-worker-narrow-rls.sql",
    "\\ir patient-media-playback-telemetry-accessors.sql",
    "\\ir phase4-force-rls-cutover.sql",
    "test_strict_specialized_policy_assertions",
  ]);

  requireFragments(files.invites, loaded.invites, [
    "app.is_staff()",
    "app.current_org_id() IS NOT NULL",
    '"organization_id" = app.current_org_id()',
    "EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND rolbypassrls AND NOT rolcanlogin)",
    "ALTER FUNCTION app.lookup_pending_org_invite(text) OWNER TO app_owner",
    "ALTER FUNCTION app.accept_org_invite(text, uuid, text) OWNER TO app_owner",
    "GRANT SELECT, UPDATE ON TABLE public.organization_member_invites TO app_owner",
  ]);
  if (loaded.invites.includes("NULLIF(current_setting('app.org', true), '') IS NULL")) {
    fail(`${files.invites} still contains the fail-open NULL-context policy branch`);
  }
  requireFragments(files.courses, loaded.courses, [
    "app.current_patient_user_id() IS NOT NULL",
    'FROM "public"."treatment_program_instances" AS "b4course_instance"',
    '"b4course_instance"."template_id" = "courses"."program_template_id"',
    "GRANT SELECT ON TABLE public.courses TO app_patient",
  ]);
  requireFragments(files.appWorker, loaded.appWorker, [
    "pg_has_role(current_user, 'app_worker', 'member')",
    'ON "public"."media_files"',
    'ON "public"."media_transcode_jobs"',
    "GRANT EXECUTE ON FUNCTION app.is_staff() TO app_worker;",
    "GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_worker;",
    "GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_worker;",
    "REVOKE EXECUTE ON FUNCTION app.is_staff() FROM app_worker;",
    "REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM app_worker;",
    "REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM app_worker;",
  ]);
  for (const forbidden of [
    "GRANT EXECUTE ON FUNCTION app.install_signed_context",
    "GRANT EXECUTE ON FUNCTION app.reset_principal_context() TO app_worker",
    "GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO app_worker",
    "GRANT SELECT ON TABLE",
    "GRANT INSERT ON TABLE",
    "GRANT UPDATE ON TABLE",
    "GRANT DELETE ON TABLE",
  ]) {
    if (loaded.appWorker.includes(forbidden)) {
      fail(`${files.appWorker} contains forbidden privilege expansion: ${forbidden}`);
    }
  }

  requireFragments(files.patientPlayback, loaded.patientPlayback, [
    "GRANT SELECT ON TABLE public.media_files TO app_owner",
    "GRANT INSERT, UPDATE ON TABLE public.media_playback_stats_hourly TO app_owner",
    "GRANT INSERT ON TABLE public.media_playback_resolution_events TO app_owner",
    "ALTER FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)",
    "ALTER FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)",
    "OWNER TO app_owner",
    "FROM app_staff",
    "TO app_patient",
  ]);
  if (loaded.patientPlayback.includes("TO app_staff")) {
    fail(`${files.patientPlayback} still grants telemetry accessor execution to app_staff`);
  }
  if (/GRANT\s+(?:INSERT|UPDATE|DELETE)[^;]*\bTO\s+app_(?:staff|patient)\b/i.test(loaded.patientPlayback)) {
    fail(`${files.patientPlayback} grants runtime roles direct playback telemetry DML`);
  }

  requireFragments(files.prod, loaded.prod, [
    "PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS=deploy/postgres/patient-media-playback-telemetry-accessors.sql",
    'require_file "${PROJECT_ROOT}/${PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS}" "Patient media playback telemetry accessor overlay"',
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS}"',
  ]);
  requireOrdered(files.prod, loaded.prod, [
    "pnpm --dir apps/webapp run migrate",
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS}"',
    "webapp-post-migrate-schema-check.sh",
  ]);
  requireFragments(files.webappProd, loaded.webappProd, [
    'require_file "${PROJECT_ROOT}/deploy/postgres/patient-media-playback-telemetry-accessors.sql" "Patient media playback telemetry accessor overlay"',
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-media-playback-telemetry-accessors.sql"',
  ]);
  requireOrdered(files.webappProd, loaded.webappProd, [
    "pnpm --dir apps/webapp run migrate",
    'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-media-playback-telemetry-accessors.sql"',
    "webapp-post-migrate-schema-check.sh",
  ]);

  requireFragments(files.force, loaded.force, [
    "v_expected_count <> 163",
    "phase4_force_target_resolution_mismatch",
    "relation.relrowsecurity",
    "relation.relforcerowsecurity",
    "phase4_force_post_assert_failed",
  ]);
  requireOrdered(files.force, loaded.force, [
    "ALTER TABLE %s FORCE ROW LEVEL SECURITY;",
    "phase4_force_post_assert_failed",
    "COMMIT;",
  ]);

  requireFragments(files.hard, loaded.hard, [
    "must use DB_PRINCIPAL_CONTEXT_MODE=locked for strict TEST",
    "TEST_STRICT_RLS_FINALIZER=deploy/postgres/test-strict-rls-finalizer.sql",
    "apply_test_strict_rls_finalizer",
    "run_strict_post_migration_closure",
    "SAAS_ISOLATION_TELEMETRY=deploy/postgres/saas-isolation-telemetry.sql",
    "install_saas_isolation_telemetry_overlay",
    'webapp_runtime_role="$(discover_webapp_bootstrap_base_role)"',
    'api_runtime_role="$(discover_api_runtime_role)"',
    '-v telemetry_webapp_runtime_role="$webapp_runtime_role"',
    '-v telemetry_api_runtime_role="$api_runtime_role"',
    "--strict-preflight",
    "--post-migration-closure",
    "--mode=locked",
    "/run/bersoncarebot/saas-smoke.fixture",
    "LOCKED_SMOKE_FIXTURE_VALIDATOR=deploy/host/validate-saas-product-smoke-fixture.sh",
    'bash "$validator" --validate "$fixture_path" "$SRC_REPO" "$DEPLOY_REPO"',
    'sudo -u deploy test -r "$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL"',
    'sudo install -d -o deploy -g deploy -m 0700 "$smoke_dir"',
    'sudo -u deploy node "$DEPLOY_REPO/docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs"',
  ]);
  requireOrdered(files.hard, loaded.hard, [
    "run_locked_product_smoke(){",
    "assert_locked_product_smoke_fixture_ready",
    'fixture_path="$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL"',
    'sudo -u deploy node "$DEPLOY_REPO/docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs"',
    '--fixture-file="$fixture_path"',
  ]);

  requireFragments(files.fixtureValidator, loaded.fixtureValidator, [
    'canonical_fixture="$(realpath -e -- "$fixture_path")"',
    '[ "$fixture_path" = "$canonical_fixture" ]',
    '"$canonical_source"|"$canonical_source"/*|"$canonical_deploy"|"$canonical_deploy"/*)',
    "stat -Lc '%u:%g:%a'",
    '[ "$metadata" = "$expected_uid:$expected_gid:$expected_mode" ]',
    "getent group deploy",
    'validate_fixture "$2" "$3" "$4" 0 "$deploy_gid" 640',
    "self-test accepted in-repo fixture",
    "self-test accepted symlink-parent fixture",
    "self-test accepted unsafe mode",
    "self-test accepted unsafe owner",
    "self-test accepted unsafe group",
  ]);
  requireOrdered(files.hard, loaded.hard, [
    'log "stop TEST writers before restore/migration"',
    'log "restore $DB',
    'log "migrate (temp BYPASSRLS)"',
    'log "B1 doctor/admin identity assertion"',
    "run_strict_post_migration_closure",
  ]);

  requireFragments(files.codeOnly, loaded.codeOnly, [
    "assert_locked_test_mode",
    "DB_PRINCIPAL_CONTEXT_MODE=locked",
    "STRICT_CLOSURE=deploy/host/deploy-test-saas.sh",
    "ALTER ROLE \\\"$DBROLE\\\" BYPASSRLS",
    "cleanup_elevation",
    'bash "$DEPLOY_REPO/$STRICT_CLOSURE" --strict-preflight',
    'bash "$DEPLOY_REPO/$STRICT_CLOSURE" --post-migration-closure',
  ]);
  requireOrdered(files.codeOnly, loaded.codeOnly, [
    'for u in "${UNITS[@]}"; do sudo systemctl stop',
    "pnpm migrate",
    "cleanup_elevation",
    'bash "$DEPLOY_REPO/$STRICT_CLOSURE" --post-migration-closure',
  ]);

  requireFragments(files.protocol, loaded.protocol, [
    "Both TEST env files must use\n   `DB_PRINCIPAL_CONTEXT_MODE=locked`",
    "0177 remains historical compatibility provenance",
    "TEST walls are never switched off",
    "mandatory locked A1/product smoke",
    "Strict+FORCE is mandatory in both supported TEST deploy paths",
  ]);
  if (loaded.protocol.includes("Do not bundle strict/FORCE into the fresh-dump dormant rehearsal.")) {
    fail(`${files.protocol} still blesses dormant TEST end-state`);
  }

  const patientResultDetails = methodSlice(
    files.patientTestResults,
    loaded.patientTestResults,
    "async listResultDetailsForInstance(",
    "async listPendingEvaluationResultsForPatient(",
  );
  requireFragments(files.patientTestResults, patientResultDetails, [
    "itemSnapshot: itemTable.snapshot",
    "clinicalTestTitleFromInstanceSnapshot(r.itemSnapshot, r.result.testId)",
    ".where(eq(stageTable.instanceId, instanceId))",
  ]);
  if (patientResultDetails.includes(".innerJoin(clinicalTests")) {
    fail(`${files.patientTestResults} patient result details reopened the restricted clinical-test catalog`);
  }
}

function runSelfTest() {
  const baseline = load();
  const cases = [
    { finalizer: baseline.finalizer.replace("\\set phase4_enforce_locked_context 1", "") },
    { finalizer: baseline.finalizer.replace("\\ir phase4-app-worker-narrow-rls.sql", "") },
    { invites: baseline.invites.replace("ALTER FUNCTION app.lookup_pending_org_invite(text) OWNER TO app_owner", "") },
    { invites: `${baseline.invites}\nNULLIF(current_setting('app.org', true), '') IS NULL\n` },
    { courses: baseline.courses.replaceAll('"b4course_instance"."template_id" = "courses"."program_template_id"', "TRUE") },
    { appWorker: baseline.appWorker.replaceAll("pg_has_role(current_user, 'app_worker', 'member')", "FALSE") },
    { appWorker: baseline.appWorker.replace("GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_worker;", "") },
    { appWorker: `${baseline.appWorker}\nGRANT EXECUTE ON FUNCTION app.reset_principal_context() TO app_worker;\n` },
    { finalizer: baseline.finalizer.replace("\\ir patient-media-playback-telemetry-accessors.sql", "") },
    { patientPlayback: `${baseline.patientPlayback}\nGRANT INSERT ON public.media_playback_stats_hourly TO app_patient;\n` },
    { patientPlayback: `${baseline.patientPlayback}\nGRANT EXECUTE ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean) TO app_staff;\n` },
    { prod: baseline.prod.replace('psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS}"', "") },
    { webappProd: baseline.webappProd.replace('psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-media-playback-telemetry-accessors.sql"', "") },
    { force: baseline.force.replace("v_expected_count <> 163", "v_expected_count < 1") },
    { hard: baseline.hard.replace('\nrun_strict_post_migration_closure\nlog "DONE', '\nlog "DONE') },
    { hard: baseline.hard.replaceAll("--mode=locked", "--mode=dormant") },
    { hard: baseline.hard.replace('webapp_runtime_role="$(discover_webapp_bootstrap_base_role)"', 'webapp_runtime_role="$(discover_webapp_migrator_role)"') },
    { hard: baseline.hard.replaceAll('api_runtime_role="$(discover_api_runtime_role)"', 'api_runtime_role="$(discover_webapp_bootstrap_base_role)"') },
    { hard: baseline.hard.replace("  assert_locked_product_smoke_fixture_ready\n  fixture_path=", "  fixture_path=") },
    { fixtureValidator: baseline.fixtureValidator.replace('[ "$fixture_path" = "$canonical_fixture" ]', "true") },
    { fixtureValidator: baseline.fixtureValidator.replace('"$canonical_source"|"$canonical_source"/*|"$canonical_deploy"|"$canonical_deploy"/*)', '"$canonical_source-never")') },
    { fixtureValidator: baseline.fixtureValidator.replace('[ "$metadata" = "$expected_uid:$expected_gid:$expected_mode" ]', "true") },
    { codeOnly: baseline.codeOnly.replace('bash "$DEPLOY_REPO/$STRICT_CLOSURE" --post-migration-closure', "") },
    { protocol: `${baseline.protocol}\nDo not bundle strict/FORCE into the fresh-dump dormant rehearsal.\n` },
    {
      patientTestResults: baseline.patientTestResults.replace(
        ".innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))\n        .where(eq(stageTable.instanceId, instanceId))",
        ".innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))\n        .innerJoin(clinicalTests, eq(resultTable.testId, clinicalTests.id))\n        .where(eq(stageTable.instanceId, instanceId))",
      ),
    },
  ];
  const missed = [];
  for (const [index, broken] of cases.entries()) {
    try {
      runChecks(broken);
      missed.push(index + 1);
    } catch {
      // Expected.
    }
  }
  if (missed.length > 0) fail(`self-test missed broken case(s): ${missed.join(", ")}`);
}

try {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--self-test")) {
    fail("usage: check-saas-test-strict-finalizer.mjs [--self-test]");
  }
  if (process.argv[2] === "--self-test") {
    runSelfTest();
    console.log("check-saas-test-strict-finalizer self-test: OK");
  } else {
    runChecks();
    console.log("check-saas-test-strict-finalizer: OK");
  }
} catch (error) {
  console.error(`check-saas-test-strict-finalizer: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
