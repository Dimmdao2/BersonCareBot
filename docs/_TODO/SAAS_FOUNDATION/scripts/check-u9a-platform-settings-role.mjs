import { readFileSync } from "node:fs";
import {
  renderU9aPlatformSettingsRoleSql,
  u9aPlatformSettingsRoleArtifactPath,
} from "./u9a-platform-settings-role-sql.mjs";

const artifact = readFileSync(u9aPlatformSettingsRoleArtifactPath, "utf8");
const platformSettingsRoute = readFileSync(
  "apps/webapp/src/app/api/platform/settings/route.ts",
  "utf8",
);
if (artifact !== renderU9aPlatformSettingsRoleSql())
  throw new Error("U9A platform-settings SQL artifact is not generator-synchronized");
for (const fragment of [
  "CREATE ROLE app_platform_settings NOLOGIN NOINHERIT NOBYPASSRLS;",
  "GRANT app_platform_settings TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;",
  "GRANT SELECT, INSERT, UPDATE ON TABLE public.system_settings TO app_platform_settings;",
  "GRANT INSERT ON TABLE public.system_settings_audit TO app_platform_settings;",
  "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA integrator FROM app_platform_settings;",
  "CREATE OR REPLACE FUNCTION app.enqueue_platform_system_settings_sync(",
  "'system_settings_sync'",
  "'scope', 'admin'",
  "'organizationId', NULL",
  "'debug_forward_to_admin'",
  "'specialist_signup_enabled'",
  "'patient_app_maintenance_enabled'",
  "'patient_app_maintenance_message'",
  "FROM public.system_settings AS setting",
  "'valueJson', v_value_json",
  "GRANT EXECUTE ON FUNCTION app.enqueue_platform_system_settings_sync(text)",
  "organization_id IS NULL",
])
  if (!artifact.includes(fragment)) throw new Error(`U9A platform-settings SQL missing ${fragment}`);
for (const forbidden of [
  "NOBYPASSRLS;\nGRANT",
  "GRANT DELETE",
  "patient_files",
  "platform_users",
  "'reminder_rule_upsert'",
])
  if (artifact.includes(forbidden)) throw new Error(`U9A platform-settings SQL contains forbidden ${forbidden}`);
if (/GRANT\s+[^;]*ON TABLE public\.integrator_push_outbox\s+TO app_platform_settings/i.test(artifact)) {
  throw new Error("U9A platform role must not receive shared-outbox table DML");
}
const whitelistMatch = /p_key NOT IN \(([\s\S]*?)\) THEN/.exec(artifact);
const whitelistedKeys = [...(whitelistMatch?.[1] ?? "").matchAll(/'([a-z0-9_:]+)'/g)].map((match) => match[1]);
const apiWhitelistMatch = /PLATFORM_GLOBAL_SETTINGS_API_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(
  platformSettingsRoute,
);
const platformApiKeys = [...(apiWhitelistMatch?.[1] ?? "").matchAll(/"([a-z0-9_]+)"/g)].map(
  (match) => match[1],
);
const expectedKeys = [
  ...platformApiKeys,
  "notif_template:created:patient",
  "notif_template:created:doctor",
  "notif_template:cancelled:patient",
  "notif_template:cancelled:doctor",
  "notif_template:rescheduled:patient",
  "notif_template:rescheduled:doctor",
];
if (expectedKeys.length === 0) throw new Error("U9A platform API whitelist is missing");
if (JSON.stringify(whitelistedKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error("U9A platform outbox function whitelist differs from the API whitelist");
}
console.log("check-u9a-platform-settings-role: OK");
