-- Declaration-owned production port-context capabilities: exact replacement of the whole DB-local catalog.
CREATE TEMP TABLE bcb_declared_port_context_capabilities ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('c131c089-33a1-5ced-bd44-8dc85b500d11'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-advance', 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)'::regprocedure),
  ('13b68436-39b6-59ae-ba32-2a28aa0830c7'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'booking.admin-active.count', 'app.count_active_canonical_appointments()'::regprocedure),
  ('e0bd39d0-325a-503c-b5b4-97a43a66374d'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.delete', 'app.delete_google_calendar_event_id(uuid)'::regprocedure),
  ('aaa1cdfd-c6e5-5d5f-a9e1-c59f2adf07ea'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.get', 'app.get_google_calendar_event_id(uuid)'::regprocedure),
  ('a9d4ea23-27cb-5167-ab43-c0dfadffa2aa'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.data-quality.upsert', 'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)'::regprocedure),
  ('bac47f53-5caa-5b2c-bffc-7dab404a410b'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('d1b911df-a713-5d16-bed3-7ba45c575503'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.idempotency.acquire', 'app.try_acquire_integrator_idempotency(text,integer)'::regprocedure),
  ('4dcdf5c5-46bf-5ce0-b36d-58b082675981'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.idempotency.release', 'app.release_integrator_idempotency(text)'::regprocedure),
  ('a811a460-4853-541e-b027-a4e3c8c7bafb'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'migration.ledger.read', 'app.read_integrator_migration_ledger()'::regprocedure),
  ('e96f9d57-9b04-5416-a994-634d679dc4c4'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_integrator_request'::name, 'integrator'::app.port_context_class, 'relation', NULL::regprocedure),
  ('a223dc4c-f04c-5727-a2f3-abcfa8491346'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'relation', NULL::regprocedure),
  ('bf2352d4-e87a-56fe-8876-01e824fa9b34'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('c6f80a62-fbda-5b6c-b8dd-5a97c75f6c59'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_service'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('bd5bd4d1-83c3-5af2-8128-4f6b3fc994d0'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('38b3a5fd-bb3c-5a4e-aa44-c26007f39420'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_patient'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.self.allowed', 'app.is_current_patient_self_booking_allowed()'::regprocedure),
  ('5286bc2f-ac07-563a-9a11-9694f99c8f79'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_worker'::name, 'service'::app.port_context_class, 'booking.integrator-active.read', 'app.list_active_canonical_appointments_by_phone(text)'::regprocedure),
  ('b1b41e44-9559-51d3-a0a1-66f7931db4d9'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'scheduler.reminder-organizations', 'app.list_scheduler_reminder_organization_ids()'::regprocedure),
  ('af8e9023-5c1e-5800-a091-e769af3bc39e'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-mark', 'app.mark_operator_incident_alert_sent(uuid)'::regprocedure),
  ('f6047407-5066-5272-86a7-175d3c769094'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-status', 'app.operator_incident_alert_already_sent(uuid)'::regprocedure),
  ('e2cc335c-f69e-545f-99d4-c1c101f9cd05'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.acquire', 'app.password_login_acquire(text,text,uuid,text)'::regprocedure),
  ('2b73b16c-ab00-55a2-add0-604275ec23ec'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.complete', 'app.password_login_complete(uuid,boolean)'::regprocedure),
  ('bf624c2a-909f-5668-b101-dc4349129558'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-issue', 'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure),
  ('2ade5f49-9a15-5a1b-8353-eb3f0597c332'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-secret', 'app.password_login_read_altcha_secret()'::regprocedure),
  ('7b266c0b-3f4a-57a7-93b9-701d53c96083'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.staff-comment.read', 'app.read_booking_calendar_latest_staff_comment(uuid)'::regprocedure),
  ('d1abe776-2b34-58dc-9f25-825c046075ce'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.patient-profile.read', 'app.read_booking_calendar_patient_profile(uuid)'::regprocedure),
  ('2509e65a-324f-551a-810a-bdd75239fd94'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_worker'::name, 'service'::app.port_context_class, 'booking.integrator-record.read', 'app.read_canonical_appointment_by_external_id(text)'::regprocedure),
  ('9ab68871-f47d-5ea9-9510-6d0a16ddbc11'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_staff'::name, 'staff'::app.port_context_class, 'messaging.patient-telegram-handle.read', 'app.read_patient_telegram_display_handle(uuid)'::regprocedure),
  ('1eb67918-03f9-54ef-8478-32c4cead7b54'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.resolve-scope', 'app.resolve_outgoing_delivery_scope(uuid)'::regprocedure),
  ('05731ad5-0f0f-5acf-9001-086268a41c92'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-revalidate', 'app.revalidate_appointment_reminder_materialization(uuid)'::regprocedure),
  ('3e3b2f0a-2e02-5d92-b461-8b8d33c44844'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.upsert', 'app.upsert_google_calendar_event_id(uuid,text)'::regprocedure),
  ('8776512e-68c5-56cd-ba03-38bae50e4c80'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_clinic_billing'::name, 'staff'::app.port_context_class, 'relation', NULL::regprocedure),
  ('0e6ca92a-457d-5bdb-8216-b0bc0db27284'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_operational_media_worker'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('5d1846fa-50a6-5c4b-bc4d-eae4fe67b9f9'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_patient'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'identity.variant-a.resolve', 'app.pre_session_resolve_identity(uuid)'::regprocedure),
  ('aaf26a76-0f7d-56be-84c2-46c45ba1a7af'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_patient'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'relation', NULL::regprocedure),
  ('747f7186-5475-56bf-92c5-fc0cf833c66c'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'relation', NULL::regprocedure),
  ('f3b86e3a-c287-551e-acd1-dd9157040681'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'relation', NULL::regprocedure),
  ('41c7fd7c-fb07-5c99-bb3f-a09a0cfd7102'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'identity.variant-a.resolve', 'app.pre_session_resolve_identity(uuid)'::regprocedure),
  ('717e67dd-8bb1-501b-a365-1c0a06ebd6af'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_staff'::name, 'staff'::app.port_context_class, 'relation', NULL::regprocedure),
  ('9e7ebb15-1ba4-5e7d-b56f-99c4483da3d0'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'saas_telemetry_operator'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure),
  ('64d96f6e-cdd7-5e02-bf02-74d298852f71'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_worker'::name, 'service'::app.port_context_class, 'relation', NULL::regprocedure)
) AS v(capability_id, port, session_login, target_role, context_class, purpose, function_identity);
-- Cutover services are stopped. Transaction-bound accepted contexts must not survive a reseed.
DELETE FROM app_ext.accepted_port_contexts;
DELETE FROM app_ext.port_context_capabilities;
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT capability_id, port, session_login, target_role, context_class, purpose, function_identity
  FROM bcb_declared_port_context_capabilities
ON CONFLICT (capability_id) DO UPDATE SET
  port = EXCLUDED.port, session_login = EXCLUDED.session_login, target_role = EXCLUDED.target_role,
  context_class = EXCLUDED.context_class, purpose = EXCLUDED.purpose,
  function_identity = EXCLUDED.function_identity, active_from = clock_timestamp(), active_until = NULL;
ALTER TABLE app_ext.port_context_capabilities
  DROP CONSTRAINT IF EXISTS port_context_capabilities_port_session_login_target_role_co_key;
ALTER TABLE app_ext.port_context_capabilities
  DROP CONSTRAINT IF EXISTS port_context_capabilities_authority_tuple_key;
