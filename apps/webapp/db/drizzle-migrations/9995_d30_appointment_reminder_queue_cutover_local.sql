-- D30 Ш7 stages 1-4 only: race-safe appointment-reminder revalidation and ladder transition.
-- Temporary branch number. Assign the final number/journal entry only after integration sync.

GRANT SELECT ON TABLE public.be_appointments, public.user_channel_bindings,
  public.user_channel_preferences, public.user_notification_topics,
  public.user_notification_topic_channels, public.user_web_push_subscriptions TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.outgoing_delivery_queue TO app_owner;

-- 0338 intentionally removed broad app_owner access to operational occurrences. The D7 callback
-- functions are already exact SECURITY DEFINER capabilities, so keep direct access revoked and
-- execute those three functions as the operational table owner instead of restoring broad DML.
DO $d7_callback_owner$
DECLARE
  occurrence_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
  INTO occurrence_owner
  FROM pg_catalog.pg_class AS class
  INNER JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'integrator' AND class.relname = 'user_reminder_occurrences';
  IF occurrence_owner IS NULL THEN
    RAISE EXCEPTION 'integrator.user_reminder_occurrences owner is unavailable';
  END IF;
  EXECUTE format(
    'ALTER FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) OWNER TO %I',
    occurrence_owner
  );
  EXECUTE format(
    'ALTER FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) OWNER TO %I',
    occurrence_owner
  );
  EXECUTE format(
    'ALTER FUNCTION app.patient_done_reminder_occurrence(text) OWNER TO %I',
    occurrence_owner
  );
END
$d7_callback_owner$;
REVOKE ALL ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_done_reminder_occurrence(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) TO app_patient;
GRANT EXECUTE ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.patient_done_reminder_occurrence(text) TO app_patient;

CREATE OR REPLACE FUNCTION app.revalidate_appointment_reminder_materialization(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  delivery public.outgoing_delivery_queue%ROWTYPE;
  appointment_id uuid;
  generation_start timestamptz;
  recipient_user_id uuid;
  recipient_value text;
  is_current boolean := false;
BEGIN
  SELECT * INTO delivery
  FROM public.outgoing_delivery_queue AS candidate
  WHERE candidate.id = p_queue_id
  FOR UPDATE;
  IF NOT FOUND OR delivery.kind <> 'appointment_reminder' OR delivery.status <> 'processing' THEN
    RETURN false;
  END IF;
  IF COALESCE(delivery.payload_json ->> 'appointmentId', '') !~* '^[0-9a-f-]{36}$'
     OR COALESCE(delivery.payload_json ->> 'generationStartAt', '') = ''
     OR COALESCE(delivery.payload_json #>> '{intent,meta,userId}', '') !~* '^[0-9a-f-]{36}$' THEN
    is_current := false;
  ELSE
    appointment_id := (delivery.payload_json ->> 'appointmentId')::uuid;
    generation_start := (delivery.payload_json ->> 'generationStartAt')::timestamptz;
    recipient_user_id := (delivery.payload_json #>> '{intent,meta,userId}')::uuid;
    SELECT EXISTS (
      SELECT 1
      FROM public.be_appointments AS appointment
      WHERE appointment.id = appointment_id
        AND appointment.organization_id = delivery.organization_id
        AND appointment.platform_user_id = recipient_user_id
        AND appointment.start_at = generation_start
        AND appointment.deleted_at IS NULL
        AND appointment.status IN (
          'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
          'visit_confirmed', 'charged_to_package'
        )
    ) INTO is_current;
    IF is_current AND delivery.channel = 'telegram' THEN
      recipient_value := delivery.payload_json #>> '{intent,payload,recipient,chatId}';
      SELECT EXISTS (
        SELECT 1 FROM public.user_channel_bindings AS binding
        WHERE binding.user_id = recipient_user_id
          AND binding.channel_code = 'telegram'
          AND binding.external_id = recipient_value
          AND binding.bot_blocked_at IS NULL
      ) INTO is_current;
    ELSIF is_current AND delivery.channel = 'max' THEN
      recipient_value := delivery.payload_json #>> '{intent,payload,recipient,userId}';
      SELECT EXISTS (
        SELECT 1 FROM public.user_channel_bindings AS binding
        WHERE binding.user_id = recipient_user_id
          AND binding.channel_code = 'max'
          AND binding.external_id = recipient_value
          AND binding.bot_blocked_at IS NULL
      ) INTO is_current;
    ELSIF is_current AND delivery.channel = 'web_push' THEN
      is_current := delivery.payload_json #>> '{intent,payload,recipient,pushUserId}' = recipient_user_id::text
        AND EXISTS (
          SELECT 1 FROM public.user_web_push_subscriptions AS subscription
          WHERE subscription.user_id = recipient_user_id
        );
    ELSE
      is_current := false;
    END IF;

    IF is_current THEN
      IF EXISTS (
        SELECT 1 FROM public.user_channel_preferences AS preference
        WHERE preference.platform_user_id = recipient_user_id
          AND preference.channel_code = delivery.channel
          AND preference.is_enabled_for_notifications = false
      ) OR EXISTS (
        SELECT 1 FROM public.user_notification_topics AS topic
        WHERE topic.user_id = recipient_user_id
          AND topic.topic_code = 'appointment_reminders'
          AND topic.is_enabled = false
      ) OR EXISTS (
        SELECT 1 FROM public.user_notification_topic_channels AS preference
        WHERE preference.user_id = recipient_user_id
          AND preference.topic_code = 'appointment_reminders'
          AND preference.channel_code = delivery.channel
          AND preference.is_enabled = false
      ) THEN
        is_current := false;
      END IF;
    END IF;
  END IF;

  IF NOT is_current THEN
    UPDATE public.outgoing_delivery_queue
    SET status = 'dead', dead_at = now(), last_error = 'appointment_generation_stale', updated_at = now()
    WHERE id = p_queue_id AND status = 'processing';
  END IF;
  RETURN is_current;
END
$function$;

ALTER FUNCTION app.revalidate_appointment_reminder_materialization(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.revalidate_appointment_reminder_materialization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revalidate_appointment_reminder_materialization(uuid)
  TO app_operational_delivery_worker;

CREATE OR REPLACE FUNCTION app.advance_appointment_reminder_messenger_ladder(
  p_queue_id uuid,
  p_expected_attempt_count integer,
  p_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  delivery public.outgoing_delivery_queue%ROWTYPE;
  next_index integer;
  next_step jsonb;
  next_channel text;
  next_recipient jsonb;
BEGIN
  SELECT * INTO delivery
  FROM public.outgoing_delivery_queue AS candidate
  WHERE candidate.id = p_queue_id
    AND candidate.kind = 'appointment_reminder'
    AND candidate.status = 'processing'
    AND candidate.attempt_count = p_expected_attempt_count
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_transitioned'; END IF;

  next_index := COALESCE((delivery.payload_json ->> 'messengerStepIndex')::integer, 0) + 1;
  next_step := delivery.payload_json -> 'messengerLadder' -> next_index;
  IF next_step IS NULL THEN
    UPDATE public.outgoing_delivery_queue
    SET status = 'dead', dead_at = now(), last_error = left(p_error, 900), updated_at = now()
    WHERE id = p_queue_id AND status = 'processing' AND attempt_count = p_expected_attempt_count;
    RETURN 'dead';
  END IF;
  next_channel := next_step ->> 'channel';
  next_recipient := next_step -> 'recipient';
  IF next_channel NOT IN ('telegram', 'max') OR next_recipient IS NULL THEN
    UPDATE public.outgoing_delivery_queue
    SET status = 'dead', dead_at = now(), last_error = 'BAD_APPOINTMENT_REMINDER_LADDER', updated_at = now()
    WHERE id = p_queue_id AND status = 'processing' AND attempt_count = p_expected_attempt_count;
    RETURN 'dead';
  END IF;

  UPDATE public.outgoing_delivery_queue
  SET channel = next_channel,
      payload_json = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(payload_json, '{messengerStepIndex}', to_jsonb(next_index), false),
            '{intent,meta,source}', to_jsonb(next_channel), false
          ),
          '{intent,payload,recipient}', next_recipient, false
        ),
        '{intent,payload,delivery,channels}', jsonb_build_array(next_channel), false
      ),
      status = 'failed_retryable',
      next_retry_at = now() + interval '60 seconds',
      last_error = left(p_error, 900),
      updated_at = now()
  WHERE id = p_queue_id AND status = 'processing' AND attempt_count = p_expected_attempt_count;
  IF NOT FOUND THEN RETURN 'not_transitioned'; END IF;
  RETURN 'advanced';
END
$function$;

ALTER FUNCTION app.advance_appointment_reminder_messenger_ladder(uuid, integer, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.advance_appointment_reminder_messenger_ladder(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.advance_appointment_reminder_messenger_ladder(uuid, integer, text)
  TO app_operational_delivery_worker;
