-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='reminder_occurrence_history' AND column_name='occurrence_key'
-- Track D final cutover (#987), section A: physical consolidation of the three occurrence stores
-- (integrator.user_reminder_occurrences, public.reminder_occurrence_history, public.reminder_journal)
-- into ONE canonical table, per docs/_TODO/runs/integrator-cleanup/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md.
-- Canonical table: public.reminder_occurrence_history (matches the owner architecture literally --
-- "occurrence = one concrete scheduled reminder/date plus patient facts such as seen/snoozed/skipped/done"
-- -- and avoids moving patient-facing history into the integrator schema). This statement widens it with
-- the operational lifecycle columns that only lived on integrator.user_reminder_occurrences, plus a new
-- `done_at` column that replaces the separate reminder_journal 'done' fact.

ALTER TABLE public.reminder_occurrence_history
  ADD COLUMN occurrence_key text,
  ADD COLUMN planned_at timestamp with time zone,
  ADD COLUMN queued_at timestamp with time zone,
  ADD COLUMN sent_at timestamp with time zone,
  ADD COLUMN failed_at timestamp with time zone,
  ADD COLUMN delivery_job_id text,
  ADD COLUMN delivery_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN done_at timestamp with time zone,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ALTER COLUMN occurred_at DROP NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Widen the status contract before the backfill below inserts operational-lifecycle statuses
-- ('planned'/'queued') that the old sent/failed-only history CHECK would reject.

ALTER TABLE public.reminder_occurrence_history
  DROP CONSTRAINT IF EXISTS reminder_occurrence_history_status_check;
ALTER TABLE public.reminder_occurrence_history
  ADD CONSTRAINT reminder_occurrence_history_status_check
  CHECK (status = ANY (ARRAY['planned'::text, 'queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text]));
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Forward data migration, deterministic, no guessing: every integrator.user_reminder_occurrences row
-- (the superset -- confirmed by direct census 23.08.2026: 2602 operational rows, 2467 already-finalized
-- history rows, 0 orphans either direction, 0 duplicate occurrence_key) either already has a matching
-- public.reminder_occurrence_history row (finalized sent/failed occurrences -- enrich in place) or does
-- not yet (still planned/queued/skipped -- insert fresh, sourcing category/integrator_user_id from the
-- owning rule, which the census also proved always resolves). reminder_journal's 'done' fact (9 total
-- journal rows: 3 done / 2 skipped / 4 snoozed) becomes the new done_at column; 'skipped'/'snoozed' facts
-- were already mirrored onto reminder_occurrence_history by the pre-cutover functions, so only 'done'
-- needs a backfill pass.

UPDATE public.reminder_occurrence_history AS h
SET occurrence_key = o.occurrence_key,
    planned_at = o.planned_at,
    queued_at = o.queued_at,
    sent_at = o.sent_at,
    failed_at = o.failed_at,
    delivery_job_id = o.delivery_job_id,
    delivery_generation = o.delivery_generation,
    updated_at = o.updated_at
FROM integrator.user_reminder_occurrences AS o
WHERE h.integrator_occurrence_id = o.id;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL

INSERT INTO public.reminder_occurrence_history (
  organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
  platform_user_id, occurrence_key, category, status, planned_at, queued_at,
  sent_at, failed_at, delivery_channel, delivery_job_id, error_code,
  delivery_generation, occurred_at, created_at, updated_at
)
SELECT
  o.organization_id, o.id, o.rule_id, r.integrator_user_id,
  o.platform_user_id, o.occurrence_key, r.category, o.status, o.planned_at, o.queued_at,
  o.sent_at, o.failed_at, o.delivery_channel, o.delivery_job_id, o.error_code,
  o.delivery_generation, NULL, o.created_at, o.updated_at
FROM integrator.user_reminder_occurrences AS o
INNER JOIN public.reminder_rules AS r ON r.integrator_rule_id = o.rule_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.reminder_occurrence_history AS h WHERE h.integrator_occurrence_id = o.id
);
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL

UPDATE public.reminder_occurrence_history AS h
SET done_at = j.created_at
FROM public.reminder_journal AS j
WHERE j.action = 'done'
  AND j.occurrence_id = h.integrator_occurrence_id
  AND h.done_at IS NULL;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Abort-before-destructive-step gate: re-prove the parity census right before the migration commits to
-- irreversible DROPs below. A drift between the read-only 23.08.2026 census and this transaction's
-- actual data (a new occurrence created between census and migration run, a hand-edited row, etc.) fails
-- the whole migration loudly here, with exact counts, instead of silently dropping a table that still
-- held un-migrated rows.

DO $$
DECLARE
  v_uro_count bigint;
  v_matched_count bigint;
  v_dup_keys bigint;
  v_null_planned bigint;
  v_null_org bigint;
  v_null_platform bigint;
BEGIN
  SELECT count(*) INTO v_uro_count FROM integrator.user_reminder_occurrences;
  SELECT count(*) INTO v_matched_count
    FROM public.reminder_occurrence_history AS h
    WHERE EXISTS (
      SELECT 1 FROM integrator.user_reminder_occurrences AS o WHERE o.id = h.integrator_occurrence_id
    );
  IF v_matched_count <> v_uro_count THEN
    RAISE EXCEPTION 'occurrence consolidation parity check failed: % operational rows, % matched in history',
      v_uro_count, v_matched_count USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_dup_keys FROM (
    SELECT occurrence_key FROM public.reminder_occurrence_history
    WHERE occurrence_key IS NOT NULL GROUP BY occurrence_key HAVING count(*) > 1
  ) AS q;
  IF v_dup_keys > 0 THEN
    RAISE EXCEPTION 'occurrence consolidation parity check failed: % duplicate occurrence_key values after backfill',
      v_dup_keys USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_null_planned FROM public.reminder_occurrence_history WHERE planned_at IS NULL;
  IF v_null_planned > 0 THEN
    RAISE EXCEPTION 'occurrence consolidation parity check failed: % rows missing planned_at after backfill',
      v_null_planned USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_null_org FROM public.reminder_occurrence_history WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'occurrence consolidation parity check failed: % rows missing organization_id',
      v_null_org USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_null_platform FROM public.reminder_occurrence_history WHERE platform_user_id IS NULL;
  IF v_null_platform > 0 THEN
    RAISE EXCEPTION 'occurrence consolidation parity check failed: % rows missing platform_user_id',
      v_null_platform USING ERRCODE = '23514';
  END IF;
END
$$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Now that the parity gate above passed, tighten the widened columns and the status contract, and add
-- the indexes the operational lifecycle needs (claim/status/time -- AGENTS.md §1 "индекс на горячую
-- колонку в том же PR"), mirroring the indexes integrator.user_reminder_occurrences carried.

ALTER TABLE public.reminder_occurrence_history
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN platform_user_id SET NOT NULL,
  ALTER COLUMN planned_at SET NOT NULL;

ALTER TABLE public.reminder_occurrence_history
  ADD CONSTRAINT reminder_occurrence_history_occurrence_key_key UNIQUE (occurrence_key);

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_status_planned_at
  ON public.reminder_occurrence_history USING btree (status, planned_at);
CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_platform_status_planned
  ON public.reminder_occurrence_history USING btree (platform_user_id, status, planned_at);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Rewritten root: writes the freshly-materialized 'planned' occurrence row directly into the canonical
-- table instead of integrator.user_reminder_occurrences. `v_existing.id` (the operational table's text
-- PK) becomes `v_existing.integrator_occurrence_id` throughout (public.reminder_occurrence_history keeps
-- its own surrogate uuid `id`, unrelated to the occurrence business key). `category` is now captured at
-- materialization time (previously only resolved lazily, at finalize time) since the row must be
-- self-sufficient from creation.

CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization(p_organization_id uuid, p_occurrence_id text, p_rule_id text, p_platform_user_id uuid, p_occurrence_key text, p_planned_at timestamp with time zone, p_delivery_generation integer, p_deliveries_json text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_deliveries jsonb;
  v_delivery jsonb;
  v_existing public.reminder_occurrence_history%ROWTYPE;
  v_topic_code text;
  v_integrator_user_id text;
  v_integrator_user_id_bigint bigint;
  v_category text;
  v_event_id text;
  v_channel text;
  v_external_id text;
  v_log_text text;
  v_intent jsonb;
  v_intent_payload jsonb;
  v_queue_payload jsonb;
  v_event_ids text[] := ARRAY[]::text[];
  v_affected integer := 0;
  v_row_count integer;
  v_fingerprint text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_materialization_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'reminder.materialization.commit', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($6))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg]), 'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)'::regprocedure);

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'patient reminder commit organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_occurrence_id IS NULL OR btrim(p_occurrence_id) = ''
     OR p_rule_id IS NULL OR btrim(p_rule_id) = ''
     OR p_occurrence_key IS NULL OR btrim(p_occurrence_key) = ''
     OR p_delivery_generation IS NULL OR p_delivery_generation < 0 THEN
    RAISE EXCEPTION 'invalid patient reminder occurrence envelope' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_deliveries := p_deliveries_json::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid patient reminder deliveries json' USING ERRCODE = '22023';
  END;
  IF jsonb_typeof(v_deliveries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid patient reminder deliveries envelope' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_deliveries) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'no_channels');
  END IF;
  IF jsonb_array_length(v_deliveries) > 4 THEN
    RAISE EXCEPTION 'too many patient reminder deliveries' USING ERRCODE = '22023';
  END IF;

  SELECT rule.notification_topic_code, rule.integrator_user_id::text, rule.category, rule.integrator_user_id
  INTO v_topic_code, v_integrator_user_id, v_category, v_integrator_user_id_bigint
  FROM public.reminder_rules AS rule
  WHERE rule.integrator_rule_id = p_rule_id
    AND rule.organization_id = v_org
    AND rule.platform_user_id = p_platform_user_id
    AND rule.is_enabled = true
    AND rule.integrator_user_id IS NOT NULL
    AND rule.notification_topic_code IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = p_platform_user_id
        AND enrollment.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = p_platform_user_id
        AND patient.is_blocked = false
        AND patient.is_archived = false
        AND patient.merged_into_id IS NULL
        AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
    );
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable');
  END IF;

  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, occurrence_key, category, status, planned_at,
    delivery_generation, created_at, updated_at
  ) VALUES (
    v_org, p_occurrence_id, p_rule_id, v_integrator_user_id_bigint,
    p_platform_user_id, p_occurrence_key, v_category, 'planned', p_planned_at,
    p_delivery_generation, statement_timestamp(), statement_timestamp()
  ) ON CONFLICT (occurrence_key) DO NOTHING;

  SELECT candidate.integrator_occurrence_id, candidate.integrator_rule_id, candidate.organization_id,
         candidate.platform_user_id, candidate.planned_at, candidate.status, candidate.delivery_generation
  INTO v_existing.integrator_occurrence_id, v_existing.integrator_rule_id, v_existing.organization_id,
       v_existing.platform_user_id, v_existing.planned_at, v_existing.status, v_existing.delivery_generation
  FROM public.reminder_occurrence_history AS candidate
  WHERE candidate.occurrence_key = p_occurrence_key
  FOR UPDATE;
  IF NOT FOUND
     OR v_existing.integrator_rule_id IS DISTINCT FROM p_rule_id
     OR v_existing.organization_id IS DISTINCT FROM v_org
     OR v_existing.platform_user_id IS DISTINCT FROM p_platform_user_id
     OR v_existing.planned_at IS DISTINCT FROM p_planned_at
     OR v_existing.status NOT IN ('planned', 'queued') THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable');
  END IF;
  IF v_existing.status = 'queued' THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'dedup');
  END IF;
  IF v_existing.integrator_occurrence_id IS DISTINCT FROM p_occurrence_id
     OR v_existing.delivery_generation IS DISTINCT FROM p_delivery_generation THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable');
  END IF;

  FOR v_delivery IN SELECT value FROM jsonb_array_elements(v_deliveries) AS item(value) LOOP
    IF jsonb_typeof(v_delivery) IS DISTINCT FROM 'object'
       OR pg_catalog.octet_length(v_delivery::text) > 65536
       OR jsonb_typeof(v_delivery -> 'organizationId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'eventId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'kind') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'channel') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'occurrenceId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'deliveryGeneration') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_delivery -> 'topicCode') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'externalId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'logText') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'platformUserId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'maxAttempts') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_delivery -> 'nextRetryAt') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_delivery -> 'intent') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid patient reminder delivery scalar types' USING ERRCODE = '22023';
    END IF;

    v_event_id := v_delivery ->> 'eventId';
    v_channel := v_delivery ->> 'channel';
    v_external_id := v_delivery ->> 'externalId';
    v_log_text := v_delivery ->> 'logText';
    v_intent := v_delivery -> 'intent';
    v_intent_payload := v_intent -> 'payload';

    IF v_delivery ->> 'organizationId' IS DISTINCT FROM v_org::text
       OR v_delivery ->> 'occurrenceId' IS DISTINCT FROM v_existing.integrator_occurrence_id
       OR (v_delivery ->> 'deliveryGeneration') !~ '^[0-9]+$'
       OR (v_delivery ->> 'deliveryGeneration')::integer <> v_existing.delivery_generation
       OR v_delivery ->> 'platformUserId' IS DISTINCT FROM p_platform_user_id::text
       OR v_delivery ->> 'topicCode' IS DISTINCT FROM v_topic_code
       OR pg_catalog.length(v_delivery ->> 'topicCode') NOT BETWEEN 1 AND 128
       OR v_delivery ->> 'kind' IS DISTINCT FROM 'reminder_dispatch'
       OR v_channel NOT IN ('telegram', 'max', 'vk', 'email', 'web_push')
       OR pg_catalog.length(v_event_id) NOT BETWEEN 1 AND 512
       OR v_event_id IS DISTINCT FROM concat(
         'rem:', v_existing.integrator_occurrence_id, ':g', v_existing.delivery_generation::text, ':', v_channel
       )
       OR pg_catalog.btrim(v_external_id) IS DISTINCT FROM v_external_id
       OR pg_catalog.length(v_external_id) NOT BETWEEN 1 AND 512
       OR pg_catalog.length(v_log_text) NOT BETWEEN 1 AND 16000
       OR (v_delivery ->> 'maxAttempts') !~ '^[0-9]+$'
       OR (v_delivery ->> 'maxAttempts')::integer NOT BETWEEN 1 AND 20
       OR (v_delivery ->> 'nextRetryAt')::timestamptz IS DISTINCT FROM p_planned_at THEN
      RAISE EXCEPTION 'invalid patient reminder ready delivery' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_intent -> 'meta') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent_payload) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent #> '{meta,eventId}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,occurredAt}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,source}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,userId}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,outboundMessageClass}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent #> '{meta,outboundCapability}') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_intent_payload -> 'recipient') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent_payload -> 'message') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_intent_payload #> '{message,text}') IS DISTINCT FROM 'string'
       OR v_intent ->> 'type' IS DISTINCT FROM 'message.send'
       OR v_intent #>> '{meta,eventId}' IS DISTINCT FROM v_event_id
       OR pg_catalog.length(v_intent #>> '{meta,occurredAt}') NOT BETWEEN 20 AND 40
       OR (v_intent #>> '{meta,occurredAt}')::timestamptz IS NULL
       OR v_intent #>> '{meta,source}' IS DISTINCT FROM v_channel
       OR v_intent #>> '{meta,userId}' IS DISTINCT FROM v_integrator_user_id
       OR v_intent #>> '{meta,outboundMessageClass}' IS DISTINCT FROM 'routine_product'
       OR v_intent #>> '{meta,outboundCapability}' IS DISTINCT FROM
          (CASE WHEN v_channel = 'web_push' THEN 'app_push' ELSE 'essential_delivery' END)
       OR pg_catalog.length(v_intent_payload #>> '{message,text}') NOT BETWEEN 1 AND 65536
       OR jsonb_typeof(v_intent_payload -> 'delivery') IS DISTINCT FROM 'object'
       OR v_intent_payload #> '{delivery,channels}' IS DISTINCT FROM jsonb_build_array(v_channel)
       OR jsonb_typeof(v_intent_payload #> '{delivery,maxAttempts}') IS DISTINCT FROM 'number'
       OR v_intent_payload #>> '{delivery,maxAttempts}' IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'invalid patient reminder intent envelope' USING ERRCODE = '22023';
    END IF;

    IF (v_channel = 'telegram' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,chatId}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,chatId}' IS DISTINCT FROM v_external_id
        ))
       OR (v_channel = 'max' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,userId}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,userId}' IS DISTINCT FROM v_external_id
        ))
       OR (v_channel = 'email' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,email}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,email}' IS DISTINCT FROM v_external_id
          OR v_intent_payload #>> '{message,text}' IS DISTINCT FROM v_log_text
          OR jsonb_typeof(v_intent_payload -> 'subject') IS DISTINCT FROM 'string'
          OR pg_catalog.length(v_intent_payload ->> 'subject') NOT BETWEEN 1 AND 200
        ))
       OR (v_channel = 'web_push' AND (
          jsonb_typeof(v_intent_payload #> '{recipient,pushUserId}') IS DISTINCT FROM 'string'
          OR v_intent_payload #>> '{recipient,pushUserId}' IS DISTINCT FROM v_external_id
          OR v_external_id IS DISTINCT FROM p_platform_user_id::text
          OR v_intent_payload #>> '{message,text}' IS DISTINCT FROM v_log_text
          OR jsonb_typeof(v_intent_payload -> 'title') IS DISTINCT FROM 'string'
          OR pg_catalog.length(v_intent_payload ->> 'title') NOT BETWEEN 1 AND 200
        )) THEN
      RAISE EXCEPTION 'invalid patient reminder channel recipient' USING ERRCODE = '22023';
    END IF;

    IF v_event_id = ANY(v_event_ids) THEN
      RAISE EXCEPTION 'duplicate patient reminder delivery event' USING ERRCODE = '22023';
    END IF;
    v_event_ids := array_append(v_event_ids, v_event_id);

    v_queue_payload := jsonb_build_object(
      'occurrenceId', v_existing.integrator_occurrence_id,
      'deliveryGeneration', v_existing.delivery_generation,
      'topicCode', v_topic_code,
      'channel', v_channel,
      'deliveryLogId', concat('rdl:', v_existing.integrator_occurrence_id, ':g', v_existing.delivery_generation::text, ':', v_channel),
      'externalId', v_external_id,
      'logText', v_log_text,
      'platformUserId', p_platform_user_id,
      'intent', v_intent
    );

    INSERT INTO public.outgoing_delivery_queue (
      organization_id, event_id, kind, channel, payload_json, status, attempt_count,
      max_attempts, next_retry_at, last_error, dead_at, priority, created_at, updated_at
    ) VALUES (
      v_org,
      v_event_id,
      'reminder_dispatch',
      v_channel,
      v_queue_payload,
      'pending', 0, (v_delivery ->> 'maxAttempts')::integer,
      (v_delivery ->> 'nextRetryAt')::timestamptz, NULL, NULL, 0,
      statement_timestamp(), statement_timestamp()
    )
    ON CONFLICT (event_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      PERFORM 1
      FROM public.outgoing_delivery_queue AS queued
      WHERE queued.event_id = v_event_id
        AND queued.organization_id = v_org
        AND queued.kind = 'reminder_dispatch'
        AND queued.channel = v_channel
        AND queued.status IN ('pending', 'failed_retryable')
        AND queued.max_attempts = (v_delivery ->> 'maxAttempts')::integer
        AND (queued.payload_json - 'materializationFingerprint') = v_queue_payload
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'patient reminder queue conflict' USING ERRCODE = '23505';
      END IF;

      UPDATE public.outgoing_delivery_queue AS queued
      SET status = 'pending',
          attempt_count = 0,
          next_retry_at = (v_delivery ->> 'nextRetryAt')::timestamptz,
          last_error = NULL,
          dead_at = NULL,
          updated_at = statement_timestamp()
      WHERE queued.event_id = v_event_id
        AND queued.organization_id = v_org
        AND queued.kind = 'reminder_dispatch'
        AND queued.channel = v_channel
        AND queued.status IN ('pending', 'failed_retryable')
        AND (queued.payload_json - 'materializationFingerprint') = v_queue_payload;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count <> 1 THEN
        RAISE EXCEPTION 'patient reminder queue conflict' USING ERRCODE = '23505';
      END IF;
    END IF;
    v_affected := v_affected + v_row_count;
  END LOOP;

  FOR v_delivery IN SELECT value FROM jsonb_array_elements(v_deliveries) AS item(value) LOOP
    v_fingerprint := app.patient_reminder_materialization_fingerprint(
      v_existing.integrator_occurrence_id,
      v_delivery ->> 'channel'
    );
    IF v_fingerprint IS NULL OR v_fingerprint !~ '^[0-9a-f]{32}$' THEN
      RAISE EXCEPTION 'patient reminder materialization fingerprint unavailable';
    END IF;
    UPDATE public.outgoing_delivery_queue AS queued
    SET payload_json = jsonb_set(queued.payload_json, '{materializationFingerprint}', to_jsonb(v_fingerprint), true),
        updated_at = statement_timestamp()
    WHERE queued.event_id = v_delivery ->> 'eventId'
      AND queued.organization_id = v_org
      AND queued.kind = 'reminder_dispatch'
      AND queued.channel = v_delivery ->> 'channel'
      AND queued.payload_json ->> 'occurrenceId' = v_existing.integrator_occurrence_id
      AND queued.payload_json ->> 'deliveryGeneration' = v_existing.delivery_generation::text
      AND queued.status IN ('pending', 'failed_retryable');
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'patient reminder fingerprint queue conflict' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  UPDATE public.reminder_occurrence_history AS occurrence
  SET status = 'queued', queued_at = statement_timestamp(), updated_at = statement_timestamp()
  WHERE occurrence.integrator_occurrence_id = v_existing.integrator_occurrence_id
    AND occurrence.delivery_generation = v_existing.delivery_generation
    AND occurrence.status = 'planned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient reminder occurrence queue mark failed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', CASE WHEN v_affected > 0 THEN 'materialized' ELSE 'dedup' END
  );
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.upsert_patient_reminder_occurrence_plan(p_occurrence_id text, p_rule_id text, p_organization_id uuid, p_platform_user_id uuid, p_occurrence_key text, p_planned_at timestamp with time zone)
 RETURNS TABLE(occurrence_id text, delivery_generation integer, materializable boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  caller_organization_id uuid;
  existing public.reminder_occurrence_history%ROWTYPE;
  v_category text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_staff'::name]::name[]);

  caller_organization_id := NULLIF(current_setting('app.org', true), '')::uuid;
  IF caller_organization_id IS NULL OR caller_organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'patient reminder materialization tenant mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT rule.category INTO v_category
  FROM public.reminder_rules AS rule
  WHERE rule.integrator_rule_id = p_rule_id
    AND rule.organization_id = p_organization_id
    AND rule.platform_user_id = p_platform_user_id
    AND rule.is_enabled = true
    AND rule.notification_topic_code IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = p_platform_user_id
        AND patient.is_blocked = false
        AND patient.is_archived = false
        AND patient.merged_into_id IS NULL
        AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
    );
  IF v_category IS NULL THEN
    RETURN QUERY SELECT p_occurrence_id, 0, false;
    RETURN;
  END IF;

  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, platform_user_id,
    occurrence_key, category, status, planned_at, delivery_generation, created_at, updated_at
  ) VALUES (
    p_organization_id, p_occurrence_id, p_rule_id, p_platform_user_id,
    p_occurrence_key, v_category, 'planned', p_planned_at, 0, statement_timestamp(), statement_timestamp()
  ) ON CONFLICT (occurrence_key) DO NOTHING;

  SELECT * INTO existing
  FROM public.reminder_occurrence_history AS occurrence
  WHERE occurrence.occurrence_key = p_occurrence_key
  FOR UPDATE;
  IF existing.integrator_rule_id IS DISTINCT FROM p_rule_id
    OR existing.organization_id IS DISTINCT FROM p_organization_id
    OR existing.platform_user_id IS DISTINCT FROM p_platform_user_id
    OR existing.planned_at IS DISTINCT FROM p_planned_at
    OR existing.status NOT IN ('planned', 'queued')
  THEN
    RETURN QUERY SELECT existing.integrator_occurrence_id, existing.delivery_generation, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT existing.integrator_occurrence_id, existing.delivery_generation, true;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.mark_patient_reminder_occurrence_queued(p_occurrence_id text, p_generation integer, p_event_ids text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  occurrence public.reminder_occurrence_history%ROWTYPE;
  caller_organization_id uuid;
  invalid_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_staff'::name]::name[]);

  IF COALESCE(array_length(p_event_ids, 1), 0) = 0 THEN RETURN false; END IF;
  SELECT * INTO occurrence
  FROM public.reminder_occurrence_history AS candidate
  WHERE candidate.integrator_occurrence_id = p_occurrence_id
  FOR UPDATE;
  IF NOT FOUND OR occurrence.delivery_generation <> p_generation
    OR occurrence.status NOT IN ('planned', 'queued')
  THEN RETURN false; END IF;
  caller_organization_id := NULLIF(current_setting('app.org', true), '')::uuid;
  IF caller_organization_id IS NULL
    OR occurrence.organization_id IS DISTINCT FROM caller_organization_id
  THEN RAISE EXCEPTION 'patient reminder queued mark tenant mismatch' USING ERRCODE = '42501'; END IF;

  SELECT count(*) INTO invalid_count
  FROM unnest(p_event_ids) AS requested(event_id)
  LEFT JOIN public.outgoing_delivery_queue AS delivery ON delivery.event_id = requested.event_id
  WHERE delivery.id IS NULL
     OR delivery.kind <> 'reminder_dispatch'
     OR delivery.organization_id IS DISTINCT FROM occurrence.organization_id
     OR delivery.status NOT IN ('pending', 'failed_retryable')
     OR delivery.payload_json ->> 'occurrenceId' IS DISTINCT FROM occurrence.integrator_occurrence_id
     OR (delivery.payload_json ->> 'deliveryGeneration')::integer <> occurrence.delivery_generation
     OR delivery.payload_json ->> 'channel' IS DISTINCT FROM delivery.channel
     OR delivery.payload_json ->> 'topicCode' IS DISTINCT FROM (
       SELECT rule.notification_topic_code
       FROM public.reminder_rules AS rule
       WHERE rule.integrator_rule_id = occurrence.integrator_rule_id
         AND rule.organization_id = occurrence.organization_id
         AND rule.platform_user_id = occurrence.platform_user_id
     )
     OR delivery.event_id IS DISTINCT FROM concat(
       'rem:', occurrence.integrator_occurrence_id, ':g', occurrence.delivery_generation::text, ':', delivery.channel
     );
  IF invalid_count <> 0 THEN RETURN false; END IF;

  UPDATE public.outgoing_delivery_queue AS delivery
  SET payload_json = jsonb_set(
        delivery.payload_json,
        '{materializationFingerprint}',
        to_jsonb(app.patient_reminder_materialization_fingerprint(occurrence.integrator_occurrence_id, delivery.channel)),
        true
      ),
      updated_at = statement_timestamp()
  WHERE delivery.event_id = ANY(p_event_ids);
  IF EXISTS (
    SELECT 1 FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.event_id = ANY(p_event_ids)
      AND COALESCE(delivery.payload_json ->> 'materializationFingerprint', '') !~ '^[0-9a-f]{32}$'
  ) THEN RETURN false; END IF;

  UPDATE public.reminder_occurrence_history AS candidate
  SET status = 'queued', queued_at = statement_timestamp(), updated_at = statement_timestamp()
  WHERE candidate.integrator_occurrence_id = occurrence.integrator_occurrence_id
    AND candidate.delivery_generation = occurrence.delivery_generation
    AND candidate.status IN ('planned', 'queued');
  RETURN FOUND;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.patient_cancel_pending_reminder_occurrences(p_rule_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_org_id uuid := app.current_org_id();
  v_deleted integer := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_patient_user_id IS NULL OR v_org_id IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.reminder_occurrence_history AS occurrence
  USING public.reminder_rules AS rule
  WHERE occurrence.integrator_rule_id = p_rule_id
    AND occurrence.integrator_rule_id = rule.integrator_rule_id
    AND occurrence.platform_user_id = v_patient_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.platform_user_id = v_patient_user_id
    AND rule.organization_id = v_org_id
    AND occurrence.status IN ('planned', 'queued');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql

CREATE OR REPLACE FUNCTION app.patient_reminder_materialization_fingerprint(p_occurrence_id text, p_channel text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT md5(jsonb_build_object(
    'occurrence', jsonb_build_array(
      occurrence.integrator_rule_id, occurrence.organization_id, occurrence.platform_user_id,
      occurrence.delivery_generation, occurrence.planned_at
    ),
    'rule', jsonb_build_array(
      rule.integrator_rule_id, rule.organization_id, rule.platform_user_id, rule.integrator_user_id,
      rule.is_enabled, rule.notification_topic_code, rule.reminder_intent, rule.linked_object_type,
      rule.linked_object_id, rule.custom_title, rule.custom_text, rule.display_title, rule.updated_at
    ),
    'patient', jsonb_build_array(
      patient.reminder_muted_until, patient_email.value_normalized,
      patient_email.confirmed_at, patient_email.updated_at, patient.updated_at
    ),
    'bindings', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        binding.channel_code, binding.external_id, binding.bot_blocked_at, binding.created_at
      ) ORDER BY binding.channel_code, binding.external_id)
      FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id
        AND binding.channel_code = p_channel
    ), '[]'::jsonb),
    'channelPreference', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        preference.channel_code, preference.is_enabled_for_notifications, preference.updated_at
      ) ORDER BY preference.channel_code)
      FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = occurrence.platform_user_id
        AND preference.channel_code = p_channel
    ), '[]'::jsonb),
    'topic', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(topic.topic_code, topic.is_enabled, topic.updated_at))
      FROM public.user_notification_topics AS topic
      WHERE topic.user_id = occurrence.platform_user_id
        AND topic.topic_code = delivery.payload_json ->> 'topicCode'
    ), '[]'::jsonb),
    'topicChannel', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        preference.topic_code, preference.channel_code, preference.is_enabled, preference.updated_at
      ))
      FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = occurrence.platform_user_id
        AND preference.topic_code = delivery.payload_json ->> 'topicCode'
        AND preference.channel_code = p_channel
    ), '[]'::jsonb),
    'webPushSubscriptions', CASE WHEN p_channel = 'web_push' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        subscription.endpoint, subscription.p256dh, subscription.auth, subscription.updated_at
      ) ORDER BY subscription.endpoint)
      FROM public.user_web_push_subscriptions AS subscription
      WHERE subscription.user_id = occurrence.platform_user_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'providerSettings', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        setting.key, setting.scope, setting.organization_id, setting.value_json, setting.updated_at
      ) ORDER BY setting.key, setting.scope, setting.organization_id NULLS FIRST)
      FROM public.system_settings AS setting
      WHERE (p_channel = 'web_push' AND setting.key = 'web_push_vapid' AND setting.scope = 'admin')
         OR (p_channel = 'email' AND setting.key = 'smtp_outbound' AND setting.scope = 'admin')
    ), '[]'::jsonb)
  )::text)
  FROM public.reminder_occurrence_history AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.integrator_rule_id
   AND rule.organization_id = occurrence.organization_id
   AND rule.platform_user_id = occurrence.platform_user_id
  INNER JOIN public.platform_users AS patient ON patient.id = occurrence.platform_user_id
  LEFT JOIN public.user_contacts AS patient_email
    ON patient_email.platform_user_id = patient.id
   AND patient_email.contact_kind = 'email'
   AND patient_email.is_primary = true
  INNER JOIN public.outgoing_delivery_queue AS delivery
    ON delivery.event_id = concat(
      'rem:', occurrence.integrator_occurrence_id, ':g', occurrence.delivery_generation::text, ':', p_channel
    )
   AND delivery.kind = 'reminder_dispatch'
   AND delivery.organization_id = occurrence.organization_id
  WHERE occurrence.integrator_occurrence_id = p_occurrence_id
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.read_patient_reminder_materialization_snapshot(p_organization_id uuid, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_rules jsonb;
  v_due jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_materialization_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'reminder.materialization.snapshot.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg]), 'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)'::regprocedure);

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'patient reminder materialization organization mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rule.integrator_rule_id,
    'organizationId', rule.organization_id,
    'platformUserId', rule.platform_user_id,
    'integratorUserId', CASE WHEN rule.integrator_user_id IS NULL THEN NULL ELSE rule.integrator_user_id::text END,
    'category', rule.category,
    'isEnabled', rule.is_enabled,
    'scheduleType', rule.schedule_type,
    'timezone', rule.timezone,
    'intervalMinutes', rule.interval_minutes,
    'windowStartMinute', rule.window_start_minute,
    'windowEndMinute', rule.window_end_minute,
    'daysMask', rule.days_mask,
    'scheduleData', rule.schedule_data,
    'quietHoursStartMinute', rule.quiet_hours_start_minute,
    'quietHoursEndMinute', rule.quiet_hours_end_minute,
    'linkedObjectType', rule.linked_object_type,
    'linkedObjectId', rule.linked_object_id,
    'customTitle', rule.custom_title,
    'customText', rule.custom_text,
    'displayTitle', rule.display_title,
    'reminderIntent', rule.reminder_intent,
    'notificationTopicCode', rule.notification_topic_code,
    'linkedTitle', CASE
      WHEN rule.linked_object_type = 'content_page' THEN (
        SELECT page.title
        FROM public.content_pages AS page
        WHERE page.slug = rule.linked_object_id
          AND page.is_published = true
          AND page.deleted_at IS NULL
          AND (page.organization_id = v_org OR page.organization_id IS NULL)
        ORDER BY (page.organization_id = v_org) DESC, page.updated_at DESC, page.id
        LIMIT 1
      )
      WHEN rule.linked_object_type = 'content_section' THEN (
        SELECT section.title
        FROM public.content_sections AS section
        WHERE section.slug = rule.linked_object_id
          AND section.is_visible = true
          AND (section.organization_id = v_org OR section.organization_id IS NULL)
        ORDER BY (section.organization_id = v_org) DESC, section.updated_at DESC, section.id
        LIMIT 1
      )
      ELSE NULL
    END
  ) ORDER BY rule.integrator_rule_id), '[]'::jsonb)
  INTO v_rules
  FROM public.reminder_rules AS rule
  WHERE rule.organization_id = v_org
    AND rule.is_enabled = true
    AND rule.platform_user_id IS NOT NULL
    AND rule.integrator_user_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ruleId', occurrence.rule_id,
    'occurrenceId', occurrence.id,
    'deliveryGeneration', occurrence.delivery_generation,
    'occurrenceKey', occurrence.occurrence_key,
    'plannedAt', occurrence.planned_at
  ) ORDER BY occurrence.planned_at, occurrence.id), '[]'::jsonb)
  INTO v_due
  FROM (
    SELECT candidate.integrator_occurrence_id AS id, candidate.integrator_rule_id AS rule_id,
           candidate.occurrence_key, candidate.planned_at, candidate.delivery_generation
    FROM public.reminder_occurrence_history AS candidate
    INNER JOIN public.reminder_rules AS rule
      ON rule.integrator_rule_id = candidate.integrator_rule_id
     AND rule.organization_id = candidate.organization_id
     AND rule.platform_user_id = candidate.platform_user_id
    WHERE candidate.organization_id = v_org
      AND candidate.status = 'planned'
      AND candidate.planned_at <= p_now
      AND rule.is_enabled = true
    ORDER BY candidate.planned_at, candidate.integrator_occurrence_id
    LIMIT 100
  ) AS occurrence;

  RETURN jsonb_build_object('ok', true, 'rules', v_rules, 'dueOccurrences', v_due);
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid)
 RETURNS TABLE(queue_kind text, organization_id uuid, resolution text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  queue_payload jsonb;
  stored_organization_id uuid;
  v_occurrence_id text;
  v_broadcast_audit_id uuid;
  v_incident_id uuid;
  occurrence_org uuid;
  rule_org uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.resolve-scope', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.resolve_outgoing_delivery_scope(uuid)'::regprocedure);

  SELECT queue.kind, queue.organization_id, queue.payload_json
  INTO queue_kind, stored_organization_id, queue_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.id = p_queue_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::uuid, 'queue_not_found'::text;
    RETURN;
  END IF;

  IF stored_organization_id IS NOT NULL THEN
    RETURN QUERY SELECT queue_kind, stored_organization_id, 'tenant'::text;
    RETURN;
  END IF;

  IF queue_kind = 'operator_alert' THEN
    IF COALESCE(queue_payload ->> 'incidentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_incident_id'::text;
      RETURN;
    END IF;
    v_incident_id := (queue_payload ->> 'incidentId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.operator_incidents AS incident WHERE incident.id = v_incident_id) THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'incident_not_found'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;

  IF queue_kind IN ('inbound_reply', 'operator_health_digest', 'auth_email_otp', 'outbound_message') THEN
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;

  IF queue_kind = 'reminder_dispatch' THEN
    IF COALESCE(queue_payload ->> 'occurrenceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_occurrence_id'::text;
      RETURN;
    END IF;
    v_occurrence_id := queue_payload ->> 'occurrenceId';
    SELECT occurrence.organization_id, rule.organization_id INTO occurrence_org, rule_org
    FROM public.reminder_occurrence_history AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.integrator_rule_id
    WHERE occurrence.integrator_occurrence_id = v_occurrence_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'occurrence_not_found'::text;
    ELSIF occurrence_org IS NOT NULL AND rule_org IS NOT NULL AND occurrence_org <> rule_org THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'ambiguous_organization'::text;
    ELSIF COALESCE(occurrence_org, rule_org) IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, COALESCE(occurrence_org, rule_org), 'tenant'::text;
    END IF;
    RETURN;
  END IF;

  IF queue_kind = 'doctor_broadcast_intent' THEN
    IF COALESCE(queue_payload ->> 'broadcastAuditId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_broadcast_audit_id'::text;
      RETURN;
    END IF;
    v_broadcast_audit_id := (queue_payload ->> 'broadcastAuditId')::uuid;
    SELECT audit.organization_id INTO organization_id
    FROM public.broadcast_audit AS audit WHERE audit.id = v_broadcast_audit_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'broadcast_audit_not_found'::text;
    ELSIF organization_id IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, organization_id, 'tenant'::text;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT queue_kind, NULL::uuid, 'unsupported_queue_kind'::text;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The done/skipped exclusion previously read the separate reminder_journal table; it now reads the two
-- fact columns directly off the same occurrence row already fetched into `occurrence` above -- one fewer
-- cross-table lookup, same exclusion semantics (a done or skipped occurrence never revalidates).

CREATE OR REPLACE FUNCTION app.revalidate_patient_reminder_delivery_materialization(p_queue_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  delivery record;
  occurrence record;
  rule record;
  expected_fingerprint text;
  current_fingerprint text;
  resolved_topic_code text;
  recipient text;
  channel_allowed boolean;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

  SELECT candidate.id, candidate.event_id, candidate.kind, candidate.channel,
         candidate.payload_json, candidate.status, candidate.organization_id
    INTO delivery
  FROM public.outgoing_delivery_queue AS candidate
  WHERE candidate.id = p_queue_id
    AND candidate.kind = 'reminder_dispatch'
    AND candidate.status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT candidate.integrator_occurrence_id AS id, candidate.integrator_rule_id AS rule_id,
         candidate.status, candidate.organization_id, candidate.platform_user_id,
         candidate.delivery_generation, candidate.done_at, candidate.skipped_at
    INTO occurrence
  FROM public.reminder_occurrence_history AS candidate
  WHERE candidate.integrator_occurrence_id = delivery.payload_json ->> 'occurrenceId';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT candidate.id, candidate.integrator_rule_id, candidate.platform_user_id,
         candidate.is_enabled, candidate.notification_topic_code, candidate.organization_id
    INTO rule
  FROM public.reminder_rules AS candidate
  WHERE candidate.integrator_rule_id = occurrence.rule_id;
  IF NOT FOUND THEN RETURN false; END IF;

  resolved_topic_code := delivery.payload_json ->> 'topicCode';
  recipient := CASE delivery.channel
    WHEN 'telegram' THEN delivery.payload_json #>> '{intent,payload,recipient,chatId}'
    WHEN 'max' THEN delivery.payload_json #>> '{intent,payload,recipient,userId}'
    WHEN 'email' THEN delivery.payload_json #>> '{intent,payload,recipient,email}'
    WHEN 'web_push' THEN delivery.payload_json #>> '{intent,payload,recipient,pushUserId}'
    ELSE NULL
  END;
  expected_fingerprint := delivery.payload_json ->> 'materializationFingerprint';
  current_fingerprint := app.patient_reminder_materialization_fingerprint(occurrence.id, delivery.channel);
  channel_allowed := CASE delivery.channel
    WHEN 'telegram' THEN EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id AND binding.channel_code = 'telegram'
        AND binding.external_id = recipient AND binding.bot_blocked_at IS NULL
    )
    WHEN 'max' THEN EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = occurrence.platform_user_id AND binding.channel_code = 'max'
        AND binding.external_id = recipient AND binding.bot_blocked_at IS NULL
    )
    WHEN 'email' THEN EXISTS (
      SELECT 1 FROM public.user_contacts AS contact
      WHERE contact.platform_user_id = occurrence.platform_user_id
        AND contact.contact_kind = 'email'
        AND contact.value_normalized = recipient
        AND contact.confirmed_at IS NOT NULL
    )
    WHEN 'web_push' THEN recipient = occurrence.platform_user_id::text AND EXISTS (
      SELECT 1 FROM public.user_web_push_subscriptions AS subscription
      WHERE subscription.user_id = occurrence.platform_user_id
    )
    ELSE false
  END;

  IF delivery.organization_id = occurrence.organization_id
    AND occurrence.organization_id = rule.organization_id
    AND occurrence.platform_user_id = rule.platform_user_id
    AND resolved_topic_code = rule.notification_topic_code
    AND delivery.event_id = concat(
      'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', delivery.channel
    )
    AND (delivery.payload_json ->> 'deliveryGeneration')::integer = occurrence.delivery_generation
    AND delivery.payload_json ->> 'channel' = delivery.channel
    AND delivery.payload_json ->> 'externalId' = recipient
    AND occurrence.status IN ('queued', 'sent')
    AND rule.is_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = occurrence.platform_user_id
        AND patient.is_blocked = false
        AND patient.is_archived = false
        AND patient.merged_into_id IS NULL
        AND (patient.reminder_muted_until IS NULL OR patient.reminder_muted_until <= statement_timestamp())
    )
    AND occurrence.done_at IS NULL
    AND occurrence.skipped_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = occurrence.platform_user_id
        AND preference.channel_code = delivery.channel
        AND preference.is_enabled_for_notifications = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topics AS topic
      WHERE topic.user_id = occurrence.platform_user_id
        AND topic.topic_code = resolved_topic_code AND topic.is_enabled = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = occurrence.platform_user_id
        AND preference.topic_code = resolved_topic_code AND preference.channel_code = delivery.channel
        AND preference.is_enabled = false
    )
    AND channel_allowed
    AND expected_fingerprint ~ '^[0-9a-f]{32}$'
    AND current_fingerprint = expected_fingerprint
  THEN RETURN true; END IF;
  RETURN false;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.list_scheduler_reminder_organization_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_materialization_owner'::name, 'app_operational_scheduler'::name, 'service'::app.port_context_class, 'scheduler.reminder-organizations', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.list_scheduler_reminder_organization_ids()'::regprocedure);

  IF EXISTS (
    SELECT 1 FROM public.reminder_rules AS rule
    WHERE rule.is_enabled = true
      AND rule.platform_user_id IS NOT NULL
      AND rule.organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'scheduler reminder work contains rows without organization ownership'
      USING ERRCODE = '23514';
  END IF;
  RETURN QUERY
  SELECT candidate.organization_id
  FROM (
    SELECT rule.organization_id
    FROM public.reminder_rules AS rule
    WHERE rule.is_enabled = true
      AND rule.platform_user_id IS NOT NULL
      AND rule.organization_id IS NOT NULL
    UNION
    SELECT COALESCE(occurrence.organization_id, rule.organization_id)
    FROM public.reminder_occurrence_history AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.integrator_rule_id
    WHERE occurrence.status IN ('planned', 'queued')
      AND COALESCE(occurrence.organization_id, rule.organization_id) IS NOT NULL
  ) AS candidate
  ORDER BY candidate.organization_id;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Rewritten to write patient-facing fact columns directly onto the (already-existing, materialized at
-- rule-commit time) occurrence row instead of two separate tables (integrator.user_reminder_occurrences'
-- status + public.reminder_journal's append-only action rows). Unlike the OLD lazy-insert version, the
-- occurrence row is now guaranteed to already exist by the time a patient can act on it (it is created at
-- materialization, before any delivery attempt) -- so there is nothing left to lazily insert, and this
-- function stops force-setting the shared `status` column: `status` now also drives the live delivery
-- worker's claim/revalidation logic (app.revalidate_patient_reminder_delivery_materialization above), and
-- forcing it to 'sent' from a patient action taken before a real delivery attempt would falsely mark an
-- in-flight or not-yet-attempted delivery as complete. `done_at`/`skipped_at`/`snoozed_at` are additive
-- patient facts that coexist with whatever `status` the delivery pipeline is actually in -- exactly the
-- reading `revalidate_patient_reminder_delivery_materialization` already uses via its own done_at/
-- skipped_at exclusion. `patient_skip_reminder_occurrence` keeps its one exception: it still forces
-- status='skipped' unconditionally, matching its pre-cutover behavior, because that is the one action
-- meant to take the row out of delivery contention (the orphan-expiry sweep and delivery claim both key
-- off `status`, and 'skipped' is a safe, never-falsely-successful terminal state to force into).

CREATE OR REPLACE FUNCTION app.patient_done_reminder_occurrence(p_integrator_occurrence_id text)
 RETURNS TABLE(done_at timestamp with time zone, first_done_for_occurrence boolean, day_done_count integer, day_sent_total integer, day_fully_done boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_occurred_at timestamptz;
  v_existing_done_at timestamptz;
  v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);

  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    v_platform_user_id := v_patient_user_id;
  ELSIF v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;

  SELECT h.done_at, COALESCE(h.sent_at, h.planned_at)
  INTO v_existing_done_at, v_occurred_at
  FROM public.reminder_occurrence_history AS h
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id
    AND h.platform_user_id = v_platform_user_id
    AND h.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  first_done_for_occurrence := v_existing_done_at IS NULL;
  IF first_done_for_occurrence THEN
    done_at := statement_timestamp();
    UPDATE public.reminder_occurrence_history
    SET done_at = done_at,
        occurred_at = COALESCE(occurred_at, v_occurred_at),
        updated_at = statement_timestamp()
    WHERE integrator_occurrence_id = p_integrator_occurrence_id
      AND platform_user_id = v_platform_user_id
      AND organization_id = v_org_id;
  ELSE
    done_at := v_existing_done_at;
  END IF;

  SELECT setting.value_json ->> 'value' INTO v_timezone
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = 'app_display_timezone' AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE h2.status = 'sent')::integer,
    COUNT(*) FILTER (WHERE h2.status = 'sent' AND h2.done_at IS NOT NULL)::integer
  INTO day_sent_total, day_done_count
  FROM public.reminder_occurrence_history AS h2
  WHERE h2.platform_user_id = v_platform_user_id
    AND h2.organization_id = v_org_id
    AND (COALESCE(h2.occurred_at, h2.sent_at, h2.planned_at) AT TIME ZONE v_timezone)::date =
        (v_occurred_at AT TIME ZONE v_timezone)::date;
  day_fully_done := first_done_for_occurrence AND day_sent_total > 0
    AND day_done_count = day_sent_total;
  RETURN NEXT;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.patient_skip_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_reason text)
 RETURNS TABLE(skipped_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_occurred_at timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);

  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    IF p_platform_user_id IS DISTINCT FROM v_patient_user_id THEN RETURN; END IF;
    v_platform_user_id := v_patient_user_id;
  ELSIF p_platform_user_id IS NULL AND v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;

  SELECT COALESCE(h.sent_at, h.planned_at) INTO v_occurred_at
  FROM public.reminder_occurrence_history AS h
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id
    AND h.platform_user_id = v_platform_user_id
    AND h.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.reminder_occurrence_history AS h
  SET skipped_at = COALESCE(h.skipped_at, statement_timestamp()),
      skip_reason = NULL,
      occurred_at = COALESCE(h.occurred_at, v_occurred_at)
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id
    AND h.platform_user_id = v_platform_user_id
    AND h.organization_id = v_org_id
  RETURNING h.skipped_at INTO skipped_at;
  IF skipped_at IS NULL THEN RETURN; END IF;

  UPDATE public.reminder_occurrence_history
  SET status = 'skipped', updated_at = statement_timestamp()
  WHERE integrator_occurrence_id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND organization_id = v_org_id;
  RETURN NEXT;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.patient_snooze_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_minutes integer)
 RETURNS TABLE(snoozed_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_occurred_at timestamptz;
  v_existing_snoozed_until timestamptz;
  v_snoozed_until timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);

  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF p_minutes NOT BETWEEN 1 AND 720 OR v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    IF p_platform_user_id IS DISTINCT FROM v_patient_user_id THEN RETURN; END IF;
    v_platform_user_id := v_patient_user_id;
  ELSIF p_platform_user_id IS NULL AND v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id
          AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;

  SELECT h.snoozed_until, COALESCE(h.sent_at, h.planned_at)
  INTO v_existing_snoozed_until, v_occurred_at
  FROM public.reminder_occurrence_history AS h
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id
    AND h.platform_user_id = v_platform_user_id
    AND h.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_existing_snoozed_until IS NOT NULL THEN
    snoozed_until := v_existing_snoozed_until;
    RETURN NEXT;
    RETURN;
  END IF;

  v_snoozed_until := statement_timestamp() + make_interval(mins => p_minutes);
  UPDATE public.reminder_occurrence_history AS h
  SET snoozed_at = statement_timestamp(),
      snoozed_until = v_snoozed_until,
      occurred_at = COALESCE(h.occurred_at, v_occurred_at)
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id
    AND h.platform_user_id = v_platform_user_id
    AND h.organization_id = v_org_id
    AND h.skipped_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.reminder_occurrence_history
  SET planned_at = v_snoozed_until,
      delivery_generation = delivery_generation + 1,
      status = 'planned', queued_at = NULL, sent_at = NULL, failed_at = NULL,
      delivery_channel = NULL, delivery_job_id = NULL, error_code = NULL,
      updated_at = statement_timestamp()
  WHERE integrator_occurrence_id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND organization_id = v_org_id;
  snoozed_until := v_snoozed_until;
  RETURN NEXT;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- Retired: its only purpose was cross-schema mirroring from integrator.user_reminder_occurrences into
-- public.reminder_occurrence_history. After consolidation there is one physical row, written once by
-- the writer that resolves the fact (outgoingDeliveryWorker.ts / the orphan-expiry sweep) -- no separate
-- projection step, no copy-healing retry queue.

DROP FUNCTION app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- Retired together with public.reminder_journal (dropped below): this root's entire body was an INSERT
-- into that table. `pgReminderJournal.ts`'s `logAction` had zero production callers and is removed
-- together with the retired root instead of preserving a second generic action-write path.

DROP FUNCTION app.record_current_patient_reminder_journal_action(text,text,text,timestamp with time zone,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Destructive step, only reached after the parity gate above passed. Forward-only, no CASCADE: every
-- function that referenced these two tables was already rewritten above to target the consolidated
-- public.reminder_occurrence_history, and reminder_journal's FK to reminder_occurrence_history
-- (reminder_journal_occurrence_id_fkey) drops together with reminder_journal itself.

DROP TABLE integrator.user_reminder_occurrences;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

DROP TABLE public.reminder_journal;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Track D final cutover (#987): the direct-public retry queue was never applied on DEV/TEST before
-- its only surviving copy-healing path was removed. Its unreleased create/alter migrations are
-- squashed out of this candidate; IF EXISTS only cleans up an accidental intermediate object.

DROP TABLE IF EXISTS integrator.direct_public_write_retries;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- A row at `dispatching` has crossed the last durable boundary before the provider call. If the
-- worker dies there, the outcome is ambiguous and stale reclaim must dead-letter it, never send it again.

ALTER TABLE public.outgoing_delivery_queue
  DROP CONSTRAINT outgoing_delivery_queue_status_check,
  ADD CONSTRAINT outgoing_delivery_queue_status_check
    CHECK (status = ANY (ARRAY['pending', 'processing', 'dispatching', 'sent', 'failed_retryable', 'dead']::text[]));
