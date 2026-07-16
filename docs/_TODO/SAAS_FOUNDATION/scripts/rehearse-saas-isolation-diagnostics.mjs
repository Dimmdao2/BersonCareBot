#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createSaasIsolationBackgroundReporter } from "../../../../packages/db-principal/dist/index.js";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
const execute = process.argv.includes("--execute");
const db = args.get("--db") ?? "";
if (!execute || !/^bcb_e1_scratch_[a-z0-9_]+$/.test(db)) {
  throw new Error("usage: --execute --db=bcb_e1_scratch_<suffix>");
}
const operatorRole = `${db}_operator`;
const staleOperatorRole = `${db}_stale`;
const fixedRole = /^[a-z_][a-z0-9_]{0,62}$/;
if (!fixedRole.test(operatorRole) || !fixedRole.test(staleOperatorRole)) {
  throw new Error("scratch operator role is too long/invalid");
}

function postgres(args, input = undefined, allowFailure = false) {
  const result = spawnSync("sudo", ["-u", "postgres", ...args], { encoding: "utf8", input });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout || `command failed: ${args.join(" ")}`);
  return result;
}
function psql(sql, roleDb = db) {
  return postgres(["psql", "-d", roleDb, "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], sql).stdout.trim();
}
function roleExists(role) {
  return postgres(["psql", "-X", "-Atq", "-c", `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}')`]).stdout.trim() === "t";
}
function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
function concurrentWriter() {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-u", "postgres", "psql", "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-Atq"], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `concurrent writer exit ${code}`)));
    child.stdin.end("SET ROLE app_staff; SELECT app.report_saas_isolation_event('rls_denial','webapp','webapp_db_request','unexplained');\n");
  });
}

const ownerExisted = roleExists("saas_telemetry_owner");
const operatorGroupExisted = roleExists("saas_telemetry_operator");
const originalOperatorMembers = operatorGroupExisted
  ? postgres(["psql", "-X", "-Atq", "-c", `
      SELECT member_role.rolname
      FROM pg_auth_members membership
      JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE granted_role.rolname = 'saas_telemetry_operator'
      ORDER BY member_role.rolname
    `]).stdout.trim().split("\n").filter(Boolean)
  : [];
let databaseCreated = false;
let scratchRoleCreated = false;
let staleRoleCreated = false;
try {
  if (postgres(["psql", "-X", "-Atq", "-c", `SELECT 1 FROM pg_database WHERE datname='${db}'`]).stdout.trim()) {
    throw new Error(`scratch database already exists: ${db}`);
  }
  postgres(["createdb", db]);
  databaseCreated = true;
  if (!operatorGroupExisted) {
    postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", "CREATE ROLE saas_telemetry_operator NOLOGIN NOSUPERUSER NOBYPASSRLS"]);
  }
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `CREATE ROLE ${operatorRole} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS`]);
  scratchRoleCreated = true;
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `CREATE ROLE ${staleOperatorRole} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS`]);
  staleRoleCreated = true;
  postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `GRANT saas_telemetry_operator TO ${staleOperatorRole}`]);
  psql("CREATE SCHEMA app;");
  psql(await readFile("apps/webapp/db/drizzle-migrations/0185_saas_isolation_diagnostics.sql", "utf8"));
  psql(await readFile("apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql", "utf8"));
  psql(`\\set telemetry_webapp_runtime_role app_staff
\\set telemetry_api_runtime_role app_worker
\\set telemetry_operator_runtime_role ${operatorRole}
${await readFile("deploy/postgres/saas-isolation-telemetry.sql", "utf8")}`);

  psql(`
DO $proof$ BEGIN
  SET LOCAL ROLE app_staff;
  BEGIN PERFORM * FROM app.read_saas_isolation_events(); RAISE EXCEPTION 'ambient_read_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM app.record_saas_isolation_coverage(gen_random_uuid(),'incomplete',now(),now(),ARRAY['webapp'],1,0); RAISE EXCEPTION 'ambient_coverage_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF pg_has_role('${staleOperatorRole}', 'saas_telemetry_operator', 'MEMBER') THEN
    RAISE EXCEPTION 'stale_operator_membership_survived';
  END IF;
  SET LOCAL ROLE ${staleOperatorRole};
  BEGIN PERFORM * FROM app.read_saas_isolation_events(); RAISE EXCEPTION 'stale_operator_read_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE ${operatorRole};
  BEGIN PERFORM app.report_saas_isolation_event('rls_denial','webapp','webapp_db_request','unexplained'); RAISE EXCEPTION 'operator_event_write_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM * FROM app.read_saas_isolation_events();
  RESET ROLE;
END $proof$;
SET ROLE app_staff;
SELECT app.report_saas_isolation_event('missing_principal','webapp','webapp_db_request','unexplained');
SELECT app.report_saas_isolation_event('invalid_signature_or_install','integrator','integrator_http_request','unexplained');
SELECT app.report_saas_isolation_event('role_pool_mismatch','worker','worker_queue_drain','unexplained');
SELECT app.report_saas_isolation_event('rls_denial','scheduler','scheduler_lock','unexplained');
SELECT app.report_saas_isolation_event('cleanup_failure','media_worker','media_transcode_tick','unexplained');
SELECT app.report_saas_isolation_event('unclassified_background_operation','cron','cron_health','unexplained');
RESET ROLE;
SET ROLE ${operatorRole};
SELECT 1 / ((SELECT count(*) FROM app.read_saas_isolation_events() WHERE occurrence_count = 1) = 6)::int AS all_six_classes_exact_plus_one;
SELECT 1 / ((SELECT count(DISTINCT event_class) FROM app.read_saas_isolation_events()) = 6)::int AS all_six_classes_distinct;
RESET ROLE;
SET ROLE app_staff;
SELECT app.report_saas_isolation_event('rls_denial','webapp','patient_identity_exception_check','unexplained');
SELECT app.report_saas_isolation_event('rls_denial','webapp','patient_booking_history','unexplained');
SELECT app.report_saas_isolation_event('rls_denial','webapp','patient_product_analytics','unexplained');
RESET ROLE;
SET ROLE ${operatorRole};
SELECT 1 / ((SELECT occurrence_count FROM app.read_saas_isolation_events()
  WHERE source_service = 'webapp' AND source_operation = 'patient_identity_exception_check') = 1)::int
  AS patient_identity_exception_check_persisted_after_overlay;
SELECT 1 / ((SELECT occurrence_count FROM app.read_saas_isolation_events()
  WHERE source_service = 'webapp' AND source_operation = 'patient_booking_history') = 1)::int
  AS patient_booking_history_persisted_after_overlay;
SELECT 1 / ((SELECT occurrence_count FROM app.read_saas_isolation_events()
  WHERE source_service = 'webapp' AND source_operation = 'patient_product_analytics') = 1)::int
  AS patient_product_analytics_persisted_after_overlay;
RESET ROLE;
SET ROLE app_staff;
DO $unknown_family$ BEGIN
  BEGIN
    PERFORM app.report_saas_isolation_event('rls_denial','webapp','unknown_webapp_family','unexplained');
    RAISE EXCEPTION 'unknown_webapp_family_allowed';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'invalid_saas_isolation_service_operation' THEN RAISE; END IF;
  END;
END $unknown_family$;
SELECT 1 AS unknown_webapp_family_denied;
RESET ROLE;
DELETE FROM public.saas_isolation_events
  WHERE source_service = 'webapp'
    AND source_operation IN ('patient_identity_exception_check', 'patient_booking_history', 'patient_product_analytics');
SET ROLE ${operatorRole};
DO $scenario_guard$ BEGIN
  BEGIN
    PERFORM app.set_saas_isolation_test_scenario('critical');
    RAISE EXCEPTION 'non_test_scenario_allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'saas_isolation_scenario_test_database_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM app.read_saas_isolation_test_scenario_fixture_counts();
    RAISE EXCEPTION 'non_test_scenario_counts_allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'saas_isolation_scenario_test_database_required' THEN RAISE; END IF;
  END;
END $scenario_guard$;
RESET ROLE;
`);

  await Promise.all([concurrentWriter(), concurrentWriter(), concurrentWriter(), concurrentWriter()]);
  let falsePositiveWrites = 0;
  const rejectBusinessFailure = createSaasIsolationBackgroundReporter({
    source: { service: "worker", operation: "worker_queue_drain" },
    query: async () => { falsePositiveWrites += 1; },
  });
  rejectBusinessFailure(new Error("external delivery provider timeout"));
  await new Promise((resolve) => setImmediate(resolve));
  if (falsePositiveWrites !== 0) throw new Error("non-isolation business failure reached telemetry writer");
  psql(`
SET ROLE ${operatorRole};
SELECT 1 / ((SELECT sum(occurrence_count) FROM app.read_saas_isolation_events() WHERE event_class='rls_denial') = 5)::int;
SELECT 1 / ((SELECT occurrence_count FROM app.read_saas_isolation_events() WHERE event_class='role_pool_mismatch') = 1)::int;
RESET ROLE;
WITH target AS (SELECT id FROM public.saas_isolation_events ORDER BY id LIMIT 1)
INSERT INTO public.saas_isolation_event_hourly (event_id, bucket_start, occurrence_count)
SELECT id, date_trunc('hour', statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '23 hours', 3 FROM target
UNION ALL SELECT id, date_trunc('hour', statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '24 hours', 2 FROM target
UNION ALL SELECT id, date_trunc('hour', statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 hour', 100 FROM target;
SET ROLE ${operatorRole};
WITH trend AS MATERIALIZED (SELECT * FROM app.read_saas_isolation_trend()),
expected_dates AS (
  SELECT jsonb_agg(to_jsonb(to_char(day_start AT TIME ZONE 'UTC', 'YYYY-MM-DD')) ORDER BY day_start) AS dates
  FROM trend, generate_series(
    date_trunc('day', trend.as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '6 days',
    date_trunc('day', trend.as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', interval '1 day'
  ) series(day_start)
), actual_dates AS (
  SELECT jsonb_agg(point->'date' ORDER BY ordinal) AS dates,
         sum((point->>'count')::int) AS total
  FROM trend, jsonb_array_elements(trend.daily_7_days) WITH ORDINALITY AS series(point, ordinal)
)
SELECT 1 / (
  trend.current_24_hours = 13
  AND trend.previous_24_hours = 2
  AND actual_dates.total = 15
  AND actual_dates.dates = expected_dates.dates
  AND jsonb_array_length(trend.daily_7_days) = 7
)::int AS trend_boundary_future_exclusion_and_exact_utc_dates
FROM trend, expected_dates, actual_dates;
SELECT app.record_saas_isolation_coverage('11111111-1111-4111-8111-111111111111','complete','2026-07-15T10:00:00Z','2026-07-15T11:00:00Z',ARRAY['webapp','integrator','worker','scheduler','media_worker','cron'],6,0);
SELECT app.record_saas_isolation_coverage('11111111-1111-4111-8111-111111111111','complete','2026-07-15T10:00:00Z','2026-07-15T11:00:00Z',ARRAY['webapp','integrator','worker','scheduler','media_worker','cron'],6,0);
DO $conflict$ BEGIN
  BEGIN
    PERFORM app.record_saas_isolation_coverage('11111111-1111-4111-8111-111111111111','complete','2026-07-15T10:00:00Z','2026-07-15T11:00:00Z',ARRAY['webapp','integrator','worker','scheduler','media_worker','cron'],7,0);
    RAISE EXCEPTION 'conflicting_retry_allowed';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'saas_isolation_coverage_id_conflict' THEN RAISE; END IF;
  END;
END $conflict$;
RESET ROLE;
SELECT 1 / (NOT has_function_privilege('app_staff','app.read_saas_isolation_events()','EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege('app_owner','app.read_saas_isolation_events()','EXECUTE'))::int;
SELECT 1 / (NOT has_function_privilege('${staleOperatorRole}','app.read_saas_isolation_events()','EXECUTE'))::int;
SELECT 1 / has_function_privilege('${operatorRole}','app.read_saas_isolation_events()','EXECUTE')::int;
`);
  process.stdout.write("SaaS isolation diagnostics PostgreSQL rehearsal: PASS\n");
} finally {
  if (databaseCreated) postgres(["dropdb", "--if-exists", db], undefined, true);
  if (scratchRoleCreated) postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `DROP ROLE IF EXISTS ${operatorRole}`], undefined, true);
  if (staleRoleCreated) postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `DROP ROLE IF EXISTS ${staleOperatorRole}`], undefined, true);
  if (operatorGroupExisted) {
    for (const member of originalOperatorMembers) {
      if (roleExists(member)) {
        postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", `GRANT saas_telemetry_operator TO ${quoteIdentifier(member)}`], undefined, true);
      }
    }
  }
  if (!operatorGroupExisted) postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", "DROP ROLE IF EXISTS saas_telemetry_operator"], undefined, true);
  if (!ownerExisted) postgres(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", "DROP ROLE IF EXISTS saas_telemetry_owner"], undefined, true);
}
