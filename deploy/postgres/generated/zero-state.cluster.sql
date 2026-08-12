-- ============================================================================
-- СГЕНЕРИРОВАННАЯ УБОРКА LEGACY ROLES — SHARED TARGET ROLES НЕ УДАЛЯЕТ.
-- источник:   deploy/postgres/privileges/declaration.ts
-- безопасно повторять после per-database zero; legacy-only memberships снимаются лишь после очистки всех их database dependencies.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMP TABLE bcb_zero_state_cluster_guard ON COMMIT DROP AS SELECT 1;
CREATE TEMP TABLE bcb_zero_state_cluster_roles (role_name name PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bcb_zero_state_cluster_roles SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_owner', 'bcb_webapp_dev_user', 'bersoncarebot_test']::name[]);
DO $bcb$ DECLARE edge record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_owner', 'bcb_webapp_dev_user', 'bersoncarebot_test']::name[]) AND rolsuper) THEN
    RAISE EXCEPTION 'application identity is SUPERUSER; cluster zero-state refused';
  END IF;
  FOR edge IN SELECT granted.rolname AS role_name, member.rolname AS member_name
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid=membership.member
   WHERE (granted.rolname IN (SELECT role_name FROM bcb_zero_state_cluster_roles)
       OR member.rolname IN (SELECT role_name FROM bcb_zero_state_cluster_roles))
     AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[granted.oid,member.oid]) endpoint(role_oid)
       JOIN pg_catalog.pg_roles endpoint_role ON endpoint_role.oid=endpoint.role_oid
      WHERE endpoint_role.rolname IN (SELECT role_name FROM bcb_zero_state_cluster_roles)
        AND (EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend dependency WHERE dependency.refclassid='pg_authid'::pg_catalog.regclass AND dependency.refobjid=endpoint.role_oid)
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity activity WHERE activity.usesysid=endpoint.role_oid)))
   ORDER BY 1,2 LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I',edge.role_name,edge.member_name);
  END LOOP;
END $bcb$;
DO $bcb$ DECLARE target record; dependency_count bigint; membership_count bigint; backend_count bigint; BEGIN
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
