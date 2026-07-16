#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const migration = await readFile("apps/webapp/db/drizzle-migrations/0190_curated_system_health_diagnostics.sql", "utf8");
const playbackMigration = await readFile("apps/webapp/db/drizzle-migrations/0192_curated_playback_and_patient_program_runtime.sql", "utf8");
const overlay = await readFile("deploy/postgres/saas-system-health-diagnostics.sql", "utf8");
const reader = await readFile("apps/webapp/src/infra/repos/pgCuratedSystemHealthDiagnostics.ts", "utf8");
const collector = await readFile("apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts", "utf8");
const deploy = await readFile("deploy/host/deploy-test-saas.sh", "utf8");

function requireMatch(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(`curated_health_check_failed:${label}`);
}

for (const table of [
  "app_runtime_settings", "system_settings", "media_files", "media_transcode_jobs",
  "operator_job_status", "operator_incidents", "outgoing_delivery_queue",
  "integrator_push_outbox", "reminder_occurrence_history", "reminder_delivery_events",
  "idempotency_keys", "user_web_push_subscriptions", "notification_delivery_attempts",
  "integration_webhook_last_status", "operator_health_alert_sent",
  "media_playback_resolution_events", "media_playback_stats_hourly",
  "media_playback_user_video_first_resolve",
]) requireMatch(overlay, new RegExp(`public\\.${table}\\b`), `closed_source_${table}`);

requireMatch(migration, /CREATE OR REPLACE FUNCTION app\.read_curated_system_health\(\)/, "function");
requireMatch(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog/, "definer_search_path");
requireMatch(migration, /'recentIssues', '\[\]'::jsonb/, "no_notification_rows");
requireMatch(migration, /'lastErrorReason', NULL[\s\S]*'lastErrorMessage', NULL/, "no_error_text");
requireMatch(overlay, /CREATE ROLE saas_system_health_owner[\s\S]*NOLOGIN[\s\S]*BYPASSRLS/, "sealed_owner");
requireMatch(overlay, /GRANT EXECUTE ON FUNCTION app\.read_curated_system_health\(\) TO saas_telemetry_operator/, "protected_execute");
requireMatch(overlay, /GRANT USAGE ON SCHEMA app TO saas_telemetry_operator/, "protected_schema_usage");
requireMatch(overlay, /NOT has_function_privilege\('app_staff'/, "staff_denied");
requireMatch(reader, /getSaasIsolationOperatorPool\(\)/, "protected_pool");
requireMatch(reader, /z\.tuple\(\[\]\)/, "schema_rejects_rows");
requireMatch(playbackMigration, /CREATE OR REPLACE FUNCTION app\.read_curated_playback_health\(\)/, "playback_function");
requireMatch(playbackMigration, /SECURITY DEFINER\s+SET search_path = pg_catalog/, "playback_definer_search_path");
requireMatch(overlay, /GRANT EXECUTE ON FUNCTION app\.read_curated_playback_health\(\) TO saas_telemetry_operator/, "playback_protected_execute");
requireMatch(reader, /SELECT app\.read_curated_playback_health\(\) AS snapshot/, "playback_protected_reader");
requireMatch(collector, /probeCuratedSystemHealth\(\)/, "single_curated_probe");
if (collector.includes("loadAdminPlaybackHealthMetrics")) {
  throw new Error("curated_health_check_failed:direct_playback_probe");
}
requireMatch(deploy, /saas-system-health-diagnostics\.sql/, "test_deploy_wiring");

for (const forbidden of ["recipientRef", "userId", "errorMessage", "privateKey", "rawIncidentRows"]) {
  if (migration.includes(`'${forbidden}'`)) throw new Error(`curated_health_check_failed:raw_projection_${forbidden}`);
}

process.stdout.write("Curated System Health static checker: PASS\n");
