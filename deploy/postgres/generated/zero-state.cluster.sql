-- ============================================================================
-- СГЕНЕРИРОВАННЫЙ ФИНАЛИЗАТОР ТОЧКИ НОЛЬ — УДАЛЯЕТ EXACT APPLICATION ROLES.
-- источник:   deploy/postgres/privileges/declaration.ts
-- применять только после zero-state.<db>.sql для КАЖДОЙ управляемой базы.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMP TABLE bcb_zero_state_cluster_guard ON COMMIT DROP AS SELECT 1;
CREATE TEMP TABLE bcb_zero_state_cluster_roles (role_name name PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bcb_zero_state_cluster_roles SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_clinic_billing', 'app_integrator_request', 'app_integrator_resolver', 'app_object_owner', 'app_operational_delivery_worker', 'app_operational_media_worker', 'app_operational_scheduler', 'app_owner', 'app_patient', 'app_platform_settings', 'app_pre_session', 'app_seam_catalog_admin_owner', 'app_seam_catalog_public_owner', 'app_seam_context_owner', 'app_seam_dedicated_bot_owner', 'app_seam_delivery_scope_owner', 'app_seam_email_otp_owner', 'app_seam_identity_lookup_owner', 'app_seam_login_token_owner', 'app_seam_oauth_owner', 'app_seam_org_commerce_owner', 'app_seam_org_directory_owner', 'app_seam_org_invite_owner', 'app_seam_passkey_owner', 'app_seam_password_auth_owner', 'app_seam_patient_booking_owner', 'app_seam_patient_invite_owner', 'app_seam_patient_lfk_media_owner', 'app_seam_patient_org_projection_owner', 'app_seam_patient_program_resolver_owner', 'app_seam_patient_self_actions_owner', 'app_seam_payment_webhook_owner', 'app_seam_phone_binding_owner', 'app_seam_phone_otp_owner', 'app_seam_public_booking_owner', 'app_seam_public_slug_owner', 'app_seam_reminder_appointment_owner', 'app_seam_reminder_email_cooldown_owner', 'app_seam_reminder_materialization_owner', 'app_seam_reminder_patient_owner', 'app_seam_reminder_specialist_owner', 'app_seam_self_security_owner', 'app_seam_settings_integrator_owner', 'app_seam_settings_preauth_owner', 'app_seam_settings_runtime_owner', 'app_seam_specialist_provision_owner', 'app_seam_staff_security_owner', 'app_seam_telemetry_exclusion_owner', 'app_seam_telemetry_media_owner', 'app_seam_telemetry_operator_owner', 'app_seam_telemetry_patient_owner', 'app_service', 'app_staff', 'app_tenant_service', 'app_worker', 'bcb_dev_integrator', 'bcb_dev_migrator', 'bcb_dev_webapp_patient', 'bcb_dev_webapp_staff', 'bcb_test_integrator', 'bcb_test_migrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff', 'bcb_webapp_dev_user', 'bersoncarebot_test', 'saas_system_health_owner', 'saas_telemetry_operator', 'saas_telemetry_owner']::name[]);
DO $bcb$ DECLARE target record; database record; edge record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_clinic_billing', 'app_integrator_request', 'app_integrator_resolver', 'app_object_owner', 'app_operational_delivery_worker', 'app_operational_media_worker', 'app_operational_scheduler', 'app_owner', 'app_patient', 'app_platform_settings', 'app_pre_session', 'app_seam_catalog_admin_owner', 'app_seam_catalog_public_owner', 'app_seam_context_owner', 'app_seam_dedicated_bot_owner', 'app_seam_delivery_scope_owner', 'app_seam_email_otp_owner', 'app_seam_identity_lookup_owner', 'app_seam_login_token_owner', 'app_seam_oauth_owner', 'app_seam_org_commerce_owner', 'app_seam_org_directory_owner', 'app_seam_org_invite_owner', 'app_seam_passkey_owner', 'app_seam_password_auth_owner', 'app_seam_patient_booking_owner', 'app_seam_patient_invite_owner', 'app_seam_patient_lfk_media_owner', 'app_seam_patient_org_projection_owner', 'app_seam_patient_program_resolver_owner', 'app_seam_patient_self_actions_owner', 'app_seam_payment_webhook_owner', 'app_seam_phone_binding_owner', 'app_seam_phone_otp_owner', 'app_seam_public_booking_owner', 'app_seam_public_slug_owner', 'app_seam_reminder_appointment_owner', 'app_seam_reminder_email_cooldown_owner', 'app_seam_reminder_materialization_owner', 'app_seam_reminder_patient_owner', 'app_seam_reminder_specialist_owner', 'app_seam_self_security_owner', 'app_seam_settings_integrator_owner', 'app_seam_settings_preauth_owner', 'app_seam_settings_runtime_owner', 'app_seam_specialist_provision_owner', 'app_seam_staff_security_owner', 'app_seam_telemetry_exclusion_owner', 'app_seam_telemetry_media_owner', 'app_seam_telemetry_operator_owner', 'app_seam_telemetry_patient_owner', 'app_service', 'app_staff', 'app_tenant_service', 'app_worker', 'bcb_dev_integrator', 'bcb_dev_migrator', 'bcb_dev_webapp_patient', 'bcb_dev_webapp_staff', 'bcb_test_integrator', 'bcb_test_migrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff', 'bcb_webapp_dev_user', 'bersoncarebot_test', 'saas_system_health_owner', 'saas_telemetry_operator', 'saas_telemetry_owner']::name[]) AND rolsuper) THEN
    RAISE EXCEPTION 'application identity is SUPERUSER; cluster zero-state refused';
  END IF;
  FOR edge IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
     WHERE granted.rolname IN (SELECT role_name FROM bcb_zero_state_cluster_roles)
        OR member.rolname IN (SELECT role_name FROM bcb_zero_state_cluster_roles)
     ORDER BY 1, 2 LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', edge.granted_role, edge.member_role);
  END LOOP;
  FOR target IN SELECT role_name FROM bcb_zero_state_cluster_roles ORDER BY role_name LOOP
    EXECUTE pg_catalog.format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', target.role_name);
    EXECUTE pg_catalog.format('ALTER ROLE %I RESET ALL', target.role_name);
    FOR database IN SELECT datname FROM pg_catalog.pg_database ORDER BY datname LOOP
      EXECUTE pg_catalog.format('ALTER ROLE %I IN DATABASE %I RESET ALL', target.role_name, database.datname);
    END LOOP;
  END LOOP;
  FOR target IN SELECT role_name FROM bcb_zero_state_cluster_roles ORDER BY role_name LOOP
    EXECUTE pg_catalog.format('DROP ROLE %I', target.role_name);
  END LOOP;
END $bcb$;
DO $bcb$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (ARRAY['app_clinic_billing', 'app_integrator_request', 'app_integrator_resolver', 'app_object_owner', 'app_operational_delivery_worker', 'app_operational_media_worker', 'app_operational_scheduler', 'app_owner', 'app_patient', 'app_platform_settings', 'app_pre_session', 'app_seam_catalog_admin_owner', 'app_seam_catalog_public_owner', 'app_seam_context_owner', 'app_seam_dedicated_bot_owner', 'app_seam_delivery_scope_owner', 'app_seam_email_otp_owner', 'app_seam_identity_lookup_owner', 'app_seam_login_token_owner', 'app_seam_oauth_owner', 'app_seam_org_commerce_owner', 'app_seam_org_directory_owner', 'app_seam_org_invite_owner', 'app_seam_passkey_owner', 'app_seam_password_auth_owner', 'app_seam_patient_booking_owner', 'app_seam_patient_invite_owner', 'app_seam_patient_lfk_media_owner', 'app_seam_patient_org_projection_owner', 'app_seam_patient_program_resolver_owner', 'app_seam_patient_self_actions_owner', 'app_seam_payment_webhook_owner', 'app_seam_phone_binding_owner', 'app_seam_phone_otp_owner', 'app_seam_public_booking_owner', 'app_seam_public_slug_owner', 'app_seam_reminder_appointment_owner', 'app_seam_reminder_email_cooldown_owner', 'app_seam_reminder_materialization_owner', 'app_seam_reminder_patient_owner', 'app_seam_reminder_specialist_owner', 'app_seam_self_security_owner', 'app_seam_settings_integrator_owner', 'app_seam_settings_preauth_owner', 'app_seam_settings_runtime_owner', 'app_seam_specialist_provision_owner', 'app_seam_staff_security_owner', 'app_seam_telemetry_exclusion_owner', 'app_seam_telemetry_media_owner', 'app_seam_telemetry_operator_owner', 'app_seam_telemetry_patient_owner', 'app_service', 'app_staff', 'app_tenant_service', 'app_worker', 'bcb_dev_integrator', 'bcb_dev_migrator', 'bcb_dev_webapp_patient', 'bcb_dev_webapp_staff', 'bcb_test_integrator', 'bcb_test_migrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff', 'bcb_webapp_dev_user', 'bersoncarebot_test', 'saas_system_health_owner', 'saas_telemetry_operator', 'saas_telemetry_owner']::name[])) THEN
    RAISE EXCEPTION 'zero-state application role survived cluster finalizer';
  END IF;
  RAISE NOTICE 'BCB_ZERO_STATE_CLUSTER_VERIFIED';
END $bcb$;

-- end zero-state cluster finalizer.
