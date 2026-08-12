-- ============================================================================
-- СГЕНЕРИРОВАННАЯ УБОРКА LEGACY ROLES — SHARED TARGET ROLES НЕ УДАЛЯЕТ.
-- источник:   deploy/postgres/privileges/declaration.ts
-- безопасно повторять после per-database zero; роли с зависимостями остаются до следующего target.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMP TABLE bcb_zero_state_cluster_guard ON COMMIT DROP AS SELECT 1;
CREATE TEMP TABLE bcb_zero_state_cluster_roles (role_name name PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bcb_zero_state_cluster_roles SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_owner', 'bcb_webapp_dev_user', 'bersoncarebot_test']::name[]);
DO $bcb$ DECLARE target record; dependency_count bigint; membership_count bigint; backend_count bigint; BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_owner', 'bcb_webapp_dev_user', 'bersoncarebot_test']::name[]) AND rolsuper) THEN
    RAISE EXCEPTION 'application identity is SUPERUSER; cluster zero-state refused';
  END IF;
  FOR target IN SELECT role_name FROM bcb_zero_state_cluster_roles ORDER BY role_name LOOP
    SELECT count(*) INTO dependency_count FROM pg_catalog.pg_shdepend dependency
     WHERE dependency.refclassid = 'pg_authid'::pg_catalog.regclass
       AND dependency.refobjid = target.role_name::regrole;
    SELECT count(*) INTO membership_count FROM pg_catalog.pg_auth_members membership
     WHERE membership.roleid = target.role_name::regrole OR membership.member = target.role_name::regrole;
    SELECT count(*) INTO backend_count FROM pg_catalog.pg_stat_activity activity WHERE activity.usename = target.role_name;
    IF dependency_count = 0 AND membership_count = 0 AND backend_count = 0 THEN
      EXECUTE pg_catalog.format('DROP ROLE %I', target.role_name);
    ELSE
      RAISE NOTICE 'legacy role % retained: dependencies=%, memberships=%, backends=%', target.role_name, dependency_count, membership_count, backend_count;
    END IF;
  END LOOP;
END $bcb$;
DO $bcb$ BEGIN
  RAISE NOTICE 'BCB_LEGACY_ROLE_CLEANUP_RECONCILED';
END $bcb$;

-- end legacy-only cluster cleanup.
