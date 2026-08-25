export const u9aPlatformSettingsRoleArtifactPath = 'deploy/postgres/u9a-platform-settings-role.sql';

/** Canonical, idempotent U9A role contract. Applied only by an owner-gated role rollout. */
export function renderU9aPlatformSettingsRoleSql() {
  return `\\set ON_ERROR_STOP on

DO $u9a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_settings') THEN
    CREATE ROLE app_platform_settings NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$u9a$;
ALTER ROLE app_platform_settings NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- app_staff is transport only; every platform request must explicitly SET ROLE.
GRANT app_platform_settings TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public, app TO app_platform_settings;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA integrator FROM app_platform_settings;
REVOKE ALL PRIVILEGES ON TABLE public.system_settings, public.system_settings_audit FROM app_platform_settings;
-- DELETE is the platform-only "reset to code default" operation. RLS below limits it to
-- organization_id IS NULL; clinic staff never SET ROLE app_platform_settings.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_settings TO app_platform_settings;
GRANT INSERT ON TABLE public.system_settings_audit TO app_platform_settings;

DROP POLICY IF EXISTS u9a_platform_settings_global_only ON public.system_settings;
CREATE POLICY u9a_platform_settings_global_only ON public.system_settings
  FOR ALL TO app_platform_settings
  USING (organization_id IS NULL) WITH CHECK (organization_id IS NULL);
DROP POLICY IF EXISTS u9a_platform_settings_audit_global_only ON public.system_settings_audit;
CREATE POLICY u9a_platform_settings_audit_global_only ON public.system_settings_audit
  FOR INSERT TO app_platform_settings WITH CHECK (organization_id IS NULL);
`;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  process.stdout.write(renderU9aPlatformSettingsRoleSql());
}
