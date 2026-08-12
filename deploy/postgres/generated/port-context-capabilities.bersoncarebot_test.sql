-- Declaration-owned production port-context capabilities: exact replace for managed logins.
CREATE TEMP TABLE bcb_declared_port_context_capabilities ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('1eb8740a-35aa-55ac-ad65-49eb89bad6ca'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-advance', 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)'::regprocedure),
  ('2ae8918b-e7a5-532e-881e-cb49b5c5d55f'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.delete', 'app.delete_google_calendar_event_id(uuid)'::regprocedure),
  ('8c554c99-95a0-5a5f-813e-5e83c770e0f1'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.get', 'app.get_google_calendar_event_id(uuid)'::regprocedure),
  ('fbf12f41-b739-542e-b7d4-5aca566b1e08'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.data-quality.upsert', 'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)'::regprocedure),
  ('c6968fc5-a2c1-5893-9f80-9a5fa7f17f07'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('dde6a763-f3b0-5eb3-a22f-da73de65f3c0'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.idempotency.acquire', 'app.try_acquire_integrator_idempotency(text,integer)'::regprocedure),
  ('e8061b3c-962d-505d-ad56-47d969906d17'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.idempotency.release', 'app.release_integrator_idempotency(text)'::regprocedure),
  ('093e690d-4b8a-57ba-8b27-74d07d6cab5f'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'migration.ledger.read', 'app.read_integrator_migration_ledger()'::regprocedure),
  ('736ee1a4-d966-58ea-bbfe-e246635395df'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_integrator_request'::name, 'integrator'::app.port_context_class, 'relation', NULL::regprocedure),
  ('3e1c56cd-7931-527b-9076-f60ea8b28b2e'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'relation', NULL::regprocedure),
  ('4da8e220-bb91-5e61-b4d1-eb7efbf336cb'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('2998004f-06ea-5827-9d59-2e1139ce40c2'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('5e833899-e24f-518a-95b2-796c32f41551'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('c04aa0ce-a7c8-553b-8e9e-ec5cd941fb61'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_patient'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.self.allowed', 'app.is_current_patient_self_booking_allowed()'::regprocedure),
  ('30d69dff-9550-5f54-81ab-e383f1b8ba27'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'scheduler.reminder-organizations', 'app.list_scheduler_reminder_organization_ids()'::regprocedure),
  ('efb39c74-08b3-5efe-b7de-5dc559fef554'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-mark', 'app.mark_operator_incident_alert_sent(uuid)'::regprocedure),
  ('3f0388d3-5ffb-570e-ad6d-c03a35abee0e'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-status', 'app.operator_incident_alert_already_sent(uuid)'::regprocedure),
  ('11d761a2-a8fc-5917-ba7b-86d1f93f7fd5'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.acquire', 'app.password_login_acquire(text,text,uuid,text)'::regprocedure),
  ('16857960-8508-5a9f-a9f8-f3b5436d9df2'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.complete', 'app.password_login_complete(uuid,boolean)'::regprocedure),
  ('c6ba0c21-2360-50fc-9ba6-f26b30d4835e'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-issue', 'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure),
  ('ac70473e-15f3-5f4e-a0b9-b21032166001'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-secret', 'app.password_login_read_altcha_secret()'::regprocedure),
  ('9c1895d1-810f-549a-a48f-545b577f3a6f'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.staff-comment.read', 'app.read_booking_calendar_latest_staff_comment(uuid)'::regprocedure),
  ('9ebf080c-e1cf-5c2d-9d60-7af191350b8c'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.patient-profile.read', 'app.read_booking_calendar_patient_profile(uuid)'::regprocedure),
  ('a3781480-4722-5a38-998d-738fe683e715'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_staff'::name, 'staff'::app.port_context_class, 'messaging.patient-telegram-handle.read', 'app.read_patient_telegram_display_handle(uuid)'::regprocedure),
  ('e2603175-6073-5229-9e48-3a5e789953f2'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.resolve-scope', 'app.resolve_outgoing_delivery_scope(uuid)'::regprocedure),
  ('bf4d1959-14bb-5e24-8347-65bb08d7649c'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-revalidate', 'app.revalidate_appointment_reminder_materialization(uuid)'::regprocedure),
  ('00b8139c-8f88-5569-9999-f5f977fe625d'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.upsert', 'app.upsert_google_calendar_event_id(uuid,text)'::regprocedure),
  ('a95ea064-1d03-5f18-8986-af68845481bf'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_clinic_billing'::name, 'staff'::app.port_context_class, 'relation', NULL::regprocedure),
  ('7306597a-01b2-5112-9e95-ffdea41aeda8'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_operational_media_worker'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('3dfd3b8b-2127-53fe-b956-461b5dc71a7c'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_patient'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'relation', NULL::regprocedure),
  ('aa0de683-10f0-556c-9d68-c1efe433cfc0'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'relation', NULL::regprocedure),
  ('735744a1-01d0-5f1b-9e96-491ccc430890'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'relation', NULL::regprocedure),
  ('c751df3d-e35a-5518-86f4-a59ea1cab203'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_staff'::name, 'staff'::app.port_context_class, 'relation', NULL::regprocedure),
  ('86e3ce73-2e26-567b-a8b3-7da77b3597b8'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'saas_telemetry_operator'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('684ccb01-4910-5596-825f-bc997855eacf'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_worker'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure)
) AS v(capability_id, port, session_login, target_role, context_class, purpose, function_identity);
DELETE FROM app_ext.port_context_capabilities existing
 WHERE existing.session_login = ANY (ARRAY['bcb_test_integrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff']::name[])
   AND NOT EXISTS (SELECT 1 FROM bcb_declared_port_context_capabilities declared
                   WHERE declared.capability_id = existing.capability_id);
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT capability_id, port, session_login, target_role, context_class, purpose, function_identity
  FROM bcb_declared_port_context_capabilities
ON CONFLICT (capability_id) DO UPDATE SET
  port = EXCLUDED.port, session_login = EXCLUDED.session_login, target_role = EXCLUDED.target_role,
  context_class = EXCLUDED.context_class, purpose = EXCLUDED.purpose,
  function_identity = EXCLUDED.function_identity, active_until = NULL;
ALTER TABLE app_ext.port_context_capabilities
  DROP CONSTRAINT IF EXISTS port_context_capabilities_port_session_login_target_role_co_key;
ALTER TABLE app_ext.port_context_capabilities
  DROP CONSTRAINT IF EXISTS port_context_capabilities_authority_tuple_key;
