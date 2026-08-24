-- Canonical strict/fresh overlay for the E1 safe runtime projection.
\set ON_ERROR_STOP on
\if :{?e1_webapp_runtime_role}
\else
\echo 'FATAL: missing e1_webapp_runtime_role.'
SELECT 1 / 0 AS e1_webapp_runtime_role_missing;
\endif

-- Non-destructive quarantine for a replay against an already-populated saas_isolation_events
-- (post-restore/rehydration; the fresh-migration case starts with an empty table and this is a
-- no-op). 0193/0194/0201/0202 below each re-run their OWN
-- ALTER TABLE ... ADD CONSTRAINT saas_isolation_events_source_operation_check, and each list is a
-- strict subset of the next (0193 subset 0194 subset 0201 subset 0202 = the final vocabulary that
-- deploy/postgres/saas-isolation-telemetry.sql re-asserts after this whole chain). A row reported
-- under an operation family that only a LATER file in this chain allows (for example
-- ('webapp','auth_role_config'), first allowed at 0201) already legitimately exists in a
-- rehydrated table and makes 0193's own narrower ADD CONSTRAINT fail outright before the chain
-- ever reaches the file that would have accepted it. Move every current row aside for the
-- duration of the replay and restore it once the chain reaches its final, widest state: every row
-- already in this table was written by app.report_saas_isolation_event under whatever constraint
-- was active at the time, so it is guaranteed to satisfy the (monotonically wider) final
-- constraint again.
CREATE TEMP TABLE saas_isolation_events_e1_quarantine AS
  TABLE public.saas_isolation_events WITH NO DATA;
CREATE TEMP TABLE saas_isolation_event_hourly_e1_quarantine AS
  TABLE public.saas_isolation_event_hourly WITH NO DATA;
INSERT INTO saas_isolation_events_e1_quarantine SELECT * FROM public.saas_isolation_events;
INSERT INTO saas_isolation_event_hourly_e1_quarantine SELECT * FROM public.saas_isolation_event_hourly;
-- ON DELETE CASCADE already empties saas_isolation_event_hourly; the hourly rows were copied above.
DELETE FROM public.saas_isolation_events;

\ir ../../apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql
\ir ../../apps/webapp/db/drizzle-migrations/0194_e1_patient_identity_exception.sql
\ir ../../apps/webapp/db/drizzle-migrations/0195_e1_patient_maintenance_history.sql
\ir ../../apps/webapp/db/drizzle-migrations/0197_patient_plan_opened_capability.sql
\ir ../../apps/webapp/db/drizzle-migrations/0198_patient_visible_catalog_reads.sql
-- Replay the current booking capability definition. Migration 0262 is repeat-safe and also keeps
-- the retired Rubitime data surface absent before the capability ACL is re-pinned below.
\ir ../../apps/webapp/db/drizzle-migrations/0262_remove_rubitime_data.sql
\ir ../../apps/webapp/db/drizzle-migrations/0200_current_patient_product_analytics.sql
\ir ../../apps/webapp/db/drizzle-migrations/0201_e1_webapp_auth_role_runtime_config.sql
\ir ../../apps/webapp/db/drizzle-migrations/0202_current_patient_ui_capabilities.sql
\ir ../../apps/webapp/db/drizzle-migrations/0216_current_patient_organization_context.sql
\ir ../../apps/webapp/db/drizzle-migrations/0230_error_tracking_runtime.sql
\ir ../../apps/webapp/db/drizzle-migrations/0231_admin_email_role_runtime_config.sql
\ir ../../apps/webapp/db/drizzle-migrations/0234_current_patient_support_activity.sql
\ir e1-current-patient-organization-entitlements.sql

-- Restore the quarantined rows now that the final (widest) allowed-pair vocabulary from the chain
-- above is active; every restored row already satisfies it (see quarantine comment above).
INSERT INTO public.saas_isolation_events SELECT * FROM saas_isolation_events_e1_quarantine;
INSERT INTO public.saas_isolation_event_hourly SELECT * FROM saas_isolation_event_hourly_e1_quarantine;
DROP TABLE saas_isolation_events_e1_quarantine;
DROP TABLE saas_isolation_event_hourly_e1_quarantine;

GRANT SELECT ON TABLE
  public.system_settings,
  public.platform_users,
  public.user_channel_bindings,
  public.org_enrollments,
  public.be_organizations,
  public.be_appointments,
  public.be_specialists,
  public.be_branches,
  public.be_rooms,
  public.be_clinic_services,
  public.saas_tariffs,
  public.saas_org_entitlement_overrides,
  public.saas_organization_trials,
  public.patient_bookings,
  public.treatment_program_instances,
  public.product_analytics_events_recent,
  public.product_analytics_hourly,
  public.product_analytics_user_hourly,
  public.product_push_notifications,
  public.support_conversations,
  public.support_conversation_messages
  TO app_owner;
GRANT UPDATE ON TABLE
  public.treatment_program_instances,
  public.support_conversations
  TO app_owner;
GRANT INSERT ON TABLE public.product_analytics_events_recent TO app_owner;
GRANT INSERT, UPDATE ON TABLE
  public.product_analytics_hourly,
  public.product_analytics_user_hourly
  TO app_owner;
ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.read_webapp_server_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.is_current_patient_test_account() OWNER TO app_owner;
ALTER FUNCTION app.read_current_patient_appointment_history() OWNER TO app_owner;
ALTER FUNCTION app.touch_current_patient_plan_last_opened(uuid) OWNER TO app_owner;
ALTER FUNCTION app.read_current_patient_booking_rows(text,timestamptz) OWNER TO app_owner;
ALTER FUNCTION app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb) OWNER TO app_owner;
ALTER FUNCTION app.record_current_patient_push_open(timestamptz,text,uuid) OWNER TO app_owner;
ALTER FUNCTION app.read_current_patient_ui_setting(text,text) OWNER TO app_owner;
ALTER FUNCTION app.set_current_patient_calendar_timezone(text,boolean) OWNER TO app_owner;
ALTER FUNCTION app.read_current_patient_active_organizations() OWNER TO app_owner;
ALTER FUNCTION app.resolve_current_patient_treatment_program_organization(uuid) OWNER TO app_owner;
ALTER FUNCTION app.read_current_patient_organization_entitlements() OWNER TO app_owner;
ALTER FUNCTION app.touch_current_patient_support_conversation_activity(uuid) OWNER TO app_owner;
GRANT USAGE ON SCHEMA app TO app_owner, app_patient;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id()
  TO app_owner;
DO $capability_acl_scrub$
DECLARE
  v_function regprocedure;
  v_grantee oid;
  v_grantee_name text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'app.touch_current_patient_plan_last_opened(uuid)'::regprocedure,
    'app.read_current_patient_booking_rows(text,timestamptz)'::regprocedure,
    'app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)'::regprocedure,
    'app.record_current_patient_push_open(timestamptz,text,uuid)'::regprocedure,
    'app.read_current_patient_ui_setting(text,text)'::regprocedure,
    'app.set_current_patient_calendar_timezone(text,boolean)'::regprocedure,
    'app.read_current_patient_active_organizations()'::regprocedure,
    'app.resolve_current_patient_treatment_program_organization(uuid)'::regprocedure,
    'app.read_current_patient_organization_entitlements()'::regprocedure,
    'app.touch_current_patient_support_conversation_activity(uuid)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC CASCADE', v_function);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM app_patient CASCADE', v_function);
    FOR v_grantee, v_grantee_name IN
      SELECT DISTINCT privilege.grantee, role.rolname
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
      LEFT JOIN pg_roles role ON role.oid = privilege.grantee
      WHERE procedure.oid = v_function
        AND privilege.grantee NOT IN (0, procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname='app_patient'))
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I CASCADE', v_function, v_grantee_name);
    END LOOP;
  END LOOP;
END
$capability_acl_scrub$;
REVOKE ALL ON TABLE public.system_settings, public.system_settings_audit FROM app_patient;
REVOKE ALL ON TABLE public.product_analytics_events_recent, public.product_push_notifications FROM app_patient;
REVOKE ALL ON TABLE public.saas_tariffs, public.saas_org_entitlement_overrides,
  public.saas_organization_trials FROM app_patient;
REVOKE SELECT ON TABLE public.system_settings
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
GRANT EXECUTE ON FUNCTION app.touch_current_patient_plan_last_opened(uuid)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.read_current_patient_booking_rows(text,timestamptz)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.record_current_patient_push_open(timestamptz,text,uuid)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.read_current_patient_ui_setting(text,text)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.set_current_patient_calendar_timezone(text,boolean)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.read_current_patient_active_organizations()
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.resolve_current_patient_treatment_program_organization(uuid)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.read_current_patient_organization_entitlements()
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.touch_current_patient_support_conversation_activity(uuid)
  TO app_patient;
GRANT SELECT ON TABLE
  public.patient_home_blocks,
  public.patient_home_block_items,
  public.content_sections,
  public.content_section_slug_history,
  public.content_pages,
  public.reference_categories,
  public.reference_items,
  public.org_enrollments
  TO app_patient;

SELECT 1 / (bool_and(
  procedure.prosecdef
  AND owner.rolname = 'app_owner'
  AND has_function_privilege('app_patient', procedure.oid, 'EXECUTE')
  AND NOT has_function_privilege('app_staff', procedure.oid, 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
    WHERE privilege.grantee NOT IN (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname='app_patient'))
  )
))::int AS e1_patient_capability_acl_exact
FROM pg_proc procedure
JOIN pg_roles owner ON owner.oid=procedure.proowner
WHERE procedure.oid = ANY(ARRAY[
  'app.touch_current_patient_plan_last_opened(uuid)'::regprocedure,
  'app.read_current_patient_booking_rows(text,timestamptz)'::regprocedure,
  'app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)'::regprocedure,
  'app.record_current_patient_push_open(timestamptz,text,uuid)'::regprocedure,
  'app.read_current_patient_ui_setting(text,text)'::regprocedure,
  'app.set_current_patient_calendar_timezone(text,boolean)'::regprocedure,
  'app.read_current_patient_active_organizations()'::regprocedure,
  'app.resolve_current_patient_treatment_program_organization(uuid)'::regprocedure,
  'app.read_current_patient_organization_entitlements()'::regprocedure,
  'app.touch_current_patient_support_conversation_activity(uuid)'::regprocedure
]);

SELECT 1 / (
  NOT has_table_privilege('app_patient','public.patient_bookings','SELECT')
  AND NOT has_table_privilege('app_patient','public.treatment_program_instances','UPDATE')
  AND NOT has_table_privilege('app_patient','public.product_analytics_events_recent','SELECT,INSERT')
  AND NOT has_table_privilege('app_patient','public.product_push_notifications','SELECT')
  AND NOT has_table_privilege('app_patient','public.product_analytics_hourly','INSERT,UPDATE')
  AND NOT has_table_privilege('app_patient','public.product_analytics_user_hourly','INSERT,UPDATE')
  AND NOT has_table_privilege('app_patient','public.system_settings','SELECT')
  AND NOT has_table_privilege('app_patient','public.platform_users','UPDATE')
  AND NOT has_column_privilege('app_patient','public.support_conversations','last_message_at','UPDATE')
  AND NOT has_column_privilege('app_patient','public.support_conversations','status','UPDATE')
  AND NOT has_table_privilege('app_patient','public.be_organizations','SELECT')
  AND NOT has_table_privilege('app_patient','public.saas_tariffs','SELECT')
  AND NOT has_table_privilege('app_patient','public.saas_org_entitlement_overrides','SELECT')
  AND NOT has_table_privilege('app_patient','public.saas_organization_trials','SELECT')
  AND has_table_privilege('app_patient','public.org_enrollments','SELECT')
  AND has_table_privilege('app_patient','public.reference_categories','SELECT')
  AND has_table_privilege('app_patient','public.reference_items','SELECT')
  AND NOT has_table_privilege('app_patient','public.org_enrollments','INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('app_patient','public.reference_categories','INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('app_patient','public.reference_items','INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('app_patient','public.content_pages','INSERT,UPDATE,DELETE')
)::int AS e1_patient_capability_no_direct_table_dml;

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
    WHERE relation.oid = 'public.system_settings'::regclass
      AND privilege.privilege_type = 'SELECT'
      AND privilege.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = :'e1_webapp_runtime_role')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.system_settings'::regclass
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
