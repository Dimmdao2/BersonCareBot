-- D30 Ш3: specialist-task reminder delivery outcome + claim-time revalidation capability.
-- D30 Ш3: a sent transport row is durable proof; product bookkeeping retries without transport.

GRANT SELECT (id, organization_id, reminder_sent_at), UPDATE (reminder_sent_at)
  ON TABLE public.specialist_tasks TO app_owner;
GRANT SELECT (
    id, organization_id, owner_user_id, patient_user_id, title, description, due_at, remind_at,
    is_important, completed_at, reminder_sent_at, updated_at
  ) ON TABLE public.specialist_tasks TO app_owner;
GRANT SELECT (
    id, event_id, kind, channel, status, organization_id, payload_json, sent_at
  ), UPDATE (status, next_retry_at, last_error, payload_json, updated_at)
  ON TABLE public.outgoing_delivery_queue TO app_owner;
GRANT SELECT (id, email, email_verified_at, updated_at)
  ON TABLE public.platform_users TO app_owner;
GRANT SELECT (user_id, channel_code, external_id, created_at, bot_blocked_at, bot_blocked_reason)
  ON TABLE public.user_channel_bindings TO app_owner;
GRANT SELECT (
    user_id, platform_user_id, channel_code, is_enabled_for_messages,
    is_enabled_for_notifications, updated_at
  ) ON TABLE public.user_channel_preferences TO app_owner;
GRANT SELECT (user_id, topic_code, channel_code, is_enabled, updated_at)
  ON TABLE public.user_notification_topic_channels TO app_owner;
GRANT SELECT (user_id, endpoint, p256dh, auth, updated_at)
  ON TABLE public.user_web_push_subscriptions TO app_owner;
GRANT SELECT (key, scope, organization_id, value_json, updated_at)
  ON TABLE public.system_settings TO app_owner;

DROP POLICY IF EXISTS specialist_task_delivery_outcome_app_owner ON public.specialist_tasks;
DROP POLICY IF EXISTS specialist_task_delivery_outcome_read_app_owner ON public.specialist_tasks;
DROP POLICY IF EXISTS specialist_task_reminder_materialization_read_app_owner
  ON public.specialist_tasks;
CREATE POLICY specialist_task_reminder_materialization_read_app_owner
ON public.specialist_tasks
FOR SELECT
TO app_owner
USING (
  EXISTS (
    SELECT 1
    FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.id = NULLIF(
      current_setting('app.specialist_materialization_queue_id', true), ''
    )::uuid
      AND delivery.kind = 'specialist_task_reminder'
      AND delivery.status IN ('pending', 'failed_retryable', 'processing')
      AND delivery.organization_id = specialist_tasks.organization_id
      AND delivery.payload_json #>> '{successOutcome,taskId}' = specialist_tasks.id::text
  )
);
CREATE POLICY specialist_task_delivery_outcome_read_app_owner
ON public.specialist_tasks
FOR SELECT
TO app_owner
USING (
  EXISTS (
    SELECT 1
    FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.id = NULLIF(current_setting('app.specialist_outcome_queue_id', true), '')::uuid
      AND delivery.kind = 'specialist_task_reminder'
      AND delivery.status = 'sent'
      AND delivery.payload_json #>> '{successOutcome,type}' = 'specialistTask.reminder.markSent'
      AND delivery.payload_json #>> '{successOutcome,taskId}' = specialist_tasks.id::text
      AND delivery.payload_json #>> '{successOutcome,appliedAt}' IS NULL
  )
);

CREATE OR REPLACE FUNCTION app.specialist_task_reminder_materialization_fingerprint(
  p_task_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT md5(jsonb_build_object(
    'task', jsonb_build_array(
      task.organization_id, task.owner_user_id, task.patient_user_id, task.title,
      task.description, task.due_at, task.remind_at, task.is_important,
      task.completed_at, task.reminder_sent_at, task.updated_at
    ),
    'owner', jsonb_build_array(owner.email, owner.email_verified_at, owner.updated_at),
    'bindings', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          binding.channel_code, binding.external_id, binding.created_at,
          binding.bot_blocked_at, binding.bot_blocked_reason
        ) ORDER BY binding.channel_code, binding.external_id
      )
      FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = task.owner_user_id
    ), '[]'::jsonb),
    'channelPreferences', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          preference.channel_code, preference.is_enabled_for_messages,
          preference.is_enabled_for_notifications, preference.updated_at
        ) ORDER BY preference.channel_code
      )
      FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = task.owner_user_id
         OR preference.user_id = task.owner_user_id::text
    ), '[]'::jsonb),
    'topicPreferences', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          topic.channel_code, topic.is_enabled, topic.updated_at
        ) ORDER BY topic.channel_code
      )
      FROM public.user_notification_topic_channels AS topic
      WHERE topic.user_id = task.owner_user_id
        AND topic.topic_code = 'doctor_specialist_task_reminders'
    ), '[]'::jsonb),
    'webPushSubscriptions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          subscription.endpoint, subscription.p256dh, subscription.auth,
          subscription.updated_at
        ) ORDER BY subscription.endpoint
      )
      FROM public.user_web_push_subscriptions AS subscription
      WHERE subscription.user_id = task.owner_user_id
    ), '[]'::jsonb),
    'settings', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          setting.key, setting.scope, setting.organization_id,
          setting.value_json, setting.updated_at
        ) ORDER BY setting.key, setting.scope, setting.organization_id NULLS FIRST
      )
      FROM public.system_settings AS setting
      WHERE (setting.key = 'doctor_specialist_task_reminder_channels'
             AND setting.scope = 'doctor')
         OR (setting.key = 'web_push_vapid' AND setting.scope = 'admin')
    ), '[]'::jsonb)
  )::text)
  FROM public.specialist_tasks AS task
  LEFT JOIN public.platform_users AS owner ON owner.id = task.owner_user_id
  WHERE task.id = p_task_id
$function$;

ALTER FUNCTION app.specialist_task_reminder_materialization_fingerprint(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.specialist_task_reminder_materialization_fingerprint(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.refresh_specialist_task_reminder_materialization(p_event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_id uuid;
  queue_organization_id uuid;
  queue_payload jsonb;
  caller_organization_id uuid;
  task_id_text text;
  current_fingerprint text;
BEGIN
  SELECT delivery.id, delivery.organization_id, delivery.payload_json
    INTO queue_id, queue_organization_id, queue_payload
  FROM public.outgoing_delivery_queue AS delivery
  WHERE delivery.event_id = p_event_id
    AND delivery.kind = 'specialist_task_reminder'
    AND delivery.status IN ('pending', 'failed_retryable')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  caller_organization_id := NULLIF(current_setting('app.org', true), '')::uuid;
  IF caller_organization_id IS NULL
    OR queue_organization_id IS DISTINCT FROM caller_organization_id
  THEN
    RAISE EXCEPTION 'specialist reminder materialization tenant mismatch'
      USING ERRCODE = '42501';
  END IF;
  task_id_text := queue_payload #>> '{successOutcome,taskId}';
  IF COALESCE(task_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'specialist reminder materialization has an invalid task id'
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.specialist_materialization_queue_id', queue_id::text, true);
  current_fingerprint := app.specialist_task_reminder_materialization_fingerprint(
    task_id_text::uuid
  );
  IF current_fingerprint IS NULL THEN
    RAISE EXCEPTION 'specialist reminder materialization task is unavailable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.outgoing_delivery_queue AS delivery
  SET payload_json = jsonb_set(
        delivery.payload_json,
        '{successOutcome,materializationFingerprint}',
        to_jsonb(current_fingerprint),
        true
      ),
      updated_at = clock_timestamp()
  WHERE delivery.id = queue_id;
  RETURN true;
END
$function$;

ALTER FUNCTION app.refresh_specialist_task_reminder_materialization(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.refresh_specialist_task_reminder_materialization(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.refresh_specialist_task_reminder_materialization(text) FROM
  app_patient, app_worker, app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.refresh_specialist_task_reminder_materialization(text) TO app_staff;

CREATE OR REPLACE FUNCTION app.revalidate_specialist_task_reminder_materialization(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_payload jsonb;
  task_id_text text;
  expected_fingerprint text;
  current_fingerprint text;
BEGIN
  SELECT delivery.payload_json
    INTO queue_payload
  FROM public.outgoing_delivery_queue AS delivery
  WHERE delivery.id = p_queue_id
    AND delivery.kind = 'specialist_task_reminder'
    AND delivery.status = 'processing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  task_id_text := queue_payload #>> '{successOutcome,taskId}';
  expected_fingerprint := queue_payload #>> '{successOutcome,materializationFingerprint}';
  IF COALESCE(task_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR COALESCE(expected_fingerprint, '') !~ '^[0-9a-f]{32}$'
  THEN
    current_fingerprint := NULL;
  ELSE
    PERFORM set_config('app.specialist_materialization_queue_id', p_queue_id::text, true);
    current_fingerprint := app.specialist_task_reminder_materialization_fingerprint(
      task_id_text::uuid
    );
  END IF;

  IF current_fingerprint IS NOT NULL AND current_fingerprint = expected_fingerprint THEN
    RETURN true;
  END IF;

  UPDATE public.outgoing_delivery_queue AS delivery
  SET status = 'failed_retryable',
      next_retry_at = clock_timestamp() + interval '15 minutes',
      last_error = 'SPECIALIST_TASK_REMINDER_STALE_MATERIALIZATION',
      updated_at = clock_timestamp()
  WHERE delivery.id = p_queue_id
    AND delivery.status = 'processing';
  RETURN false;
END
$function$;

ALTER FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid) FROM
  app_staff, app_patient, app_worker, app_operational_diagnostic,
  app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid)
  TO app_operational_delivery_worker;
CREATE POLICY specialist_task_delivery_outcome_app_owner
ON public.specialist_tasks
FOR UPDATE
TO app_owner
USING (
  EXISTS (
    SELECT 1
    FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.id = NULLIF(current_setting('app.specialist_outcome_queue_id', true), '')::uuid
      AND delivery.kind = 'specialist_task_reminder'
      AND delivery.status = 'sent'
      AND delivery.organization_id = specialist_tasks.organization_id
      AND delivery.payload_json #>> '{successOutcome,type}' = 'specialistTask.reminder.markSent'
      AND delivery.payload_json #>> '{successOutcome,taskId}' = specialist_tasks.id::text
      AND delivery.payload_json #>> '{successOutcome,appliedAt}' IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.id = NULLIF(current_setting('app.specialist_outcome_queue_id', true), '')::uuid
      AND delivery.kind = 'specialist_task_reminder'
      AND delivery.status = 'sent'
      AND delivery.organization_id = specialist_tasks.organization_id
      AND delivery.payload_json #>> '{successOutcome,type}' = 'specialistTask.reminder.markSent'
      AND delivery.payload_json #>> '{successOutcome,taskId}' = specialist_tasks.id::text
      AND delivery.payload_json #>> '{successOutcome,appliedAt}' IS NULL
  )
);

CREATE OR REPLACE FUNCTION app.apply_specialist_task_reminder_success_outcome(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_organization_id uuid;
  queue_sent_at timestamptz;
  queue_payload jsonb;
  task_id_text text;
  task_id uuid;
  task_organization_id uuid;
BEGIN
  SELECT delivery.organization_id, delivery.sent_at, delivery.payload_json
    INTO queue_organization_id, queue_sent_at, queue_payload
  FROM public.outgoing_delivery_queue AS delivery
  WHERE delivery.id = p_queue_id
    AND delivery.kind = 'specialist_task_reminder'
    AND delivery.status = 'sent'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF queue_organization_id IS NULL OR queue_sent_at IS NULL THEN
    RAISE EXCEPTION 'specialist reminder sent outcome lacks canonical queue scope/timestamp'
      USING ERRCODE = '23514';
  END IF;
  IF queue_payload #>> '{successOutcome,appliedAt}' IS NOT NULL THEN
    RETURN false;
  END IF;
  IF queue_payload #>> '{successOutcome,type}' IS DISTINCT FROM 'specialistTask.reminder.markSent' THEN
    RAISE EXCEPTION 'specialist reminder sent outcome has an unsupported type'
      USING ERRCODE = '23514';
  END IF;

  task_id_text := queue_payload #>> '{successOutcome,taskId}';
  IF COALESCE(task_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'specialist reminder sent outcome has an invalid task id'
      USING ERRCODE = '23514';
  END IF;
  task_id := task_id_text::uuid;
  PERFORM set_config('app.specialist_outcome_queue_id', p_queue_id::text, true);

  SELECT task.organization_id
    INTO task_organization_id
  FROM public.specialist_tasks AS task
  WHERE task.id = task_id;

  IF FOUND THEN
    IF task_organization_id IS DISTINCT FROM queue_organization_id THEN
      RAISE EXCEPTION 'specialist reminder sent outcome tenant mismatch'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.specialist_tasks AS task
    SET reminder_sent_at = COALESCE(task.reminder_sent_at, queue_sent_at)
    WHERE task.id = task_id;
  END IF;

  UPDATE public.outgoing_delivery_queue AS delivery
  SET payload_json = jsonb_set(
    delivery.payload_json,
    '{successOutcome,appliedAt}',
    to_jsonb(clock_timestamp()::text),
    true
  )
  WHERE delivery.id = p_queue_id
    AND delivery.payload_json #>> '{successOutcome,appliedAt}' IS NULL;

  RETURN true;
END
$function$;

ALTER FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid)
  FROM app_staff, app_patient, app_worker, app_operational_diagnostic,
       app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid)
  TO app_operational_delivery_worker;
