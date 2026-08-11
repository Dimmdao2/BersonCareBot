-- Declaration-owned production port-context capabilities: exact replace for managed logins.
CREATE TEMP TABLE bcb_declared_port_context_capabilities ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('1eb8740a-35aa-55ac-ad65-49eb89bad6ca'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-advance', 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)'::regprocedure),
  ('30d69dff-9550-5f54-81ab-e383f1b8ba27'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'scheduler.reminder-organizations', 'app.list_scheduler_reminder_organization_ids()'::regprocedure),
  ('efb39c74-08b3-5efe-b7de-5dc559fef554'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-mark', 'app.mark_operator_incident_alert_sent(uuid)'::regprocedure),
  ('3f0388d3-5ffb-570e-ad6d-c03a35abee0e'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-status', 'app.operator_incident_alert_already_sent(uuid)'::regprocedure),
  ('11d761a2-a8fc-5917-ba7b-86d1f93f7fd5'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.acquire', 'app.password_login_acquire(text,text,uuid,text)'::regprocedure),
  ('16857960-8508-5a9f-a9f8-f3b5436d9df2'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.complete', 'app.password_login_complete(uuid,boolean)'::regprocedure),
  ('c6ba0c21-2360-50fc-9ba6-f26b30d4835e'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-issue', 'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure),
  ('ac70473e-15f3-5f4e-a0b9-b21032166001'::uuid, 'webapp'::app.port_name, 'bcb_test_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-secret', 'app.password_login_read_altcha_secret()'::regprocedure),
  ('e2603175-6073-5229-9e48-3a5e789953f2'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.resolve-scope', 'app.resolve_outgoing_delivery_scope(uuid)'::regprocedure),
  ('bf4d1959-14bb-5e24-8347-65bb08d7649c'::uuid, 'integrator'::app.port_name, 'bcb_test_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-revalidate', 'app.revalidate_appointment_reminder_materialization(uuid)'::regprocedure)
) AS v(capability_id, port, session_login, target_role, context_class, purpose, function_identity);
DELETE FROM app_ext.port_context_capabilities existing
 WHERE existing.session_login = ANY (ARRAY['bcb_test_integrator', 'bcb_test_webapp_patient', 'bcb_test_webapp_staff']::name[])
   AND existing.function_identity IS NOT NULL
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
