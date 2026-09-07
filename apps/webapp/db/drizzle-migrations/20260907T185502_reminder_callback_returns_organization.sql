-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- Reminder callback origin authority must travel with the principal-bound mutation.
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.patient_disable_reminder_messenger_topic(uuid,text,text)'::pg_catalog.regprocedure) LIKE '%organization_id uuid%' AND pg_catalog.pg_get_function_result('app.patient_reminder_notification_settings(uuid,text,text)'::pg_catalog.regprocedure) LIKE '%organization_id uuid%'

DROP FUNCTION app.patient_disable_reminder_messenger_topic(uuid,text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.patient_disable_reminder_messenger_topic(
  p_platform_user_id uuid,
  p_integrator_occurrence_id text,
  p_messenger_channel text
)
RETURNS TABLE(persisted boolean, paragraphs jsonb, organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
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
  IF v_topic IS NULL THEN persisted:=false; paragraphs:=jsonb_build_array(format('Для этого типа напоминаний канал %s не настраивается через темы.',v_label)); organization_id:=v_org; RETURN NEXT; RETURN; END IF;
  INSERT INTO public.user_notification_topic_channels AS preference(user_id,topic_code,channel_code,is_enabled,updated_at)
  VALUES(v_actor,v_topic,p_messenger_channel,false,statement_timestamp()) ON CONFLICT(user_id,topic_code,channel_code) DO UPDATE SET is_enabled=false,updated_at=EXCLUDED.updated_at;
  persisted:=true; paragraphs:=jsonb_build_array(format('Хорошо, отключаю напоминания в боте (%s).',v_label),'Другие разрешённые каналы остаются активными.'); organization_id:=v_org; RETURN NEXT;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
DROP FUNCTION app.patient_reminder_notification_settings(uuid,text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.patient_reminder_notification_settings(
  p_platform_user_id uuid,
  p_messenger_channel text,
  p_toggle_topic_code text
)
RETURNS TABLE(topics jsonb, new_state boolean, organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
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
  organization_id:=v_org;
  RETURN NEXT;
END
$function$;
