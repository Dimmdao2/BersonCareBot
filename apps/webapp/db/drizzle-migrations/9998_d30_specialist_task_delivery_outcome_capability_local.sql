-- TEMPORARY LOCAL MIGRATION NUMBER 9998 — final number is assigned by the Track D lead at land.
-- D30 Ш3: a sent transport row is durable proof; product bookkeeping retries without transport.

GRANT SELECT (id, organization_id, reminder_sent_at), UPDATE (reminder_sent_at)
  ON TABLE public.specialist_tasks TO app_owner;
GRANT SELECT (id, kind, status, organization_id, payload_json, sent_at), UPDATE (payload_json)
  ON TABLE public.outgoing_delivery_queue TO app_owner;

DROP POLICY IF EXISTS specialist_task_delivery_outcome_app_owner ON public.specialist_tasks;
DROP POLICY IF EXISTS specialist_task_delivery_outcome_read_app_owner ON public.specialist_tasks;
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
