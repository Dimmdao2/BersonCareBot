-- BCB-MIGRATION-BACKFILL
-- Public messenger identity is canonical user/channel state. The numeric integrator user key remains
-- only an internal request principal and a delivery-attempt diagnostic.
-- Privilege analysis (AGENTS.md §1 «Перед приземлением миграции — разбор её прав»):
--   changed objects: six reminder callback roots, the retired `patient_set_reminder_muted_until`
--   and `patient_set_reminder_mute` overloads, `resolve_active_organization_for_integrator_user_id`,
--   two delivery roots, the two delivery-attempt journal roots, the support ensure root,
--   reminder materialization/read roots, `app_ext.assert_port_context_claim`, and the retired
--   `integrator_user_id` columns on platform_users, reminder_rules, reminder_occurrence_history,
--   support_conversations, notification_delivery_attempts and content_access_grants_webapp;
--   statement owners: app_seam_reminder_patient_owner, app_seam_reminder_materialization_owner,
--   app_seam_identity_lookup_owner, app_seam_delivery_scope_owner,
--   app_seam_telemetry_operator_owner, app_seam_patient_self_actions_owner and app_object_owner;
--   runtime roles: app_integrator_request/app_patient for callbacks, app_operational_scheduler for
--   reminder discovery, app_tenant_service for delivery snapshots and the integrator delivery-attempt
--   journal, app_operational_delivery_worker for the operator journal, app_patient for support;
--   body privileges: the named owners need the relation SELECT/INSERT/UPDATE surfaces declared in
--   deploy/postgres/privileges/declaration.ts — in particular the mute root now needs SELECT(id) on
--   platform_users for its `WHERE id` predicate next to UPDATE(reminder_muted_until), and the
--   delivery-identity root needs SELECT on be_organization_members for its tenant predicate;
--   runtime roles receive EXECUTE only there. DROP+CREATE changes the function OID, so every
--   changed signature is reconciled after the migration;
--   declaration/generated changes: signatures, relation columns and dropped columns are updated in
--   the same commit. This migration deliberately contains no GRANT/REVOKE/role/policy statement.

-- Exact support channel binding; existing canonical UUID always wins.
UPDATE public.support_conversations AS conversation
SET platform_user_id = binding.user_id,
    updated_at = statement_timestamp()
FROM public.user_channel_bindings AS binding
WHERE conversation.platform_user_id IS NULL
  AND conversation.channel_code = binding.channel_code
  AND conversation.channel_external_id = binding.external_id;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Delete only disabled, ownerless rules with no canonical person and no history.
DELETE FROM public.reminder_rules AS rule
WHERE rule.platform_user_id IS NULL
  AND rule.is_enabled = false
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = rule.integrator_user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.reminder_occurrence_history AS occurrence
    WHERE occurrence.integrator_rule_id = rule.integrator_rule_id
  );
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Fail closed on every unresolved class not authorized above.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reminder_rules WHERE platform_user_id IS NULL) THEN
    RAISE EXCEPTION 'unresolved canonical reminder owner';
  END IF;
END
$migration$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
DROP FUNCTION app.patient_done_reminder_occurrence(text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.patient_done_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text)
RETURNS TABLE(done_at timestamptz, first_done_for_occurrence boolean, day_done_count integer, day_sent_total integer, day_fully_done boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_actor uuid;
  v_occurred_at timestamptz;
  v_existing_done_at timestamptz;
  v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);
  IF pg_has_role(session_user, 'app_patient', 'MEMBER') AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_actor := app.current_patient_user_id();
    IF p_platform_user_id IS DISTINCT FROM v_actor THEN RETURN; END IF;
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER') AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_actor := p_platform_user_id;
  ELSE
    RAISE EXCEPTION 'unambiguous reminder callback login required' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL OR v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments e WHERE e.organization_id = v_org AND e.platform_user_id = v_actor AND e.status = 'active'
  ) THEN RETURN; END IF;
  SELECT h.done_at, COALESCE(h.sent_at, h.planned_at) INTO v_existing_done_at, v_occurred_at
  FROM public.reminder_occurrence_history h
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id AND h.platform_user_id = v_actor AND h.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  first_done_for_occurrence := v_existing_done_at IS NULL;
  done_at := COALESCE(v_existing_done_at, statement_timestamp());
  IF first_done_for_occurrence THEN
    UPDATE public.reminder_occurrence_history h SET done_at = patient_done_reminder_occurrence.done_at,
      occurred_at = COALESCE(h.occurred_at, v_occurred_at), updated_at = statement_timestamp()
    WHERE h.integrator_occurrence_id = p_integrator_occurrence_id AND h.platform_user_id = v_actor AND h.organization_id = v_org;
  END IF;
  SELECT setting.value_json ->> 'value' INTO v_timezone FROM public.system_settings setting
  WHERE setting.key = 'app_display_timezone' AND setting.scope = 'admin' AND setting.organization_id IS NULL LIMIT 1;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    RAISE EXCEPTION 'app_display_timezone_unavailable';
  END IF;
  SELECT COUNT(*) FILTER (WHERE h.status = 'sent')::integer,
         COUNT(*) FILTER (WHERE h.status = 'sent' AND h.done_at IS NOT NULL)::integer
  INTO day_sent_total, day_done_count FROM public.reminder_occurrence_history h
  WHERE h.platform_user_id = v_actor AND h.organization_id = v_org
    AND (COALESCE(h.occurred_at, h.sent_at, h.planned_at) AT TIME ZONE v_timezone)::date = (v_occurred_at AT TIME ZONE v_timezone)::date;
  day_fully_done := first_done_for_occurrence AND day_sent_total > 0 AND day_done_count = day_sent_total;
  RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.patient_skip_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_reason text)
RETURNS TABLE(skipped_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid := app.current_org_id(); v_actor uuid; v_occurred_at timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);
  IF pg_has_role(session_user, 'app_patient', 'MEMBER') AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_actor := app.current_patient_user_id(); IF p_platform_user_id IS DISTINCT FROM v_actor THEN RETURN; END IF;
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER') AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN v_actor := p_platform_user_id;
  ELSE RAISE EXCEPTION 'unambiguous reminder callback login required' USING ERRCODE = '42501'; END IF;
  IF v_org IS NULL OR v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_actor AND e.status='active') THEN RETURN; END IF;
  SELECT COALESCE(h.sent_at,h.planned_at) INTO v_occurred_at FROM public.reminder_occurrence_history h
  WHERE h.integrator_occurrence_id=p_integrator_occurrence_id AND h.platform_user_id=v_actor AND h.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.reminder_occurrence_history h SET skipped_at=COALESCE(h.skipped_at,statement_timestamp()),
    skip_reason=p_reason, occurred_at=COALESCE(h.occurred_at,v_occurred_at), status='skipped', updated_at=statement_timestamp()
  WHERE h.integrator_occurrence_id=p_integrator_occurrence_id AND h.platform_user_id=v_actor AND h.organization_id=v_org
  RETURNING h.skipped_at INTO skipped_at;
  RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.patient_snooze_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_minutes integer)
RETURNS TABLE(snoozed_until timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid := app.current_org_id(); v_actor uuid; v_existing timestamptz; v_next timestamptz; v_occurred_at timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);
  IF pg_has_role(session_user,'app_patient','MEMBER') AND NOT pg_has_role(session_user,'app_integrator_request','MEMBER') THEN
    v_actor:=app.current_patient_user_id(); IF p_platform_user_id IS DISTINCT FROM v_actor THEN RETURN; END IF;
  ELSIF pg_has_role(session_user,'app_integrator_request','MEMBER') AND NOT pg_has_role(session_user,'app_patient','MEMBER') THEN v_actor:=p_platform_user_id;
  ELSE RAISE EXCEPTION 'unambiguous reminder callback login required' USING ERRCODE='42501'; END IF;
  IF p_minutes NOT BETWEEN 1 AND 720 OR v_org IS NULL OR v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_actor AND e.status='active') THEN RETURN; END IF;
  SELECT h.snoozed_until,COALESCE(h.sent_at,h.planned_at) INTO v_existing,v_occurred_at FROM public.reminder_occurrence_history h
  WHERE h.integrator_occurrence_id=p_integrator_occurrence_id AND h.platform_user_id=v_actor AND h.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_existing IS NOT NULL THEN snoozed_until:=v_existing; RETURN NEXT; RETURN; END IF;
  v_next:=statement_timestamp()+make_interval(mins=>p_minutes);
  UPDATE public.reminder_occurrence_history h SET snoozed_at=statement_timestamp(),snoozed_until=v_next,
    occurred_at=COALESCE(h.occurred_at,v_occurred_at),planned_at=v_next,delivery_generation=h.delivery_generation+1,
    status='planned',queued_at=NULL,sent_at=NULL,failed_at=NULL,delivery_channel=NULL,delivery_job_id=NULL,error_code=NULL,updated_at=statement_timestamp()
  WHERE h.integrator_occurrence_id=p_integrator_occurrence_id AND h.platform_user_id=v_actor AND h.organization_id=v_org AND h.skipped_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF; snoozed_until:=v_next; RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
DROP FUNCTION app.patient_set_reminder_mute(integer,boolean);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.patient_set_reminder_mute(p_platform_user_id uuid, p_minutes integer, p_until_tomorrow boolean)
RETURNS TABLE(muted_until timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid:=app.current_org_id(); v_actor uuid; v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name,'app_patient'::name]::name[]);
  IF pg_has_role(session_user,'app_patient','MEMBER') AND NOT pg_has_role(session_user,'app_integrator_request','MEMBER') THEN v_actor:=app.current_patient_user_id(); IF p_platform_user_id IS DISTINCT FROM v_actor THEN RETURN; END IF;
  ELSIF pg_has_role(session_user,'app_integrator_request','MEMBER') AND NOT pg_has_role(session_user,'app_patient','MEMBER') THEN v_actor:=p_platform_user_id;
  ELSE RAISE EXCEPTION 'unambiguous reminder callback login required' USING ERRCODE='42501'; END IF;
  IF v_org IS NULL OR v_actor IS NULL OR p_until_tomorrow=(p_minutes IS NOT NULL) OR (NOT p_until_tomorrow AND p_minutes NOT BETWEEN 1 AND 1440)
     OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_actor AND e.status='active') THEN RETURN; END IF;
  IF p_until_tomorrow THEN
    SELECT setting.value_json->>'value' INTO v_timezone FROM public.system_settings setting WHERE setting.key='app_display_timezone' AND setting.scope='admin' AND setting.organization_id IS NULL LIMIT 1;
    IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;
    muted_until:=(date_trunc('day',statement_timestamp() AT TIME ZONE v_timezone)+interval '1 day') AT TIME ZONE v_timezone;
  ELSE muted_until:=statement_timestamp()+make_interval(mins=>p_minutes); END IF;
  UPDATE public.platform_users SET reminder_muted_until=muted_until WHERE id=v_actor;
  IF NOT FOUND THEN RETURN; END IF; RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
DROP FUNCTION app.patient_disable_reminder_messenger_topic(text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.patient_disable_reminder_messenger_topic(p_platform_user_id uuid, p_integrator_occurrence_id text, p_messenger_channel text)
RETURNS TABLE(persisted boolean, paragraphs jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid:=app.current_org_id(); v_actor uuid; v_topic text; v_label text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name,'app_patient'::name]::name[]);
  IF pg_has_role(session_user,'app_patient','MEMBER') AND NOT pg_has_role(session_user,'app_integrator_request','MEMBER') THEN v_actor:=app.current_patient_user_id(); IF p_platform_user_id IS DISTINCT FROM v_actor THEN RETURN; END IF;
  ELSIF pg_has_role(session_user,'app_integrator_request','MEMBER') AND NOT pg_has_role(session_user,'app_patient','MEMBER') THEN v_actor:=p_platform_user_id;
  ELSE RAISE EXCEPTION 'unambiguous reminder callback login required' USING ERRCODE='42501'; END IF;
  IF p_messenger_channel NOT IN ('telegram','max') OR v_org IS NULL OR v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_actor AND e.status='active') THEN RETURN; END IF;
  SELECT COALESCE(NULLIF(btrim(r.notification_topic_code),''),CASE WHEN r.category='water' THEN NULL WHEN lower(COALESCE(r.reminder_intent,''))='warmup' THEN 'warmup_reminders' ELSE 'training_reminders' END)
  INTO v_topic FROM public.reminder_occurrence_history h JOIN public.reminder_rules r ON r.integrator_rule_id=h.integrator_rule_id
  WHERE h.integrator_occurrence_id=p_integrator_occurrence_id AND h.platform_user_id=v_actor AND h.organization_id=v_org AND r.organization_id=v_org FOR UPDATE OF h;
  IF NOT FOUND THEN RETURN; END IF;
  v_label:=CASE p_messenger_channel WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END;
  IF v_topic IS NULL THEN persisted:=false; paragraphs:=jsonb_build_array(format('Для этого типа напоминаний канал %s не настраивается через темы.',v_label)); RETURN NEXT; RETURN; END IF;
  INSERT INTO public.user_notification_topic_channels AS preference(user_id,topic_code,channel_code,is_enabled,updated_at)
  VALUES(v_actor,v_topic,p_messenger_channel,false,statement_timestamp()) ON CONFLICT(user_id,topic_code,channel_code) DO UPDATE SET is_enabled=false,updated_at=EXCLUDED.updated_at;
  persisted:=true; paragraphs:=jsonb_build_array(format('Хорошо, отключаю напоминания в боте (%s).',v_label),'Другие разрешённые каналы остаются активными.'); RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
DROP FUNCTION app.patient_reminder_notification_settings(text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.patient_reminder_notification_settings(p_platform_user_id uuid,p_messenger_channel text,p_toggle_topic_code text)
RETURNS TABLE(topics jsonb,new_state boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid:=app.current_org_id(); v_actor uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name,ARRAY['app_integrator_request'::name,'app_patient'::name]::name[]);
  IF pg_has_role(session_user,'app_patient','MEMBER') AND NOT pg_has_role(session_user,'app_integrator_request','MEMBER') THEN v_actor:=app.current_patient_user_id(); IF p_platform_user_id IS DISTINCT FROM v_actor THEN RETURN; END IF;
  ELSIF pg_has_role(session_user,'app_integrator_request','MEMBER') AND NOT pg_has_role(session_user,'app_patient','MEMBER') THEN v_actor:=p_platform_user_id;
  ELSE RAISE EXCEPTION 'unambiguous reminder callback login required' USING ERRCODE='42501'; END IF;
  IF p_messenger_channel NOT IN('telegram','max') OR v_org IS NULL OR v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_actor AND e.status='active') THEN RETURN; END IF;
  IF p_toggle_topic_code IS NOT NULL THEN
    IF p_toggle_topic_code NOT IN('warmup_reminders','training_reminders','appointment_reminders','patient_news','specialist_messages','support_messages','important_broadcasts') THEN RETURN; END IF;
    INSERT INTO public.user_notification_topic_channels AS preference(user_id,topic_code,channel_code,is_enabled,updated_at)
    VALUES(v_actor,p_toggle_topic_code,p_messenger_channel,false,statement_timestamp()) ON CONFLICT(user_id,topic_code,channel_code) DO UPDATE SET is_enabled=NOT preference.is_enabled,updated_at=EXCLUDED.updated_at RETURNING is_enabled INTO new_state;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('code',d.code,'title',d.title,'isEnabled',COALESCE(p.is_enabled,true)) ORDER BY d.position) INTO topics
  FROM (VALUES(1,'warmup_reminders'::text,'Напоминания о разминках'::text),(2,'training_reminders','Напоминания о тренировках'),(3,'appointment_reminders','Напоминания о записях'),(4,'patient_news','Новости и уведомления'),(5,'specialist_messages','Сообщения специалиста'),(6,'support_messages','Сообщения поддержки'),(7,'important_broadcasts','Важные рассылки')) d(position,code,title)
  LEFT JOIN public.user_notification_topic_channels p ON p.user_id=v_actor AND p.topic_code=d.code AND p.channel_code=p_messenger_channel;
  RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- The live retired overload takes `timestamptz`, not `(integer,boolean)`: its body resolved the
-- person through `platform_users.integrator_user_id`, and it has no caller left.
DROP FUNCTION app.patient_set_reminder_muted_until(timestamptz);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.list_web_push_reminder_organization_ids(p_now timestamptz)
RETURNS TABLE(organization_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
SELECT app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name,ARRAY['app_operational_scheduler'::name]::name[]);
SELECT DISTINCT rule.organization_id FROM public.reminder_rules rule JOIN public.platform_users patient ON patient.id=rule.platform_user_id
WHERE rule.organization_id IS NOT NULL AND rule.is_enabled=true AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until<=p_now) ORDER BY rule.organization_id
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.patient_reminder_materialization_fingerprint(p_occurrence_id text,p_channel text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
SELECT md5(jsonb_build_object('occurrence',jsonb_build_array(h.integrator_rule_id,h.organization_id,h.platform_user_id,h.delivery_generation,h.planned_at),
  'rule',jsonb_build_array(r.integrator_rule_id,r.organization_id,r.platform_user_id,r.is_enabled,r.notification_topic_code,r.reminder_intent,r.linked_object_type,r.linked_object_id,r.custom_title,r.custom_text,r.display_title,r.updated_at),
  'patient',jsonb_build_array(patient.reminder_muted_until,patient.updated_at),'channel',p_channel)::text)
FROM public.reminder_occurrence_history h JOIN public.reminder_rules r ON r.integrator_rule_id=h.integrator_rule_id JOIN public.platform_users patient ON patient.id=h.platform_user_id
WHERE h.integrator_occurrence_id=p_occurrence_id AND h.organization_id=r.organization_id AND h.platform_user_id=r.platform_user_id
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.ensure_current_patient_support_conversation()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid:=app.current_org_id(); v_patient uuid:=app.current_patient_user_id(); v_key text:='webapp:organization:'||v_org::text||':platform:'||v_patient::text; v_row public.support_conversations%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name,'app_patient'::name,'patient'::app.port_context_class,'patient.support-conversation.ensure',app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),'app.ensure_current_patient_support_conversation()'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS(SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_patient AND e.status='active') THEN RAISE EXCEPTION 'current_patient_support_conversation_rejected' USING ERRCODE='P0001'; END IF;
  SELECT c.* INTO v_row FROM public.support_conversations c WHERE c.organization_id=v_org AND c.platform_user_id=v_patient AND c.source='webapp' AND c.admin_scope='support' ORDER BY(c.integrator_conversation_id=v_key)DESC,c.created_at LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_row); END IF;
  INSERT INTO public.support_conversations(organization_id,integrator_conversation_id,platform_user_id,source,admin_scope,status,opened_at,last_message_at)
  VALUES(v_org,v_key,v_patient,'webapp','support','open',statement_timestamp(),statement_timestamp()) ON CONFLICT(integrator_conversation_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,platform_user_id=EXCLUDED.platform_user_id,updated_at=statement_timestamp()
  WHERE support_conversations.organization_id=v_org AND support_conversations.platform_user_id=v_patient RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'current_patient_support_conversation_conflict' USING ERRCODE='P0001'; END IF; RETURN to_jsonb(v_row);
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
DROP FUNCTION app.integrator_read_platform_user_delivery_identity(text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.integrator_read_platform_user_delivery_identity(p_platform_user_id text)
RETURNS TABLE(phone_normalized text) LANGUAGE plpgsql STABLE PARALLEL RESTRICTED SECURITY DEFINER SET search_path TO 'pg_catalog','app','public','pg_temp' AS $function$
DECLARE v_org uuid; v_user uuid; v_next uuid; v_depth integer:=0;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name,'app_integrator_request'::name,'tenant_service'::app.port_context_class,'integrator.platform-user-delivery-identity.read',app.hash_port_typed_args(ARRAY[ROW('text@1',pg_catalog.textsend($1))::app.port_typed_arg]),'app.integrator_read_platform_user_delivery_identity(text)'::regprocedure);
  v_org:=app.current_org_id();
  IF v_org IS NULL THEN RAISE EXCEPTION 'integrator_platform_user_delivery_identity_principal_required' USING ERRCODE='42501'; END IF;
  IF p_platform_user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN; END IF;
  -- SECURITY DEFINER обходит RLS, поэтому КАЖДОЕ чтение `platform_users` здесь несёт предикат
  -- арендатора само: строка видна только тому, чья клиника числит этого человека сотрудником или
  -- клиентом. Прежняя рекурсивная CTE читала таблицу без этого предиката.
  SELECT platform_user.id INTO v_user FROM public.platform_users AS platform_user
   WHERE platform_user.id=p_platform_user_id::uuid
     AND (EXISTS(SELECT 1 FROM public.be_organization_members AS tenant_staff WHERE tenant_staff.platform_user_id=platform_user.id AND tenant_staff.organization_id=v_org AND tenant_staff.status='active')
       OR EXISTS(SELECT 1 FROM public.org_enrollments AS tenant_patient WHERE tenant_patient.platform_user_id=platform_user.id AND tenant_patient.organization_id=v_org AND tenant_patient.status='active'));
  IF v_user IS NULL THEN RETURN; END IF;
  LOOP
    EXIT WHEN v_depth>=5;
    SELECT platform_user.merged_into_id INTO v_next FROM public.platform_users AS platform_user
     WHERE platform_user.id=v_user
       AND (EXISTS(SELECT 1 FROM public.be_organization_members AS tenant_staff WHERE tenant_staff.platform_user_id=platform_user.id AND tenant_staff.organization_id=v_org AND tenant_staff.status='active')
         OR EXISTS(SELECT 1 FROM public.org_enrollments AS tenant_patient WHERE tenant_patient.platform_user_id=platform_user.id AND tenant_patient.organization_id=v_org AND tenant_patient.status='active'));
    EXIT WHEN v_next IS NULL;
    v_user:=v_next;
    v_depth:=v_depth+1;
  END LOOP;
  RETURN QUERY SELECT contact.value_normalized FROM public.user_contacts AS contact
   WHERE contact.platform_user_id=v_user AND contact.contact_kind='phone' AND contact.is_primary LIMIT 1;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
DROP FUNCTION app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamptz);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.read_integrator_delivery_target_snapshot(p_organization_id uuid,p_phone_normalized text,p_telegram_id text,p_max_id text,p_platform_user_id uuid,p_topic_code text,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE PARALLEL RESTRICTED SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid:=app.current_org_id(); v_user uuid; v_count integer; v_email text; v_email_verified timestamptz; v_muted timestamptz; v_preferences jsonb; v_topics jsonb; v_bindings jsonb; v_push boolean; v_topic_enabled boolean; v_vapid boolean; v_smtp boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name,'app_tenant_service'::name,'tenant_service'::app.port_context_class,'integrator.delivery-targets.read',app.hash_port_typed_args(ARRAY[ROW('uuid@1',pg_catalog.uuid_send($1))::app.port_typed_arg,ROW('text@1',pg_catalog.textsend($2))::app.port_typed_arg,ROW('text@1',pg_catalog.textsend($3))::app.port_typed_arg,ROW('text@1',pg_catalog.textsend($4))::app.port_typed_arg,ROW('uuid@1',pg_catalog.uuid_send($5))::app.port_typed_arg,ROW('text@1',pg_catalog.textsend($6))::app.port_typed_arg,ROW('timestamptz@1',pg_catalog.timestamptz_send($7))::app.port_typed_arg]),'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,text,timestamp with time zone)'::regprocedure);
  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'delivery target organization mismatch' USING ERRCODE='42501'; END IF;
  IF p_platform_user_id IS NOT NULL THEN SELECT id INTO v_user FROM public.platform_users WHERE id=p_platform_user_id AND merged_into_id IS NULL;
  ELSIF NULLIF(btrim(p_phone_normalized),'') IS NOT NULL THEN SELECT count(*),(array_agg(c.platform_user_id))[1] INTO v_count,v_user FROM public.user_contacts c JOIN public.platform_users p ON p.id=c.platform_user_id WHERE c.contact_kind='phone' AND c.value_normalized=btrim(p_phone_normalized) AND p.merged_into_id IS NULL; IF v_count>1 THEN RAISE EXCEPTION 'multiple canonical delivery targets for one phone' USING ERRCODE='22023'; END IF;
  ELSIF NULLIF(btrim(p_telegram_id),'') IS NOT NULL THEN SELECT b.user_id INTO v_user FROM public.user_channel_bindings b JOIN public.platform_users p ON p.id=b.user_id WHERE b.channel_code='telegram' AND b.external_id=btrim(p_telegram_id) AND p.merged_into_id IS NULL;
  ELSIF NULLIF(btrim(p_max_id),'') IS NOT NULL THEN SELECT b.user_id INTO v_user FROM public.user_channel_bindings b JOIN public.platform_users p ON p.id=b.user_id WHERE b.channel_code='max' AND b.external_id=btrim(p_max_id) AND p.merged_into_id IS NULL;
  ELSE RETURN jsonb_build_object('ok',false,'code','delivery_target_selector_required'); END IF;
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'code','delivery_target_not_found'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_user AND e.status='active') THEN RETURN jsonb_build_object('ok',false,'code','delivery_target_outside_organization'); END IF;
  SELECT c.value_normalized,c.confirmed_at,p.reminder_muted_until INTO v_email,v_email_verified,v_muted FROM public.platform_users p LEFT JOIN public.user_contacts c ON c.platform_user_id=p.id AND c.contact_kind='email' AND c.is_primary WHERE p.id=v_user AND p.is_blocked=false AND p.is_archived=false;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','delivery_target_not_found'); END IF;
  SELECT COALESCE(jsonb_object_agg(b.channel_code,b.external_id),'{}'::jsonb) INTO v_bindings FROM public.user_channel_bindings b WHERE b.user_id=v_user AND b.channel_code IN('telegram','max') AND b.bot_blocked_at IS NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('channelCode',p.channel_code,'isEnabledForMessages',p.is_enabled_for_messages,'isEnabledForNotifications',p.is_enabled_for_notifications,'isPreferredForAuth',p.is_preferred_for_auth) ORDER BY p.channel_code),'[]'::jsonb) INTO v_preferences FROM public.user_channel_preferences p WHERE p.platform_user_id=v_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('topicCode',p.topic_code,'channelCode',p.channel_code,'isEnabled',p.is_enabled) ORDER BY p.topic_code,p.channel_code),'[]'::jsonb) INTO v_topics FROM public.user_notification_topic_channels p WHERE p.user_id=v_user;
  SELECT COALESCE((SELECT t.is_enabled FROM public.user_notification_topics t WHERE t.user_id=v_user AND t.topic_code=p_topic_code),true) INTO v_topic_enabled;
  SELECT EXISTS(SELECT 1 FROM public.user_web_push_subscriptions s WHERE s.user_id=v_user) INTO v_push;
  SELECT EXISTS(SELECT 1 FROM public.system_settings s WHERE s.key='web_push_vapid' AND s.scope='admin' AND s.organization_id IS NULL AND btrim(COALESCE(s.value_json#>>'{value,publicKey}',''))<>'' AND btrim(COALESCE(s.value_json#>>'{value,privateKey}',''))<>'') INTO v_vapid;
  SELECT EXISTS(SELECT 1 FROM public.system_settings s WHERE s.key='smtp_outbound' AND s.scope='admin' AND s.organization_id IS NULL AND btrim(COALESCE(s.value_json#>>'{value,host}',''))<>'' AND btrim(COALESCE(s.value_json#>>'{value,user}',''))<>'' AND btrim(COALESCE(s.value_json#>>'{value,from}',''))~'^[^[:space:]@]+@[^[:space:]@]+$') INTO v_smtp;
  RETURN jsonb_build_object('ok',true,'platformUserId',v_user,'bindings',v_bindings,'channelPreferences',v_preferences,'topicChannelRows',v_topics,'emailRecipient',NULLIF(btrim(v_email),''),'emailVerified',v_email_verified IS NOT NULL,'muted',v_muted IS NOT NULL AND v_muted>p_now,'topicMasterEnabled',v_topic_enabled,'hasWebPushSubscription',v_push,'vapidConfigured',v_vapid,'smtpConfigured',v_smtp);
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.reminder_rules DROP CONSTRAINT reminder_rules_platform_user_id_fkey;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app_ext
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app_ext.assert_port_context_claim(p_context_class text,p_target_role name,p_actor_ref uuid,p_subject_ref uuid,p_organization_id uuid,p_integrator_user_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','app','app_ext','pg_temp' AS $function$
DECLARE actor_id uuid; subject_id uuid;
BEGIN
  IF p_actor_ref IS NOT NULL THEN actor_id:=app_ext.resolve_variant_a_physical(p_actor_ref,'actor'); END IF;
  IF p_subject_ref IS NOT NULL THEN subject_id:=app_ext.resolve_variant_a_physical(p_subject_ref,'subject'); END IF;
  IF p_context_class='staff' THEN
    IF NOT EXISTS(SELECT 1 FROM public.be_organization_members m WHERE m.platform_user_id=actor_id AND m.organization_id=p_organization_id AND m.status='active') THEN RAISE EXCEPTION 'port context organization claim is not an active membership of the actor' USING ERRCODE='42501'; END IF;
  ELSIF p_context_class='patient' THEN
    IF actor_id IS DISTINCT FROM subject_id THEN RAISE EXCEPTION 'patient port context actor and subject must be the same identity' USING ERRCODE='42501'; END IF;
    IF p_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_enrollments e WHERE e.platform_user_id=subject_id AND e.organization_id=p_organization_id) THEN RAISE EXCEPTION 'port context organization claim is not a client relationship of the patient' USING ERRCODE='42501'; END IF;
  ELSIF p_context_class='platform' THEN
    IF NOT EXISTS(SELECT 1 FROM public.platform_users p WHERE p.id=actor_id AND p.role='admin' AND p.merged_into_id IS NULL) THEN RAISE EXCEPTION 'platform port context actor is not a platform administrator' USING ERRCODE='42501'; END IF;
  ELSIF p_context_class='integrator' AND p_target_role='app_integrator_request' THEN
    IF p_integrator_user_id IS NULL OR p_organization_id IS NULL OR (
      NOT EXISTS(SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=p_organization_id)
      AND NOT EXISTS(SELECT 1 FROM public.be_organization_members m WHERE m.organization_id=p_organization_id)
    ) THEN RAISE EXCEPTION 'integrator request principal requires a known organization' USING ERRCODE='42501'; END IF;
  ELSIF p_context_class IN('tenant_service','service') AND p_organization_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=p_organization_id)
       AND NOT EXISTS(SELECT 1 FROM public.be_organization_members m WHERE m.organization_id=p_organization_id) THEN RAISE EXCEPTION 'port context organization claim is not a known organization' USING ERRCODE='42501'; END IF;
  END IF;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
DROP FUNCTION app.resolve_active_organization_for_integrator_user_id(bigint);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.reminder_rules ALTER COLUMN platform_user_id SET NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.reminder_rules ADD CONSTRAINT reminder_rules_platform_user_id_fkey FOREIGN KEY(platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.support_conversations DROP COLUMN integrator_user_id;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.reminder_occurrence_history DROP COLUMN integrator_user_id;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.reminder_rules DROP COLUMN integrator_user_id;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.platform_users DROP COLUMN integrator_user_id;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- The delivery-attempt journal keeps every existing fact; only the retired public person copy
-- leaves it. `user_id` (canonical `platform_users.id`) and `recipient_ref` already carry who the
-- attempt was for, so the numeric column added nothing that survives the cutover.
DROP FUNCTION app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.integrator_record_notification_delivery_attempt(p_organization_id uuid,p_user_id text,p_topic_code text,p_intent_type text,p_channel text,p_status text,p_reason text,p_provider_status_code integer,p_event_id text,p_occurrence_id text,p_recipient_ref text,p_error_message text,p_metadata text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path = pg_catalog AS $function$
DECLARE v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name,'app_tenant_service'::name,'tenant_service'::app.port_context_class,'integrator.notification-delivery-attempt.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1',pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($5))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('integer@1',pg_catalog.int4send($8))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($9))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($10))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($11))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($12))::app.port_typed_arg,
      ROW('text@1',pg_catalog.textsend($13))::app.port_typed_arg
    ]),'app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,integer,text,text,text,text,text)'::regprocedure);
  IF p_status IS DISTINCT FROM 'failed' THEN RAISE EXCEPTION 'notification_delivery_attempt_must_be_failed_provider_attempt' USING ERRCODE='22023'; END IF;
  IF app.current_org_id() IS NULL THEN RAISE EXCEPTION 'integrator_notification_delivery_attempt_principal_required' USING ERRCODE='42501'; END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN RAISE EXCEPTION 'integrator_notification_delivery_attempt_principal_mismatch' USING ERRCODE='42501'; END IF;
  v_user_id := p_user_id::uuid;
  IF v_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.be_organization_members AS tenant_staff WHERE tenant_staff.platform_user_id=v_user_id AND tenant_staff.organization_id=p_organization_id AND tenant_staff.status='active')
    AND NOT EXISTS (SELECT 1 FROM public.org_enrollments AS tenant_patient WHERE tenant_patient.platform_user_id=v_user_id AND tenant_patient.organization_id=p_organization_id AND tenant_patient.status='active')
  THEN RAISE EXCEPTION 'integrator_notification_delivery_attempt_user_outside_organization' USING ERRCODE='42501'; END IF;
  INSERT INTO public.notification_delivery_attempts (
    organization_id, user_id, topic_code, intent_type, channel, status, reason,
    provider_status_code, event_id, occurrence_id, recipient_ref, error_message, metadata
  ) VALUES (
    p_organization_id, v_user_id, p_topic_code, p_intent_type, p_channel, p_status, p_reason,
    p_provider_status_code, p_event_id, p_occurrence_id::uuid, p_recipient_ref, p_error_message, p_metadata::jsonb
  );
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The operator journal root stops projecting `intent.meta.userId` into the retired person column.
-- Everything else in both branches is unchanged.
CREATE OR REPLACE FUNCTION app.record_operator_delivery_attempt(p_intent_type text,p_intent_event_id text,p_correlation_id text,p_organization_id uuid,p_channel text,p_status text,p_attempt integer,p_reason text,p_payload_text text,p_occurred_at timestamp with time zone)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path = pg_catalog AS $function$
DECLARE
  v_queue_kind text;
  v_organization_id uuid;
  v_payload jsonb;
  v_occurrence_id uuid;
  v_topic_code text;
  v_user_id uuid;
  v_context_payload jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

  IF length(COALESCE(p_intent_event_id, '')) NOT BETWEEN 1 AND 240
    OR p_channel NOT IN ('telegram', 'max', 'email', 'sms', 'smsc', 'web_push')
    OR p_status NOT IN ('success', 'failed', 'skipped')
    OR p_attempt NOT BETWEEN 1 AND 100
    OR length(COALESCE(p_reason, '')) > 500
    OR (p_status = 'success' AND p_reason IS NOT NULL AND p_reason <> 'dev_redirect_suppressed')
    OR (p_status = 'failed' AND p_reason IS DISTINCT FROM 'provider_rejected')
    OR (p_status = 'skipped' AND COALESCE(p_reason, '') = '')
  THEN
    RAISE EXCEPTION 'invalid operator delivery attempt audit input' USING ERRCODE = '23514';
  END IF;

  SELECT queue.kind, queue.organization_id, queue.payload_json
  INTO v_queue_kind, v_organization_id, v_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.channel = p_channel
    AND queue.payload_json #>> '{intent,meta,eventId}' = p_intent_event_id
  LIMIT 1;

  IF v_queue_kind IS NULL THEN
    v_context_payload := p_payload_text::jsonb;
    IF NULLIF(btrim(p_intent_type), '') IS NULL
      OR length(p_intent_type) > 200
      OR length(COALESCE(p_correlation_id, '')) > 500
      OR v_context_payload IS NULL
      OR jsonb_typeof(v_context_payload) <> 'object'
      OR pg_column_size(v_context_payload) > 65536
      OR p_occurred_at IS NULL
    THEN
      RAISE EXCEPTION 'invalid nonqueue operator delivery attempt audit context'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.notification_delivery_attempts (
      created_at, organization_id, intent_type, channel, status, reason, event_id, metadata
    ) VALUES (
      p_occurred_at, p_organization_id, p_intent_type, p_channel, p_status, p_reason, p_intent_event_id,
      jsonb_build_object(
        'attempt', p_attempt,
        'kind', p_intent_type,
        'channel', p_channel,
        'source', 'record_operator_delivery_attempt',
        'queueSource', false,
        'correlationId', NULLIF(p_correlation_id, ''),
        'payload', v_context_payload
      )
    );
    RETURN;
  END IF;

  v_occurrence_id := NULLIF(v_payload->>'occurrenceId', '')::uuid;
  v_topic_code := NULLIF(v_payload->>'topicCode', '');
  IF NULLIF(v_payload->>'platformUserId', '') ~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_user_id := NULLIF(v_payload->>'platformUserId', '')::uuid;
  END IF;

  INSERT INTO public.notification_delivery_attempts (
    organization_id, user_id, topic_code, intent_type, channel, status, reason, event_id,
    occurrence_id, metadata
  ) VALUES (
    v_organization_id, v_user_id, v_topic_code, v_queue_kind, p_channel, p_status, p_reason,
    p_intent_event_id, v_occurrence_id,
    jsonb_build_object(
      'attempt', p_attempt,
      'kind', v_queue_kind,
      'channel', p_channel,
      'source', 'record_operator_delivery_attempt'
    )
  );
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
-- The delivery-attempt rows themselves stay; only the retired public person copy is dropped.
ALTER TABLE public.notification_delivery_attempts DROP COLUMN integrator_user_id;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- `idx_content_access_grants_webapp_integrator_user_id` disappears with its column; the canonical
-- owner key `platform_user_id` and its foreign key are untouched.
ALTER TABLE public.content_access_grants_webapp DROP COLUMN integrator_user_id;
--> statement-breakpoint

-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: retired public columns/signatures are absent and canonical reminder ownership is mandatory
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND column_name='integrator_user_id')
     OR EXISTS (SELECT 1 FROM public.reminder_rules WHERE platform_user_id IS NULL)
     OR to_regprocedure('app.patient_done_reminder_occurrence(uuid,text)') IS NULL
     OR to_regprocedure('app.patient_set_reminder_muted_until(timestamp with time zone)') IS NOT NULL
     OR to_regprocedure('app.patient_set_reminder_mute(integer,boolean)') IS NOT NULL
     OR to_regprocedure('app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,integer,text,text,text,text,text)') IS NULL
     OR to_regprocedure('app.integrator_record_notification_delivery_attempt(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,text)') IS NOT NULL
     OR to_regprocedure('app.resolve_active_organization_for_integrator_user_id(bigint)') IS NOT NULL
     OR to_regprocedure('app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,text,timestamp with time zone)') IS NULL
     OR to_regprocedure('app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'public integrator identity retirement verification failed';
  END IF;
END
$migration$;
