import { readFileSync } from "node:fs";
import { renderU9aPlatformSettingsRoleSql, u9aPlatformSettingsRoleArtifactPath } from "./u9a-platform-settings-role-sql.mjs";

const artifact = readFileSync(u9aPlatformSettingsRoleArtifactPath, "utf8");
if (artifact !== renderU9aPlatformSettingsRoleSql()) throw new Error("U9A platform-settings SQL artifact is not generator-synchronized");
for (const fragment of [
  "CREATE ROLE app_platform_settings NOLOGIN NOINHERIT NOBYPASSRLS;",
  "GRANT app_platform_settings TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;",
  "GRANT SELECT, INSERT, UPDATE ON TABLE public.system_settings TO app_platform_settings;",
  "GRANT INSERT ON TABLE public.system_settings_audit TO app_platform_settings;",
  "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA integrator FROM app_platform_settings;",
  "organization_id IS NULL",
]) if (!artifact.includes(fragment)) throw new Error(`U9A platform-settings SQL missing ${fragment}`);
for (const forbidden of ["NOBYPASSRLS;\nGRANT", "GRANT DELETE", "patient_files", "platform_users"]) if (artifact.includes(forbidden)) throw new Error(`U9A platform-settings SQL contains forbidden ${forbidden}`);
console.log("check-u9a-platform-settings-role: OK");
