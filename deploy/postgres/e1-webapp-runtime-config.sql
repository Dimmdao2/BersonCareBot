-- Canonical strict/fresh overlay for the E1 safe runtime projection.
-- Keep executable content single-sourced in the registered Drizzle migration.
\set ON_ERROR_STOP on
\if :{?e1_webapp_runtime_role}
\else
\echo 'FATAL: missing e1_webapp_runtime_role.'
SELECT 1 / 0 AS e1_webapp_runtime_role_missing;
\endif

\ir ../../apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql
\ir ../../apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql
\ir ../../apps/webapp/db/drizzle-migrations/0195_e1_patient_maintenance_history.sql

GRANT SELECT ON TABLE
  public.app_runtime_settings,
  public.system_settings,
  public.platform_users,
  public.user_channel_bindings,
  public.org_enrollments,
  public.be_appointments,
  public.be_specialists,
  public.be_branches,
  public.be_rooms,
  public.be_clinic_services
  TO app_owner;
ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.read_webapp_server_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.is_current_patient_test_account() OWNER TO app_owner;
ALTER FUNCTION app.read_current_patient_appointment_history() OWNER TO app_owner;
REVOKE ALL ON TABLE public.system_settings, public.system_settings_audit FROM app_patient;
GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;
REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings
  FROM :"e1_webapp_runtime_role";
REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  FROM PUBLIC, app_patient, app_staff;
-- Reset the patient capability ACL exactly. Revoke app_patient first WITH CASCADE so any grants it
-- delegated while holding a stale grant option disappear before the remaining direct grantees are
-- enumerated. Then remove every explicit non-owner/non-patient ACL entry, including unknown roles.
REVOKE ALL PRIVILEGES ON FUNCTION app.is_current_patient_test_account()
  FROM app_patient CASCADE;
DO $acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure
      AND privilege.grantee <> procedure.proowner
      AND privilege.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION app.is_current_patient_test_account() FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.is_current_patient_test_account() FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$acl_scrub$;
REVOKE ALL PRIVILEGES ON FUNCTION app.read_current_patient_appointment_history()
  FROM app_patient CASCADE;
DO $history_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.read_current_patient_appointment_history()'::regprocedure
      AND privilege.grantee <> procedure.proowner
      AND privilege.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION app.read_current_patient_appointment_history() FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_current_patient_appointment_history() FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$history_acl_scrub$;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.read_public_runtime_setting(text, text),
  app.read_webapp_server_runtime_setting(text, text)
  FROM :"e1_webapp_runtime_role" CASCADE;
GRANT USAGE ON SCHEMA app TO :"e1_webapp_runtime_role";
GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text)
  TO :"e1_webapp_runtime_role";
GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  TO :"e1_webapp_runtime_role";
GRANT EXECUTE ON FUNCTION app.is_current_patient_test_account()
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.read_current_patient_appointment_history()
  TO app_patient;

SELECT 1 / (
  has_function_privilege(
    :'e1_webapp_runtime_role',
    'app.read_public_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND NOT has_table_privilege(
    :'e1_webapp_runtime_role',
    'public.system_settings',
    'SELECT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS privilege
    WHERE relation.oid IN (
      'public.app_runtime_settings'::regclass,
      'public.system_settings'::regclass
    )
      AND privilege.privilege_type = 'SELECT'
      AND privilege.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = :'e1_webapp_runtime_role')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.app_runtime_settings'::regclass,
      'public.system_settings'::regclass
    )
      AND pg_has_role(
        :'e1_webapp_runtime_role',
        relation.relowner,
        'MEMBER'
      )
  )
  AND has_function_privilege(
    :'e1_webapp_runtime_role',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND 2 = (
    SELECT count(*)
    FROM pg_proc procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    WHERE procedure.oid IN (
        'app.read_public_runtime_setting(text,text)'::regprocedure,
        'app.read_webapp_server_runtime_setting(text,text)'::regprocedure
      )
      AND privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee = (
        SELECT oid FROM pg_roles WHERE rolname = :'e1_webapp_runtime_role'
      )
      AND NOT privilege.is_grantable
  )
  AND NOT has_function_privilege(
    'app_patient',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'app_patient',
    'app.is_current_patient_test_account()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_staff',
    'app.is_current_patient_test_account()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'e1_webapp_runtime_role',
    'app.is_current_patient_test_account()',
    'EXECUTE'
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure
      AND privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
      AND NOT privilege.is_grantable
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure
      AND privilege.grantee NOT IN (
        procedure.proowner,
        (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.is_current_patient_test_account()'::regprocedure
      AND (privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable)
  )
  AND NOT pg_has_role('app_patient', 'app_owner', 'MEMBER')
  AND NOT pg_has_role('app_staff', 'app_owner', 'MEMBER')
  AND NOT pg_has_role(:'e1_webapp_runtime_role', 'app_owner', 'MEMBER')
  AND 1 = (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_current_patient_appointment_history()'::regprocedure
      AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_current_patient_appointment_history()'::regprocedure
      AND (
        privilege.grantee NOT IN (
          procedure.proowner,
          (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
        )
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
)::int AS e1_webapp_runtime_acl_closed;
