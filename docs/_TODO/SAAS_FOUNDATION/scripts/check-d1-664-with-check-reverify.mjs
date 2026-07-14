#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const files = {
  doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_D1_664_WITH_CHECK_REVERIFY.md",
  log: "docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  p05bDoc: "docs/_TODO/SAAS_FOUNDATION/P0_5B_GRANTS.md",
  grantGenerator: "docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs",
  p05bSmoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs",
  p2c1Sql: "deploy/postgres/p2-c1-patient-value-guards.sql",
  p2c1Check: "docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c1-patient-value-guards-sql.mjs",
  p2c1Smoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c1-patient-value-guards.mjs",
  p2c2Sql: "deploy/postgres/p2-c2-patient-value-guards.sql",
  p2c2Check: "docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c2-patient-value-guards-sql.mjs",
  p2c2Smoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs",
  composedSmoke: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-composed-rls-grants-value-guards.mjs",
  packageJson: "package.json",
};

const scratchSmokeScripts = [
  files.p2c1Smoke,
  files.p2c2Smoke,
  files.composedSmoke,
];

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
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
      fail(`${label} must not include forbidden fragment: ${fragment}`);
    }
  }
}

function requireBlockFragments(label, text, startFragment, endFragment, fragments) {
  const startIndex = text.indexOf(startFragment);
  if (startIndex < 0) {
    fail(`${label} missing block start: ${startFragment}`);
  }
  const endIndex = text.indexOf(endFragment, startIndex);
  if (endIndex < 0) {
    fail(`${label} missing block end after start: ${endFragment}`);
  }
  const block = text.slice(startIndex, endIndex + endFragment.length);
  requireFragments(label, block, fragments);
}

function requireEnclosingDoBlockFragments(label, text, anchorFragment, fragments) {
  const anchorIndex = text.indexOf(anchorFragment);
  if (anchorIndex < 0) {
    fail(`${label} missing block anchor: ${anchorFragment}`);
  }
  const startIndex = text.lastIndexOf("DO $$", anchorIndex);
  if (startIndex < 0) {
    fail(`${label} missing enclosing DO block start before anchor: ${anchorFragment}`);
  }
  const endFragment = "\n$$;";
  const endIndex = text.indexOf(endFragment, anchorIndex);
  if (endIndex < 0) {
    fail(`${label} missing enclosing DO block end after anchor: ${anchorFragment}`);
  }
  const block = text.slice(startIndex, endIndex + endFragment.length);
  requireFragments(label, block, fragments);
}

function columnGrantOrThrow(grants, qualifiedName, privilege) {
  const found = grants.find((grant) => grant.qualifiedName === qualifiedName && grant.privilege === privilege);
  if (!found) fail(`Expected ${privilege} column grant for ${qualifiedName}`);
  return found;
}

function tableGrantOrThrow(tables, qualifiedName) {
  const found = tables.find((table) => table.qualifiedName === qualifiedName);
  if (!found) fail(`Expected app_patient table grant metadata for ${qualifiedName}`);
  return found;
}

function assertExactColumns(label, actual, expected) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (actualSorted.length !== expectedSorted.length || actualSorted.some((value, index) => value !== expectedSorted[index])) {
    fail(`${label} columns mismatch. actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPASSWORD",
    "PGPASSFILE",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGUSER",
  ]) {
    delete env[key];
  }
  return env;
}

function runNodeScript(relativePath) {
  const result = spawnSync("node", [relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    stdio: "pipe",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${relativePath} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${relativePath} failed with ${result.status ?? "unknown status"}`);
}

async function loadGrantMetadata() {
  const modulePath = path.join(__dirname, "p0-5b-grants-sql.mjs");
  const { getAppPatientGrantTables, appPatientColumnGrants } = await import(modulePath);
  return {
    appPatientGrantTables: getAppPatientGrantTables(),
    appPatientColumnGrants,
  };
}

async function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, overrides[key] ?? read(relativePath)]),
  );
  const metadata = overrides.metadata ?? (await loadGrantMetadata());

  requireFragments(files.roadmap, loaded.roadmap, [
    "#664 is DONE — D1 becomes RE-VERIFY, not implement",
    "taskdb #664 = done+sealed (commit `02936c257`)",
    "**`user_channel_preferences.is_preferred_for_auth`**",
    "**`public.treatment_program_events.actor_id`**",
    "D1 scope → independently RE-VERIFY the WITH CHECK",
    "Do NOT re-derive the columns.",
  ]);

  const treatmentEvents = tableGrantOrThrow(metadata.appPatientGrantTables, "public.treatment_program_events");
  if (treatmentEvents.privileges !== "SELECT") {
    fail(`public.treatment_program_events app_patient base grant must be SELECT, got ${treatmentEvents.privileges}`);
  }
  const treatmentEventsInsert = columnGrantOrThrow(
    metadata.appPatientColumnGrants,
    "public.treatment_program_events",
    "INSERT",
  );
  assertExactColumns("public.treatment_program_events INSERT", treatmentEventsInsert.columns, [
    "organization_id",
    "instance_id",
    "event_type",
    "target_type",
    "target_id",
    "payload",
    "reason",
  ]);
  if (treatmentEventsInsert.columns.includes("actor_id")) {
    fail("public.treatment_program_events INSERT column grant must exclude actor_id");
  }

  const channelPreferences = tableGrantOrThrow(metadata.appPatientGrantTables, "public.user_channel_preferences");
  if (channelPreferences.privileges !== "SELECT") {
    fail(`public.user_channel_preferences app_patient base grant must be SELECT, got ${channelPreferences.privileges}`);
  }
  const channelInsert = columnGrantOrThrow(
    metadata.appPatientColumnGrants,
    "public.user_channel_preferences",
    "INSERT",
  );
  const channelUpdate = columnGrantOrThrow(
    metadata.appPatientColumnGrants,
    "public.user_channel_preferences",
    "UPDATE",
  );
  assertExactColumns("public.user_channel_preferences INSERT", channelInsert.columns, [
    "user_id",
    "platform_user_id",
    "channel_code",
    "is_enabled_for_messages",
    "is_enabled_for_notifications",
    "is_preferred_for_auth",
    "updated_at",
  ]);
  assertExactColumns("public.user_channel_preferences UPDATE", channelUpdate.columns, [
    "platform_user_id",
    "is_enabled_for_messages",
    "is_enabled_for_notifications",
    "is_preferred_for_auth",
    "updated_at",
  ]);

  requireFragments(files.grantGenerator, loaded.grantGenerator, [
    "user_channel_preferences: SELECT-only at table level",
    "is_preferred_for_auth",
    "P2-C2 re-adds that column narrowly",
    "treatment_program_events: SELECT (whole-table) + COLUMN-LEVEL INSERT",
    "actor_id",
    "Excluded",
  ]);

  requireFragments(files.p05bDoc, loaded.p05bDoc, [
    "`user_channel_preferences.is_preferred_for_auth`",
    "`treatment_program_events.actor_id`",
    "`user_channel_preferences` | INSERT",
    "`user_channel_preferences` | UPDATE",
    "`treatment_program_events` | INSERT",
    "`actor_id`",
    "P2-C2 grant reopen",
    "trigger smoke proves the allowed-channel/own-row value constraints",
    "permission denied for table",
    "explicitly INSERTing an `actor_id` value",
  ]);

  requireFragments(files.p2c1Sql, loaded.p2c1Sql, [
    "CREATE OR REPLACE FUNCTION app.p2_c1_guard_treatment_program_events()",
    "IF NEW.actor_id IS NULL THEN",
    "NEW.actor_id := v_patient_user_id;",
    "ELSIF NEW.actor_id IS DISTINCT FROM v_patient_user_id THEN",
    "RAISE EXCEPTION 'patient_treatment_event_actor_mismatch';",
    "instance.patient_user_id = v_patient_user_id",
    "instance.organization_id = v_org_id",
    "NEW.organization_id = v_org_id",
    "patient_treatment_event_instance_not_owned",
    "patient_treatment_event_shape_forbidden",
    "NOT app.is_staff()",
  ]);

  requireFragments(files.p2c1Check, loaded.p2c1Check, [
    "NEW.actor_id := v_patient_user_id",
    "NEW.actor_id IS DISTINCT FROM v_patient_user_id",
    "patient_treatment_event_shape_forbidden",
    "SECURITY DEFINER",
  ]);

  requireFragments(files.p2c1Smoke, loaded.p2c1Smoke, [
    "SELECT (actor_id =",
    "p2_c1_event_actor_filled",
    "CONFIRMED: patient cannot write treatment_program_events for cross-org/cross-patient instance.",
    "patient_treatment_event_instance_not_owned",
    "CONFIRMED: patient cannot forge treatment_program_events.actor_id.",
    "CONFIRMED: patient cannot write forbidden treatment event shape.",
    "SET SESSION AUTHORIZATION ${staffIdent}",
    "item_removed",
    "P2-C1 patient value guards smoke: all assertions CONFIRMED.",
  ]);

  requireBlockFragments(
    `${files.p2c1Smoke} cross-org treatment_program_events proof`,
    loaded.p2c1Smoke,
    "SET SESSION AUTHORIZATION ${patientIdent};",
    "\\echo 'CONFIRMED: patient cannot write treatment_program_events for cross-org/cross-patient instance.'",
    [
      "app.install_signed_context(",
      "${quoteLiteral(orgA)}::uuid",
      "${quoteLiteral(patientA)}::uuid",
      "INSERT INTO public.treatment_program_events",
      "${quoteLiteral(orgB)}::uuid",
      "${quoteLiteral(instanceB)}::uuid",
      "IF SQLERRM IS DISTINCT FROM 'patient_treatment_event_instance_not_owned' THEN",
    ],
  );

  requireFragments(files.p2c2Sql, loaded.p2c2Sql, [
    "CREATE OR REPLACE FUNCTION app.p2_c2_guard_user_channel_preferences()",
    "app.p2_c2_user_channel_preference_is_owned(OLD.user_id, OLD.platform_user_id)",
    "app.p2_c2_user_channel_preference_is_owned(NEW.user_id, NEW.platform_user_id)",
    "NEW.is_preferred_for_auth",
    "NEW.channel_code NOT IN ('telegram', 'max', 'email', 'sms')",
    "patient_channel_preference_auth_channel_forbidden",
    "patient_channel_preference_auth_preferred_already_exists",
    "NOT app.is_staff()",
  ]);

  requireFragments(files.p2c2Check, loaded.p2c2Check, [
    "NEW.channel_code NOT IN ('telegram', 'max', 'email', 'sms')",
    "existing_pref.is_preferred_for_auth = true",
    "existing_pref.channel_code IS DISTINCT FROM OLD.channel_code",
    "app.p2_c2_user_channel_preference_is_owned(NEW.user_id, NEW.platform_user_id)",
    "SECURITY DEFINER",
  ]);

  requireFragments(files.p2c2Smoke, loaded.p2c2Smoke, [
    "INSERT INTO public.user_channel_preferences",
    "patient cannot create a second preferred auth channel through a mixed legacy row",
    "patient cannot prefer a non-auth channel",
    "patient cannot insert channel preference for another user",
    "unique index keeps one preferred auth channel per user",
    "patient cannot update preferred auth channel to a non-auth channel",
    "p2_c2_legacy_platform_owned_update_allowed",
    "P2-C2 patient value guards smoke: all assertions CONFIRMED.",
  ]);

  requireEnclosingDoBlockFragments(
    `${files.p2c2Smoke} duplicate preferred auth mixed legacy proof`,
    loaded.p2c2Smoke,
    "RAISE EXCEPTION 'patient created a second preferred auth channel through a mixed legacy row';",
    [
      "INSERT INTO public.user_channel_preferences",
      "is_preferred_for_auth",
      "${quoteLiteral(legacyUserA)}",
      "'email', true",
      "IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_preferred_already_exists' THEN",
    ],
  );

  requireEnclosingDoBlockFragments(
    `${files.p2c2Smoke} non-auth preferred insert proof`,
    loaded.p2c2Smoke,
    "RAISE EXCEPTION 'patient preferred a non-auth channel';",
    [
      "INSERT INTO public.user_channel_preferences",
      "is_preferred_for_auth",
      "'web_push', true",
      "IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_channel_forbidden' THEN",
    ],
  );

  requireEnclosingDoBlockFragments(
    `${files.p2c2Smoke} foreign row insert proof`,
    loaded.p2c2Smoke,
    "RAISE EXCEPTION 'patient inserted channel preference for another user';",
    [
      "INSERT INTO public.user_channel_preferences",
      "is_preferred_for_auth",
      "${quoteLiteral(patientB)}",
      "'sms', false",
      "IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_new_row_not_owned' THEN",
    ],
  );

  requireEnclosingDoBlockFragments(
    `${files.p2c2Smoke} duplicate preferred auth same user proof`,
    loaded.p2c2Smoke,
    "RAISE EXCEPTION 'patient created two preferred auth channels for one user';",
    [
      "INSERT INTO public.user_channel_preferences",
      "is_preferred_for_auth",
      "'sms', true",
      "IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_preferred_already_exists' THEN",
    ],
  );

  requireEnclosingDoBlockFragments(
    `${files.p2c2Smoke} non-auth preferred update proof`,
    loaded.p2c2Smoke,
    "RAISE EXCEPTION 'patient updated preferred auth channel to a non-auth channel';",
    [
      "UPDATE public.user_channel_preferences",
      "SET channel_code = 'web_push'",
      "IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_channel_forbidden' THEN",
    ],
  );

  requireFragments(files.composedSmoke, loaded.composedSmoke, [
    "composed_event_actor_filled",
    "composed proof blocks explicit treatment_program_events.actor_id forgery",
    "composed proof blocks non-auth preferred channel",
    "composed proof blocks other-user channel preference write",
    "generatedRlsTables",
    "P2-C1/C2/C3 patient value guards",
  ]);

  requireFragments(files.doc, loaded.doc, [
    "# D1 #664 WITH CHECK and deferred columns re-verify",
    "taskdb #664 is already done/sealed",
    "`02936c257`",
    "`user_channel_preferences.is_preferred_for_auth`",
    "`public.treatment_program_events.actor_id`",
    "Repo/scratch evidence",
    "Future owner-authorized gates",
    "No prod/test/dev DB",
  ]);

  requireFragments(files.log, loaded.log, [
    "| 2026-07-14 | D1 #664 WITH CHECK and deferred columns re-verify |",
    "`pnpm run check:saas-d1-664-with-check-reverify`",
  ]);

  requireFragments(files.packageJson, loaded.packageJson, [
    "\"check:saas-d1-664-with-check-reverify\"",
    "check-d1-664-with-check-reverify.mjs",
  ]);

  forbidFragments("D1 checker package/doc set", loaded.doc + loaded.log + loaded.packageJson, [
    "/opt/env/bersoncarebot",
    "bcb_webapp_prod",
    "bcb_webapp_test",
    "bcb_webapp_dev",
  ]);
}

async function runSelfTest() {
  const metadata = await loadGrantMetadata();
  const brokenMetadata = {
    ...metadata,
    appPatientColumnGrants: metadata.appPatientColumnGrants.map((grant) =>
      grant.qualifiedName === "public.treatment_program_events" && grant.privilege === "INSERT"
        ? { ...grant, columns: [...grant.columns, "actor_id"] }
        : grant,
    ),
  };

  try {
    await runChecks({ metadata: brokenMetadata });
  } catch {
    console.log("check-d1-664-with-check-reverify self-test: OK");
    return;
  }
  fail("self-test did not detect treatment_program_events.actor_id grant drift");
}

if (process.argv.includes("--self-test")) {
  try {
    await runSelfTest();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check-d1-664-with-check-reverify: ${message}`);
    process.exit(1);
  }
  process.exit(0);
}

try {
  await runChecks();
  if (process.argv.includes("--run-scratch-smokes")) {
    for (const smokeScript of scratchSmokeScripts) {
      console.log(`check-d1-664-with-check-reverify: running ${smokeScript}`);
      runNodeScript(smokeScript);
    }
  }
  console.log("check-d1-664-with-check-reverify: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-d1-664-with-check-reverify: ${message}`);
  process.exit(1);
}
