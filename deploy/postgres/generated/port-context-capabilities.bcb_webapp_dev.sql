-- Declaration-owned production port-context capabilities: exact replace for managed logins.
CREATE TEMP TABLE bcb_declared_port_context_capabilities ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('c131c089-33a1-5ced-bd44-8dc85b500d11'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-advance', 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)'::regprocedure),
  ('b1b41e44-9559-51d3-a0a1-66f7931db4d9'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'scheduler.reminder-organizations', 'app.list_scheduler_reminder_organization_ids()'::regprocedure),
  ('af8e9023-5c1e-5800-a091-e769af3bc39e'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-mark', 'app.mark_operator_incident_alert_sent(uuid)'::regprocedure),
  ('f6047407-5066-5272-86a7-175d3c769094'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-status', 'app.operator_incident_alert_already_sent(uuid)'::regprocedure),
  ('e2cc335c-f69e-545f-99d4-c1c101f9cd05'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.acquire', 'app.password_login_acquire(text,text,uuid,text)'::regprocedure),
  ('2b73b16c-ab00-55a2-add0-604275ec23ec'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.complete', 'app.password_login_complete(uuid,boolean)'::regprocedure),
  ('bf624c2a-909f-5668-b101-dc4349129558'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-issue', 'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure),
  ('2ade5f49-9a15-5a1b-8353-eb3f0597c332'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-secret', 'app.password_login_read_altcha_secret()'::regprocedure),
  ('1eb67918-03f9-54ef-8478-32c4cead7b54'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.resolve-scope', 'app.resolve_outgoing_delivery_scope(uuid)'::regprocedure),
  ('05731ad5-0f0f-5acf-9001-086268a41c92'::uuid, 'integrator'::app.port_name, 'bcb_dev_integrator'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-revalidate', 'app.revalidate_appointment_reminder_materialization(uuid)'::regprocedure)
) AS v(capability_id, port, session_login, target_role, context_class, purpose, function_identity);
DELETE FROM app_ext.port_context_capabilities existing
 WHERE existing.session_login = ANY (ARRAY['bcb_dev_integrator', 'bcb_dev_webapp_patient', 'bcb_dev_webapp_staff']::name[])
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
