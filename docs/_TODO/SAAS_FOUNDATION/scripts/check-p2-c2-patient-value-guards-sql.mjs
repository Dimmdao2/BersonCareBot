#!/usr/bin/env node

import { readFileSync } from "node:fs";

const opsSqlPath = "deploy/postgres/p2-c2-patient-value-guards.sql";
const channelPreferencesRepoPath = "apps/webapp/src/infra/repos/pgChannelPreferences.ts";
const opsSql = readFileSync(opsSqlPath, "utf8");
const channelPreferencesRepo = readFileSync(channelPreferencesRepoPath, "utf8");

function fail(message) {
  throw new Error(message);
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`Missing required ${label} fragment: ${fragment}`);
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

const executableSql = opsSql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const compactOpsSql = executableSql.replace(/\s+/g, " ");
const compactChannelPreferencesRepo = channelPreferencesRepo.replace(/\s+/g, " ");

requireFragments("P2-C2 ops SQL", opsSql, [
  "app.p2_c2_is_patient_context()",
  "app.current_patient_user_id() IS NOT NULL AND NOT app.is_staff()",
  "SECURITY INVOKER",
  "app.p2_c2_guard_online_intake_status_history()",
  "NEW.from_status IS NOT NULL",
  "NEW.to_status IS DISTINCT FROM 'new'",
  "NEW.changed_by IS NOT NULL",
  "NEW.note IS NOT NULL",
  "request.user_id = v_patient_user_id",
  "request.organization_id = v_org_id",
  "request.status = 'new'",
  "FROM public.online_intake_status_history existing_history",
  "existing_history.request_id = NEW.request_id",
  "app.p2_c2_guard_user_channel_preferences()",
  "app.p2_c2_user_channel_preference_is_owned(OLD.user_id, OLD.platform_user_id)",
  "app.p2_c2_user_channel_preference_is_owned(NEW.user_id, NEW.platform_user_id)",
  "NEW.channel_code NOT IN ('telegram', 'max', 'email', 'sms')",
  "FROM public.user_channel_preferences existing_pref",
  "existing_pref.is_preferred_for_auth = true",
  "app.p2_c2_user_channel_preference_is_owned(",
  "existing_pref.user_id",
  "existing_pref.platform_user_id",
  "existing_pref.user_id IS DISTINCT FROM OLD.user_id",
  "existing_pref.channel_code IS DISTINCT FROM OLD.channel_code",
  "existing_pref.platform_user_id IS DISTINCT FROM OLD.platform_user_id",
  "app.p2_c2_expected_reminder_notification_topic_code(",
  "WHEN p_category = 'appointment' THEN 'appointment_reminders'",
  "WHEN p_category = 'important' THEN NULL",
  "WHEN lower(btrim(COALESCE(p_reminder_intent, ''))) = 'warmup' THEN 'warmup_reminders'",
  "WHEN p_category = 'lfk' THEN 'training_reminders'",
  "NEW.notification_topic_code := app.p2_c2_expected_reminder_notification_topic_code(",
  "CREATE TRIGGER p2_c2_online_intake_status_history_patient_insert_guard",
  "CREATE TRIGGER p2_c2_user_channel_preferences_patient_write_guard",
  "CREATE TRIGGER p2_c2_reminder_rules_patient_write_guard",
  "\\if :{?p2_c2_down}",
]);

requireFragments("P2-C2 channel preference ownership parity", compactOpsSql, [
  "SELECT p_platform_user_id = app.current_patient_user_id() OR (p_platform_user_id IS NULL AND p_user_id = app.current_patient_user_id()::text)",
]);

requireFragments("app channel preference ownership predicate", compactChannelPreferencesRepo, [
  "return `(platform_user_id = $${paramIndex}::uuid OR (platform_user_id IS NULL AND user_id = $${paramIndex}::text))`;",
]);

forbidFragments("P2-C2 ops SQL", opsSql, [
  "/opt/env/bersoncarebot",
  "api.prod",
  "webapp.prod",
  "bcb_webapp_prod",
  "bcb_webapp_dev",
  "REASSIGN OWNED",
  "DROP OWNED",
  "SELECT p_user_id = app.current_patient_user_id()::text\n    AND (p_platform_user_id IS NULL OR p_platform_user_id = app.current_patient_user_id())",
]);

forbidFragments("P2-C2 executable SQL", executableSql, [
  "SECURITY DEFINER",
  "current_setting('app.org'",
  "current_setting('app.patient_user_id'",
  "current_setting('app.integrator_user_id'",
  "current_setting('app.actor'",
  "SET search_path = public",
]);

console.log("check-p2-c2-patient-value-guards-sql: OK");
