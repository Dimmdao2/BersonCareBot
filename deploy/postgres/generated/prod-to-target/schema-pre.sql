--
-- PostgreSQL database dump
--

\restrict nWtjyBeP1kaN7rDBMHL6kRFv5HeZBf2ix1LExAsn9NhYTKcFdAMQbKcXvISeUTn

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS app;


--
-- Name: app_control; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS app_control;


--
-- Name: app_ext; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS app_ext;


--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS drizzle;


--
-- Name: integrator; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS integrator;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA app_ext;


--
-- Name: port_context_class; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.port_context_class AS ENUM (
    'pre_session',
    'staff',
    'patient',
    'platform',
    'integrator',
    'tenant_service',
    'service'
);


--
-- Name: port_context_claims; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.port_context_claims AS (
	protocol_version smallint,
	context_class app.port_context_class,
	target_role name,
	purpose text,
	function_identity regprocedure,
	typed_args_hash bytea,
	actor_ref uuid,
	subject_ref uuid,
	organization_id uuid,
	integrator_user_id bigint,
	request_id uuid
);


--
-- Name: port_name; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.port_name AS ENUM (
    'webapp',
    'integrator'
);


--
-- Name: port_typed_arg; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.port_typed_arg AS (
	type_tag text,
	value bytea
);


--
-- Name: accept_org_invite(text, uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.accept_org_invite(p_token_hash text, p_platform_user_id uuid, p_expected_email text) RETURNS TABLE(ok boolean, code text, organization_id uuid, membership_id uuid, platform_user_id uuid, specialist_id uuid, role text)
    LANGUAGE plpgsql SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
DECLARE
  v_invite record;
  v_user record;
  v_expected_email text := lower(btrim(p_expected_email));
  v_display_name text;
  v_specialist_id uuid;
  v_membership_id uuid;
  v_membership_specialist_id uuid;
  v_clinic_team_enabled boolean;
  v_seat_limit integer;
  v_seat_used integer;
  v_invite_organization_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  -- Resolve the organization first, then acquire the same organization-wide lock used by invite
  -- creation. The authoritative row is selected FOR UPDATE only after the advisory lock so create,
  -- resend and accept paths have one lock order and cannot deadlock or oversubscribe each other.
  SELECT i.organization_id
  INTO v_invite_organization_id
  FROM public.organization_member_invites AS i
  WHERE i.token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clinic_invite_seats:' || v_invite_organization_id::text, 0)
  );

  SELECT i.*
  INTO v_invite
  FROM public.organization_member_invites AS i
  WHERE i.token_hash = p_token_hash
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'reused_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.expires_at <= now() THEN
    UPDATE public.organization_member_invites AS i
    SET status = 'expired'
    WHERE i.id = v_invite.id
      AND i.status = 'pending';

    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.invited_email <> v_expected_email THEN
    RETURN QUERY SELECT false, 'email_mismatch'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT u.id, u.display_name, u.email_normalized
  INTO v_user
  FROM public.platform_users AS u
  WHERE u.id = p_platform_user_id
    AND u.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_user.email_normalized IS DISTINCT FROM v_invite.invited_email THEN
    RETURN QUERY SELECT false, 'email_mismatch'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Fail closed and atomic against the CURRENT clinic_team entitlement. An invite issued before a
  -- downgrade/OFF must not activate any clinic-team membership growth, including admin membership.
  SELECT COALESCE(
    (SELECT eo.enabled FROM public.saas_org_entitlement_overrides AS eo
     WHERE eo.organization_id = v_invite.organization_id AND eo.mechanic = 'clinic_team'),
    (SELECT t.included_seats IS NOT NULL
     FROM public.be_organizations AS o
     JOIN public.saas_tariffs AS t ON t.id = o.tariff_id
     WHERE o.id = v_invite.organization_id),
    false
  ) INTO v_clinic_team_enabled;

  IF NOT v_clinic_team_enabled THEN
    RETURN QUERY SELECT false, 'entitlement_disabled'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Numeric seat capacity remains doctor-only. Exclude this invite's own pending reservation: an
  -- acceptance consumes the reservation already held since invite creation, not an additional one.
  IF v_invite.invited_role = 'doctor' THEN
    SELECT COALESCE(
      (SELECT eo.seat_limit_override FROM public.saas_org_entitlement_overrides AS eo
       WHERE eo.organization_id = v_invite.organization_id AND eo.mechanic = 'clinic_team'),
      (SELECT t.included_seats
       FROM public.be_organizations AS o
       JOIN LATERAL app.saas_billing_effective_tariff(o.id, o.tariff_id) AS t ON true
       WHERE o.id = v_invite.organization_id)
    ) + COALESCE((SELECT s.paid_additional_seats FROM public.saas_billing_subscriptions AS s
      WHERE s.organization_id = v_invite.organization_id AND s.source = 'paid_subscription'), 0)
    INTO v_seat_limit;

    SELECT
      (SELECT COUNT(*) FROM public.be_organization_members AS m
       WHERE m.organization_id = v_invite.organization_id AND m.status = 'active' AND m.specialist_id IS NOT NULL)
      +
      (SELECT COUNT(*) FROM public.organization_member_invites AS i
       WHERE i.organization_id = v_invite.organization_id AND i.status = 'pending' AND i.expires_at > now()
         AND i.invited_role = 'doctor' AND i.id <> v_invite.id)
      +
      (SELECT COUNT(*) FROM public.organization_member_invites AS i
       JOIN public.be_organization_members AS m ON m.id = i.accepted_membership_id
       WHERE i.organization_id = v_invite.organization_id AND i.status = 'accepted'
         AND i.invited_role = 'doctor' AND m.status = 'active' AND m.specialist_id IS NULL)
    INTO v_seat_used;

    IF v_seat_limit IS NULL OR v_seat_used >= v_seat_limit THEN
      RETURN QUERY SELECT false, 'seat_limit_reached'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
      RETURN;
    END IF;
  END IF;

  v_display_name := COALESCE(
    NULLIF(btrim(v_user.display_name), ''),
    split_part(v_invite.invited_email, '@', 1),
    v_invite.invited_email
  );

  UPDATE public.platform_users AS u
  SET role = 'doctor',
      email = COALESCE(u.email, v_invite.invited_email),
      email_normalized = COALESCE(u.email_normalized, v_invite.invited_email),
      email_verified_at = COALESCE(u.email_verified_at, now()),
      updated_at = now()
  WHERE u.id = v_user.id;

  -- Create the membership only. A bookable specialist profile is provisioned later from a valid
  -- staff transaction context; this patient/pre-session root has no staff organization authority.
  v_specialist_id := NULL;

  INSERT INTO public.be_organization_members (
    organization_id,
    platform_user_id,
    role,
    specialist_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_invite.organization_id,
    v_user.id,
    v_invite.invited_role,
    v_specialist_id,
    'active',
    now(),
    now()
  )
  ON CONFLICT (organization_id, platform_user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    specialist_id = EXCLUDED.specialist_id,
    status = 'active',
    updated_at = now()
  RETURNING id, specialist_id INTO v_membership_id, v_membership_specialist_id;

  UPDATE public.organization_member_invites AS i
  SET status = 'accepted',
      accepted_by_platform_user_id = v_user.id,
      accepted_membership_id = v_membership_id,
      accepted_at = now()
  WHERE i.id = v_invite.id;

  RETURN QUERY SELECT
    true,
    NULL::text,
    v_invite.organization_id,
    v_membership_id,
    v_user.id,
    v_membership_specialist_id,
    v_invite.invited_role;
END
$$;


--
-- Name: acknowledge_open_outbound_provider_incidents(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.acknowledge_open_outbound_provider_incidents() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  changed_count bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.operator-incidents.acknowledge', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.acknowledge_open_outbound_provider_incidents()'::regprocedure);

  WITH changed AS (
    UPDATE public.operator_incidents AS incident
    SET acknowledged_at = now(),
        alert_claim_phase = NULL,
        alert_claim_token = NULL,
        alert_claimed_at = NULL
    WHERE incident.resolved_at IS NULL
      AND incident.acknowledged_at IS NULL
      AND incident.direction = 'outbound_delivery_provider'
    RETURNING 1
  )
  SELECT count(*) INTO changed_count FROM changed;
  RETURN changed_count;
END
$$;


--
-- Name: advance_appointment_reminder_messenger_ladder(uuid, integer, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.advance_appointment_reminder_messenger_ladder(p_queue_id uuid, p_expected_attempt_count integer, p_error text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  delivery public.outgoing_delivery_queue%ROWTYPE;
  next_index integer;
  next_step jsonb;
  next_channel text;
  next_recipient jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_appointment_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-advance', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)'::regprocedure);

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
$_$;


--
-- Name: append_platform_audit_event(text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.append_platform_audit_event(p_action text, p_details text, p_status text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $_$
DECLARE
  inserted_id uuid;
  details_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.audit-event.append', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.append_platform_audit_event(text,text,text)'::regprocedure);

  details_json := p_details::jsonb;
  IF p_action IS NULL
    OR p_action NOT IN (
      'operator_incidents_acknowledge_all',
      'operator_incidents_resolve_all',
      'health_failure_archive_clear_dead'
    )
    OR p_details IS NULL
    OR pg_catalog.jsonb_typeof(details_json) <> 'object'
    OR pg_catalog.pg_column_size(details_json) > 65536
    OR p_status IS NULL
    OR p_status NOT IN ('ok', 'partial_failure', 'error')
  THEN
    RAISE EXCEPTION 'invalid platform audit event'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, details, status
  ) VALUES (
    NULL, app.current_actor_user_id(), p_action, details_json, p_status
  )
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END
$_$;


--
-- Name: apply_paid_saas_billing_tariff(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_paid_saas_billing_tariff(p_saas_billing_invoice_id uuid, p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_tariff_id uuid;
  v_applied boolean;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_staff'::name]::name[]);

  SELECT invoice.tariff_id INTO v_tariff_id
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.status = 'paid';

  IF v_tariff_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_organizations
  SET tariff_id = v_tariff_id
  WHERE id = p_organization_id;

  v_applied := FOUND;

  UPDATE public.saas_organization_trials
  SET status = 'ended', updated_at = now()
  WHERE organization_id = p_organization_id
    AND status = 'active';

  RETURN v_applied;
END;
$$;


--
-- Name: apply_specialist_task_reminder_success_outcome(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_specialist_task_reminder_success_outcome(p_queue_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  queue_organization_id uuid;
  queue_sent_at timestamptz;
  queue_payload jsonb;
  task_id_text text;
  task_id uuid;
  task_organization_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_specialist_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

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
$_$;


--
-- Name: archive_operator_health_failures(text, integer, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.archive_operator_health_failures(p_probe text, p_limit integer, p_archived_by_user_id uuid) RETURNS TABLE(inserted_count bigint, deleted_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.health-archive.clear', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg]), 'app.archive_operator_health_failures(text,integer,uuid)'::regprocedure);

  IF p_probe IS NULL
    OR p_probe NOT IN (
      'outgoing_delivery',
      'integrator_push_outbox',
      'projection_outbox',
      'outgoing_reminder_dispatch'
    )
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 500
    OR p_archived_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid operator health archive input'
      USING ERRCODE = '23514';
  END IF;

  IF p_probe IN ('outgoing_delivery', 'outgoing_reminder_dispatch') THEN
    RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT
        queue.id,
        queue.organization_id,
        queue.kind,
        queue.channel,
        queue.payload_json,
        queue.last_error,
        queue.created_at,
        audit.organization_id AS broadcast_organization_id,
        audit.actor_id AS broadcast_actor_id,
        audit.message_title AS broadcast_message_title,
        recipient.display_name AS recipient_display_name,
        recipient.first_name AS recipient_first_name,
        recipient.last_name AS recipient_last_name,
        recipient.phone_normalized AS recipient_phone_normalized
      FROM public.outgoing_delivery_queue AS queue
      LEFT JOIN public.broadcast_audit AS audit
        ON queue.kind = 'doctor_broadcast_intent'
       AND (queue.payload_json ->> 'broadcastAuditId')
           ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       AND audit.id = (queue.payload_json ->> 'broadcastAuditId')::uuid
      LEFT JOIN public.platform_users AS recipient
        ON queue.kind = 'doctor_broadcast_intent'
       AND (queue.payload_json ->> 'clientUserId')
           ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       AND recipient.id = (queue.payload_json ->> 'clientUserId')::uuid
      WHERE queue.status = 'dead'
        AND (queue.failure_class IS NULL OR queue.failure_class <> 'recipient_blocked_bot')
        AND CASE
          WHEN p_probe = 'outgoing_reminder_dispatch' THEN queue.kind = 'reminder_dispatch'
          ELSE queue.kind <> 'reminder_dispatch'
        END
      ORDER BY queue.created_at, queue.id
      LIMIT p_limit
      FOR UPDATE OF queue SKIP LOCKED
    ), archived AS (
      INSERT INTO public.operator_health_failure_archive (
        organization_id,
        archived_by_user_id,
        health_probe,
        source_kind,
        source_id,
        severity_at_archive,
        doctor_user_id,
        summary_json,
        raw_error_truncated
      )
      SELECT
        COALESCE(candidate.organization_id, candidate.broadcast_organization_id),
        p_archived_by_user_id,
        p_probe,
        'outgoing_delivery_queue_row',
        candidate.id::text,
        'dead',
        CASE
          WHEN candidate.broadcast_actor_id
               ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          THEN candidate.broadcast_actor_id::uuid
          ELSE NULL
        END,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'reason_code', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'unknown_delivery_error'
            WHEN pg_catalog.upper(candidate.last_error) = 'BAD_PAYLOAD' THEN 'BAD_PAYLOAD'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_BROADCAST_AUDIT_ID%' THEN 'MISSING_BROADCAST_AUDIT_ID'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_INCIDENT_ID%' THEN 'MISSING_INCIDENT_ID'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_REMINDER_FIELDS%' THEN 'MISSING_REMINDER_FIELDS'
            WHEN pg_catalog.upper(candidate.last_error) LIKE 'UNKNOWN_KIND:%' THEN 'UNKNOWN_KIND'
            WHEN candidate.last_error LIKE '%broadcast_delivery_cap_exceeded%' THEN 'broadcast_delivery_cap_exceeded'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT|DEADLINE)' THEN 'timeout'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND|EAI_AGAIN)' THEN 'network'
            ELSE 'unknown_delivery_error'
          END,
          'reason_ru', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'Причина не указана'
            WHEN pg_catalog.upper(candidate.last_error) = 'BAD_PAYLOAD' THEN 'Некорректные данные задачи (payload)'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_BROADCAST_AUDIT_ID%' THEN 'В задаче нет идентификатора журнала рассылки'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_INCIDENT_ID%' THEN 'В задаче операторского алерта нет incident_id'
            WHEN pg_catalog.upper(candidate.last_error) LIKE '%MISSING_REMINDER_FIELDS%' THEN 'Не хватает полей для доставки напоминания'
            WHEN pg_catalog.upper(candidate.last_error) LIKE 'UNKNOWN_KIND:%' THEN 'Неизвестный тип задачи в очереди'
            WHEN candidate.last_error LIKE '%broadcast_delivery_cap_exceeded%' THEN 'Превышен лимит строк доставки на одну рассылку'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT|DEADLINE)' THEN 'Таймаут при обращении к внешнему API'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND|EAI_AGAIN)' THEN 'Сетевая ошибка / недоступен узел'
            ELSE 'Ошибка доставки (см. усечённый текст)'
          END,
          'channel', candidate.channel,
          'queue_kind', candidate.kind,
          'broadcast_audit_id', candidate.payload_json ->> 'broadcastAuditId',
          'client_user_id', candidate.payload_json ->> 'clientUserId',
          'doctor_user_id', candidate.broadcast_actor_id,
          'broadcast_title_short', CASE
            WHEN candidate.broadcast_message_title IS NULL THEN NULL
            WHEN pg_catalog.length(pg_catalog.btrim(candidate.broadcast_message_title)) <= 100
              THEN pg_catalog.btrim(candidate.broadcast_message_title)
            ELSE pg_catalog.left(pg_catalog.btrim(candidate.broadcast_message_title), 100) || '…'
          END,
          'recipient_short_name', CASE
            WHEN pg_catalog.btrim(COALESCE(candidate.recipient_display_name, '')) <> ''
              THEN pg_catalog.left(pg_catalog.btrim(candidate.recipient_display_name), 80)
            WHEN pg_catalog.btrim(pg_catalog.concat_ws(' ', candidate.recipient_first_name, candidate.recipient_last_name)) <> ''
              THEN pg_catalog.left(pg_catalog.btrim(pg_catalog.concat_ws(' ', candidate.recipient_first_name, candidate.recipient_last_name)), 80)
            ELSE NULL
          END,
          'recipient_phone_masked', CASE
            WHEN candidate.recipient_phone_normalized IS NULL THEN NULL
            WHEN pg_catalog.length(candidate.recipient_phone_normalized) <= 4 THEN '***'
            ELSE pg_catalog.left(candidate.recipient_phone_normalized, 2)
              || pg_catalog.repeat('*', GREATEST(pg_catalog.length(candidate.recipient_phone_normalized) - 4, 3))
              || pg_catalog.right(candidate.recipient_phone_normalized, 2)
          END,
          'health_scope', 'platform'
        )),
        pg_catalog.left(candidate.last_error, 512)
      FROM candidates AS candidate
      RETURNING source_id
    ), deleted AS (
      DELETE FROM public.outgoing_delivery_queue AS queue
      USING archived
      WHERE queue.id::text = archived.source_id
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM archived),
      (SELECT count(*) FROM deleted);
    RETURN;
  END IF;

  IF p_probe = 'integrator_push_outbox' THEN
    RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT outbox.id, outbox.kind, outbox.last_error, outbox.created_at
      FROM public.integrator_push_outbox AS outbox
      WHERE outbox.status = 'dead'
      ORDER BY outbox.created_at, outbox.id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    ), archived AS (
      INSERT INTO public.operator_health_failure_archive (
        organization_id, archived_by_user_id, health_probe, source_kind, source_id,
        severity_at_archive, doctor_user_id, summary_json, raw_error_truncated
      )
      SELECT
        NULL, p_archived_by_user_id, p_probe, 'integrator_push_outbox_row', candidate.id::text,
        'dead', NULL,
        pg_catalog.jsonb_build_object(
          'reason_code', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'unknown_delivery_error'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT)' THEN 'timeout'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND)' THEN 'network'
            ELSE 'unknown_delivery_error'
          END,
          'reason_ru', CASE
            WHEN candidate.last_error IS NULL OR pg_catalog.btrim(candidate.last_error) = '' THEN 'Причина не указана'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(TIMEOUT|ETIMEDOUT)' THEN 'Таймаут signed POST в integrator'
            WHEN pg_catalog.upper(candidate.last_error) ~ '(ECONNREFUSED|ENOTFOUND)' THEN 'Сеть: integrator недоступен'
            ELSE 'Сбой синка в integrator (см. усечённый текст)'
          END,
          'queue_kind', candidate.kind
        ),
        pg_catalog.left(candidate.last_error, 512)
      FROM candidates AS candidate
      RETURNING source_id
    ), deleted AS (
      DELETE FROM public.integrator_push_outbox AS outbox
      USING archived
      WHERE outbox.id::text = archived.source_id
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM archived),
      (SELECT count(*) FROM deleted);
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      outbox.id,
      outbox.event_type,
      outbox.idempotency_key,
      outbox.attempts_done,
      outbox.last_error,
      outbox.created_at
    FROM integrator.projection_outbox AS outbox
    WHERE outbox.status = 'dead'
    ORDER BY outbox.created_at, outbox.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), archived AS (
    INSERT INTO public.operator_health_failure_archive (
      organization_id, archived_by_user_id, health_probe, source_kind, source_id,
      severity_at_archive, doctor_user_id, summary_json, raw_error_truncated
    )
    SELECT
      NULL, p_archived_by_user_id, p_probe, 'projection_outbox_row', candidate.id::text,
      'dead', NULL,
      pg_catalog.jsonb_build_object(
        'event_type', candidate.event_type,
        'idempotency_key', candidate.idempotency_key,
        'attempts_done', candidate.attempts_done
      ),
      pg_catalog.left(candidate.last_error, 512)
    FROM candidates AS candidate
    RETURNING source_id
  ), deleted AS (
    DELETE FROM integrator.projection_outbox AS outbox
    USING archived
    WHERE outbox.id::text = archived.source_id
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM archived),
    (SELECT count(*) FROM deleted);
END
$_$;


--
-- Name: assert_organization_slug_alias_complete(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.assert_organization_slug_alias_complete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS current_claim
    INNER JOIN public.organization_slug_rename_events AS rename_event
      ON rename_event.organization_id = current_claim.organization_id
      AND rename_event.previous_slug = NEW.slug
      AND rename_event.next_slug = current_claim.slug
    WHERE current_claim.organization_id = NEW.organization_id
      AND current_claim.kind = 'current'
  ) THEN
    RAISE EXCEPTION 'organization slug alias requires direct current target and audit event';
  END IF;
  RETURN NULL;
END
$$;


--
-- Name: assert_organization_slug_rename_complete(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.assert_organization_slug_rename_complete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_next_slug text;
BEGIN
  IF NEW.kind = 'current' THEN
    v_next_slug := NEW.slug;
  ELSE
    SELECT current_claim.slug
    INTO v_next_slug
    FROM public.organization_slug_claims AS current_claim
    WHERE current_claim.organization_id = OLD.organization_id
      AND current_claim.kind = 'current';
  END IF;

  IF v_next_slug IS NULL
    OR v_next_slug = OLD.slug
    OR NOT EXISTS (
      SELECT 1
      FROM public.organization_slug_claims AS alias_claim
      WHERE alias_claim.slug = OLD.slug
        AND alias_claim.kind = 'alias'
        AND alias_claim.organization_id = OLD.organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.clinic_public_directory_entries AS directory
      WHERE directory.organization_id = OLD.organization_id
        AND directory.slug <> v_next_slug
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.organization_slug_rename_events AS rename_event
      WHERE rename_event.organization_id = OLD.organization_id
        AND rename_event.previous_slug = OLD.slug
        AND rename_event.next_slug = v_next_slug
    )
  THEN
    RAISE EXCEPTION 'organization slug rename requires retained alias, synchronized directory and audit event';
  END IF;
  RETURN NULL;
END
$$;


--
-- Name: auth_channel_binding_session(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_channel_binding_session(p_channel_code text, p_external_id text) RETURNS TABLE(user_id uuid, display_name text, role text, phone_normalized text, channel_code text, external_id text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.channel-binding.session', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.auth_channel_binding_session(text,text)'::regprocedure);

  IF p_channel_code IS NULL OR p_channel_code NOT IN ('telegram', 'max', 'vk')
     OR p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid channel binding required';
  END IF;
  RETURN QUERY
  WITH RECURSIVE identity_chain AS (
    SELECT binding.user_id AS candidate_id, 0 AS depth
      FROM public.user_channel_bindings binding
     WHERE binding.channel_code = p_channel_code
       AND binding.external_id = p_external_id
    UNION ALL
    SELECT candidate.merged_into_id, chain.depth + 1
      FROM identity_chain chain
      JOIN public.platform_users candidate ON candidate.id = chain.candidate_id
     WHERE candidate.merged_into_id IS NOT NULL
       AND chain.depth < 5
  ), canonical AS (
    SELECT chain.candidate_id
      FROM identity_chain chain
      JOIN public.platform_users candidate ON candidate.id = chain.candidate_id
     ORDER BY chain.depth DESC
     LIMIT 1
  )
  SELECT person.id,
         identity.display_name,
         person.role,
         primary_phone.value_normalized,
         binding.channel_code,
         binding.external_id
    FROM canonical
    JOIN public.platform_users person ON person.id = canonical.candidate_id
    LEFT JOIN public.user_identity identity ON identity.platform_user_id = person.id
    LEFT JOIN LATERAL (
      SELECT contact.value_normalized
        FROM public.user_contacts contact
       WHERE contact.platform_user_id = person.id
         AND contact.contact_kind = 'phone'
         AND contact.is_primary = true
       LIMIT 1
    ) primary_phone ON true
    JOIN public.user_channel_bindings binding ON binding.user_id = person.id
   WHERE person.merged_into_id IS NULL
   ORDER BY binding.channel_code, binding.external_id;
END
$_$;


--
-- Name: auth_channel_link_lock_unused_secret(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_channel_link_lock_unused_secret(p_secret_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_worker'::name]::name[]);

  PERFORM 1 FROM public.channel_link_secrets AS secret
   WHERE p_secret_id IS NOT NULL AND secret.id = p_secret_id AND secret.used_at IS NULL FOR UPDATE;
  RETURN FOUND;
END
$$;


--
-- Name: auth_channel_link_mark_secret_used(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_channel_link_mark_secret_used(p_secret_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_worker'::name]::name[]);

  UPDATE public.channel_link_secrets AS secret SET used_at = statement_timestamp()
   WHERE p_secret_id IS NOT NULL AND secret.id = p_secret_id;
  RETURN FOUND;
END
$$;


--
-- Name: auth_channel_link_mark_secret_used_if_unused(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_channel_link_mark_secret_used_if_unused(p_secret_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_worker'::name]::name[]);

  UPDATE public.channel_link_secrets AS secret SET used_at = statement_timestamp()
   WHERE p_secret_id IS NOT NULL AND secret.id = p_secret_id AND secret.used_at IS NULL;
  RETURN FOUND;
END
$$;


--
-- Name: auth_channel_link_read_secret(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_channel_link_read_secret(p_channel_code text, p_token_hash text) RETURNS TABLE(id uuid, user_id uuid, expires_at timestamp with time zone, used_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_worker'::name]::name[]);

  RETURN QUERY SELECT secret.id, secret.user_id, secret.expires_at, secret.used_at
    FROM public.channel_link_secrets AS secret
   WHERE p_channel_code IN ('telegram', 'max') AND p_token_hash ~ '^[0-9a-f]{64}$'
     AND secret.channel_code = p_channel_code AND secret.token_hash = p_token_hash LIMIT 1;
END
$_$;


--
-- Name: auth_channel_link_replace_secret(uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_channel_link_replace_secret(p_user_id uuid, p_channel_code text, p_token_hash text, p_expires_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_worker'::name]::name[]);

  IF p_user_id IS NULL OR p_channel_code NOT IN ('telegram', 'max')
     OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '15 minutes'
  THEN RAISE EXCEPTION 'invalid_channel_link_secret'; END IF;
  DELETE FROM public.channel_link_secrets AS secret
   WHERE secret.user_id = p_user_id AND secret.channel_code = p_channel_code;
  INSERT INTO public.channel_link_secrets (user_id, channel_code, token_hash, expires_at)
  VALUES (p_user_id, p_channel_code, p_token_hash, p_expires_at);
END
$_$;


--
-- Name: auth_login_token_confirm(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_login_token_confirm(p_token_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_login_token_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.login-token.confirm', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.auth_login_token_confirm(text)'::regprocedure);

  UPDATE public.login_tokens token
     SET status = 'confirmed', confirmed_at = statement_timestamp()
   WHERE p_token_hash ~ '^[0-9a-f]{64}$'
     AND token.token_hash = p_token_hash
     AND token.status = 'pending'
     AND token.expires_at >= statement_timestamp();
  RETURN FOUND;
END
$_$;


--
-- Name: auth_login_token_create(text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_login_token_create(p_token_hash text, p_user_id uuid, p_method text, p_expires_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE v_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_login_token_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.login-token.create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg]), 'app.auth_login_token_create(text,uuid,text,timestamp with time zone)'::regprocedure);

  IF p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_user_id IS NULL
     OR p_method NOT IN ('telegram', 'max')
     OR p_expires_at <= statement_timestamp()
     OR p_expires_at > statement_timestamp() + interval '15 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_login_token';
  END IF;
  INSERT INTO public.login_tokens (token_hash, user_id, method, status, expires_at)
  VALUES (p_token_hash, p_user_id, p_method, 'pending', p_expires_at)
  RETURNING login_tokens.id INTO v_id;
  RETURN v_id;
END
$_$;


--
-- Name: auth_login_token_expire_past(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_login_token_expire_past() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.require_accepted_context('app_seam_login_token_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.login-token.expire', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.auth_login_token_expire_past()'::regprocedure);

  UPDATE public.login_tokens token
     SET status = 'expired'
   WHERE token.status = 'pending'
     AND token.expires_at < statement_timestamp();
END
$$;


--
-- Name: auth_login_token_mark_session_issued(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_login_token_mark_session_issued(p_token_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_login_token_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.login-token.session-issued', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.auth_login_token_mark_session_issued(text)'::regprocedure);

  UPDATE public.login_tokens token
     SET session_issued_at = statement_timestamp()
   WHERE p_token_hash ~ '^[0-9a-f]{64}$'
     AND token.token_hash = p_token_hash
     AND token.status = 'confirmed'
     AND token.session_issued_at IS NULL;
  RETURN FOUND;
END
$_$;


--
-- Name: auth_login_token_read(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_login_token_read(p_token_hash text) RETURNS TABLE(id uuid, user_id uuid, method text, status text, expires_at timestamp with time zone, confirmed_at timestamp with time zone, session_issued_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_login_token_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.login-token.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.auth_login_token_read(text)'::regprocedure);

  RETURN QUERY
  SELECT token.id, token.user_id, token.method, token.status, token.expires_at,
         token.confirmed_at, token.session_issued_at
    FROM public.login_tokens token
   WHERE p_token_hash ~ '^[0-9a-f]{64}$'
     AND token.token_hash = p_token_hash
   LIMIT 1;
END
$_$;


--
-- Name: auth_oauth_find_user(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_oauth_find_user(p_provider text, p_provider_user_id text) RETURNS TABLE(user_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_oauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.oauth.callback.find-binding', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.auth_oauth_find_user(text,text)'::regprocedure);

  RETURN QUERY
  SELECT binding.user_id
    FROM public.user_oauth_bindings binding
   WHERE p_provider IN ('google', 'apple', 'yandex')
     AND p_provider_user_id IS NOT NULL
     AND btrim(p_provider_user_id) <> ''
     AND binding.provider = p_provider
     AND binding.provider_user_id = p_provider_user_id
   LIMIT 1;
END
$_$;


--
-- Name: auth_oauth_list_user_providers(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_oauth_list_user_providers(p_user_id uuid) RETURNS TABLE(provider text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_oauth_owner'::name, ARRAY['app_worker'::name]::name[]);

  RETURN QUERY SELECT DISTINCT b.provider FROM public.user_oauth_bindings b
   WHERE p_user_id IS NOT NULL AND b.user_id = p_user_id
     AND b.provider IN ('google', 'apple', 'yandex', 'vk');
END
$$;


--
-- Name: auth_oauth_upsert_binding(uuid, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_oauth_upsert_binding(p_user_id uuid, p_provider text, p_provider_user_id text, p_email text) RETURNS TABLE(inserted boolean, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_oauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.oauth.callback.upsert-binding', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.auth_oauth_upsert_binding(uuid,text,text,text)'::regprocedure);

  IF p_user_id IS NULL
     OR p_provider NOT IN ('google', 'apple', 'yandex')
     OR p_provider_user_id IS NULL
     OR btrim(p_provider_user_id) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.user_oauth_bindings (user_id, provider, provider_user_id, email)
  VALUES (p_user_id, p_provider, p_provider_user_id, p_email)
  ON CONFLICT (provider, provider_user_id) DO NOTHING
  RETURNING user_oauth_bindings.user_id INTO v_user_id;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_user_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT false, binding.user_id
    FROM public.user_oauth_bindings binding
   WHERE binding.provider = p_provider
     AND binding.provider_user_id = p_provider_user_id
   LIMIT 1;
END
$_$;


--
-- Name: auth_phone_bind_lock_channel_binding(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_phone_bind_lock_channel_binding(p_channel_code text, p_external_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  IF p_channel_code IS NULL
     OR btrim(p_channel_code) = ''
     OR p_external_id IS NULL
     OR btrim(p_external_id) = ''
     OR p_channel_code NOT IN ('telegram', 'max', 'vk')
  THEN
    RETURN NULL;
  END IF;

  SELECT binding.user_id
  INTO v_user_id
  FROM public.user_channel_bindings AS binding
  WHERE binding.channel_code = p_channel_code
    AND binding.external_id = p_external_id
  FOR UPDATE;

  RETURN v_user_id;
END
$$;


--
-- Name: auth_phone_bind_upsert_channel_binding(uuid, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_phone_bind_upsert_channel_binding(p_user_id uuid, p_channel_code text, p_external_id text) RETURNS TABLE(inserted boolean, owner_user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  IF p_user_id IS NULL
     OR p_channel_code IS NULL
     OR btrim(p_channel_code) = ''
     OR p_external_id IS NULL
     OR btrim(p_external_id) = ''
     OR p_channel_code NOT IN ('telegram', 'max', 'vk')
  THEN
    RETURN;
  END IF;

  INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
  VALUES (p_user_id, p_channel_code, p_external_id)
  ON CONFLICT (channel_code, external_id) DO NOTHING
  RETURNING user_channel_bindings.user_id INTO v_user_id;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_user_id;
    RETURN;
  END IF;

  SELECT binding.user_id
  INTO v_user_id
  FROM public.user_channel_bindings AS binding
  WHERE binding.channel_code = p_channel_code
    AND binding.external_id = p_external_id
  FOR UPDATE;

  RETURN QUERY SELECT false, v_user_id;
END
$$;


--
-- Name: auth_rate_limit_check_and_record(text, text, integer, integer, text, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auth_rate_limit_check_and_record(p_scope text, p_key text, p_window_ms integer, p_limit integer, p_action text, p_scope_retention_ms integer, p_scope_prune_batch integer) RETURNS TABLE(limited boolean, attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_now timestamptz;
  v_attempts integer;
  v_batch integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.rate-limit.check-record', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($6))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($7))::app.port_typed_arg]), 'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)'::regprocedure);

  v_now := statement_timestamp();

  IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 128
     OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 1024
     OR p_window_ms IS NULL OR p_window_ms < 1
     OR p_limit IS NULL OR p_limit < 0
     OR p_action IS DISTINCT FROM 'check_and_record'
     OR ((p_scope_retention_ms IS NULL) <> (p_scope_prune_batch IS NULL))
     OR (p_scope_retention_ms IS NOT NULL AND p_scope_retention_ms < p_window_ms)
     OR (p_scope_prune_batch IS NOT NULL AND p_scope_prune_batch < 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid auth rate-limit request';
  END IF;

  IF p_scope_retention_ms IS NOT NULL
     AND pg_try_advisory_xact_lock(hashtext('auth-rate-limit-scope-prune:' || p_scope)) THEN
    v_batch := LEAST(1000, p_scope_prune_batch);
    WITH stale AS (
      SELECT event.ctid
        FROM public.auth_rate_limit_events event
       WHERE event.scope = p_scope
         AND event.occurred_at <= v_now - p_scope_retention_ms * interval '1 millisecond'
       ORDER BY event.occurred_at
       LIMIT v_batch
       FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.auth_rate_limit_events event
    USING stale
    WHERE event.ctid = stale.ctid;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_scope || ':' || p_key));
  DELETE FROM public.auth_rate_limit_events event
   WHERE event.scope = p_scope
     AND event.key = p_key
     AND event.occurred_at <= v_now - p_window_ms * interval '1 millisecond';

  SELECT LEAST(count(*), 2147483647)::integer
    INTO v_attempts
    FROM public.auth_rate_limit_events event
   WHERE event.scope = p_scope
     AND event.key = p_key;

  IF v_attempts >= p_limit THEN
    RETURN QUERY SELECT true, v_attempts;
    RETURN;
  END IF;

  INSERT INTO public.auth_rate_limit_events (scope, key, occurred_at)
  VALUES (p_scope, p_key, v_now);
  RETURN QUERY SELECT false, v_attempts + 1;
END
$_$;


--
-- Name: begin_staff_login_challenge(text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.begin_staff_login_challenge(p_challenge_hash text, p_expires_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  UPDATE public.staff_security_profiles p
	SET login_challenge_hash = p_challenge_hash,
	    login_challenge_expires_at = p_expires_at,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id() AND p.factor_verified_at IS NOT NULL;
	RETURN FOUND;
END
$$;


--
-- Name: bump_platform_user_session_epoch_self(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.bump_platform_user_session_epoch_self() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_session_epoch integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_self_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  UPDATE public.platform_users
	SET session_epoch = session_epoch + 1, updated_at = now()
	WHERE id = app.require_staff_security_self_user_id()
	RETURNING session_epoch INTO v_session_epoch;
	IF v_session_epoch IS NULL THEN
		RAISE EXCEPTION 'platform_user_missing';
	END IF;
	RETURN v_session_epoch;
END
$$;


--
-- Name: cancel_patient_invite_email_proof(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cancel_patient_invite_email_proof(p_continuation_hash text, p_code_hash text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);
UPDATE public.patient_invites AS invite
  SET proof_email_normalized = NULL,
      proof_code_hash = NULL,
      proof_started_at = NULL,
      proof_expires_at = NULL,
      proof_attempts = 0,
      proof_verified_at = NULL,
      updated_at = now()
  WHERE invite.continuation_hash = p_continuation_hash
    AND invite.status = 'pending'
    AND invite.proof_code_hash = p_code_hash
    AND invite.proof_verified_at IS NULL
  RETURNING true
$$;


--
-- Name: choose_organization_first_tariff(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.choose_organization_first_tariff(p_tariff_id uuid, p_actor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_policy record;
  v_started_at timestamptz;
  v_trial_id uuid;
  v_has_prior_trial boolean;
  v_account_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_clinic_billing'::name, 'app_staff'::name]::name[]);

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_context_required';
  END IF;

  PERFORM 1
  FROM public.be_organizations AS org
  WHERE org.id = v_organization_id
    AND org.tariff_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_tariff_already_assigned';
  END IF;

  PERFORM 1
  FROM public.saas_tariffs AS tariff
  WHERE tariff.id = p_tariff_id
    AND tariff.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tariff_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = v_organization_id
  )
  INTO v_has_prior_trial;

  UPDATE public.be_organizations
  SET tariff_id = p_tariff_id,
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.saas_billing_accounts AS account (organization_id)
  VALUES (v_organization_id)
  ON CONFLICT (organization_id) DO UPDATE
  SET updated_at = now()
  RETURNING account.id INTO v_account_id;

  INSERT INTO public.saas_billing_subscriptions AS subscription (
    organization_id,
    saas_billing_account_id,
    tariff_id,
    source,
    status,
    lifecycle_state
  )
  VALUES (
    v_organization_id,
    v_account_id,
    p_tariff_id,
    'paid_subscription',
    'pending_payment',
    'active'
  )
  ON CONFLICT (organization_id, source) DO UPDATE
  SET tariff_id = EXCLUDED.tariff_id,
      status = 'pending_payment',
      lifecycle_state = 'active',
      updated_at = now(),
      current_period_starts_at = NULL,
      current_period_ends_at = NULL,
      pending_tariff_id = NULL,
      tariff_snapshot = NULL;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_registration_tariff_assign',
    p_tariff_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice',
      'before', NULL,
      'after', jsonb_build_object('tariffId', p_tariff_id)
    ),
    'ok'
  );

  IF v_has_prior_trial THEN
    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

  SELECT
    policy.duration_days,
    policy.discount_window_days,
    policy.post_trial_behavior,
    policy.post_trial_tariff_id,
    policy.start_event
  INTO v_policy
  FROM public.saas_trial_policy AS policy
  WHERE policy.key = 'global'
    AND policy.is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

  v_started_at := clock_timestamp();

  INSERT INTO public.saas_organization_trials (
    organization_id, tariff_id, started_at, ends_at, discount_ends_at,
    post_trial_behavior, post_trial_tariff_id, status, created_by
  ) VALUES (
    v_organization_id,
    p_tariff_id,
    v_started_at,
    v_started_at + make_interval(days => v_policy.duration_days),
    v_started_at + make_interval(days => v_policy.duration_days + v_policy.discount_window_days),
    v_policy.post_trial_behavior,
    v_policy.post_trial_tariff_id,
    'active',
    p_actor_id
  )
  ON CONFLICT (organization_id) DO NOTHING
  RETURNING id INTO v_trial_id;

  IF v_trial_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_trial_start',
    v_trial_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', p_tariff_id,
        'durationDays', v_policy.duration_days,
        'discountWindowDays', v_policy.discount_window_days,
        'startEvent', v_policy.start_event,
        'postTrialBehavior', v_policy.post_trial_behavior,
        'postTrialTariffId', v_policy.post_trial_tariff_id
      )
    ),
    'ok'
  );

  RETURN jsonb_build_object(
    'outcome', 'trial_started',
    'endsAt', (v_started_at + make_interval(days => v_policy.duration_days))::text,
    'trialId', v_trial_id::text
  );
END
$$;


--
-- Name: claim_unbound_patient_invite_email(text, text, text, bigint, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.claim_unbound_patient_invite_email(p_continuation_hash text, p_email_normalized text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text) RETURNS TABLE(ok boolean, code text, organization_id uuid, patient_user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_email_owner_id uuid;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
  v_portal_activated_via text;
  v_reopen boolean := false;
  v_email text := lower(btrim(p_email_normalized));
  v_secret text;
  v_expected text;
  v_now_epoch bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_email = '' OR position('@' IN v_email) <= 1
     OR p_authorization_nonce IS NULL OR p_authorization_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     OR p_authorization_expires_epoch <= v_now_epoch
     OR p_authorization_expires_epoch > v_now_epoch + 60
     OR p_authorization_signature IS NULL OR p_authorization_signature !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  SELECT secret INTO v_secret FROM app.context_signing_secrets WHERE id = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  v_expected := encode(app_ext.hmac(concat_ws(
    '|', 'patient-invite-proof', 'v1', 'claim', p_authorization_nonce,
    p_authorization_expires_epoch::text, p_continuation_hash, v_email, '', ''
  ), v_secret, 'sha256'), 'hex');
  IF lower(p_authorization_signature) IS DISTINCT FROM v_expected THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.recipient_binding <> 'unbound_email_claim'
     OR v_invite.invited_email_normalized IS NOT NULL THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    IF v_invite.accepted_by_platform_user_id IS DISTINCT FROM v_invite.patient_user_id
       OR v_invite.accepted_via IS DISTINCT FROM 'email_otp' THEN
      RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
    v_reopen := true;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    UPDATE public.patient_invites SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id AND expires_at <= now();
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.proof_verified_at IS NULL
     OR v_invite.proof_email_normalized IS DISTINCT FROM v_email
     OR v_invite.proof_code_hash IS NULL
     OR v_invite.proof_expires_at IS NULL
     OR v_invite.proof_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  SELECT patient.* INTO v_patient
  FROM public.platform_users AS patient
  WHERE patient.id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_patient.role <> 'client' OR v_patient.merged_into_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_patient.email_normalized IS NOT NULL AND v_patient.email_normalized <> v_email THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_patient.email IS NOT NULL AND lower(btrim(v_patient.email)) <> v_email THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT patient.id INTO v_email_owner_id
  FROM public.platform_users AS patient
  WHERE patient.email_normalized = v_email AND patient.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE;
  IF FOUND AND v_email_owner_id <> v_invite.patient_user_id THEN
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      v_invite.organization_id, v_invite.patient_user_id, v_email_owner_id,
      'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
    ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
      WHERE status = 'pending' DO NOTHING;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at, enrollment.portal_activated_via
  INTO v_enrollment_status, v_portal_activated_at, v_portal_activated_via
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF v_reopen THEN
    IF v_enrollment_status = 'active'
       AND v_portal_activated_at IS NOT NULL
       AND v_portal_activated_via = 'patient_invite_email_otp' THEN
      RETURN QUERY SELECT true, NULL::text, v_invite.organization_id, v_invite.patient_user_id;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.platform_users AS patient
    SET email = v_email,
        email_normalized = v_email,
        email_verified_at = COALESCE(patient.email_verified_at, now()),
        updated_at = now()
    WHERE patient.id = v_invite.patient_user_id
      AND (patient.email_normalized IS NULL OR patient.email_normalized = v_email);
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT patient.id INTO v_email_owner_id
    FROM public.platform_users AS patient
    WHERE patient.email_normalized = v_email AND patient.merged_into_id IS NULL
    LIMIT 1
    FOR UPDATE;
    IF FOUND AND v_email_owner_id <> v_invite.patient_user_id THEN
      INSERT INTO public.patient_merge_candidates (
        organization_id, anchor_user_id, candidate_user_id, reason, status, payload
      ) VALUES (
        v_invite.organization_id, v_invite.patient_user_id, v_email_owner_id,
        'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
      ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
        WHERE status = 'pending' DO NOTHING;
    END IF;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END;

  UPDATE public.org_enrollments AS enrollment
  SET status = 'active', portal_activated_at = now(),
      portal_activated_via = 'patient_invite_email_otp'
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
    AND enrollment.portal_activated_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_portal_activation_failed';
  END IF;
  UPDATE public.patient_invites AS invite
  SET status = 'accepted', accepted_by_platform_user_id = v_invite.patient_user_id,
      accepted_via = 'email_otp', accepted_at = now(), updated_at = now()
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id, v_invite.patient_user_id;
END
$_$;


--
-- Name: clear_port_context(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.clear_port_context() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE database_id oid;
BEGIN
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  UPDATE app_ext.accepted_port_contexts SET cleared_at = clock_timestamp()
    WHERE database_oid = database_id AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id() AND cleared_at IS NULL;
  DELETE FROM app_ext.accepted_port_contexts WHERE cleared_at < clock_timestamp() - interval '24 hours';
END $$;


--
-- Name: close_active_user_phone_history(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.close_active_user_phone_history(p_user uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'app', 'public', 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_phone_binding_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
UPDATE public.user_phone_history SET valid_to = now()
  WHERE platform_user_id = p_user AND valid_to IS NULL
    AND (app.current_patient_user_id() IS NULL OR platform_user_id = app.current_patient_user_id())
$$;


--
-- Name: complete_staff_totp_enrollment(text, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.complete_staff_totp_enrollment(p_secret_ciphertext text, p_recovery_code_hashes jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_session_version integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF jsonb_typeof(p_recovery_code_hashes) <> 'array'
	   OR jsonb_array_length(p_recovery_code_hashes) = 0 THEN
		RAISE EXCEPTION 'invalid recovery code hashes';
	END IF;

	UPDATE public.staff_security_profiles p
	SET factor_type = 'totp',
	    totp_secret_ciphertext = p_secret_ciphertext,
	    pending_totp_secret_ciphertext = NULL,
	    factor_verified_at = now(),
	    recovery_code_hashes = p_recovery_code_hashes,
	    recovery_codes_confirmed_at = NULL,
	    replacement_required = false,
	    failed_attempts = 0,
	    locked_until = NULL,
	    session_version = p.session_version + 1,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	  AND p.pending_totp_secret_ciphertext = p_secret_ciphertext
	RETURNING p.session_version INTO v_session_version;

	IF v_session_version IS NULL THEN
		RAISE EXCEPTION 'staff_security_enrollment_conflict';
	END IF;
	RETURN v_session_version;
END
$$;


--
-- Name: confirm_staff_recovery_codes(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.confirm_staff_recovery_codes() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  UPDATE public.staff_security_profiles p
	SET recovery_codes_confirmed_at = now(), updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	  AND p.factor_verified_at IS NOT NULL
	  AND jsonb_array_length(p.recovery_code_hashes) > 0;
	RETURN FOUND;
END
$$;


--
-- Name: consume_staff_recovery_login(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.consume_staff_recovery_login(p_challenge_hash text, p_recovery_code_hash text) RETURNS TABLE(ok boolean, session_version integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_profile public.staff_security_profiles%ROWTYPE;
	v_next_hashes jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT p.* INTO v_profile
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
	FOR UPDATE;

	IF NOT FOUND
	   OR v_profile.login_challenge_hash IS DISTINCT FROM p_challenge_hash
	   OR v_profile.login_challenge_expires_at IS NULL
	   OR v_profile.login_challenge_expires_at <= now()
	   OR (v_profile.locked_until IS NOT NULL AND v_profile.locked_until > now())
	   OR NOT (v_profile.recovery_code_hashes ? p_recovery_code_hash) THEN
		RETURN QUERY SELECT false, COALESCE(v_profile.session_version, 0);
		RETURN;
	END IF;

	SELECT COALESCE(jsonb_agg(item.value), '[]'::jsonb) INTO v_next_hashes
	FROM jsonb_array_elements(v_profile.recovery_code_hashes) AS item(value)
	WHERE item.value <> to_jsonb(p_recovery_code_hash);

	UPDATE public.staff_security_profiles p
	SET recovery_code_hashes = v_next_hashes,
	    replacement_required = true,
	    login_challenge_hash = NULL,
	    login_challenge_expires_at = NULL,
	    failed_attempts = 0,
	    locked_until = NULL,
	    session_version = p.session_version + 1,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	RETURNING p.session_version INTO v_profile.session_version;

	RETURN QUERY SELECT true, v_profile.session_version;
END
$$;


--
-- Name: consume_staff_totp_login(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.consume_staff_totp_login(p_challenge_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  UPDATE public.staff_security_profiles p
	SET login_challenge_hash = NULL,
	    login_challenge_expires_at = NULL,
	    failed_attempts = 0,
	    locked_until = NULL,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	  AND p.login_challenge_hash = p_challenge_hash
	  AND p.login_challenge_expires_at > now()
	  AND (p.locked_until IS NULL OR p.locked_until <= now());
	RETURN FOUND;
END
$$;


--
-- Name: count_active_canonical_appointments(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.count_active_canonical_appointments() RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE v_count bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'booking.admin-active.count', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.count_active_canonical_appointments()'::regprocedure);

  SELECT count(*) INTO v_count
    FROM public.be_appointments appointment
   WHERE appointment.status IN (
     'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
     'visit_confirmed', 'charged_to_package', 'manual_review_required'
   )
     AND appointment.deleted_at IS NULL
     AND appointment.start_at >= now();
  RETURN v_count;
END
$$;


--
-- Name: create_specialist_signup_intent(uuid, text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.create_specialist_signup_intent(p_challenge_id uuid, p_email_normalized text, p_organization_title text, p_specialist_full_name text, p_organization_slug text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_intent_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);

  INSERT INTO public.specialist_signup_intents (
    user_id,
    challenge_id,
    email_normalized,
    organization_title,
    organization_slug,
    specialist_full_name
  )
  VALUES (
    app.require_staff_security_self_user_id(),
    p_challenge_id,
    lower(btrim(p_email_normalized)),
    btrim(p_organization_title),
    lower(p_organization_slug),
    btrim(p_specialist_full_name)
  )
  RETURNING id INTO v_intent_id;

  RETURN v_intent_id;
END
$$;


--
-- Name: current_actor_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_actor_user_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE opaque_ref uuid; physical_id uuid;
BEGIN
  SELECT actor_ref INTO opaque_ref FROM app_ext.accepted_port_contexts
   WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL AND target_role IN ('app_staff','app_clinic_billing','app_patient','app_platform_settings','app_platform_admin');
  IF opaque_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted actor context required'; END IF;
  SELECT app_ext.resolve_variant_a_physical(opaque_ref) INTO physical_id;
  RETURN physical_id;
END $$;


--
-- Name: current_integrator_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_integrator_user_id() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE value bigint;
BEGIN SELECT integrator_user_id INTO value FROM app_ext.accepted_port_contexts WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL AND target_role='app_integrator_request'; IF value IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted integrator context required'; END IF; RETURN value; END $$;


--
-- Name: current_org_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_org_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE value uuid;
BEGIN
  SELECT organization_id INTO value FROM app_ext.accepted_port_contexts
   WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL
     AND target_role IN ('app_staff','app_clinic_billing','app_patient','app_integrator_request','app_tenant_service','app_worker');
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted organization context required'; END IF;
  RETURN value;
END $$;


--
-- Name: current_patient_has_active_org_enrollment(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_patient_has_active_org_enrollment(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_org_projection_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
SELECT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    INNER JOIN public.be_organizations AS organization
      ON organization.id = enrollment.organization_id
     AND organization.is_active = true
    WHERE p_organization_id IS NOT NULL
      AND app.current_patient_user_id() IS NOT NULL
      AND enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
$$;


--
-- Name: current_patient_has_password_credentials(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_patient_has_password_credentials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  IF pg_catalog.to_regprocedure('app.current_patient_user_id()') IS NOT NULL THEN
    EXECUTE 'SELECT app.current_patient_user_id()' INTO v_patient_user_id;
  ELSE
    v_patient_user_id := NULLIF(pg_catalog.current_setting('app.patient_user_id', true), '')::uuid;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_password_credentials AS c
    WHERE c.user_id = v_patient_user_id
  );
END;
$$;


--
-- Name: current_patient_has_web_oauth_binding(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_patient_has_web_oauth_binding() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_oauth_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  IF pg_catalog.to_regprocedure('app.current_patient_user_id()') IS NOT NULL THEN
    EXECUTE 'SELECT app.current_patient_user_id()' INTO v_patient_user_id;
  ELSE
    v_patient_user_id := NULLIF(pg_catalog.current_setting('app.patient_user_id', true), '')::uuid;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_oauth_bindings AS b
    WHERE b.user_id = v_patient_user_id
      AND b.provider IN ('google', 'yandex', 'apple')
  );
END;
$$;


--
-- Name: current_patient_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_patient_user_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE opaque_ref uuid; physical_id uuid;
BEGIN
  SELECT subject_ref INTO opaque_ref FROM app_ext.accepted_port_contexts
   WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL AND target_role='app_patient';
  IF opaque_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted patient context required'; END IF;
  SELECT app_ext.resolve_variant_a_physical(opaque_ref) INTO physical_id;
  RETURN physical_id;
END $$;


--
-- Name: current_provisioned_owner_organization(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_provisioned_owner_organization() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_platform_settings'::name]::name[]);
SELECT member.organization_id
  FROM public.be_organization_members AS member
  INNER JOIN public.be_organizations AS organization
    ON organization.id = member.organization_id
   AND organization.is_active
  WHERE member.platform_user_id = app.current_patient_user_id()
    AND member.role = 'owner'
    AND member.status = 'active'
  ORDER BY member.created_at DESC
  LIMIT 1
$$;


--
-- Name: delete_google_calendar_event_id(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.delete_google_calendar_event_id(p_appointment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.delete', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.delete_google_calendar_event_id(uuid)'::regprocedure);

  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  DELETE FROM public.booking_calendar_map WHERE appointment_key = 'be:' || p_appointment_id::text;
  UPDATE public.patient_bookings SET gcal_event_id = NULL, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$_$;


--
-- Name: email_auth_delete_email_challenge_by_id(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_delete_email_challenge_by_id(p_challenge_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
DELETE FROM public.email_challenges WHERE id = p_challenge_id
$$;


--
-- Name: email_auth_delete_email_challenges_for_user(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_delete_email_challenges_for_user(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
DELETE FROM public.email_challenges WHERE user_id = p_user_id
$$;


--
-- Name: email_auth_enqueue_otp_delivery(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_enqueue_otp_delivery(p_challenge_id uuid, p_delivery_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_code text;
  v_expires_at bigint;
  v_event_id text;
  v_last_sent_at timestamptz;
  v_row_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);

  -- FOR UPDATE: this and the pending_delivery_code/delivery_token = NULL write below run in the same
  -- statement's transaction, so two concurrent calls against the SAME challenge can't both read a
  -- non-null code. The delivery_token equality check is the ownership gate D27-C fix round 3 adds --
  -- a caller that does not already hold the token minted by set_email_challenge_delivery_code simply
  -- finds no row here, same as an unknown challenge_id.
  SELECT user_id, email, pending_delivery_code, expires_at
  INTO v_user_id, v_email, v_code, v_expires_at
  FROM public.email_challenges
  WHERE id = p_challenge_id
    AND delivery_token IS NOT NULL
    AND delivery_token = p_delivery_token
  FOR UPDATE;

  -- No such challenge, wrong/absent token, or already queued once (both columns nulled below on
  -- success): refuse silently, same as "not found".
  IF NOT FOUND OR v_code IS NULL THEN
    RETURN false;
  END IF;

  IF v_expires_at <= extract(epoch FROM now())::bigint THEN
    RETURN false;
  END IF;

  -- Function-level throttle (audit FAIL #3, round 2): reuse the SAME cooldown ledger the public route
  -- itself writes to (email_send_cooldowns) as an in-DB backstop for a caller that reaches this
  -- SECURITY DEFINER function directly.
  SELECT last_sent_at INTO v_last_sent_at
  FROM public.email_send_cooldowns
  WHERE user_id = v_user_id AND email_normalized = v_email;

  IF v_last_sent_at IS NOT NULL AND v_last_sent_at > now() - interval '60 seconds' THEN
    RETURN false;
  END IF;

  v_event_id := 'auth-otp:email:' || p_challenge_id::text;

  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    NULL, v_event_id, 'auth_email_otp', 'email',
    jsonb_build_object(
      'intent', jsonb_build_object(
        'type', 'message.send',
        'meta', jsonb_build_object(
          'eventId', 'otp:email:' || gen_random_uuid()::text,
          'occurredAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z',
          'source', 'email',
          'outboundMessageClass', 'auth_code',
          'outboundCapability', 'auth_code'
        ),
        'payload', jsonb_build_object(
          'recipient', jsonb_build_object('email', v_email),
          'message', jsonb_build_object('text', 'Ваш код BersonCare: ' || v_code),
          'delivery', jsonb_build_object('channels', jsonb_build_array('email')),
          'subject', 'Код подтверждения BersonCare'
        )
      )
    ),
    'pending', 0, 4, now(), 100
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count > 0 THEN
    -- One-shot: clear the plaintext AND the ownership token the moment it's queued. Neither
    -- verification nor any other accessor reads them past this point.
    UPDATE public.email_challenges
    SET pending_delivery_code = NULL, delivery_token = NULL
    WHERE id = p_challenge_id;
    INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
    VALUES (v_user_id, v_email, now())
    ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now();
  END IF;

  RETURN v_row_count > 0;
END
$$;


--
-- Name: email_auth_find_email_challenge_for_confirm(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_challenge_for_confirm(p_challenge_id uuid, p_user_id uuid) RETURNS TABLE(id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;


--
-- Name: email_auth_find_email_challenge_for_consume(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_challenge_for_consume(p_challenge_id uuid, p_user_id uuid) RETURNS TABLE(id uuid, code_hash text, expires_at bigint, attempts integer, purpose text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;


--
-- Name: email_auth_find_email_otp_lock(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_otp_lock(p_user_id uuid) RETURNS TABLE(locked_until bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.lock.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_auth_find_email_otp_lock(uuid)'::regprocedure);

  RETURN QUERY SELECT l.locked_until FROM public.email_otp_locks l WHERE l.user_id = p_user_id;
END
$_$;


--
-- Name: email_auth_find_email_owner_conflict(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT EXISTS (
    SELECT 1
    FROM app.find_platform_user_ids_by_any_confirmed_email(p_email) AS fpu
    WHERE fpu.user_id <> p_user_id
  )
$$;


--
-- Name: email_auth_find_email_send_cooldown(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_send_cooldown(p_user_id uuid, p_email_norm text) RETURNS TABLE(last_sent_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.last_sent_at
  FROM public.email_send_cooldowns AS c
  WHERE c.user_id = p_user_id
    AND c.email_normalized = p_email_norm
  LIMIT 1
$$;


--
-- Name: email_auth_find_latest_email_challenge_for_user(uuid, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_latest_email_challenge_for_user(p_user_id uuid, p_now_sec bigint) RETURNS TABLE(id uuid, code_hash text, expires_at bigint, attempts integer, purpose text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;


--
-- Name: email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(p_user_id uuid, p_now_sec bigint) RETURNS TABLE(id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;


--
-- Name: email_auth_increment_email_challenge_attempts(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_increment_email_challenge_attempts(p_challenge_id uuid) RETURNS TABLE(attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);

  PERFORM 1 FROM public.email_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.email_challenges
  SET attempts = attempts + 1
  WHERE id = p_challenge_id
  RETURNING public.email_challenges.attempts::integer;
END
$$;


--
-- Name: email_auth_insert_email_challenge(uuid, text, text, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_insert_email_challenge(p_user_id uuid, p_email text, p_code_hash text, p_expires_at bigint) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
INSERT INTO public.email_challenges (user_id, email, code_hash, expires_at, attempts)
  VALUES (p_user_id, p_email, p_code_hash, p_expires_at, 0)
  RETURNING id
$$;


--
-- Name: email_auth_register_email_otp_lockout(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_register_email_otp_lockout(p_user_id uuid) RETURNS TABLE(locked_until bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.lock.register', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_auth_register_email_otp_lockout(uuid)'::regprocedure);

  RETURN QUERY
  INSERT INTO public.email_otp_locks (user_id, lockout_cycle, locked_until)
  VALUES (p_user_id, 1, extract(epoch FROM clock_timestamp())::bigint + 120)
  ON CONFLICT (user_id) DO UPDATE SET
    lockout_cycle = email_otp_locks.lockout_cycle + 1,
    locked_until = extract(epoch FROM clock_timestamp())::bigint
      + LEAST(1800, (120 * power(2, LEAST(email_otp_locks.lockout_cycle, 10)))::bigint)
  RETURNING email_otp_locks.locked_until;
END
$_$;


--
-- Name: email_auth_reset_email_otp_lockout(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_reset_email_otp_lockout(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.lock.reset', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.email_auth_reset_email_otp_lockout(uuid)'::regprocedure);

  DELETE FROM public.email_otp_locks WHERE user_id = p_user_id;
END
$_$;


--
-- Name: email_auth_set_email_challenge_delivery_code(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_set_email_challenge_delivery_code(p_challenge_id uuid, p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_token uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'email_auth_set_email_challenge_delivery_code: code must be exactly 6 digits';
  END IF;

  -- One-shot claim, guarded by the PERMANENT marker (never cleared by anything, unlike
  -- pending_delivery_code/delivery_token which enqueue nulls out on a successful send). A second call
  -- for the same challenge_id, from anyone, at any point in the row's lifetime, finds no matching row.
  UPDATE public.email_challenges
  SET pending_delivery_code = p_code,
      delivery_token = gen_random_uuid(),
      delivery_claimed_at = now()
  WHERE id = p_challenge_id
    AND delivery_claimed_at IS NULL
  RETURNING delivery_token INTO v_token;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'email_auth_set_email_challenge_delivery_code: challenge not found or already claimed';
  END IF;

  RETURN v_token;
END
$_$;


--
-- Name: email_auth_set_email_challenge_purpose(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_set_email_challenge_purpose(p_challenge_id uuid, p_purpose text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
UPDATE public.email_challenges SET purpose = p_purpose WHERE id = p_challenge_id
$$;


--
-- Name: email_auth_start_challenge(uuid, text, text, bigint, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_start_challenge(p_user_id uuid, p_email text, p_code_hash text, p_expires_at bigint, p_purpose text, p_code text) RETURNS TABLE(challenge_id uuid, retry_after_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_challenge_id uuid;
  v_last_sent_at timestamptz;
  v_retry_after integer;
  v_event_id text;
  v_queue_rows integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.challenge.start', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg]), 'app.email_auth_start_challenge(uuid,text,text,bigint,text,text)'::regprocedure);

  IF p_user_id IS NULL OR p_email IS NULL OR p_email <> lower(btrim(p_email))
     OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'email_auth_start_challenge: invalid identity/email';
  END IF;
  IF p_code !~ '^[0-9]{6}$' OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'email_auth_start_challenge: invalid code material';
  END IF;
  IF p_expires_at <= extract(epoch FROM now())::bigint THEN
    RAISE EXCEPTION 'email_auth_start_challenge: expiry must be in the future';
  END IF;
  IF p_purpose NOT IN (
    'login', 'public_registration', 'clinic_invite', 'specialist_signup',
    'password_reset', 'password_setup', 'password_register', 'email_verify',
    'patient_email_change'
  ) THEN
    RAISE EXCEPTION 'email_auth_start_challenge: invalid purpose';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT cooldown.last_sent_at
  INTO v_last_sent_at
  FROM public.email_send_cooldowns AS cooldown
  WHERE cooldown.user_id = p_user_id
    AND cooldown.email_normalized = p_email;

  IF v_last_sent_at IS NOT NULL AND v_last_sent_at > now() - interval '60 seconds' THEN
    v_retry_after := greatest(
      1,
      60 - floor(extract(epoch FROM (now() - v_last_sent_at)))::integer
    );
    RETURN QUERY SELECT NULL::uuid, v_retry_after;
    RETURN;
  END IF;

  DELETE FROM public.email_challenges WHERE user_id = p_user_id;

  INSERT INTO public.email_challenges (
    user_id, email, code_hash, expires_at, attempts, purpose,
    pending_delivery_code, delivery_token, delivery_claimed_at
  ) VALUES (
    p_user_id, p_email, p_code_hash, p_expires_at, 0, p_purpose,
    NULL, NULL, now()
  )
  RETURNING id INTO v_challenge_id;

  v_event_id := 'auth-otp:email:' || v_challenge_id::text;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    NULL, v_event_id, 'auth_email_otp', 'email',
    jsonb_build_object(
      'intent', jsonb_build_object(
        'type', 'message.send',
        'meta', jsonb_build_object(
          'eventId', 'otp:email:' || gen_random_uuid()::text,
          'occurredAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z',
          'source', 'email',
          'outboundMessageClass', 'auth_code',
          'outboundCapability', 'auth_code'
        ),
        'payload', jsonb_build_object(
          'recipient', jsonb_build_object('email', p_email),
          'message', jsonb_build_object('text', 'Ваш код BersonCare: ' || p_code),
          'delivery', jsonb_build_object('channels', jsonb_build_array('email')),
          'subject', 'Код подтверждения BersonCare'
        )
      )
    ),
    'pending', 0, 4, now(), 100
  );
  GET DIAGNOSTICS v_queue_rows = ROW_COUNT;
  IF v_queue_rows <> 1 THEN
    RAISE EXCEPTION 'email_auth_start_challenge: durable enqueue failed';
  END IF;

  INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, p_email, now())
  ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now();

  RETURN QUERY SELECT v_challenge_id, 60;
END
$_$;


--
-- Name: email_auth_upsert_email_send_cooldown(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_upsert_email_send_cooldown(p_user_id uuid, p_email_norm text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, p_email_norm, now())
  ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now()
$$;


--
-- Name: email_auth_verify_user_email(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
UPDATE public.platform_users
  SET email = p_email,
      email_normalized = lower(btrim(p_email)),
      email_verified_at = now(),
      updated_at = now()
  WHERE id = p_user_id
$$;


--
-- Name: email_otp_public_consume_latest_challenge(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_consume_latest_challenge(p_email_normalized text, p_code_hash text) RETURNS TABLE(ok boolean, code text, user_id uuid, retry_after_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
DECLARE
  v_email_normalized text;
  v_now_sec bigint;
  v_challenge public.email_challenges%ROWTYPE;
  v_latest_challenge_id uuid;
  v_target_user public.platform_users%ROWTYPE;
  v_conflict_user_id uuid;
  v_next_attempts integer;
  v_allowed_purposes text[];
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.challenge.consume', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.email_otp_public_consume_latest_challenge(text,text)'::regprocedure);

  v_email_normalized := lower(btrim(p_email_normalized));
  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  v_allowed_purposes := ARRAY['login', 'public_registration', 'clinic_invite'];

  IF v_email_normalized = '' THEN
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF p_code_hash IS NULL OR btrim(p_code_hash) = '' THEN
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.platform_users AS candidate
  WHERE candidate.id IN (
    SELECT challenge.user_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
  )
  ORDER BY candidate.id
  FOR UPDATE;

  LOOP
    SELECT challenge.*
    INTO v_challenge
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
      RETURN;
    END IF;

    SELECT challenge.id
    INTO v_latest_challenge_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1;
    EXIT WHEN v_latest_challenge_id = v_challenge.id;
  END LOOP;

  SELECT platform_user.*
  INTO v_target_user
  FROM public.platform_users AS platform_user
  WHERE platform_user.id = v_challenge.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_user.merged_into_id IS NOT NULL THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.attempts >= 5 THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
    RETURN;
  END IF;

  IF v_challenge.code_hash <> p_code_hash
     OR NOT (v_challenge.purpose IS NULL OR v_challenge.purpose = ANY(v_allowed_purposes))
  THEN
    UPDATE public.email_challenges
    SET attempts = attempts + 1
    WHERE id = v_challenge.id
    RETURNING attempts::integer INTO v_next_attempts;
    IF v_next_attempts >= 5 THEN
      DELETE FROM public.email_challenges WHERE id = v_challenge.id;
      RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT conflict.id
  INTO v_conflict_user_id
  FROM public.platform_users AS conflict
  WHERE conflict.email_normalized = v_email_normalized
    AND conflict.merged_into_id IS NULL
    AND conflict.id <> v_target_user.id
  ORDER BY conflict.id
  LIMIT 1;
  IF FOUND THEN
    DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.platform_users
  SET email = v_email_normalized,
      email_normalized = v_email_normalized,
      email_verified_at = clock_timestamp()
  WHERE id = v_target_user.id;
  DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
  RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer;
END
$_$;


--
-- Name: email_otp_public_delete_unverified_registration(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_delete_unverified_registration(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
DELETE FROM public.platform_users
  WHERE id = p_user_id AND role = 'client' AND merged_into_id IS NULL AND email_verified_at IS NULL
$$;


--
-- Name: email_otp_public_find_email_send_cooldown_by_email(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(p_email_norm text) RETURNS TABLE(last_sent_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.cooldown.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_otp_public_find_email_send_cooldown_by_email(text)'::regprocedure);

  RETURN QUERY
  SELECT cooldown.last_sent_at
  FROM public.email_send_cooldowns AS cooldown
  WHERE cooldown.email_normalized = p_email_norm
  ORDER BY cooldown.last_sent_at DESC
  LIMIT 1;
END
$_$;


--
-- Name: email_otp_public_find_latest_email_challenge_by_email(text, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(p_email_norm text, p_now_sec bigint) RETURNS TABLE(id uuid, user_id uuid, code_hash text, expires_at bigint, attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.id, c.user_id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.email = p_email_norm
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;


--
-- Name: email_otp_public_find_or_create_user(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_or_create_user(p_email_norm text) RETURNS TABLE(user_id uuid, was_created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_existing_id uuid;
  v_merged_id uuid;
  v_canonical_id uuid;
  v_inserted_id uuid;
  v_display_name text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.user.find-or-create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_otp_public_find_or_create_user(text)'::regprocedure);

  v_display_name := COALESCE(NULLIF(split_part(p_email_norm, '@', 1), ''), p_email_norm);

  SELECT platform_user.id
  INTO v_existing_id
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = p_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  SELECT platform_user.id
  INTO v_merged_id
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = p_email_norm
    AND platform_user.merged_into_id IS NOT NULL
  ORDER BY platform_user.created_at ASC
  LIMIT 1;

  IF v_merged_id IS NOT NULL THEN
    WITH RECURSIVE chain AS (
      SELECT platform_user.id, platform_user.merged_into_id, 0 AS depth,
             ARRAY[platform_user.id] AS path
      FROM public.platform_users AS platform_user
      WHERE platform_user.id = v_merged_id
      UNION ALL
      SELECT platform_user.id, platform_user.merged_into_id, chain.depth + 1,
             chain.path || platform_user.id
      FROM public.platform_users AS platform_user
      JOIN chain ON platform_user.id = chain.merged_into_id
      WHERE chain.depth < 5 AND NOT platform_user.id = ANY(chain.path)
    )
    SELECT chain.id
    INTO v_canonical_id
    FROM chain
    ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
    LIMIT 1;

    IF v_canonical_id IS NOT NULL THEN
      RETURN QUERY SELECT v_canonical_id, false;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.platform_users (email, email_normalized, display_name, role)
  VALUES (p_email_norm, p_email_norm, v_display_name, 'client')
  ON CONFLICT (email_normalized)
    WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_inserted_id, true;
    RETURN;
  END IF;

  SELECT platform_user.id
  INTO v_existing_id
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = p_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'email_otp_public_find_or_create_user_failed';
  END IF;
  RETURN QUERY SELECT v_existing_id, false;
END
$_$;


--
-- Name: email_otp_public_find_user_by_email(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_user_by_email(p_email_norm text) RETURNS TABLE(user_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.user.find', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_otp_public_find_user_by_email(text)'::regprocedure);

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT platform_user.id, platform_user.merged_into_id, 0 AS depth,
           ARRAY[platform_user.id] AS path
    FROM public.platform_users AS platform_user
    WHERE platform_user.email_normalized = lower(btrim(p_email_norm))
    UNION ALL
    SELECT platform_user.id, platform_user.merged_into_id, chain.depth + 1,
           chain.path || platform_user.id
    FROM public.platform_users AS platform_user
    JOIN chain ON platform_user.id = chain.merged_into_id
    WHERE chain.depth < 5 AND NOT platform_user.id = ANY(chain.path)
  )
  SELECT chain.id
  FROM chain
  ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
  LIMIT 1;
END
$_$;


--
-- Name: email_otp_public_register_patient(text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_register_patient(p_email_norm text, p_last_name text, p_first_name text, p_patronymic text) RETURNS TABLE(ok boolean, code text, user_id uuid, was_created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
DECLARE
  v_email_norm text;
  v_last_name text;
  v_first_name text;
  v_patronymic text;
  v_existing public.platform_users%ROWTYPE;
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.registration.create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.email_otp_public_register_patient(text,text,text,text)'::regprocedure);

  v_email_norm := lower(btrim(p_email_norm));
  v_last_name := NULLIF(btrim(p_last_name), '');
  v_first_name := NULLIF(btrim(p_first_name), '');
  v_patronymic := NULLIF(btrim(p_patronymic), '');

  IF v_email_norm = '' THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF v_last_name IS NULL OR v_first_name IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid, false;
    RETURN;
  END IF;

  SELECT platform_user.*
  INTO v_existing
  FROM public.platform_users AS platform_user
  WHERE platform_user.email_normalized = v_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.email_verified_at IS NULL
      AND v_existing.role = 'client'
      AND v_existing.last_name IS NOT NULL
      AND v_existing.first_name IS NOT NULL
    THEN
      RETURN QUERY SELECT true, 'pending_registration'::text, v_existing.id, false;
    ELSE
      RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.platform_users (
    display_name, last_name, first_name, patronymic, email, email_normalized, role
  ) VALUES (
    concat_ws(' ', v_last_name, v_first_name, v_patronymic),
    v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, 'client'
  )
  ON CONFLICT (email_normalized)
    WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_user_id, true;
END
$_$;


--
-- Name: email_password_delete_unverified_registration(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_delete_unverified_registration(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);
DELETE FROM public.platform_users
  WHERE id = p_user_id
    AND role IN ('client', 'doctor')
    AND merged_into_id IS NULL
    AND email_verified_at IS NULL
$$;


--
-- Name: email_password_find_login_candidate(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_find_login_candidate(p_email_norm text) RETURNS TABLE(user_id uuid, password_hash text, email_verified boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT upc.user_id, upc.password_hash,
         (pu.email_verified_at IS NOT NULL OR fpu.matched_primary = false) AS email_verified
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  INNER JOIN app.find_platform_user_ids_by_any_confirmed_email(p_email_norm) AS fpu ON fpu.user_id = upc.user_id
  WHERE pu.merged_into_id IS NULL
  LIMIT 1
$$;


--
-- Name: email_password_find_reset_candidate(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_find_reset_candidate(p_email_norm text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.reset-candidate', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_password_find_reset_candidate(text)'::regprocedure);

  SELECT credentials.user_id
  INTO v_user_id
  FROM public.user_password_credentials AS credentials
  INNER JOIN public.platform_users AS users ON users.id = credentials.user_id
  WHERE users.merged_into_id IS NULL
    AND users.email_normalized = lower(btrim(p_email_norm))
    AND users.email_verified_at IS NOT NULL
  LIMIT 1;
  RETURN v_user_id;
END
$_$;


--
-- Name: email_password_find_user_id_by_email_challenge(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_find_user_id_by_email_challenge(p_challenge_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT c.user_id
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
  LIMIT 1
$$;


--
-- Name: email_password_register_pending(text, text, text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_register_pending(p_email_norm text, p_password_hash text, p_last_name text, p_first_name text, p_patronymic text, p_role text) RETURNS TABLE(ok boolean, code text, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
DECLARE
  v_email_norm text := lower(btrim(p_email_norm));
  v_last_name text := NULLIF(btrim(p_last_name), '');
  v_first_name text := NULLIF(btrim(p_first_name), '');
  v_patronymic text := NULLIF(btrim(p_patronymic), '');
  v_display_name text;
  v_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_role NOT IN ('client', 'doctor') THEN
    RETURN QUERY SELECT false, 'invalid_role'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_email_norm = '' THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_last_name IS NULL OR v_first_name IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid;
    RETURN;
  END IF;

  v_display_name := concat_ws(' ', v_last_name, v_first_name, v_patronymic);

  INSERT INTO public.platform_users (
    display_name,
    last_name,
    first_name,
    patronymic,
    email,
    email_normalized,
    role
  )
  VALUES (v_display_name, v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, p_role)
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.user_password_credentials (user_id, password_hash, updated_at)
  VALUES (v_user_id, p_password_hash, now());

  RETURN QUERY SELECT true, NULL::text, v_user_id;
END
$$;


--
-- Name: enforce_lfk_child_owner(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.enforce_lfk_child_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  parent_kind text;
  parent_org uuid;
  media_kind text;
  media_org uuid;
  media_id uuid;
BEGIN
  IF TG_TABLE_NAME IN ('lfk_exercise_regions', 'lfk_exercise_media') THEN
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.lfk_exercises
     WHERE id = NEW.exercise_id;
  ELSE
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.lfk_complex_templates
     WHERE id = NEW.template_id;
  END IF;

  IF parent_kind IS NULL
     OR parent_kind IS DISTINCT FROM NEW.owner_kind
     OR parent_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'lfk_child_owner_mismatch' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'lfk_complex_template_exercises' THEN
    SELECT owner_kind, organization_id
      INTO media_kind, media_org
      FROM public.lfk_exercises
     WHERE id = NEW.exercise_id;
    IF media_kind IS NULL
       OR (
         NEW.owner_kind = 'platform'
         AND (media_kind IS DISTINCT FROM 'platform' OR media_org IS NOT NULL)
       )
       OR (
         NEW.owner_kind = 'organization'
         AND NOT (
           (media_kind = 'organization' AND media_org IS NOT DISTINCT FROM NEW.organization_id)
           OR (media_kind = 'platform' AND media_org IS NULL)
         )
       ) THEN
      RAISE EXCEPTION 'lfk_template_exercise_owner_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'lfk_exercise_media'
     AND NEW.media_url ~ '^/api/media/[0-9a-fA-F-]{36}$' THEN
    media_id := substring(NEW.media_url FROM '^/api/media/([0-9a-fA-F-]{36})$')::uuid;
    SELECT owner_kind, organization_id
      INTO media_kind, media_org
      FROM public.media_files
     WHERE id = media_id;
    IF media_kind IS NULL
       OR media_kind IS DISTINCT FROM NEW.owner_kind
       OR media_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'lfk_media_owner_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: enqueue_integrator_inbound_reply(text, text, text, integer, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.enqueue_integrator_inbound_reply(p_event_id text, p_channel text, p_payload_json_text text, p_max_attempts integer, p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.inbound-reply.enqueue', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($4))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($5))::app.port_typed_arg]), 'app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)'::regprocedure);

  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION 'inbound_reply_event_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_channel NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'inbound_reply_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 20 THEN
    RAISE EXCEPTION 'inbound_reply_max_attempts_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outgoing_delivery_queue (
    event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
    next_retry_at, organization_id
  ) VALUES (
    p_event_id, 'inbound_reply', p_channel, p_payload_json_text::jsonb, 'pending', 0,
    p_max_attempts, now(), p_organization_id
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count = 1;
END
$_$;


--
-- Name: ensure_staff_security_profile(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.ensure_staff_security_profile() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);
INSERT INTO public.staff_security_profiles (user_id)
	VALUES (app.require_staff_security_self_user_id())
	ON CONFLICT (user_id) DO NOTHING
$$;


--
-- Name: exchange_patient_invite(text, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.exchange_patient_invite(p_token_hash text, p_continuation_hash text, p_continuation_expires_at timestamp with time zone) RETURNS TABLE(ok boolean, code text, organization_title text, recipient_hint text, invite_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_organization_title text;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
  v_hint text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_token_hash IS NULL OR p_token_hash = ''
     OR p_continuation_hash IS NULL OR p_continuation_hash = ''
     OR p_continuation_expires_at IS NULL OR p_continuation_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.token_hash = p_token_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'expired' OR v_invite.expires_at <= now() THEN
    UPDATE public.patient_invites AS invite
    SET status = 'expired', updated_at = now()
    WHERE invite.id = v_invite.id AND invite.status = 'pending';
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.bearer_exchanged_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'exchanged_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at
  INTO v_enrollment_status, v_portal_activated_at
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1;
  IF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT organization.title INTO v_organization_title
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_invite.recipient_binding = 'bound_email' THEN
    IF v_invite.invited_email_normalized IS NULL
       OR position('@' IN v_invite.invited_email_normalized) <= 1 THEN
      RETURN QUERY SELECT false, 'missing_recipient'::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    v_hint := left(v_invite.invited_email_normalized, 1)
      || '***@' || split_part(v_invite.invited_email_normalized, '@', 2);
  ELSIF v_invite.recipient_binding = 'unbound_email_claim' THEN
    v_hint := NULL;
  ELSE
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET bearer_exchanged_at = now(),
      continuation_hash = p_continuation_hash,
      continuation_expires_at = LEAST(p_continuation_expires_at, v_invite.expires_at),
      updated_at = now()
  WHERE invite.id = v_invite.id
    AND invite.status = 'pending'
    AND invite.bearer_exchanged_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'exchanged_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_organization_title, v_hint, v_invite.expires_at;
END
$$;


--
-- Name: find_platform_user_ids_by_any_confirmed_email(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.find_platform_user_ids_by_any_confirmed_email(p_email_norm text) RETURNS TABLE(user_id uuid, matched_primary boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_identity_lookup_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT uc.platform_user_id AS user_id, bool_or(uc.is_primary) AS matched_primary
  FROM public.user_contacts uc
  INNER JOIN public.platform_users pu ON pu.id = uc.platform_user_id
  WHERE uc.contact_kind = 'email'
    AND uc.value_normalized = lower(btrim(p_email_norm))
    AND uc.confirmed_at IS NOT NULL
    AND pu.merged_into_id IS NULL
  GROUP BY uc.platform_user_id
$$;


--
-- Name: get_google_calendar_event_id(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_google_calendar_event_id(p_appointment_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE v_event_id text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.get', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.get_google_calendar_event_id(uuid)'::regprocedure);

  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  SELECT m.gcal_event_id INTO v_event_id FROM public.booking_calendar_map m
   WHERE m.appointment_key = 'be:' || p_appointment_id::text;
  RETURN v_event_id;
END
$_$;


--
-- Name: get_latest_specialist_signup_intent_for_user(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_latest_specialist_signup_intent_for_user() RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, organization_slug text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    intent.id,
    intent.user_id,
    intent.challenge_id,
    intent.email_normalized,
    intent.organization_title,
    intent.organization_slug,
    intent.specialist_full_name,
    intent.status,
    intent.provisioned_organization_id,
    intent.provisioned_specialist_id,
    intent.provisioned_membership_id
  FROM public.specialist_signup_intents AS intent
  WHERE intent.user_id = app.require_staff_security_self_user_id()
  ORDER BY intent.created_at DESC
  LIMIT 1
$$;


--
-- Name: get_pending_specialist_signup_intent(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_pending_specialist_signup_intent(p_user_id uuid, p_challenge_id uuid) RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, organization_slug text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
    i.organization_slug,
    i.specialist_full_name,
    i.status,
    i.provisioned_organization_id,
    i.provisioned_specialist_id,
    i.provisioned_membership_id
  FROM public.specialist_signup_intents AS i
  WHERE i.user_id = p_user_id
    AND i.challenge_id = p_challenge_id
    AND i.status = 'pending'
  LIMIT 1
$$;


--
-- Name: get_preferred_auth_channel_code(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_preferred_auth_channel_code(p_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_identity_lookup_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
SELECT preference.channel_code
  FROM public.user_channel_preferences AS preference
  WHERE (
      preference.platform_user_id = p_user_id
      OR (preference.platform_user_id IS NULL AND preference.user_id = p_user_id::text)
    )
    AND preference.is_preferred_for_auth = true
  LIMIT 1
$$;


--
-- Name: get_public_config_bool(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_public_config_bool(p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_preauth_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT CASE
    WHEN p_key <> 'specialist_signup_enabled' THEN NULL::boolean
    WHEN s.value_json #> '{value}' = 'true'::jsonb THEN true
    WHEN s.value_json #> '{value}' = 'false'::jsonb THEN false
    WHEN lower(btrim(s.value_json #>> '{value}')) IN ('true', '1') THEN true
    WHEN lower(btrim(s.value_json #>> '{value}')) IN ('false', '0') THEN false
    ELSE NULL::boolean
  END
  FROM public.system_settings AS s
  WHERE p_key = 'specialist_signup_enabled'
    AND s.key = p_key
    AND s.scope = 'admin'
    AND s.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: get_public_reference_baseline(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_public_reference_baseline(p_category_code text) RETURNS TABLE(id uuid, category_id uuid, code text, title text, sort_order integer, is_active boolean, deleted_at timestamp with time zone, meta_json jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_catalog_public_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'catalog.public-reference.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.get_public_reference_baseline(text)'::regprocedure);

  RETURN QUERY
  WITH latest AS (
    SELECT definition_json FROM public.reference_catalog_baselines ORDER BY version DESC LIMIT 1
  ), category AS (
    SELECT value AS definition
      FROM latest, jsonb_array_elements(definition_json->'categories')
     WHERE value->>'code' = p_category_code AND p_category_code <> 'visit_manipulation'
  )
  SELECT md5('public-reference-item:' || p_category_code || ':' || ((expanded.item_definition::jsonb)->>0))::uuid,
         md5('public-reference-category:' || p_category_code)::uuid,
         (expanded.item_definition::jsonb)->>0,
         (expanded.item_definition::jsonb)->>1,
         ((expanded.item_definition::jsonb)->>2)::integer,
         true, NULL::timestamptz, COALESCE((expanded.item_definition::jsonb)->3, '{}'::jsonb)
    FROM category
    CROSS JOIN LATERAL jsonb_array_elements(category.definition->'items') AS expanded(item_definition)
   ORDER BY ((expanded.item_definition::jsonb)->>2)::integer, (expanded.item_definition::jsonb)->>1;
END
$_$;


--
-- Name: get_specialist_signup_intent_by_challenge(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_specialist_signup_intent_by_challenge(p_challenge_id uuid) RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, organization_slug text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
    i.organization_slug,
    i.specialist_full_name,
    i.status,
    i.provisioned_organization_id,
    i.provisioned_specialist_id,
    i.provisioned_membership_id
  FROM public.specialist_signup_intents AS i
  WHERE i.challenge_id = p_challenge_id
  LIMIT 1
$$;


--
-- Name: get_staff_security_profile(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_staff_security_profile() RETURNS TABLE(user_id uuid, factor_type text, totp_secret_ciphertext text, pending_totp_secret_ciphertext text, factor_verified_at timestamp with time zone, recovery_code_hashes jsonb, recovery_codes_confirmed_at timestamp with time zone, replacement_required boolean, failed_attempts integer, locked_until timestamp with time zone, session_version integer, login_challenge_hash text, login_challenge_expires_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT p.user_id, p.factor_type, p.totp_secret_ciphertext,
	       p.pending_totp_secret_ciphertext,
	       p.factor_verified_at, p.recovery_code_hashes,
	       p.recovery_codes_confirmed_at, p.replacement_required,
	       p.failed_attempts, p.locked_until, p.session_version,
	       p.login_challenge_hash, p.login_challenge_expires_at
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
$$;


--
-- Name: get_staff_security_session_state(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_staff_security_session_state() RETURNS TABLE(session_version integer, factor_required boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT p.session_version, (p.factor_verified_at IS NOT NULL)
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
$$;


--
-- Name: get_web_push_vapid_public_key(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_web_push_vapid_public_key() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE public_key text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.web-push.vapid-public-key.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.get_web_push_vapid_public_key()'::regprocedure);

  SELECT NULLIF(btrim(setting.value_json #>> '{value,publicKey}'), '') INTO public_key
    FROM public.system_settings AS setting
   WHERE setting.key = 'web_push_vapid'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN public_key;
END
$$;


--
-- Name: guard_clinic_directory_current_slug(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_clinic_directory_current_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS current_claim
    WHERE current_claim.organization_id = NEW.organization_id
      AND current_claim.kind = 'current'
      AND current_claim.slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'clinic directory slug must match the organization current claim';
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: guard_org_brand_revision(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_org_brand_revision() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'org_brand_revision_must_be_created_as_draft';
    END IF;
  ELSE
    -- FK-DRIVEN LOGO DEGRADATION (audit HIGH 2, 2026-07-25). `logo_media_id … ON DELETE SET NULL`
    -- makes PostgreSQL issue `UPDATE ONLY public.org_brand_revisions SET logo_media_id = NULL` when a
    -- referenced public.media_files row is deleted, and that UPDATE fires this trigger. Without this
    -- branch it raised P0001 on every published/archived row, which broke the media purge worker
    -- (s3MediaStorage.purgePendingMediaDeleteBatch tolerates only SQLSTATE class 23 and had already
    -- deleted the S3 objects) and made the documented §10 degradation "brand invalid asset ->
    -- platform fallback + safe org text" unreachable.
    -- The tolerance is DELIBERATELY the narrowest possible: the ONLY accepted change is
    -- logo_media_id going non-NULL -> NULL. `to_jsonb(NEW) - 'logo_media_id'` vs
    -- `to_jsonb(OLD) - 'logo_media_id'` compares EVERY OTHER column (including status, display_name,
    -- the actor trail, published_at/archived_at and updated_at) whole-row, so it stays correct when a
    -- column is added later. Consequences kept intact: setting a NEW logo on a published/archived row
    -- is still rejected (NEW.logo_media_id would not be NULL), clearing the logo together with any
    -- other edit is still rejected, and updated_at is intentionally NOT re-stamped so exactly one
    -- column of an immutable row ever changes.
    -- `pg_trigger_depth() > 1` restricts the tolerance to a CASCADED write: the referential-action
    -- UPDATE runs inside the RI trigger of the public.media_files DELETE, so it always sees depth >= 2,
    -- while a statement issued directly by app_staff sees depth = 1. Without it the branch was a direct
    -- write hole: `UPDATE org_brand_revisions SET logo_media_id = NULL WHERE id = ...` succeeded on
    -- published and archived rows, changing the live branded surface and rewriting the append-only audit
    -- row with no trace (updated_at is deliberately not re-stamped) -- contradicting this file's own
    -- "published -> archived and NOTHING else" / "archived -> immutable forever" contract and
    -- BRANDING_DOMAIN_CONTRACT invariant 3.8.
    IF TG_OP = 'UPDATE'
       AND pg_trigger_depth() > 1
       AND OLD.status IN ('published', 'archived')
       AND OLD.logo_media_id IS NOT NULL
       AND NEW.logo_media_id IS NULL
       AND to_jsonb(NEW) - 'logo_media_id' = to_jsonb(OLD) - 'logo_media_id' THEN
      RETURN NEW;
    END IF;

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'org_brand_revision_organization_is_immutable';
    END IF;
    IF NEW.created_by_platform_user_id IS DISTINCT FROM OLD.created_by_platform_user_id THEN
      RAISE EXCEPTION 'org_brand_revision_author_is_immutable';
    END IF;
    IF OLD.status = 'archived' THEN
      RAISE EXCEPTION 'org_brand_revision_archived_is_immutable';
    END IF;
    IF OLD.status = 'published' THEN
      IF NEW.status <> 'archived' THEN
        RAISE EXCEPTION 'org_brand_revision_published_only_archives';
      END IF;
      IF NEW.display_name IS DISTINCT FROM OLD.display_name
         OR NEW.logo_media_id IS DISTINCT FROM OLD.logo_media_id
         OR NEW.published_at IS DISTINCT FROM OLD.published_at
         OR NEW.published_by_platform_user_id IS DISTINCT FROM OLD.published_by_platform_user_id THEN
        RAISE EXCEPTION 'org_brand_revision_published_content_is_immutable';
      END IF;
    ELSIF NEW.status NOT IN ('draft', 'published') THEN
      RAISE EXCEPTION 'org_brand_revision_draft_transition_not_allowed';
    END IF;
  END IF;

  IF NEW.logo_media_id IS NOT NULL THEN
    PERFORM 1
    FROM public.media_files AS logo
    WHERE logo.id = NEW.logo_media_id
      AND logo.owner_kind = 'organization'
      AND logo.organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'org_brand_logo_media_must_be_owned_by_organization';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;


--
-- Name: guard_organization_slug_claim_mutation(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_organization_slug_claim_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.kind IN ('current', 'alias') THEN
    RAISE EXCEPTION 'durable organization slug claims cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'alias' AND (
    NEW.kind <> 'current'
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'organization slug aliases are immutable outside same-organization reclaim';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'current' AND (
    NEW.kind NOT IN ('current', 'alias')
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR (NEW.kind = 'alias' AND NEW.slug IS DISTINCT FROM OLD.slug)
  ) THEN
    RAISE EXCEPTION 'current organization slug target is immutable outside same-organization reclaim';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'reservation' AND NEW.kind NOT IN ('reservation', 'current') THEN
    RAISE EXCEPTION 'invalid organization slug reservation transition';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: guard_organization_slug_rename_event_mutation(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_organization_slug_rename_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  RAISE EXCEPTION 'organization slug rename audit is append-only';
END
$$;


--
-- Name: hash_port_typed_args(app.port_typed_arg[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.hash_port_typed_args(p_args app.port_typed_arg[]) RETURNS bytea
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE item app.port_typed_arg; ordinal integer := 0; item_count integer; payload bytea; tag_bytes bytea;
BEGIN
  IF p_args IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'port typed args must not be NULL'; END IF;
  item_count := cardinality(p_args);
  IF item_count = 0 THEN RETURN decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'); END IF;
  IF array_ndims(p_args) <> 1 OR array_lower(p_args, 1) <> 1 OR item_count NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed args dimensions';
  END IF;
  payload := convert_to('BCBPORTARGS', 'SQL_ASCII') || E'\\000'::bytea || int2send(1::smallint) || int2send(item_count::smallint);
  FOREACH item IN ARRAY p_args LOOP
    ordinal := ordinal + 1;
    IF item IS NULL OR item.type_tag IS NULL OR item.type_tag !~ '^[a-z][a-z0-9_.]*@[1-9][0-9]*$'
      OR item.type_tag NOT IN ('uuid@1','oid@1','integer@1','bigint@1','xid8@1','boolean@1','text@1','name@1','bytea@1','timestamptz@1') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed arg tag';
    END IF;
    tag_bytes := convert_to(item.type_tag, 'SQL_ASCII');
    IF octet_length(tag_bytes) NOT BETWEEN 1 AND 128 OR (item.value IS NOT NULL AND octet_length(item.value) > 1048576)
      OR (item.value IS NOT NULL AND item.type_tag = 'uuid@1' AND octet_length(item.value) <> 16)
      OR (item.value IS NOT NULL AND item.type_tag IN ('oid@1','integer@1') AND octet_length(item.value) <> 4)
      OR (item.value IS NOT NULL AND item.type_tag IN ('bigint@1','xid8@1','timestamptz@1') AND octet_length(item.value) <> 8)
      OR (item.value IS NOT NULL AND item.type_tag = 'boolean@1' AND (octet_length(item.value) <> 1 OR get_byte(item.value, 0) NOT IN (0,1)))
      OR (item.value IS NOT NULL AND item.type_tag = 'name@1' AND octet_length(item.value) > 63) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed arg value';
    END IF;
    IF item.value IS NOT NULL AND item.type_tag IN ('text@1','name@1') THEN
      BEGIN PERFORM convert_from(item.value, 'UTF8'); EXCEPTION WHEN character_not_in_repertoire THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid UTF8 typed arg';
      END;
    END IF;
    payload := payload || int2send(ordinal::smallint) || int2send(1::smallint) || int2send(octet_length(tag_bytes)::smallint) || tag_bytes || int2send(2::smallint);
    IF item.value IS NULL THEN payload := payload || decode('ffffffff', 'hex');
    ELSE payload := payload || int4send(octet_length(item.value)) || item.value; END IF;
  END LOOP;
  RETURN pg_catalog.sha256(payload);
END $_$;


--
-- Name: increment_media_playback_resolution_stat(uuid, uuid, text, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.increment_media_playback_resolution_stat(p_user_id uuid, p_media_id uuid, p_delivery text, p_fallback_used boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_media_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_stats_hourly (
    organization_id, bucket_hour, delivery, resolved_count, fallback_count
  ) VALUES (
    v_organization_id,
    date_trunc('hour', clock_timestamp()),
    p_delivery,
    1,
    CASE WHEN p_fallback_used THEN 1 ELSE 0 END
  )
  ON CONFLICT (organization_id, bucket_hour, delivery) DO UPDATE
    SET resolved_count = public.media_playback_stats_hourly.resolved_count + 1,
        fallback_count = public.media_playback_stats_hourly.fallback_count
          + CASE WHEN EXCLUDED.fallback_count > 0 THEN 1 ELSE 0 END;
END
$$;


--
-- Name: install_port_context(uuid, app.port_context_claims); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.install_port_context(p_capability_id uuid, p_claims app.port_context_claims) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $_$
DECLARE cap app_ext.port_context_capabilities%ROWTYPE; database_id oid;
BEGIN
  IF NOT (p_claims.protocol_version IS NOT DISTINCT FROM 1) OR p_claims.purpose !~ '^[a-z][a-z0-9._:-]{0,127}$' OR octet_length(p_claims.typed_args_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invalid port context claims';
  END IF;
  SELECT * INTO cap FROM app_ext.port_context_capabilities WHERE capability_id = p_capability_id FOR SHARE;
  IF NOT FOUND OR cap.session_login <> session_user OR cap.target_role <> p_claims.target_role
    OR cap.context_class <> p_claims.context_class OR cap.purpose <> p_claims.purpose
    OR cap.function_identity IS DISTINCT FROM p_claims.function_identity OR cap.active_from > clock_timestamp()
    OR (cap.active_until IS NOT NULL AND cap.active_until <= clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context capability mismatch';
  END IF;
  IF (p_claims.context_class = 'pre_session' AND NOT (p_claims.request_id IS NOT NULL AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.organization_id IS NULL AND p_claims.integrator_user_id IS NULL))
    OR (p_claims.context_class = 'staff' AND NOT (p_claims.actor_ref IS NOT NULL AND p_claims.organization_id IS NOT NULL AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL))
    OR (p_claims.context_class = 'patient' AND NOT (
      p_claims.actor_ref IS NOT NULL AND p_claims.subject_ref IS NOT NULL
      AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL
      AND (p_claims.organization_id IS NOT NULL OR (
        p_claims.organization_id IS NULL
        AND (
          (cap.purpose = 'relation' AND cap.function_identity IS NULL)
          OR (
            cap.purpose = 'patient.organization.resolve'
            AND cap.function_identity = pg_catalog.to_regprocedure('app.read_current_patient_active_organizations()')
          )
        )
      ))
    ))
    OR (p_claims.context_class = 'platform' AND NOT (p_claims.actor_ref IS NOT NULL AND p_claims.subject_ref IS NULL AND p_claims.organization_id IS NULL AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL))
    OR (p_claims.context_class = 'integrator' AND NOT (
      (p_claims.target_role = 'app_integrator_request' AND p_claims.integrator_user_id IS NOT NULL AND p_claims.organization_id IS NOT NULL
        AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL)
      OR (p_claims.target_role = 'app_integrator_resolver' AND p_claims.integrator_user_id IS NULL AND p_claims.organization_id IS NULL
        AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL)
    ))
    OR (p_claims.context_class = 'tenant_service' AND NOT (p_claims.organization_id IS NOT NULL AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.integrator_user_id IS NULL AND p_claims.request_id IS NULL))
    OR (p_claims.context_class = 'service' AND NOT (
      p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL
      AND p_claims.integrator_user_id IS NULL AND p_claims.request_id IS NULL
      AND (
        p_claims.organization_id IS NULL
        OR (
          p_claims.target_role = 'app_worker'
          AND cap.purpose = 'relation'
          AND cap.function_identity IS NULL
        )
      )
    )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context class identity mismatch';
  END IF;
  -- Context capabilities carry only Variant-A opaque references.  The context
  -- seam deliberately does not read the physical map: the identity seam owns
  -- that lookup and is the sole place Variant I will replace.
  IF p_claims.actor_ref IS NOT NULL THEN
    PERFORM app_ext.resolve_variant_a_physical(p_claims.actor_ref);
  END IF;
  IF p_claims.subject_ref IS NOT NULL THEN
    PERFORM app_ext.resolve_variant_a_physical(p_claims.subject_ref);
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  DELETE FROM app_ext.accepted_port_contexts WHERE cleared_at < clock_timestamp() - interval '24 hours';
  INSERT INTO app_ext.accepted_port_contexts (database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role, context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref, organization_id, integrator_user_id, request_id)
  VALUES (database_id, pg_backend_pid(), pg_current_xact_id(), cap.capability_id, session_user, cap.port, p_claims.target_role, p_claims.context_class, p_claims.purpose, p_claims.function_identity, p_claims.typed_args_hash, p_claims.actor_ref, p_claims.subject_ref, p_claims.organization_id, p_claims.integrator_user_id, p_claims.request_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context already installed for transaction';
END $_$;


--
-- Name: integrator_bind_bootstrap_channel_phone(text, text, text, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.integrator_bind_bootstrap_channel_phone(p_channel_code text, p_external_id text, p_phone_normalized text, p_preferred_platform_user_id uuid) RETURNS TABLE(platform_user_id uuid, applied boolean, failure_code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
#variable_conflict use_column
DECLARE
  v_source_user_id uuid;
  v_target_user_id uuid;
  v_phone_owner_id uuid;
  v_preferred_user_id uuid;
  v_next_id uuid;
  v_depth integer;
  v_owner_ids uuid[];
  v_source_is_empty boolean;
  v_target_phone text;
  v_lock_channel bigint;
  v_lock_phone bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_binding_owner'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'integrator.bootstrap-phone-bind', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg]), 'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure);

  IF p_channel_code NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_bootstrap_phone_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_external_id IS NULL OR btrim(p_external_id) = ''
     OR p_phone_normalized IS NULL OR btrim(p_phone_normalized) = '' THEN
    RAISE EXCEPTION 'integrator_bootstrap_phone_input_required' USING ERRCODE = '22023';
  END IF;

  v_lock_channel := hashtextextended(
    'integrator-channel-identity:' || p_channel_code || ':' || p_external_id, 0
  );
  v_lock_phone := hashtextextended('integrator-phone-identity:' || p_phone_normalized, 0);
  PERFORM pg_advisory_xact_lock(least(v_lock_channel, v_lock_phone));
  IF v_lock_phone <> v_lock_channel THEN
    PERFORM pg_advisory_xact_lock(greatest(v_lock_channel, v_lock_phone));
  END IF;

  SELECT binding.user_id
    INTO v_source_user_id
    FROM public.user_channel_bindings AS binding
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id;
  IF v_source_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, 'no_channel_binding'::text;
    RETURN;
  END IF;

  v_depth := 0;
  LOOP
    SELECT person.merged_into_id INTO v_next_id
      FROM public.platform_users AS person
     WHERE person.id = v_source_user_id;
    EXIT WHEN NOT FOUND OR v_next_id IS NULL OR v_depth >= 32;
    v_source_user_id := v_next_id;
    v_depth := v_depth + 1;
  END LOOP;

  SELECT array_agg(DISTINCT owner_id ORDER BY owner_id)
    INTO v_owner_ids
    FROM (
      SELECT contact.platform_user_id AS owner_id
        FROM public.user_contacts AS contact
       WHERE contact.contact_kind = 'phone'
         AND contact.value_normalized = p_phone_normalized
      UNION
      SELECT person.id
        FROM public.platform_users AS person
       WHERE person.phone_normalized = p_phone_normalized
         AND person.merged_into_id IS NULL
      UNION
      SELECT history.platform_user_id
        FROM public.user_phone_history AS history
       WHERE history.phone_normalized = p_phone_normalized
         AND history.valid_to IS NULL
    ) AS owners;

  IF coalesce(array_length(v_owner_ids, 1), 0) > 1 THEN
    RETURN QUERY SELECT v_source_user_id, false, 'phone_owned_by_other_user'::text;
    RETURN;
  END IF;
  v_phone_owner_id := v_owner_ids[1];
  IF v_phone_owner_id IS NOT NULL THEN
    v_depth := 0;
    LOOP
      SELECT person.merged_into_id INTO v_next_id
        FROM public.platform_users AS person
       WHERE person.id = v_phone_owner_id;
      EXIT WHEN NOT FOUND OR v_next_id IS NULL OR v_depth >= 32;
      v_phone_owner_id := v_next_id;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  v_preferred_user_id := p_preferred_platform_user_id;
  IF v_preferred_user_id IS NOT NULL THEN
    v_depth := 0;
    LOOP
      SELECT person.merged_into_id INTO v_next_id
        FROM public.platform_users AS person
       WHERE person.id = v_preferred_user_id;
      IF NOT FOUND THEN
        RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_ambiguous_candidates'::text;
        RETURN;
      END IF;
      EXIT WHEN v_next_id IS NULL OR v_depth >= 32;
      v_preferred_user_id := v_next_id;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  IF v_phone_owner_id IS NOT NULL AND v_preferred_user_id IS NOT NULL
     AND v_phone_owner_id <> v_preferred_user_id THEN
    RETURN QUERY SELECT v_source_user_id, false, 'phone_owned_by_other_user'::text;
    RETURN;
  END IF;

  v_target_user_id := coalesce(v_preferred_user_id, v_phone_owner_id, v_source_user_id);
  SELECT person.phone_normalized INTO v_target_phone
    FROM public.platform_users AS person
   WHERE person.id = v_target_user_id AND person.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_ambiguous_candidates'::text;
    RETURN;
  END IF;
  IF v_target_phone IS NOT NULL AND v_target_phone <> p_phone_normalized THEN
    RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_distinct_real_users'::text;
    RETURN;
  END IF;

  IF v_target_user_id <> v_source_user_id THEN
    SELECT
      source.integrator_user_id IS NULL
      AND source.phone_normalized IS NULL
      AND source.email IS NULL
      AND identity.first_name IS NULL
      AND identity.last_name IS NULL
      AND identity.patronymic IS NULL
      AND identity.birth_date IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
         WHERE contact.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_phone_history AS history
         WHERE history.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
         WHERE enrollment.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.be_organization_members AS member
         WHERE member.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_channel_bindings AS other_binding
         WHERE other_binding.user_id = source.id
           AND (other_binding.channel_code, other_binding.external_id)
             IS DISTINCT FROM (p_channel_code, p_external_id)
      )
      INTO v_source_is_empty
      FROM public.platform_users AS source
      INNER JOIN public.user_identity AS identity ON identity.platform_user_id = source.id
     WHERE source.id = v_source_user_id
       AND source.merged_into_id IS NULL;

    IF coalesce(v_source_is_empty, false) IS NOT TRUE THEN
      RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_distinct_real_users'::text;
      RETURN;
    END IF;

    UPDATE public.user_channel_bindings
       SET user_id = v_target_user_id
     WHERE user_id = v_source_user_id
       AND channel_code = p_channel_code
       AND external_id = p_external_id;

    INSERT INTO public.user_channel_preferences AS preferences (
      user_id, platform_user_id, channel_code,
      is_enabled_for_messages, is_enabled_for_notifications, updated_at
    ) VALUES (
      v_target_user_id::text, v_target_user_id, p_channel_code, true, true, now()
    )
    ON CONFLICT (platform_user_id, channel_code) DO UPDATE SET
      is_enabled_for_messages = true,
      is_enabled_for_notifications = true,
      updated_at = EXCLUDED.updated_at;

    DELETE FROM public.user_channel_preferences
     WHERE platform_user_id = v_source_user_id
       AND channel_code = p_channel_code;

    UPDATE public.platform_users
       SET merged_into_id = v_target_user_id,
           updated_at = now()
     WHERE id = v_source_user_id
       AND merged_into_id IS NULL;
  END IF;

  UPDATE public.user_phone_history
     SET valid_to = now()
   WHERE platform_user_id = v_target_user_id
     AND valid_to IS NULL
     AND phone_normalized <> p_phone_normalized;

  INSERT INTO public.user_phone_history (
    platform_user_id, phone_normalized, valid_from, valid_to, source
  ) VALUES (
    v_target_user_id, p_phone_normalized, now(), NULL, 'messenger'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.platform_users
     SET phone_normalized = p_phone_normalized,
         patient_phone_trust_at = now(),
         updated_at = now()
   WHERE id = v_target_user_id
     AND merged_into_id IS NULL;

  DELETE FROM public.user_contacts
   WHERE platform_user_id = v_target_user_id
     AND contact_kind = 'phone'
     AND source_origin IN ('platform_users', 'phone_history');

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized,
    is_primary, confirmed_at, source_origin, updated_at
  ) VALUES (
    v_target_user_id, 'phone', p_phone_normalized,
    true, now(), 'platform_users', now()
  )
  ON CONFLICT (value_normalized) WHERE contact_kind = 'phone'
  DO UPDATE SET
    platform_user_id = EXCLUDED.platform_user_id,
    is_primary = true,
    confirmed_at = EXCLUDED.confirmed_at,
    source_origin = EXCLUDED.source_origin,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT v_target_user_id, true, NULL::text;
END
$_$;


--
-- Name: integrator_event_idempotency_read(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.integrator_event_idempotency_read(p_key text) RETURNS TABLE(request_hash text, status integer, response_body jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'integrator.event-idempotency.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.integrator_event_idempotency_read(text)'::regprocedure);

  RETURN QUERY
  SELECT stored.request_hash, stored.status::integer, stored.response_body
  FROM public.idempotency_keys AS stored
  WHERE stored.key = p_key
    AND stored.expires_at > now();
END
$_$;


--
-- Name: integrator_event_idempotency_store(text, text, integer, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.integrator_event_idempotency_store(p_key text, p_request_hash text, p_status integer, p_response_body text, p_ttl_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'integrator.event-idempotency.store', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($5))::app.port_typed_arg]), 'app.integrator_event_idempotency_store(text,text,integer,text,integer)'::regprocedure);

  IF p_ttl_seconds < 60 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'integrator_event_idempotency_ttl_out_of_range';
  END IF;

  INSERT INTO public.idempotency_keys AS stored (
    key, request_hash, status, response_body, expires_at
  ) VALUES (
    p_key, p_request_hash, p_status, p_response_body::jsonb,
    now() + p_ttl_seconds * interval '1 second'
  )
  ON CONFLICT (key) DO UPDATE SET
    request_hash = EXCLUDED.request_hash,
    status = EXCLUDED.status,
    response_body = EXCLUDED.response_body,
    expires_at = EXCLUDED.expires_at
  WHERE stored.expires_at < now() OR stored.request_hash = EXCLUDED.request_hash;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$_$;


--
-- Name: integrator_upsert_channel_identity(text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.integrator_upsert_channel_identity(p_channel_code text, p_external_id text, p_display_handle text) RETURNS TABLE(platform_user_id uuid, account_created boolean, channel_binding_inserted boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_platform_user_id uuid;
  v_display_handle text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'integrator.channel-identity.upsert', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.integrator_upsert_channel_identity(text,text,text)'::regprocedure);

  IF p_channel_code NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_channel_identity_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION 'integrator_channel_identity_external_id_required' USING ERRCODE = '22023';
  END IF;

  v_display_handle := nullif(
    left(regexp_replace(btrim(coalesce(p_display_handle, '')), '^@+', ''), 32),
    ''
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended('integrator-channel-identity:' || p_channel_code || ':' || p_external_id, 0)
  );

  SELECT person.id
    INTO v_platform_user_id
    FROM public.user_channel_bindings AS binding
    INNER JOIN public.platform_users AS person ON person.id = binding.user_id
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id
     AND person.merged_into_id IS NULL;

  IF v_platform_user_id IS NOT NULL THEN
    IF v_display_handle IS NOT NULL THEN
      UPDATE public.user_channel_bindings
         SET display_handle = v_display_handle
       WHERE user_id = v_platform_user_id
         AND channel_code = p_channel_code
         AND external_id = p_external_id
         AND display_handle IS DISTINCT FROM v_display_handle;
    END IF;
    RETURN QUERY SELECT v_platform_user_id, false, false;
    RETURN;
  END IF;

  INSERT INTO public.platform_users (display_name)
  VALUES ('')
  RETURNING id INTO v_platform_user_id;

  INSERT INTO public.user_identity (platform_user_id, display_name, updated_at)
  VALUES (v_platform_user_id, '', now());

  INSERT INTO public.user_channel_bindings (
    user_id, channel_code, external_id, display_handle
  ) VALUES (
    v_platform_user_id, p_channel_code, p_external_id, v_display_handle
  );

  INSERT INTO public.user_channel_preferences AS preferences (
    user_id, platform_user_id, channel_code,
    is_enabled_for_messages, is_enabled_for_notifications, updated_at
  ) VALUES (
    v_platform_user_id::text, v_platform_user_id, p_channel_code, true, true, now()
  )
  ON CONFLICT (user_id, channel_code) DO UPDATE SET
    platform_user_id = COALESCE(preferences.platform_user_id, EXCLUDED.platform_user_id),
    is_enabled_for_messages = true,
    is_enabled_for_notifications = true,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT v_platform_user_id, true, true;
END
$_$;


--
-- Name: is_current_patient_self_booking_allowed(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_current_patient_self_booking_allowed() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.self.allowed', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.is_current_patient_self_booking_allowed()'::regprocedure);

  RETURN NOT EXISTS (
    SELECT 1 FROM public.be_patient_booking_profiles p
     WHERE p.organization_id = app.current_org_id()
       AND p.platform_user_id = app.current_patient_user_id()
       AND p.booking_blocked
  );
END
$$;


--
-- Name: is_current_patient_test_account(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_current_patient_test_account() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_identifiers jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_exclusion_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  SELECT setting.value_json -> 'value'
  INTO v_identifiers
  FROM public.system_settings AS setting
  WHERE setting.key = 'test_account_identifiers'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;

  IF v_identifiers IS NULL OR jsonb_typeof(v_identifiers) <> 'object' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.platform_users AS platform_user
    WHERE platform_user.id = v_patient_user_id
      AND (
        (
          platform_user.phone_normalized IS NOT NULL
          AND jsonb_typeof(v_identifiers -> 'phones') = 'array'
          AND (v_identifiers -> 'phones') ? platform_user.phone_normalized
        )
        OR EXISTS (
          SELECT 1
          FROM public.user_channel_bindings AS binding
          WHERE binding.user_id = platform_user.id
            AND (
              (
                binding.channel_code = 'telegram'
                AND jsonb_typeof(v_identifiers -> 'telegramIds') = 'array'
                AND (v_identifiers -> 'telegramIds') ? binding.external_id
              )
              OR (
                binding.channel_code = 'max'
                AND jsonb_typeof(v_identifiers -> 'maxIds') = 'array'
                AND (v_identifiers -> 'maxIds') ? binding.external_id
              )
            )
        )
      )
  );
END
$$;


--
-- Name: is_max_bot_configured(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_max_bot_configured() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.channel.max.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.is_max_bot_configured()'::regprocedure);

  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'max_bot_api_key'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:max_bot_api_key'; END IF;
  RETURN configured;
END
$$;


--
-- Name: is_organization_slug_available(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_organization_slug_available(p_slug text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE available boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_slug_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.specialist-signup.slug-availability', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.is_organization_slug_available(text)'::regprocedure);

  SELECT NOT EXISTS (
    SELECT 1 FROM public.organization_slug_claims AS claim
     WHERE lower(claim.slug) = lower(p_slug)
  ) INTO available;
  RETURN available;
END
$_$;


--
-- Name: is_platform_registration_analytics_user_excluded(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_platform_registration_analytics_user_excluded(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_telemetry_exclusion_owner'::name, ARRAY['app_platform_settings'::name]::name[]);
SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.platform_users AS platform_user
      WHERE platform_user.id = p_user_id
        AND (
          platform_user.role::text IN ('admin', 'doctor')
          OR platform_user.phone_normalized = '+70000000000'
          OR EXISTS (
            SELECT 1
            FROM public.system_settings AS setting
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(setting.value_json->'value'->'phones') = 'array'
                  THEN setting.value_json->'value'->'phones'
                ELSE '[]'::jsonb
              END
            ) AS configured_phone(value)
            WHERE setting.key = 'test_account_identifiers'
              AND setting.scope = 'admin'
              AND setting.organization_id IS NULL
              AND configured_phone.value = platform_user.phone_normalized
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_channel_bindings AS binding
            JOIN public.system_settings AS setting
              ON setting.key = 'test_account_identifiers'
             AND setting.scope = 'admin'
             AND setting.organization_id IS NULL
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE
                WHEN binding.channel_code = 'telegram'
                  AND jsonb_typeof(setting.value_json->'value'->'telegramIds') = 'array'
                  THEN setting.value_json->'value'->'telegramIds'
                WHEN binding.channel_code = 'max'
                  AND jsonb_typeof(setting.value_json->'value'->'maxIds') = 'array'
                  THEN setting.value_json->'value'->'maxIds'
                ELSE '[]'::jsonb
              END
            ) AS configured_external_id(value)
            WHERE binding.user_id = platform_user.id
              AND configured_external_id.value = binding.external_id
          )
        )
    )
  END
$$;


--
-- Name: is_sms_provider_configured(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_sms_provider_configured() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.channel.sms.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.is_sms_provider_configured()'::regprocedure);

  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'smsc_api_key'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:smsc_api_key'; END IF;
  RETURN configured;
END
$$;


--
-- Name: is_smtp_outbound_configured(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_smtp_outbound_configured() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.channel.smtp.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.is_smtp_outbound_configured()'::regprocedure);

  SELECT COALESCE(
    NULLIF(btrim(setting.value_json #>> '{value,host}'), '') IS NOT NULL
    AND NULLIF(btrim(setting.value_json #>> '{value,user}'), '') IS NOT NULL
    AND NULLIF(btrim(setting.value_json #>> '{value,password}'), '') IS NOT NULL
    AND NULLIF(btrim(setting.value_json #>> '{value,from}'), '') IS NOT NULL,
    false
  ) INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'smtp_outbound'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN COALESCE(configured, false);
END
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_staff() RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT current_user = 'app_staff'
    OR pg_has_role(current_user, 'app_staff', 'member')
$$;


--
-- Name: is_telegram_login_configured(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_telegram_login_configured() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.channel.telegram.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.is_telegram_login_configured()'::regprocedure);

  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.app_runtime_settings setting
   WHERE setting.key = 'telegram_login_bot_username'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
     AND setting.audience = 'public';
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:telegram_login_bot_username'; END IF;
  RETURN configured;
END
$$;


--
-- Name: list_active_booking_cities(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_active_booking_cities() RETURNS TABLE(id uuid, code text, title text, sort_order integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_catalog_public_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
SELECT city.id, city.code, city.title, city.sort_order
  FROM public.booking_cities AS city
  WHERE city.is_active = true
  ORDER BY city.sort_order, city.title, city.code
$$;


--
-- Name: list_active_canonical_appointments_by_phone(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_active_canonical_appointments_by_phone(p_phone_normalized text) RETURNS TABLE(id uuid, organization_id uuid, phone_normalized text, start_at timestamp with time zone, status text, attribution_json jsonb, branch_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'booking.integrator-active.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.list_active_canonical_appointments_by_phone(text)'::regprocedure);

  IF p_phone_normalized IS NULL OR btrim(p_phone_normalized) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'normalized phone required';
  END IF;
  RETURN QUERY
    SELECT appointment.id, appointment.organization_id, appointment.phone_normalized,
           appointment.start_at, appointment.status, appointment.attribution_json,
           appointment.branch_id, appointment.created_at, appointment.updated_at,
           appointment.deleted_at
      FROM public.be_appointments appointment
     WHERE appointment.phone_normalized = p_phone_normalized
       AND appointment.deleted_at IS NULL
       AND appointment.start_at >= now()
       AND appointment.status IN (
         'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
         'visit_confirmed', 'charged_to_package', 'manual_review_required'
       )
     ORDER BY appointment.start_at ASC;
END
$_$;


--
-- Name: list_google_calendar_probe_organization_ids(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_google_calendar_probe_organization_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
SELECT setting.organization_id
  FROM public.system_settings AS setting
  WHERE setting.key = 'google_calendar_enabled'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NOT NULL
    AND lower(COALESCE(setting.value_json ->> 'value', '')) IN ('true', '1')
  ORDER BY setting.updated_at DESC, setting.organization_id
$$;


--
-- Name: list_integration_webhook_burst_signals(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_integration_webhook_burst_signals(p_window_minutes integer, p_min_count integer) RETURNS TABLE(source text, error_class text, event_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'health.webhook-errors.aggregate', app.hash_port_typed_args(ARRAY[ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg]), 'app.list_integration_webhook_burst_signals(integer,integer)'::regprocedure);

  IF p_window_minutes IS NULL
    OR p_window_minutes < 1
    OR p_window_minutes > 10080
    OR p_min_count IS NULL
    OR p_min_count < 1
    OR p_min_count > 1000000
  THEN
    RAISE EXCEPTION 'invalid webhook burst window'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT event.source, event.error_class, count(*)
  FROM public.integration_webhook_error_events AS event
  WHERE event.occurred_at >= now() - make_interval(mins => p_window_minutes)
  GROUP BY event.source, event.error_class
  HAVING count(*) >= p_min_count;
END
$_$;


--
-- Name: list_platform_health_failure_archive(text, integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_platform_health_failure_archive(p_probe text, p_limit integer, p_cursor_at timestamp with time zone, p_cursor_id uuid) RETURNS TABLE(id uuid, archived_at timestamp with time zone, archived_by_user_id uuid, health_probe text, source_kind text, source_id text, severity_at_archive text, summary_json jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.health-archive.list', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg]), 'app.list_platform_health_failure_archive(text,integer,timestamp with time zone,uuid)'::regprocedure);

  IF (p_probe IS NOT NULL AND p_probe NOT IN (
      'outgoing_delivery',
      'integrator_push_outbox',
      'projection_outbox',
      'outgoing_reminder_dispatch'
    ))
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 101
    OR ((p_cursor_at IS NULL) <> (p_cursor_id IS NULL))
  THEN
    RAISE EXCEPTION 'invalid platform health archive query'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT
    archive.id,
    archive.archived_at,
    archive.archived_by_user_id,
    archive.health_probe,
    archive.source_kind,
    archive.source_id,
    archive.severity_at_archive,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'reason_code', archive.summary_json -> 'reason_code',
      'reason_ru', archive.summary_json -> 'reason_ru',
      'channel', archive.summary_json -> 'channel',
      'queue_kind', archive.summary_json -> 'queue_kind',
      'event_type', archive.summary_json -> 'event_type',
      'attempts_done', archive.summary_json -> 'attempts_done'
    ))
  FROM public.operator_health_failure_archive AS archive
  WHERE (p_probe IS NULL OR archive.health_probe = p_probe)
    AND (
      p_cursor_at IS NULL
      OR archive.archived_at < p_cursor_at
      OR (archive.archived_at = p_cursor_at AND archive.id < p_cursor_id)
    )
  ORDER BY archive.archived_at DESC, archive.id DESC
  LIMIT p_limit;
END
$_$;


--
-- Name: list_platform_organization_members(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_platform_organization_members(p_organization_id uuid) RETURNS TABLE(membership_id uuid, organization_id uuid, platform_user_id uuid, membership_role text, specialist_id uuid, membership_status text, doctor_screens_disabled boolean, created_at timestamp with time zone, updated_at timestamp with time zone, display_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_org_directory_owner'::name, ARRAY['app_platform_settings'::name]::name[]);
SELECT
    membership.id,
    membership.organization_id,
    membership.platform_user_id,
    membership.role,
    membership.specialist_id,
    membership.status,
    membership.doctor_screens_disabled,
    membership.created_at,
    membership.updated_at,
    NULLIF(btrim(platform_user.display_name), '')
  FROM public.be_organization_members AS membership
  INNER JOIN public.platform_users AS platform_user
    ON platform_user.id = membership.platform_user_id
  WHERE membership.organization_id = p_organization_id
  ORDER BY membership.created_at, membership.platform_user_id
$$;


--
-- Name: list_platform_registration_analytics_events(timestamp with time zone, timestamp with time zone, text, text, text, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_platform_registration_analytics_events(p_start_at timestamp with time zone, p_end_exclusive timestamp with time zone, p_event_type text, p_error_class text, p_auth_method text, p_limit integer, p_offset integer) RETURNS TABLE(id uuid, occurred_at timestamp with time zone, event_type text, entry_channel text, metadata jsonb, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_exclusion_owner'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'analytics.registration-events.read', app.hash_port_typed_args(ARRAY[ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($6))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($7))::app.port_typed_arg]), 'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)'::regprocedure);

  IF p_start_at IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive <= p_start_at THEN
    RAISE EXCEPTION 'registration_events_range_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NOT NULL AND p_event_type NOT IN (
    'auth_register_attempt', 'auth_register_success', 'auth_register_failure'
  ) THEN
    RAISE EXCEPTION 'registration_events_type_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_error_class IS NOT NULL AND p_error_class NOT IN ('user', 'system') THEN
    RAISE EXCEPTION 'registration_events_error_class_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_auth_method IS NOT NULL AND (btrim(p_auth_method) = '' OR length(p_auth_method) > 64) THEN
    RAISE EXCEPTION 'registration_events_auth_method_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 200 OR p_offset < 0 THEN
    RAISE EXCEPTION 'registration_events_page_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    event.id,
    event.occurred_at,
    event.event_type,
    event.entry_channel,
    COALESCE(event.metadata, '{}'::jsonb),
    count(*) OVER () AS total_count
  FROM public.product_analytics_events_recent AS event
  WHERE event.occurred_at >= p_start_at
    AND event.occurred_at < p_end_exclusive
    AND event.event_type IN (
      'auth_register_attempt', 'auth_register_success', 'auth_register_failure'
    )
    AND NOT app.is_platform_registration_analytics_user_excluded(event.user_id)
    AND (p_event_type IS NULL OR event.event_type = p_event_type)
    AND (p_error_class IS NULL OR event.metadata->>'errorClass' = p_error_class)
    AND (p_auth_method IS NULL OR event.metadata->>'authMethod' = p_auth_method)
  ORDER BY event.occurred_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END
$_$;


--
-- Name: list_scheduler_reminder_organization_ids(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_scheduler_reminder_organization_ids() RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.status IN ('planned', 'queued')
      AND COALESCE(occurrence.organization_id, rule.organization_id) IS NOT NULL
  ) AS candidate
  ORDER BY candidate.organization_id;
END
$$;


--
-- Name: list_web_push_reminder_organization_ids(timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.list_web_push_reminder_organization_ids(p_now timestamp with time zone) RETURNS TABLE(organization_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
SELECT DISTINCT rr.organization_id
  FROM public.reminder_rules rr
  JOIN public.platform_users pu ON pu.id = rr.platform_user_id
  WHERE rr.integrator_user_id IS NULL
    AND rr.platform_user_id IS NOT NULL
    AND rr.organization_id IS NOT NULL
    AND rr.is_enabled = true
    AND (pu.reminder_muted_until IS NULL OR pu.reminder_muted_until <= p_now)
  ORDER BY rr.organization_id
$$;


--
-- Name: lookup_patient_invite_continuation(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.lookup_patient_invite_continuation(p_continuation_hash text) RETURNS TABLE(ok boolean, code text, organization_title text, recipient_hint text, invite_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_organization_title text;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
  v_portal_activated_via text;
  v_hint text;
  v_reopen boolean := false;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    IF v_invite.recipient_binding = 'unbound_email_claim'
       AND v_invite.invited_email_normalized IS NULL
       AND v_invite.accepted_by_platform_user_id = v_invite.patient_user_id
       AND v_invite.accepted_via = 'email_otp'
       AND v_invite.proof_verified_at IS NOT NULL
       AND v_invite.proof_code_hash IS NOT NULL
       AND v_invite.proof_expires_at IS NOT NULL
       AND v_invite.proof_expires_at > now() THEN
      v_reopen := true;
    ELSE
      RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status = 'expired'
     OR v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    IF v_invite.status = 'pending' AND v_invite.expires_at <= now() THEN
      UPDATE public.patient_invites SET status = 'expired', updated_at = now() WHERE id = v_invite.id;
    END IF;
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at, enrollment.portal_activated_via
  INTO v_enrollment_status, v_portal_activated_at, v_portal_activated_via
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1;
  IF v_reopen THEN
    IF v_enrollment_status <> 'active'
       OR v_portal_activated_at IS NULL
       OR v_portal_activated_via <> 'patient_invite_email_otp' THEN
      RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  ELSIF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT organization.title INTO v_organization_title
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  v_hint := CASE
    WHEN v_invite.recipient_binding = 'bound_email'
      AND v_invite.invited_email_normalized IS NOT NULL
      AND position('@' IN v_invite.invited_email_normalized) > 1
      THEN left(v_invite.invited_email_normalized, 1)
        || '***@' || split_part(v_invite.invited_email_normalized, '@', 2)
    ELSE NULL
  END;
  RETURN QUERY SELECT true, NULL::text, v_organization_title, v_hint, v_invite.expires_at;
END
$$;


--
-- Name: lookup_pending_org_invite(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.lookup_pending_org_invite(p_token_hash text) RETURNS TABLE(id uuid, organization_id uuid, invited_email text, invited_role text, status text, expires_at timestamp with time zone, created_by_platform_user_id uuid, accepted_by_platform_user_id uuid, accepted_membership_id uuid, created_at timestamp with time zone, accepted_at timestamp with time zone, organization_title text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_org_invite_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    i.id,
    i.organization_id,
    i.invited_email,
    i.invited_role,
    i.status,
    i.expires_at,
    i.created_by_platform_user_id,
    i.accepted_by_platform_user_id,
    i.accepted_membership_id,
    i.created_at,
    i.accepted_at,
    o.title AS organization_title
  FROM public.organization_member_invites AS i
  LEFT JOIN public.be_organizations AS o ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1
$$;


--
-- Name: mark_operator_incident_alert_sent(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.mark_operator_incident_alert_sent(p_incident_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-mark', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.mark_operator_incident_alert_sent(uuid)'::regprocedure);

  UPDATE public.operator_incidents AS incident
  SET alert_sent_at = COALESCE(incident.alert_sent_at, clock_timestamp())
  WHERE incident.id = p_incident_id;
  RETURN FOUND;
END
$_$;


--
-- Name: mark_patient_reminder_occurrence_queued(text, integer, text[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.mark_patient_reminder_occurrence_queued(p_occurrence_id text, p_generation integer, p_event_ids text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  occurrence integrator.user_reminder_occurrences%ROWTYPE;
  caller_organization_id uuid;
  invalid_count integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_staff'::name]::name[]);

  IF COALESCE(array_length(p_event_ids, 1), 0) = 0 THEN RETURN false; END IF;
  SELECT * INTO occurrence
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.id = p_occurrence_id
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
     OR delivery.payload_json ->> 'occurrenceId' IS DISTINCT FROM occurrence.id
     OR (delivery.payload_json ->> 'deliveryGeneration')::integer <> occurrence.delivery_generation
     OR delivery.payload_json ->> 'channel' IS DISTINCT FROM delivery.channel
     OR delivery.payload_json ->> 'topicCode' IS DISTINCT FROM (
       SELECT rule.notification_topic_code
       FROM public.reminder_rules AS rule
       WHERE rule.integrator_rule_id = occurrence.rule_id
         AND rule.organization_id = occurrence.organization_id
         AND rule.platform_user_id = occurrence.platform_user_id
     )
     OR delivery.event_id IS DISTINCT FROM concat(
       'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', delivery.channel
     );
  IF invalid_count <> 0 THEN RETURN false; END IF;

  UPDATE public.outgoing_delivery_queue AS delivery
  SET payload_json = jsonb_set(
        delivery.payload_json,
        '{materializationFingerprint}',
        to_jsonb(app.patient_reminder_materialization_fingerprint(occurrence.id, delivery.channel)),
        true
      ),
      updated_at = statement_timestamp()
  WHERE delivery.event_id = ANY(p_event_ids);
  IF EXISTS (
    SELECT 1 FROM public.outgoing_delivery_queue AS delivery
    WHERE delivery.event_id = ANY(p_event_ids)
      AND COALESCE(delivery.payload_json ->> 'materializationFingerprint', '') !~ '^[0-9a-f]{32}$'
  ) THEN RETURN false; END IF;

  UPDATE integrator.user_reminder_occurrences AS candidate
  SET status = 'queued', queued_at = statement_timestamp(), updated_at = statement_timestamp()
  WHERE candidate.id = occurrence.id
    AND candidate.delivery_generation = occurrence.delivery_generation
    AND candidate.status IN ('planned', 'queued');
  RETURN FOUND;
END
$_$;


--
-- Name: open_or_touch_operator_incident(text, text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.open_or_touch_operator_incident(p_dedup_key text, p_direction text, p_integration text, p_error_class text, p_error_detail text) RETURNS TABLE(id uuid, occurrence_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_delivery_worker'::name, 'app_operational_scheduler'::name]::name[]);

  RETURN QUERY
  INSERT INTO public.operator_incidents (dedup_key, direction, integration, error_class, error_detail)
  VALUES (p_dedup_key, p_direction, p_integration, p_error_class, p_error_detail)
  ON CONFLICT (dedup_key) WHERE resolved_at IS NULL
  DO UPDATE SET
    last_seen_at = now(),
    occurrence_count = public.operator_incidents.occurrence_count + 1,
    error_detail = coalesce(excluded.error_detail, public.operator_incidents.error_detail)
  RETURNING public.operator_incidents.id, public.operator_incidents.occurrence_count;
END
$$;


--
-- Name: open_or_touch_operator_probe_incident(text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.open_or_touch_operator_probe_incident(p_integration text, p_error_class text, p_error_detail text) RETURNS TABLE(id uuid, occurrence_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);

  IF p_integration IS NULL
    OR p_error_class IS NULL
    OR (p_integration, p_error_class) NOT IN (
      ('max', 'max_probe_failed'),
      ('telegram', 'telegram_probe_failed'),
      ('google_calendar', 'google_calendar_probe_failed')
    )
    OR length(COALESCE(p_error_detail, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator probe incident input'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT incident.id, incident.occurrence_count
  FROM app.open_or_touch_operator_incident(
    'outbound:' || p_integration || ':' || p_error_class,
    'outbound',
    p_integration,
    p_error_class,
    NULLIF(p_error_detail, '')
  ) AS incident;
END
$$;


--
-- Name: operator_incident_alert_already_sent(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.operator_incident_alert_already_sent(p_incident_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$SELECT app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.incident-alert-status', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.operator_incident_alert_already_sent(uuid)'::regprocedure);
SELECT EXISTS (
    SELECT 1
    FROM public.operator_incidents AS incident
    WHERE incident.id = p_incident_id
      AND incident.alert_sent_at IS NOT NULL
  )
$_$;


--
-- Name: passkey_complete_authentication(uuid, text, bigint, bigint, text, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_complete_authentication(p_challenge_id uuid, p_credential_id text, p_previous_counter bigint, p_new_counter bigint, p_device_type text, p_backed_up boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_passkey_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.passkey.authentication.complete', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($6))::app.port_typed_arg]), 'app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)'::regprocedure);

  UPDATE public.user_passkey_challenges AS stored
     SET consumed_at = statement_timestamp()
   WHERE stored.id = p_challenge_id
     AND stored.purpose = 'authentication'
     AND stored.consumed_at IS NULL
     AND stored.expires_at >= statement_timestamp();
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.user_passkey_credentials AS credential
     SET counter = p_new_counter,
         device_type = p_device_type,
         backed_up = p_backed_up,
         last_used_at = statement_timestamp()
   WHERE credential.credential_id = p_credential_id
     AND credential.counter = p_previous_counter
  RETURNING credential.user_id INTO v_user_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'passkey_credential_state_changed'; END IF;
  RETURN v_user_id;
END
$_$;


--
-- Name: passkey_complete_registration(uuid, uuid, text, text, bigint, jsonb, text, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_complete_registration(p_challenge_id uuid, p_user_id uuid, p_credential_id text, p_public_key text, p_counter bigint, p_transports jsonb, p_device_type text, p_backed_up boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_passkey_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_user_id IS NULL
    OR p_user_id IS DISTINCT FROM v_user_id
    OR p_credential_id !~ '^[A-Za-z0-9_-]{16,1024}$'
    OR p_public_key !~ '^[A-Za-z0-9_-]{16,8192}$'
    OR p_counter < 0
    OR jsonb_typeof(p_transports) <> 'array'
    OR p_device_type NOT IN ('singleDevice', 'multiDevice')
  THEN
    RETURN false;
  END IF;

  UPDATE public.user_passkey_challenges AS challenge
  SET consumed_at = statement_timestamp()
  WHERE challenge.id = p_challenge_id
    AND challenge.purpose = 'registration'
    AND challenge.user_id = v_user_id
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at >= statement_timestamp();
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_passkey_credentials (
    credential_id,
    user_id,
    public_key,
    counter,
    transports,
    device_type,
    backed_up
  )
  VALUES (
    p_credential_id,
    v_user_id,
    p_public_key,
    p_counter,
    p_transports,
    p_device_type,
    p_backed_up
  );
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END
$_$;


--
-- Name: passkey_delete_current_credential(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_delete_current_credential(p_credential_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_passkey_owner'::name, ARRAY['app_patient'::name]::name[]);

  DELETE FROM public.user_passkey_credentials AS credential
  WHERE credential.credential_id = p_credential_id
    AND credential.user_id = app.current_patient_user_id();
  RETURN FOUND;
END
$$;


--
-- Name: passkey_get_or_create_account(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_get_or_create_account(p_user_id uuid, p_candidate_handle text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_user_id uuid := app.current_patient_user_id();
  v_handle text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_passkey_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_user_id IS NULL
    OR p_user_id IS DISTINCT FROM v_user_id
    OR p_candidate_handle !~ '^[A-Za-z0-9_-]{43}$'
  THEN
    RAISE EXCEPTION 'passkey_patient_principal_required';
  END IF;

  INSERT INTO public.user_passkey_accounts (user_id, user_handle)
  VALUES (v_user_id, p_candidate_handle)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT account.user_handle
  INTO v_handle
  FROM public.user_passkey_accounts AS account
  WHERE account.user_id = v_user_id;
  RETURN v_handle;
END
$_$;


--
-- Name: passkey_issue_challenge(uuid, text, uuid, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_issue_challenge(p_id uuid, p_purpose text, p_user_id uuid, p_challenge text, p_expected_origin text, p_rp_id text, p_expires_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner',
    CASE WHEN p_purpose = 'registration' THEN 'app_patient'::name ELSE 'app_pre_session'::name END,
    CASE WHEN p_purpose = 'registration' THEN 'patient'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    CASE WHEN p_purpose = 'registration' THEN 'auth.passkey.registration-challenge.issue'
         ELSE 'auth.passkey.challenge.issue' END,
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_challenge))::app.port_typed_arg,
      ROW('text@1', textsend(p_expected_origin))::app.port_typed_arg,
      ROW('text@1', textsend(p_rp_id))::app.port_typed_arg,
      ROW('timestamptz@1', timestamptz_send(p_expires_at))::app.port_typed_arg
    ]), 'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)'::regprocedure
  );

  IF p_purpose NOT IN ('authentication', 'registration')
    OR p_id IS NULL
    OR p_challenge !~ '^[A-Za-z0-9_-]{32,1024}$'
    OR p_expected_origin IS NULL
    OR p_rp_id IS NULL
    OR p_expires_at <= statement_timestamp()
    OR p_expires_at > statement_timestamp() + interval '10 minutes'
    OR (p_purpose = 'registration' AND (
      p_user_id IS NULL OR p_user_id IS DISTINCT FROM app.current_patient_user_id()
    ))
    OR (p_purpose = 'authentication' AND p_user_id IS NOT NULL)
  THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_passkey_challenges
   WHERE expires_at < statement_timestamp() - interval '1 day';
  INSERT INTO public.user_passkey_challenges (
    id, purpose, user_id, challenge, expected_origin, rp_id, expires_at
  ) VALUES (
    p_id, p_purpose, p_user_id, p_challenge, p_expected_origin, p_rp_id, p_expires_at
  );
  RETURN true;
END
$_$;


--
-- Name: passkey_list_current_credentials(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_list_current_credentials() RETURNS TABLE(credential_id text, transports jsonb, device_type text, backed_up boolean, created_at timestamp with time zone, last_used_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_passkey_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    credential.credential_id,
    credential.transports,
    credential.device_type,
    credential.backed_up,
    credential.created_at,
    credential.last_used_at
  FROM public.user_passkey_credentials AS credential
  WHERE credential.user_id = app.current_patient_user_id()
  ORDER BY credential.created_at DESC
$$;


--
-- Name: passkey_list_current_exclusions(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_list_current_exclusions() RETURNS TABLE(credential_id text, transports jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_passkey_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT credential.credential_id, credential.transports
  FROM public.user_passkey_credentials AS credential
  WHERE credential.user_id = app.current_patient_user_id()
$$;


--
-- Name: passkey_read_challenge(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_read_challenge(p_id uuid, p_purpose text) RETURNS TABLE(user_id uuid, challenge text, expected_origin text, rp_id text, expires_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner',
    CASE WHEN p_purpose = 'registration' THEN 'app_patient'::name ELSE 'app_pre_session'::name END,
    CASE WHEN p_purpose = 'registration' THEN 'patient'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    CASE WHEN p_purpose = 'registration' THEN 'auth.passkey.registration-challenge.read'
         ELSE 'auth.passkey.challenge.read' END,
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg
    ]), 'app.passkey_read_challenge(uuid,text)'::regprocedure
  );

  IF p_purpose NOT IN ('authentication', 'registration') THEN RETURN; END IF;
  RETURN QUERY
  SELECT stored.user_id, stored.challenge, stored.expected_origin, stored.rp_id, stored.expires_at
    FROM public.user_passkey_challenges AS stored
   WHERE stored.id = p_id
     AND stored.purpose = p_purpose
     AND stored.consumed_at IS NULL
     AND stored.expires_at >= statement_timestamp();
END
$$;


--
-- Name: passkey_read_credential(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.passkey_read_credential(p_credential_id text) RETURNS TABLE(credential_id text, user_id uuid, user_handle text, public_key text, counter bigint, transports jsonb, device_type text, backed_up boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_passkey_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.passkey.credential.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.passkey_read_credential(text)'::regprocedure);

  RETURN QUERY
  SELECT credential.credential_id, credential.user_id, account.user_handle, credential.public_key,
         credential.counter, credential.transports, credential.device_type, credential.backed_up
    FROM public.user_passkey_credentials AS credential
    JOIN public.user_passkey_accounts AS account ON account.user_id = credential.user_id
   WHERE p_credential_id ~ '^[A-Za-z0-9_-]{16,1024}$'
     AND credential.credential_id = p_credential_id
   LIMIT 1;
END
$_$;


--
-- Name: password_credentials_replace_self(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_credentials_replace_self(p_email_normalized text, p_password_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT 'password-email:v1:' || encode(app_ext.digest(users.email_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  WHERE users.id = v_user_id
    AND users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL;

  IF v_identifier_key IS NULL THEN
    RETURN false;
  END IF;

  -- Keep the same identifier-first order used by acquire/complete.
  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  PERFORM 1
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  UPDATE public.user_password_credentials AS credentials
  SET password_hash = p_password_hash,
      failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      updated_at = statement_timestamp()
  WHERE credentials.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = statement_timestamp()
  WHERE state.identifier_key = v_identifier_key;
  RETURN true;
END
$$;


--
-- Name: password_credentials_upsert_self(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_credentials_upsert_self(p_email_normalized text, p_password_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT 'password-email:v1:' || encode(app_ext.digest(users.email_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  WHERE users.id = v_user_id
    AND users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL;

  IF v_identifier_key IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  PERFORM 1
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  INSERT INTO public.user_password_credentials (
    user_id,
    password_hash,
    failed_attempts,
    next_allowed_at,
    locked_until,
    verification_lease_token,
    verification_lease_until,
    updated_at
  )
  VALUES (
    v_user_id,
    p_password_hash,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    statement_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      updated_at = statement_timestamp();

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = statement_timestamp()
  WHERE state.identifier_key = v_identifier_key;
  RETURN true;
END
$$;


--
-- Name: password_login_acquire(text, text, uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_acquire(p_email_normalized text, p_identifier_key text, p_altcha_challenge_id uuid DEFAULT NULL::uuid, p_altcha_challenge_digest text DEFAULT NULL::text) RETURNS TABLE(status text, lease_token uuid, password_hash text, user_id uuid, email_verified boolean, retry_after_seconds integer, captcha_required boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.acquire', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.password_login_acquire(text,text,uuid,text)'::regprocedure);

  RETURN QUERY
  SELECT * FROM app.password_login_acquire_impl(
    p_email_normalized, p_identifier_key, p_altcha_challenge_id, p_altcha_challenge_digest
  );
END
$_$;


--
-- Name: password_login_acquire_impl(text, text, uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_acquire_impl(p_email_normalized text, p_identifier_key text, p_altcha_challenge_id uuid DEFAULT NULL::uuid, p_altcha_challenge_digest text DEFAULT NULL::text) RETURNS TABLE(status text, lease_token uuid, password_hash text, user_id uuid, email_verified boolean, retry_after_seconds integer, captcha_required boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_identifier public.password_login_identifier_protection%ROWTYPE;
  v_credential public.user_password_credentials%ROWTYPE;
  v_user_id uuid;
  v_email_verified boolean;
  v_attempts integer;
  v_locked_until timestamptz;
  v_next_allowed_at timestamptz;
  v_lease_until timestamptz;
  v_challenge public.password_altcha_challenges%ROWTYPE;
  v_expected_identifier_key text;
BEGIN
  IF p_email_normalized IS NULL
    OR length(p_email_normalized) NOT BETWEEN 3 AND 320
    OR lower(btrim(p_email_normalized)) IS DISTINCT FROM p_email_normalized
    OR p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    OR p_identifier_key IS NULL
    OR length(p_identifier_key) <> 82
    OR p_identifier_key !~ '^password-email:v1:[0-9a-f]{64}$'
  THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, false;
    RETURN;
  END IF;

  v_expected_identifier_key :=
    'password-email:v1:' || encode(app_ext.digest(p_email_normalized, 'sha256'), 'hex');
  IF p_identifier_key IS DISTINCT FROM v_expected_identifier_key THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, false;
    RETURN;
  END IF;

  -- Public identifiers are attacker-controlled. One concurrent caller performs two bounded,
  -- skip-locked retention batches; challenges survive through expiry and active protection state
  -- is never pruned.
  IF pg_try_advisory_xact_lock(
    hashtextextended('password_login_retention_v1', 0)
  ) THEN
    WITH expired AS (
      SELECT challenge.ctid
      FROM public.password_altcha_challenges AS challenge
      WHERE challenge.expires_at <= v_now
      ORDER BY challenge.expires_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.password_altcha_challenges AS challenge
    USING expired
    WHERE challenge.ctid = expired.ctid;

    WITH stale AS (
      SELECT state.ctid
      FROM public.password_login_identifier_protection AS state
      WHERE state.updated_at < v_now - interval '30 days'
        AND (state.next_allowed_at IS NULL OR state.next_allowed_at <= v_now)
        AND (state.locked_until IS NULL OR state.locked_until <= v_now)
        AND (state.verification_lease_until IS NULL OR state.verification_lease_until <= v_now)
        AND NOT EXISTS (
          SELECT 1
          FROM public.password_altcha_challenges AS challenge
          WHERE challenge.identifier_key = state.identifier_key
            AND challenge.expires_at > v_now
        )
      ORDER BY state.updated_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.password_login_identifier_protection AS state
    USING stale
    WHERE state.ctid = stale.ctid;
  END IF;

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (p_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  -- Identifier is always locked first; complete/reset use the same order.
  SELECT state.*
  INTO v_identifier
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = p_identifier_key
  FOR UPDATE;

  SELECT credentials.user_id, users.email_verified_at IS NOT NULL
  INTO v_user_id, v_email_verified
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  WHERE users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT credentials.*
    INTO v_credential
    FROM public.user_password_credentials AS credentials
    WHERE credentials.user_id = v_user_id
    FOR UPDATE;
  END IF;

  IF v_identifier.locked_until IS NOT NULL AND v_identifier.locked_until <= v_now THEN
    UPDATE public.password_login_identifier_protection AS state
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL,
        leased_user_id = NULL,
        updated_at = v_now
    WHERE state.identifier_key = p_identifier_key;
    v_identifier.failed_attempts := 0;
    v_identifier.next_allowed_at := NULL;
    v_identifier.locked_until := NULL;
    v_identifier.verification_lease_token := NULL;
    v_identifier.verification_lease_until := NULL;
  END IF;

  IF v_user_id IS NOT NULL
    AND v_credential.locked_until IS NOT NULL
    AND v_credential.locked_until <= v_now
  THEN
    UPDATE public.user_password_credentials AS credentials
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL
    WHERE credentials.user_id = v_user_id;
    v_credential.failed_attempts := 0;
    v_credential.next_allowed_at := NULL;
    v_credential.locked_until := NULL;
    v_credential.verification_lease_token := NULL;
    v_credential.verification_lease_until := NULL;
  END IF;

  v_attempts := greatest(
    v_identifier.failed_attempts,
    coalesce(v_credential.failed_attempts, 0)
  );
  v_locked_until := greatest(v_identifier.locked_until, v_credential.locked_until);
  v_next_allowed_at := greatest(v_identifier.next_allowed_at, v_credential.next_allowed_at);
  v_lease_until := greatest(
    v_identifier.verification_lease_until,
    v_credential.verification_lease_until
  );

  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY SELECT
      'locked'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      greatest(1, ceil(extract(epoch FROM v_locked_until - v_now))::integer),
      true;
    RETURN;
  END IF;

  IF v_next_allowed_at IS NOT NULL AND v_next_allowed_at > v_now THEN
    RETURN QUERY SELECT
      'cooldown'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      greatest(1, ceil(extract(epoch FROM v_next_allowed_at - v_now))::integer),
      v_attempts >= 5;
    RETURN;
  END IF;

  IF v_lease_until IS NOT NULL AND v_lease_until > v_now THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid, NULL::text, NULL::uuid, false, 1, v_attempts >= 5;
    RETURN;
  END IF;

  IF v_attempts >= 5 THEN
    IF p_altcha_challenge_id IS NULL OR p_altcha_challenge_digest IS NULL THEN
      RETURN QUERY SELECT 'challenge_required'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, true;
      RETURN;
    END IF;

    SELECT challenge.*
    INTO v_challenge
    FROM public.password_altcha_challenges AS challenge
    WHERE challenge.challenge_id = p_altcha_challenge_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_challenge.identifier_key IS DISTINCT FROM p_identifier_key
      OR v_challenge.purpose IS DISTINCT FROM 'password_login'
      OR v_challenge.challenge_digest IS DISTINCT FROM p_altcha_challenge_digest
      OR v_challenge.expires_at <= v_now
      OR v_challenge.consumed_at IS NOT NULL
    THEN
      RETURN QUERY SELECT 'challenge_required'::text, NULL::uuid, NULL::text, NULL::uuid, false, 0, true;
      RETURN;
    END IF;

    UPDATE public.password_altcha_challenges AS challenge
    SET consumed_at = v_now
    WHERE challenge.challenge_id = p_altcha_challenge_id;
  END IF;

  lease_token := gen_random_uuid();
  v_lease_until := v_now + interval '30 seconds';

  UPDATE public.password_login_identifier_protection AS state
  SET verification_lease_token = lease_token,
      verification_lease_until = v_lease_until,
      leased_user_id = v_user_id,
      updated_at = v_now
  WHERE state.identifier_key = p_identifier_key;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.user_password_credentials AS credentials
    SET verification_lease_token = lease_token,
        verification_lease_until = v_lease_until
    WHERE credentials.user_id = v_user_id;
  END IF;

  RETURN QUERY SELECT
    'acquired'::text,
    lease_token,
    coalesce(v_credential.password_hash, NULL::text),
    v_user_id,
    coalesce(v_email_verified, false),
    0,
    v_attempts >= 5;
END
$_$;


--
-- Name: password_login_complete(uuid, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_complete(p_lease_token uuid, p_password_verified boolean) RETURNS TABLE(accepted boolean, succeeded boolean, user_id uuid, email_verified boolean, attempts integer, retry_after_seconds integer, captcha_required boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.complete', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($2))::app.port_typed_arg]), 'app.password_login_complete(uuid,boolean)'::regprocedure);

  RETURN QUERY
  SELECT * FROM app.password_login_complete_impl(p_lease_token, p_password_verified);
END
$_$;


--
-- Name: password_login_complete_impl(uuid, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_complete_impl(p_lease_token uuid, p_password_verified boolean) RETURNS TABLE(accepted boolean, succeeded boolean, user_id uuid, email_verified boolean, attempts integer, retry_after_seconds integer, captcha_required boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_identifier public.password_login_identifier_protection%ROWTYPE;
  v_credential public.user_password_credentials%ROWTYPE;
  v_email_verified boolean := false;
  v_attempts integer;
  v_next_allowed_at timestamptz;
  v_locked_until timestamptz;
BEGIN
  SELECT state.*
  INTO v_identifier
  FROM public.password_login_identifier_protection AS state
  WHERE state.verification_lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND
    OR v_identifier.verification_lease_until IS NULL
    OR v_identifier.verification_lease_until <= v_now
  THEN
    RETURN QUERY SELECT false, false, NULL::uuid, false, 0, 0, false;
    RETURN;
  END IF;

  IF v_identifier.leased_user_id IS NOT NULL THEN
    SELECT credentials.*
    INTO v_credential
    FROM public.user_password_credentials AS credentials
    WHERE credentials.user_id = v_identifier.leased_user_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_credential.verification_lease_token IS DISTINCT FROM p_lease_token
      OR v_credential.verification_lease_until IS NULL
      OR v_credential.verification_lease_until <= v_now
    THEN
      RETURN QUERY SELECT false, false, NULL::uuid, false, 0, 0, false;
      RETURN;
    END IF;

    SELECT users.email_verified_at IS NOT NULL
    INTO v_email_verified
    FROM public.platform_users AS users
    WHERE users.id = v_identifier.leased_user_id
      AND users.merged_into_id IS NULL;
  END IF;

  IF p_password_verified AND v_identifier.leased_user_id IS NOT NULL THEN
    UPDATE public.password_login_identifier_protection AS state
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL,
        leased_user_id = NULL,
        updated_at = v_now
    WHERE state.identifier_key = v_identifier.identifier_key;

    UPDATE public.user_password_credentials AS credentials
    SET failed_attempts = 0,
        next_allowed_at = NULL,
        locked_until = NULL,
        verification_lease_token = NULL,
        verification_lease_until = NULL
    WHERE credentials.user_id = v_identifier.leased_user_id;

    RETURN QUERY SELECT
      true,
      true,
      v_identifier.leased_user_id,
      coalesce(v_email_verified, false),
      0,
      0,
      false;
    RETURN;
  END IF;

  v_attempts := greatest(
    v_identifier.failed_attempts,
    coalesce(v_credential.failed_attempts, 0)
  ) + 1;
  v_next_allowed_at := CASE
    WHEN v_attempts BETWEEN 5 AND 9
      THEN v_now + make_interval(secs => (30 * power(2, v_attempts - 5))::double precision)
    ELSE NULL
  END;
  v_locked_until := CASE
    WHEN v_attempts >= 10 THEN v_now + interval '15 minutes'
    ELSE NULL
  END;

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = least(v_attempts, 10),
      next_allowed_at = v_next_allowed_at,
      locked_until = v_locked_until,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = v_now
  WHERE state.identifier_key = v_identifier.identifier_key;

  IF v_identifier.leased_user_id IS NOT NULL THEN
    UPDATE public.user_password_credentials AS credentials
    SET failed_attempts = least(v_attempts, 10),
        next_allowed_at = v_next_allowed_at,
        locked_until = v_locked_until,
        verification_lease_token = NULL,
        verification_lease_until = NULL
    WHERE credentials.user_id = v_identifier.leased_user_id;
  END IF;

  RETURN QUERY SELECT
    true,
    false,
    NULL::uuid,
    false,
    least(v_attempts, 10),
    CASE
      WHEN v_locked_until IS NOT NULL THEN 900
      WHEN v_next_allowed_at IS NOT NULL
        THEN greatest(1, ceil(extract(epoch FROM v_next_allowed_at - v_now))::integer)
      ELSE 0
    END,
    v_attempts >= 5;
END
$$;


--
-- Name: password_login_issue_altcha_challenge(text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_issue_altcha_challenge(p_email_normalized text, p_challenge_id uuid, p_challenge_digest text, p_expires_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-issue', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg]), 'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure);

  RETURN app.password_login_issue_altcha_challenge_impl(
    p_email_normalized, p_challenge_id, p_challenge_digest, p_expires_at
  );
END
$_$;


--
-- Name: password_login_issue_altcha_challenge_impl(text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_issue_altcha_challenge_impl(p_email_normalized text, p_challenge_id uuid, p_challenge_digest text, p_expires_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_state public.password_login_identifier_protection%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_live_count integer;
  v_identifier_key text;
  v_account_attempts integer := 0;
  v_account_locked_until timestamptz;
BEGIN
  IF p_email_normalized IS NULL
    OR length(p_email_normalized) NOT BETWEEN 3 AND 320
    OR lower(btrim(p_email_normalized)) IS DISTINCT FROM p_email_normalized
    OR p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    OR p_challenge_id IS NULL
    OR p_challenge_digest IS NULL
    OR p_challenge_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '10 minutes'
  THEN
    RETURN false;
  END IF;

  v_identifier_key :=
    'password-email:v1:' || encode(app_ext.digest(p_email_normalized, 'sha256'), 'hex');

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  SELECT state.*
  INTO v_state
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  SELECT credentials.failed_attempts, credentials.locked_until
  INTO v_account_attempts, v_account_locked_until
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  WHERE users.email_normalized = p_email_normalized
    AND users.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE OF credentials;

  IF (v_state.locked_until IS NOT NULL AND v_state.locked_until > v_now)
    OR (v_account_locked_until IS NOT NULL AND v_account_locked_until > v_now)
  THEN
    RETURN false;
  END IF;
  IF greatest(v_state.failed_attempts, coalesce(v_account_attempts, 0)) < 5 THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer
  INTO v_live_count
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.identifier_key = v_identifier_key
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at > v_now;

  IF v_live_count >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_altcha_challenges (
    challenge_id,
    identifier_key,
    purpose,
    challenge_digest,
    expires_at
  )
  VALUES (
    p_challenge_id,
    v_identifier_key,
    'password_login',
    p_challenge_digest,
    p_expires_at
  );

  RETURN true;
END
$_$;


--
-- Name: password_login_read_altcha_secret(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_read_altcha_secret() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.altcha-secret', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.password_login_read_altcha_secret()'::regprocedure);

  RETURN app.password_login_read_altcha_secret_impl();
END
$$;


--
-- Name: password_login_read_altcha_secret_impl(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.password_login_read_altcha_secret_impl() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT NULLIF(settings.value_json ->> 'value', '')
  FROM public.system_settings AS settings
  WHERE settings.key = 'auth_altcha_hmac_secret'
    AND settings.scope = 'admin'
    AND settings.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: patient_cancel_pending_reminder_occurrences(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_cancel_pending_reminder_occurrences(p_rule_id text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_org_id uuid := app.current_org_id();
  v_deleted integer := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_patient_user_id IS NULL OR v_org_id IS NULL THEN RETURN 0; END IF;
  DELETE FROM integrator.user_reminder_occurrences AS occurrence
  USING public.reminder_rules AS rule
  WHERE occurrence.rule_id = p_rule_id
    AND occurrence.rule_id = rule.integrator_rule_id
    AND occurrence.platform_user_id = v_patient_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.platform_user_id = v_patient_user_id
    AND rule.organization_id = v_org_id
    AND occurrence.status IN ('planned', 'queued');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;


--
-- Name: patient_disable_reminder_messenger_topic(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_disable_reminder_messenger_topic(p_integrator_occurrence_id text, p_messenger_channel text) RETURNS TABLE(persisted boolean, paragraphs jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_topic_code text;
  v_label text;
  v_active_labels text[] := ARRAY[]::text[];
  v_list_csv text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_messenger_channel NOT IN ('telegram', 'max')
     OR v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;
  v_label := CASE p_messenger_channel WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END;

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
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(
      NULLIF(btrim(rule.notification_topic_code), ''),
      CASE
        WHEN rule.category = 'water' THEN NULL
        WHEN lower(COALESCE(rule.reminder_intent, '')) = 'warmup' THEN 'warmup_reminders'
        WHEN lower(COALESCE(rule.reminder_intent, '')) IN ('exercises', 'stretch', 'generic') THEN 'training_reminders'
        WHEN rule.linked_object_type IN ('rehab_program', 'treatment_program_item', 'lfk_complex', 'content_page', 'content_section') THEN 'training_reminders'
        WHEN btrim(occurrence.category) = 'warmup' THEN 'warmup_reminders'
        WHEN btrim(occurrence.category) IN ('exercise', 'breathing') THEN 'training_reminders'
        ELSE NULL
      END
    )
  INTO v_topic_code
  FROM public.reminder_occurrence_history AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.integrator_rule_id
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.integrator_user_id = v_integrator_user_id
    AND occurrence.organization_id = v_org_id
    AND rule.organization_id = v_org_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_topic_code IS NULL THEN
    persisted := false;
    paragraphs := jsonb_build_array(
      format('Хорошо — для этого типа напоминаний канал (%s) пока не настраивается через темы уведомлений.', v_label),
      'Откройте «Настроить каналы уведомлений» ниже, если хотите управлять напоминаниями в приложении.',
      'Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.'
    );
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.user_notification_topic_channels AS preference
    (user_id, topic_code, channel_code, is_enabled, updated_at)
  VALUES (v_platform_user_id, v_topic_code, p_messenger_channel, false, statement_timestamp())
  ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
    SET is_enabled = false, updated_at = EXCLUDED.updated_at;

  IF v_topic_code NOT IN ('warmup_reminders', 'training_reminders')
     AND EXISTS (
       SELECT 1 FROM public.user_web_push_subscriptions AS subscription
       WHERE subscription.user_id = v_platform_user_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_channel_preferences AS preference
       WHERE preference.platform_user_id = v_platform_user_id
         AND preference.channel_code = 'web_push'
         AND preference.is_enabled_for_notifications = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_notification_topic_channels AS preference
       WHERE preference.user_id = v_platform_user_id
         AND preference.topic_code = v_topic_code
         AND preference.channel_code = 'web_push'
         AND preference.is_enabled = false
     ) THEN
    v_active_labels := array_append(v_active_labels, 'Push');
  END IF;
  FOREACH v_label IN ARRAY ARRAY['telegram', 'max'] LOOP
    IF EXISTS (
      SELECT 1 FROM public.user_channel_bindings AS binding
      WHERE binding.user_id = v_platform_user_id AND binding.channel_code = v_label
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_channel_preferences AS preference
      WHERE preference.platform_user_id = v_platform_user_id
        AND preference.channel_code = v_label
        AND preference.is_enabled_for_notifications = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notification_topic_channels AS preference
      WHERE preference.user_id = v_platform_user_id
        AND preference.topic_code = v_topic_code
        AND preference.channel_code = v_label
        AND preference.is_enabled = false
    ) THEN
      v_active_labels := array_append(v_active_labels, CASE v_label WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END);
    END IF;
  END LOOP;
  IF v_topic_code NOT IN ('warmup_reminders', 'training_reminders')
     AND EXISTS (
       SELECT 1 FROM public.platform_users AS patient
       WHERE patient.id = v_platform_user_id
         AND NULLIF(btrim(patient.email), '') IS NOT NULL
         AND patient.email_verified_at IS NOT NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_channel_preferences AS preference
       WHERE preference.platform_user_id = v_platform_user_id
         AND preference.channel_code = 'email'
         AND preference.is_enabled_for_notifications = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_notification_topic_channels AS preference
       WHERE preference.user_id = v_platform_user_id
         AND preference.topic_code = v_topic_code
         AND preference.channel_code = 'email'
         AND preference.is_enabled = false
     ) THEN
    v_active_labels := array_append(v_active_labels, 'Email');
  END IF;

  v_list_csv := array_to_string(v_active_labels, ', ');
  IF array_length(v_active_labels, 1) = 2 THEN
    v_list_csv := v_active_labels[1] || ' и ' || v_active_labels[2];
  ELSIF array_length(v_active_labels, 1) > 2 THEN
    v_list_csv := array_to_string(v_active_labels[1:array_length(v_active_labels, 1) - 1], ', ')
      || ' и ' || v_active_labels[array_length(v_active_labels, 1)];
  END IF;
  persisted := true;
  paragraphs := jsonb_build_array(
    format('Хорошо, отключаю напоминания в боте (%s).', CASE p_messenger_channel WHEN 'telegram' THEN 'Telegram' ELSE 'MAX' END),
    CASE WHEN COALESCE(v_list_csv, '') <> ''
      THEN format('Сейчас остаются активными напоминания в %s.', v_list_csv)
      ELSE 'Сейчас не осталось активных каналов для напоминаний.' END,
    'Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.'
  );
  RETURN NEXT;
END
$$;


--
-- Name: patient_done_reminder_occurrence(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_done_reminder_occurrence(p_integrator_occurrence_id text) RETURNS TABLE(done_at timestamp with time zone, first_done_for_occurrence boolean, day_done_count integer, day_sent_total integer, day_fully_done boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_rule_uuid uuid;
  v_occurred_at timestamptz;
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

  SELECT rule.id, COALESCE(operational.sent_at, operational.planned_at)
  INTO v_rule_uuid, v_occurred_at
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.platform_user_id = v_platform_user_id
    AND operational.organization_id = v_org_id
    AND rule.organization_id = v_org_id
  FOR UPDATE OF operational;
  IF v_rule_uuid IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, category, status, occurred_at
  )
  SELECT rule.organization_id, operational.id, operational.rule_id, rule.integrator_user_id,
         operational.platform_user_id, rule.category, 'sent', v_occurred_at
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
  ON CONFLICT (integrator_occurrence_id) DO NOTHING;

  INSERT INTO public.reminder_journal (organization_id, rule_id, occurrence_id, action)
  VALUES (v_org_id, v_rule_uuid, p_integrator_occurrence_id, 'done')
  ON CONFLICT DO NOTHING
  RETURNING created_at INTO done_at;
  first_done_for_occurrence := done_at IS NOT NULL;
  IF NOT first_done_for_occurrence THEN
    SELECT journal.created_at INTO done_at
    FROM public.reminder_journal AS journal
    WHERE journal.occurrence_id = p_integrator_occurrence_id AND journal.action = 'done'
    LIMIT 1;
    IF done_at IS NULL THEN RETURN; END IF;
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
    COUNT(*) FILTER (WHERE history.status = 'sent')::integer,
    COUNT(journal.id) FILTER (WHERE history.status = 'sent')::integer
  INTO day_sent_total, day_done_count
  FROM public.reminder_occurrence_history AS history
  LEFT JOIN public.reminder_journal AS journal
    ON journal.occurrence_id = history.integrator_occurrence_id AND journal.action = 'done'
  WHERE history.platform_user_id = v_platform_user_id
    AND history.organization_id = v_org_id
    AND (history.occurred_at AT TIME ZONE v_timezone)::date =
        (v_occurred_at AT TIME ZONE v_timezone)::date;
  day_fully_done := first_done_for_occurrence AND day_sent_total > 0
    AND day_done_count = day_sent_total;
  RETURN NEXT;
END
$$;


--
-- Name: patient_reminder_materialization_fingerprint(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_reminder_materialization_fingerprint(p_occurrence_id text, p_channel text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
SELECT md5(jsonb_build_object(
    'occurrence', jsonb_build_array(
      occurrence.rule_id, occurrence.organization_id, occurrence.platform_user_id,
      occurrence.delivery_generation, occurrence.planned_at
    ),
    'rule', jsonb_build_array(
      rule.integrator_rule_id, rule.organization_id, rule.platform_user_id, rule.integrator_user_id,
      rule.is_enabled, rule.notification_topic_code, rule.reminder_intent, rule.linked_object_type,
      rule.linked_object_id, rule.custom_title, rule.custom_text, rule.display_title, rule.updated_at
    ),
    'patient', jsonb_build_array(
      patient.reminder_muted_until, patient.email, patient.email_verified_at, patient.updated_at
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
  FROM integrator.user_reminder_occurrences AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.rule_id
   AND rule.organization_id = occurrence.organization_id
   AND rule.platform_user_id = occurrence.platform_user_id
  INNER JOIN public.platform_users AS patient ON patient.id = occurrence.platform_user_id
  INNER JOIN public.outgoing_delivery_queue AS delivery
    ON delivery.event_id = concat(
      'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', p_channel
    )
   AND delivery.kind = 'reminder_dispatch'
   AND delivery.organization_id = occurrence.organization_id
  WHERE occurrence.id = p_occurrence_id
$$;


--
-- Name: patient_reminder_notification_settings(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_reminder_notification_settings(p_messenger_channel text, p_toggle_topic_code text) RETURNS TABLE(topics jsonb, new_state boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_messenger_channel NOT IN ('telegram', 'max')
     OR v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;
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
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  IF p_toggle_topic_code IS NOT NULL THEN
    IF p_toggle_topic_code NOT IN (
      'warmup_reminders', 'training_reminders', 'appointment_reminders', 'patient_news',
      'specialist_messages', 'support_messages', 'important_broadcasts'
    ) THEN RETURN; END IF;
    INSERT INTO public.user_notification_topic_channels AS preference
      (user_id, topic_code, channel_code, is_enabled, updated_at)
    VALUES (v_platform_user_id, p_toggle_topic_code, p_messenger_channel, false, statement_timestamp())
    ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
      SET is_enabled = NOT preference.is_enabled, updated_at = EXCLUDED.updated_at
    RETURNING is_enabled INTO new_state;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object('code', definition.code, 'title', definition.title,
      'isEnabled', COALESCE(preference.is_enabled, true))
    ORDER BY definition.position
  )
  INTO topics
  FROM (
    VALUES
      (1, 'warmup_reminders'::text, 'Напоминания о разминках'::text),
      (2, 'training_reminders', 'Напоминания о тренировках'),
      (3, 'appointment_reminders', 'Напоминания о записях'),
      (4, 'patient_news', 'Новости и уведомления'),
      (5, 'specialist_messages', 'Сообщения специалиста'),
      (6, 'support_messages', 'Сообщения поддержки'),
      (7, 'important_broadcasts', 'Важные рассылки')
  ) AS definition(position, code, title)
  LEFT JOIN public.user_notification_topic_channels AS preference
    ON preference.user_id = v_platform_user_id
   AND preference.topic_code = definition.code
   AND preference.channel_code = p_messenger_channel;
  RETURN NEXT;
END
$$;


--
-- Name: patient_set_reminder_mute(integer, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_set_reminder_mute(p_minutes integer, p_until_tomorrow boolean) RETURNS TABLE(muted_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_org_id IS NULL OR (p_until_tomorrow = (p_minutes IS NOT NULL)) THEN RETURN; END IF;
  IF NOT p_until_tomorrow AND p_minutes NOT BETWEEN 1 AND 1440 THEN RETURN; END IF;
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
  IF v_platform_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.platform_user_id = v_platform_user_id
      AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
  ) THEN RETURN; END IF;

  IF p_until_tomorrow THEN
    SELECT setting.value_json ->> 'value' INTO v_timezone
    FROM public.app_runtime_settings AS setting
    WHERE setting.key = 'app_display_timezone'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
    LIMIT 1;
    IF v_timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
    ) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;
    muted_until := (
      date_trunc('day', statement_timestamp() AT TIME ZONE v_timezone) + interval '1 day'
    ) AT TIME ZONE v_timezone;
  ELSE
    muted_until := statement_timestamp() + make_interval(mins => p_minutes);
  END IF;

  UPDATE public.platform_users
  SET reminder_muted_until = muted_until
  WHERE id = v_platform_user_id;
  RETURN NEXT;
END
$$;


--
-- Name: patient_set_reminder_muted_until(timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_set_reminder_muted_until(p_muted_until timestamp with time zone) RETURNS TABLE(muted_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_integrator_user_id IS NULL OR v_org_id IS NULL THEN RETURN; END IF;
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
  IF v_platform_user_id IS NULL THEN RETURN; END IF;

  UPDATE public.platform_users AS patient
  SET reminder_muted_until = p_muted_until
  WHERE patient.id = v_platform_user_id
  RETURNING patient.reminder_muted_until INTO muted_until;
  RETURN NEXT;
END
$$;


--
-- Name: patient_skip_reminder_occurrence(uuid, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_skip_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_reason text) RETURNS TABLE(skipped_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_rule_uuid uuid;
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

  SELECT rule.id INTO v_rule_uuid
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.platform_user_id = v_platform_user_id
    AND operational.organization_id = v_org_id
    AND rule.organization_id = v_org_id
  FOR UPDATE OF operational;
  IF v_rule_uuid IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, category, status, occurred_at
  )
  SELECT rule.organization_id, operational.id, operational.rule_id, rule.integrator_user_id,
         operational.platform_user_id, rule.category, 'sent',
         COALESCE(operational.sent_at, operational.planned_at)
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
  ON CONFLICT (integrator_occurrence_id) DO NOTHING;

  UPDATE public.reminder_occurrence_history AS history
  SET skipped_at = COALESCE(history.skipped_at, statement_timestamp()), skip_reason = NULL
  WHERE history.integrator_occurrence_id = p_integrator_occurrence_id
    AND history.platform_user_id = v_platform_user_id
  RETURNING history.skipped_at INTO skipped_at;
  IF skipped_at IS NULL THEN RETURN; END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, skip_reason)
  VALUES (v_org_id, v_rule_uuid, p_integrator_occurrence_id, 'skipped', NULL)
  ON CONFLICT DO NOTHING;

  UPDATE integrator.user_reminder_occurrences
  SET status = 'skipped', updated_at = statement_timestamp()
  WHERE id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND organization_id = v_org_id;
  RETURN NEXT;
END
$$;


--
-- Name: patient_snooze_reminder_occurrence(uuid, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.patient_snooze_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_minutes integer) RETURNS TABLE(snoozed_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_rule_uuid uuid;
  v_rule_id text;
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

  SELECT operational.rule_id, rule.id
  INTO v_rule_id, v_rule_uuid
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
    AND operational.platform_user_id = v_platform_user_id
    AND operational.organization_id = v_org_id
    AND rule.organization_id = v_org_id
  FOR UPDATE OF operational;
  IF v_rule_id IS NULL THEN RETURN; END IF;

  SELECT journal.snooze_until INTO v_snoozed_until
  FROM public.reminder_journal AS journal
  WHERE journal.occurrence_id = p_integrator_occurrence_id
    AND journal.action = 'snoozed'
  LIMIT 1;
  IF v_snoozed_until IS NOT NULL THEN
    snoozed_until := v_snoozed_until;
    RETURN NEXT;
    RETURN;
  END IF;

  v_snoozed_until := statement_timestamp() + make_interval(mins => p_minutes);
  INSERT INTO public.reminder_occurrence_history (
    organization_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
    platform_user_id, category, status, occurred_at
  )
  SELECT rule.organization_id, operational.id, operational.rule_id, rule.integrator_user_id,
         operational.platform_user_id, rule.category, 'sent',
         COALESCE(operational.sent_at, operational.planned_at)
  FROM integrator.user_reminder_occurrences AS operational
  INNER JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = operational.rule_id
  WHERE operational.id = p_integrator_occurrence_id
  ON CONFLICT (integrator_occurrence_id) DO NOTHING;

  UPDATE public.reminder_occurrence_history
  SET snoozed_at = statement_timestamp(), snoozed_until = v_snoozed_until
  WHERE integrator_occurrence_id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND skipped_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.reminder_journal
    (organization_id, rule_id, occurrence_id, action, snooze_until)
  VALUES (v_org_id, v_rule_uuid, p_integrator_occurrence_id, 'snoozed', v_snoozed_until);

  UPDATE integrator.user_reminder_occurrences
  SET planned_at = v_snoozed_until,
      delivery_generation = delivery_generation + 1,
      status = 'planned', queued_at = NULL, sent_at = NULL, failed_at = NULL,
      delivery_channel = NULL, delivery_job_id = NULL, error_code = NULL,
      updated_at = statement_timestamp()
  WHERE id = p_integrator_occurrence_id
    AND platform_user_id = v_platform_user_id
    AND organization_id = v_org_id;
  snoozed_until := v_snoozed_until;
  RETURN NEXT;
END
$$;


--
-- Name: phone_auth_find_latest_challenge_created_at(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_auth_find_latest_challenge_created_at(p_phone text) RETURNS TABLE(max_created timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-otp.cooldown.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.phone_auth_find_latest_challenge_created_at(text)'::regprocedure);

  RETURN QUERY SELECT max(c.created_at) FROM public.phone_challenges c WHERE c.phone = p_phone;
END
$_$;


--
-- Name: phone_auth_find_otp_lock(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_auth_find_otp_lock(p_phone text) RETURNS TABLE(locked_until bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-otp.lock.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.phone_auth_find_otp_lock(text)'::regprocedure);

  RETURN QUERY SELECT l.locked_until FROM public.phone_otp_locks l WHERE l.phone_normalized = p_phone;
END
$_$;


--
-- Name: phone_auth_register_otp_lockout(text, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_auth_register_otp_lockout(p_phone text, p_now_sec bigint) RETURNS TABLE(locked_until bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-otp.lock.register', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($2))::app.port_typed_arg]), 'app.phone_auth_register_otp_lockout(text,bigint)'::regprocedure);

  RETURN QUERY
  INSERT INTO public.phone_otp_locks (phone_normalized, lockout_cycle, locked_until)
  VALUES (p_phone, 1, p_now_sec + 120)
  ON CONFLICT (phone_normalized) DO UPDATE SET
    lockout_cycle = phone_otp_locks.lockout_cycle + 1,
    locked_until = p_now_sec + LEAST(1800, (120 * power(2, LEAST(phone_otp_locks.lockout_cycle, 10)))::bigint)
  RETURNING phone_otp_locks.locked_until;
END
$_$;


--
-- Name: phone_auth_reset_otp_lockout(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_auth_reset_otp_lockout(p_phone text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-otp.lock.reset', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.phone_auth_reset_otp_lockout(text)'::regprocedure);

  DELETE FROM public.phone_otp_locks l WHERE l.phone_normalized = p_phone;
END
$_$;


--
-- Name: phone_challenge_store_delete(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_challenge_store_delete(p_challenge_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-challenge.delete', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.phone_challenge_store_delete(text)'::regprocedure);

  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN RETURN false; END IF;
  DELETE FROM public.phone_challenges c WHERE c.challenge_id = p_challenge_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$_$;


--
-- Name: phone_challenge_store_delete_by_phone(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_challenge_store_delete_by_phone(p_phone text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-challenge.delete-by-phone', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.phone_challenge_store_delete_by_phone(text)'::regprocedure);

  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RETURN 0; END IF;
  DELETE FROM public.phone_challenges c WHERE c.phone = p_phone;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END
$_$;


--
-- Name: phone_challenge_store_increment_attempts(text, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_challenge_store_increment_attempts(p_challenge_id text, p_now_sec bigint) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE v_attempts integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-challenge.attempt.increment', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($2))::app.port_typed_arg]), 'app.phone_challenge_store_increment_attempts(text,bigint)'::regprocedure);

  UPDATE public.phone_challenges c SET verify_attempts = c.verify_attempts + 1
   WHERE c.challenge_id = p_challenge_id AND c.expires_at > p_now_sec
   RETURNING c.verify_attempts::integer INTO v_attempts;
  RETURN v_attempts;
END
$_$;


--
-- Name: phone_challenge_store_read(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_challenge_store_read(p_challenge_id text) RETURNS TABLE(phone text, expires_at bigint, code text, channel_context jsonb, verify_attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE v_challenge public.phone_challenges%ROWTYPE; v_now_sec bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-challenge.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.phone_challenge_store_read(text)'::regprocedure);

  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN RETURN; END IF;
  SELECT c.* INTO v_challenge FROM public.phone_challenges c WHERE c.challenge_id = p_challenge_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.phone_challenges c WHERE c.challenge_id = p_challenge_id;
    RETURN;
  END IF;
  RETURN QUERY SELECT v_challenge.phone, v_challenge.expires_at, v_challenge.code,
    v_challenge.channel_context, v_challenge.verify_attempts::integer;
END
$_$;


--
-- Name: phone_challenge_store_upsert(text, text, bigint, text, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_challenge_store_upsert(p_challenge_id text, p_phone text, p_expires_at bigint, p_code text, p_channel_context text, p_verify_attempts integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-challenge.upsert', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($6))::app.port_typed_arg]), 'app.phone_challenge_store_upsert(text,text,bigint,text,text,integer)'::regprocedure);

  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' OR p_phone IS NULL OR btrim(p_phone) = ''
     OR p_expires_at IS NULL OR p_expires_at <= 0 OR p_verify_attempts IS NULL OR p_verify_attempts < 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.phone_challenges AS c
    (challenge_id, phone, expires_at, code, channel_context, verify_attempts)
  VALUES (p_challenge_id, p_phone, p_expires_at, p_code, p_channel_context::jsonb, p_verify_attempts)
  ON CONFLICT (challenge_id) DO UPDATE SET phone = EXCLUDED.phone, expires_at = EXCLUDED.expires_at,
    code = EXCLUDED.code, channel_context = EXCLUDED.channel_context, verify_attempts = EXCLUDED.verify_attempts
  WHERE c.phone = EXCLUDED.phone;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count = 1;
END
$_$;


--
-- Name: phone_messenger_bind_completion_state(text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_messenger_bind_completion_state(p_token_hash text, p_channel_code text, p_external_id text, p_contact_phone text) RETURNS TABLE(ready boolean, account_created boolean, sync_target_user_id uuid, canonical_user_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_secret public.phone_messenger_bind_secrets%ROWTYPE;
  v_binding_user_id uuid;
  v_binding_canonical_id uuid;
  v_target_canonical_id uuid;
  v_binding_phone text;
  v_binding_created_at timestamptz;
  v_next_id uuid;
  v_depth integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_binding_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-messenger-bind.completion-state', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.phone_messenger_bind_completion_state(text,text,text,text)'::regprocedure);

  IF p_token_hash IS NULL OR btrim(p_token_hash) = ''
     OR p_channel_code NOT IN ('telegram', 'max')
     OR p_external_id IS NULL OR btrim(p_external_id) = ''
     OR p_contact_phone IS NULL OR btrim(p_contact_phone) = '' THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT secret.* INTO v_secret
    FROM public.phone_messenger_bind_secrets AS secret
   WHERE secret.token_hash = p_token_hash;
  IF NOT FOUND
     OR v_secret.channel_code <> p_channel_code
     OR v_secret.phone_normalized <> p_contact_phone THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT binding.user_id INTO v_binding_user_id
    FROM public.user_channel_bindings AS binding
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id;

  v_binding_canonical_id := v_binding_user_id;
  v_depth := 0;
  WHILE v_binding_canonical_id IS NOT NULL AND v_depth < 32 LOOP
    SELECT person.merged_into_id, person.phone_normalized, person.created_at
      INTO v_next_id, v_binding_phone, v_binding_created_at
      FROM public.platform_users AS person
     WHERE person.id = v_binding_canonical_id;
    EXIT WHEN NOT FOUND OR v_next_id IS NULL;
    v_binding_canonical_id := v_next_id;
    v_depth := v_depth + 1;
  END LOOP;

  v_target_canonical_id := v_secret.user_id;
  v_depth := 0;
  WHILE v_target_canonical_id IS NOT NULL AND v_depth < 32 LOOP
    SELECT person.merged_into_id INTO v_next_id
      FROM public.platform_users AS person
     WHERE person.id = v_target_canonical_id;
    EXIT WHEN NOT FOUND OR v_next_id IS NULL;
    v_target_canonical_id := v_next_id;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN QUERY SELECT
    v_binding_canonical_id IS NOT NULL
      AND v_binding_phone = v_secret.phone_normalized
      AND (v_secret.purpose <> 'profile_bind'
        OR v_target_canonical_id = v_binding_canonical_id),
    v_secret.purpose = 'login'
      AND v_binding_created_at IS NOT NULL
      AND v_binding_created_at >= v_secret.created_at,
    CASE WHEN v_secret.purpose = 'profile_bind' THEN v_target_canonical_id ELSE NULL::uuid END,
    v_binding_canonical_id;
END
$_$;


--
-- Name: phone_messenger_bind_secret(text, text, uuid, text, text, text, uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_messenger_bind_secret(p_action text, p_token_hash text, p_secret_id uuid, p_phone_normalized text, p_channel_code text, p_purpose text, p_user_id uuid, p_challenge_id text, p_failure_code text, p_expires_at timestamp with time zone) RETURNS TABLE(id uuid, phone_normalized text, channel_code text, purpose text, user_id uuid, status text, challenge_id text, failure_code text, expires_at timestamp with time zone, consumed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_binding_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-messenger-bind.secret', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg]), 'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)'::regprocedure);

  IF p_action = 'start' THEN
    IF p_token_hash IS NULL OR btrim(p_token_hash) = ''
       OR p_phone_normalized IS NULL OR btrim(p_phone_normalized) = ''
       OR p_channel_code NOT IN ('telegram', 'max')
       OR p_purpose NOT IN ('login', 'profile_bind')
       OR p_expires_at IS NULL OR p_expires_at <= clock_timestamp()
       OR (p_purpose = 'login' AND p_user_id IS NOT NULL)
       OR (p_purpose = 'profile_bind' AND p_user_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_start';
    END IF;
    DELETE FROM public.phone_messenger_bind_secrets AS secret
     WHERE secret.phone_normalized = p_phone_normalized
       AND secret.channel_code = p_channel_code
       AND secret.purpose = p_purpose
       AND secret.status = 'pending_contact';
    RETURN QUERY
    INSERT INTO public.phone_messenger_bind_secrets AS secret
      (token_hash, phone_normalized, channel_code, purpose, user_id, status, expires_at)
    VALUES
      (p_token_hash, p_phone_normalized, p_channel_code, p_purpose, p_user_id,
       'pending_contact', p_expires_at)
    RETURNING secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
      secret.user_id, secret.status, secret.challenge_id, secret.failure_code,
      secret.expires_at, secret.consumed_at;
    RETURN;
  ELSIF p_action = 'find' THEN
    IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN RETURN; END IF;
    RETURN QUERY
    SELECT secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
      secret.user_id, secret.status, secret.challenge_id, secret.failure_code,
      secret.expires_at, secret.consumed_at
      FROM public.phone_messenger_bind_secrets AS secret
     WHERE secret.token_hash = p_token_hash;
    RETURN;
  ELSIF p_action = 'expire' THEN
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'expired'
     WHERE secret.id = p_secret_id AND secret.status <> 'consumed';
  ELSIF p_action = 'fail' THEN
    IF p_failure_code IS NULL OR btrim(p_failure_code) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_failure';
    END IF;
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'failed', failure_code = p_failure_code
     WHERE secret.id = p_secret_id AND secret.status <> 'consumed';
  ELSIF p_action = 'otp_ready' THEN
    IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_challenge';
    END IF;
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'otp_ready', challenge_id = p_challenge_id, failure_code = NULL
     WHERE secret.id = p_secret_id AND secret.status = 'pending_contact';
  ELSIF p_action = 'consume' THEN
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'consumed', consumed_at = COALESCE(secret.consumed_at, clock_timestamp())
     WHERE secret.id = p_secret_id AND secret.status <> 'consumed';
  ELSIF p_action = 'consume_challenge' THEN
    IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' THEN RETURN; END IF;
    UPDATE public.phone_messenger_bind_secrets AS secret
       SET status = 'consumed', consumed_at = clock_timestamp()
     WHERE secret.challenge_id = p_challenge_id AND secret.status = 'otp_ready';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_phone_messenger_bind_action';
  END IF;

  RETURN QUERY
  SELECT secret.id, secret.phone_normalized, secret.channel_code, secret.purpose,
    secret.user_id, secret.status, secret.challenge_id, secret.failure_code,
    secret.expires_at, secret.consumed_at
    FROM public.phone_messenger_bind_secrets AS secret
   WHERE secret.id = p_secret_id
      OR (p_action = 'consume_challenge' AND secret.challenge_id = p_challenge_id);
END
$_$;


--
-- Name: phone_otp_public_booking_consume_challenge(text, text, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_otp_public_booking_consume_challenge(p_challenge_id text, p_code text, p_max_attempts integer, p_lock_duration_sec integer) RETURNS TABLE(ok boolean, intent jsonb, delivery_channel text, retry_after_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
DECLARE
  v_now_sec bigint;
  v_challenge public.phone_challenges%ROWTYPE;
  v_intent jsonb;
  v_next_attempts integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'booking.public-phone-otp.consume', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($4))::app.port_typed_arg]), 'app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)'::regprocedure);

  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  IF p_challenge_id IS NULL OR btrim(p_challenge_id) = '' OR p_code IS NULL OR btrim(p_code) = ''
     OR p_max_attempts IS NULL OR p_max_attempts <= 0
     OR p_lock_duration_sec IS NULL OR p_lock_duration_sec < 0 THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  SELECT c.* INTO v_challenge FROM public.phone_challenges c
   WHERE c.challenge_id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN; END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  v_intent := v_challenge.channel_context -> 'publicBookingIntent';
  IF v_intent IS NULL OR jsonb_typeof(v_intent) <> 'object' THEN
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  IF v_challenge.code IS NULL OR v_challenge.code <> p_code THEN
    UPDATE public.phone_challenges SET verify_attempts = verify_attempts + 1
     WHERE challenge_id = p_challenge_id RETURNING verify_attempts::integer INTO v_next_attempts;
    IF v_next_attempts >= p_max_attempts THEN
      DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
      INSERT INTO public.phone_otp_locks (phone_normalized, locked_until)
      VALUES (v_challenge.phone, v_now_sec + p_lock_duration_sec)
      ON CONFLICT (phone_normalized) DO UPDATE SET locked_until = EXCLUDED.locked_until;
      RETURN QUERY SELECT false, NULL::jsonb, NULL::text, p_lock_duration_sec; RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::jsonb, NULL::text, NULL::integer; RETURN;
  END IF;
  DELETE FROM public.phone_challenges WHERE challenge_id = p_challenge_id;
  RETURN QUERY SELECT true, v_intent, v_challenge.channel_context ->> 'otpDelivery', NULL::integer;
END
$_$;


--
-- Name: phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.phone_otp_public_booking_issue_challenge(p_phone text, p_challenge_id text, p_code text, p_ttl_sec integer, p_resend_cooldown_sec integer, p_delivery_channel text, p_intent text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_now_sec bigint;
  v_locked_until bigint;
  v_last_created timestamptz;
  v_intent jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'booking.public-phone-otp.issue', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($4))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg]), 'app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)'::regprocedure);

  v_now_sec := extract(epoch FROM clock_timestamp())::bigint;
  v_intent := p_intent::jsonb;
  IF p_phone IS NULL OR btrim(p_phone) = '' OR p_challenge_id IS NULL OR btrim(p_challenge_id) = ''
     OR p_code IS NULL OR btrim(p_code) = '' OR p_ttl_sec IS NULL OR p_ttl_sec <= 0
     OR p_resend_cooldown_sec IS NULL OR p_resend_cooldown_sec < 0
     OR p_delivery_channel IS NULL OR btrim(p_delivery_channel) = ''
     OR v_intent IS NULL OR jsonb_typeof(v_intent) <> 'object' THEN RETURN false; END IF;
  DELETE FROM public.phone_otp_locks WHERE locked_until <= v_now_sec;
  SELECT l.locked_until INTO v_locked_until FROM public.phone_otp_locks l
   WHERE l.phone_normalized = p_phone FOR UPDATE;
  IF FOUND AND v_locked_until > v_now_sec THEN RETURN false; END IF;
  SELECT max(c.created_at) INTO v_last_created FROM public.phone_challenges c WHERE c.phone = p_phone;
  IF v_last_created IS NOT NULL
     AND extract(epoch FROM (clock_timestamp() - v_last_created)) < p_resend_cooldown_sec THEN
    RETURN false;
  END IF;
  DELETE FROM public.phone_challenges WHERE phone = p_phone;
  INSERT INTO public.phone_challenges
    (challenge_id, phone, expires_at, code, channel_context, verify_attempts)
  VALUES (p_challenge_id, p_phone, v_now_sec + p_ttl_sec, p_code,
    jsonb_build_object('otpDelivery', p_delivery_channel, 'publicBookingIntent', v_intent), 0)
  ON CONFLICT (challenge_id) DO NOTHING;
  RETURN FOUND;
END
$_$;


--
-- Name: pre_session_resolve_identity(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.pre_session_resolve_identity(p_platform_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER') THEN 'app_platform_admin'::name
      ELSE 'app_pre_session'::name
    END,
    'pre_session'::app.port_context_class,
    'identity.variant-a.resolve',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg]),
    'app.pre_session_resolve_identity(uuid)'::regprocedure
  );
  RETURN app_ext.resolve_variant_a_identity(p_platform_user_id);
END $$;


--
-- Name: prepare_organization_lifecycle_notification_context(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.prepare_organization_lifecycle_notification_context(p_organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_registered_at timestamptz;
  v_trial record;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_staff'::name]::name[]);

  IF v_current_organization_id IS NULL OR v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_context_mismatch';
  END IF;

  UPDATE public.be_organizations
  SET cabinet_first_entered_at = COALESCE(cabinet_first_entered_at, now()),
      updated_at = now()
  WHERE id = p_organization_id
  RETURNING cabinet_first_entered_at INTO v_registered_at;

  SELECT trial.started_at, trial.ends_at, trial.discount_ends_at
  INTO v_trial
  FROM public.saas_organization_trials AS trial
  WHERE trial.organization_id = p_organization_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'registeredAt', v_registered_at,
    'trialStartedAt', v_trial.started_at,
    'trialEndsAt', v_trial.ends_at,
    'discountEndsAt', v_trial.discount_ends_at
  );
END;
$$;


--
-- Name: propagate_staff_session_version_to_session_epoch(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.propagate_staff_session_version_to_session_epoch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
	UPDATE public.platform_users
	SET session_epoch = session_epoch + 1, updated_at = now()
	WHERE id = NEW.user_id;
	RETURN NULL;
END
$$;


--
-- Name: provision_specialist_owner(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.provision_specialist_owner(p_challenge_id uuid) RETURNS TABLE(ok boolean, code text, organization_id uuid, specialist_id uuid, membership_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
DECLARE
  v_intent record;
  v_user record;
  v_platform_user_id uuid;
  v_organization_id uuid;
  v_membership_id uuid;
  v_specialist_id uuid;
  v_unique_constraint_name text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);

  v_platform_user_id := app.require_staff_security_self_user_id();

  SELECT i.*
  INTO v_intent
  FROM public.specialist_signup_intents AS i
  WHERE i.user_id = v_platform_user_id
    AND i.challenge_id = p_challenge_id
    AND i.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT i.*
    INTO v_intent
    FROM public.specialist_signup_intents AS i
    WHERE i.user_id = v_platform_user_id
      AND i.challenge_id = p_challenge_id
      AND i.status = 'provisioned'
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND
      OR v_intent.provisioned_organization_id IS NULL
      OR v_intent.provisioned_membership_id IS NULL THEN
      RETURN QUERY SELECT false, 'specialist_signup_intent_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    -- Already provisioned: re-running stays idempotent. A pre-fix intent can still carry a NULL
    -- provisioned_specialist_id (the exact dead-workspace defect this function now closes) --
    -- fall through to the shared specialist-backfill block below instead of returning it bare.
    v_organization_id := v_intent.provisioned_organization_id;
    v_membership_id := v_intent.provisioned_membership_id;
    v_specialist_id := v_intent.provisioned_specialist_id;
  END IF;

  IF v_organization_id IS NULL THEN
    SELECT u.id
    INTO v_user
    FROM public.platform_users AS u
    WHERE u.id = v_platform_user_id
      AND u.merged_into_id IS NULL
      AND u.email_verified_at IS NOT NULL
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'specialist_signup_user_not_verified'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    -- Pre-cutover intents can still carry no slug. Keep the established recovery code so confirm
    -- asks for the address without consuming the still-valid e-mail challenge.
    IF v_intent.organization_slug IS NULL THEN
      RETURN QUERY SELECT false, 'specialist_signup_slug_reservation_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    -- Lock the canonical identity before checking memberships so concurrent self-provision attempts
    -- cannot both observe an empty membership set and create two owner organizations.
    PERFORM 1
    FROM public.be_organization_members AS m
    WHERE m.platform_user_id = v_user.id
      AND m.status = 'active'
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      RETURN QUERY SELECT false, 'specialist_signup_active_membership_exists'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    UPDATE public.platform_users AS u
    SET role = 'doctor',
        display_name = v_intent.specialist_full_name,
        updated_at = now()
    WHERE u.id = v_user.id;

    v_organization_id := gen_random_uuid();

    -- The global UNIQUE(slug) index is the only ownership arbiter. The organization insert and its
    -- current claim share a subtransaction: if another registration commits this slug first, the
    -- losing provisional organization is rolled back before returning the stable public error.
    BEGIN
      INSERT INTO public.be_organizations (
        id,
        title,
        is_active,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (
        v_organization_id,
        v_intent.organization_title,
        true,
        0,
        now(),
        now()
      );

      INSERT INTO public.organization_slug_claims (
        slug,
        kind,
        organization_id,
        created_by_platform_user_id,
        created_at,
        updated_at
      )
      VALUES (
        lower(v_intent.organization_slug),
        'current',
        v_organization_id,
        v_user.id,
        now(),
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_unique_constraint_name = CONSTRAINT_NAME;
        IF v_unique_constraint_name = 'uq_organization_slug_claims_slug' THEN
          RETURN QUERY SELECT false, 'slug_unavailable'::text, NULL::uuid, NULL::uuid, NULL::uuid;
          RETURN;
        END IF;
        RAISE;
    END;

    INSERT INTO public.clinic_public_directory_entries (
      organization_id,
      slug,
      display_name,
      is_published,
      published_at,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      lower(v_intent.organization_slug),
      v_intent.organization_title,
      true,
      now(),
      now(),
      now()
    );

    INSERT INTO public.be_organization_members (
      organization_id,
      platform_user_id,
      role,
      specialist_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      v_user.id,
      'owner',
      NULL,
      'active',
      now(),
      now()
    )
    RETURNING id INTO v_membership_id;

    -- Narrow platform-owned capability derives this exact organization from the signed principal
    -- and fresh owner membership. It updates commercial state and creates the trial in this same
    -- transaction; any failure rolls the complete provisioning command back.
    PERFORM app.start_provisioned_organization_trial();

    -- Same SECURITY DEFINER transaction: the new organization is not observable without its own
    -- independent catalog snapshot. The helper only inserts the current repo-managed baseline.
    PERFORM app.seed_reference_catalog_snapshot(v_organization_id);
  END IF;

  -- Bind the registering person's own bookable specialist in the SAME transaction as the
  -- organization/membership: a membership left with specialist_id NULL makes
  -- resolveLaunchCapabilities() withhold clinical.workspace forever (owner-reported dead
  -- workspace). Column set mirrors ensureOwnBookableSpecialist()'s identical invited-staff
  -- backfill (pgOrganizationProvisioning.ts). Guarded on v_specialist_id IS NULL so re-running
  -- provisioning for an already-provisioned intent never creates a second specialist.
  IF v_specialist_id IS NULL THEN
    INSERT INTO public.be_specialists (
      organization_id,
      full_name,
      is_active,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      v_intent.specialist_full_name,
      true,
      0,
      now(),
      now()
    )
    RETURNING id INTO v_specialist_id;

    UPDATE public.be_organization_members
    SET specialist_id = v_specialist_id,
        updated_at = now()
    WHERE id = v_membership_id
      AND specialist_id IS NULL;
  END IF;

  UPDATE public.specialist_signup_intents AS i
  SET status = 'provisioned',
      provisioned_organization_id = v_organization_id,
      provisioned_membership_id = v_membership_id,
      provisioned_specialist_id = v_specialist_id,
      provisioned_at = now()
  WHERE i.id = v_intent.id;

  RETURN QUERY SELECT true, NULL::text, v_organization_id, v_specialist_id, v_membership_id;
END
$$;


--
-- Name: prune_integration_webhook_error_events(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.prune_integration_webhook_error_events(p_retention_hours integer) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  deleted_count bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'health.webhook-errors.prune', app.hash_port_typed_args(ARRAY[ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg]), 'app.prune_integration_webhook_error_events(integer)'::regprocedure);

  IF p_retention_hours IS NULL
    OR p_retention_hours < 1
    OR p_retention_hours > 87600
  THEN
    RAISE EXCEPTION 'invalid webhook error retention'
      USING ERRCODE = '23514';
  END IF;

  WITH deleted AS (
    DELETE FROM public.integration_webhook_error_events AS event
    WHERE event.occurred_at < now() - make_interval(hours => p_retention_hours)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END
$_$;


--
-- Name: read_booking_calendar_latest_staff_comment(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_booking_calendar_latest_staff_comment(p_appointment_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE v_body text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.staff-comment.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_booking_calendar_latest_staff_comment(uuid)'::regprocedure);

  SELECT c.body INTO v_body FROM public.be_appointments a
    JOIN public.be_appointment_staff_comments c
      ON c.appointment_id = a.id AND c.organization_id = a.organization_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
   ORDER BY c.created_at DESC LIMIT 1;
  RETURN v_body;
END
$_$;


--
-- Name: read_booking_calendar_patient_profile(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_booking_calendar_patient_profile(p_appointment_id uuid) RETURNS TABLE(is_problematic boolean, problematic_note text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.patient-profile.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_booking_calendar_patient_profile(uuid)'::regprocedure);

  RETURN QUERY SELECT p.is_problematic, p.problematic_note
    FROM public.be_appointments a
    JOIN public.be_patient_booking_profiles p
      ON p.organization_id = a.organization_id AND p.platform_user_id = a.platform_user_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id();
END
$_$;


--
-- Name: read_canonical_appointment_by_external_id(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_canonical_appointment_by_external_id(p_external_id text) RETURNS TABLE(id uuid, organization_id uuid, phone_normalized text, start_at timestamp with time zone, status text, attribution_json jsonb, branch_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'booking.integrator-record.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_canonical_appointment_by_external_id(text)'::regprocedure);

  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external appointment id required';
  END IF;
  RETURN QUERY
    WITH target AS (
      SELECT direct.canonical_id, 0 AS priority
        FROM (SELECT CASE
                       WHEN p_external_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                       THEN substring(p_external_id FROM 4)::uuid
                     END AS canonical_id) direct
       WHERE direct.canonical_id IS NOT NULL
      UNION ALL
      SELECT mapping.canonical_id, 1 AS priority
        FROM public.be_external_entity_mappings mapping
       WHERE mapping.entity_type = 'appointment'
         AND mapping.external_system = 'rubitime'
         AND mapping.external_id = p_external_id
    )
    SELECT appointment.id, appointment.organization_id, appointment.phone_normalized,
           appointment.start_at, appointment.status, appointment.attribution_json,
           appointment.branch_id, appointment.created_at, appointment.updated_at,
           appointment.deleted_at
      FROM target
      JOIN public.be_appointments appointment ON appointment.id = target.canonical_id
     ORDER BY target.priority
     LIMIT 1;
END
$_$;


--
-- Name: read_curated_playback_health(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_playback_health() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH hls_proxy AS (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'errorsTotal24h', count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
    'errorsTotal1h', count(*) FILTER (WHERE created_at >= now() - interval '1 hour'),
    'byReason', jsonb_build_object(
      'session_unauthorized', 0, 'feature_disabled', 0, 'media_not_readable', 0,
      'forbidden_path', 0, 'missing_object', 0, 'upstream_403', 0,
      's3_read_failed', 0, 'upstream_timeout', 0, 'range_not_satisfiable', 0,
      'playlist_read_failed', 0, 'playlist_rewrite_failed', 0, 'internal_error', 0
    ) || COALESCE((
      SELECT jsonb_object_agg(reason_code, reason_count)
      FROM (
        SELECT reason_code, count(*) AS reason_count
        FROM public.media_hls_proxy_error_events
        WHERE created_at >= now() - interval '24 hours'
        GROUP BY reason_code
      ) counts
    ), '{}'::jsonb),
    'byReasonLast1h', jsonb_build_object(
      'session_unauthorized', 0, 'feature_disabled', 0, 'media_not_readable', 0,
      'forbidden_path', 0, 'missing_object', 0, 'upstream_403', 0,
      's3_read_failed', 0, 'upstream_timeout', 0, 'range_not_satisfiable', 0,
      'playlist_read_failed', 0, 'playlist_rewrite_failed', 0, 'internal_error', 0
    ) || COALESCE((
      SELECT jsonb_object_agg(reason_code, reason_count)
      FROM (
        SELECT reason_code, count(*) AS reason_count
        FROM public.media_hls_proxy_error_events
        WHERE created_at >= now() - interval '1 hour'
        GROUP BY reason_code
      ) counts
    ), '{}'::jsonb),
    'degraded', CASE
      WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') >= 20 THEN true
      WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') >= 15 THEN
        count(*) FILTER (
          WHERE created_at >= now() - interval '1 hour'
            AND reason_code IN ('upstream_403', 'missing_object')
        )::numeric / count(*) FILTER (WHERE created_at >= now() - interval '1 hour') >= 0.35
      ELSE false
    END,
    'recent', '[]'::jsonb
  ) AS value
  FROM public.media_hls_proxy_error_events
)
SELECT app.read_curated_playback_health_pre_0196()
  || jsonb_build_object('hlsProxy', hls_proxy.value)
FROM hls_proxy
$$;


--
-- Name: read_curated_playback_health_pre_0196(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_playback_health_pre_0196() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH windows(hours) AS (VALUES (24), (1)),
event_totals AS (
  SELECT
    windows.hours,
    count(events.*) AS total,
    count(events.*) FILTER (WHERE events.delivery = 'hls') AS hls,
    count(events.*) FILTER (WHERE events.delivery = 'mp4') AS mp4,
    count(events.*) FILTER (WHERE events.delivery = 'file') AS file,
    count(events.*) FILTER (WHERE events.fallback_used) AS fallback
  FROM windows
  LEFT JOIN public.media_playback_resolution_events AS events
    ON events.resolved_at >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
),
hourly_totals AS (
  SELECT
    windows.hours,
    COALESCE(sum(stats.resolved_count), 0) AS total,
    COALESCE(sum(stats.resolved_count) FILTER (WHERE stats.delivery = 'hls'), 0) AS hls,
    COALESCE(sum(stats.resolved_count) FILTER (WHERE stats.delivery = 'mp4'), 0) AS mp4,
    COALESCE(sum(stats.resolved_count) FILTER (WHERE stats.delivery = 'file'), 0) AS file,
    COALESCE(sum(stats.fallback_count), 0) AS fallback
  FROM windows
  LEFT JOIN public.media_playback_stats_hourly AS stats
    ON stats.bucket_hour >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
),
unique_totals AS (
  SELECT windows.hours, count(first_resolve.*) AS unique_pairs
  FROM windows
  LEFT JOIN public.media_playback_user_video_first_resolve AS first_resolve
    ON first_resolve.first_resolved_at >= now() - windows.hours * interval '1 hour'
  GROUP BY windows.hours
)
SELECT jsonb_object_agg(
  event_totals.hours::text,
  jsonb_build_object(
    'byDelivery', jsonb_build_object(
      'hls', CASE WHEN event_totals.total > 0 THEN event_totals.hls ELSE hourly_totals.hls END,
      'mp4', CASE WHEN event_totals.total > 0 THEN event_totals.mp4 ELSE hourly_totals.mp4 END,
      'file', CASE WHEN event_totals.total > 0 THEN event_totals.file ELSE hourly_totals.file END
    ),
    'fallbackTotal', CASE WHEN event_totals.total > 0 THEN event_totals.fallback ELSE hourly_totals.fallback END,
    'totalResolutions', CASE WHEN event_totals.total > 0 THEN event_totals.total ELSE hourly_totals.total END,
    'uniquePlaybackPairsFirstSeenInWindow', unique_totals.unique_pairs
  )
)
FROM event_totals
JOIN hourly_totals USING (hours)
JOIN unique_totals USING (hours)
$$;


--
-- Name: read_curated_system_health(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_system_health() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH media_preview AS MATERIALIZED (
  SELECT jsonb_build_object(
    'stalePendingCount', count(*) FILTER (
      WHERE mime_type IN ('video/quicktime', 'image/heic', 'image/heif')
        AND preview_status = 'pending'
        AND created_at < now() - interval '30 minutes'
    ),
    'byMimeAndStatus', jsonb_build_object(
      'video/quicktime', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'video/quicktime' AND preview_status = 'skipped')
      ),
      'image/heic', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'image/heic' AND preview_status = 'skipped')
      ),
      'image/heif', jsonb_build_object(
        'pending', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'pending'),
        'ready', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'ready'),
        'failed', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'failed'),
        'skipped', count(*) FILTER (WHERE mime_type = 'image/heif' AND preview_status = 'skipped')
      )
    )
  ) AS value
  FROM public.media_files
),
playback_client AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'totalErrors', count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
    'totalErrorsLast1h', count(*) FILTER (WHERE created_at >= now() - interval '1 hour'),
    'byEvent', jsonb_build_object(
      'hls_fatal', count(*) FILTER (WHERE event_class = 'hls_fatal' AND created_at >= now() - interval '24 hours'),
      'video_error', count(*) FILTER (WHERE event_class = 'video_error' AND created_at >= now() - interval '24 hours'),
      'hls_import_failed', count(*) FILTER (WHERE event_class = 'hls_import_failed' AND created_at >= now() - interval '24 hours'),
      'playback_refetch_failed', count(*) FILTER (WHERE event_class = 'playback_refetch_failed' AND created_at >= now() - interval '24 hours'),
      'playback_refetch_exception', count(*) FILTER (WHERE event_class = 'playback_refetch_exception' AND created_at >= now() - interval '24 hours'),
      'hls_js_unsupported', count(*) FILTER (WHERE event_class = 'hls_js_unsupported' AND created_at >= now() - interval '24 hours')
    ),
    'byEventLast1h', jsonb_build_object(
      'hls_fatal', count(*) FILTER (WHERE event_class = 'hls_fatal' AND created_at >= now() - interval '1 hour'),
      'video_error', count(*) FILTER (WHERE event_class = 'video_error' AND created_at >= now() - interval '1 hour'),
      'hls_import_failed', count(*) FILTER (WHERE event_class = 'hls_import_failed' AND created_at >= now() - interval '1 hour'),
      'playback_refetch_failed', count(*) FILTER (WHERE event_class = 'playback_refetch_failed' AND created_at >= now() - interval '1 hour'),
      'playback_refetch_exception', count(*) FILTER (WHERE event_class = 'playback_refetch_exception' AND created_at >= now() - interval '1 hour'),
      'hls_js_unsupported', count(*) FILTER (WHERE event_class = 'hls_js_unsupported' AND created_at >= now() - interval '1 hour')
    ),
    'byDelivery', jsonb_build_object(
      'hls', count(*) FILTER (WHERE delivery = 'hls' AND created_at >= now() - interval '24 hours'),
      'mp4', count(*) FILTER (WHERE delivery = 'mp4' AND created_at >= now() - interval '24 hours'),
      'file', count(*) FILTER (WHERE delivery = 'file' AND created_at >= now() - interval '24 hours')
    ),
    'likelyLooping', EXISTS (
      SELECT 1
      FROM public.media_playback_client_events looping
      WHERE looping.event_class = 'hls_fatal'
        AND looping.created_at >= date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      GROUP BY looping.media_id
      HAVING count(*) >= 3
    ),
    'recent', '[]'::jsonb
  ) AS value
  FROM public.media_playback_client_events
),
base AS MATERIALIZED (
  SELECT app.read_curated_system_health_pre_0196()
    || jsonb_build_object(
      'mediaPreview', media_preview.value,
      'videoPlaybackClient', playback_client.value
    ) AS value
  FROM media_preview, playback_client
),
channel_diagnostics AS MATERIALIZED (
  SELECT jsonb_object_agg(
    channels.channel,
    (base.value #> ARRAY['notificationDelivery', 'byChannel', channels.channel])
      || jsonb_build_object(
        'lastProviderStatusCode', CASE
          WHEN diagnostic.provider_status_code BETWEEN 100 AND 599
            THEN diagnostic.provider_status_code
          ELSE NULL
        END,
        'lastErrorReason', CASE
          WHEN diagnostic.reason = 'provider_error' THEN diagnostic.reason
          ELSE NULL
        END,
        'lastErrorMessage', CASE
          WHEN diagnostic.error_message IN (
            'BadJwtToken', 'BadCertificate', 'BadCertificateEnvironment',
            'ExpiredProviderToken', 'InvalidProviderToken', 'MissingProviderToken',
            'TopicDisallowed', 'DeviceTokenNotForTopic', 'Unregistered'
          ) THEN diagnostic.error_message
          ELSE NULL
        END
      )
  ) AS value
  FROM base
  CROSS JOIN (VALUES ('telegram'), ('max'), ('web_push'), ('email')) AS channels(channel)
  LEFT JOIN LATERAL (
    SELECT attempt.provider_status_code, attempt.reason, attempt.error_message
    FROM public.notification_delivery_attempts AS attempt
    WHERE attempt.channel = channels.channel
      AND attempt.status IN ('failed', 'skipped')
      AND attempt.created_at >= now() - interval '24 hours'
    ORDER BY attempt.created_at DESC
    LIMIT 1
  ) AS diagnostic ON true
  GROUP BY base.value
),
digest_delivery AS MATERIALIZED (
  SELECT max(sent_at) AS last_sent_at
  FROM public.outgoing_delivery_queue
  WHERE kind = 'operator_health_digest'
    AND status = 'sent'
)
SELECT jsonb_set(
  jsonb_set(
    base.value,
    ARRAY['notificationDelivery', 'byChannel'],
    channel_diagnostics.value,
    false
  ),
  ARRAY['operatorHealthDigestLastSentAt'],
  COALESCE(to_jsonb(digest_delivery.last_sent_at), 'null'::jsonb),
  true
)
FROM base, channel_diagnostics, digest_delivery
$$;


--
-- Name: read_curated_system_health_pre_0196(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_system_health_pre_0196() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH
runtime_config AS MATERIALIZED (
  SELECT
    COALESCE(bool_or(
      key = 'video_hls_pipeline_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS pipeline_enabled,
    COALESCE(bool_or(
      key = 'video_hls_reconcile_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS reconcile_enabled,
    COALESCE(bool_or(
      key = 'video_playback_api_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS playback_enabled
  FROM public.app_runtime_settings
  WHERE organization_id IS NULL
    AND scope = 'admin'
    AND key IN (
      'video_hls_pipeline_enabled',
      'video_hls_reconcile_enabled',
      'video_playback_api_enabled'
    )
),
restricted_config AS MATERIALIZED (
  SELECT
    COALESCE(bool_or(
      key = 'web_push_vapid'
      AND jsonb_typeof(value_json->'value') = 'object'
      AND length(trim(COALESCE(value_json#>>'{value,publicKey}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,privateKey}', ''))) > 0
    ), false) AS vapid_configured,
    COALESCE(bool_or(
      key = 'smtp_outbound'
      AND jsonb_typeof(value_json->'value') = 'object'
      AND length(trim(COALESCE(value_json#>>'{value,host}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,user}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,password}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,from}', ''))) > 0
      AND CASE
        WHEN COALESCE(value_json#>>'{value,port}', '') ~ '^[0-9]{1,5}$'
        THEN (value_json#>>'{value,port}')::integer BETWEEN 1 AND 65535
        ELSE false
      END
    ), false) AS smtp_configured
  FROM public.system_settings
  WHERE organization_id IS NULL
    AND scope = 'admin'
    AND key IN ('web_push_vapid', 'smtp_outbound')
),
transcode AS MATERIALIZED (
  SELECT jsonb_build_object(
    'pendingCount', count(*) FILTER (WHERE status = 'pending'),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'doneLastHour', count(*) FILTER (
      WHERE status = 'done' AND finished_at >= now() - interval '1 hour'
    ),
    'failedLastHour', count(*) FILTER (
      WHERE status = 'failed' AND finished_at >= now() - interval '1 hour'
    ),
    'doneLast24h', count(*) FILTER (
      WHERE status = 'done' AND finished_at >= now() - interval '24 hours'
    ),
    'failedLast24h', count(*) FILTER (
      WHERE status = 'failed' AND finished_at >= now() - interval '24 hours'
    ),
    'doneLifetime', count(*) FILTER (WHERE status = 'done' AND finished_at IS NOT NULL),
    'failedLifetime', count(*) FILTER (WHERE status = 'failed' AND finished_at IS NOT NULL),
    'avgProcessingMsDoneLastHour', round(avg(
      extract(epoch FROM (finished_at - processing_started_at)) * 1000
    ) FILTER (
      WHERE status = 'done'
        AND finished_at >= now() - interval '1 hour'
        AND processing_started_at IS NOT NULL
    )),
    'oldestPendingAgeSeconds', floor(extract(epoch FROM (
      now() - min(created_at) FILTER (WHERE status = 'pending')
    )))
  ) AS value
  FROM public.media_transcode_jobs
),
media_readiness AS MATERIALIZED (
  SELECT jsonb_build_object(
    'legacyReconcileCandidateCountWithinSizeCap', count(*) FILTER (
      WHERE m.mime_type ILIKE 'video/%'
        AND (m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))
        AND m.s3_key IS NOT NULL AND trim(m.s3_key) <> ''
        AND (m.size_bytes IS NULL OR m.size_bytes <= 3221225472::bigint)
        AND (m.video_processing_status IS NULL OR m.video_processing_status = 'none')
        AND (m.hls_master_playlist_s3_key IS NULL OR trim(m.hls_master_playlist_s3_key) = '')
        AND NOT EXISTS (
          SELECT 1
          FROM public.media_transcode_jobs active_job
          WHERE active_job.media_id = m.id
            AND active_job.status IN ('pending', 'processing')
        )
    ),
    'readableVideoReadyWithHlsCount', count(*) FILTER (
      WHERE m.mime_type ILIKE 'video/%'
        AND (m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))
        AND m.video_processing_status = 'ready'
        AND m.hls_master_playlist_s3_key IS NOT NULL
        AND trim(m.hls_master_playlist_s3_key) <> ''
    )
  ) AS value
  FROM public.media_files m
),
safe_jobs AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'jobKey', job_key,
      'jobFamily', job_family,
      'lastStatus', CASE WHEN last_status IN ('success', 'failure') THEN last_status ELSE 'unknown' END,
      'lastFinishedAt', last_finished_at,
      'lastSuccessAt', last_success_at,
      'lastFailureAt', last_failure_at,
      'lastDurationMs', last_duration_ms,
      'safeMeta', CASE
        WHEN job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick' THEN
          jsonb_build_object(
            'failed', CASE WHEN COALESCE(meta_json->>'failed', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'failed')::integer ELSE 0 END,
            'consecutiveCronFailures', CASE
              WHEN COALESCE(meta_json->>'consecutiveCronFailures', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'consecutiveCronFailures')::integer ELSE 0 END
          )
        WHEN job_family = 'health' AND job_key = 'health.outbound_probe.run' THEN
          jsonb_build_object(
            'consecutiveFailRuns', CASE
              WHEN COALESCE(meta_json->>'consecutiveFailRuns', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'consecutiveFailRuns')::integer ELSE 0 END,
            'rubitime', CASE WHEN meta_json->>'rubitime' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'rubitime' ELSE 'no_data' END,
            'telegram', CASE WHEN meta_json->>'telegram' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'telegram' ELSE 'no_data' END,
            'max', CASE WHEN meta_json->>'max' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'max' ELSE 'no_data' END,
            'google_calendar', CASE
              WHEN meta_json->>'google_calendar' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'google_calendar' ELSE 'no_data' END
          )
        ELSE '{}'::jsonb
      END
    ) ORDER BY job_family, job_key
  ), '[]'::jsonb) AS value
  FROM public.operator_job_status
  WHERE (job_family, job_key) IN (
    ('reminders', 'reminders.web_push_only.tick'),
    ('media', 'media.pending_delete.purge'),
    ('media', 'media.multipart.cleanup'),
    ('media', 'media.preview.process'),
    ('media', 'media_transcode.reconcile'),
    ('health', 'health.system_health_guard.tick'),
    ('health', 'health.operator_health_critical.tick'),
    ('health', 'health.operator_health_digest.tick'),
    ('health', 'health.outbound_probe.run'),
    ('media', 'media.playback_stats.retention'),
    ('media', 'media.hls_proxy_errors.retention'),
    ('analytics', 'analytics.product_analytics.retention'),
    ('specialist_tasks', 'specialist_task_reminders.tick'),
    ('backup', 'backup.hourly'),
    ('backup', 'backup.daily'),
    ('backup', 'backup.weekly'),
    ('backup', 'backup.prune')
  )
),
incident_summary AS MATERIALIZED (
  SELECT jsonb_build_object(
    'openCount', count(*),
    'occurrenceCount', COALESCE(sum(occurrence_count), 0),
    'lastSeenAt', max(last_seen_at)
  ) AS value
  FROM public.operator_incidents
  WHERE resolved_at IS NULL
),
outgoing AS MATERIALIZED (
  SELECT jsonb_build_object(
    'dueBacklog', count(*) FILTER (
      WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now()
    ),
    'deadTotal', count(*) FILTER (
      WHERE status = 'dead' AND (failure_class IS NULL OR failure_class <> 'recipient_blocked_bot')
    ),
    'blockedRecipientTotal', count(*) FILTER (
      WHERE status = 'dead' AND failure_class = 'recipient_blocked_bot'
    ),
    'oldestDueAgeSeconds', floor(extract(epoch FROM (
      now() - min(created_at) FILTER (
        WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now()
      )
    ))),
    'dueByChannel', jsonb_build_object(
      'telegram', count(*) FILTER (WHERE channel = 'telegram' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'max', count(*) FILTER (WHERE channel = 'max' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'web_push', count(*) FILTER (WHERE channel = 'web_push' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'email', count(*) FILTER (WHERE channel = 'email' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'sms', count(*) FILTER (WHERE channel = 'sms' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'bot_message', count(*) FILTER (WHERE channel = 'bot_message' AND status IN ('pending','failed_retryable') AND next_retry_at <= now())
    ),
    'dueByKind', jsonb_build_object(
      'reminder_dispatch', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status IN ('pending','failed_retryable') AND next_retry_at <= now())
    ),
    'deadByKind', jsonb_build_object(
      'reminder_dispatch', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status = 'dead' AND (failure_class IS NULL OR failure_class <> 'recipient_blocked_bot'))
    ),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'reminderProcessingCount', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status = 'processing'),
    'lastSentAt', max(sent_at),
    'lastQueueActivityAt', max(updated_at)
  ) AS value
  FROM public.outgoing_delivery_queue
),
push_outbox AS MATERIALIZED (
  SELECT jsonb_build_object(
    'dueBacklog', count(*) FILTER (WHERE status = 'pending' AND next_try_at <= now()),
    'deadTotal', count(*) FILTER (WHERE status = 'dead'),
    'oldestDueAgeSeconds', floor(extract(epoch FROM (
      now() - min(next_try_at) FILTER (WHERE status = 'pending' AND next_try_at <= now())
    ))),
    'dueByKind', jsonb_build_object(
      'system_settings_sync', count(*) FILTER (WHERE kind = 'system_settings_sync' AND status = 'pending' AND next_try_at <= now()),
      'reminder_rule_upsert', count(*) FILTER (WHERE kind = 'reminder_rule_upsert' AND status = 'pending' AND next_try_at <= now())
    ),
    'deadByKind', jsonb_build_object(
      'system_settings_sync', count(*) FILTER (WHERE kind = 'system_settings_sync' AND status = 'dead'),
      'reminder_rule_upsert', count(*) FILTER (WHERE kind = 'reminder_rule_upsert' AND status = 'dead')
    ),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'oldestProcessingAgeSeconds', floor(extract(epoch FROM (
      now() - min(updated_at) FILTER (WHERE status = 'processing')
    ))),
    'lastQueueActivityAt', max(updated_at)
  ) AS value
  FROM public.integrator_push_outbox
),
reminders AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'occurrenceHistory', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.reminder_occurrence_history WHERE status = 'sent' AND occurred_at >= now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM public.reminder_occurrence_history WHERE status = 'failed' AND occurred_at >= now() - interval '24 hours')
    ),
    'deliveryEvents', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.reminder_delivery_events WHERE status = 'sent' AND created_at >= now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM public.reminder_delivery_events WHERE status = 'failed' AND created_at >= now() - interval '24 hours')
    ),
    'patientReminderM2mIdempotencyKeysActive', (
      SELECT count(*) FROM public.idempotency_keys
      WHERE key LIKE 'prn:%:channels' AND expires_at > now()
    )
  ) AS value
),
web_push AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'activeSubscriptionsCount', count(*),
    'usersWithSubscriptionCount', count(DISTINCT user_id),
    'subscriptionsTouchedLast24h', count(*) FILTER (WHERE updated_at >= now() - interval '24 hours')
  ) AS value
  FROM public.user_web_push_subscriptions
),
notification_counts AS MATERIALIZED (
  SELECT channel, status, count(*) AS count
  FROM public.notification_delivery_attempts
  WHERE created_at >= now() - interval '24 hours'
    AND channel IN ('telegram','max','web_push','email')
    AND status IN ('success','failed','skipped')
  GROUP BY channel, status
),
notification_delivery AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'totalAttempts24h', COALESCE((SELECT sum(count) FROM notification_counts), 0),
    'byChannel', (
      SELECT jsonb_object_agg(channel, jsonb_build_object(
        'successCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'success'), 0),
        'failedCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'failed'), 0),
        'skippedCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'skipped'), 0),
        'lastAttemptAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.created_at >= now() - interval '24 hours'),
        'lastSuccessAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.status = 'success' AND a.created_at >= now() - interval '24 hours'),
        'lastErrorAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.status IN ('failed','skipped') AND a.created_at >= now() - interval '24 hours'),
        'lastErrorReason', NULL,
        'lastErrorMessage', NULL
      ))
      FROM (VALUES ('telegram'),('max'),('web_push'),('email')) AS channels(channel)
    ),
    'recentIssues', '[]'::jsonb
  ) AS value
),
webhook_status AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source', source,
    'receivedAt', received_at,
    'processedOk', processed_ok = 1,
    'httpStatusReturned', http_status_returned
  ) ORDER BY source), '[]'::jsonb) AS value
  FROM public.integration_webhook_last_status
  WHERE source IN ('rubitime','telegram','max')
),
digest AS MATERIALIZED (
  SELECT max(sent_at) FILTER (WHERE dedup_key LIKE 'digest:%') AS last_sent_at
  FROM public.operator_health_alert_sent
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'config', jsonb_build_object(
    'pipelineEnabled', runtime_config.pipeline_enabled,
    'reconcileEnabled', runtime_config.reconcile_enabled,
    'playbackEnabled', runtime_config.playback_enabled,
    'vapidConfigured', restricted_config.vapid_configured,
    'smtpConfigured', restricted_config.smtp_configured
  ),
  'videoTranscode', transcode.value || media_readiness.value,
  'operatorJobs', safe_jobs.value,
  'operatorIncidents', incident_summary.value,
  'outgoingDelivery', outgoing.value,
  'integratorPushOutbox', push_outbox.value,
  'remindersPipeline', reminders.value || jsonb_build_object(
    'outgoingReminderDispatch', jsonb_build_object(
      'due', outgoing.value#>'{dueByKind,reminder_dispatch}',
      'dead', outgoing.value#>'{deadByKind,reminder_dispatch}',
      'processing', outgoing.value->'reminderProcessingCount'
    )
  ),
  'webPush', web_push.value,
  'notificationDelivery', notification_delivery.value,
  'integrationWebhookStatus', webhook_status.value,
  'operatorHealthDigestLastSentAt', digest.last_sent_at
)
FROM runtime_config, restricted_config, transcode, media_readiness, safe_jobs,
  incident_summary, outgoing, push_outbox, reminders, web_push, notification_delivery,
  webhook_status, digest
$_$;


--
-- Name: read_current_org_tariff_transition_usage(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_org_tariff_transition_usage() RETURNS TABLE(organization_id uuid, clinic_team_used integer, patient_count_used integer, files_used bigint, branches_used integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_clinic_billing'::name, 'app_staff'::name]::name[]);
SELECT
        context.organization_id,
        usage.clinic_team_used,
        usage.patient_count_used,
        usage.files_used,
        (
          SELECT count(*)::integer
          FROM public.be_branches AS branch
          WHERE branch.organization_id = context.organization_id
            AND branch.is_active = true
        ) AS branches_used
      FROM (SELECT app.current_org_id() AS organization_id) AS context
      CROSS JOIN LATERAL app.read_org_enforced_quota_usage(context.organization_id) AS usage
      WHERE context.organization_id IS NOT NULL
    $$;


--
-- Name: read_current_patient_active_organizations(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_active_organizations() RETURNS TABLE(organization_id uuid, organization_title text, platform_user_id uuid, enrollment_created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_org_projection_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.organization.resolve', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_current_patient_active_organizations()'::regprocedure);

  PERFORM app.require_attested_context_for_roles('app_seam_patient_org_projection_owner'::name, ARRAY['app_patient'::name]::name[]);
  IF v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT organization.id, organization.title, v_patient_user_id, enrollment.created_at
  FROM public.org_enrollments AS enrollment
  INNER JOIN public.be_organizations AS organization
    ON organization.id = enrollment.organization_id
   AND organization.is_active = true
  WHERE enrollment.platform_user_id = v_patient_user_id
    AND enrollment.status = 'active'
  ORDER BY enrollment.created_at, organization.id;
END
$$;


--
-- Name: read_current_patient_appointment_history(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_appointment_history() RETURNS TABLE(appointment_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text, subtitle text, specialist_name text, branch_title text, room_title text, service_title text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_booking_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    appointment.id,
    appointment.start_at,
    appointment.end_at,
    appointment.status,
    COALESCE(
      NULLIF(concat_ws(' · ', NULLIF(service.title, ''), NULLIF(branch.title, '')), ''),
      'Приём'
    ),
    specialist.full_name,
    branch.title,
    room.title,
    service.title
  FROM public.be_appointments AS appointment
  LEFT JOIN public.be_specialists AS specialist
    ON specialist.id = appointment.specialist_id
   AND specialist.organization_id = v_organization_id
  LEFT JOIN public.be_branches AS branch
    ON branch.id = appointment.branch_id
   AND branch.organization_id = v_organization_id
  LEFT JOIN public.be_rooms AS room
    ON room.id = appointment.room_id
   AND room.organization_id = v_organization_id
  LEFT JOIN public.be_clinic_services AS service
    ON service.id = appointment.service_id
   AND service.organization_id = v_organization_id
  WHERE appointment.organization_id = v_organization_id
    AND appointment.platform_user_id = v_patient_user_id
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.start_at DESC, appointment.id DESC
  LIMIT 100;
END
$$;


--
-- Name: read_current_patient_booking_catalog(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_booking_catalog() RETURNS TABLE(branch_id uuid, branch_title text, city_code text, branch_sort_order integer, service_id uuid, service_title text, service_description text, duration_minutes integer, price_minor integer, service_sort_order integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_booking_owner'::name, ARRAY['app_patient'::name]::name[]);
WITH principal AS (
    SELECT app.current_org_id() AS organization_id,
           app.current_patient_user_id() AS patient_user_id
  )
  SELECT DISTINCT
    branch.id,
    branch.title,
    branch.city_code,
    branch.sort_order,
    service.id,
    service.title,
    service.description,
    service.duration_minutes,
    service.price_minor,
    service.sort_order
  FROM principal
  JOIN public.org_enrollments enrollment
    ON enrollment.organization_id = principal.organization_id
   AND enrollment.platform_user_id = principal.patient_user_id
   AND enrollment.status = 'active'
  JOIN public.be_branches branch
    ON branch.organization_id = principal.organization_id
   AND branch.is_active = true
  JOIN public.be_specialist_service_availability availability
    ON availability.organization_id = principal.organization_id
   AND availability.branch_id = branch.id
   AND availability.is_active = true
  JOIN public.be_specialists specialist
    ON specialist.id = availability.specialist_id
   AND specialist.organization_id = principal.organization_id
   AND specialist.is_active = true
  JOIN public.be_clinic_services service
    ON service.id = availability.service_id
   AND service.organization_id = principal.organization_id
   AND service.is_active = true
   AND service.public_widget_visible = true
   AND service.admin_manual_only = false
  WHERE principal.organization_id IS NOT NULL
    AND principal.patient_user_id IS NOT NULL
  ORDER BY branch.sort_order, branch.title, service.sort_order, service.title
$$;


--
-- Name: read_current_patient_booking_rows(text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_booking_rows(p_kind text, p_now timestamp with time zone) RETURNS TABLE(booking jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_booking_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_org IS NULL OR v_patient IS NULL OR p_kind NOT IN ('upcoming', 'history') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH scoped AS MATERIALIZED (
    SELECT row.*
    FROM public.patient_bookings row
    WHERE row.platform_user_id = v_patient
      AND (
        row.organization_id IS NULL
        OR (
          row.organization_id = v_org
          AND EXISTS (
            SELECT 1 FROM public.be_appointments appointment
            WHERE appointment.id = row.canonical_appointment_id
              AND appointment.organization_id = v_org
              AND appointment.platform_user_id = v_patient
              AND appointment.deleted_at IS NULL
          )
        )
      )
  ), selected AS (
    SELECT row.*
    FROM scoped row
    WHERE (
      p_kind = 'upcoming'
      AND row.cancelled_at IS NULL
      AND row.status IN ('creating','awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
      AND row.slot_start >= p_now
      AND NOT (row.status = 'creating' AND row.canonical_appointment_id IS NULL)
      AND NOT (
        row.status = 'creating' AND EXISTS (
          SELECT 1 FROM scoped newer
          WHERE newer.id <> row.id
            AND newer.status IN ('awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
            AND newer.slot_start = row.slot_start AND newer.slot_end = row.slot_end
            AND COALESCE(newer.branch_service_id::text, '') = COALESCE(row.branch_service_id::text, '')
            AND COALESCE(newer.booking_type, '') = COALESCE(row.booking_type, '')
            AND COALESCE(newer.category, '') = COALESCE(row.category, '')
        )
      )
    ) OR (
      p_kind = 'history'
      AND (row.slot_start < p_now OR row.status IN ('cancelled','completed','no_show','failed_sync'))
    )
    ORDER BY
      CASE WHEN p_kind = 'upcoming' THEN row.slot_start END ASC,
      CASE WHEN p_kind = 'history' THEN row.slot_start END DESC,
      row.created_at DESC
    LIMIT 100
  ), enriched AS (
    SELECT
      row.*,
      CASE
        WHEN row.booking_type = 'in_person'
          AND appointment.id IS NOT NULL
          AND branch.id IS NOT NULL
          AND service.id IS NOT NULL
          AND branch.is_active = TRUE
          AND service.is_active = TRUE
          AND service.public_widget_visible = TRUE
          AND service.admin_manual_only = FALSE
          AND EXISTS (
            SELECT 1
            FROM public.be_specialist_service_availability availability
            JOIN public.be_specialists specialist
              ON specialist.id = availability.specialist_id
             AND specialist.organization_id = availability.organization_id
             AND specialist.is_active = TRUE
            WHERE availability.organization_id = appointment.organization_id
              AND availability.specialist_id = appointment.specialist_id
              AND availability.branch_id = appointment.branch_id
              AND availability.service_id = appointment.service_id
              AND availability.is_active = TRUE
          )
        THEN jsonb_build_object(
          'branchId', appointment.branch_id,
          'serviceId', appointment.service_id,
          'cityCode', branch.city_code,
          'branchTitle', branch.title,
          'serviceTitle', service.title,
          'durationMinutes', appointment.duration_minutes,
          'priceMinor', service.price_minor
        )
        ELSE NULL
      END AS canonical_in_person_context
    FROM selected row
    LEFT JOIN public.be_appointments appointment
      ON appointment.id = row.canonical_appointment_id
     AND appointment.organization_id = v_org
    LEFT JOIN public.be_branches branch
      ON branch.id = appointment.branch_id
     AND branch.organization_id = appointment.organization_id
    LEFT JOIN public.be_clinic_services service
      ON service.id = appointment.service_id
     AND service.organization_id = appointment.organization_id
  )
  SELECT jsonb_build_object(
    'id', row.id, 'organization_id', row.organization_id, 'platform_user_id', row.platform_user_id,
    'booking_type', row.booking_type, 'city', row.city, 'category', row.category,
    'slot_start', row.slot_start, 'slot_end', row.slot_end, 'status', row.status,
    'cancelled_at', row.cancelled_at, 'cancel_reason', row.cancel_reason, 'gcal_event_id', row.gcal_event_id,
    'contact_phone', row.contact_phone,
    'contact_email', row.contact_email, 'contact_name', row.contact_name,
    'reminder_24h_sent', row.reminder_24h_sent, 'reminder_2h_sent', row.reminder_2h_sent,
    'created_at', row.created_at, 'updated_at', row.updated_at, 'branch_id', row.branch_id,
    'service_id', row.service_id, 'branch_service_id', row.branch_service_id,
    'city_code_snapshot', row.city_code_snapshot, 'branch_title_snapshot', row.branch_title_snapshot,
    'service_title_snapshot', row.service_title_snapshot,
    'duration_minutes_snapshot', row.duration_minutes_snapshot,
    'price_minor_snapshot', row.price_minor_snapshot,
    'provenance_created_by', row.provenance_created_by,
    'provenance_updated_by', row.provenance_updated_by,
    'canonical_appointment_id', row.canonical_appointment_id,
    'canonical_in_person_context', row.canonical_in_person_context
  )
  FROM enriched row;
END
$$;


--
-- Name: read_current_patient_material_rating_snapshot(text, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_material_rating_snapshot(p_target_kind text, p_target_id uuid) RETURNS TABLE(rating_count bigint, avg_stars numeric, c1 bigint, c2 bigint, c3 bigint, c4 bigint, c5 bigint, my_stars integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.material-rating.snapshot.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg]), 'app.read_current_patient_material_rating_snapshot(text,uuid)'::regprocedure);

  IF p_target_kind <> ALL (ARRAY['content_page', 'lfk_exercise', 'lfk_complex']) THEN
    RAISE EXCEPTION 'unsupported material rating target kind' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    avg(rating.stars)::numeric,
    count(*) FILTER (WHERE rating.stars = 1)::bigint,
    count(*) FILTER (WHERE rating.stars = 2)::bigint,
    count(*) FILTER (WHERE rating.stars = 3)::bigint,
    count(*) FILTER (WHERE rating.stars = 4)::bigint,
    count(*) FILTER (WHERE rating.stars = 5)::bigint,
    max(rating.stars) FILTER (
      WHERE rating.user_id = app.current_patient_user_id()
    )::integer
  FROM public.material_ratings AS rating
  WHERE rating.organization_id = app.current_org_id()
    AND rating.target_kind = p_target_kind
    AND rating.target_id = p_target_id;
END
$_$;


--
-- Name: read_current_patient_organization_entitlements(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_organization_entitlements() RETURNS TABLE(tariff_mechanics jsonb, tariff_quotas jsonb, tariff_system_access_policy jsonb, tariff_mechanic_access_policies jsonb, included_seats integer, override_mechanic text, override_enabled boolean, override_quota jsonb, override_expires_at timestamp with time zone, seat_limit_override integer, lifecycle text, effective_tariff_id uuid, access_source text, degradation_started_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_org_projection_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH exact_context AS (
    SELECT organization.id, organization.tariff_id
    FROM public.org_enrollments AS enrollment
    INNER JOIN public.be_organizations AS organization
      ON organization.id = enrollment.organization_id
     AND organization.is_active = true
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ), active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    INNER JOIN exact_context ON exact_context.id = trial.organization_id
    WHERE trial.status = 'active'
    LIMIT 1
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    INNER JOIN exact_context ON exact_context.id = subscription.organization_id
    WHERE subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), global_paid_policy AS (
    SELECT
      policy.post_paid_period_behavior,
      policy.post_paid_period_tariff_id
    FROM public.saas_paid_period_policy AS policy
    WHERE policy.key = 'global'
      AND policy.is_active = true
    LIMIT 1
  ), effective AS (
    SELECT
      context.id AS organization_id,
      CASE
        WHEN trial.id IS NOT NULL AND v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.id IS NOT NULL AND trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        WHEN trial.id IS NOT NULL THEN trial.tariff_id
        WHEN paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN global_paid_policy.post_paid_period_tariff_id
        ELSE context.tariff_id
      END AS tariff_id,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior IS NOT NULL
          THEN CASE
            WHEN global_paid_policy.post_paid_period_behavior = 'tariff' THEN 'active'
            ELSE global_paid_policy.post_paid_period_behavior
          END
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN 'post_paid_period_tariff'
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at
    FROM exact_context AS context
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
    LEFT JOIN global_paid_policy ON true
  )
  SELECT
    tariff.mechanics,
    tariff.quotas,
    tariff.system_access_policy,
    tariff.mechanic_access_policies,
    tariff.included_seats,
    entitlement_override.mechanic,
    entitlement_override.enabled,
    entitlement_override.quota,
    entitlement_override.expires_at,
    entitlement_override.seat_limit_override,
    effective.lifecycle,
    effective.tariff_id,
    effective.access_source,
    effective.degradation_started_at
  FROM effective
  LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = effective.organization_id
   AND (entitlement_override.expires_at IS NULL OR entitlement_override.expires_at > v_now)
  ORDER BY entitlement_override.mechanic;
END
$$;


--
-- Name: read_current_patient_ui_setting(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_ui_setting(p_key text, p_scope text) RETURNS TABLE(key text, scope text, organization_id uuid, value_json jsonb, updated_at timestamp with time zone, updated_by uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid;
  v_patient_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_settings_runtime_owner'::name, ARRAY['app_patient'::name]::name[]);

  v_organization_id := app.current_org_id();
  v_patient_user_id := app.current_patient_user_id();
  IF v_patient_user_id IS NULL OR p_scope <> 'admin' THEN
    RETURN;
  END IF;
  IF p_key NOT IN (
    'patient_home_mood_icons',
    'patient_home_daily_warmup_repeat_cooldown_minutes',
    'patient_home_daily_warmup_rotation_enabled',
    'patient_home_daily_warmup_rotation_times',
    'patient_home_daily_practice_target',
    'notifications_topics',
    'patient_default_promo_treatment_program_template_id'
  ) THEN
    RETURN;
  END IF;
  IF v_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.value_json,
         setting.updated_at, setting.updated_by
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (
      setting.organization_id IS NULL
      OR (v_organization_id IS NOT NULL AND setting.organization_id = v_organization_id)
    )
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
END
$$;


--
-- Name: read_global_server_runtime_setting(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_global_server_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_runtime_owner'::name, ARRAY['app_integrator_request'::name]::name[]);
SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN ('app_base_url', 'error_tracking_enabled', 'error_tracking_dsn')
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience IN ('server', 'public')
    AND setting.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: read_integrator_auth_channel_setting(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_auth_channel_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_integrator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'config.integrator-auth-channel.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_integrator_auth_channel_setting(text)'::regprocedure);

  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE p_key IN ('auth_email_enabled','auth_sms_enabled','auth_telegram_enabled','auth_max_enabled')
    AND setting.key = p_key AND setting.scope = 'admin' AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END
$_$;


--
-- Name: read_integrator_clinic_delivery_credential(text, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_clinic_delivery_credential(p_key text, p_organization_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_integrator_request'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound', 'clinic_smsc_api_key',
      'clinic_telegram_bot_token', 'clinic_max_bot_api_key'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
  LIMIT 1
$$;


--
-- Name: read_integrator_google_calendar_setting(text, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_google_calendar_setting(p_key text, p_organization_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_integrator_request'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE (
      (p_organization_id IS NULL
        AND p_key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri')
        AND setting.organization_id IS NULL)
      OR
      (p_organization_id IS NOT NULL
        AND p_key IN ('google_calendar_enabled', 'google_calendar_id', 'google_refresh_token')
        AND setting.organization_id = p_organization_id)
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
  LIMIT 1
$$;


--
-- Name: read_integrator_migration_ledger(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_migration_ledger() RETURNS TABLE(version text, applied_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'integrator', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.require_accepted_context('app_seam_catalog_admin_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'migration.ledger.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_integrator_migration_ledger()'::regprocedure);

  RETURN QUERY SELECT m.version, m.applied_at FROM integrator.schema_migrations m ORDER BY m.version;
END
$$;


--
-- Name: read_integrator_platform_integration_availability(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_platform_integration_availability() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'platform_integration_availability'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: read_integrator_projection_health(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_projection_health(p_retry_threshold integer) RETURNS TABLE(pending_count bigint, dead_count bigint, cancelled_count bigint, oldest_pending_at text, processing_count bigint, retry_distribution jsonb, last_success_at text, retries_over_threshold bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'integrator', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.projection-health.read', app.hash_port_typed_args(ARRAY[ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg]), 'app.read_integrator_projection_health(integer)'::regprocedure);

  IF p_retry_threshold IS NULL OR p_retry_threshold < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'retry threshold must be non-negative';
  END IF;
  RETURN QUERY
  WITH summary AS (
    SELECT
      count(*) FILTER (WHERE outbox.status = 'pending') AS pending_count,
      count(*) FILTER (WHERE outbox.status = 'dead') AS dead_count,
      count(*) FILTER (WHERE outbox.status = 'cancelled') AS cancelled_count,
      (min(outbox.next_try_at) FILTER (WHERE outbox.status = 'pending'))::text AS oldest_pending_at,
      count(*) FILTER (WHERE outbox.status = 'processing') AS processing_count,
      (max(outbox.updated_at) FILTER (WHERE outbox.status = 'done'))::text AS last_success_at,
      count(*) FILTER (
        WHERE outbox.status IN ('pending', 'processing')
          AND outbox.attempts_done >= p_retry_threshold
      ) AS retries_over_threshold
    FROM integrator.projection_outbox AS outbox
  ), retry_counts AS (
    SELECT coalesce(jsonb_object_agg(retries.attempts_done::text, retries.row_count
      ORDER BY retries.attempts_done), '{}'::jsonb) AS retry_distribution
    FROM (
      SELECT outbox.attempts_done, count(*) AS row_count
      FROM integrator.projection_outbox AS outbox
      WHERE outbox.status IN ('pending', 'processing')
      GROUP BY outbox.attempts_done
    ) AS retries
  )
  SELECT summary.pending_count, summary.dead_count, summary.cancelled_count,
    summary.oldest_pending_at, summary.processing_count, retry_counts.retry_distribution,
    summary.last_success_at, summary.retries_over_threshold
  FROM summary CROSS JOIN retry_counts;
END
$_$;


--
-- Name: read_integrator_provider_runtime_setting(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_provider_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_integrator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'config.integrator-provider.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_integrator_provider_runtime_setting(text)'::regprocedure);

  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE p_key IN ('telegram_bot_token','telegram_webhook_secret','telegram_send_menu_on_button_press',
                  'max_bot_api_key','max_webhook_secret','max_api_base_url',
                  'smsc_enabled','smsc_api_key','smsc_base_url')
    AND setting.key = p_key AND setting.scope = 'admin' AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END
$_$;


--
-- Name: read_integrator_runtime_setting(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$SELECT app.require_accepted_context('app_seam_settings_integrator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'config.integrator-runtime.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_integrator_runtime_setting(text)'::regprocedure);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'admin_telegram_ids', 'admin_max_ids',
      'doctor_telegram_ids', 'doctor_max_ids', 'operator_health_alert_config',
      'admin_incident_alert_config', 'app_display_timezone',
      'notif_template:created:patient', 'notif_template:created:doctor',
      'notif_template:cancelled:patient', 'notif_template:cancelled:doctor',
      'notif_template:rescheduled:patient', 'notif_template:rescheduled:doctor'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$_$;


--
-- Name: read_integrator_smtp_outbound_setting(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_integrator_smtp_outbound_setting() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE value_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_integrator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'config.integrator-smtp.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_integrator_smtp_outbound_setting()'::regprocedure);

  SELECT setting.value_json INTO value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'smtp_outbound' AND setting.scope = 'admin' AND setting.organization_id IS NULL
  LIMIT 1;
  RETURN value_json;
END
$$;


--
-- Name: read_last_saas_isolation_coverage(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_last_saas_isolation_coverage() RETURNS TABLE(id uuid, status text, started_at timestamp with time zone, finished_at timestamp with time zone, services_checked text[], checks_count integer, unexpected_errors_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_telemetry_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
SELECT id, status, started_at, finished_at, services_checked, checks_count, unexpected_errors_count
  FROM public.saas_isolation_coverage_runs ORDER BY finished_at DESC LIMIT 1
$$;


--
-- Name: read_media_worker_runtime_setting(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_media_worker_runtime_setting(p_key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_runtime_owner'::name, ARRAY['app_operational_media_worker'::name]::name[]);
SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN (
      'video_hls_pipeline_enabled', 'video_hls_reconcile_enabled',
      'video_hls_new_uploads_auto_transcode', 'video_watermark_enabled',
      'error_tracking_enabled', 'error_tracking_dsn'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: read_operator_health_probe_config(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_operator_health_probe_config() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'operator_health_probe_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: read_operator_outbound_probe_meta(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_operator_outbound_probe_meta() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
SELECT COALESCE((
    SELECT status.meta_json
    FROM public.operator_job_status AS status
    WHERE status.job_key = 'health.outbound_probe.run'
    LIMIT 1
  ), '{}'::jsonb)
$$;


--
-- Name: read_org_brand_core_context(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_org_brand_core_context(p_organization_id uuid) RETURNS TABLE(organization_id uuid, display_name text, is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_org_projection_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
SELECT organization.id, organization.title, organization.is_active
  FROM public.be_organizations AS organization
  WHERE organization.id = p_organization_id
    AND (
      (app.current_org_id() IS NOT NULL AND app.current_org_id() = p_organization_id)
      OR app.current_patient_has_active_org_enrollment(p_organization_id)
    )
  LIMIT 1
$$;


--
-- Name: read_org_enforced_quota_usage(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_org_enforced_quota_usage(p_organization_id uuid) RETURNS TABLE(clinic_team_used integer, patient_count_used integer, files_used bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_clinic_billing'::name, 'app_platform_settings'::name, 'app_staff'::name]::name[]);
SELECT
        (
          (SELECT count(*) FROM public.be_organization_members AS membership
           WHERE membership.organization_id = p_organization_id
             AND membership.status = 'active'
             AND membership.specialist_id IS NOT NULL)
          +
          (SELECT count(*) FROM public.organization_member_invites AS invite
           WHERE invite.organization_id = p_organization_id
             AND invite.status = 'pending'
             AND invite.expires_at > now()
             AND invite.invited_role = 'doctor')
          +
          (SELECT count(*) FROM public.organization_member_invites AS invite
           JOIN public.be_organization_members AS membership
             ON membership.id = invite.accepted_membership_id
           WHERE invite.organization_id = p_organization_id
             AND invite.status = 'accepted'
             AND invite.invited_role = 'doctor'
             AND membership.status = 'active'
             AND membership.specialist_id IS NULL)
        )::integer AS clinic_team_used,
        (SELECT count(*) FROM public.org_enrollments AS enrollment
         WHERE enrollment.organization_id = p_organization_id
           AND enrollment.status IN ('invited', 'active'))::integer AS patient_count_used,
        COALESCE(
          (SELECT sum(file.size_bytes) FROM public.patient_files AS file
           WHERE file.organization_id = p_organization_id),
          0
        )::bigint AS files_used
      WHERE p_organization_id IS NOT NULL
    $$;


--
-- Name: read_outbound_provider_incident_health(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_outbound_provider_incident_health() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
SELECT jsonb_build_object(
    'openCount', count(*)::int,
    'acknowledgedCount', count(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int,
    'unacknowledgedCount', count(*) FILTER (WHERE acknowledged_at IS NULL)::int
  )
  FROM public.operator_incidents
  WHERE resolved_at IS NULL
    AND direction = 'outbound_delivery_provider';
$$;


--
-- Name: read_outgoing_delivery_reclaim_config(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_outgoing_delivery_reclaim_config() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'outgoing_delivery_reclaim_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: read_patient_lfk_complex_cover(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_patient_lfk_complex_cover(p_complex_id uuid) RETURNS TABLE(cover_image_url text, cover_media_type text, cover_media_id uuid, preview_sm_key text, preview_md_key text, preview_status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_lfk_media_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    media.media_url,
    media.media_type,
    file.id,
    file.preview_sm_key,
    file.preview_md_key,
    file.preview_status
  FROM public.lfk_complexes AS complex
  JOIN public.lfk_complex_exercises AS complex_exercise
    ON complex_exercise.complex_id = complex.id
   AND complex_exercise.organization_id = complex.organization_id
  JOIN public.lfk_exercise_media AS media
    ON media.exercise_id = complex_exercise.exercise_id
   AND (
     (media.owner_kind = 'platform' AND media.organization_id IS NULL)
     OR (
       media.owner_kind = 'organization'
       AND media.organization_id = complex.organization_id
     )
   )
  LEFT JOIN public.media_files AS file
    ON file.id = NULLIF(
      substring(
        btrim(media.media_url)
        FROM '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'
      ),
      ''
    )::uuid
   AND (
     (
       media.owner_kind = 'platform'
       AND file.owner_kind = 'platform'
       AND file.organization_id IS NULL
     )
     OR (
       media.owner_kind = 'organization'
       AND file.organization_id = complex.organization_id
     )
   )
  WHERE complex.id = p_complex_id
    AND app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND complex.organization_id = app.current_org_id()
    AND (
      complex.platform_user_id = app.current_patient_user_id()
      OR (
        complex.platform_user_id IS NULL
        AND complex.user_id = app.current_patient_user_id()::text
      )
    )
  ORDER BY complex_exercise.sort_order ASC, media.sort_order ASC, media.created_at ASC
  LIMIT 1
$$;


--
-- Name: read_patient_lfk_complex_exercise_lines(uuid[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_patient_lfk_complex_exercise_lines(p_complex_ids uuid[]) RETURNS TABLE(complex_id uuid, id uuid, sort_order integer, exercise_title text, comment text, local_comment text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_lfk_media_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT
    complex_exercise.complex_id,
    complex_exercise.id,
    complex_exercise.sort_order,
    COALESCE(NULLIF(btrim(exercise.title), ''), 'Упражнение'),
    complex_exercise.comment,
    complex_exercise.local_comment
  FROM public.lfk_complex_exercises AS complex_exercise
  JOIN public.lfk_complexes AS complex
    ON complex.id = complex_exercise.complex_id
   AND complex.organization_id = complex_exercise.organization_id
  JOIN public.lfk_exercises AS exercise
    ON exercise.id = complex_exercise.exercise_id
   AND (
     (exercise.owner_kind = 'platform' AND exercise.organization_id IS NULL)
     OR (
       exercise.owner_kind = 'organization'
       AND exercise.organization_id = complex.organization_id
     )
   )
  WHERE complex.id = ANY(COALESCE(p_complex_ids, ARRAY[]::uuid[]))
    AND app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND complex.organization_id = app.current_org_id()
    AND (
      complex.platform_user_id = app.current_patient_user_id()
      OR (
        complex.platform_user_id IS NULL
        AND complex.user_id = app.current_patient_user_id()::text
      )
    )
  ORDER BY complex_exercise.complex_id, complex_exercise.sort_order ASC, complex_exercise.id ASC
$$;


--
-- Name: read_patient_telegram_display_handle(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_patient_telegram_display_handle(p_platform_user_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE v_handle text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_staff'::name, 'staff'::app.port_context_class, 'messaging.patient-telegram-handle.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_patient_telegram_display_handle(uuid)'::regprocedure);

  IF p_platform_user_id IS NULL OR app.current_org_id() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.be_organization_members member
     WHERE member.platform_user_id = p_platform_user_id
       AND member.organization_id = app.current_org_id()
       AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization patient required';
  END IF;
  SELECT binding.display_handle INTO v_handle
    FROM public.user_channel_bindings binding
   WHERE binding.user_id = p_platform_user_id
     AND binding.channel_code = 'telegram'
   LIMIT 1;
  RETURN v_handle;
END
$_$;


--
-- Name: read_platform_lfk_media_entitlement_refs(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_platform_lfk_media_entitlement_refs(p_media_id uuid) RETURNS TABLE(item_type text, item_ref_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_lfk_media_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
WITH media_exercise AS (
    SELECT DISTINCT exercise.id
    FROM public.media_files AS file
    JOIN public.lfk_exercise_media AS media
      ON media.media_url = '/api/media/' || file.id::text
     AND media.owner_kind = 'platform'
     AND media.organization_id IS NULL
    JOIN public.lfk_exercises AS exercise
      ON exercise.id = media.exercise_id
     AND exercise.owner_kind = 'platform'
     AND exercise.organization_id IS NULL
    WHERE file.id = p_media_id
      AND file.owner_kind = 'platform'
      AND file.organization_id IS NULL
      AND (file.status IS NULL OR file.status NOT IN ('pending', 'deleting', 'pending_delete'))
  )
  SELECT 'exercise'::text, media_exercise.id
  FROM media_exercise
  WHERE app.current_org_id() IS NOT NULL
  UNION
  SELECT 'lfk_complex'::text, template.id
  FROM media_exercise
  JOIN public.lfk_complex_template_exercises AS template_exercise
    ON template_exercise.exercise_id = media_exercise.id
  JOIN public.lfk_complex_templates AS template
    ON template.id = template_exercise.template_id
  WHERE app.current_org_id() IS NOT NULL
    AND (
      (
        template.owner_kind = 'platform'
        AND template.organization_id IS NULL
        AND template_exercise.owner_kind = 'platform'
        AND template_exercise.organization_id IS NULL
      )
      OR (
        template.owner_kind = 'organization'
        AND template.organization_id = app.current_org_id()
        AND template_exercise.owner_kind = 'organization'
        AND template_exercise.organization_id = app.current_org_id()
      )
    )
$$;


--
-- Name: read_platform_media_row(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_platform_media_row(p_media_id uuid) RETURNS TABLE(id text, mime_type text, s3_key text, stored_path text, status text, usage_purpose text, uploaded_by text, video_processing_status text, hls_master_playlist_s3_key text, poster_s3_key text, video_duration_seconds integer, available_qualities_json jsonb, video_delivery_override text, preview_sm_key text, preview_md_key text, preview_status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_patient_lfk_media_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);
SELECT
    id::text,
    mime_type,
    s3_key,
    stored_path,
    status,
    usage_purpose,
    uploaded_by::text,
    video_processing_status,
    hls_master_playlist_s3_key,
    poster_s3_key,
    video_duration_seconds,
    available_qualities_json,
    video_delivery_override,
    preview_sm_key,
    preview_md_key,
    preview_status
  FROM public.media_files
  WHERE id = p_media_id
    AND owner_kind = 'platform'
    AND organization_id IS NULL
    AND (status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))
$$;


--
-- Name: read_public_runtime_setting(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text) RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_runtime_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.runtime.public.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.read_public_runtime_setting(text,text)'::regprocedure);

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
    FROM public.app_runtime_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND setting.audience = 'public'
   LIMIT 1;
END
$_$;


--
-- Name: read_reminder_transactional_email_cooldown(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_reminder_transactional_email_cooldown(p_user_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_reminder_email_cooldown_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);
SELECT cooldown.last_sent_at
  FROM public.email_send_cooldowns AS cooldown
  WHERE cooldown.user_id = p_user_id
    AND cooldown.email_normalized = '!reminder_txn_v1'
  LIMIT 1
$$;


--
-- Name: read_saas_billing_payment_provider_clinic(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_saas_billing_payment_provider_clinic() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_clinic_billing'::name, 'staff'::app.port_context_class, 'billing.clinic.provider.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_saas_billing_payment_provider_clinic()'::regprocedure);

  SELECT setting.value_json INTO value FROM public.system_settings AS setting
   WHERE setting.key = 'saas_billing_payment_provider' AND setting.scope = 'admin'
     AND setting.organization_id IS NULL LIMIT 1;
  RETURN value;
END
$$;


--
-- Name: read_saas_billing_payment_provider_platform(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_saas_billing_payment_provider_platform() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'billing.platform.provider.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_saas_billing_payment_provider_platform()'::regprocedure);

  SELECT setting.value_json INTO value FROM public.system_settings AS setting
   WHERE setting.key = 'saas_billing_payment_provider' AND setting.scope = 'admin'
     AND setting.organization_id IS NULL LIMIT 1;
  RETURN value;
END
$$;


--
-- Name: read_saas_billing_payment_provider_preauth(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_saas_billing_payment_provider_preauth() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'billing.webhook.provider.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_saas_billing_payment_provider_preauth()'::regprocedure);

  SELECT setting.value_json INTO value FROM public.system_settings AS setting
   WHERE setting.key = 'saas_billing_payment_provider' AND setting.scope = 'admin'
     AND setting.organization_id IS NULL LIMIT 1;
  RETURN value;
END
$$;


--
-- Name: read_saas_isolation_events(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_saas_isolation_events() RETURNS TABLE(event_class text, source_service text, source_operation text, explanation_status text, lifecycle_status text, occurrence_count integer, first_seen_at timestamp with time zone, last_seen_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_telemetry_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
SELECT event_class, source_service, source_operation, explanation_status,
         lifecycle_status, occurrence_count, first_seen_at, last_seen_at
  FROM public.saas_isolation_events
  ORDER BY event_class, last_seen_at DESC
$$;


--
-- Name: read_saas_isolation_trend(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_saas_isolation_trend() RETURNS TABLE(as_of timestamp with time zone, current_24_hours bigint, previous_24_hours bigint, daily_7_days jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_telemetry_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH anchor AS MATERIALIZED (
    SELECT statement_timestamp() AS as_of
  ), bounds AS (
    SELECT as_of,
           date_trunc('hour', as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS current_hour,
           date_trunc('day', as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today
    FROM anchor
  ), days AS (
    SELECT day_start
    FROM bounds, generate_series(today - interval '6 days', today, interval '1 day') AS series(day_start)
  ), day_counts AS (
    SELECT days.day_start, coalesce(sum(hourly.occurrence_count), 0)::bigint AS count
    FROM days CROSS JOIN bounds
    LEFT JOIN public.saas_isolation_event_hourly hourly
      ON hourly.bucket_start >= days.day_start
      AND hourly.bucket_start < days.day_start + interval '1 day'
      AND hourly.bucket_start <= bounds.current_hour
    GROUP BY days.day_start
  )
  SELECT
    (SELECT as_of FROM bounds),
    coalesce((SELECT sum(hourly.occurrence_count) FROM public.saas_isolation_event_hourly hourly, bounds
      WHERE hourly.bucket_start >= bounds.current_hour - interval '23 hours'
        AND hourly.bucket_start <= bounds.current_hour), 0)::bigint,
    coalesce((SELECT sum(hourly.occurrence_count) FROM public.saas_isolation_event_hourly hourly, bounds
      WHERE hourly.bucket_start >= bounds.current_hour - interval '47 hours'
        AND hourly.bucket_start < bounds.current_hour - interval '23 hours'), 0)::bigint,
    (SELECT jsonb_agg(jsonb_build_object(
      'date', to_char(day_start AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      'count', count
    ) ORDER BY day_start) FROM day_counts)
$$;


--
-- Name: read_tenant_isolation_canary(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_tenant_isolation_canary() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH sample AS MATERIALIZED (
    SELECT organization.id AS organization_id,
           organization.is_active,
           count(member.id)::bigint AS member_row_count
      FROM public.be_organizations AS organization
      LEFT JOIN public.be_organization_members AS member
        ON member.organization_id = organization.id
     GROUP BY organization.id, organization.is_active
     ORDER BY organization.id
     LIMIT 4097
  ), numbered AS (
    SELECT sample.*, row_number() OVER (ORDER BY sample.organization_id) AS row_number
      FROM sample
  )
  SELECT jsonb_build_object(
    'organizations', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'organizationId', numbered.organization_id,
          'isActive', numbered.is_active,
          'memberRowCount', numbered.member_row_count
        ) ORDER BY numbered.organization_id
      ) FILTER (WHERE numbered.row_number <= 4096),
      '[]'::jsonb
    ),
    'truncated', count(*) > 4096
  )
  FROM numbered
$$;


--
-- Name: read_webapp_preauth_provider_setting(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_webapp_preauth_provider_setting(p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE value jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.preauth-provider.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_webapp_preauth_provider_setting(text)'::regprocedure);

  SELECT setting.value_json INTO value
    FROM public.system_settings AS setting
   WHERE p_key IN (
      'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
      'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
      'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
      'apple_oauth_key_id', 'apple_oauth_private_key',
      'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri',
      'telegram_bot_token',
      'test_account_identifiers'
    )
     AND setting.key = p_key
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL
   LIMIT 1;
  RETURN value;
END
$_$;


--
-- Name: read_webapp_server_runtime_setting(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text) RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_runtime_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.runtime.server.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.read_webapp_server_runtime_setting(text,text)'::regprocedure);

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
    FROM public.app_runtime_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND setting.audience = 'server'
     AND setting.key IN (
       'debug_forward_to_admin', 'video_presign_ttl_seconds',
       'material_ratings_enabled',
       'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails',
       'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones', 'auth_2fa_enabled'
     )
   LIMIT 1;
END
$_$;


--
-- Name: record_current_patient_analytics_event(timestamp with time zone, text, text, text, text, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_current_patient_analytics_event(p_occurred_at timestamp with time zone, p_event_type text, p_entry_channel text, p_page_key text, p_client_session_id text, p_metadata jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_bucket timestamptz := date_trunc('hour', p_occurred_at);
  v_page text := COALESCE(NULLIF(p_page_key, ''), '__all__');
  v_app_opens integer := CASE WHEN p_event_type = 'app_open' THEN 1 ELSE 0 END;
  v_page_views integer := CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END;
  v_active_minutes integer := CASE WHEN p_event_type = 'heartbeat' THEN 1 ELSE 0 END;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_org IS NULL OR v_patient IS NULL
     OR p_event_type NOT IN ('app_open', 'page_view', 'heartbeat')
     OR NULLIF(p_entry_channel, '') IS NULL
     OR p_occurred_at < now() - interval '7 days'
     OR p_occurred_at > now() + interval '5 minutes' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.product_analytics_events_recent(
    organization_id, occurred_at, event_type, entry_channel, page_key, user_id, client_session_id, metadata
  ) VALUES (
    v_org, p_occurred_at, p_event_type, p_entry_channel, NULLIF(p_page_key, ''), v_patient,
    NULLIF(p_client_session_id, ''), COALESCE(p_metadata, '{}'::jsonb)
  );

  INSERT INTO public.product_analytics_hourly(
    organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind,
    warmup_slogan_key, event_count, updated_at
  ) VALUES (v_org, v_bucket, p_event_type, p_entry_channel, v_page, '__all__', '__all__', '__all__', 1, now())
  ON CONFLICT (organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET event_count = public.product_analytics_hourly.event_count + 1, updated_at = now();

  INSERT INTO public.product_analytics_user_hourly(
    organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views, push_opens,
    active_minutes, last_seen_at, updated_at
  ) VALUES (
    v_org, v_bucket, v_patient, p_entry_channel,
    CASE WHEN p_event_type = 'page_view' THEN v_page ELSE '__all__' END,
    v_app_opens, v_page_views, 0, v_active_minutes, p_occurred_at, now()
  )
  ON CONFLICT (organization_id,bucket_hour,user_id,entry_channel,page_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET
    app_opens = public.product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
    page_views = public.product_analytics_user_hourly.page_views + EXCLUDED.page_views,
    push_opens = public.product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
    active_minutes = public.product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
    last_seen_at = GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = now();
  RETURN true;
END
$$;


--
-- Name: record_current_patient_push_open(timestamp with time zone, text, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_current_patient_push_open(p_occurred_at timestamp with time zone, p_entry_channel text, p_push_tracking_id uuid) RETURNS TABLE(recorded boolean, deduped boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_bucket timestamptz := date_trunc('hour', COALESCE(p_occurred_at, now()));
  v_topic_code text;
  v_push_kind text;
  v_warmup_slogan_key text;
  v_inserted bigint := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_org IS NULL OR v_patient IS NULL OR p_push_tracking_id IS NULL
     OR NULLIF(p_entry_channel, '') IS NULL
     OR v_occurred_at < now() - interval '7 days'
     OR v_occurred_at > now() + interval '5 minutes' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  SELECT push.topic_code, push.push_kind, push.warmup_slogan_key
  INTO v_topic_code, v_push_kind, v_warmup_slogan_key
  FROM public.product_push_notifications push
  WHERE push.id = p_push_tracking_id
    AND push.organization_id = v_org
    AND push.user_id = v_patient;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  INSERT INTO public.product_analytics_events_recent(
    organization_id, occurred_at, event_type, entry_channel, user_id, push_tracking_id,
    topic_code, push_kind, warmup_slogan_key, metadata
  ) VALUES (
    v_org, v_occurred_at, 'push_open', p_entry_channel, v_patient, p_push_tracking_id,
    v_topic_code, v_push_kind, v_warmup_slogan_key, '{}'::jsonb
  )
  ON CONFLICT (push_tracking_id)
    WHERE event_type = 'push_open' AND push_tracking_id IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN QUERY SELECT true, true;
    RETURN;
  END IF;

  INSERT INTO public.product_analytics_hourly(
    organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind,
    warmup_slogan_key, event_count, updated_at
  ) VALUES (
    v_org, v_bucket, 'push_open', p_entry_channel, '__all__',
    COALESCE(v_topic_code, '__all__'), COALESCE(v_push_kind, '__all__'),
    COALESCE(v_warmup_slogan_key, '__all__'), 1, now()
  )
  ON CONFLICT (organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET event_count = public.product_analytics_hourly.event_count + 1, updated_at = now();

  INSERT INTO public.product_analytics_user_hourly(
    organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views,
    push_opens, active_minutes, last_seen_at, updated_at
  ) VALUES (v_org, v_bucket, v_patient, p_entry_channel, '__all__', 0, 0, 1, 0, v_occurred_at, now())
  ON CONFLICT (organization_id,bucket_hour,user_id,entry_channel,page_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET
    push_opens = public.product_analytics_user_hourly.push_opens + 1,
    last_seen_at = GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = now();

  RETURN QUERY SELECT true, false;
END
$$;


--
-- Name: record_failed_staff_factor_attempt(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_failed_staff_factor_attempt() RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_locked_until timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  UPDATE public.staff_security_profiles p
	SET failed_attempts = CASE
	      WHEN p.locked_until IS NOT NULL AND p.locked_until <= now() THEN 1
	      ELSE p.failed_attempts + 1
	    END,
	    locked_until = CASE
	      WHEN p.locked_until IS NOT NULL AND p.locked_until <= now() THEN NULL
	      WHEN p.failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
	      ELSE p.locked_until
	    END,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	RETURNING p.locked_until INTO v_locked_until;
	RETURN v_locked_until;
END
$$;


--
-- Name: record_integrator_webhook_outcome(text, boolean, integer, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_integrator_webhook_outcome(p_source text, p_processed_ok boolean, p_http_status_returned integer, p_error_class text, p_detail text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.webhook-outcome.record', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($2))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg]), 'app.record_integrator_webhook_outcome(text,boolean,integer,text,text)'::regprocedure);

  IF p_source IS NULL
    OR p_source NOT IN ('telegram', 'max')
    OR p_processed_ok IS NULL
    OR p_http_status_returned IS NULL
    OR p_http_status_returned < 100
    OR p_http_status_returned > 599
    OR length(COALESCE(p_detail, '')) > 900
    OR (
      p_error_class IS NOT NULL
      AND p_error_class NOT IN (
        'webhook_auth_failed', 'webhook_parse_failed',
        'webhook_dispatch_failed', 'webhook_internal_error'
      )
    )
    OR (p_processed_ok AND p_error_class IS NOT NULL)
    OR (NOT p_processed_ok AND p_error_class IS NULL)
  THEN
    RAISE EXCEPTION 'invalid integrator webhook outcome'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.integration_webhook_last_status AS status (
    source, received_at, processed_ok, error_class, http_status_returned, detail
  ) VALUES (
    p_source, now(), CASE WHEN p_processed_ok THEN 1 ELSE 0 END,
    p_error_class, p_http_status_returned, NULLIF(p_detail, '')
  )
  ON CONFLICT (source) DO UPDATE SET
    received_at = EXCLUDED.received_at,
    processed_ok = EXCLUDED.processed_ok,
    error_class = EXCLUDED.error_class,
    http_status_returned = EXCLUDED.http_status_returned,
    detail = EXCLUDED.detail;

  IF NOT p_processed_ok THEN
    INSERT INTO public.integration_webhook_error_events (source, error_class)
    VALUES (p_source, p_error_class);
  END IF;
END
$_$;


--
-- Name: record_media_playback_resolution_event(uuid, uuid, text, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_media_playback_resolution_event(p_user_id uuid, p_media_id uuid, p_delivery text, p_fallback_used boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_media_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  -- Do not accept caller-supplied p_user_id as proof of a staff actor. Until the signed
  -- context carries a staff id, staff/org-only/integrator contexts are all denied here.
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_resolution_events
    (organization_id, user_id, media_id, delivery, fallback_used)
  VALUES
    (v_organization_id, p_user_id, p_media_id, p_delivery, p_fallback_used);
END
$$;


--
-- Name: record_operational_delivery_attempt_audit(text, text, text, uuid, text, text, integer, text, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_operational_delivery_attempt_audit(p_intent_type text, p_intent_event_id text, p_correlation_id text, p_organization_id uuid, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_text text, p_occurred_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_payload_json jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.attempt-audit', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg]), 'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)'::regprocedure);

  v_payload_json := p_payload_text::jsonb;

  IF p_intent_type IS NULL
    OR NULLIF(btrim(p_intent_event_id), '') IS NULL
    OR p_channel IS NULL
    OR p_channel NOT IN ('max', 'telegram', 'smsc', 'web_push', 'email', 'unknown')
    OR p_status IS NULL
    OR p_status NOT IN ('success', 'failed', 'skipped')
    OR p_attempt IS NULL
    OR p_attempt NOT BETWEEN 1 AND 100
    OR v_payload_json IS NULL
    OR jsonb_typeof(v_payload_json) <> 'object'
    OR p_occurred_at IS NULL
    OR length(p_intent_type) > 200
    OR length(p_intent_event_id) > 500
    OR length(COALESCE(p_correlation_id, '')) > 500
    OR length(COALESCE(p_reason, '')) > 1000
    OR pg_column_size(v_payload_json) > 65536
  THEN
    RAISE EXCEPTION 'invalid operational delivery attempt audit input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO integrator.delivery_attempt_logs (
    intent_type, intent_event_id, correlation_id, organization_id, channel,
    status, attempt, reason, payload_json, occurred_at
  ) VALUES (
    NULLIF(p_intent_type, ''),
    NULLIF(p_intent_event_id, ''),
    NULLIF(p_correlation_id, ''),
    p_organization_id,
    p_channel,
    p_status,
    p_attempt,
    NULLIF(p_reason, ''),
    v_payload_json,
    p_occurred_at
  );
END
$_$;


--
-- Name: record_operator_delivery_attempt(text, text, text, integer, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_operator_delivery_attempt(p_intent_event_id text, p_channel text, p_status text, p_attempt integer, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_queue_kind text;
  v_organization_id uuid;
  v_payload jsonb;
  v_occurrence_id uuid;
  v_topic_code text;
  v_integrator_user_id text;
  v_user_id uuid;
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
    RAISE EXCEPTION 'operator delivery attempt has no exact queue source' USING ERRCODE = '23514';
  END IF;

  v_occurrence_id := NULLIF(v_payload->>'occurrenceId', '')::uuid;
  v_topic_code := NULLIF(v_payload->>'topicCode', '');
  v_integrator_user_id := NULLIF(v_payload #>> '{intent,meta,userId}', '');
  IF NULLIF(v_payload->>'platformUserId', '') ~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_user_id := NULLIF(v_payload->>'platformUserId', '')::uuid;
  END IF;

  INSERT INTO public.notification_delivery_attempts (
    organization_id,
    user_id,
    integrator_user_id,
    topic_code,
    intent_type,
    channel,
    status,
    reason,
    event_id,
    occurrence_id,
    metadata
  ) VALUES (
    v_organization_id,
    v_user_id,
    v_integrator_user_id,
    v_topic_code,
    v_queue_kind,
    p_channel,
    p_status,
    p_reason,
    p_intent_event_id,
    v_occurrence_id,
    jsonb_build_object(
      'attempt', p_attempt,
      'kind', v_queue_kind,
      'channel', p_channel,
      'source', 'record_operator_delivery_attempt'
    )
  );
END
$_$;


--
-- Name: record_operator_outbound_probe_run(text, timestamp with time zone, text, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_operator_outbound_probe_run(p_last_status text, p_finished_at timestamp with time zone, p_last_error text, p_meta_json jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);

  IF p_last_status IS NULL
    OR p_last_status NOT IN ('success', 'failure')
    OR p_finished_at IS NULL
    OR p_meta_json IS NULL
    OR jsonb_typeof(p_meta_json) <> 'object'
    OR pg_column_size(p_meta_json) > 65536
    OR length(COALESCE(p_last_error, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator outbound probe run input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.operator_job_status AS status (
    job_key, job_family, last_status, last_started_at, last_finished_at,
    last_success_at, last_failure_at, last_duration_ms, last_error, meta_json
  ) VALUES (
    'health.outbound_probe.run', 'health', p_last_status, p_finished_at, p_finished_at,
    CASE WHEN p_last_status = 'success' THEN p_finished_at END,
    CASE WHEN p_last_status = 'failure' THEN p_finished_at END,
    0, NULLIF(p_last_error, ''), p_meta_json
  )
  ON CONFLICT (job_key) DO UPDATE SET
    job_family = 'health',
    last_status = EXCLUDED.last_status,
    last_finished_at = EXCLUDED.last_finished_at,
    last_success_at = CASE
      WHEN EXCLUDED.last_status = 'success' THEN EXCLUDED.last_finished_at
      ELSE status.last_success_at
    END,
    last_failure_at = CASE
      WHEN EXCLUDED.last_status = 'failure' THEN EXCLUDED.last_finished_at
      ELSE NULL
    END,
    last_duration_ms = 0,
    last_error = EXCLUDED.last_error,
    meta_json = EXCLUDED.meta_json;
END
$$;


--
-- Name: record_reminder_occurrence_finalized_projection(text, text, bigint, uuid, uuid, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_reminder_occurrence_finalized_projection(p_integrator_occurrence_id text, p_integrator_rule_id text, p_integrator_user_id bigint, p_platform_user_id uuid, p_organization_id uuid, p_category text, p_status text, p_delivery_channel text, p_error_code text, p_occurred_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_patient_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'integrator.reminder-occurrence-finalized.record', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg]), 'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure);

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = p_platform_user_id
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active patient enrollment required for reminder occurrence projection';
  END IF;

  INSERT INTO public.reminder_occurrence_history (
    integrator_occurrence_id,
    integrator_rule_id,
    integrator_user_id,
    platform_user_id,
    organization_id,
    category,
    status,
    delivery_channel,
    error_code,
    occurred_at
  ) VALUES (
    p_integrator_occurrence_id,
    p_integrator_rule_id,
    p_integrator_user_id,
    p_platform_user_id,
    p_organization_id,
    p_category,
    p_status,
    p_delivery_channel,
    p_error_code,
    p_occurred_at
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$_$;


--
-- Name: record_reminder_transactional_email_cooldown(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_reminder_transactional_email_cooldown(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_email_cooldown_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'reminder_transactional_email_cooldown_user_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.email_send_cooldowns AS cooldown (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, '!reminder_txn_v1', statement_timestamp())
  ON CONFLICT (user_id, email_normalized) DO UPDATE
  SET last_sent_at = EXCLUDED.last_sent_at;
END
$$;


--
-- Name: record_saas_isolation_coverage(uuid, text, timestamp with time zone, timestamp with time zone, text[], integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_saas_isolation_coverage(p_id uuid, p_status text, p_started_at timestamp with time zone, p_finished_at timestamp with time zone, p_services_checked text[], p_checks_count integer, p_unexpected_errors_count integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_inserted integer;
  v_distinct_services text[];
  v_required constant text[] := ARRAY['webapp','integrator','worker','scheduler','media_worker','cron'];
BEGIN
  PERFORM app.require_attested_context_for_roles('saas_telemetry_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);

  SELECT coalesce(array_agg(service ORDER BY service), ARRAY[]::text[])
    INTO v_distinct_services FROM (SELECT DISTINCT unnest(p_services_checked) AS service) checked;
  IF p_status NOT IN ('complete','incomplete','failed')
    OR p_finished_at < p_started_at
    OR p_checks_count < 0 OR p_unexpected_errors_count < 0
    OR NOT (v_distinct_services <@ v_required)
    OR cardinality(v_distinct_services) <> cardinality(p_services_checked)
  THEN RAISE EXCEPTION 'invalid_saas_isolation_coverage' USING ERRCODE = '22023'; END IF;
  IF p_status = 'complete' AND (NOT (v_distinct_services @> v_required) OR p_checks_count < 6) THEN
    RAISE EXCEPTION 'invalid_saas_isolation_complete_coverage' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.saas_isolation_coverage_runs (
    id, status, started_at, finished_at, services_checked, checks_count, unexpected_errors_count
  ) VALUES (
    p_id, p_status, p_started_at, p_finished_at, v_distinct_services, p_checks_count, p_unexpected_errors_count
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 AND NOT EXISTS (
    SELECT 1 FROM public.saas_isolation_coverage_runs existing
    WHERE existing.id = p_id
      AND existing.status = p_status
      AND existing.started_at = p_started_at
      AND existing.finished_at = p_finished_at
      AND existing.services_checked = v_distinct_services
      AND existing.checks_count = p_checks_count
      AND existing.unexpected_errors_count = p_unexpected_errors_count
  ) THEN
    RAISE EXCEPTION 'saas_isolation_coverage_id_conflict' USING ERRCODE = '22023';
  END IF;
  IF v_inserted = 1 AND p_status = 'complete' THEN
    UPDATE public.saas_isolation_events
      SET lifecycle_status = 'resolved', resolved_at = now()
      WHERE lifecycle_status = 'active'
        AND last_seen_at < p_started_at
        AND source_service = ANY(v_distinct_services);
  END IF;
  DELETE FROM public.saas_isolation_coverage_runs WHERE finished_at < now() - interval '90 days';
END
$$;


--
-- Name: redeem_patient_invite_email(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.redeem_patient_invite_email(p_continuation_hash text) RETURNS TABLE(ok boolean, code text, organization_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_authenticated_platform_user_id uuid;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  v_authenticated_platform_user_id := app.current_patient_user_id();
  IF v_authenticated_platform_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.recipient_binding <> 'bound_email' THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked_token'::text, NULL::uuid;
    RETURN;
  ELSIF v_invite.status = 'superseded' THEN
    RETURN QUERY SELECT false, 'superseded_token'::text, NULL::uuid;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    UPDATE public.patient_invites SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id AND expires_at <= now();
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.proof_verified_at IS NULL
     OR v_invite.proof_email_normalized IS NULL
     OR v_invite.proof_email_normalized IS DISTINCT FROM v_invite.invited_email_normalized THEN
    RETURN QUERY SELECT false, 'unproved_identity'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT patient.* INTO v_patient
  FROM public.platform_users AS patient
  WHERE patient.id = v_authenticated_platform_user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_patient.role <> 'client' OR v_patient.merged_into_id IS NOT NULL
     OR v_patient.email_normalized IS DISTINCT FROM v_invite.invited_email_normalized
     OR v_patient.id <> v_invite.patient_user_id THEN
    IF v_patient.id <> v_invite.patient_user_id THEN
      INSERT INTO public.patient_merge_candidates (
        organization_id, anchor_user_id, candidate_user_id, reason, status, payload
      ) VALUES (
        v_invite.organization_id, v_invite.patient_user_id, v_patient.id,
        'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
      ) ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)
        WHERE status = 'pending' DO NOTHING;
    END IF;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT enrollment.status, enrollment.portal_activated_at
  INTO v_enrollment_status, v_portal_activated_at
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF v_portal_activated_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid;
    RETURN;
  ELSIF v_enrollment_status NOT IN ('invited', 'active') OR v_enrollment_status IS NULL THEN
    RETURN QUERY SELECT false, 'inactive_relationship'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.platform_users AS patient
  SET email_verified_at = COALESCE(patient.email_verified_at, now()), updated_at = now()
  WHERE patient.id = v_invite.patient_user_id;
  UPDATE public.org_enrollments AS enrollment
  SET status = 'active', portal_activated_at = now(),
      portal_activated_via = 'patient_invite_email_otp'
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
    AND enrollment.portal_activated_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_portal_activation_failed';
  END IF;
  UPDATE public.patient_invites AS invite
  SET status = 'accepted', accepted_by_platform_user_id = v_invite.patient_user_id,
      accepted_via = 'email_otp', accepted_at = now(), updated_at = now(),
      proof_code_hash = NULL, proof_expires_at = NULL
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id;
END
$$;


--
-- Name: refresh_specialist_task_reminder_materialization(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.refresh_specialist_task_reminder_materialization(p_event_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  queue_id uuid;
  queue_organization_id uuid;
  queue_payload jsonb;
  caller_organization_id uuid;
  task_id_text text;
  current_fingerprint text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_specialist_owner'::name, ARRAY['app_staff'::name]::name[]);

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
$_$;


--
-- Name: reject_staff_commercial_organization_update(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reject_staff_commercial_organization_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF current_user = 'app_staff'
     AND NEW.tariff_id IS DISTINCT FROM OLD.tariff_id THEN
    RAISE EXCEPTION 'platform_commercial_capability_required';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: release_integrator_idempotency(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.release_integrator_idempotency(p_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'integrator', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.idempotency.release', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.release_integrator_idempotency(text)'::regprocedure);

  DELETE FROM integrator.idempotency_keys WHERE key = p_key;
END
$_$;


--
-- Name: replace_pending_specialist_signup_challenge(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.replace_pending_specialist_signup_challenge(p_challenge_id uuid, p_organization_slug text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_intent_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT intent.id
  INTO v_intent_id
  FROM public.specialist_signup_intents AS intent
  WHERE intent.user_id = app.require_staff_security_self_user_id()
    AND intent.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF v_intent_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.specialist_signup_intents AS intent
  SET challenge_id = p_challenge_id,
      organization_slug = lower(p_organization_slug)
  WHERE intent.id = v_intent_id;
  RETURN FOUND;
END
$$;


--
-- Name: report_saas_isolation_event(text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.report_saas_isolation_event(p_event_class text, p_source_service text, p_source_operation text, p_explanation_status text DEFAULT 'unexplained'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_fingerprint text;
  v_event_id uuid;
  v_bucket_start timestamptz := date_trunc('hour', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  PERFORM app.require_attested_context_for_roles('saas_telemetry_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name, 'app_worker'::name]::name[]);

  IF p_event_class NOT IN (
    'missing_principal','invalid_signature_or_install','role_pool_mismatch',
    'rls_denial','cleanup_failure','unclassified_background_operation'
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_event_class' USING ERRCODE = '22023'; END IF;
  IF (p_source_service, p_source_operation) NOT IN (
    ('webapp','webapp_db_request'), ('webapp','webapp_admin_system_health'),
    ('webapp','public_auth_config'), ('webapp','auth_role_config'),
    ('webapp','patient_runtime_config'),
    ('webapp','public_booking_config'), ('webapp','patient_identity_exception_check'),
    ('webapp','patient_booking_history'), ('webapp','patient_product_analytics'),
    ('webapp','patient_ui_config'), ('webapp','patient_calendar_timezone'),
    ('webapp','patient_content_catalog'), ('webapp','patient_diary'),
    ('integrator','integrator_http_request'), ('integrator','integrator_projection'),
    ('worker','worker_queue_drain'), ('worker','worker_projection_delivery'),
    ('worker','worker_outgoing_delivery'), ('scheduler','scheduler_lock'),
    ('scheduler','scheduler_dispatch_tick'), ('media_worker','media_transcode_tick'),
    ('cron','cron_health'), ('cron','cron_media'), ('cron','cron_analytics'),
    ('cron','cron_reminders'), ('cron','cron_specialist_tasks')
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_service_operation' USING ERRCODE = '22023'; END IF;
  IF p_explanation_status NOT IN ('explained','unexplained') THEN
    RAISE EXCEPTION 'invalid_saas_isolation_explanation' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := 'v2:' || p_event_class || ':' || p_source_service || ':' || p_source_operation;
  INSERT INTO public.saas_isolation_events (
    fingerprint, event_class, source_service, source_operation, explanation_status
  ) VALUES (
    v_fingerprint, p_event_class, p_source_service, p_source_operation, p_explanation_status
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    -- Explanation is conservative: a later unexplained occurrence can downgrade, never auto-upgrade.
    explanation_status = CASE
      WHEN public.saas_isolation_events.explanation_status = 'unexplained'
        OR EXCLUDED.explanation_status = 'unexplained' THEN 'unexplained'
      ELSE 'explained'
    END,
    lifecycle_status = 'active', resolved_at = NULL, last_seen_at = now(),
    occurrence_count = public.saas_isolation_events.occurrence_count + 1
  RETURNING id INTO v_event_id;
  INSERT INTO public.saas_isolation_event_hourly (event_id, bucket_start, occurrence_count)
    VALUES (v_event_id, v_bucket_start, 1)
    ON CONFLICT (event_id, bucket_start) DO UPDATE SET
      occurrence_count = public.saas_isolation_event_hourly.occurrence_count + 1;
  DELETE FROM public.saas_isolation_event_hourly
    WHERE bucket_start < v_bucket_start - interval '8 days';
END
$$;


--
-- Name: require_accepted_context(name, name, app.port_context_class, text, bytea, regprocedure); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.require_accepted_context(p_effective_role name, p_target_role name, p_context_class app.port_context_class, p_purpose text, p_typed_args_hash bytea, p_function_identity regprocedure) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $_$
DECLARE database_id oid;
BEGIN
  IF p_effective_role IS NULL OR p_target_role IS NULL
    OR NOT (
      (p_function_identity IS NULL AND p_effective_role = p_target_role)
      OR (p_function_identity IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = p_function_identity::oid
           AND pg_catalog.pg_get_userbyid(p.proowner) = p_effective_role
      ))
    )
    OR p_purpose !~ '^[a-z][a-z0-9._:-]{0,127}$' OR octet_length(p_typed_args_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  IF NOT EXISTS (
    SELECT 1 FROM app_ext.accepted_port_contexts c
    WHERE c.database_oid = database_id AND c.backend_pid = pg_backend_pid() AND c.transaction_id = pg_current_xact_id()
      AND c.cleared_at IS NULL AND c.session_login = session_user AND c.target_role = p_target_role
      AND c.context_class = p_context_class AND c.purpose = p_purpose AND c.typed_args_hash = p_typed_args_hash
      AND c.function_identity IS NOT DISTINCT FROM p_function_identity
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required'; END IF;
  RETURN true;
END $_$;


--
-- Name: require_attested_context_for_roles(name, name[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.require_attested_context_for_roles(p_effective_role name, p_allowed_target_roles name[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE database_id oid;
BEGIN
  IF p_effective_role IS NULL
    OR p_allowed_target_roles IS NULL
    OR cardinality(p_allowed_target_roles) = 0
    OR array_position(p_allowed_target_roles, NULL::name) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  IF NOT EXISTS (
    SELECT 1
    FROM app_ext.accepted_port_contexts accepted
    JOIN app_ext.port_context_capabilities capability
      ON capability.capability_id = accepted.capability_id
     AND capability.port = accepted.port
     AND capability.session_login = accepted.session_login
     AND capability.target_role = accepted.target_role
     AND capability.context_class = accepted.context_class
     AND capability.purpose = accepted.purpose
     AND capability.function_identity IS NOT DISTINCT FROM accepted.function_identity
     AND capability.active_from <= clock_timestamp()
     AND (capability.active_until IS NULL OR capability.active_until > clock_timestamp())
    WHERE accepted.database_oid = database_id
      AND accepted.backend_pid = pg_backend_pid()
      AND accepted.transaction_id = pg_current_xact_id()
      AND accepted.cleared_at IS NULL
      AND accepted.session_login = session_user
      AND accepted.target_role = ANY(p_allowed_target_roles)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  RETURN true;
END $$;


--
-- Name: require_platform_principal(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.require_platform_principal() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.require_accepted_context('app_platform_settings'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'relation', decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'), NULL::regprocedure);
  RETURN true;
END $$;


--
-- Name: require_staff_security_self_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.require_staff_security_self_user_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  v_user_id := app.current_patient_user_id();
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'staff_security_self_principal_required';
	END IF;
	RETURN v_user_id;
END
$$;


--
-- Name: resolve_active_organization_for_integrator_user_id(bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_active_organization_for_integrator_user_id(p_integrator_user_id bigint) RETURNS TABLE(platform_user_id uuid, organization_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'integrator.user-organization.resolve', app.hash_port_typed_args(ARRAY[ROW('bigint@1', pg_catalog.int8send($1))::app.port_typed_arg]), 'app.resolve_active_organization_for_integrator_user_id(bigint)'::regprocedure);

  RETURN QUERY
  WITH active_user_orgs AS (
    SELECT enrollment.platform_user_id, enrollment.organization_id
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.status = 'active'
    UNION
    SELECT member.platform_user_id, member.organization_id
    FROM public.be_organization_members AS member
    WHERE member.status = 'active'
  ), matches AS (
    SELECT DISTINCT platform_user.id AS platform_user_id, active_user_orgs.organization_id
    FROM public.platform_users AS platform_user
    INNER JOIN active_user_orgs
      ON active_user_orgs.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id = p_integrator_user_id
  )
  SELECT
    (array_agg(DISTINCT matches.platform_user_id ORDER BY matches.platform_user_id))[1],
    (array_agg(DISTINCT matches.organization_id ORDER BY matches.organization_id))[1]
  FROM matches
  HAVING count(DISTINCT matches.platform_user_id) = 1
     AND count(DISTINCT matches.organization_id) = 1;
END
$_$;


--
-- Name: resolve_all_open_operator_incidents(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_all_open_operator_incidents() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  changed_count bigint;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.operator-incidents.resolve', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.resolve_all_open_operator_incidents()'::regprocedure);

  WITH changed AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now(),
        alert_claim_phase = NULL,
        alert_claim_token = NULL,
        alert_claimed_at = NULL
    WHERE incident.resolved_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO changed_count FROM changed;
  RETURN changed_count;
END
$$;


--
-- Name: resolve_clinic_dedicated_bot_organization(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_clinic_dedicated_bot_organization(p_channel text, p_credential_fingerprint text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$SELECT app.require_accepted_context('app_seam_dedicated_bot_owner'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'integrator.dedicated-bot.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.resolve_clinic_dedicated_bot_organization(text,text)'::regprocedure);
SELECT binding.organization_id
  FROM public.clinic_dedicated_bot_bindings AS binding
  WHERE binding.channel = p_channel
    AND binding.credential_fingerprint = p_credential_fingerprint
    AND binding.is_active = true
  LIMIT 1
$_$;


--
-- Name: resolve_current_patient_treatment_program_organization(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_current_patient_treatment_program_organization(p_instance_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_program_resolver_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_patient_user_id IS NULL OR p_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT instance.organization_id
  INTO v_organization_id
  FROM public.treatment_program_instances AS instance
  INNER JOIN public.org_enrollments AS enrollment
    ON enrollment.organization_id = instance.organization_id
   AND enrollment.platform_user_id = v_patient_user_id
   AND enrollment.status = 'active'
  INNER JOIN public.be_organizations AS organization
    ON organization.id = instance.organization_id
   AND organization.is_active = true
  WHERE instance.id = p_instance_id
    AND instance.patient_user_id = v_patient_user_id
  LIMIT 1;

  RETURN v_organization_id;
END
$$;


--
-- Name: resolve_operator_probe_incidents(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_operator_probe_incidents(p_dedup_key_prefix text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_resolved integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);

  IF p_dedup_key_prefix IS NULL
    OR p_dedup_key_prefix NOT IN (
      'outbound:max:', 'outbound:telegram:', 'outbound:google_calendar:'
    )
  THEN
    RAISE EXCEPTION 'invalid operator probe incident prefix'
      USING ERRCODE = '23514';
  END IF;

  WITH resolved AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now()
    WHERE incident.resolved_at IS NULL
      AND incident.dedup_key LIKE p_dedup_key_prefix || '%'
    RETURNING incident.id
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN v_resolved;
END
$$;


--
-- Name: resolve_organization_cabinet_access(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_organization_cabinet_access(p_organization_id uuid) RETURNS TABLE(state text, policy_source text, warning jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name]::name[]);

  IF v_current_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_cabinet_access_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_cabinet_access_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = p_organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    WHERE subscription.organization_id = p_organization_id
      AND subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), global_paid_policy AS (
    SELECT
      policy.post_paid_period_behavior,
      policy.post_paid_period_tariff_id
    FROM public.saas_paid_period_policy AS policy
    WHERE policy.key = 'global'
      AND policy.is_active = true
    LIMIT 1
  ), effective AS (
    SELECT
      CASE
        WHEN trial.id IS NOT NULL AND v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.id IS NOT NULL AND trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        WHEN trial.id IS NOT NULL THEN trial.tariff_id
        WHEN paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN global_paid_policy.post_paid_period_tariff_id
        ELSE organization.tariff_id
      END AS tariff_id,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior IS NOT NULL
          THEN CASE
            WHEN global_paid_policy.post_paid_period_behavior = 'tariff' THEN 'active'
            ELSE global_paid_policy.post_paid_period_behavior
          END
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN 'post_paid_period_tariff'
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,
      CASE
        WHEN trial.ends_at IS NOT NULL THEN 'trial'
        WHEN paid_period.period_ends_at IS NOT NULL THEN 'paid_period'
        ELSE NULL
      END AS period_source
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
    LEFT JOIN global_paid_policy ON true
    WHERE organization.id = p_organization_id
      AND organization.is_active = true
  ), snapshot AS (
    SELECT
      effective.*,
      tariff.id AS resolved_tariff_id,
      tariff.system_access_policy AS policy
    FROM effective
    LEFT JOIN LATERAL app.saas_billing_effective_tariff(p_organization_id, effective.tariff_id) AS tariff ON true
  ), policy_history AS (
    -- §5a 2.9/2.10: the immutable tariff audit supplies the prior system-policy deadline, so a
    -- live shortening cannot eject a clinic from an already-running stage retroactively.
    SELECT
      audit.created_at,
      audit.details -> 'before' -> 'systemAccessPolicy' AS previous_policy
    FROM public.admin_audit_log AS audit
    WHERE audit.action = 'saas_tariff_update'
      AND audit.target_id = (SELECT resolved_tariff_id::text FROM snapshot)
      AND audit.created_at > (SELECT degradation_started_at FROM snapshot)
  ), policy_timing AS (
    SELECT
      snapshot.*,
      CASE
        WHEN degradation_started_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer),
          COALESCE(
            (
              SELECT max(
                degradation_started_at
                  + make_interval(days => (previous_policy ->> 'graceDays')::integer)
              )
              FROM policy_history
            ),
            '-infinity'::timestamptz
          )
        )
      END AS grace_ends_at
    FROM snapshot
  ), policy_schedule AS (
    SELECT
      policy_timing.*,
      CASE
        WHEN policy_timing.grace_ends_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          policy_timing.grace_ends_at
            + make_interval(days => (policy ->> 'readOnlyDays')::integer),
          COALESCE(
            (
              SELECT max(
                policy_timing.grace_ends_at
                  + make_interval(days => (previous_policy ->> 'readOnlyDays')::integer)
              )
              FROM policy_history
              WHERE policy_history.created_at >= policy_timing.grace_ends_at
            ),
            '-infinity'::timestamptz
          )
        )
      END AS read_only_ends_at
    FROM policy_timing
  ), resolved AS (
    SELECT
      policy_schedule.*,
      CASE
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- #1069 §2.13: without a resolved tariff there is nothing to hold access open with —
        -- `resolved_tariff_id IS NOT NULL` is what used to be carried by the `compatibility` state.
        WHEN degradation_started_at IS NULL
          AND resolved_tariff_id IS NOT NULL AND lifecycle = 'active' THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < policy_schedule.grace_ends_at
          THEN 'grace'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < policy_schedule.read_only_ends_at
          THEN 'read_only'
        WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'
        WHEN lifecycle = 'read_only' THEN 'read_only'
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
        ELSE 'unconfigured'
      END AS resolved_state
    FROM policy_schedule
  )
  SELECT
    resolved_state,
    CASE WHEN policy IS NULL THEN 'unconfigured' ELSE 'system' END,
    CASE
      WHEN resolved_state = 'grace' THEN jsonb_build_object(
        'until', resolved.grace_ends_at,
        'periodEndsAt', degradation_started_at,
        'periodSource', period_source,
        'notifications', COALESCE(policy -> 'notifications', '[]'::jsonb),
        'nextState', CASE
          WHEN (policy ->> 'readOnlyDays')::integer > 0 THEN 'read_only'
          ELSE policy ->> 'terminalState'
        END
      )
      ELSE NULL
    END
  FROM resolved;
END
$$;


--
-- Name: resolve_organization_mechanic_access(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_organization_mechanic_access(p_organization_id uuid, p_mechanic text) RETURNS TABLE(mechanic text, state text, policy_source text, warning jsonb, mutation_allowed boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name, 'app_tenant_service'::name]::name[]);

  IF v_current_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_mechanic_access_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_mechanic_access_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF p_mechanic IS NULL OR btrim(p_mechanic) = '' THEN
    RAISE EXCEPTION 'organization_mechanic_access_mechanic_required'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = p_organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    WHERE subscription.organization_id = p_organization_id
      AND subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), global_paid_policy AS (
    SELECT
      policy.post_paid_period_behavior,
      policy.post_paid_period_tariff_id
    FROM public.saas_paid_period_policy AS policy
    WHERE policy.key = 'global'
      AND policy.is_active = true
    LIMIT 1
  ), effective AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN trial.id IS NOT NULL AND v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.id IS NOT NULL AND trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        WHEN trial.id IS NOT NULL THEN trial.tariff_id
        WHEN paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN global_paid_policy.post_paid_period_tariff_id
        ELSE organization.tariff_id
      END AS tariff_id,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior IS NOT NULL
          THEN CASE
            WHEN global_paid_policy.post_paid_period_behavior = 'tariff' THEN 'active'
            ELSE global_paid_policy.post_paid_period_behavior
          END
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN 'post_paid_period_tariff'
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,
      CASE
        WHEN trial.ends_at IS NOT NULL THEN 'trial'
        WHEN paid_period.period_ends_at IS NOT NULL THEN 'paid_period'
        ELSE NULL
      END AS period_source
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
    LEFT JOIN global_paid_policy ON true
    WHERE organization.id = p_organization_id
      AND organization.is_active = true
  ), snapshot AS (
    SELECT
      effective.*,
      tariff.id AS resolved_tariff_id,
      tariff.mechanics,
      tariff.quotas,
      tariff.system_access_policy,
      tariff.included_seats,
      entitlement_override.mechanic AS override_mechanic,
      entitlement_override.enabled AS override_enabled,
      tariff.system_access_policy AS policy,
      CASE
        WHEN tariff.system_access_policy IS NOT NULL THEN 'system'
        ELSE 'unconfigured'
      END AS configured_policy_source
    FROM effective
    LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
    LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
      ON entitlement_override.organization_id = effective.organization_id
     AND entitlement_override.mechanic = p_mechanic
     AND (
       entitlement_override.expires_at IS NULL
       OR entitlement_override.expires_at > v_now
     )
  ), policy_history AS (
    -- §5a 2.9/2.10: tariff edits are live once a paid period has ended, but an edit must not
    -- retroactively erase a stage already earned by the organization. The tariff audit already
    -- keeps the exact before/after row and edit time, so it is the data boundary without a second
    -- per-organization snapshot. Only changes after this organization's degradation anchor matter.
    SELECT
      audit.created_at,
      audit.details -> 'before' -> 'systemAccessPolicy' AS previous_policy
    FROM public.admin_audit_log AS audit
    WHERE audit.action = 'saas_tariff_update'
      AND audit.target_id = (SELECT resolved_tariff_id::text FROM snapshot)
      AND audit.created_at > (SELECT degradation_started_at FROM snapshot)
  ), policy_timing AS (
    SELECT
      snapshot.*,
      CASE
        WHEN degradation_started_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer),
          COALESCE(
            (
              SELECT max(
                degradation_started_at
                  + make_interval(days => (previous_policy ->> 'graceDays')::integer)
              )
              FROM policy_history
            ),
            '-infinity'::timestamptz
          )
        )
      END AS grace_ends_at
    FROM snapshot
  ), policy_schedule AS (
    SELECT
      policy_timing.*,
      CASE
        WHEN policy_timing.grace_ends_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          policy_timing.grace_ends_at
            + make_interval(days => (policy ->> 'readOnlyDays')::integer),
          COALESCE(
            (
              SELECT max(
                policy_timing.grace_ends_at
                  + make_interval(days => (previous_policy ->> 'readOnlyDays')::integer)
              )
              FROM policy_history
              WHERE policy_history.created_at >= policy_timing.grace_ends_at
            ),
            '-infinity'::timestamptz
          )
        )
      END AS read_only_ends_at
    FROM policy_timing
  ), included AS (
    SELECT
      policy_schedule.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN true
        WHEN override_mechanic IS NOT NULL THEN override_enabled
        -- #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала → доступа нет» — no
        -- compatibility carve-out survives for an organization with no resolved tariff at all.
        WHEN resolved_tariff_id IS NULL THEN false
        WHEN p_mechanic = 'clinic_team' THEN included_seats IS NOT NULL
        WHEN p_mechanic = ANY (ARRAY['files', 'patient_count', 'branches'])
          THEN quotas ? p_mechanic
        ELSE COALESCE((mechanics ->> p_mechanic)::boolean, false)
      END AS mechanic_included
    FROM policy_schedule
  ), resolved AS (
    SELECT
      included.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'full_access'
        WHEN resolved_tariff_id IS NULL THEN 'unconfigured'
        WHEN NOT mechanic_included THEN 'disabled'
        -- Period exists and has not run out. This is the ONLY «полный доступ навсегда» left: it
        -- lasts exactly as long as the paid period (or the trial) does. Checked before the policy
        -- so a tariff whose ladder is not configured yet still grants access inside a live period.
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- No period at all: an assigned tariff with nothing yet to measure from (§2.12/7.0 keeps
        -- this open, on purpose — not the removed `compatibility` state, which needed no tariff at
        -- all; `resolved_tariff_id IS NULL` above already excludes that case here).
        WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < included.grace_ends_at
          THEN 'grace'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < included.read_only_ends_at
          THEN 'read_only'
        WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'
        WHEN lifecycle = 'read_only' THEN 'read_only'
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
        ELSE 'unconfigured'
      END AS resolved_state
    FROM included
  )
  SELECT
    p_mechanic,
    resolved_state,
    CASE
      WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'critical'
      WHEN NOT mechanic_included THEN 'unconfigured'
      -- Mirrors the no-anchor full-access branch above: an assigned tariff with no period at all is
      -- held open by the system, not by a configured mechanic policy.
      WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'system'
      ELSE configured_policy_source
    END,
    CASE
      WHEN resolved_state = 'grace' THEN jsonb_build_object(
        'until', resolved.grace_ends_at,
        'periodEndsAt', degradation_started_at,
        'periodSource', period_source,
        'notifications', COALESCE(policy -> 'notifications', '[]'::jsonb),
        'nextState', CASE
          WHEN (policy ->> 'readOnlyDays')::integer > 0 THEN 'read_only'
          ELSE policy ->> 'terminalState'
        END
      )
      ELSE NULL
    END,
    resolved_state = ANY (ARRAY['full_access', 'grace'])
  FROM resolved;
END
$$;


--
-- Name: resolve_outgoing_delivery_scope(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid) RETURNS TABLE(queue_kind text, organization_id uuid, resolution text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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

  IF queue_kind IN ('inbound_reply', 'operator_health_digest', 'auth_email_otp') THEN
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
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.id = v_occurrence_id;
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
$_$;


--
-- Name: resolve_payment_webhook_organization(text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_payment_webhook_organization(p_provider_id text, p_idempotency_key text, p_event_type text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_ids uuid[];
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_payment_webhook_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_provider_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_event_type IS NULL
     OR btrim(p_provider_id) = ''
     OR btrim(p_idempotency_key) = ''
     OR btrim(p_event_type) = '' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT event.organization_id)
  INTO v_organization_ids
  FROM public.be_payment_provider_events AS event
  WHERE event.provider_id = p_provider_id
    AND event.idempotency_key = p_idempotency_key
    AND event.event_type = p_event_type;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  IF cardinality(v_organization_ids) > 1 THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT intent.organization_id)
  INTO v_organization_ids
  FROM public.be_payment_intents AS intent
  WHERE intent.provider_id = p_provider_id
    AND intent.idempotency_key = p_idempotency_key;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: resolve_platform_audit_conflict(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_platform_audit_conflict(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  audit_row record;
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.audit-conflict.resolve', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.resolve_platform_audit_conflict(uuid)'::regprocedure);

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'platform audit conflict id is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT audit.action, audit.resolved_at
  INTO audit_row
  FROM public.admin_audit_log AS audit
  WHERE audit.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF audit_row.resolved_at IS NOT NULL THEN RETURN 'already_resolved'; END IF;
  IF audit_row.action NOT IN (
    'auto_merge_conflict',
    'auto_merge_conflict_anomaly',
    'email_auth_conflict',
    'messenger_phone_bind_blocked',
    'messenger_phone_bind_anomaly',
    'channel_link_ownership_conflict'
  ) THEN
    RETURN 'not_closeable';
  END IF;

  UPDATE public.admin_audit_log AS audit
  SET resolved_at = now()
  WHERE audit.id = p_id;
  RETURN 'updated';
END
$_$;


--
-- Name: resolve_public_booking_organization(uuid, uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_public_booking_organization(p_branch_id uuid, p_service_id uuid, p_branch_service_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_ids uuid[];
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_public_booking_owner'::name, ARRAY['app_patient'::name]::name[]);

  -- A partial canonical pair is never allowed to fall through to a legacy id. When both forms are
  -- present the canonical pair is authoritative, preventing a foreign legacy id from steering org.
  IF (p_branch_id IS NULL) <> (p_service_id IS NULL) THEN
    RETURN NULL;
  END IF;

  IF p_branch_id IS NOT NULL AND p_service_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT b.organization_id)
    INTO v_organization_ids
    FROM public.be_branches AS b
    INNER JOIN public.be_clinic_services AS s
      ON s.organization_id = b.organization_id
    INNER JOIN public.be_specialist_service_availability AS availability
      ON availability.organization_id = b.organization_id
     AND availability.branch_id = b.id
     AND availability.service_id = s.id
    WHERE b.id = p_branch_id
      AND s.id = p_service_id
      AND b.is_active = true
      AND s.is_active = true
      AND s.public_widget_visible = true
      AND s.admin_manual_only = false
      AND availability.is_active = true;

    IF cardinality(v_organization_ids) = 1 THEN
      RETURN v_organization_ids[1];
    END IF;
    RETURN NULL;
  END IF;

  IF p_branch_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT mapping.organization_id)
  INTO v_organization_ids
  FROM public.be_external_entity_mappings AS mapping
  INNER JOIN public.be_specialist_service_availability AS availability
    ON availability.id = mapping.canonical_id
   AND availability.organization_id = mapping.organization_id
  INNER JOIN public.be_branches AS b
    ON b.id = availability.branch_id
   AND b.organization_id = mapping.organization_id
  INNER JOIN public.be_clinic_services AS s
    ON s.id = availability.service_id
   AND s.organization_id = mapping.organization_id
  WHERE mapping.entity_type = 'availability'
    AND mapping.metadata ->> 'legacy_branch_service_id' = p_branch_service_id::text
    AND b.is_active = true
    AND s.is_active = true
    AND s.public_widget_visible = true
    AND s.admin_manual_only = false
    AND availability.is_active = true;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: resolve_public_organization_by_slug(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_public_organization_by_slug(p_slug text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
DECLARE resolved uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_slug_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'booking.public-organization.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.resolve_public_organization_by_slug(text)'::regprocedure);

  SELECT requested.organization_id INTO resolved
    FROM public.organization_slug_claims AS requested
    JOIN public.organization_slug_claims AS current_claim
      ON current_claim.organization_id = requested.organization_id AND current_claim.kind = 'current'
    JOIN public.clinic_public_directory_entries AS directory
      ON directory.organization_id = requested.organization_id AND directory.is_published = true
    JOIN public.be_organizations AS organization
      ON organization.id = requested.organization_id AND organization.is_active = true
   WHERE requested.slug = lower(btrim(p_slug))
     AND requested.kind IN ('current', 'alias')
   LIMIT 1;
  RETURN resolved;
END
$_$;


--
-- Name: resolve_public_organization_slug(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_public_organization_slug(p_slug text) RETURNS TABLE(organization_id uuid, requested_slug text, requested_kind text, canonical_slug text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_slug_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'booking.public-slug.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.resolve_public_organization_slug(text)'::regprocedure);

  RETURN QUERY
  SELECT requested.organization_id, requested.slug, requested.kind, current_claim.slug
    FROM public.organization_slug_claims AS requested
    JOIN public.organization_slug_claims AS current_claim
      ON current_claim.organization_id = requested.organization_id AND current_claim.kind = 'current'
    JOIN public.clinic_public_directory_entries AS directory
      ON directory.organization_id = requested.organization_id AND directory.is_published = true
    JOIN public.be_organizations AS organization
      ON organization.id = requested.organization_id AND organization.is_active = true
   WHERE requested.slug = lower(btrim(p_slug))
     AND requested.kind IN ('current', 'alias')
   LIMIT 1;
END
$_$;


--
-- Name: resolve_saas_billing_invoice_for_webhook(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_saas_billing_invoice_for_webhook(p_provider_id text, p_provider_invoice_ref text) RETURNS TABLE(id uuid, organization_id uuid, amount_minor integer, currency text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'billing.webhook.invoice.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.resolve_saas_billing_invoice_for_webhook(text,text)'::regprocedure);

  RETURN QUERY
  SELECT invoice.id, invoice.organization_id, invoice.amount_minor, invoice.currency
    FROM public.saas_billing_invoices AS invoice
   WHERE invoice.provider_id = p_provider_id
     AND invoice.provider_invoice_ref = p_provider_invoice_ref
   LIMIT 1;
END
$_$;


--
-- Name: resolve_saas_billing_refund_for_webhook(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_saas_billing_refund_for_webhook(p_provider_id text, p_provider_refund_ref text) RETURNS TABLE(id uuid, organization_id uuid, saas_billing_invoice_id uuid, amount_minor integer, currency text, status text, provider_id text, provider_refund_ref text, provider_idempotency_key text, confirmed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'billing.webhook.refund.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.resolve_saas_billing_refund_for_webhook(text,text)'::regprocedure);

  RETURN QUERY
  SELECT refund.id, refund.organization_id, refund.saas_billing_invoice_id, refund.amount_minor,
         refund.currency, refund.status, refund.provider_id, refund.provider_refund_ref,
         refund.provider_idempotency_key, refund.confirmed_at, refund.created_at, refund.updated_at
    FROM public.saas_billing_refunds AS refund
   WHERE refund.provider_id = p_provider_id
     AND refund.provider_refund_ref = p_provider_refund_ref
   LIMIT 1;
END
$_$;


--
-- Name: resolve_staff_workspace_memberships(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_staff_workspace_memberships(p_platform_user_id uuid) RETURNS TABLE(id uuid, organization_id uuid, platform_user_id uuid, role text, specialist_id uuid, status text, doctor_screens_disabled boolean, created_at text, updated_at text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $$
DECLARE v_staff_context boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_org_directory_owner',
    CASE WHEN pg_has_role(session_user, 'app_staff', 'MEMBER')
         THEN 'app_staff'::name ELSE 'app_pre_session'::name END,
    CASE WHEN pg_has_role(session_user, 'app_staff', 'MEMBER')
         THEN 'staff'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    'auth.staff-workspace.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg
    ]), 'app.resolve_staff_workspace_memberships(uuid)'::regprocedure
  );

  v_staff_context := pg_has_role(session_user, 'app_staff', 'MEMBER');
  IF p_platform_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'platform user id required';
  END IF;
  IF v_staff_context AND p_platform_user_id <> app.current_actor_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'staff workspace self-resolution required';
  END IF;
  RETURN QUERY
  SELECT membership.id,
         membership.organization_id,
         membership.platform_user_id,
         membership.role,
         membership.specialist_id,
         membership.status,
         membership.doctor_screens_disabled,
         membership.created_at::text,
         membership.updated_at::text
    FROM public.be_organization_members membership
   WHERE membership.platform_user_id = p_platform_user_id
     AND membership.status = 'active'
   ORDER BY membership.created_at, membership.organization_id;
END
$$;


--
-- Name: revalidate_appointment_reminder_materialization(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.revalidate_appointment_reminder_materialization(p_queue_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  delivery public.outgoing_delivery_queue%ROWTYPE;
  appointment_id uuid;
  generation_start timestamptz;
  recipient_user_id uuid;
  recipient_value text;
  is_current boolean := false;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_appointment_owner'::name, 'app_operational_delivery_worker'::name, 'service'::app.port_context_class, 'delivery.appointment-reminder-revalidate', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.revalidate_appointment_reminder_materialization(uuid)'::regprocedure);

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
      INNER JOIN public.platform_users AS recipient ON recipient.id = appointment.platform_user_id
      WHERE appointment.id = appointment_id
        AND appointment.organization_id = delivery.organization_id
        AND appointment.platform_user_id = recipient_user_id
        AND appointment.start_at = generation_start
        AND recipient.is_blocked = false
        AND recipient.is_archived = false
        AND recipient.merged_into_id IS NULL
        AND (recipient.reminder_muted_until IS NULL OR recipient.reminder_muted_until <= statement_timestamp())
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
$_$;


--
-- Name: revalidate_patient_reminder_delivery_materialization(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.revalidate_patient_reminder_delivery_materialization(p_queue_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  delivery public.outgoing_delivery_queue%ROWTYPE;
  occurrence integrator.user_reminder_occurrences%ROWTYPE;
  rule public.reminder_rules%ROWTYPE;
  expected_fingerprint text;
  current_fingerprint text;
  resolved_topic_code text;
  recipient text;
  channel_allowed boolean;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

  SELECT * INTO delivery
  FROM public.outgoing_delivery_queue AS candidate
  WHERE candidate.id = p_queue_id
    AND candidate.kind = 'reminder_dispatch'
    AND candidate.status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO occurrence
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.id = delivery.payload_json ->> 'occurrenceId';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO rule
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
      SELECT 1 FROM public.platform_users AS patient
      WHERE patient.id = occurrence.platform_user_id AND patient.email = recipient
        AND patient.email_verified_at IS NOT NULL
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
    AND NOT EXISTS (
      SELECT 1 FROM public.reminder_journal AS journal
      WHERE journal.occurrence_id = occurrence.id AND journal.action IN ('done', 'skipped')
    )
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
$_$;


--
-- Name: revalidate_specialist_task_reminder_materialization(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.revalidate_specialist_task_reminder_materialization(p_queue_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  queue_payload jsonb;
  task_id_text text;
  expected_fingerprint text;
  current_fingerprint text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_specialist_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);

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
$_$;


--
-- Name: revoke_staff_sessions(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.revoke_staff_sessions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_session_version integer;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);

  UPDATE public.staff_security_profiles p
	SET session_version = p.session_version + 1,
	    login_challenge_hash = NULL,
	    login_challenge_expires_at = NULL,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	RETURNING p.session_version INTO v_session_version;
	IF v_session_version IS NULL THEN
		RAISE EXCEPTION 'staff_security_profile_missing';
	END IF;
	RETURN v_session_version;
END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: saas_tariffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_tariffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    price_minor integer,
    currency text,
    mechanics jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    included_seats integer,
    billing_period text DEFAULT 'month'::text NOT NULL,
    quotas jsonb DEFAULT '{}'::jsonb NOT NULL,
    system_access_policy jsonb,
    mechanic_access_policies jsonb DEFAULT '{}'::jsonb NOT NULL,
    downgrade_policies jsonb DEFAULT '{}'::jsonb NOT NULL,
    additional_seat_price_minor integer,
    discounted_price_minor integer,
    mailing_templates jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT saas_tariffs_additional_seat_price_nonnegative_check CHECK (((additional_seat_price_minor IS NULL) OR (additional_seat_price_minor >= 0))),
    CONSTRAINT saas_tariffs_discounted_price_nonnegative_check CHECK (((discounted_price_minor IS NULL) OR (discounted_price_minor >= 0))),
    CONSTRAINT saas_tariffs_included_seats_nonnegative_check CHECK (((included_seats IS NULL) OR (included_seats >= 0)))
);

ALTER TABLE ONLY public.saas_tariffs FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_effective_tariff(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.saas_billing_effective_tariff(p_organization_id uuid, p_tariff_id uuid) RETURNS SETOF public.saas_tariffs
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_snapshot jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_clinic_billing'::name, 'app_patient'::name, 'app_platform_settings'::name, 'app_staff'::name, 'app_tenant_service'::name]::name[]);

  IF p_tariff_id IS NULL THEN
    RETURN;
  END IF;

  SELECT subscription.tariff_snapshot INTO v_snapshot
  FROM public.saas_billing_subscriptions AS subscription
  WHERE subscription.organization_id = p_organization_id
    AND subscription.tariff_id = p_tariff_id
    AND subscription.status = ANY (ARRAY['active', 'expired'])
    AND subscription.tariff_snapshot IS NOT NULL
    AND subscription.current_period_starts_at IS NOT NULL
    AND subscription.current_period_starts_at <= v_now
    AND subscription.current_period_ends_at > v_now
  ORDER BY subscription.current_period_ends_at DESC
  LIMIT 1;

  IF v_snapshot IS NOT NULL THEN
    RETURN QUERY SELECT * FROM jsonb_populate_record(null::public.saas_tariffs, v_snapshot);
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.saas_tariffs WHERE id = p_tariff_id;
END
$$;


--
-- Name: saas_billing_effective_tariff_for_current_org(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.saas_billing_effective_tariff_for_current_org(p_organization_id uuid, p_tariff_id uuid) RETURNS SETOF public.saas_tariffs
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_clinic_billing'::name, 'app_patient'::name, 'app_staff'::name]::name[]);

  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'saas_tariff_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM app.saas_billing_effective_tariff(p_organization_id, p_tariff_id);
END
$$;


--
-- Name: save_pending_staff_totp(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.save_pending_staff_totp(p_secret_ciphertext text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_staff_security_owner'::name, ARRAY['app_patient'::name]::name[]);
INSERT INTO public.staff_security_profiles (user_id, pending_totp_secret_ciphertext, failed_attempts, locked_until, updated_at)
	VALUES (app.require_staff_security_self_user_id(), p_secret_ciphertext, 0, NULL, now())
	ON CONFLICT (user_id) DO UPDATE SET
		pending_totp_secret_ciphertext = EXCLUDED.pending_totp_secret_ciphertext,
		failed_attempts = 0,
		locked_until = NULL,
		updated_at = now()
$$;


--
-- Name: seed_reference_catalog_after_organization_insert(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.seed_reference_catalog_after_organization_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM app.seed_reference_catalog_snapshot(NEW.id);
  RETURN NEW;
END
$$;


--
-- Name: seed_reference_catalog_snapshot(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.seed_reference_catalog_snapshot(p_organization_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_version integer;
  v_definition jsonb;
  v_category jsonb;
  v_item jsonb;
  v_category_id uuid;
BEGIN
  -- There is no row to lock before the first receipt, so serialize by organization UUID.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 183));

  SELECT baseline_version INTO v_version
  FROM public.reference_catalog_snapshot_receipts
  WHERE organization_id = p_organization_id;
  IF FOUND THEN
    RETURN v_version;
  END IF;

  SELECT version, definition_json INTO STRICT v_version, v_definition
  FROM public.reference_catalog_baselines
  ORDER BY version DESC
  LIMIT 1;

  FOR v_category IN SELECT value FROM jsonb_array_elements(v_definition->'categories') LOOP
    INSERT INTO public.reference_categories (organization_id, code, title, is_user_extensible)
    VALUES (
      p_organization_id,
      v_category->>'code',
      v_category->>'title',
      (v_category->>'isUserExtensible')::boolean
    );
    SELECT id INTO STRICT v_category_id
    FROM public.reference_categories
    WHERE organization_id = p_organization_id AND code = v_category->>'code';

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_category->'items') LOOP
      INSERT INTO public.reference_items (
        organization_id, category_id, code, title, sort_order, is_active, meta_json
      ) VALUES (
        p_organization_id,
        v_category_id,
        v_item->>0,
        v_item->>1,
        (v_item->>2)::integer,
        true,
        COALESCE(v_item->3, '{}'::jsonb)
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.reference_catalog_snapshot_receipts (organization_id, baseline_version)
  VALUES (p_organization_id, v_version);
  RETURN v_version;
END
$$;


--
-- Name: set_current_patient_calendar_timezone(text, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_current_patient_calendar_timezone(p_value text, p_only_if_empty boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_updated_count bigint := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL OR p_only_if_empty IS NULL THEN
    RETURN false;
  END IF;
  IF p_value IS NOT NULL AND (length(p_value) < 1 OR length(p_value) > 120) THEN
    RETURN false;
  END IF;
  IF p_value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names AS timezone WHERE timezone.name = p_value
  ) THEN
    RETURN false;
  END IF;
  IF p_only_if_empty AND p_value IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.platform_users AS platform_user
  SET calendar_timezone = p_value, updated_at = now()
  WHERE platform_user.id = v_patient_user_id
    AND platform_user.role = 'client'
    AND platform_user.merged_into_id IS NULL
    AND (NOT p_only_if_empty OR platform_user.calendar_timezone IS NULL);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END
$$;


--
-- Name: set_staff_security_self_password_hash(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_staff_security_self_password_hash(p_password_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := app.require_staff_security_self_user_id();

  UPDATE public.user_password_credentials AS credentials
  SET password_hash = COALESCE(p_password_hash, credentials.password_hash),
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = CASE
        WHEN p_password_hash IS NULL THEN credentials.updated_at
        ELSE statement_timestamp()
      END
  WHERE credentials.user_id = v_user_id;

  RETURN FOUND;
END
$$;


--
-- Name: specialist_task_reminder_materialization_fingerprint(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.specialist_task_reminder_materialization_fingerprint(p_task_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_reminder_specialist_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);
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
$$;


--
-- Name: staff_user_has_password_credentials(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.staff_user_has_password_credentials(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_staff'::name]::name[]);
SELECT EXISTS (
    SELECT 1
    FROM public.user_password_credentials AS c
    WHERE c.user_id = p_user_id
  )
$$;


--
-- Name: staff_user_has_web_oauth_binding(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.staff_user_has_web_oauth_binding(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$SELECT app.require_attested_context_for_roles('app_seam_oauth_owner'::name, ARRAY['app_staff'::name]::name[]);
SELECT EXISTS (
    SELECT 1
    FROM public.user_oauth_bindings AS b
    WHERE b.user_id = p_user_id
      AND b.provider IN ('google', 'yandex', 'apple')
  )
$$;


--
-- Name: start_patient_invite_email_proof(text, text, text, timestamp with time zone, text, bigint, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.start_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_proof_expires_at timestamp with time zone, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text) RETURNS TABLE(ok boolean, code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text := lower(btrim(p_email_normalized));
  v_secret text;
  v_expected text;
  v_now_epoch bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_authorization_nonce IS NULL OR p_authorization_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     OR p_authorization_expires_epoch <= v_now_epoch
     OR p_authorization_expires_epoch > v_now_epoch + 60
     OR p_authorization_signature IS NULL OR p_authorization_signature !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  SELECT secret INTO v_secret FROM app.context_signing_secrets WHERE id = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  v_expected := encode(app_ext.hmac(concat_ws(
    '|', 'patient-invite-proof', 'v1', 'start', p_authorization_nonce,
    p_authorization_expires_epoch::text, p_continuation_hash, v_email, p_code_hash,
    COALESCE(floor(extract(epoch FROM p_proof_expires_at))::bigint::text, '')
  ), v_secret, 'sha256'), 'hex');
  IF lower(p_authorization_signature) IS DISTINCT FROM v_expected THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_invite.status <> 'pending'
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now()
     OR v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text;
    RETURN;
  END IF;
  IF v_email = '' OR position('@' IN v_email) <= 1
     OR p_code_hash IS NULL OR p_code_hash = ''
     OR p_proof_expires_at IS NULL OR p_proof_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  IF v_invite.recipient_binding = 'bound_email'
     AND v_invite.invited_email_normalized IS DISTINCT FROM v_email THEN
    RETURN QUERY SELECT false, 'wrong_recipient'::text;
    RETURN;
  ELSIF v_invite.recipient_binding NOT IN ('bound_email', 'unbound_email_claim') THEN
    RETURN QUERY SELECT false, 'invalid_invite'::text;
    RETURN;
  END IF;
  IF v_invite.proof_started_at IS NOT NULL
     AND v_invite.proof_started_at > now() - interval '30 seconds' THEN
    RETURN QUERY SELECT false, 'rate_limited'::text;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET proof_email_normalized = v_email,
      proof_code_hash = p_code_hash,
      proof_started_at = now(),
      proof_expires_at = LEAST(p_proof_expires_at, v_invite.continuation_expires_at, v_invite.expires_at),
      proof_attempts = 0,
      proof_verified_at = NULL,
      updated_at = now()
  WHERE invite.id = v_invite.id;
  RETURN QUERY SELECT true, NULL::text;
END
$_$;


--
-- Name: start_provisioned_organization_trial(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.start_provisioned_organization_trial() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid;
  v_policy record;
  v_registration_tariff_id uuid;
  v_started_at timestamptz;
  v_trial_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_platform_settings'::name]::name[]);

  IF v_patient_user_id IS NULL THEN
    RAISE EXCEPTION 'provisioning_patient_principal_required';
  END IF;

  v_organization_id := app.current_provisioned_owner_organization();
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'provisioned_owner_organization_required';
  END IF;

  -- §5a item 2.6a -- the registration-tariff setting, independent of the trial policy below. A
  -- missing row, a NULL tariff_id, or a since-archived tariff all collapse to the same NULL here:
  -- "no starting tariff configured" is a legal admin choice, not a lookup failure.
  SELECT reg.tariff_id
  INTO v_registration_tariff_id
  FROM public.saas_registration_tariff_policy AS reg
  INNER JOIN public.saas_tariffs AS tariff
    ON tariff.id = reg.tariff_id
   AND tariff.is_active
  WHERE reg.key = 'global'
  LIMIT 1
  FOR UPDATE OF reg;

  SELECT policy.*
  INTO v_policy
  FROM public.saas_trial_policy AS policy
  INNER JOIN public.saas_tariffs AS tariff
    ON tariff.id = policy.tariff_id
   AND tariff.is_active
  WHERE policy.key = 'global'
    AND policy.is_active
    AND policy.start_event = 'organization_provisioned'
  LIMIT 1
  FOR UPDATE OF policy;
  IF NOT FOUND THEN
    -- No active trial policy is configured on this platform (owner has not set one). Whether the
    -- organization instead gets a direct starting tariff is governed by the independent
    -- registration-tariff setting above -- never a hardcoded value.
    IF v_registration_tariff_id IS NOT NULL THEN
      UPDATE public.be_organizations
      SET tariff_id = v_registration_tariff_id,
          updated_at = now()
      WHERE id = v_organization_id;

      INSERT INTO public.admin_audit_log (
        organization_id, actor_id, action, target_id, details, status
      ) VALUES (
        v_organization_id, v_patient_user_id, 'saas_registration_tariff_assign',
        v_registration_tariff_id::text,
        jsonb_build_object(
          'reason', 'automatic organization provisioning -- registration tariff setting',
          'before', NULL,
          'after', jsonb_build_object('tariffId', v_registration_tariff_id)
        ),
        'ok'
      );
    END IF;
    -- #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала -- доступа нет». Registration
    -- tariff also unset: the person picks a tariff themselves, and the organization is left with no
    -- tariff_id -- there is no separate "compatibility" state left to land it in.
    RETURN false;
  END IF;

  v_started_at := clock_timestamp();
  INSERT INTO public.saas_organization_trials (
    organization_id, tariff_id, started_at, ends_at, grace_ends_at,
    post_trial_behavior, post_trial_tariff_id, status, created_by
  ) VALUES (
    v_organization_id, v_policy.tariff_id, v_started_at,
    v_started_at + make_interval(days => v_policy.duration_days),
    v_started_at + make_interval(days => v_policy.duration_days + v_policy.grace_days),
    v_policy.post_trial_behavior, v_policy.post_trial_tariff_id, 'active', v_patient_user_id
  )
  ON CONFLICT (organization_id) DO NOTHING
  RETURNING id INTO v_trial_id;
  IF v_trial_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_organizations
  SET tariff_id = v_policy.tariff_id,
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id, v_patient_user_id, 'saas_trial_start', v_trial_id::text,
    jsonb_build_object(
      'reason', 'automatic organization provisioning trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', v_policy.tariff_id,
        'durationDays', v_policy.duration_days,
        'graceDays', v_policy.grace_days,
        'startEvent', v_policy.start_event,
        'postTrialBehavior', v_policy.post_trial_behavior,
        'postTrialTariffId', v_policy.post_trial_tariff_id
      )
    ),
    'ok'
  );
  RETURN true;
END
$$;


--
-- Name: sync_clinic_dedicated_bot_binding(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.sync_clinic_dedicated_bot_binding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_channel text;
  v_credential text;
  v_fingerprint text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.scope = 'admin' AND OLD.organization_id IS NOT NULL THEN
      v_channel := CASE OLD.key
        WHEN 'clinic_telegram_bot_token' THEN 'telegram'
        WHEN 'clinic_max_bot_api_key' THEN 'max'
        ELSE NULL
      END;
      IF v_channel IS NOT NULL THEN
        DELETE FROM public.clinic_dedicated_bot_bindings
        WHERE channel = v_channel AND organization_id = OLD.organization_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.scope <> 'admin' OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_channel := CASE NEW.key
    WHEN 'clinic_telegram_bot_token' THEN 'telegram'
    WHEN 'clinic_max_bot_api_key' THEN 'max'
    ELSE NULL
  END;
  IF v_channel IS NULL THEN
    RETURN NEW;
  END IF;

  v_credential := NULLIF(btrim(NEW.value_json #>> '{value}'), '');
  DELETE FROM public.clinic_dedicated_bot_bindings
  WHERE channel = v_channel AND organization_id = NEW.organization_id;
  IF v_credential IS NULL THEN
    RETURN NEW;
  END IF;

  v_fingerprint := encode(app_ext.digest(v_credential, 'sha256'), 'hex');
  INSERT INTO public.clinic_dedicated_bot_bindings (
    channel, organization_id, credential_fingerprint, is_active, updated_at
  ) VALUES (v_channel, NEW.organization_id, v_fingerprint, true, now());
  RETURN NEW;
END
$$;


--
-- Name: touch_current_patient_plan_last_opened(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.touch_current_patient_plan_last_opened(p_instance_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_updated_count bigint := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.treatment_program_instances AS instance
  SET patient_plan_last_opened_at = now(), updated_at = now()
  WHERE instance.id = p_instance_id
    AND instance.organization_id = v_organization_id
    AND instance.patient_user_id = v_patient_user_id
    AND instance.status = 'active';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END
$$;


--
-- Name: touch_current_patient_support_conversation_activity(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.touch_current_patient_support_conversation_activity(p_message_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_activity_at timestamptz := transaction_timestamp();
  v_updated_count bigint := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.support_conversations AS conversation
  SET last_message_at = GREATEST(conversation.last_message_at, v_activity_at),
      updated_at = v_activity_at
  FROM public.support_conversation_messages AS message
  WHERE message.id = p_message_id
    AND message.xmin = pg_current_xact_id()::text::xid
    AND message.organization_id = v_organization_id
    AND message.conversation_id = conversation.id
    AND message.sender_role = 'user'
    AND message.source = 'webapp'
    AND conversation.organization_id = v_organization_id
    AND conversation.platform_user_id = v_patient_user_id
    AND conversation.source = 'webapp'
    AND conversation.admin_scope = 'support'
    AND conversation.status = 'open'
    AND conversation.closed_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END
$$;


--
-- Name: try_acquire_integrator_idempotency(text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.try_acquire_integrator_idempotency(p_key text, p_ttl_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'integrator', 'pg_temp'
    AS $_$
DECLARE v_key text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.idempotency.acquire', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg]), 'app.try_acquire_integrator_idempotency(text,integer)'::regprocedure);

  IF p_key IS NULL OR btrim(p_key) = '' OR p_ttl_seconds IS NULL
     OR p_ttl_seconds < 1 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'bounded idempotency key and ttl required';
  END IF;
  INSERT INTO integrator.idempotency_keys AS target
    (key, request_hash, status, response_body, expires_at)
  VALUES (p_key, '__integrator_incoming_event__', 200, '{}'::jsonb,
    now() + p_ttl_seconds * interval '1 second')
  ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at,
    request_hash = EXCLUDED.request_hash, status = EXCLUDED.status, response_body = EXCLUDED.response_body
  WHERE target.expires_at < now()
  RETURNING key INTO v_key;
  RETURN v_key IS NOT NULL;
END
$_$;


--
-- Name: upsert_google_calendar_event_id(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.upsert_google_calendar_event_id(p_appointment_id uuid, p_event_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
    AS $_$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'calendar.map.upsert', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.upsert_google_calendar_event_id(uuid,text)'::regprocedure);

  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR NOT EXISTS (
    SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization and event id required'; END IF;
  INSERT INTO public.booking_calendar_map(appointment_key, gcal_event_id)
  VALUES ('be:' || p_appointment_id::text, p_event_id)
  ON CONFLICT (appointment_key) DO UPDATE SET gcal_event_id = EXCLUDED.gcal_event_id, updated_at = now();
  UPDATE public.patient_bookings SET gcal_event_id = p_event_id, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$_$;


--
-- Name: upsert_integration_data_quality_incident(text, text, text, text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.upsert_integration_data_quality_incident(p_integration text, p_entity text, p_external_id text, p_field text, p_raw_value text, p_timezone_used text, p_error_reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'integrator', 'pg_temp'
    AS $_$
DECLARE v_occurrences integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_service'::name, 'service'::app.port_context_class, 'integrator.data-quality.upsert', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg]), 'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)'::regprocedure);

  INSERT INTO integrator.integration_data_quality_incidents
    (integration, entity, external_id, field, raw_value, timezone_used, error_reason,
     status, first_seen_at, last_seen_at, occurrences)
  VALUES (p_integration, p_entity, p_external_id, p_field, p_raw_value, p_timezone_used,
    p_error_reason, 'open', now(), now(), 1)
  ON CONFLICT (integration, entity, external_id, field, error_reason) DO UPDATE SET
    last_seen_at = now(),
    occurrences = integrator.integration_data_quality_incidents.occurrences + 1,
    raw_value = COALESCE(EXCLUDED.raw_value, integrator.integration_data_quality_incidents.raw_value),
    timezone_used = COALESCE(EXCLUDED.timezone_used, integrator.integration_data_quality_incidents.timezone_used)
  RETURNING occurrences INTO v_occurrences;
  RETURN v_occurrences;
END
$_$;


--
-- Name: upsert_patient_reminder_occurrence_plan(text, text, uuid, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.upsert_patient_reminder_occurrence_plan(p_occurrence_id text, p_rule_id text, p_organization_id uuid, p_platform_user_id uuid, p_occurrence_key text, p_planned_at timestamp with time zone) RETURNS TABLE(occurrence_id text, delivery_generation integer, materializable boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  caller_organization_id uuid;
  existing integrator.user_reminder_occurrences%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_materialization_owner'::name, ARRAY['app_staff'::name]::name[]);

  caller_organization_id := NULLIF(current_setting('app.org', true), '')::uuid;
  IF caller_organization_id IS NULL OR caller_organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'patient reminder materialization tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
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
      )
  ) THEN
    RETURN QUERY SELECT p_occurrence_id, 0, false;
    RETURN;
  END IF;

  INSERT INTO integrator.user_reminder_occurrences (
    id, rule_id, platform_user_id, occurrence_key, planned_at, status,
    delivery_generation, organization_id, created_at, updated_at
  ) VALUES (
    p_occurrence_id, p_rule_id, p_platform_user_id, p_occurrence_key, p_planned_at, 'planned',
    0, p_organization_id, statement_timestamp(), statement_timestamp()
  ) ON CONFLICT (occurrence_key) DO NOTHING;

  SELECT * INTO existing
  FROM integrator.user_reminder_occurrences AS occurrence
  WHERE occurrence.occurrence_key = p_occurrence_key
  FOR UPDATE;
  IF existing.rule_id IS DISTINCT FROM p_rule_id
    OR existing.organization_id IS DISTINCT FROM p_organization_id
    OR existing.platform_user_id IS DISTINCT FROM p_platform_user_id
    OR existing.planned_at IS DISTINCT FROM p_planned_at
    OR existing.status NOT IN ('planned', 'queued')
  THEN
    RETURN QUERY SELECT existing.id, existing.delivery_generation, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT existing.id, existing.delivery_generation, true;
END
$$;


--
-- Name: verify_patient_invite_email_proof(text, text, text, text, bigint, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.verify_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text) RETURNS TABLE(ok boolean, code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text := lower(btrim(p_email_normalized));
  v_secret text;
  v_expected text;
  v_now_epoch bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_patient_invite_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF p_authorization_nonce IS NULL OR p_authorization_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     OR p_authorization_expires_epoch <= v_now_epoch
     OR p_authorization_expires_epoch > v_now_epoch + 60
     OR p_authorization_signature IS NULL OR p_authorization_signature !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  END IF;
  SELECT secret INTO v_secret FROM app.context_signing_secrets WHERE id = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  END IF;
  v_expected := encode(app_ext.hmac(concat_ws(
    '|', 'patient-invite-proof', 'v1', 'verify', p_authorization_nonce,
    p_authorization_expires_epoch::text, p_continuation_hash, v_email, p_code_hash, ''
  ), v_secret, 'sha256'), 'hex');
  IF lower(p_authorization_signature) IS DISTINCT FROM v_expected THEN
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  END IF;
  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now()
     OR v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  PERFORM 1 FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text;
    RETURN;
  END IF;
  IF v_invite.status = 'accepted' THEN
    IF v_invite.recipient_binding = 'unbound_email_claim'
       AND v_invite.invited_email_normalized IS NULL
       AND v_invite.accepted_by_platform_user_id = v_invite.patient_user_id
       AND v_invite.accepted_via = 'email_otp'
       AND v_invite.proof_verified_at IS NOT NULL
       AND v_invite.proof_email_normalized = v_email
       AND v_invite.proof_code_hash = p_code_hash
       AND v_invite.proof_expires_at IS NOT NULL
       AND v_invite.proof_expires_at > now() THEN
      RETURN QUERY SELECT true, NULL::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'invalid_code'::text;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  IF v_invite.proof_verified_at IS NOT NULL
     AND v_invite.proof_email_normalized = v_email THEN
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;
  IF v_invite.proof_email_normalized IS DISTINCT FROM v_email
     OR (v_invite.recipient_binding = 'bound_email'
         AND v_invite.invited_email_normalized IS DISTINCT FROM v_email)
     OR v_invite.recipient_binding NOT IN ('bound_email', 'unbound_email_claim')
     OR v_invite.proof_code_hash IS NULL
     OR v_invite.proof_expires_at IS NULL THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  IF v_invite.proof_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'expired_code'::text;
    RETURN;
  END IF;
  IF v_invite.proof_attempts >= 5 THEN
    RETURN QUERY SELECT false, 'too_many_attempts'::text;
    RETURN;
  END IF;
  IF v_invite.proof_code_hash <> p_code_hash THEN
    UPDATE public.patient_invites AS invite
    SET proof_attempts = proof_attempts + 1, updated_at = now()
    WHERE invite.id = v_invite.id;
    RETURN QUERY SELECT false,
      CASE WHEN v_invite.proof_attempts + 1 >= 5 THEN 'too_many_attempts'::text ELSE 'invalid_code'::text END;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET proof_verified_at = now(), updated_at = now()
  WHERE invite.id = v_invite.id;
  RETURN QUERY SELECT true, NULL::text;
END
$_$;


--
-- Name: enforce_relation_birth_wall(); Type: FUNCTION; Schema: app_control; Owner: -
--

CREATE FUNCTION app_control.enforce_relation_birth_wall() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app_control', 'pg_temp'
    AS $$
DECLARE
  command record;
  relation record;
  declared record;
BEGIN
  IF current_setting('bcb.birth_wall_recursing', true) = '1' THEN
    RETURN;
  END IF;
  PERFORM set_config('bcb.birth_wall_recursing', '1', true);
  FOR command IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF command.classid <> 'pg_class'::regclass OR command.objid = 0 THEN
      CONTINUE;
    END IF;
    SELECT n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner_name
      INTO relation
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.oid = command.objid;
    IF NOT FOUND OR relation.relkind NOT IN ('r', 'p')
       OR relation.nspname NOT IN ('public', 'app', 'integrator', 'app_ext') THEN
      CONTINUE;
    END IF;
    SELECT * INTO declared
      FROM app_control.relation_wall_registry registry
     WHERE registry.schema_name = relation.nspname
       AND registry.table_name = relation.relname;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('relation birth wall rejected undeclared table %I.%I',
          relation.nspname, relation.relname);
    END IF;
    IF relation.owner_name <> declared.expected_owner THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('relation birth wall rejected owner %I for %I.%I; expected %I',
          relation.owner_name, relation.nspname, relation.relname, declared.expected_owner);
    END IF;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      relation.nspname, relation.relname);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      relation.nspname, relation.relname);
  END LOOP;
  PERFORM set_config('bcb.birth_wall_recursing', '0', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.birth_wall_recursing', '0', true);
  RAISE;
END
$$;


--
-- Name: resolve_variant_a_identity(uuid); Type: FUNCTION; Schema: app_ext; Owner: -
--

CREATE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE opaque uuid;
BEGIN
  -- The exact public identity root has already checked function/purpose/args;
  -- this private resolver remains executable only by its identity owner.
  INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref)
  VALUES (p_platform_user_id, (
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),1,8) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),9,4) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),13,4) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),17,4) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),21,12)
  )::uuid)
  ON CONFLICT (physical_user_id) DO UPDATE SET physical_user_id = EXCLUDED.physical_user_id
  RETURNING opaque_ref INTO opaque;
  RETURN opaque;
END $$;


--
-- Name: resolve_variant_a_physical(uuid); Type: FUNCTION; Schema: app_ext; Owner: -
--

CREATE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'app', 'app_ext', 'pg_temp'
    AS $$
DECLARE physical_id uuid;
BEGIN
  SELECT physical_user_id INTO physical_id FROM app_ext.variant_a_identity_refs WHERE opaque_ref = p_opaque_ref;
  IF physical_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted opaque identity context required'; END IF;
  RETURN physical_id;
END $$;


--
-- Name: audit_app_runtime_settings_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_app_runtime_settings_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.app_runtime_settings_audit (
    key, scope, organization_id, audience, old_value_json, new_value_json, updated_by, source
  ) VALUES (
    NEW.key,
    NEW.scope,
    NEW.organization_id,
    NEW.audience,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.value_json ELSE NULL END,
    NEW.value_json,
    NEW.updated_by,
    COALESCE(NULLIF(current_setting('app.runtime_settings_audit_source', true), ''), 'runtime_store_write')
  );
  RETURN NEW;
END
$$;


--
-- Name: media_folders_enforce_depth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.media_folders_enforce_depth() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  d INT := 0;
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  WHILE cur IS NOT NULL AND d < 64 LOOP
    d := d + 1;
    SELECT parent_id INTO cur FROM media_folders WHERE id = cur;
  END LOOP;
  IF d > 32 THEN
    RAISE EXCEPTION 'media_folders: max depth 32 exceeded';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: media_folders_prevent_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.media_folders_prevent_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'media_folders: cannot set parent to self';
  END IF;
  cur := NEW.parent_id;
  FOR i IN 1..64 LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'media_folders: cycle detected';
    END IF;
    SELECT parent_id INTO cur FROM media_folders WHERE id = cur;
    EXIT WHEN cur IS NULL;
  END LOOP;
  RETURN NEW;
END;
$$;


--
-- Name: sync_registered_app_runtime_setting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_registered_app_runtime_setting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  runtime_audience text;
  payment_runtime_value jsonb;
BEGIN
  IF current_setting('app.runtime_settings_explicit_dual_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Mixed/restricted source envelopes are legacy-authoritative. Their safe
  -- derived identities are written here, once, so their runtime audit is also
  -- owned by this trigger rather than by an application-side projector.
  IF NEW.key = 'web_push_vapid' AND NEW.scope = 'admin' AND NEW.organization_id IS NULL THEN
    IF NULLIF(btrim(NEW.value_json #>> '{value,publicKey}'), '') IS NULL THEN
      DELETE FROM public.app_runtime_settings
      WHERE key = 'web_push_vapid_public_key' AND scope = 'admin' AND organization_id IS NULL;
    ELSE
      INSERT INTO public.app_runtime_settings
        (key, scope, organization_id, audience, value_json, updated_at, updated_by)
      VALUES (
        'web_push_vapid_public_key', 'admin', NULL, 'public',
        jsonb_build_object('value', jsonb_build_object('publicKey', NEW.value_json #>> '{value,publicKey}')),
        NEW.updated_at, NEW.updated_by
      )
      ON CONFLICT (key, scope) WHERE organization_id IS NULL
      DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                    updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.key = 'booking_payment_providers' AND NEW.scope = 'admin' THEN
    SELECT jsonb_build_object('value', jsonb_build_object(
        'enabled', CASE lower(COALESCE(NEW.value_json #>> '{value,enabled}', 'false'))
          WHEN 'true' THEN true WHEN '1' THEN true ELSE false END,
        'defaultProviderId', COALESCE(NULLIF(btrim(NEW.value_json #>> '{value,defaultProviderId}'), ''), 'mock'),
        'providers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', provider.value->>'id',
            'label', COALESCE(NULLIF(provider.value->>'label', ''), provider.value->>'id'),
            'enabled', CASE lower(COALESCE(provider.value->>'enabled', 'false'))
              WHEN 'true' THEN true WHEN '1' THEN true ELSE false END
          ) ORDER BY provider.value->>'id')
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.value_json #> '{value,providers}') = 'array'
              THEN NEW.value_json #> '{value,providers}' ELSE '[]'::jsonb END
          ) AS provider(value)
          WHERE jsonb_typeof(provider.value) = 'object'
            AND NULLIF(btrim(provider.value->>'id'), '') IS NOT NULL
        ), '[]'::jsonb)
      )) INTO payment_runtime_value;

    UPDATE public.app_runtime_settings
    SET audience = 'authenticated_client', value_json = payment_runtime_value,
        updated_at = NEW.updated_at, updated_by = NEW.updated_by
    WHERE key = 'booking_payment_public_config' AND scope = 'admin'
      AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
    IF NOT FOUND THEN
      IF NEW.organization_id IS NULL THEN
        INSERT INTO public.app_runtime_settings
          (key, scope, organization_id, audience, value_json, updated_at, updated_by)
        VALUES ('booking_payment_public_config', 'admin', NULL, 'authenticated_client',
                payment_runtime_value, NEW.updated_at, NEW.updated_by)
        ON CONFLICT (key, scope) WHERE organization_id IS NULL
        DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                      updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
      ELSE
        INSERT INTO public.app_runtime_settings
          (key, scope, organization_id, audience, value_json, updated_at, updated_by)
        VALUES ('booking_payment_public_config', 'admin', NEW.organization_id, 'authenticated_client',
                payment_runtime_value, NEW.updated_at, NEW.updated_by)
        ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
        DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                      updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.key = 'patient_booking_url' AND NEW.scope = 'admin' THEN
    IF NEW.organization_id IS NULL THEN
      DELETE FROM public.app_runtime_settings
      WHERE key = NEW.key AND scope = NEW.scope AND organization_id IS NULL;
    ELSE
      INSERT INTO public.app_runtime_settings
        (key, scope, organization_id, audience, value_json, updated_at, updated_by)
      VALUES (NEW.key, NEW.scope, NEW.organization_id, 'authenticated_client',
              NEW.value_json, NEW.updated_at, NEW.updated_by)
      ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
      DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                    updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.scope = 'admin' AND NEW.key IN (
    'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
    'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
    'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
    'apple_oauth_key_id', 'apple_oauth_private_key',
    'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri'
  ) THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    SELECT provider.key, 'admin', NULL, 'public', jsonb_build_object('value', provider.enabled), now(), NEW.updated_by
    FROM (VALUES
      ('oauth_yandex_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri'))),
      ('oauth_google_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri'))),
      ('oauth_apple_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
                      'apple_oauth_key_id', 'apple_oauth_private_key'))),
      ('oauth_vk_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri')))
    ) AS provider(key, enabled)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.key = 'sms_fallback_enabled' AND NEW.scope IN ('doctor', 'admin') THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES ('public_sms_fallback_enabled', 'admin', NULL, 'public',
      jsonb_build_object('value', COALESCE((
        SELECT CASE lower(value_json->>'value')
          WHEN 'true' THEN true WHEN '1' THEN true WHEN 'false' THEN false WHEN '0' THEN false ELSE NULL END
        FROM public.system_settings
        WHERE key = 'sms_fallback_enabled' AND organization_id IS NULL AND scope IN ('doctor', 'admin')
        ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END LIMIT 1
      ), false)), NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  SELECT audience INTO runtime_audience
  FROM public.app_runtime_settings
  WHERE key = NEW.key AND scope = NEW.scope
  ORDER BY organization_id IS NULL DESC
  LIMIT 1;
  IF runtime_audience IS NULL THEN RETURN NEW; END IF;

  IF NEW.organization_id IS NULL THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (NEW.key, NEW.scope, NULL, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (NEW.key, NEW.scope, NEW.organization_id, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: system_settings_test_lock_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.system_settings_test_lock_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  locked_keys TEXT[] := ARRAY['patient_app_maintenance_enabled','dev_mode','test_account_identifiers','specialist_signup_enabled','patient_program_discussion_ui_enabled'];
BEGIN
  IF OLD.key = ANY(locked_keys) THEN
    RAISE EXCEPTION 'TEST ENV LOCK: system_settings key "%" is locked for safety. Remove trigger system_settings_test_lock before changing.', OLD.key
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: context_nonce_ledger; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.context_nonce_ledger (
    nonce text NOT NULL,
    backend_pid integer NOT NULL,
    accepted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_epoch bigint NOT NULL
);

ALTER TABLE ONLY app.context_nonce_ledger FORCE ROW LEVEL SECURITY;


--
-- Name: context_signing_secrets; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.context_signing_secrets (
    id boolean DEFAULT true NOT NULL,
    secret text NOT NULL,
    CONSTRAINT context_signing_secrets_id_check CHECK (id),
    CONSTRAINT context_signing_secrets_secret_check CHECK ((length(secret) >= 32))
);

ALTER TABLE ONLY app.context_signing_secrets FORCE ROW LEVEL SECURITY;


--
-- Name: principal_context; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.principal_context (
    backend_pid integer NOT NULL,
    org_id uuid,
    patient_user_id uuid,
    integrator_user_id bigint,
    nonce text NOT NULL,
    expires_epoch bigint NOT NULL,
    installed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT principal_context_backend_pid_check CHECK ((backend_pid > 0))
);

ALTER TABLE ONLY app.principal_context FORCE ROW LEVEL SECURITY;


--
-- Name: org_table_allowlist; Type: TABLE; Schema: app_control; Owner: -
--

CREATE TABLE app_control.org_table_allowlist (
    schema_name name NOT NULL,
    table_name name NOT NULL
);

ALTER TABLE ONLY app_control.org_table_allowlist FORCE ROW LEVEL SECURITY;


--
-- Name: relation_wall_registry; Type: TABLE; Schema: app_control; Owner: -
--

CREATE TABLE app_control.relation_wall_registry (
    schema_name name NOT NULL,
    table_name name NOT NULL,
    data_class text NOT NULL,
    wall text NOT NULL,
    expected_owner name NOT NULL,
    CONSTRAINT relation_wall_registry_data_class_check CHECK ((data_class = ANY (ARRAY['P'::text, 'C'::text, 'S'::text, 'R'::text, 'T'::text])))
);

ALTER TABLE ONLY app_control.relation_wall_registry FORCE ROW LEVEL SECURITY;


--
-- Name: accepted_port_contexts; Type: TABLE; Schema: app_ext; Owner: -
--

CREATE TABLE app_ext.accepted_port_contexts (
    database_oid oid NOT NULL,
    backend_pid integer NOT NULL,
    transaction_id xid8 NOT NULL,
    capability_id uuid NOT NULL,
    session_login name NOT NULL,
    port app.port_name NOT NULL,
    target_role name NOT NULL,
    context_class app.port_context_class NOT NULL,
    purpose text NOT NULL,
    function_identity regprocedure,
    typed_args_hash bytea NOT NULL,
    actor_ref uuid,
    subject_ref uuid,
    organization_id uuid,
    integrator_user_id bigint,
    request_id uuid,
    installed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    cleared_at timestamp with time zone,
    CONSTRAINT accepted_port_contexts_check CHECK (((cleared_at IS NULL) OR (cleared_at >= installed_at))),
    CONSTRAINT accepted_port_contexts_typed_args_hash_check CHECK ((octet_length(typed_args_hash) = 32))
);

ALTER TABLE ONLY app_ext.accepted_port_contexts FORCE ROW LEVEL SECURITY;


--
-- Name: port_context_capabilities; Type: TABLE; Schema: app_ext; Owner: -
--

CREATE TABLE app_ext.port_context_capabilities (
    capability_id uuid NOT NULL,
    port app.port_name NOT NULL,
    session_login name NOT NULL,
    target_role name NOT NULL,
    context_class app.port_context_class NOT NULL,
    purpose text NOT NULL,
    function_identity regprocedure,
    active_from timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    active_until timestamp with time zone,
    CONSTRAINT port_context_capabilities_check CHECK (((active_until IS NULL) OR (active_from < active_until))),
    CONSTRAINT port_context_capabilities_purpose_check CHECK ((purpose ~ '^[a-z][a-z0-9._:-]{0,127}$'::text))
);

ALTER TABLE ONLY app_ext.port_context_capabilities FORCE ROW LEVEL SECURITY;


--
-- Name: variant_a_identity_refs; Type: TABLE; Schema: app_ext; Owner: -
--

CREATE TABLE app_ext.variant_a_identity_refs (
    physical_user_id uuid NOT NULL,
    opaque_ref uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

ALTER TABLE ONLY app_ext.variant_a_identity_refs FORCE ROW LEVEL SECURITY;


--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);

ALTER TABLE ONLY drizzle.__drizzle_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: delivery_attempt_logs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.delivery_attempt_logs (
    id bigint NOT NULL,
    intent_type text,
    intent_event_id text,
    correlation_id text,
    channel text NOT NULL,
    status text NOT NULL,
    attempt integer NOT NULL,
    reason text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT delivery_attempt_logs_attempt_check CHECK ((attempt > 0)),
    CONSTRAINT delivery_attempt_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text, 'skipped'::text])))
);

ALTER TABLE ONLY integrator.delivery_attempt_logs FORCE ROW LEVEL SECURITY;


--
-- Name: delivery_attempt_logs_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.delivery_attempt_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delivery_attempt_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.delivery_attempt_logs_id_seq OWNED BY integrator.delivery_attempt_logs.id;


--
-- Name: idempotency_keys; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.idempotency_keys (
    key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    request_hash text NOT NULL,
    status smallint NOT NULL,
    response_body jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY integrator.idempotency_keys FORCE ROW LEVEL SECURITY;


--
-- Name: integration_data_quality_incidents; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.integration_data_quality_incidents (
    id bigint NOT NULL,
    integration text NOT NULL,
    entity text NOT NULL,
    external_id text NOT NULL,
    field text NOT NULL,
    raw_value text,
    timezone_used text,
    error_reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrences integer DEFAULT 1 NOT NULL,
    CONSTRAINT integration_data_quality_incidents_error_reason_check CHECK ((error_reason = ANY (ARRAY['invalid_datetime'::text, 'invalid_timezone'::text, 'unsupported_format'::text, 'invalid_branch_id'::text, 'query_failed'::text, 'missing_or_empty'::text, 'invalid_iana'::text, 'backfill_unresolvable'::text]))),
    CONSTRAINT integration_data_quality_incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'unresolved'::text])))
);

ALTER TABLE ONLY integrator.integration_data_quality_incidents FORCE ROW LEVEL SECURITY;


--
-- Name: integration_data_quality_incidents_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.integration_data_quality_incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_data_quality_incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.integration_data_quality_incidents_id_seq OWNED BY integrator.integration_data_quality_incidents.id;


--
-- Name: projection_outbox; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.projection_outbox (
    id bigint NOT NULL,
    event_type text NOT NULL,
    idempotency_key text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts_done integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_try_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY integrator.projection_outbox FORCE ROW LEVEL SECURITY;


--
-- Name: projection_outbox_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.projection_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projection_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.projection_outbox_id_seq OWNED BY integrator.projection_outbox.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY integrator.schema_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: user_reminder_delivery_logs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_reminder_delivery_logs (
    id text NOT NULL,
    occurrence_id text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    error_code text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);

ALTER TABLE ONLY integrator.user_reminder_delivery_logs FORCE ROW LEVEL SECURITY;


--
-- Name: user_reminder_occurrences; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_reminder_occurrences (
    id text NOT NULL,
    rule_id text NOT NULL,
    occurrence_key text NOT NULL,
    planned_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    queued_at timestamp with time zone,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    delivery_channel text,
    delivery_job_id text,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    delivery_generation integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY integrator.user_reminder_occurrences FORCE ROW LEVEL SECURITY;


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_id text,
    conflict_key text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    repeat_count integer DEFAULT 1 NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT admin_audit_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'partial_failure'::text, 'error'::text])))
);

ALTER TABLE ONLY public.admin_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: app_runtime_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_runtime_settings (
    key text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    organization_id uuid,
    audience text NOT NULL,
    value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT app_runtime_settings_audience_check CHECK ((audience = ANY (ARRAY['public'::text, 'authenticated_client'::text, 'server'::text]))),
    CONSTRAINT app_runtime_settings_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.app_runtime_settings FORCE ROW LEVEL SECURITY;


--
-- Name: app_runtime_settings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_runtime_settings_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    scope text NOT NULL,
    organization_id uuid,
    audience text NOT NULL,
    old_value_json jsonb,
    new_value_json jsonb NOT NULL,
    updated_by uuid,
    source text DEFAULT 'runtime_store_write'::text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_runtime_settings_audit_audience_check CHECK ((audience = ANY (ARRAY['public'::text, 'authenticated_client'::text, 'server'::text]))),
    CONSTRAINT app_runtime_settings_audit_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.app_runtime_settings_audit FORCE ROW LEVEL SECURITY;


--
-- Name: auth_rate_limit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limit_events (
    scope text NOT NULL,
    key text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.auth_rate_limit_events FORCE ROW LEVEL SECURITY;


--
-- Name: be_appointment_cancellations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_cancellations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid,
    cancellation_type text NOT NULL,
    reason text,
    was_free boolean NOT NULL,
    was_penalized boolean NOT NULL,
    package_session_charged boolean NOT NULL,
    prepayment_retained boolean NOT NULL,
    prepayment_refunded boolean NOT NULL,
    staff_comment text,
    notifications_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    applied_policy_id uuid,
    applied_policy_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_appt_cancellations_actor_check CHECK ((actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text]))),
    CONSTRAINT be_appt_cancellations_type_check CHECK ((cancellation_type = ANY (ARRAY['free'::text, 'penalized'::text, 'package_charged'::text, 'no_package_charge'::text, 'retain_prepayment'::text, 'refund_prepayment'::text, 'custom'::text])))
);

ALTER TABLE ONLY public.be_appointment_cancellations FORCE ROW LEVEL SECURITY;


--
-- Name: be_appointment_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_appointment_history_events FORCE ROW LEVEL SECURITY;


--
-- Name: be_appointment_no_shows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_no_shows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid,
    reason text,
    staff_comment text,
    notifications_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_appt_no_shows_actor_check CHECK ((actor_type = ANY (ARRAY['specialist'::text, 'admin'::text, 'system'::text])))
);

ALTER TABLE ONLY public.be_appointment_no_shows FORCE ROW LEVEL SECURITY;


--
-- Name: be_appointment_reschedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_reschedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    from_start_at timestamp with time zone NOT NULL,
    from_end_at timestamp with time zone NOT NULL,
    to_start_at timestamp with time zone NOT NULL,
    to_end_at timestamp with time zone NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid,
    was_in_free_reschedule_window boolean NOT NULL,
    free_cancellation_available_at_reschedule boolean NOT NULL,
    free_cancellation_available_after boolean NOT NULL,
    applied_policy_id uuid,
    applied_policy_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    reason text,
    staff_comment text,
    notifications_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_appt_reschedules_actor_check CHECK ((actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text])))
);

ALTER TABLE ONLY public.be_appointment_reschedules FORCE ROW LEVEL SECURITY;


--
-- Name: be_appointment_staff_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_staff_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_appointment_staff_comments FORCE ROW LEVEL SECURITY;


--
-- Name: be_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    room_id uuid,
    specialist_id uuid,
    service_id uuid,
    platform_user_id uuid,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    duration_minutes integer NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    original_start_at timestamp with time zone,
    reschedule_count integer DEFAULT 0 NOT NULL,
    payment_ref text,
    package_usage_ref text,
    phone_normalized text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attribution_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_at timestamp with time zone,
    chain_id uuid,
    chain_position integer,
    appointment_reminder_allowed_preset_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    appointment_reminder_preset_id text,
    appointment_reminder_selection_source text DEFAULT 'specialist_default'::text NOT NULL,
    CONSTRAINT be_appointments_reminder_selection_source_check CHECK ((appointment_reminder_selection_source = ANY (ARRAY['specialist_default'::text, 'patient'::text]))),
    CONSTRAINT be_appointments_source_check CHECK ((source = ANY (ARRAY['native'::text, 'imported'::text, 'admin_manual'::text, 'public_widget'::text]))),
    CONSTRAINT be_appointments_status_check CHECK ((status = ANY (ARRAY['created'::text, 'awaiting_payment'::text, 'paid'::text, 'confirmed'::text, 'rescheduled'::text, 'cancelled_by_patient'::text, 'cancelled_by_specialist'::text, 'late_cancellation'::text, 'no_show'::text, 'completed'::text, 'visit_confirmed'::text, 'charged_to_package'::text, 'manual_review_required'::text]))),
    CONSTRAINT be_appointments_time_check CHECK ((end_at > start_at))
);

ALTER TABLE ONLY public.be_appointments FORCE ROW LEVEL SECURITY;


--
-- Name: be_availability_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    rule_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_availability_rules_type_check CHECK ((rule_type = ANY (ARRAY['buffer_minutes'::text, 'max_chain_slots'::text])))
);

ALTER TABLE ONLY public.be_availability_rules FORCE ROW LEVEL SECURITY;


--
-- Name: be_booking_form_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_booking_form_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    field_key text NOT NULL,
    field_type text NOT NULL,
    label text NOT NULL,
    placeholder text,
    is_required boolean DEFAULT false NOT NULL,
    visible_to_patient boolean DEFAULT true NOT NULL,
    visible_to_staff boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_booking_form_fields_type_check CHECK ((field_type = ANY (ARRAY['first_name'::text, 'last_name'::text, 'phone'::text, 'email'::text, 'comment'::text, 'problem_description'::text, 'complaint'::text, 'free_text'::text, 'custom'::text])))
);

ALTER TABLE ONLY public.be_booking_form_fields FORCE ROW LEVEL SECURITY;


--
-- Name: be_booking_form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_booking_form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_booking_form_submissions FORCE ROW LEVEL SECURITY;


--
-- Name: be_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    city_code text NOT NULL,
    address text,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    short_title text,
    color text,
    CONSTRAINT be_branches_color_hex_check CHECK (((color IS NULL) OR (color ~ '^#[0-9A-Fa-f]{6}$'::text)))
);

ALTER TABLE ONLY public.be_branches FORCE ROW LEVEL SECURITY;


--
-- Name: be_cancellation_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_cancellation_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    scope_level text NOT NULL,
    scope_entity_id uuid,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    free_cancel_hours_before integer DEFAULT 72 NOT NULL,
    cancellation_allowed boolean DEFAULT true NOT NULL,
    late_cancellation_behavior text DEFAULT 'manual_review'::text NOT NULL,
    refund_prepayment_on_late text DEFAULT 'manual'::text NOT NULL,
    charge_package_session_on_late boolean DEFAULT false NOT NULL,
    requires_staff_confirmation boolean DEFAULT false NOT NULL,
    notify_patient boolean DEFAULT true NOT NULL,
    notify_staff boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_cancel_policies_late_behavior_check CHECK ((late_cancellation_behavior = ANY (ARRAY['penalty'::text, 'manual_review'::text, 'charge_package'::text, 'retain_prepayment'::text, 'refund_prepayment'::text]))),
    CONSTRAINT be_cancel_policies_scope_check CHECK ((scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])))
);

ALTER TABLE ONLY public.be_cancellation_policies FORCE ROW LEVEL SECURITY;


--
-- Name: be_clinic_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_clinic_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price_minor integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    prepayment_applicable boolean DEFAULT false NOT NULL,
    usable_in_packages boolean DEFAULT true NOT NULL,
    online_payment_applicable boolean DEFAULT false NOT NULL,
    public_widget_visible boolean DEFAULT true NOT NULL,
    admin_manual_only boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    buffer_after_minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT be_clinic_services_buffer_after_check CHECK (((buffer_after_minutes >= 0) AND ((buffer_after_minutes % 5) = 0))),
    CONSTRAINT be_clinic_services_duration_check CHECK ((duration_minutes > 0)),
    CONSTRAINT be_clinic_services_price_check CHECK ((price_minor >= 0))
);

ALTER TABLE ONLY public.be_clinic_services FORCE ROW LEVEL SECURITY;


--
-- Name: be_external_entity_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_external_entity_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entity_type text NOT NULL,
    canonical_id uuid NOT NULL,
    external_system text NOT NULL,
    external_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_external_entity_type_check CHECK ((entity_type = ANY (ARRAY['branch'::text, 'specialist'::text, 'service'::text, 'appointment'::text, 'availability'::text]))),
    CONSTRAINT be_external_system_check CHECK ((external_system = ANY (ARRAY['rubitime'::text])))
);

ALTER TABLE ONLY public.be_external_entity_mappings FORCE ROW LEVEL SECURITY;


--
-- Name: be_organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    role text NOT NULL,
    specialist_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    doctor_screens_disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT be_organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'doctor'::text, 'assistant'::text]))),
    CONSTRAINT be_organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'disabled'::text])))
);

ALTER TABLE ONLY public.be_organization_members FORCE ROW LEVEL SECURITY;


--
-- Name: be_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_organizations (
    id uuid NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tariff_id uuid,
    cabinet_first_entered_at timestamp with time zone
);

ALTER TABLE ONLY public.be_organizations FORCE ROW LEVEL SECURITY;


--
-- Name: be_package_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_package_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_package_id uuid NOT NULL,
    event_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_package_history_events FORCE ROW LEVEL SECURITY;


--
-- Name: be_package_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_package_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_package_items_quantity_check CHECK ((quantity > 0))
);

ALTER TABLE ONLY public.be_package_items FORCE ROW LEVEL SECURITY;


--
-- Name: be_package_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_package_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_package_id uuid NOT NULL,
    patient_package_item_id uuid NOT NULL,
    appointment_id uuid,
    usage_kind text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    comment text,
    created_by_platform_user_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_package_usages_kind_check CHECK ((usage_kind = ANY (ARRAY['reserve'::text, 'consume'::text, 'release'::text, 'penalty'::text, 'manual_adjust'::text, 'refund'::text]))),
    CONSTRAINT be_package_usages_quantity_check CHECK ((quantity > 0))
);

ALTER TABLE ONLY public.be_package_usages FORCE ROW LEVEL SECURITY;


--
-- Name: be_patient_booking_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_booking_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    is_problematic boolean DEFAULT false NOT NULL,
    booking_blocked boolean DEFAULT false NOT NULL,
    problematic_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    no_show_count integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.be_patient_booking_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: be_patient_package_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_package_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_package_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity_initial integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_patient_package_items_quantity_check CHECK ((quantity_initial > 0))
);

ALTER TABLE ONLY public.be_patient_package_items FORCE ROW LEVEL SECURITY;


--
-- Name: be_patient_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    subscription_package_id uuid,
    status text DEFAULT 'offered'::text NOT NULL,
    title text NOT NULL,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    validity_days integer,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    deduction_mode text DEFAULT 'auto_on_visit_confirmed'::text NOT NULL,
    payment_intent_id uuid,
    payment_ref text,
    assigned_by_platform_user_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sold_at timestamp with time zone,
    paid_amount_minor integer,
    paid_currency text,
    display_number integer NOT NULL,
    CONSTRAINT be_patient_packages_deduction_mode_check CHECK ((deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text]))),
    CONSTRAINT be_patient_packages_display_number_check CHECK ((display_number > 0)),
    CONSTRAINT be_patient_packages_price_check CHECK ((price_minor >= 0)),
    CONSTRAINT be_patient_packages_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'awaiting_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.be_patient_packages FORCE ROW LEVEL SECURITY;


--
-- Name: be_patient_packages_display_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.be_patient_packages_display_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: be_patient_packages_display_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.be_patient_packages_display_number_seq OWNED BY public.be_patient_packages.display_number;


--
-- Name: be_patient_timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_timeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    domain text NOT NULL,
    event_type text NOT NULL,
    linked_object_type text NOT NULL,
    linked_object_id text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_patient_timeline_domain_check CHECK ((domain = ANY (ARRAY['appointment'::text, 'payment'::text, 'package'::text])))
);

ALTER TABLE ONLY public.be_patient_timeline_events FORCE ROW LEVEL SECURITY;


--
-- Name: be_payment_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payment_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid,
    platform_user_id uuid,
    payment_id uuid,
    refund_id uuid,
    event_type text NOT NULL,
    amount_minor integer,
    currency text DEFAULT 'RUB'::text,
    provider_id text,
    status text,
    purpose text,
    comment text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_payment_history_events FORCE ROW LEVEL SECURITY;


--
-- Name: be_payment_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    provider_id text NOT NULL,
    appointment_id uuid,
    platform_user_id uuid,
    product_ref text,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    purpose text DEFAULT 'appointment_prepayment'::text NOT NULL,
    provider_intent_ref text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checkout_url text,
    CONSTRAINT be_payment_intents_amount_check CHECK ((amount_minor >= 0))
);

ALTER TABLE ONLY public.be_payment_intents FORCE ROW LEVEL SECURITY;


--
-- Name: be_payment_provider_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payment_provider_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    provider_id text NOT NULL,
    idempotency_key text NOT NULL,
    event_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    intent_ref text
);

ALTER TABLE ONLY public.be_payment_provider_events FORCE ROW LEVEL SECURITY;


--
-- Name: be_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_intent_id uuid NOT NULL,
    appointment_id uuid,
    platform_user_id uuid,
    provider_id text NOT NULL,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    status text DEFAULT 'captured'::text NOT NULL,
    purpose text DEFAULT 'appointment_prepayment'::text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_payments FORCE ROW LEVEL SECURITY;


--
-- Name: be_prepayment_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_prepayment_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    service_id uuid,
    mode text DEFAULT 'disabled'::text NOT NULL,
    amount_minor integer,
    percent_bps integer,
    currency text DEFAULT 'RUB'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    online_category text,
    CONSTRAINT be_prepayment_policies_mode_check CHECK ((mode = ANY (ARRAY['disabled'::text, 'fixed_minor'::text, 'percent'::text, 'full_price'::text]))),
    CONSTRAINT be_prepayment_policies_online_category_check CHECK (((online_category IS NULL) OR (online_category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text])))),
    CONSTRAINT be_prepayment_policies_scope_check CHECK ((((service_id IS NOT NULL) AND (online_category IS NULL)) OR ((service_id IS NULL) AND (online_category IS NOT NULL))))
);

ALTER TABLE ONLY public.be_prepayment_policies FORCE ROW LEVEL SECURITY;


--
-- Name: be_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    appointment_id uuid,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    provider_refund_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_refunds_amount_check CHECK ((amount_minor >= 0))
);

ALTER TABLE ONLY public.be_refunds FORCE ROW LEVEL SECURITY;


--
-- Name: be_reschedule_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_reschedule_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    scope_level text NOT NULL,
    scope_entity_id uuid,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    self_reschedule_hours_before integer DEFAULT 48 NOT NULL,
    max_self_reschedules integer DEFAULT 1 NOT NULL,
    allow_different_branch boolean DEFAULT false NOT NULL,
    allow_different_city boolean DEFAULT false NOT NULL,
    allow_different_specialist boolean DEFAULT false NOT NULL,
    allow_different_service boolean DEFAULT false NOT NULL,
    limit_exceeded_behavior text DEFAULT 'manual_request'::text NOT NULL,
    requires_staff_confirmation boolean DEFAULT false NOT NULL,
    notify_patient boolean DEFAULT true NOT NULL,
    notify_staff boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_reschedule_policies_limit_check CHECK ((limit_exceeded_behavior = ANY (ARRAY['manual_request'::text, 'deny'::text]))),
    CONSTRAINT be_reschedule_policies_scope_check CHECK ((scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])))
);

ALTER TABLE ONLY public.be_reschedule_policies FORCE ROW LEVEL SECURITY;


--
-- Name: be_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_rooms FORCE ROW LEVEL SECURITY;


--
-- Name: be_schedule_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_schedule_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    room_id uuid,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    block_type text NOT NULL,
    title text,
    created_by_actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_schedule_blocks_time_check CHECK ((end_at > start_at)),
    CONSTRAINT be_schedule_blocks_type_check CHECK ((block_type = ANY (ARRAY['block'::text, 'absence'::text, 'manual_booking'::text])))
);

ALTER TABLE ONLY public.be_schedule_blocks FORCE ROW LEVEL SECURITY;


--
-- Name: be_schedule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_schedule_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    start_minute integer NOT NULL,
    end_minute integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    breaks jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT be_schedule_templates_minutes_check CHECK (((start_minute >= 0) AND (end_minute <= 1440) AND (end_minute > start_minute)))
);

ALTER TABLE ONLY public.be_schedule_templates FORCE ROW LEVEL SECURITY;


--
-- Name: be_service_location_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_service_location_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    service_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_service_location_availability FORCE ROW LEVEL SECURITY;


--
-- Name: be_specialist_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialist_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_specialist_locations FORCE ROW LEVEL SECURITY;


--
-- Name: be_specialist_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialist_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    room_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_specialist_rooms FORCE ROW LEVEL SECURITY;


--
-- Name: be_specialist_service_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialist_service_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    service_id uuid NOT NULL,
    branch_id uuid,
    room_id uuid,
    city_code text,
    price_minor_override integer,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.be_specialist_service_availability FORCE ROW LEVEL SECURITY;


--
-- Name: be_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    appointment_reminder_allowed_preset_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    appointment_reminder_default_preset_id text
);

ALTER TABLE ONLY public.be_specialists FORCE ROW LEVEL SECURITY;


--
-- Name: be_subscription_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_subscription_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    validity_days integer,
    deduction_mode text DEFAULT 'auto_on_visit_confirmed'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_subscription_packages_deduction_mode_check CHECK ((deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text]))),
    CONSTRAINT be_subscription_packages_price_check CHECK ((price_minor >= 0))
);

ALTER TABLE ONLY public.be_subscription_packages FORCE ROW LEVEL SECURITY;


--
-- Name: be_working_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_working_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    room_id uuid,
    work_date date NOT NULL,
    start_minute integer,
    end_minute integer,
    is_closed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    breaks jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT be_working_days_hours_check CHECK ((is_closed OR ((start_minute IS NOT NULL) AND (end_minute IS NOT NULL) AND (start_minute >= 0) AND (end_minute <= 1440) AND (end_minute > start_minute))))
);

ALTER TABLE ONLY public.be_working_days FORCE ROW LEVEL SECURITY;


--
-- Name: be_working_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_working_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    room_id uuid,
    weekday integer NOT NULL,
    start_minute integer NOT NULL,
    end_minute integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_working_hours_minutes_check CHECK (((start_minute >= 0) AND (end_minute <= 1440) AND (end_minute > start_minute))),
    CONSTRAINT be_working_hours_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

ALTER TABLE ONLY public.be_working_hours FORCE ROW LEVEL SECURITY;


--
-- Name: booking_calendar_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_calendar_map (
    id bigint NOT NULL,
    appointment_key text NOT NULL,
    gcal_event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.booking_calendar_map FORCE ROW LEVEL SECURITY;


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_calendar_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.booking_calendar_map_id_seq OWNED BY public.booking_calendar_map.id;


--
-- Name: booking_cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.booking_cities FORCE ROW LEVEL SECURITY;


--
-- Name: broadcast_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id text NOT NULL,
    category text NOT NULL,
    audience_filter text NOT NULL,
    message_title text NOT NULL,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    preview_only boolean DEFAULT false NOT NULL,
    audience_size integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    channels text[] DEFAULT ARRAY['bot_message'::text, 'sms'::text] NOT NULL,
    message_body text DEFAULT ''::text NOT NULL,
    delivery_jobs_total integer DEFAULT 0 NOT NULL,
    attach_menu_after_send boolean DEFAULT false NOT NULL,
    blocked_recipient_count integer DEFAULT 0 NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.broadcast_audit FORCE ROW LEVEL SECURITY;


--
-- Name: broadcast_audit_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_audit_recipients (
    audit_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.broadcast_audit_recipients FORCE ROW LEVEL SECURITY;


--
-- Name: broadcast_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doctor_user_id uuid NOT NULL,
    category text,
    audience text,
    channels jsonb DEFAULT '[]'::jsonb NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text,
    organization_id uuid
);

ALTER TABLE ONLY public.broadcast_drafts FORCE ROW LEVEL SECURITY;


--
-- Name: channel_link_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_link_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel_code text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_link_secrets_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])))
);

ALTER TABLE ONLY public.channel_link_secrets FORCE ROW LEVEL SECURITY;


--
-- Name: clinic_dedicated_bot_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_dedicated_bot_bindings (
    channel text NOT NULL,
    organization_id uuid NOT NULL,
    credential_fingerprint text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clinic_dedicated_bot_bindings_channel_check CHECK ((channel = ANY (ARRAY['telegram'::text, 'max'::text]))),
    CONSTRAINT clinic_dedicated_bot_bindings_credential_fingerprint_check CHECK ((credential_fingerprint ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY public.clinic_dedicated_bot_bindings FORCE ROW LEVEL SECURITY;


--
-- Name: clinic_public_directory_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_public_directory_entries (
    organization_id uuid NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clinic_public_directory_entries_slug_lower_check CHECK ((slug = lower(slug))),
    CONSTRAINT clinic_public_directory_entries_slug_not_blank_check CHECK ((length(btrim(slug)) > 0))
);

ALTER TABLE ONLY public.clinic_public_directory_entries FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_anamnesis_illness; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_anamnesis_illness (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    period text NOT NULL,
    what text NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.clinical_anamnesis_illness FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_anamnesis_lifestyle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_anamnesis_lifestyle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    record_date text NOT NULL,
    text text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.clinical_anamnesis_lifestyle FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_anamnesis_trauma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_anamnesis_trauma (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    year text NOT NULL,
    what text NOT NULL,
    type text NOT NULL,
    immobilization text DEFAULT '—'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.clinical_anamnesis_trauma FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_complaint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_complaint (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    text text NOT NULL,
    priority boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source_visit_id uuid NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    organization_id uuid,
    CONSTRAINT clinical_complaint_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text])))
);

ALTER TABLE ONLY public.clinical_complaint FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_complaint_update; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_complaint_update (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    note text,
    severity integer NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT clinical_complaint_update_severity_check CHECK (((severity >= 0) AND (severity <= 10)))
);

ALTER TABLE ONLY public.clinical_complaint_update FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_diagnosis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_diagnosis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    catalog_id uuid,
    text text NOT NULL,
    priority boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source_visit_id uuid NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_status text DEFAULT 'предварительный'::text NOT NULL,
    comment text,
    organization_id uuid,
    CONSTRAINT clinical_diagnosis_clinical_status_check CHECK ((clinical_status = ANY (ARRAY['предварительный'::text, 'подтверждённый'::text, 'закрытый'::text]))),
    CONSTRAINT clinical_diagnosis_status_check CHECK ((status = ANY (ARRAY['active'::text, 'refined'::text, 'resolved'::text])))
);

ALTER TABLE ONLY public.clinical_diagnosis FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_diagnosis_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_diagnosis_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.clinical_diagnosis_catalog FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_diagnosis_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_diagnosis_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    diagnosis_id uuid NOT NULL,
    old_status text,
    new_status text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    organization_id uuid,
    CONSTRAINT clinical_diagnosis_status_history_new_status_check CHECK ((new_status = ANY (ARRAY['предварительный'::text, 'подтверждённый'::text, 'закрытый'::text])))
);

ALTER TABLE ONLY public.clinical_diagnosis_status_history FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_diagnosis_update; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_diagnosis_update (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    diagnosis_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    refinement text,
    status text NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.clinical_diagnosis_update FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_test_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_test_regions (
    clinical_test_id uuid NOT NULL,
    body_region_id uuid NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.clinical_test_regions FORCE ROW LEVEL SECURITY;


--
-- Name: clinical_visit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_visit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    visit_type text NOT NULL,
    visited_at timestamp with time zone NOT NULL,
    location text,
    service text,
    duration text,
    exam text,
    manipulations text,
    trial_results text,
    recommendations text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    anamnesis_text text,
    organization_id uuid,
    canonical_appointment_id uuid,
    CONSTRAINT clinical_visit_visit_type_check CHECK ((visit_type = ANY (ARRAY['first'::text, 'repeat'::text])))
);

ALTER TABLE ONLY public.clinical_visit FORCE ROW LEVEL SECURITY;


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    comment_type text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT comments_comment_type_check CHECK ((comment_type = ANY (ARRAY['template'::text, 'individual_override'::text, 'clinical_note'::text]))),
    CONSTRAINT comments_target_type_check CHECK ((target_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text, 'stage_item_instance'::text, 'stage_instance'::text, 'program_instance'::text])))
);

ALTER TABLE ONLY public.comments FORCE ROW LEVEL SECURITY;


--
-- Name: content_access_grants_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_access_grants_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_grant_id text NOT NULL,
    platform_user_id uuid,
    integrator_user_id bigint NOT NULL,
    content_id text NOT NULL,
    purpose text NOT NULL,
    token_hash text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.content_access_grants_webapp FORCE ROW LEVEL SECURITY;


--
-- Name: content_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    video_url text,
    video_type text,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    requires_auth boolean DEFAULT false NOT NULL,
    linked_course_id uuid,
    organization_id uuid
);

ALTER TABLE ONLY public.content_pages FORCE ROW LEVEL SECURITY;


--
-- Name: content_section_slug_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_section_slug_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    old_slug text NOT NULL,
    new_slug text NOT NULL,
    changed_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT content_section_slug_history_slug_diff_chk CHECK ((old_slug <> new_slug))
);

ALTER TABLE ONLY public.content_section_slug_history FORCE ROW LEVEL SECURITY;


--
-- Name: content_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    requires_auth boolean DEFAULT false NOT NULL,
    cover_image_url text,
    icon_image_url text,
    kind text DEFAULT 'article'::text NOT NULL,
    system_parent_code text,
    organization_id uuid,
    CONSTRAINT content_sections_article_no_system_parent_check CHECK (((kind = 'system'::text) OR (system_parent_code IS NULL))),
    CONSTRAINT content_sections_kind_check CHECK ((kind = ANY (ARRAY['article'::text, 'system'::text]))),
    CONSTRAINT content_sections_system_parent_code_check CHECK (((system_parent_code IS NULL) OR (system_parent_code = ANY (ARRAY['situations'::text, 'sos'::text, 'warmups'::text, 'lessons'::text]))))
);

ALTER TABLE ONLY public.content_sections FORCE ROW LEVEL SECURITY;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    program_template_id uuid NOT NULL,
    intro_lesson_page_id uuid,
    access_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text NOT NULL,
    price_minor integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.courses FORCE ROW LEVEL SECURITY;


--
-- Name: doctor_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    author_id uuid NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.doctor_notes FORCE ROW LEVEL SECURITY;


--
-- Name: doctor_patient_support; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_patient_support (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    on_support boolean DEFAULT false NOT NULL,
    comments_enabled boolean,
    media_enabled boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    support_started_at timestamp with time zone,
    organization_id uuid
);

ALTER TABLE ONLY public.doctor_patient_support FORCE ROW LEVEL SECURITY;


--
-- Name: email_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at bigint NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purpose text,
    pending_delivery_code text,
    delivery_token uuid,
    delivery_claimed_at timestamp with time zone,
    CONSTRAINT email_challenges_pending_delivery_code_format CHECK (((pending_delivery_code IS NULL) OR (pending_delivery_code ~ '^[0-9]{6}$'::text))),
    CONSTRAINT email_challenges_purpose_known_check CHECK (((purpose IS NULL) OR (purpose = ANY (ARRAY['login'::text, 'public_registration'::text, 'clinic_invite'::text, 'specialist_signup'::text, 'password_reset'::text, 'password_setup'::text, 'password_register'::text, 'email_verify'::text, 'patient_email_change'::text]))))
);

ALTER TABLE ONLY public.email_challenges FORCE ROW LEVEL SECURITY;


--
-- Name: email_otp_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_otp_locks (
    user_id uuid NOT NULL,
    locked_until bigint DEFAULT 0 NOT NULL,
    lockout_cycle integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.email_otp_locks FORCE ROW LEVEL SECURITY;


--
-- Name: email_send_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_cooldowns (
    user_id uuid NOT NULL,
    email_normalized text NOT NULL,
    last_sent_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.email_send_cooldowns FORCE ROW LEVEL SECURITY;


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    key text NOT NULL,
    request_hash text NOT NULL,
    status smallint NOT NULL,
    response_body jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.idempotency_keys FORCE ROW LEVEL SECURITY;


--
-- Name: integration_webhook_error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_webhook_error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    error_class text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.integration_webhook_error_events FORCE ROW LEVEL SECURITY;


--
-- Name: integration_webhook_last_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_webhook_last_status (
    source text NOT NULL,
    received_at timestamp with time zone NOT NULL,
    processed_ok integer NOT NULL,
    error_class text,
    http_status_returned integer,
    detail text
);

ALTER TABLE ONLY public.integration_webhook_last_status FORCE ROW LEVEL SECURITY;


--
-- Name: integrator_push_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrator_push_outbox (
    id bigint NOT NULL,
    kind text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts_done integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 8 NOT NULL,
    next_try_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integrator_push_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text])))
);

ALTER TABLE ONLY public.integrator_push_outbox FORCE ROW LEVEL SECURITY;


--
-- Name: integrator_push_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integrator_push_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integrator_push_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integrator_push_outbox_id_seq OWNED BY public.integrator_push_outbox.id;


--
-- Name: lfk_complex_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complex_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complex_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reps integer,
    sets integer,
    side text,
    max_pain_0_10 integer,
    comment text,
    local_comment text,
    organization_id uuid,
    CONSTRAINT lfk_complex_exercises_max_pain_0_10_check CHECK (((max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10)))),
    CONSTRAINT lfk_complex_exercises_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text, 'damaged'::text, 'healthy'::text]))))
);

ALTER TABLE ONLY public.lfk_complex_exercises FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_complex_template_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complex_template_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reps integer,
    sets integer,
    side text,
    max_pain_0_10 integer,
    comment text,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    CONSTRAINT lfk_complex_template_exercises_max_pain_0_10_check CHECK (((max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10)))),
    CONSTRAINT lfk_complex_template_exercises_owner_check CHECK ((((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL)) OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL)))),
    CONSTRAINT lfk_complex_template_exercises_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text, 'damaged'::text, 'healthy'::text]))))
);

ALTER TABLE ONLY public.lfk_complex_template_exercises FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_complex_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complex_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    CONSTRAINT lfk_complex_templates_owner_check CHECK ((((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL)) OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL)))),
    CONSTRAINT lfk_complex_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.lfk_complex_templates FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_complexes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complexes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    origin text DEFAULT 'manual'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    symptom_tracking_id uuid,
    region_ref_id uuid,
    side text,
    diagnosis_text text,
    diagnosis_ref_id uuid,
    platform_user_id uuid NOT NULL,
    organization_id uuid,
    CONSTRAINT lfk_complexes_origin_check CHECK ((origin = ANY (ARRAY['manual'::text, 'assigned_by_specialist'::text]))),
    CONSTRAINT lfk_complexes_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))))
);

ALTER TABLE ONLY public.lfk_complexes FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_exercise_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_exercise_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exercise_id uuid NOT NULL,
    media_url text NOT NULL,
    media_type text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    CONSTRAINT lfk_exercise_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'gif'::text]))),
    CONSTRAINT lfk_exercise_media_owner_check CHECK ((((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL)) OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))))
);

ALTER TABLE ONLY public.lfk_exercise_media FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_exercise_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_exercise_regions (
    exercise_id uuid NOT NULL,
    region_ref_id uuid NOT NULL,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    CONSTRAINT lfk_exercise_regions_owner_check CHECK ((((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL)) OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))))
);

ALTER TABLE ONLY public.lfk_exercise_regions FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    region_ref_id uuid,
    load_type text,
    difficulty_1_10 integer,
    contraindications text,
    tags text[],
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    catalog_scope text DEFAULT 'catalog'::text NOT NULL,
    CONSTRAINT lfk_exercises_catalog_scope_check CHECK ((catalog_scope = ANY (ARRAY['catalog'::text, 'personal'::text]))),
    CONSTRAINT lfk_exercises_difficulty_1_10_check CHECK (((difficulty_1_10 IS NULL) OR ((difficulty_1_10 >= 1) AND (difficulty_1_10 <= 10)))),
    CONSTRAINT lfk_exercises_owner_check CHECK ((((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL)) OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))))
);

ALTER TABLE ONLY public.lfk_exercises FORCE ROW LEVEL SECURITY;


--
-- Name: lfk_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    complex_id uuid NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_minutes smallint,
    difficulty_0_10 smallint,
    pain_0_10 smallint,
    comment text,
    recorded_at timestamp with time zone,
    organization_id uuid,
    CONSTRAINT lfk_sessions_difficulty_0_10_check CHECK (((difficulty_0_10 IS NULL) OR ((difficulty_0_10 >= 0) AND (difficulty_0_10 <= 10)))),
    CONSTRAINT lfk_sessions_pain_0_10_check CHECK (((pain_0_10 IS NULL) OR ((pain_0_10 >= 0) AND (pain_0_10 <= 10)))),
    CONSTRAINT lfk_sessions_source_check CHECK ((source = ANY (ARRAY['bot'::text, 'webapp'::text])))
);

ALTER TABLE ONLY public.lfk_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: login_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_issued_at timestamp with time zone,
    CONSTRAINT login_tokens_method_check CHECK ((method = ANY (ARRAY['telegram'::text, 'max'::text]))),
    CONSTRAINT login_tokens_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.login_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: manual_patient_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_patient_commands (
    command_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    command_kind text NOT NULL,
    request_fingerprint text NOT NULL,
    platform_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manual_patient_commands_fingerprint_check CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT manual_patient_commands_kind_check CHECK ((command_kind = ANY (ARRAY['scheduled'::text, 'walk_in'::text, 'standalone_no_contact_card'::text])))
);

ALTER TABLE ONLY public.manual_patient_commands FORCE ROW LEVEL SECURITY;


--
-- Name: material_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    stars smallint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT material_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5))),
    CONSTRAINT material_ratings_target_kind_check CHECK ((target_kind = ANY (ARRAY['content_page'::text, 'lfk_exercise'::text, 'lfk_complex'::text])))
);

ALTER TABLE ONLY public.material_ratings FORCE ROW LEVEL SECURITY;


--
-- Name: media_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_name text NOT NULL,
    stored_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    s3_key text,
    status text DEFAULT 'ready'::text NOT NULL,
    delete_attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    display_name text,
    folder_id uuid,
    preview_status text DEFAULT 'pending'::text NOT NULL,
    preview_sm_key text,
    preview_md_key text,
    preview_attempts integer DEFAULT 0 NOT NULL,
    preview_next_attempt_at timestamp with time zone,
    source_width integer,
    source_height integer,
    video_processing_status text,
    video_processing_error text,
    hls_master_playlist_s3_key text,
    hls_artifact_prefix text,
    poster_s3_key text,
    video_duration_seconds integer,
    available_qualities_json jsonb,
    video_delivery_override text,
    usage_purpose text,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    CONSTRAINT media_files_owner_check CHECK ((((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL)) OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL)))),
    CONSTRAINT media_files_preview_status_check CHECK ((preview_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT media_files_size_bytes_check CHECK (((size_bytes >= 0) AND (size_bytes <= '3221225472'::bigint))),
    CONSTRAINT media_files_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'pending'::text, 'deleting'::text, 'pending_delete'::text]))),
    CONSTRAINT media_files_usage_purpose_check CHECK (((usage_purpose IS NULL) OR (usage_purpose = ANY (ARRAY['program_item_submission'::text])))),
    CONSTRAINT media_files_video_delivery_override_check CHECK (((video_delivery_override IS NULL) OR (video_delivery_override = ANY (ARRAY['mp4'::text, 'hls'::text, 'auto'::text])))),
    CONSTRAINT media_files_video_processing_status_check CHECK (((video_processing_status IS NULL) OR (video_processing_status = ANY (ARRAY['none'::text, 'pending'::text, 'processing'::text, 'ready'::text, 'failed'::text]))))
);

ALTER TABLE ONLY public.media_files FORCE ROW LEVEL SECURITY;


--
-- Name: media_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    name_normalized text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM name))) STORED,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'standard'::text NOT NULL,
    patient_user_id uuid,
    organization_id uuid,
    CONSTRAINT media_folders_check CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT media_folders_kind_check CHECK ((kind = ANY (ARRAY['standard'::text, 'client_files_root'::text, 'client_patient'::text]))),
    CONSTRAINT media_folders_name_check CHECK (((length(TRIM(BOTH FROM name)) > 0) AND (char_length(name) <= 180)))
);

ALTER TABLE ONLY public.media_folders FORCE ROW LEVEL SECURITY;


--
-- Name: media_hls_proxy_error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_hls_proxy_error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason_code text NOT NULL,
    http_status smallint,
    artifact_kind text NOT NULL,
    object_suffix text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT media_hls_proxy_error_events_artifact_check CHECK ((artifact_kind = ANY (ARRAY['master'::text, 'variant'::text, 'segment'::text]))),
    CONSTRAINT media_hls_proxy_error_events_reason_check CHECK ((reason_code = ANY (ARRAY['session_unauthorized'::text, 'feature_disabled'::text, 'media_not_readable'::text, 'forbidden_path'::text, 'missing_object'::text, 'upstream_403'::text, 's3_read_failed'::text, 'upstream_timeout'::text, 'range_not_satisfiable'::text, 'playlist_read_failed'::text, 'playlist_rewrite_failed'::text, 'internal_error'::text])))
);

ALTER TABLE ONLY public.media_hls_proxy_error_events FORCE ROW LEVEL SECURITY;


--
-- Name: media_playback_client_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_client_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_class text NOT NULL,
    delivery text,
    error_detail text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT media_playback_client_events_delivery_check CHECK (((delivery IS NULL) OR (delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))),
    CONSTRAINT media_playback_client_events_event_class_check CHECK ((event_class = ANY (ARRAY['hls_fatal'::text, 'video_error'::text, 'hls_import_failed'::text, 'playback_refetch_failed'::text, 'playback_refetch_exception'::text, 'hls_js_unsupported'::text])))
);

ALTER TABLE ONLY public.media_playback_client_events FORCE ROW LEVEL SECURITY;


--
-- Name: media_playback_resolution_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_resolution_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    media_id uuid NOT NULL,
    delivery text NOT NULL,
    fallback_used boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT media_playback_resolution_events_delivery_check CHECK ((delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))
);

ALTER TABLE ONLY public.media_playback_resolution_events FORCE ROW LEVEL SECURITY;


--
-- Name: media_playback_stats_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_stats_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    delivery text NOT NULL,
    resolved_count integer DEFAULT 0 NOT NULL,
    fallback_count integer DEFAULT 0 NOT NULL,
    organization_id uuid,
    CONSTRAINT media_playback_stats_hourly_delivery_check CHECK ((delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))
);

ALTER TABLE ONLY public.media_playback_stats_hourly FORCE ROW LEVEL SECURITY;


--
-- Name: media_playback_user_video_first_resolve; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_user_video_first_resolve (
    user_id uuid NOT NULL,
    media_id uuid NOT NULL,
    first_resolved_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.media_playback_user_video_first_resolve FORCE ROW LEVEL SECURITY;


--
-- Name: media_transcode_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_transcode_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    last_error text,
    next_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_started_at timestamp with time zone,
    finished_at timestamp with time zone,
    organization_id uuid,
    CONSTRAINT media_transcode_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.media_transcode_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: media_upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    s3_key text NOT NULL,
    upload_id text NOT NULL,
    owner_user_id uuid NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    expected_size_bytes bigint NOT NULL,
    mime_type text NOT NULL,
    part_size_bytes integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    aborted_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT media_upload_sessions_expected_size_bytes_check CHECK ((expected_size_bytes > 0)),
    CONSTRAINT media_upload_sessions_part_size_bytes_check CHECK (((part_size_bytes >= 1) AND (part_size_bytes <= 536870912))),
    CONSTRAINT media_upload_sessions_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text, 'completed'::text, 'aborted'::text, 'expired'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.media_upload_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: message_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    sender_id text NOT NULL,
    text text NOT NULL,
    category text NOT NULL,
    channel_bindings_used jsonb DEFAULT '{}'::jsonb NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text NOT NULL,
    error_message text,
    platform_user_id uuid,
    organization_id uuid,
    CONSTRAINT message_log_outcome_check CHECK ((outcome = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.message_log FORCE ROW LEVEL SECURITY;


--
-- Name: motivational_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motivational_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    body_text text NOT NULL,
    author text,
    is_active boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.motivational_quotes FORCE ROW LEVEL SECURITY;


--
-- Name: notification_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    integrator_user_id text,
    topic_code text,
    intent_type text,
    channel text NOT NULL,
    status text NOT NULL,
    reason text,
    provider_status_code integer,
    event_id text,
    occurrence_id uuid,
    endpoint_hash text,
    recipient_ref text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    organization_id uuid
);

ALTER TABLE ONLY public.notification_delivery_attempts FORCE ROW LEVEL SECURITY;


--
-- Name: online_intake_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    question_id text NOT NULL,
    ordinal integer NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.online_intake_answers FORCE ROW LEVEL SECURITY;


--
-- Name: online_intake_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    attachment_type text NOT NULL,
    s3_key text,
    url text,
    mime_type text,
    size_bytes bigint,
    original_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT online_intake_attachments_attachment_type_check CHECK ((attachment_type = ANY (ARRAY['file'::text, 'url'::text]))),
    CONSTRAINT online_intake_attachments_check CHECK ((((attachment_type = 'file'::text) AND (s3_key IS NOT NULL)) OR ((attachment_type = 'url'::text) AND (url IS NOT NULL))))
);

ALTER TABLE ONLY public.online_intake_attachments FORCE ROW LEVEL SECURITY;


--
-- Name: online_intake_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT online_intake_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_review'::text, 'contacted'::text, 'booked'::text, 'rejected'::text, 'closed'::text]))),
    CONSTRAINT online_intake_requests_type_check CHECK ((type = ANY (ARRAY['lfk'::text, 'nutrition'::text])))
);

ALTER TABLE ONLY public.online_intake_requests FORCE ROW LEVEL SECURITY;


--
-- Name: online_intake_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    note text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.online_intake_status_history FORCE ROW LEVEL SECURITY;


--
-- Name: operator_health_alert_sent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_health_alert_sent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedup_key text NOT NULL,
    severity text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.operator_health_alert_sent FORCE ROW LEVEL SECURITY;


--
-- Name: operator_health_failure_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_health_failure_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_by_user_id uuid,
    health_probe text NOT NULL,
    source_kind text NOT NULL,
    source_id text NOT NULL,
    severity_at_archive text DEFAULT 'dead'::text NOT NULL,
    doctor_user_id uuid,
    summary_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_error_truncated text,
    organization_id uuid
);

ALTER TABLE ONLY public.operator_health_failure_archive FORCE ROW LEVEL SECURITY;


--
-- Name: operator_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedup_key text NOT NULL,
    direction text NOT NULL,
    integration text NOT NULL,
    error_class text NOT NULL,
    error_detail text,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    resolved_at timestamp with time zone,
    alert_sent_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    initial_alert_sent_at timestamp with time zone,
    one_hour_alert_sent_at timestamp with time zone,
    alert_claim_phase text,
    alert_claim_token uuid,
    alert_claimed_at timestamp with time zone,
    CONSTRAINT operator_incidents_alert_claim_phase_check CHECK (((alert_claim_phase IS NULL) OR (alert_claim_phase = ANY (ARRAY['initial'::text, 'one_hour_repeat'::text]))))
);

ALTER TABLE ONLY public.operator_incidents FORCE ROW LEVEL SECURITY;


--
-- Name: operator_job_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_job_status (
    job_key text NOT NULL,
    job_family text NOT NULL,
    last_status text NOT NULL,
    last_started_at timestamp with time zone,
    last_finished_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_duration_ms integer,
    last_error text,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.operator_job_status FORCE ROW LEVEL SECURITY;


--
-- Name: org_brand_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_brand_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    display_name text,
    logo_media_id uuid,
    created_by_platform_user_id uuid NOT NULL,
    published_by_platform_user_id uuid,
    archived_by_platform_user_id uuid,
    published_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_brand_revisions_display_name_check CHECK (((display_name IS NULL) OR ((btrim(display_name) <> ''::text) AND (length(display_name) <= 120)))),
    CONSTRAINT org_brand_revisions_publication_state_check CHECK ((((status = 'draft'::text) AND (published_at IS NULL) AND (archived_at IS NULL) AND (published_by_platform_user_id IS NULL) AND (archived_by_platform_user_id IS NULL)) OR ((status = 'published'::text) AND (published_at IS NOT NULL) AND (archived_at IS NULL) AND (published_by_platform_user_id IS NOT NULL) AND (archived_by_platform_user_id IS NULL)) OR ((status = 'archived'::text) AND (archived_at IS NOT NULL) AND (archived_by_platform_user_id IS NOT NULL)))),
    CONSTRAINT org_brand_revisions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.org_brand_revisions FORCE ROW LEVEL SECURITY;


--
-- Name: org_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    portal_activated_at timestamp with time zone,
    portal_activated_via text,
    CONSTRAINT org_enrollments_portal_activation_check CHECK ((((portal_activated_at IS NULL) AND (portal_activated_via IS NULL)) OR ((portal_activated_at IS NOT NULL) AND (portal_activated_via = 'patient_invite_email_otp'::text)))),
    CONSTRAINT org_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'discharged'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.org_enrollments FORCE ROW LEVEL SECURITY;


--
-- Name: organization_member_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_member_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    invited_email text NOT NULL,
    invited_role text NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by_platform_user_id uuid NOT NULL,
    accepted_by_platform_user_id uuid,
    accepted_membership_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT organization_member_invites_role_check CHECK ((invited_role = ANY (ARRAY['admin'::text, 'doctor'::text]))),
    CONSTRAINT organization_member_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.organization_member_invites FORCE ROW LEVEL SECURITY;


--
-- Name: organization_slug_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_slug_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    kind text NOT NULL,
    organization_id uuid NOT NULL,
    created_by_platform_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_slug_claims_kind_check CHECK ((kind = ANY (ARRAY['reservation'::text, 'current'::text, 'alias'::text]))),
    CONSTRAINT organization_slug_claims_slug_format_check CHECK (((slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'::text) AND (slug !~~ '%--%'::text))),
    CONSTRAINT organization_slug_claims_slug_reserved_check CHECK ((slug <> ALL (ARRAY['account'::text, 'admin'::text, 'api'::text, 'app'::text, 'auth'::text, 'book'::text, 'booking'::text, 'doctor'::text, 'favicon'::text, 'health'::text, 'help'::text, 'join'::text, 'legal'::text, 'login'::text, 'manage'::text, 'manifest'::text, 'patient'::text, 'privacy'::text, 'register'::text, 'robots'::text, 'settings'::text, 'sign-in'::text, 'signup'::text, 'sitemap'::text, 'status'::text, 'support'::text, 'terms'::text, 'widget'::text, '_next'::text])))
);

ALTER TABLE ONLY public.organization_slug_claims FORCE ROW LEVEL SECURITY;


--
-- Name: organization_slug_rename_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_slug_rename_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_platform_user_id uuid,
    previous_slug text NOT NULL,
    next_slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_slug_rename_events_slug_change_check CHECK ((previous_slug <> next_slug)),
    CONSTRAINT organization_slug_rename_events_slugs_lower_check CHECK (((previous_slug = lower(previous_slug)) AND (next_slug = lower(next_slug))))
);

ALTER TABLE ONLY public.organization_slug_rename_events FORCE ROW LEVEL SECURITY;


--
-- Name: outgoing_delivery_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outgoing_delivery_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    kind text NOT NULL,
    channel text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 6 NOT NULL,
    next_retry_at timestamp with time zone NOT NULL,
    last_attempt_at timestamp with time zone,
    sent_at timestamp with time zone,
    dead_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_class text,
    reclaim_count integer DEFAULT 0 NOT NULL,
    organization_id uuid,
    priority smallint DEFAULT 0 NOT NULL,
    CONSTRAINT outgoing_delivery_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed_retryable'::text, 'dead'::text])))
);

ALTER TABLE ONLY public.outgoing_delivery_queue FORCE ROW LEVEL SECURITY;


--
-- Name: password_altcha_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_altcha_challenges (
    challenge_id uuid NOT NULL,
    identifier_key text NOT NULL,
    purpose text NOT NULL,
    challenge_digest text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT password_altcha_challenge_digest_check CHECK ((challenge_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT password_altcha_challenge_identifier_key_check CHECK ((identifier_key ~ '^password-email:v1:[0-9a-f]{64}$'::text)),
    CONSTRAINT password_altcha_challenge_purpose_check CHECK ((purpose = 'password_login'::text))
);

ALTER TABLE ONLY public.password_altcha_challenges FORCE ROW LEVEL SECURITY;


--
-- Name: password_login_identifier_protection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_login_identifier_protection (
    identifier_key text NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    next_allowed_at timestamp with time zone,
    locked_until timestamp with time zone,
    verification_lease_token uuid,
    verification_lease_until timestamp with time zone,
    leased_user_id uuid,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT password_login_identifier_failed_attempts_check CHECK ((failed_attempts >= 0)),
    CONSTRAINT password_login_identifier_key_check CHECK ((identifier_key ~ '^password-email:v1:[0-9a-f]{64}$'::text)),
    CONSTRAINT password_login_identifier_lease_shape_check CHECK ((((verification_lease_token IS NULL) AND (verification_lease_until IS NULL) AND (leased_user_id IS NULL)) OR ((verification_lease_token IS NOT NULL) AND (verification_lease_until IS NOT NULL))))
);

ALTER TABLE ONLY public.password_login_identifier_protection FORCE ROW LEVEL SECURITY;


--
-- Name: patient_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_bookings (
    id uuid NOT NULL,
    platform_user_id uuid,
    booking_type text NOT NULL,
    city text,
    category text NOT NULL,
    slot_start timestamp with time zone NOT NULL,
    slot_end timestamp with time zone NOT NULL,
    status text NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    gcal_event_id text,
    contact_phone text NOT NULL,
    contact_email text,
    contact_name text NOT NULL,
    reminder_24h_sent boolean DEFAULT false NOT NULL,
    reminder_2h_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    service_id uuid,
    branch_service_id uuid,
    city_code_snapshot text,
    branch_title_snapshot text,
    service_title_snapshot text,
    duration_minutes_snapshot integer,
    price_minor_snapshot integer,
    source text DEFAULT 'native'::text NOT NULL,
    compat_quality text,
    provenance_created_by text,
    provenance_updated_by text,
    canonical_appointment_id uuid,
    organization_id uuid,
    CONSTRAINT patient_bookings_booking_type_check CHECK ((booking_type = ANY (ARRAY['in_person'::text, 'online'::text]))),
    CONSTRAINT patient_bookings_category_check CHECK ((category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text]))),
    CONSTRAINT patient_bookings_check CHECK ((slot_end > slot_start)),
    CONSTRAINT patient_bookings_compat_quality_check CHECK ((compat_quality = ANY (ARRAY['full'::text, 'partial'::text, 'minimal'::text]))),
    CONSTRAINT patient_bookings_platform_user_native_required CHECK (((source <> 'native'::text) OR (platform_user_id IS NOT NULL))),
    CONSTRAINT patient_bookings_source_check CHECK ((source = ANY (ARRAY['native'::text, 'imported'::text]))),
    CONSTRAINT patient_bookings_status_check CHECK ((status = ANY (ARRAY['creating'::text, 'awaiting_payment'::text, 'confirmed'::text, 'cancelling'::text, 'cancel_failed'::text, 'cancelled'::text, 'rescheduled'::text, 'completed'::text, 'no_show'::text, 'failed_sync'::text])))
);

ALTER TABLE ONLY public.patient_bookings FORCE ROW LEVEL SECURITY;


--
-- Name: patient_comorbidity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_comorbidity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    text text NOT NULL,
    since text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone,
    organization_id uuid,
    CONSTRAINT patient_comorbidity_status_check CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text])))
);

ALTER TABLE ONLY public.patient_comorbidity FORCE ROW LEVEL SECURITY;


--
-- Name: patient_content_rating_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_content_rating_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    rating_value smallint NOT NULL,
    reason_codes jsonb NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT pcrf_rating_value_check CHECK (((rating_value >= 1) AND (rating_value <= 5)))
);

ALTER TABLE ONLY public.patient_content_rating_feedback FORCE ROW LEVEL SECURITY;


--
-- Name: patient_daily_warmup_presentations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_daily_warmup_presentations (
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_rotation_at timestamp with time zone,
    skip_next_scheduled_rotation boolean DEFAULT false NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.patient_daily_warmup_presentations FORCE ROW LEVEL SECURITY;


--
-- Name: patient_daily_warmup_video_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_daily_warmup_video_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.patient_daily_warmup_video_views FORCE ROW LEVEL SECURITY;


--
-- Name: patient_diary_day_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_diary_day_snapshots (
    platform_user_id uuid NOT NULL,
    local_date date NOT NULL,
    iana text NOT NULL,
    warmup_slot_limit integer NOT NULL,
    warmup_done_count integer NOT NULL,
    warmup_all_done boolean NOT NULL,
    plan_instance_id uuid,
    plan_item_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    plan_done_mask jsonb DEFAULT '[]'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.patient_diary_day_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: patient_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    category text NOT NULL,
    file_name text NOT NULL,
    s3_key text NOT NULL,
    s3_bucket text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    visit_id uuid,
    uploaded_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    media_file_id uuid,
    organization_id uuid,
    CONSTRAINT patient_files_category_check CHECK ((category = ANY (ARRAY['выписка'::text, 'снимок'::text, 'анализ'::text, 'фото_теста'::text, 'прочее'::text])))
);

ALTER TABLE ONLY public.patient_files FORCE ROW LEVEL SECURITY;


--
-- Name: patient_home_block_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_home_block_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_code text NOT NULL,
    target_type text NOT NULL,
    target_ref text NOT NULL,
    title_override text,
    subtitle_override text,
    image_url_override text,
    badge_label text,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    show_title boolean DEFAULT true NOT NULL,
    organization_id uuid,
    CONSTRAINT patient_home_block_items_target_type_check CHECK ((target_type = ANY (ARRAY['content_page'::text, 'content_section'::text, 'course'::text, 'static_action'::text])))
);

ALTER TABLE ONLY public.patient_home_block_items FORCE ROW LEVEL SECURITY;


--
-- Name: patient_home_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_home_blocks (
    code text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon_image_url text,
    organization_id uuid
);

ALTER TABLE ONLY public.patient_home_blocks FORCE ROW LEVEL SECURITY;


--
-- Name: patient_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by_platform_user_id uuid NOT NULL,
    invited_email_normalized text,
    delivery_channel_hint text,
    expires_at timestamp with time zone NOT NULL,
    accepted_by_platform_user_id uuid,
    accepted_via text,
    superseded_by_invite_id uuid,
    bearer_exchanged_at timestamp with time zone,
    continuation_hash text,
    continuation_expires_at timestamp with time zone,
    proof_email_normalized text,
    proof_code_hash text,
    proof_started_at timestamp with time zone,
    proof_expires_at timestamp with time zone,
    proof_attempts integer DEFAULT 0 NOT NULL,
    proof_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by_platform_user_id uuid,
    recipient_binding text DEFAULT 'bound_email'::text NOT NULL,
    CONSTRAINT patient_invites_accepted_subject_check CHECK (((accepted_by_platform_user_id IS NULL) OR (accepted_by_platform_user_id = patient_user_id))),
    CONSTRAINT patient_invites_accepted_via_check CHECK (((accepted_via IS NULL) OR (accepted_via = 'email_otp'::text))),
    CONSTRAINT patient_invites_proof_attempts_check CHECK (((proof_attempts >= 0) AND (proof_attempts <= 5))),
    CONSTRAINT patient_invites_recipient_binding_check CHECK ((((recipient_binding = 'bound_email'::text) AND (invited_email_normalized IS NOT NULL)) OR ((recipient_binding = 'unbound_email_claim'::text) AND (invited_email_normalized IS NULL)))),
    CONSTRAINT patient_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text, 'superseded'::text])))
);

ALTER TABLE ONLY public.patient_invites FORCE ROW LEVEL SECURITY;


--
-- Name: patient_lfk_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_lfk_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    template_id uuid NOT NULL,
    complex_id uuid,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.patient_lfk_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: patient_merge_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_merge_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    anchor_user_id uuid NOT NULL,
    candidate_user_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    trigger_appointment_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    CONSTRAINT patient_merge_candidates_distinct_users CHECK ((anchor_user_id <> candidate_user_id)),
    CONSTRAINT patient_merge_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])))
);

ALTER TABLE ONLY public.patient_merge_candidates FORCE ROW LEVEL SECURITY;


--
-- Name: patient_payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_payment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'paid'::text NOT NULL,
    comment text,
    service text,
    visit_id uuid,
    provider text,
    provider_payment_id text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT patient_payment_amount_minor_positive CHECK ((amount_minor > 0)),
    CONSTRAINT patient_payment_kind_check CHECK ((kind = ANY (ARRAY['cash'::text, 'acquiring'::text]))),
    CONSTRAINT patient_payment_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'pending'::text, 'refunded'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.patient_payment FORCE ROW LEVEL SECURITY;


--
-- Name: patient_practice_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_practice_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    feeling smallint,
    notes text DEFAULT ''::text NOT NULL,
    organization_id uuid,
    CONSTRAINT ppc_feeling_check CHECK (((feeling IS NULL) OR ((feeling >= 1) AND (feeling <= 5)))),
    CONSTRAINT ppc_source_check CHECK ((source = ANY (ARRAY['home'::text, 'reminder'::text, 'section_page'::text, 'daily_warmup'::text])))
);

ALTER TABLE ONLY public.patient_practice_completions FORCE ROW LEVEL SECURITY;


--
-- Name: patient_specialist_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_specialist_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_via text NOT NULL,
    source_link_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    ended_reason text,
    CONSTRAINT patient_specialist_links_created_via_check CHECK ((created_via = ANY (ARRAY['first_appointment'::text, 'manual_assign'::text, 'transfer'::text]))),
    CONSTRAINT patient_specialist_links_ended_reason_check CHECK (((ended_reason IS NULL) OR (ended_reason = ANY (ARRAY['transferred_out'::text, 'manual_remove'::text])))),
    CONSTRAINT patient_specialist_links_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);

ALTER TABLE ONLY public.patient_specialist_links FORCE ROW LEVEL SECURITY;


--
-- Name: phone_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_challenges (
    challenge_id text NOT NULL,
    phone text NOT NULL,
    expires_at bigint NOT NULL,
    code text,
    channel_context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verify_attempts smallint DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.phone_challenges FORCE ROW LEVEL SECURITY;


--
-- Name: phone_messenger_bind_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_messenger_bind_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    phone_normalized text NOT NULL,
    channel_code text NOT NULL,
    purpose text NOT NULL,
    user_id uuid,
    status text DEFAULT 'pending_contact'::text NOT NULL,
    challenge_id text,
    failure_code text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT phone_messenger_bind_secrets_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text]))),
    CONSTRAINT phone_messenger_bind_secrets_purpose_check CHECK ((purpose = ANY (ARRAY['login'::text, 'profile_bind'::text]))),
    CONSTRAINT phone_messenger_bind_secrets_status_check CHECK ((status = ANY (ARRAY['pending_contact'::text, 'otp_ready'::text, 'failed'::text, 'consumed'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.phone_messenger_bind_secrets FORCE ROW LEVEL SECURITY;


--
-- Name: phone_otp_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_otp_locks (
    phone_normalized text NOT NULL,
    locked_until bigint NOT NULL,
    lockout_cycle integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.phone_otp_locks FORCE ROW LEVEL SECURITY;


--
-- Name: platform_user_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_user_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_user_id uuid NOT NULL,
    contact_type text NOT NULL,
    value text NOT NULL,
    value_normalized text NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT platform_user_contacts_source_check CHECK ((source = ANY (ARRAY['merge'::text, 'booking'::text, 'doctor'::text, 'admin'::text]))),
    CONSTRAINT platform_user_contacts_type_check CHECK ((contact_type = ANY (ARRAY['phone'::text, 'email'::text, 'whatsapp'::text, 'telegram'::text, 'max'::text, 'vk'::text, 'other'::text])))
);

ALTER TABLE ONLY public.platform_user_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: platform_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_normalized text,
    display_name text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'client'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    integrator_user_id bigint,
    first_name text,
    last_name text,
    email text,
    email_verified_at timestamp with time zone,
    is_blocked boolean DEFAULT false NOT NULL,
    blocked_at timestamp with time zone,
    blocked_reason text,
    blocked_by uuid,
    is_archived boolean DEFAULT false NOT NULL,
    merged_into_id uuid,
    patient_phone_trust_at timestamp with time zone,
    calendar_timezone text,
    reminder_muted_until timestamp with time zone,
    merged_at timestamp with time zone,
    email_normalized text,
    birth_date date,
    gender text,
    patronymic text,
    height_cm integer,
    weight_kg integer,
    session_epoch integer DEFAULT 1 NOT NULL,
    CONSTRAINT platform_users_no_self_merge CHECK (((merged_into_id IS NULL) OR (merged_into_id <> id))),
    CONSTRAINT platform_users_role_check CHECK ((role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text]))),
    CONSTRAINT platform_users_session_epoch_check CHECK ((session_epoch >= 1))
);

ALTER TABLE ONLY public.platform_users FORCE ROW LEVEL SECURITY;


--
-- Name: product_analytics_events_recent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_analytics_events_recent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    entry_channel text NOT NULL,
    page_key text,
    user_id uuid,
    client_session_id text,
    push_tracking_id uuid,
    topic_code text,
    push_kind text,
    warmup_slogan_key text,
    metadata jsonb DEFAULT '{}'::jsonb,
    organization_id uuid
);

ALTER TABLE ONLY public.product_analytics_events_recent FORCE ROW LEVEL SECURITY;


--
-- Name: product_analytics_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_analytics_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    event_type text NOT NULL,
    entry_channel text NOT NULL,
    page_key text NOT NULL,
    topic_code text NOT NULL,
    push_kind text NOT NULL,
    warmup_slogan_key text NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.product_analytics_hourly FORCE ROW LEVEL SECURITY;


--
-- Name: product_analytics_user_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_analytics_user_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    user_id uuid NOT NULL,
    entry_channel text NOT NULL,
    page_key text NOT NULL,
    app_opens integer DEFAULT 0 NOT NULL,
    page_views integer DEFAULT 0 NOT NULL,
    push_opens integer DEFAULT 0 NOT NULL,
    active_minutes integer DEFAULT 0 NOT NULL,
    last_seen_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.product_analytics_user_hourly FORCE ROW LEVEL SECURITY;


--
-- Name: product_push_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_push_notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    topic_code text,
    intent_type text,
    occurrence_id uuid,
    push_kind text,
    warmup_slogan_key text,
    warmup_slogan_text text,
    open_url text,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.product_push_notifications FORCE ROW LEVEL SECURITY;


--
-- Name: program_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_action_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    session_id uuid,
    action_type text NOT NULL,
    payload jsonb,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT program_action_log_action_type_check CHECK ((action_type = ANY (ARRAY['done'::text, 'viewed'::text, 'note'::text])))
);

ALTER TABLE ONLY public.program_action_log FORCE ROW LEVEL SECURITY;


--
-- Name: program_item_discussion_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_item_discussion_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    sender_role text NOT NULL,
    origin text NOT NULL,
    body text,
    media_file_id uuid,
    support_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT program_item_discussion_messages_origin_check CHECK ((origin = ANY (ARRAY['patient_observation'::text, 'support_admin_reply'::text]))),
    CONSTRAINT program_item_discussion_messages_payload_check CHECK (((body IS NOT NULL) OR (media_file_id IS NOT NULL))),
    CONSTRAINT program_item_discussion_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['patient'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.program_item_discussion_messages FORCE ROW LEVEL SECURITY;


--
-- Name: program_item_discussion_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_item_discussion_reads (
    patient_user_id uuid NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.program_item_discussion_reads FORCE ROW LEVEL SECURITY;


--
-- Name: recommendation_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_regions (
    recommendation_id uuid NOT NULL,
    body_region_id uuid NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.recommendation_regions FORCE ROW LEVEL SECURITY;


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body_md text NOT NULL,
    media jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[],
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_region_id uuid,
    quantity_text text,
    frequency_text text,
    duration_text text,
    domain text,
    organization_id uuid
);

ALTER TABLE ONLY public.recommendations FORCE ROW LEVEL SECURITY;


--
-- Name: reference_catalog_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_catalog_baselines (
    version integer NOT NULL,
    definition_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reference_catalog_baselines_definition_object_check CHECK ((jsonb_typeof(definition_json) = 'object'::text))
);

ALTER TABLE ONLY public.reference_catalog_baselines FORCE ROW LEVEL SECURITY;


--
-- Name: reference_catalog_snapshot_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_catalog_snapshot_receipts (
    organization_id uuid NOT NULL,
    baseline_version integer NOT NULL,
    seeded_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reference_catalog_snapshot_receipts FORCE ROW LEVEL SECURITY;


--
-- Name: reference_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    is_user_extensible boolean DEFAULT false NOT NULL,
    owner_id uuid,
    tenant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);

ALTER TABLE ONLY public.reference_categories FORCE ROW LEVEL SECURITY;


--
-- Name: reference_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    organization_id uuid NOT NULL
);

ALTER TABLE ONLY public.reference_items FORCE ROW LEVEL SECURITY;


--
-- Name: reminder_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_delivery_log_id text NOT NULL,
    integrator_occurrence_id text NOT NULL,
    integrator_rule_id text NOT NULL,
    integrator_user_id bigint NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    error_code text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.reminder_delivery_events FORCE ROW LEVEL SECURITY;


--
-- Name: reminder_journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_journal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    occurrence_id text,
    action text NOT NULL,
    snooze_until timestamp with time zone,
    skip_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT reminder_journal_action_check CHECK ((action = ANY (ARRAY['done'::text, 'skipped'::text, 'snoozed'::text]))),
    CONSTRAINT reminder_journal_check CHECK ((((action = 'snoozed'::text) AND (snooze_until IS NOT NULL)) OR ((action <> 'snoozed'::text) AND (snooze_until IS NULL)))),
    CONSTRAINT reminder_journal_skip_reason_check CHECK (((skip_reason IS NULL) OR (length(skip_reason) <= 500)))
);

ALTER TABLE ONLY public.reminder_journal FORCE ROW LEVEL SECURITY;


--
-- Name: reminder_occurrence_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_occurrence_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_occurrence_id text NOT NULL,
    integrator_rule_id text NOT NULL,
    integrator_user_id bigint,
    category text NOT NULL,
    status text NOT NULL,
    delivery_channel text,
    error_code text,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone,
    snoozed_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    skipped_at timestamp with time zone,
    skip_reason text,
    organization_id uuid,
    platform_user_id uuid,
    CONSTRAINT chk_reminder_occurrence_skip_reason_len CHECK (((skip_reason IS NULL) OR (length(skip_reason) <= 500))),
    CONSTRAINT chk_reminder_occurrence_snooze_pair CHECK ((((snoozed_at IS NULL) AND (snoozed_until IS NULL)) OR ((snoozed_at IS NOT NULL) AND (snoozed_until IS NOT NULL)))),
    CONSTRAINT reminder_occurrence_history_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.reminder_occurrence_history FORCE ROW LEVEL SECURITY;


--
-- Name: reminder_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_rule_id text NOT NULL,
    platform_user_id uuid,
    integrator_user_id bigint,
    category text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    schedule_type text DEFAULT 'interval_window'::text NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL,
    interval_minutes integer NOT NULL,
    window_start_minute integer NOT NULL,
    window_end_minute integer NOT NULL,
    days_mask text DEFAULT '1111111'::text NOT NULL,
    content_mode text DEFAULT 'none'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_object_type text,
    linked_object_id text,
    custom_title text,
    custom_text text,
    schedule_data jsonb,
    reminder_intent text DEFAULT 'generic'::text,
    display_title text,
    display_description text,
    quiet_hours_start_minute integer,
    quiet_hours_end_minute integer,
    notification_topic_code text,
    organization_id uuid,
    CONSTRAINT chk_reminder_rules_custom_only_for_custom_type CHECK (((linked_object_type = 'custom'::text) OR ((custom_title IS NULL) AND (custom_text IS NULL)))),
    CONSTRAINT chk_reminder_rules_custom_required CHECK (((linked_object_type IS DISTINCT FROM 'custom'::text) OR ((custom_title IS NOT NULL) AND (btrim(custom_title) <> ''::text)))),
    CONSTRAINT chk_reminder_rules_display_rehab_only CHECK (((linked_object_type = 'rehab_program'::text) OR ((display_title IS NULL) AND (display_description IS NULL)))),
    CONSTRAINT chk_reminder_rules_linked_object_type CHECK (((linked_object_type IS NULL) OR (linked_object_type = ANY (ARRAY['lfk_complex'::text, 'content_section'::text, 'content_page'::text, 'custom'::text, 'rehab_program'::text])))),
    CONSTRAINT chk_reminder_rules_object_id_required CHECK (((linked_object_type IS NULL) OR (linked_object_type = 'custom'::text) OR ((linked_object_id IS NOT NULL) AND (btrim(linked_object_id) <> ''::text))))
);

ALTER TABLE ONLY public.reminder_rules FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_billing_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    billing_email text,
    legal_name text,
    tax_identifier text,
    registration_reason_code text,
    billing_address jsonb DEFAULT '{}'::jsonb NOT NULL,
    billing_requisites jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.saas_billing_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    saas_billing_account_id uuid NOT NULL,
    saas_billing_subscription_id uuid NOT NULL,
    tariff_id uuid NOT NULL,
    tariff_name text NOT NULL,
    amount_minor integer NOT NULL,
    currency text NOT NULL,
    tariff_billing_period text NOT NULL,
    service_period_starts_at timestamp with time zone NOT NULL,
    service_period_ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    provider_id text NOT NULL,
    provider_invoice_ref text,
    provider_checkout_url text,
    provider_idempotency_key text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    expires_at timestamp with time zone,
    tariff_snapshot jsonb,
    invoice_kind text NOT NULL,
    additional_seat_quantity integer DEFAULT 0 NOT NULL,
    CONSTRAINT saas_billing_invoices_additional_seat_quantity_check CHECK (((additional_seat_quantity >= 0) AND ((invoice_kind <> 'seat_overage'::text) OR (additional_seat_quantity > 0)))),
    CONSTRAINT saas_billing_invoices_amount_check CHECK ((amount_minor >= 0)),
    CONSTRAINT saas_billing_invoices_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT saas_billing_invoices_kind_check CHECK ((invoice_kind = ANY (ARRAY['tariff_period'::text, 'seat_overage'::text]))),
    CONSTRAINT saas_billing_invoices_period_check CHECK ((service_period_starts_at < service_period_ends_at)),
    CONSTRAINT saas_billing_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'paid'::text, 'failed'::text, 'void'::text])))
);

ALTER TABLE ONLY public.saas_billing_invoices FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_billing_periods (
    code text NOT NULL,
    label text NOT NULL,
    months integer NOT NULL,
    is_selectable boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saas_billing_periods_months_check CHECK ((months > 0))
);

ALTER TABLE ONLY public.saas_billing_periods FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_provider_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_billing_provider_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    saas_billing_invoice_id uuid,
    provider_id text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    raw_payload jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saas_billing_provider_events_payload_check CHECK (((jsonb_typeof(raw_payload) = 'object'::text) AND ((raw_payload - ARRAY['providerId'::text, 'providerEventId'::text, 'type'::text, 'status'::text, 'amountMinor'::text, 'currency'::text, 'invoiceReference'::text, 'subscriptionReference'::text, 'occurredAt'::text]) = '{}'::jsonb)))
);

ALTER TABLE ONLY public.saas_billing_provider_events FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_billing_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    saas_billing_invoice_id uuid NOT NULL,
    amount_minor integer NOT NULL,
    currency text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_id text NOT NULL,
    provider_refund_ref text,
    provider_idempotency_key text NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saas_billing_refunds_amount_check CHECK ((amount_minor > 0)),
    CONSTRAINT saas_billing_refunds_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT saas_billing_refunds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);

ALTER TABLE ONLY public.saas_billing_refunds FORCE ROW LEVEL SECURITY;


--
-- Name: saas_billing_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_billing_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    saas_billing_account_id uuid NOT NULL,
    tariff_id uuid NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    lifecycle_state text NOT NULL,
    provider_id text,
    saved_payment_method_id text,
    current_period_starts_at timestamp with time zone,
    current_period_ends_at timestamp with time zone,
    grace_ends_at timestamp with time zone,
    read_only_ends_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    autopay_consented_at timestamp with time zone,
    autopay_consent_text text,
    autopay_revoked_at timestamp with time zone,
    tariff_snapshot jsonb,
    pending_tariff_id uuid,
    paid_additional_seats integer DEFAULT 0 NOT NULL,
    CONSTRAINT saas_billing_subscriptions_autopay_consent_check CHECK (((autopay_consented_at IS NULL) = (autopay_consent_text IS NULL))),
    CONSTRAINT saas_billing_subscriptions_lifecycle_check CHECK ((lifecycle_state = ANY (ARRAY['active'::text, 'grace'::text, 'read_only'::text, 'blocked'::text]))),
    CONSTRAINT saas_billing_subscriptions_lifecycle_dates_check CHECK ((((grace_ends_at IS NULL) OR (current_period_ends_at IS NULL) OR (grace_ends_at >= current_period_ends_at)) AND ((read_only_ends_at IS NULL) OR (grace_ends_at IS NULL) OR (read_only_ends_at >= grace_ends_at)))),
    CONSTRAINT saas_billing_subscriptions_paid_additional_seats_check CHECK ((paid_additional_seats >= 0)),
    CONSTRAINT saas_billing_subscriptions_period_check CHECK ((((current_period_starts_at IS NULL) AND (current_period_ends_at IS NULL)) OR ((current_period_starts_at IS NOT NULL) AND (current_period_ends_at IS NOT NULL) AND (current_period_starts_at < current_period_ends_at)))),
    CONSTRAINT saas_billing_subscriptions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'paid_subscription'::text]))),
    CONSTRAINT saas_billing_subscriptions_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.saas_billing_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: saas_isolation_coverage_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_isolation_coverage_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone NOT NULL,
    services_checked text[] DEFAULT '{}'::text[] NOT NULL,
    checks_count integer DEFAULT 0 NOT NULL,
    unexpected_errors_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saas_isolation_coverage_runs_checks_count_check CHECK ((checks_count >= 0)),
    CONSTRAINT saas_isolation_coverage_runs_complete_check CHECK (((status <> 'complete'::text) OR ((services_checked @> ARRAY['webapp'::text, 'integrator'::text, 'worker'::text, 'scheduler'::text, 'media_worker'::text, 'cron'::text]) AND (checks_count >= 6)))),
    CONSTRAINT saas_isolation_coverage_runs_services_check CHECK ((services_checked <@ ARRAY['webapp'::text, 'integrator'::text, 'worker'::text, 'scheduler'::text, 'media_worker'::text, 'cron'::text])),
    CONSTRAINT saas_isolation_coverage_runs_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'incomplete'::text, 'failed'::text]))),
    CONSTRAINT saas_isolation_coverage_runs_time_check CHECK ((finished_at >= started_at)),
    CONSTRAINT saas_isolation_coverage_runs_unexpected_count_check CHECK ((unexpected_errors_count >= 0))
);

ALTER TABLE ONLY public.saas_isolation_coverage_runs FORCE ROW LEVEL SECURITY;


--
-- Name: saas_isolation_event_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_isolation_event_hourly (
    event_id uuid NOT NULL,
    bucket_start timestamp with time zone NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    CONSTRAINT saas_isolation_event_hourly_bucket_check CHECK ((bucket_start = (date_trunc('hour'::text, (bucket_start AT TIME ZONE 'UTC'::text)) AT TIME ZONE 'UTC'::text))),
    CONSTRAINT saas_isolation_event_hourly_count_check CHECK ((occurrence_count > 0))
);

ALTER TABLE ONLY public.saas_isolation_event_hourly FORCE ROW LEVEL SECURITY;


--
-- Name: saas_isolation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_isolation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fingerprint text NOT NULL,
    event_class text NOT NULL,
    source_service text NOT NULL,
    source_operation text NOT NULL,
    explanation_status text DEFAULT 'unexplained'::text NOT NULL,
    lifecycle_status text DEFAULT 'active'::text NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT saas_isolation_events_event_class_check CHECK ((event_class = ANY (ARRAY['missing_principal'::text, 'invalid_signature_or_install'::text, 'role_pool_mismatch'::text, 'rls_denial'::text, 'cleanup_failure'::text, 'unclassified_background_operation'::text]))),
    CONSTRAINT saas_isolation_events_explanation_status_check CHECK ((explanation_status = ANY (ARRAY['explained'::text, 'unexplained'::text]))),
    CONSTRAINT saas_isolation_events_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['active'::text, 'resolved'::text]))),
    CONSTRAINT saas_isolation_events_occurrence_count_check CHECK ((occurrence_count > 0)),
    CONSTRAINT saas_isolation_events_source_operation_check CHECK ((((((((((((((((((((((((((((source_service = 'webapp'::text) AND (source_operation = 'webapp_db_request'::text)) OR ((source_service = 'webapp'::text) AND (source_operation = 'webapp_admin_system_health'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'public_auth_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'auth_role_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_runtime_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'public_booking_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_identity_exception_check'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_booking_history'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_product_analytics'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_ui_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_calendar_timezone'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_content_catalog'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_diary'::text))) OR ((source_service = 'integrator'::text) AND (source_operation = 'integrator_http_request'::text))) OR ((source_service = 'integrator'::text) AND (source_operation = 'integrator_projection'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_queue_drain'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_projection_delivery'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_outgoing_delivery'::text))) OR ((source_service = 'scheduler'::text) AND (source_operation = 'scheduler_lock'::text))) OR ((source_service = 'scheduler'::text) AND (source_operation = 'scheduler_dispatch_tick'::text))) OR ((source_service = 'media_worker'::text) AND (source_operation = 'media_transcode_tick'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_health'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_media'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_analytics'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_reminders'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_specialist_tasks'::text)))),
    CONSTRAINT saas_isolation_events_source_service_check CHECK ((source_service = ANY (ARRAY['webapp'::text, 'integrator'::text, 'worker'::text, 'scheduler'::text, 'media_worker'::text, 'cron'::text])))
);

ALTER TABLE ONLY public.saas_isolation_events FORCE ROW LEVEL SECURITY;


--
-- Name: saas_org_entitlement_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_org_entitlement_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    mechanic text NOT NULL,
    enabled boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seat_limit_override integer,
    quota jsonb,
    expires_at timestamp with time zone,
    CONSTRAINT saas_org_entitlement_overrides_seat_limit_nonnegative_check CHECK (((seat_limit_override IS NULL) OR (seat_limit_override >= 0)))
);

ALTER TABLE ONLY public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;


--
-- Name: saas_organization_trials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_organization_trials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tariff_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    post_trial_behavior text NOT NULL,
    post_trial_tariff_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_ends_at timestamp with time zone NOT NULL,
    CONSTRAINT saas_organization_trials_dates_check CHECK (((started_at < ends_at) AND (ends_at <= discount_ends_at))),
    CONSTRAINT saas_organization_trials_post_behavior_check CHECK ((post_trial_behavior = ANY (ARRAY['read_only'::text, 'blocked'::text, 'tariff'::text]))),
    CONSTRAINT saas_organization_trials_post_tariff_check CHECK ((((post_trial_behavior = 'tariff'::text) AND (post_trial_tariff_id IS NOT NULL)) OR ((post_trial_behavior <> 'tariff'::text) AND (post_trial_tariff_id IS NULL)))),
    CONSTRAINT saas_organization_trials_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);

ALTER TABLE ONLY public.saas_organization_trials FORCE ROW LEVEL SECURITY;


--
-- Name: saas_paid_period_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_paid_period_policy (
    key text DEFAULT 'global'::text NOT NULL,
    post_paid_period_behavior text NOT NULL,
    post_paid_period_tariff_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saas_paid_period_policy_key_check CHECK ((key = 'global'::text)),
    CONSTRAINT saas_paid_period_policy_post_behavior_check CHECK ((post_paid_period_behavior = ANY (ARRAY['read_only'::text, 'blocked'::text, 'tariff'::text]))),
    CONSTRAINT saas_paid_period_policy_post_tariff_check CHECK ((((post_paid_period_behavior = 'tariff'::text) AND (post_paid_period_tariff_id IS NOT NULL)) OR ((post_paid_period_behavior <> 'tariff'::text) AND (post_paid_period_tariff_id IS NULL))))
);

ALTER TABLE ONLY public.saas_paid_period_policy FORCE ROW LEVEL SECURITY;


--
-- Name: saas_registration_tariff_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_registration_tariff_policy (
    key text DEFAULT 'global'::text NOT NULL,
    tariff_id uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saas_registration_tariff_policy_key_check CHECK ((key = 'global'::text))
);

ALTER TABLE ONLY public.saas_registration_tariff_policy FORCE ROW LEVEL SECURITY;


--
-- Name: saas_trial_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saas_trial_policy (
    key text DEFAULT 'global'::text NOT NULL,
    duration_days integer NOT NULL,
    start_event text NOT NULL,
    post_trial_behavior text NOT NULL,
    post_trial_tariff_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_window_days integer DEFAULT 0 NOT NULL,
    CONSTRAINT saas_trial_policy_discount_window_check CHECK ((discount_window_days >= 0)),
    CONSTRAINT saas_trial_policy_duration_check CHECK ((duration_days > 0)),
    CONSTRAINT saas_trial_policy_key_check CHECK ((key = 'global'::text)),
    CONSTRAINT saas_trial_policy_post_behavior_check CHECK ((post_trial_behavior = ANY (ARRAY['read_only'::text, 'blocked'::text, 'tariff'::text]))),
    CONSTRAINT saas_trial_policy_post_tariff_check CHECK ((((post_trial_behavior = 'tariff'::text) AND (post_trial_tariff_id IS NOT NULL)) OR ((post_trial_behavior <> 'tariff'::text) AND (post_trial_tariff_id IS NULL)))),
    CONSTRAINT saas_trial_policy_start_event_check CHECK ((length(btrim(start_event)) > 0))
);

ALTER TABLE ONLY public.saas_trial_policy FORCE ROW LEVEL SECURITY;


--
-- Name: specialist_signup_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specialist_signup_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    challenge_id uuid NOT NULL,
    email_normalized text NOT NULL,
    organization_title text NOT NULL,
    specialist_full_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provisioned_organization_id uuid,
    provisioned_specialist_id uuid,
    provisioned_membership_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provisioned_at timestamp with time zone,
    organization_slug text,
    CONSTRAINT specialist_signup_intents_organization_slug_lower_check CHECK (((organization_slug IS NULL) OR (organization_slug = lower(organization_slug)))),
    CONSTRAINT specialist_signup_intents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'provisioned'::text])))
);

ALTER TABLE ONLY public.specialist_signup_intents FORCE ROW LEVEL SECURITY;


--
-- Name: specialist_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specialist_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    patient_user_id uuid,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    remind_at timestamp with time zone,
    is_important boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.specialist_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: staff_security_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_security_profiles (
    user_id uuid NOT NULL,
    factor_type text,
    totp_secret_ciphertext text,
    pending_totp_secret_ciphertext text,
    factor_verified_at timestamp with time zone,
    recovery_code_hashes jsonb DEFAULT '[]'::jsonb NOT NULL,
    recovery_codes_confirmed_at timestamp with time zone,
    replacement_required boolean DEFAULT false NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    session_version integer DEFAULT 0 NOT NULL,
    login_challenge_hash text,
    login_challenge_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_security_profiles_factor_type_check CHECK (((factor_type IS NULL) OR (factor_type = 'totp'::text))),
    CONSTRAINT staff_security_profiles_failed_attempts_check CHECK ((failed_attempts >= 0)),
    CONSTRAINT staff_security_profiles_session_version_check CHECK ((session_version >= 0))
);

ALTER TABLE ONLY public.staff_security_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: support_conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_message_id text NOT NULL,
    conversation_id uuid NOT NULL,
    sender_role text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    text text NOT NULL,
    source text NOT NULL,
    external_chat_id text,
    external_message_id text,
    delivery_status text,
    created_at timestamp with time zone NOT NULL,
    media_url text,
    media_type text,
    read_at timestamp with time zone,
    delivered_at timestamp with time zone,
    organization_id uuid
);

ALTER TABLE ONLY public.support_conversation_messages FORCE ROW LEVEL SECURITY;


--
-- Name: support_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_conversation_id text NOT NULL,
    platform_user_id uuid,
    integrator_user_id bigint,
    source text NOT NULL,
    admin_scope text NOT NULL,
    status text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    last_message_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    channel_code text,
    channel_external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    pending_message_drafts jsonb DEFAULT '[]'::jsonb NOT NULL
);

ALTER TABLE ONLY public.support_conversations FORCE ROW LEVEL SECURITY;


--
-- Name: support_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_message_id uuid,
    integrator_intent_event_id text,
    correlation_id text,
    channel_code text NOT NULL,
    status text NOT NULL,
    attempt integer NOT NULL,
    reason text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.support_delivery_events FORCE ROW LEVEL SECURITY;


--
-- Name: support_question_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_question_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_question_message_id text NOT NULL,
    question_id uuid NOT NULL,
    sender_role text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.support_question_messages FORCE ROW LEVEL SECURITY;


--
-- Name: support_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_question_id text NOT NULL,
    conversation_id uuid,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);

ALTER TABLE ONLY public.support_questions FORCE ROW LEVEL SECURITY;


--
-- Name: symptom_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symptom_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    tracking_id uuid NOT NULL,
    value_0_10 smallint NOT NULL,
    entry_type text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    platform_user_id uuid NOT NULL,
    patient_practice_completion_id uuid,
    organization_id uuid,
    CONSTRAINT symptom_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['instant'::text, 'daily'::text]))),
    CONSTRAINT symptom_entries_source_check CHECK ((source = ANY (ARRAY['bot'::text, 'webapp'::text, 'import'::text]))),
    CONSTRAINT symptom_entries_value_0_10_check CHECK (((value_0_10 >= 0) AND (value_0_10 <= 10)))
);

ALTER TABLE ONLY public.symptom_entries FORCE ROW LEVEL SECURITY;


--
-- Name: symptom_trackings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symptom_trackings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    symptom_key text,
    symptom_title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    symptom_type_ref_id uuid,
    region_ref_id uuid,
    side text,
    diagnosis_text text,
    diagnosis_ref_id uuid,
    stage_ref_id uuid,
    deleted_at timestamp with time zone,
    platform_user_id uuid NOT NULL,
    organization_id uuid,
    CONSTRAINT symptom_trackings_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))))
);

ALTER TABLE ONLY public.symptom_trackings FORCE ROW LEVEL SECURITY;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    organization_id uuid,
    CONSTRAINT system_settings_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.system_settings FORCE ROW LEVEL SECURITY;


--
-- Name: system_settings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    scope text NOT NULL,
    old_value_json jsonb,
    new_value_json jsonb NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    organization_id uuid
);

ALTER TABLE ONLY public.system_settings_audit FORCE ROW LEVEL SECURITY;


--
-- Name: test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    organization_id uuid
);

ALTER TABLE ONLY public.test_attempts FORCE ROW LEVEL SECURITY;


--
-- Name: test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    test_id uuid NOT NULL,
    raw_value jsonb NOT NULL,
    normalized_decision text NOT NULL,
    decided_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT test_results_normalized_decision_check CHECK ((normalized_decision = ANY (ARRAY['passed'::text, 'failed'::text, 'partial'::text])))
);

ALTER TABLE ONLY public.test_results FORCE ROW LEVEL SECURITY;


--
-- Name: test_set_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_set_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_set_id uuid NOT NULL,
    test_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    comment text,
    organization_id uuid
);

ALTER TABLE ONLY public.test_set_items FORCE ROW LEVEL SECURITY;


--
-- Name: test_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    publication_status text DEFAULT 'draft'::text NOT NULL,
    organization_id uuid,
    CONSTRAINT test_sets_publication_status_check CHECK ((publication_status = ANY (ARRAY['draft'::text, 'published'::text])))
);

ALTER TABLE ONLY public.test_sets FORCE ROW LEVEL SECURITY;


--
-- Name: tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    test_type text,
    media jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[],
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scoring jsonb,
    raw_text text,
    assessment_kind text,
    body_region_id uuid,
    organization_id uuid
);

ALTER TABLE ONLY public.tests FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT treatment_program_events_event_type_check CHECK ((event_type = ANY (ARRAY['item_added'::text, 'item_removed'::text, 'item_disabled'::text, 'item_enabled'::text, 'item_replaced'::text, 'comment_changed'::text, 'stage_added'::text, 'stage_removed'::text, 'stage_skipped'::text, 'stage_completed'::text, 'status_changed'::text, 'test_completed'::text, 'program_changed'::text]))),
    CONSTRAINT treatment_program_events_target_type_check CHECK ((target_type = ANY (ARRAY['stage'::text, 'stage_item'::text, 'program'::text])))
);

ALTER TABLE ONLY public.treatment_program_events FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_instance_stage_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instance_stage_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    source_group_id uuid,
    title text NOT NULL,
    description text,
    schedule_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    system_kind text,
    organization_id uuid,
    CONSTRAINT treatment_program_instance_stage_groups_system_kind_check CHECK (((system_kind IS NULL) OR (system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text]))))
);

ALTER TABLE ONLY public.treatment_program_instance_stage_groups FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_instance_stage_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instance_stage_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    item_type text NOT NULL,
    item_ref_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    comment text,
    local_comment text,
    settings jsonb,
    snapshot jsonb NOT NULL,
    completed_at timestamp with time zone,
    is_actionable boolean,
    status text DEFAULT 'active'::text NOT NULL,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_viewed_at timestamp with time zone,
    organization_id uuid,
    CONSTRAINT treatment_program_instance_stage_items_item_type_check CHECK ((item_type = ANY (ARRAY['exercise'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text]))),
    CONSTRAINT treatment_program_instance_stage_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

ALTER TABLE ONLY public.treatment_program_instance_stage_items FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_instance_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instance_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    source_stage_id uuid,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    local_comment text,
    status text NOT NULL,
    skip_reason text,
    goals text,
    objectives text,
    expected_duration_days integer,
    expected_duration_text text,
    started_at timestamp with time zone,
    organization_id uuid,
    CONSTRAINT treatment_program_instance_stages_status_check CHECK ((status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])))
);

ALTER TABLE ONLY public.treatment_program_instance_stages FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    patient_user_id uuid NOT NULL,
    assigned_by uuid,
    title text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_plan_last_opened_at timestamp with time zone,
    assignment_source text NOT NULL,
    organization_id uuid,
    CONSTRAINT treatment_program_instances_assignment_source_check CHECK ((assignment_source = ANY (ARRAY['doctor'::text, 'promo'::text, 'course'::text]))),
    CONSTRAINT treatment_program_instances_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])))
);

ALTER TABLE ONLY public.treatment_program_instances FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_template_stage_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_template_stage_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    schedule_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    system_kind text,
    organization_id uuid,
    CONSTRAINT treatment_program_template_stage_groups_system_kind_check CHECK (((system_kind IS NULL) OR (system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text]))))
);

ALTER TABLE ONLY public.treatment_program_template_stage_groups FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_template_stage_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_template_stage_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    item_type text NOT NULL,
    item_ref_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    comment text,
    settings jsonb,
    group_id uuid,
    organization_id uuid,
    CONSTRAINT treatment_program_template_stage_items_item_type_check CHECK ((item_type = ANY (ARRAY['exercise'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text])))
);

ALTER TABLE ONLY public.treatment_program_template_stage_items FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_template_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_template_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    goals text,
    objectives text,
    expected_duration_days integer,
    expected_duration_text text,
    organization_id uuid
);

ALTER TABLE ONLY public.treatment_program_template_stages FORCE ROW LEVEL SECURITY;


--
-- Name: treatment_program_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    CONSTRAINT treatment_program_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.treatment_program_templates FORCE ROW LEVEL SECURITY;


--
-- Name: user_channel_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_channel_bindings (
    user_id uuid NOT NULL,
    channel_code text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_blocked_at timestamp with time zone,
    bot_blocked_reason text,
    display_handle text,
    CONSTRAINT user_channel_bindings_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text]))),
    CONSTRAINT user_channel_bindings_display_handle_check CHECK (((display_handle IS NULL) OR ((display_handle = btrim(display_handle)) AND (display_handle <> ''::text) AND (length(display_handle) <= 32) AND (display_handle !~ '^@'::text))))
);

ALTER TABLE ONLY public.user_channel_bindings FORCE ROW LEVEL SECURITY;


--
-- Name: user_channel_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_channel_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    channel_code text NOT NULL,
    is_enabled_for_messages boolean DEFAULT true NOT NULL,
    is_enabled_for_notifications boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_preferred_for_auth boolean DEFAULT false NOT NULL,
    platform_user_id uuid NOT NULL,
    CONSTRAINT user_channel_preferences_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'sms'::text, 'email'::text, 'web_push'::text])))
);

ALTER TABLE ONLY public.user_channel_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: user_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_user_id uuid NOT NULL,
    contact_kind text NOT NULL,
    value_normalized text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone,
    source_origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_contacts_kind_check CHECK ((contact_kind = ANY (ARRAY['phone'::text, 'email'::text]))),
    CONSTRAINT user_contacts_source_origin_check CHECK ((source_origin = ANY (ARRAY['platform_users'::text, 'oauth_binding'::text, 'phone_history'::text])))
);

ALTER TABLE ONLY public.user_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: user_identity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_identity (
    platform_user_id uuid NOT NULL,
    first_name text,
    last_name text,
    patronymic text,
    display_name text DEFAULT ''::text NOT NULL,
    birth_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_identity FORCE ROW LEVEL SECURITY;


--
-- Name: user_notification_topic_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_topic_channels (
    user_id uuid NOT NULL,
    topic_code text NOT NULL,
    channel_code text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_notification_topic_channels_channel_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'email'::text, 'web_push'::text])))
);

ALTER TABLE ONLY public.user_notification_topic_channels FORCE ROW LEVEL SECURITY;


--
-- Name: user_notification_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_topics (
    user_id uuid NOT NULL,
    topic_code text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_notification_topics FORCE ROW LEVEL SECURITY;


--
-- Name: user_oauth_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_oauth_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_user_id text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_oauth_bindings_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text, 'yandex'::text])))
);

ALTER TABLE ONLY public.user_oauth_bindings FORCE ROW LEVEL SECURITY;


--
-- Name: user_passkey_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_passkey_accounts (
    user_id uuid NOT NULL,
    user_handle text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT user_passkey_accounts_handle_check CHECK ((user_handle ~ '^[A-Za-z0-9_-]{43}$'::text))
);

ALTER TABLE ONLY public.user_passkey_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: user_passkey_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_passkey_challenges (
    id uuid NOT NULL,
    purpose text NOT NULL,
    user_id uuid,
    challenge text NOT NULL,
    expected_origin text NOT NULL,
    rp_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT user_passkey_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['registration'::text, 'authentication'::text]))),
    CONSTRAINT user_passkey_challenges_user_shape_check CHECK ((((purpose = 'registration'::text) AND (user_id IS NOT NULL)) OR ((purpose = 'authentication'::text) AND (user_id IS NULL)))),
    CONSTRAINT user_passkey_challenges_value_check CHECK ((challenge ~ '^[A-Za-z0-9_-]{32,1024}$'::text))
);

ALTER TABLE ONLY public.user_passkey_challenges FORCE ROW LEVEL SECURITY;


--
-- Name: user_passkey_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_passkey_credentials (
    credential_id text NOT NULL,
    user_id uuid NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    device_type text NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    last_used_at timestamp with time zone,
    CONSTRAINT user_passkey_credentials_counter_check CHECK ((counter >= 0)),
    CONSTRAINT user_passkey_credentials_device_type_check CHECK ((device_type = ANY (ARRAY['singleDevice'::text, 'multiDevice'::text]))),
    CONSTRAINT user_passkey_credentials_id_check CHECK ((credential_id ~ '^[A-Za-z0-9_-]{16,1024}$'::text)),
    CONSTRAINT user_passkey_credentials_public_key_check CHECK ((public_key ~ '^[A-Za-z0-9_-]{16,8192}$'::text)),
    CONSTRAINT user_passkey_credentials_transports_check CHECK ((jsonb_typeof(transports) = 'array'::text))
);

ALTER TABLE ONLY public.user_passkey_credentials FORCE ROW LEVEL SECURITY;


--
-- Name: user_password_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_password_credentials (
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    algo text DEFAULT 'argon2id'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    next_allowed_at timestamp with time zone,
    verification_lease_token uuid,
    verification_lease_until timestamp with time zone,
    CONSTRAINT user_password_credentials_failed_attempts_check CHECK ((failed_attempts >= 0))
);

ALTER TABLE ONLY public.user_password_credentials FORCE ROW LEVEL SECURITY;


--
-- Name: user_phone_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_phone_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_user_id uuid NOT NULL,
    phone_normalized text NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    source text NOT NULL,
    organization_id uuid,
    confirming_channel text,
    CONSTRAINT user_phone_history_confirming_channel_check CHECK (((confirming_channel IS NULL) OR (confirming_channel = ANY (ARRAY['telegram'::text, 'max'::text, 'email'::text, 'sms'::text])))),
    CONSTRAINT user_phone_history_source_check CHECK ((source = ANY (ARRAY['otp'::text, 'messenger'::text, 'merge'::text, 'admin'::text, 'projection'::text, 'oauth'::text])))
);

ALTER TABLE ONLY public.user_phone_history FORCE ROW LEVEL SECURITY;


--
-- Name: user_web_push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_web_push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_web_push_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: webapp_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webapp_schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.webapp_schema_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: delivery_attempt_logs id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.delivery_attempt_logs ALTER COLUMN id SET DEFAULT nextval('integrator.delivery_attempt_logs_id_seq'::regclass);


--
-- Name: integration_data_quality_incidents id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents ALTER COLUMN id SET DEFAULT nextval('integrator.integration_data_quality_incidents_id_seq'::regclass);


--
-- Name: projection_outbox id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.projection_outbox ALTER COLUMN id SET DEFAULT nextval('integrator.projection_outbox_id_seq'::regclass);


--
-- Name: be_patient_packages display_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages ALTER COLUMN display_number SET DEFAULT nextval('public.be_patient_packages_display_number_seq'::regclass);


--
-- Name: booking_calendar_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_calendar_map ALTER COLUMN id SET DEFAULT nextval('public.booking_calendar_map_id_seq'::regclass);


--
-- Name: integrator_push_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox ALTER COLUMN id SET DEFAULT nextval('public.integrator_push_outbox_id_seq'::regclass);


--
-- PostgreSQL database dump complete
--

\unrestrict nWtjyBeP1kaN7rDBMHL6kRFv5HeZBf2ix1LExAsn9NhYTKcFdAMQbKcXvISeUTn
