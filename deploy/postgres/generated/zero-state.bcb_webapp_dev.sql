-- ============================================================================
-- СГЕНЕРИРОВАННАЯ МИГРАЦИЯ ТОЧКИ НОЛЬ — НЕ ДОБАВЛЯЕТ НИ ОДНОГО GRANT.
-- источник:   deploy/postgres/privileges/declaration.ts
-- генератор:  deploy/postgres/privileges/generate.mjs (версия 1)
-- база:       bcb_webapp_dev
-- применение: psql -1 -X -v ON_ERROR_STOP=1 -f <этот файл>
-- порядок:    OWNER_DECISIONS.md пункты 4–5; до target roles/grants.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMP TABLE bcb_zero_state_txn_guard ON COMMIT DROP AS SELECT 1 AS one;
-- Expected identities stay literal even when cluster zero already dropped them.
CREATE TEMP TABLE bcb_zero_state_roles (role_name name PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bcb_zero_state_roles (role_name) VALUES ('app_clinic_billing'::name), ('app_integrator_request'::name), ('app_integrator_resolver'::name), ('app_object_owner'::name), ('app_operational_delivery_worker'::name), ('app_operational_media_worker'::name), ('app_operational_scheduler'::name), ('app_owner'::name), ('app_patient'::name), ('app_platform_settings'::name), ('app_pre_session'::name), ('app_seam_catalog_admin_owner'::name), ('app_seam_catalog_public_owner'::name), ('app_seam_context_owner'::name), ('app_seam_dedicated_bot_owner'::name), ('app_seam_delivery_scope_owner'::name), ('app_seam_email_otp_owner'::name), ('app_seam_identity_lookup_owner'::name), ('app_seam_login_token_owner'::name), ('app_seam_oauth_owner'::name), ('app_seam_org_commerce_owner'::name), ('app_seam_org_directory_owner'::name), ('app_seam_org_invite_owner'::name), ('app_seam_passkey_owner'::name), ('app_seam_password_auth_owner'::name), ('app_seam_patient_booking_owner'::name), ('app_seam_patient_invite_owner'::name), ('app_seam_patient_lfk_media_owner'::name), ('app_seam_patient_org_projection_owner'::name), ('app_seam_patient_program_resolver_owner'::name), ('app_seam_patient_self_actions_owner'::name), ('app_seam_payment_webhook_owner'::name), ('app_seam_phone_binding_owner'::name), ('app_seam_phone_otp_owner'::name), ('app_seam_public_booking_owner'::name), ('app_seam_public_slug_owner'::name), ('app_seam_reminder_appointment_owner'::name), ('app_seam_reminder_email_cooldown_owner'::name), ('app_seam_reminder_materialization_owner'::name), ('app_seam_reminder_patient_owner'::name), ('app_seam_reminder_specialist_owner'::name), ('app_seam_self_security_owner'::name), ('app_seam_settings_integrator_owner'::name), ('app_seam_settings_preauth_owner'::name), ('app_seam_settings_runtime_owner'::name), ('app_seam_specialist_provision_owner'::name), ('app_seam_staff_security_owner'::name), ('app_seam_telemetry_exclusion_owner'::name), ('app_seam_telemetry_media_owner'::name), ('app_seam_telemetry_operator_owner'::name), ('app_seam_telemetry_patient_owner'::name), ('app_service'::name), ('app_staff'::name), ('app_tenant_service'::name), ('app_worker'::name), ('bcb_dev_integrator'::name), ('bcb_dev_migrator'::name), ('bcb_dev_webapp_patient'::name), ('bcb_dev_webapp_staff'::name), ('bcb_test_integrator'::name), ('bcb_test_migrator'::name), ('bcb_test_webapp_patient'::name), ('bcb_test_webapp_staff'::name), ('bcb_webapp_dev_user'::name), ('bersoncarebot_test'::name), ('saas_system_health_owner'::name), ('saas_telemetry_operator'::name), ('saas_telemetry_owner'::name);
-- Existing identities are a separate working set used only for destructive DDL.
CREATE TEMP TABLE bcb_zero_state_existing_roles (role_name name PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE bcb_zero_state_grantees (role_oid oid PRIMARY KEY, grantee_sql text NOT NULL) ON COMMIT DROP;
DO $bcb$
BEGIN
  IF pg_catalog.to_regclass('pg_temp.bcb_zero_state_txn_guard') IS NULL THEN
    RAISE EXCEPTION 'zero-state must run in one transaction (psql -1)';
  END IF;
  IF pg_catalog.current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'zero-state for % applied to %', 'bcb_webapp_dev', pg_catalog.current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_clinic_billing', 'app_integrator_request', 'app_integrator_resolver', 'app_object_owner', 'app_operational_delivery_worker', 'app_operational_media_worker', 'app_operational_scheduler', 'app_owner', 'app_patient', 'app_platform_settings', 'app_pre_session', 'app_seam_catalog_admin_owner', 'app_seam_catalog_public_owner', 'app_seam_context_owner', 'app_seam_dedicated_bot_owner', 'app_seam_delivery_scope_owner', 'app_seam_email_otp_owner', 'app_seam_identity_lookup_owner', 'app_seam_login_token_owner', 'app_seam_oauth_owner', 'app_seam_org_commerce_owner', 'app_seam_org_directory_owner', 'app_seam_org_invite_owner', 'app_seam_passkey_owner', 'app_seam_password_auth_owner', 'app_seam_patient_booking_owner', 'app_seam_patient_invite_owner', 'app_seam_patient_lfk_media_owner', 'app_seam_patient_org_projection_owner', 'app_seam_patient_program_resolver_owner', 'app_seam_patient_self_actions_owner', 'app_seam_payment_webhook_owner', 'app_seam_phone_binding_owner', 'app_seam_phone_otp_owner', 'app_seam_public_booking_owner', 'app_seam_public_slug_owner', 'app_seam_reminder_appointment_owner', 'app_seam_reminder_email_cooldown_owner', 'app_seam_reminder_materialization_owner', 'app_seam_reminder_patient_owner', 'app_seam_reminder_specialist_owner', 'app_seam_self_security_owner', 'app_seam_settings_integrator_owner', 'app_seam_settings_preauth_owner', 'app_seam_settings_runtime_owner', 'app_seam_specialist_provision_owner', 'app_seam_staff_security_owner', 'app_seam_telemetry_exclusion_owner', 'app_seam_telemetry_media_owner', 'app_seam_telemetry_operator_owner', 'app_seam_telemetry_patient_owner', 'app_service', 'app_staff', 'app_tenant_service', 'app_worker', 'bcb_dev_integrator', 'bcb_dev_migrator', 'bcb_dev_webapp_patient', 'bcb_dev_webapp_staff', 'bcb_test_integrator', 'bcb_test_migrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff', 'bcb_webapp_dev_user', 'bersoncarebot_test', 'saas_system_health_owner', 'saas_telemetry_operator', 'saas_telemetry_owner']::name[]) AND rolsuper) THEN
    RAISE EXCEPTION 'an application identity is SUPERUSER; zero-state refuses a silent exclusion';
  END IF;
END
$bcb$;
INSERT INTO bcb_zero_state_existing_roles SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_clinic_billing', 'app_integrator_request', 'app_integrator_resolver', 'app_object_owner', 'app_operational_delivery_worker', 'app_operational_media_worker', 'app_operational_scheduler', 'app_owner', 'app_patient', 'app_platform_settings', 'app_pre_session', 'app_seam_catalog_admin_owner', 'app_seam_catalog_public_owner', 'app_seam_context_owner', 'app_seam_dedicated_bot_owner', 'app_seam_delivery_scope_owner', 'app_seam_email_otp_owner', 'app_seam_identity_lookup_owner', 'app_seam_login_token_owner', 'app_seam_oauth_owner', 'app_seam_org_commerce_owner', 'app_seam_org_directory_owner', 'app_seam_org_invite_owner', 'app_seam_passkey_owner', 'app_seam_password_auth_owner', 'app_seam_patient_booking_owner', 'app_seam_patient_invite_owner', 'app_seam_patient_lfk_media_owner', 'app_seam_patient_org_projection_owner', 'app_seam_patient_program_resolver_owner', 'app_seam_patient_self_actions_owner', 'app_seam_payment_webhook_owner', 'app_seam_phone_binding_owner', 'app_seam_phone_otp_owner', 'app_seam_public_booking_owner', 'app_seam_public_slug_owner', 'app_seam_reminder_appointment_owner', 'app_seam_reminder_email_cooldown_owner', 'app_seam_reminder_materialization_owner', 'app_seam_reminder_patient_owner', 'app_seam_reminder_specialist_owner', 'app_seam_self_security_owner', 'app_seam_settings_integrator_owner', 'app_seam_settings_preauth_owner', 'app_seam_settings_runtime_owner', 'app_seam_specialist_provision_owner', 'app_seam_staff_security_owner', 'app_seam_telemetry_exclusion_owner', 'app_seam_telemetry_media_owner', 'app_seam_telemetry_operator_owner', 'app_seam_telemetry_patient_owner', 'app_service', 'app_staff', 'app_tenant_service', 'app_worker', 'bcb_dev_integrator', 'bcb_dev_migrator', 'bcb_dev_webapp_patient', 'bcb_dev_webapp_staff', 'bcb_test_integrator', 'bcb_test_migrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff', 'bcb_webapp_dev_user', 'bersoncarebot_test', 'saas_system_health_owner', 'saas_telemetry_operator', 'saas_telemetry_owner']::name[]);
INSERT INTO bcb_zero_state_grantees VALUES (0, 'PUBLIC');
INSERT INTO bcb_zero_state_grantees SELECT oid, pg_catalog.format('%I', rolname) FROM pg_catalog.pg_roles WHERE rolname <> 'postgres';

-- Stop every non-superuser session in this database; exact application identities are disabled cluster-wide.
SELECT pg_catalog.pg_terminate_backend(activity.pid)
  FROM pg_catalog.pg_stat_activity activity
  JOIN pg_catalog.pg_roles session_role ON session_role.rolname = activity.usename
 WHERE activity.datname = pg_catalog.current_database()
   AND activity.pid <> pg_catalog.pg_backend_pid() AND NOT session_role.rolsuper;
DO $bcb$ DECLARE target record; BEGIN
  FOR target IN SELECT role_name FROM bcb_zero_state_existing_roles ORDER BY role_name LOOP
    EXECUTE pg_catalog.format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', target.role_name);
    EXECUTE pg_catalog.format('ALTER ROLE %I RESET ALL', target.role_name);
    EXECUTE pg_catalog.format('ALTER ROLE %I IN DATABASE %I RESET ALL', target.role_name, 'bcb_webapp_dev');
  END LOOP;
END $bcb$;
DO $bcb$ DECLARE edge record; BEGIN
  FOR edge IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
     WHERE granted.rolname IN (SELECT role_name FROM bcb_zero_state_existing_roles)
        OR member.rolname IN (SELECT role_name FROM bcb_zero_state_existing_roles)
     ORDER BY 1, 2
  LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', edge.granted_role, edge.member_role);
  END LOOP;
END $bcb$;

-- Preserve every object, but remove ownership, ACL and default-ACL dependencies of retired identities.
ALTER DATABASE "bcb_webapp_dev" OWNER TO postgres;
REVOKE ALL PRIVILEGES ON DATABASE "bcb_webapp_dev" FROM PUBLIC;
DO $bcb$ DECLARE target record; BEGIN
  FOR target IN SELECT role_name FROM bcb_zero_state_existing_roles ORDER BY role_name LOOP
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', 'bcb_webapp_dev', target.role_name);
    EXECUTE pg_catalog.format('REASSIGN OWNED BY %I TO postgres', target.role_name);
    EXECUTE pg_catalog.format('DROP OWNED BY %I', target.role_name);
  END LOOP;
END $bcb$;

-- One neutral DBA owner remains; every non-system schema and object is preserved.
DO $bcb$ DECLARE object record; BEGIN
  FOR object IN SELECT nspname FROM pg_catalog.pg_namespace
                 WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LOOP
    EXECUTE pg_catalog.format('ALTER SCHEMA %I OWNER TO postgres', object.nspname);
  END LOOP;
  FOR object IN SELECT namespace.nspname, relation.relname, relation.relkind
                  FROM pg_catalog.pg_class relation
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
                   AND relation.relkind IN ('r','p','v','m','f','S') ORDER BY 1, 2 LOOP
    EXECUTE pg_catalog.format('ALTER %s %I.%I OWNER TO postgres', CASE object.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, object.nspname, object.relname);
  END LOOP;
  FOR object IN SELECT namespace.nspname, routine.proname, routine.prokind,
                       pg_catalog.pg_get_function_identity_arguments(routine.oid) AS args
                  FROM pg_catalog.pg_proc routine
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' ORDER BY 1, 2, 4 LOOP
    EXECUTE pg_catalog.format('ALTER %s %I.%I(%s) OWNER TO postgres', CASE object.prokind WHEN 'a' THEN 'AGGREGATE' ELSE 'ROUTINE' END, object.nspname, object.proname, object.args);
  END LOOP;
  FOR object IN SELECT namespace.nspname, object_type.typname
                  FROM pg_catalog.pg_type object_type
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object_type.typnamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
                   AND object_type.typtype IN ('b','c','d','e','r','m') AND object_type.typelem = 0
                   AND (object_type.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object_type.typrelid AND composite.relkind = 'c'))
                 ORDER BY 1, 2 LOOP
    EXECUTE pg_catalog.format('ALTER TYPE %I.%I OWNER TO postgres', object.nspname, object.typname);
  END LOOP;
  FOR object IN SELECT namespace.nspname, object_collation.collname
                  FROM pg_catalog.pg_collation object_collation
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object_collation.collnamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' ORDER BY 1, 2 LOOP
    EXECUTE pg_catalog.format('ALTER COLLATION %I.%I OWNER TO postgres', object.nspname, object.collname);
  END LOOP;
  FOR object IN SELECT oid FROM pg_catalog.pg_largeobject_metadata ORDER BY oid LOOP
    EXECUTE pg_catalog.format('ALTER LARGE OBJECT %s OWNER TO postgres', object.oid);
  END LOOP;
  FOR object IN SELECT fdwname FROM pg_catalog.pg_foreign_data_wrapper ORDER BY fdwname LOOP
    EXECUTE pg_catalog.format('ALTER FOREIGN DATA WRAPPER %I OWNER TO postgres', object.fdwname);
  END LOOP;
  FOR object IN SELECT srvname FROM pg_catalog.pg_foreign_server ORDER BY srvname LOOP
    EXECUTE pg_catalog.format('ALTER SERVER %I OWNER TO postgres', object.srvname);
  END LOOP;
  FOR object IN SELECT lanname FROM pg_catalog.pg_language WHERE lanname <> 'internal' ORDER BY lanname LOOP
    EXECUTE pg_catalog.format('ALTER LANGUAGE %I OWNER TO postgres', object.lanname);
  END LOOP;
END $bcb$;

-- Remove every old grant, including unknown non-application grantees; roles themselves are not inferred or dropped.
DO $bcb$ DECLARE grantee record; object record; schema_name name; BEGIN
  FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %s', 'bcb_webapp_dev', grantee.grantee_sql);
    FOR schema_name IN SELECT nspname FROM pg_catalog.pg_namespace
                        WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LOOP
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);
    END LOOP;
  END LOOP;
  FOR object IN SELECT lanname FROM pg_catalog.pg_language WHERE lanpltrusted ORDER BY lanname LOOP
    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON LANGUAGE %I FROM %s', object.lanname, grantee.grantee_sql);
    END LOOP;
  END LOOP;
END $bcb$;
DO $bcb$ DECLARE column_acl record; BEGIN
  FOR column_acl IN
    SELECT acl.privilege_type, attribute.attname, namespace.nspname, relation.relname, grantee.grantee_sql
      FROM pg_catalog.pg_attribute attribute
      JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      JOIN bcb_zero_state_grantees grantee ON grantee.role_oid = acl.grantee
     WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
       AND attribute.attnum > 0 AND NOT attribute.attisdropped ORDER BY 3, 4, 2, 1
  LOOP
    EXECUTE pg_catalog.format('REVOKE %s (%I) ON TABLE %I.%I FROM %s', column_acl.privilege_type, column_acl.attname, column_acl.nspname, column_acl.relname, column_acl.grantee_sql);
  END LOOP;
END $bcb$;
DO $bcb$ DECLARE object record; grantee record; BEGIN
  FOR object IN SELECT namespace.nspname, object_type.typname
                  FROM pg_catalog.pg_type object_type
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object_type.typnamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
                   AND object_type.typtype IN ('b','c','d','e','r','m') AND object_type.typelem = 0
                   AND (object_type.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object_type.typrelid AND composite.relkind = 'c'))
                 ORDER BY 1, 2 LOOP
    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %s', object.nspname, object.typname, grantee.grantee_sql);
    END LOOP;
  END LOOP;
  FOR object IN SELECT oid FROM pg_catalog.pg_largeobject_metadata ORDER BY oid LOOP
    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON LARGE OBJECT %s FROM %s', object.oid, grantee.grantee_sql);
    END LOOP;
  END LOOP;
  FOR object IN SELECT fdwname FROM pg_catalog.pg_foreign_data_wrapper ORDER BY fdwname LOOP
    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FOREIGN DATA WRAPPER %I FROM %s', object.fdwname, grantee.grantee_sql);
    END LOOP;
  END LOOP;
  FOR object IN SELECT srvname FROM pg_catalog.pg_foreign_server ORDER BY srvname LOOP
    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FOREIGN SERVER %I FROM %s', object.srvname, grantee.grantee_sql);
    END LOOP;
  END LOOP;
END $bcb$;

-- Existing and future PostgreSQL-created objects are deny-by-default for PUBLIC.
DO $bcb$ DECLARE default_acl record; BEGIN
  FOR default_acl IN
    SELECT DISTINCT owner_role.rolname, namespace.nspname, grantee.grantee_sql, stored_default.defaclobjtype
      FROM pg_catalog.pg_default_acl stored_default
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = stored_default.defaclrole
      LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.oid = stored_default.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(stored_default.defaclacl) acl
      JOIN bcb_zero_state_grantees grantee ON grantee.role_oid = acl.grantee
     WHERE acl.grantee <> stored_default.defaclrole ORDER BY 1, 2 NULLS FIRST, 4
  LOOP
    EXECUTE pg_catalog.format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL PRIVILEGES ON %s FROM %s',
      default_acl.rolname, CASE WHEN default_acl.nspname IS NULL THEN '' ELSE pg_catalog.format(' IN SCHEMA %I', default_acl.nspname) END,
      CASE default_acl.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'ROUTINES' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' ELSE 'TABLES' END, default_acl.grantee_sql);
  END LOOP;
END $bcb$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON SCHEMAS FROM PUBLIC;
DO $bcb$ DECLARE schema_name name; object_type text; BEGIN
  FOR schema_name IN SELECT nspname FROM pg_catalog.pg_namespace
                      WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LOOP
    FOREACH object_type IN ARRAY ARRAY['TABLES','SEQUENCES','ROUTINES','TYPES'] LOOP
      EXECUTE pg_catalog.format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL PRIVILEGES ON %s FROM PUBLIC', schema_name, object_type);
    END LOOP;
  END LOOP;
END $bcb$;

-- No policy survives; every base/partitioned table has native FORCE RLS default deny.
DO $bcb$ DECLARE object record; BEGIN
  FOR object IN SELECT namespace.nspname, relation.relname, policy.polname
                  FROM pg_catalog.pg_policy policy
                  JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' ORDER BY 1, 2, 3 LOOP
    EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I', object.polname, object.nspname, object.relname);
  END LOOP;
  FOR object IN SELECT namespace.nspname, relation.relname
                  FROM pg_catalog.pg_class relation
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
                   AND relation.relkind IN ('r','p') ORDER BY 1, 2 LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', object.nspname, object.relname);
    EXECUTE pg_catalog.format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', object.nspname, object.relname);
  END LOOP;
END $bcb$;

-- Bilateral zero-state verifier: ACL, ownership, membership, defaults, policies and FORCE RLS.
DO $bcb$ DECLARE bad text; BEGIN
  SELECT role_name INTO bad FROM bcb_zero_state_roles target JOIN pg_catalog.pg_roles role ON role.rolname = target.role_name
   WHERE role.rolcanlogin OR role.rolsuper OR role.rolcreatedb OR role.rolcreaterole OR role.rolinherit OR role.rolreplication OR role.rolbypassrls LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state unsafe role attributes: %', bad; END IF;
  SELECT granted.rolname || '->' || member.rolname INTO bad
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
   WHERE granted.rolname IN (SELECT role_name FROM bcb_zero_state_roles)
      OR member.rolname IN (SELECT role_name FROM bcb_zero_state_roles) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state membership survived: %', bad; END IF;
  SELECT namespace.nspname || '.' || relation.relname INTO bad
    FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND relation.relkind IN ('r','p')
     AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state table is not FORCE RLS: %', bad; END IF;
  SELECT namespace.nspname || '.' || relation.relname || ':' || policy.polname INTO bad
    FROM pg_catalog.pg_policy policy JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state policy survived: %', bad; END IF;
  WITH acl(grantee, owner_oid, object_name) AS (
    SELECT acl.grantee, database.datdba, 'database:' || database.datname FROM pg_catalog.pg_database database CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(database.datacl, pg_catalog.acldefault('d', database.datdba))) acl WHERE database.datname = 'bcb_webapp_dev'
    UNION ALL SELECT acl.grantee, namespace.nspowner, 'schema:' || namespace.nspname FROM pg_catalog.pg_namespace namespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) acl
      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
    UNION ALL SELECT acl.grantee, relation.relowner, 'relation:' || namespace.nspname || '.' || relation.relname FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(relation.relacl, pg_catalog.acldefault(CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, relation.relowner))) acl
      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND relation.relkind IN ('r','p','v','m','f','S')
    UNION ALL SELECT acl.grantee, relation.relowner, 'column:' || namespace.nspname || '.' || relation.relname || '.' || attribute.attname FROM pg_catalog.pg_attribute attribute JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND attribute.attnum > 0 AND NOT attribute.attisdropped
    UNION ALL SELECT acl.grantee, routine.proowner, 'routine:' || namespace.nspname || '.' || routine.proname FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))) acl
      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
    UNION ALL SELECT acl.grantee, object.typowner, 'type:' || namespace.nspname || '.' || object.typname FROM pg_catalog.pg_type object JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(object.typacl, pg_catalog.acldefault('T', object.typowner))) acl
      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND object.typtype IN ('b','c','d','e','r','m') AND object.typelem = 0 AND (object.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object.typrelid AND composite.relkind = 'c'))
    UNION ALL SELECT acl.grantee, object.lomowner, 'large_object:' || object.oid::text FROM pg_catalog.pg_largeobject_metadata object CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(object.lomacl, pg_catalog.acldefault('L', object.lomowner))) acl
    UNION ALL SELECT acl.grantee, wrapper.fdwowner, 'fdw:' || wrapper.fdwname FROM pg_catalog.pg_foreign_data_wrapper wrapper CROSS JOIN LATERAL pg_catalog.aclexplode(wrapper.fdwacl) acl
    UNION ALL SELECT acl.grantee, server.srvowner, 'server:' || server.srvname FROM pg_catalog.pg_foreign_server server CROSS JOIN LATERAL pg_catalog.aclexplode(server.srvacl) acl
    UNION ALL SELECT acl.grantee, language.lanowner, 'language:' || language.lanname FROM pg_catalog.pg_language language CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(language.lanacl, pg_catalog.acldefault('l', language.lanowner))) acl WHERE language.lanpltrusted
    UNION ALL SELECT acl.grantee, defaults.defaclrole, 'default_acl:' || owner_role.rolname FROM pg_catalog.pg_default_acl defaults JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = defaults.defaclrole CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) acl
  ) SELECT object_name INTO bad FROM acl WHERE grantee <> owner_oid LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state ACL survived: %', bad; END IF;
  WITH owner_ref(owner_oid, object_name) AS (
    SELECT database.datdba, 'database:' || database.datname FROM pg_catalog.pg_database database WHERE database.datname = 'bcb_webapp_dev'
    UNION ALL SELECT namespace.nspowner, 'schema:' || namespace.nspname FROM pg_catalog.pg_namespace namespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
    UNION ALL SELECT relation.relowner, 'relation:' || namespace.nspname || '.' || relation.relname FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
    UNION ALL SELECT routine.proowner, 'routine:' || namespace.nspname || '.' || routine.proname FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
    UNION ALL SELECT object.typowner, 'type:' || namespace.nspname || '.' || object.typname FROM pg_catalog.pg_type object JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND object.typtype IN ('b','c','d','e','r','m') AND object.typelem = 0 AND (object.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object.typrelid AND composite.relkind = 'c'))
    UNION ALL SELECT object.collowner, 'collation:' || namespace.nspname || '.' || object.collname FROM pg_catalog.pg_collation object JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.collnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'
    UNION ALL SELECT object.lomowner, 'large_object:' || object.oid::text FROM pg_catalog.pg_largeobject_metadata object
    UNION ALL SELECT object.fdwowner, 'fdw:' || object.fdwname FROM pg_catalog.pg_foreign_data_wrapper object
    UNION ALL SELECT object.srvowner, 'server:' || object.srvname FROM pg_catalog.pg_foreign_server object
    UNION ALL SELECT object.lanowner, 'language:' || object.lanname FROM pg_catalog.pg_language object WHERE object.lanname <> 'internal'
  ) SELECT object_name INTO bad FROM owner_ref JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = owner_ref.owner_oid
     WHERE owner_role.rolname <> 'postgres' LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state non-DBA owner survived: %', bad; END IF;
  RAISE NOTICE 'BCB_ZERO_STATE_VERIFIED database=bcb_webapp_dev';
END $bcb$;

-- end zero-state database migration.
