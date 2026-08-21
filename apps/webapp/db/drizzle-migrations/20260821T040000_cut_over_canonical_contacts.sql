-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 0 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_users' AND column_name IN ('phone_normalized', 'email', 'email_normalized', 'email_verified_at', 'patient_phone_trust_at')
--
-- D15b/6: user_contacts is the sole physical phone/e-mail authority.  Function bodies below are
-- copied from the current schema-B roots and converted in this forward migration; privileges stay
-- declaration-owned and are reconciled outside the migration.

DO $d15b6_parity$
DECLARE
  v_mismatches bigint;
BEGIN
  SELECT count(*) INTO v_mismatches
  FROM public.platform_users AS person
  LEFT JOIN LATERAL (
    SELECT contact.value_normalized, contact.confirmed_at
    FROM public.user_contacts AS contact
    WHERE contact.platform_user_id = person.id
      AND contact.contact_kind = 'phone'
      AND contact.is_primary = true
    LIMIT 2
  ) AS phone ON true
  LEFT JOIN LATERAL (
    SELECT contact.value_normalized, contact.confirmed_at
    FROM public.user_contacts AS contact
    WHERE contact.platform_user_id = person.id
      AND contact.contact_kind = 'email'
      AND contact.is_primary = true
    LIMIT 2
  ) AS email ON true
  WHERE person.phone_normalized IS DISTINCT FROM phone.value_normalized
     OR person.patient_phone_trust_at IS DISTINCT FROM phone.confirmed_at
     OR person.email_normalized IS DISTINCT FROM email.value_normalized
     OR person.email_verified_at IS DISTINCT FROM email.confirmed_at
     OR (
       person.email IS NOT NULL
       AND lower(btrim(person.email)) IS DISTINCT FROM person.email_normalized
     );

  IF v_mismatches <> 0 THEN
    RAISE EXCEPTION 'D15b/6 canonical contact parity failed: % platform users differ', v_mismatches;
  END IF;

  SELECT count(*) INTO v_mismatches
  FROM (
    SELECT contact.platform_user_id, contact.contact_kind
    FROM public.user_contacts AS contact
    WHERE contact.is_primary = true
    GROUP BY contact.platform_user_id, contact.contact_kind
    HAVING count(*) <> 1
  ) AS duplicate_primary;

  IF v_mismatches <> 0 THEN
    RAISE EXCEPTION 'D15b/6 deterministic primary contact check failed: % duplicate roots', v_mismatches;
  END IF;
END
$d15b6_parity$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
UPDATE public.user_contacts
SET source_origin = CASE WHEN source_origin = 'oauth_binding' THEN 'oauth' ELSE 'direct' END,
    updated_at = now()
WHERE source_origin NOT IN ('direct', 'oauth');
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.user_contacts DROP CONSTRAINT user_contacts_source_origin_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.user_contacts ADD CONSTRAINT user_contacts_source_origin_check
CHECK (source_origin = ANY (ARRAY['direct'::text, 'oauth'::text]));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX uq_user_contacts_primary_phone
ON public.user_contacts (platform_user_id)
WHERE contact_kind = 'phone' AND is_primary = true;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX uq_user_contacts_primary_email
ON public.user_contacts (platform_user_id)
WHERE contact_kind = 'email' AND is_primary = true;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_invite_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.accept_org_invite(p_token_hash text, p_platform_user_id uuid, p_expected_email text)
CREATE OR REPLACE FUNCTION app.accept_org_invite(p_token_hash text, p_platform_user_id uuid, p_expected_email text)
 RETURNS TABLE(ok boolean, code text, organization_id uuid, membership_id uuid, platform_user_id uuid, specialist_id uuid, role text)
 LANGUAGE plpgsql
 PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
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

  SELECT u.id, u.display_name, email_contact.value_normalized AS email_normalized
  INTO v_user
  FROM public.platform_users AS u
  LEFT JOIN public.user_contacts AS email_contact
    ON email_contact.platform_user_id = u.id
   AND email_contact.contact_kind = 'email'
   AND email_contact.is_primary = true
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
      updated_at = now()
  WHERE u.id = v_user.id;

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary,
    confirmed_at, source_origin, updated_at
  ) VALUES (
    v_user.id, 'email', v_invite.invited_email, true,
    now(), 'direct', now()
  )
  ON CONFLICT (platform_user_id, contact_kind, value_normalized)
    WHERE contact_kind = 'email'
  DO UPDATE SET
    is_primary = true,
    confirmed_at = COALESCE(user_contacts.confirmed_at, EXCLUDED.confirmed_at),
    updated_at = now();

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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.archive_operator_health_failures(p_probe text, p_limit integer, p_archived_by_user_id uuid)
CREATE OR REPLACE FUNCTION app.archive_operator_health_failures(p_probe text, p_limit integer, p_archived_by_user_id uuid)
 RETURNS TABLE(inserted_count bigint, deleted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_telemetry_operator_owner'::name, 'app_platform_admin'::name, 'platform'::app.port_context_class, 'platform.health-archive.clear', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg]), 'app.archive_operator_health_failures(text,integer,uuid)'::regprocedure);

  IF p_probe IS NULL
    OR p_probe NOT IN (
      'outgoing_delivery',
      'integrator_push_outbox',
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
        recipient_phone.value_normalized AS recipient_phone_normalized
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
      LEFT JOIN public.user_contacts AS recipient_phone
        ON recipient_phone.platform_user_id = recipient.id
       AND recipient_phone.contact_kind = 'phone'
       AND recipient_phone.is_primary = true
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

  RETURN;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.claim_unbound_patient_invite_email(p_continuation_hash text, p_email_normalized text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)
CREATE OR REPLACE FUNCTION app.claim_unbound_patient_invite_email(p_continuation_hash text, p_email_normalized text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)
 RETURNS TABLE(ok boolean, code text, organization_id uuid, patient_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_email_owner_id uuid;
  v_patient_email text;
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
  SELECT contact.value_normalized INTO v_patient_email
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_patient.id
    AND contact.contact_kind = 'email'
    AND contact.is_primary = true
  LIMIT 1;
  IF v_patient_email IS NOT NULL AND v_patient_email <> v_email THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT contact.platform_user_id INTO v_email_owner_id
  FROM public.user_contacts AS contact
  JOIN public.platform_users AS patient ON patient.id = contact.platform_user_id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = v_email
    AND patient.merged_into_id IS NULL
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
    INSERT INTO public.user_contacts (
      platform_user_id, contact_kind, value_normalized, is_primary,
      confirmed_at, source_origin, updated_at
    ) VALUES (
      v_invite.patient_user_id, 'email', v_email, true,
      now(), 'direct', now()
    )
    ON CONFLICT (platform_user_id, contact_kind, value_normalized)
      WHERE contact_kind = 'email'
    DO UPDATE SET
      is_primary = true,
      confirmed_at = COALESCE(user_contacts.confirmed_at, EXCLUDED.confirmed_at),
      updated_at = now();
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT contact.platform_user_id INTO v_email_owner_id
    FROM public.user_contacts AS contact
    JOIN public.platform_users AS patient ON patient.id = contact.platform_user_id
    WHERE contact.contact_kind = 'email'
      AND contact.value_normalized = v_email
      AND patient.merged_into_id IS NULL
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.email_auth_verify_user_email(p_user_id uuid, p_email text)
CREATE OR REPLACE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, value_normalized, is_primary,
  confirmed_at, source_origin, updated_at
) VALUES (
  p_user_id, 'email', lower(btrim(p_email)), true, now(), 'direct', now()
)
ON CONFLICT (platform_user_id, contact_kind, value_normalized)
  WHERE contact_kind = 'email'
DO UPDATE SET
  is_primary = true,
  confirmed_at = now(),
  updated_at = now()
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.email_otp_public_consume_latest_challenge(p_email_normalized text, p_code_hash text)
CREATE OR REPLACE FUNCTION app.email_otp_public_consume_latest_challenge(p_email_normalized text, p_code_hash text)
 RETURNS TABLE(ok boolean, code text, user_id uuid, retry_after_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  SELECT contact.platform_user_id
  INTO v_conflict_user_id
  FROM public.user_contacts AS contact
  JOIN public.platform_users AS conflict ON conflict.id = contact.platform_user_id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = v_email_normalized
    AND conflict.merged_into_id IS NULL
    AND conflict.id <> v_target_user.id
  ORDER BY conflict.id
  LIMIT 1;
  IF FOUND THEN
    DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary,
    confirmed_at, source_origin, updated_at
  ) VALUES (
    v_target_user.id, 'email', v_email_normalized, true,
    clock_timestamp(), 'direct', clock_timestamp()
  )
  ON CONFLICT (platform_user_id, contact_kind, value_normalized)
    WHERE contact_kind = 'email'
  DO UPDATE SET
    is_primary = true,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = EXCLUDED.updated_at;
  DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
  RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.email_otp_public_delete_unverified_registration(p_user_id uuid)
CREATE OR REPLACE FUNCTION app.email_otp_public_delete_unverified_registration(p_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
DELETE FROM public.platform_users
  WHERE id = p_user_id AND role = 'client' AND merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_contacts AS contact
      WHERE contact.platform_user_id = p_user_id
        AND contact.contact_kind = 'email'
        AND contact.confirmed_at IS NOT NULL
    )
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.email_otp_public_find_or_create_user(p_email_norm text)
CREATE OR REPLACE FUNCTION app.email_otp_public_find_or_create_user(p_email_norm text)
 RETURNS TABLE(user_id uuid, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  JOIN public.user_contacts AS contact ON contact.platform_user_id = platform_user.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  SELECT platform_user.id
  INTO v_merged_id
  FROM public.platform_users AS platform_user
  JOIN public.user_contacts AS contact ON contact.platform_user_id = platform_user.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_norm
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

  INSERT INTO public.platform_users (display_name, role)
  VALUES (v_display_name, 'client')
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.user_contacts (
        platform_user_id, contact_kind, value_normalized, is_primary,
        confirmed_at, source_origin, updated_at
      ) VALUES (
        v_inserted_id, 'email', p_email_norm, true, NULL, 'direct', now()
      );
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM public.platform_users WHERE id = v_inserted_id;
      v_inserted_id := NULL;
    END;
  END IF;

  IF v_inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_inserted_id, true;
    RETURN;
  END IF;

  SELECT platform_user.id
  INTO v_existing_id
  FROM public.platform_users AS platform_user
  JOIN public.user_contacts AS contact ON contact.platform_user_id = platform_user.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'email_otp_public_find_or_create_user_failed';
  END IF;
  RETURN QUERY SELECT v_existing_id, false;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.email_otp_public_find_user_by_email(p_email_norm text)
CREATE OR REPLACE FUNCTION app.email_otp_public_find_user_by_email(p_email_norm text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.user.find', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_otp_public_find_user_by_email(text)'::regprocedure);

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT platform_user.id, platform_user.merged_into_id, 0 AS depth,
           ARRAY[platform_user.id] AS path
    FROM public.platform_users AS platform_user
    JOIN public.user_contacts AS contact ON contact.platform_user_id = platform_user.id
    WHERE contact.contact_kind = 'email'
      AND contact.value_normalized = lower(btrim(p_email_norm))
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.email_otp_public_register_patient(p_email_norm text, p_last_name text, p_first_name text, p_patronymic text)
CREATE OR REPLACE FUNCTION app.email_otp_public_register_patient(p_email_norm text, p_last_name text, p_first_name text, p_patronymic text)
 RETURNS TABLE(ok boolean, code text, user_id uuid, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_email_norm text;
  v_last_name text;
  v_first_name text;
  v_patronymic text;
  v_existing public.platform_users%ROWTYPE;
  v_existing_email_confirmed_at timestamptz;
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
  JOIN public.user_contacts AS contact ON contact.platform_user_id = platform_user.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = v_email_norm
    AND platform_user.merged_into_id IS NULL
  LIMIT 1;
  IF FOUND THEN
    SELECT contact.confirmed_at INTO v_existing_email_confirmed_at
    FROM public.user_contacts AS contact
    WHERE contact.platform_user_id = v_existing.id
      AND contact.contact_kind = 'email'
      AND contact.value_normalized = v_email_norm;
    IF v_existing_email_confirmed_at IS NULL
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
    display_name, last_name, first_name, patronymic, role
  ) VALUES (
    concat_ws(' ', v_last_name, v_first_name, v_patronymic),
    v_last_name, v_first_name, v_patronymic, 'client'
  )
  RETURNING id INTO v_user_id;

  BEGIN
    INSERT INTO public.user_contacts (
      platform_user_id, contact_kind, value_normalized, is_primary,
      confirmed_at, source_origin, updated_at
    ) VALUES (v_user_id, 'email', v_email_norm, true, NULL, 'direct', now());
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.platform_users WHERE id = v_user_id;
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_user_id, true;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.email_password_delete_unverified_registration(p_user_id uuid)
CREATE OR REPLACE FUNCTION app.email_password_delete_unverified_registration(p_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);
DELETE FROM public.platform_users
  WHERE id = p_user_id
    AND role IN ('client', 'doctor')
    AND merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_contacts AS contact
      WHERE contact.platform_user_id = p_user_id
        AND contact.contact_kind = 'email'
        AND contact.confirmed_at IS NOT NULL
    )
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.email_password_find_login_candidate(p_email_norm text)
CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)
 RETURNS TABLE(user_id uuid, password_hash text, email_verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);
SELECT upc.user_id, upc.password_hash,
         (matched_email.confirmed_at IS NOT NULL OR fpu.matched_primary = false) AS email_verified
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  INNER JOIN app.find_platform_user_ids_by_any_confirmed_email(p_email_norm) AS fpu ON fpu.user_id = upc.user_id
  LEFT JOIN public.user_contacts AS matched_email
    ON matched_email.platform_user_id = pu.id
   AND matched_email.contact_kind = 'email'
   AND matched_email.value_normalized = lower(btrim(p_email_norm))
  WHERE pu.merged_into_id IS NULL
  LIMIT 1
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.email_password_find_reset_candidate(p_email_norm text)
CREATE OR REPLACE FUNCTION app.email_password_find_reset_candidate(p_email_norm text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.reset-candidate', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_password_find_reset_candidate(text)'::regprocedure);

  SELECT credentials.user_id
  INTO v_user_id
  FROM public.user_password_credentials AS credentials
  INNER JOIN public.platform_users AS users ON users.id = credentials.user_id
  INNER JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE users.merged_into_id IS NULL
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = lower(btrim(p_email_norm))
    AND contact.confirmed_at IS NOT NULL
  LIMIT 1;
  RETURN v_user_id;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.email_password_register_pending(p_email_norm text, p_password_hash text, p_last_name text, p_first_name text, p_patronymic text, p_role text)
CREATE OR REPLACE FUNCTION app.email_password_register_pending(p_email_norm text, p_password_hash text, p_last_name text, p_first_name text, p_patronymic text, p_role text)
 RETURNS TABLE(ok boolean, code text, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    role
  )
  VALUES (v_display_name, v_last_name, v_first_name, v_patronymic, p_role)
  RETURNING id INTO v_user_id;

  BEGIN
    INSERT INTO public.user_contacts (
      platform_user_id, contact_kind, value_normalized, is_primary,
      confirmed_at, source_origin, updated_at
    ) VALUES (v_user_id, 'email', v_email_norm, true, NULL, 'direct', now());
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.platform_users WHERE id = v_user_id;
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.user_password_credentials (user_id, password_hash, updated_at)
  VALUES (v_user_id, p_password_hash, now());

  RETURN QUERY SELECT true, NULL::text, v_user_id;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.integrator_bind_bootstrap_channel_phone(p_channel_code text, p_external_id text, p_phone_normalized text, p_preferred_platform_user_id uuid)
CREATE OR REPLACE FUNCTION app.integrator_bind_bootstrap_channel_phone(p_channel_code text, p_external_id text, p_phone_normalized text, p_preferred_platform_user_id uuid)
 RETURNS TABLE(platform_user_id uuid, applied boolean, failure_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
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
  SELECT contact.value_normalized INTO v_target_phone
    FROM public.platform_users AS person
    LEFT JOIN public.user_contacts AS contact
      ON contact.platform_user_id = person.id
     AND contact.contact_kind = 'phone'
     AND contact.is_primary = true
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
     SET updated_at = now()
   WHERE id = v_target_user_id
     AND merged_into_id IS NULL;

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized,
    is_primary, confirmed_at, source_origin, updated_at
  ) VALUES (
    v_target_user_id, 'phone', p_phone_normalized,
    true, now(), 'direct', now()
  )
  ON CONFLICT (value_normalized) WHERE contact_kind = 'phone'
  DO UPDATE SET
    is_primary = true,
    confirmed_at = EXCLUDED.confirmed_at,
    source_origin = EXCLUDED.source_origin,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT v_target_user_id, true, NULL::text;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_exclusion_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.is_current_patient_test_account()
CREATE OR REPLACE FUNCTION app.is_current_patient_test_account()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
        EXISTS (
          SELECT 1 FROM public.user_contacts AS contact
          WHERE contact.platform_user_id = platform_user.id
            AND contact.contact_kind = 'phone'
          AND jsonb_typeof(v_identifiers -> 'phones') = 'array'
          AND (v_identifiers -> 'phones') ? contact.value_normalized
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_exclusion_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.is_platform_registration_analytics_user_excluded(p_user_id uuid)
CREATE OR REPLACE FUNCTION app.is_platform_registration_analytics_user_excluded(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_telemetry_exclusion_owner'::name, ARRAY['app_platform_settings'::name]::name[]);
SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.platform_users AS platform_user
      WHERE platform_user.id = p_user_id
        AND (
          platform_user.role::text IN ('admin', 'doctor')
          OR EXISTS (
            SELECT 1 FROM public.user_contacts AS contact
            WHERE contact.platform_user_id = platform_user.id
              AND contact.contact_kind = 'phone'
              AND contact.value_normalized = '+70000000000'
          )
          OR EXISTS (
            SELECT 1
            FROM public.system_settings AS setting
            JOIN public.user_contacts AS contact
              ON contact.platform_user_id = platform_user.id
             AND contact.contact_kind = 'phone'
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
              AND configured_phone.value = contact.value_normalized
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.password_credentials_replace_self(p_email_normalized text, p_password_hash text)
CREATE OR REPLACE FUNCTION app.password_credentials_replace_self(p_email_normalized text, p_password_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT 'password-email:v1:' || encode(app_ext.digest(contact.value_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE users.id = v_user_id
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.password_credentials_upsert_self(p_email_normalized text, p_password_hash text)
CREATE OR REPLACE FUNCTION app.password_credentials_upsert_self(p_email_normalized text, p_password_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT 'password-email:v1:' || encode(app_ext.digest(contact.value_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE users.id = v_user_id
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.password_login_acquire_impl(p_email_normalized text, p_identifier_key text, p_altcha_challenge_id uuid, p_altcha_challenge_digest text)
CREATE OR REPLACE FUNCTION app.password_login_acquire_impl(p_email_normalized text, p_identifier_key text, p_altcha_challenge_id uuid DEFAULT NULL::uuid, p_altcha_challenge_digest text DEFAULT NULL::text)
 RETURNS TABLE(status text, lease_token uuid, password_hash text, user_id uuid, email_verified boolean, retry_after_seconds integer, captcha_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  SELECT credentials.user_id, contact.confirmed_at IS NOT NULL
  INTO v_user_id, v_email_verified
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.password_login_complete_impl(p_lease_token uuid, p_password_verified boolean)
CREATE OR REPLACE FUNCTION app.password_login_complete_impl(p_lease_token uuid, p_password_verified boolean)
 RETURNS TABLE(accepted boolean, succeeded boolean, user_id uuid, email_verified boolean, attempts integer, retry_after_seconds integer, captcha_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

    SELECT EXISTS (
      SELECT 1 FROM public.user_contacts AS contact
      WHERE contact.platform_user_id = users.id
        AND contact.contact_kind = 'email'
        AND contact.confirmed_at IS NOT NULL
    )
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.password_login_issue_altcha_challenge_impl(p_email_normalized text, p_challenge_id uuid, p_challenge_digest text, p_expires_at timestamp with time zone)
CREATE OR REPLACE FUNCTION app.password_login_issue_altcha_challenge_impl(p_email_normalized text, p_challenge_id uuid, p_challenge_digest text, p_expires_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.patient_disable_reminder_messenger_topic(p_integrator_occurrence_id text, p_messenger_channel text)
CREATE OR REPLACE FUNCTION app.patient_disable_reminder_messenger_topic(p_integrator_occurrence_id text, p_messenger_channel text)
 RETURNS TABLE(persisted boolean, paragraphs jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
       SELECT 1 FROM public.user_contacts AS contact
       WHERE contact.platform_user_id = v_platform_user_id
         AND contact.contact_kind = 'email'
         AND NULLIF(btrim(contact.value_normalized), '') IS NOT NULL
         AND contact.confirmed_at IS NOT NULL
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.patient_reminder_materialization_fingerprint(p_occurrence_id text, p_channel text)
CREATE OR REPLACE FUNCTION app.patient_reminder_materialization_fingerprint(p_occurrence_id text, p_channel text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  FROM integrator.user_reminder_occurrences AS occurrence
  INNER JOIN public.reminder_rules AS rule
    ON rule.integrator_rule_id = occurrence.rule_id
   AND rule.organization_id = occurrence.organization_id
   AND rule.platform_user_id = occurrence.platform_user_id
  INNER JOIN public.platform_users AS patient ON patient.id = occurrence.platform_user_id
  LEFT JOIN public.user_contacts AS patient_email
    ON patient_email.platform_user_id = patient.id
   AND patient_email.contact_kind = 'email'
   AND patient_email.is_primary = true
  INNER JOIN public.outgoing_delivery_queue AS delivery
    ON delivery.event_id = concat(
      'rem:', occurrence.id, ':g', occurrence.delivery_generation::text, ':', p_channel
    )
   AND delivery.kind = 'reminder_dispatch'
   AND delivery.organization_id = occurrence.organization_id
  WHERE occurrence.id = p_occurrence_id
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.phone_messenger_bind_completion_state(p_token_hash text, p_channel_code text, p_external_id text, p_contact_phone text)
CREATE OR REPLACE FUNCTION app.phone_messenger_bind_completion_state(p_token_hash text, p_channel_code text, p_external_id text, p_contact_phone text)
 RETURNS TABLE(ready boolean, account_created boolean, sync_target_user_id uuid, canonical_user_id uuid)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
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
    SELECT person.merged_into_id, contact.value_normalized, person.created_at
      INTO v_next_id, v_binding_phone, v_binding_created_at
      FROM public.platform_users AS person
      LEFT JOIN public.user_contacts AS contact
        ON contact.platform_user_id = person.id
       AND contact.contact_kind = 'phone'
       AND contact.is_primary = true
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.provision_specialist_owner(p_challenge_id uuid)
CREATE OR REPLACE FUNCTION app.provision_specialist_owner(p_challenge_id uuid)
 RETURNS TABLE(ok boolean, code text, organization_id uuid, specialist_id uuid, membership_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
      AND EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = u.id
          AND contact.contact_kind = 'email'
          AND contact.confirmed_at IS NOT NULL
      )
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.read_integrator_delivery_target_snapshot(p_organization_id uuid, p_phone_normalized text, p_telegram_id text, p_max_id text, p_platform_user_id uuid, p_integrator_user_id bigint, p_topic_code text, p_now timestamp with time zone)
CREATE OR REPLACE FUNCTION app.read_integrator_delivery_target_snapshot(p_organization_id uuid, p_phone_normalized text, p_telegram_id text, p_max_id text, p_platform_user_id uuid, p_integrator_user_id bigint, p_topic_code text, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_user_id uuid;
  v_match_count integer;
  v_integrator_user_id bigint;
  v_email text;
  v_email_verified_at timestamp with time zone;
  v_reminder_muted_until timestamp with time zone;
  v_preferences jsonb;
  v_topic_preferences jsonb;
  v_bindings jsonb;
  v_has_web_push boolean;
  v_topic_master_enabled boolean;
  v_vapid_configured boolean;
  v_smtp_configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_delivery_scope_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'integrator.delivery-targets.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($5))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($8))::app.port_typed_arg]), 'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)'::regprocedure);

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'delivery target organization mismatch' USING ERRCODE = '42501';
  END IF;

  -- Разрешение личности. Порядок селекторов — тот же, что был в TypeScript-резолвере:
  -- platformUserId → phone → telegram → max. Приоритет первого непустого, не «все сразу».
  IF p_platform_user_id IS NOT NULL THEN
    SELECT holder.id INTO v_user_id
    FROM public.platform_users AS holder
    WHERE holder.id = p_platform_user_id
      AND holder.merged_into_id IS NULL;
  ELSIF p_phone_normalized IS NOT NULL AND btrim(p_phone_normalized) <> '' THEN
    -- `user_contacts` — источник истины по телефону (одна учётка = один телефон). Несколько
    -- канонических строк на один телефон — это дефект данных, а не пустая аудитория: молча
    -- выбрать первую значило бы отправить уведомление постороннему.
    SELECT count(*), (array_agg(contact.platform_user_id))[1]
    INTO v_match_count, v_user_id
    FROM public.user_contacts AS contact
    JOIN public.platform_users AS holder ON holder.id = contact.platform_user_id
    WHERE contact.contact_kind = 'phone'
      AND contact.value_normalized = btrim(p_phone_normalized)
      AND holder.merged_into_id IS NULL;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'multiple canonical delivery targets for one phone' USING ERRCODE = '22023';
    END IF;
    IF v_match_count = 0 THEN
      v_user_id := NULL;
    END IF;
  ELSIF p_telegram_id IS NOT NULL AND btrim(p_telegram_id) <> '' THEN
    SELECT binding.user_id INTO v_user_id
    FROM public.user_channel_bindings AS binding
    JOIN public.platform_users AS holder ON holder.id = binding.user_id
    WHERE binding.channel_code = 'telegram'
      AND binding.external_id = btrim(p_telegram_id)
      AND holder.merged_into_id IS NULL;
  ELSIF p_max_id IS NOT NULL AND btrim(p_max_id) <> '' THEN
    SELECT binding.user_id INTO v_user_id
    FROM public.user_channel_bindings AS binding
    JOIN public.platform_users AS holder ON holder.id = binding.user_id
    WHERE binding.channel_code = 'max'
      AND binding.external_id = btrim(p_max_id)
      AND holder.merged_into_id IS NULL;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_selector_required');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_outside_organization');
  END IF;

  SELECT holder.integrator_user_id, email_contact.value_normalized,
         email_contact.confirmed_at, holder.reminder_muted_until
  INTO v_integrator_user_id, v_email, v_email_verified_at, v_reminder_muted_until
  FROM public.platform_users AS holder
  LEFT JOIN public.user_contacts AS email_contact
    ON email_contact.platform_user_id = holder.id
   AND email_contact.contact_kind = 'email'
   AND email_contact.is_primary = true
  WHERE holder.id = v_user_id
    AND holder.is_blocked = false
    AND holder.is_archived = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_not_found');
  END IF;
  IF p_integrator_user_id IS NOT NULL
     AND v_integrator_user_id IS DISTINCT FROM p_integrator_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_identity_mismatch');
  END IF;

  SELECT COALESCE(jsonb_object_agg(binding.channel_code, binding.external_id), '{}'::jsonb)
  INTO v_bindings
  FROM public.user_channel_bindings AS binding
  WHERE binding.user_id = v_user_id
    AND binding.channel_code IN ('telegram', 'max')
    AND binding.bot_blocked_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channelCode', preference.channel_code,
    'isEnabledForMessages', preference.is_enabled_for_messages,
    'isEnabledForNotifications', preference.is_enabled_for_notifications,
    'isPreferredForAuth', preference.is_preferred_for_auth
  ) ORDER BY preference.channel_code), '[]'::jsonb)
  INTO v_preferences
  FROM public.user_channel_preferences AS preference
  WHERE preference.platform_user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'topicCode', preference.topic_code,
    'channelCode', preference.channel_code,
    'isEnabled', preference.is_enabled
  ) ORDER BY preference.topic_code, preference.channel_code), '[]'::jsonb)
  INTO v_topic_preferences
  FROM public.user_notification_topic_channels AS preference
  WHERE preference.user_id = v_user_id;

  SELECT COALESCE((
    SELECT topic.is_enabled
    FROM public.user_notification_topics AS topic
    WHERE topic.user_id = v_user_id
      AND topic.topic_code = p_topic_code
  ), true) INTO v_topic_master_enabled;

  SELECT EXISTS (
    SELECT 1 FROM public.user_web_push_subscriptions AS subscription
    WHERE subscription.user_id = v_user_id
  ) INTO v_has_web_push;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'web_push_vapid'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,publicKey}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,privateKey}', '')) <> ''
  ) INTO v_vapid_configured;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'smtp_outbound'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,host}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,user}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,from}', '')) ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      AND COALESCE(setting.value_json #>> '{value,port}', '') ~ '^[0-9]+$'
      AND (setting.value_json #>> '{value,port}')::integer BETWEEN 1 AND 65535
  ) INTO v_smtp_configured;

  RETURN jsonb_build_object(
    'ok', true,
    'platformUserId', v_user_id,
    'bindings', v_bindings,
    'channelPreferences', v_preferences,
    'topicChannelRows', v_topic_preferences,
    'emailRecipient', NULLIF(btrim(v_email), ''),
    'emailVerified', v_email_verified_at IS NOT NULL,
    'muted', v_reminder_muted_until IS NOT NULL AND v_reminder_muted_until > p_now,
    'topicMasterEnabled', v_topic_master_enabled,
    'hasWebPushSubscription', v_has_web_push,
    'vapidConfigured', v_vapid_configured,
    'smtpConfigured', v_smtp_configured
  );
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.read_patient_reminder_delivery_target_snapshot(p_organization_id uuid, p_platform_user_id uuid, p_integrator_user_id bigint, p_topic_code text, p_now timestamp with time zone)
CREATE OR REPLACE FUNCTION app.read_patient_reminder_delivery_target_snapshot(p_organization_id uuid, p_platform_user_id uuid, p_integrator_user_id bigint, p_topic_code text, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient public.platform_users%ROWTYPE;
  v_patient_email text;
  v_patient_email_confirmed_at timestamptz;
  v_preferences jsonb;
  v_topic_preferences jsonb;
  v_bindings jsonb;
  v_has_web_push boolean;
  v_topic_master_enabled boolean;
  v_vapid_configured boolean;
  v_smtp_configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_reminder_materialization_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'reminder.materialization.targets.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($5))::app.port_typed_arg]), 'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)'::regprocedure);

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'patient reminder target organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_topic_code IS NULL OR btrim(p_topic_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_topic_required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = p_platform_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_target_outside_organization');
  END IF;

  SELECT patient.integrator_user_id, email_contact.value_normalized,
         email_contact.confirmed_at, patient.reminder_muted_until
  INTO v_patient.integrator_user_id, v_patient_email,
       v_patient_email_confirmed_at, v_patient.reminder_muted_until
  FROM public.platform_users AS patient
  LEFT JOIN public.user_contacts AS email_contact
    ON email_contact.platform_user_id = patient.id
   AND email_contact.contact_kind = 'email'
   AND email_contact.is_primary = true
  WHERE patient.id = p_platform_user_id
    AND patient.merged_into_id IS NULL
    AND patient.is_blocked = false
    AND patient.is_archived = false;
  IF NOT FOUND OR (p_integrator_user_id IS NOT NULL
      AND v_patient.integrator_user_id IS DISTINCT FROM p_integrator_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_target_identity_mismatch');
  END IF;

  SELECT COALESCE(jsonb_object_agg(binding.channel_code, binding.external_id), '{}'::jsonb)
  INTO v_bindings
  FROM public.user_channel_bindings AS binding
  WHERE binding.user_id = p_platform_user_id
    AND binding.channel_code IN ('telegram', 'max')
    AND binding.bot_blocked_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channelCode', preference.channel_code,
    'isEnabledForMessages', preference.is_enabled_for_messages,
    'isEnabledForNotifications', preference.is_enabled_for_notifications,
    'isPreferredForAuth', preference.is_preferred_for_auth
  ) ORDER BY preference.channel_code), '[]'::jsonb)
  INTO v_preferences
  FROM public.user_channel_preferences AS preference
  WHERE preference.platform_user_id = p_platform_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'topicCode', preference.topic_code,
    'channelCode', preference.channel_code,
    'isEnabled', preference.is_enabled
  ) ORDER BY preference.topic_code, preference.channel_code), '[]'::jsonb)
  INTO v_topic_preferences
  FROM public.user_notification_topic_channels AS preference
  WHERE preference.user_id = p_platform_user_id;

  SELECT COALESCE((
    SELECT topic.is_enabled
    FROM public.user_notification_topics AS topic
    WHERE topic.user_id = p_platform_user_id
      AND topic.topic_code = p_topic_code
  ), true) INTO v_topic_master_enabled;

  SELECT EXISTS (
    SELECT 1 FROM public.user_web_push_subscriptions AS subscription
    WHERE subscription.user_id = p_platform_user_id
  ) INTO v_has_web_push;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'web_push_vapid'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,publicKey}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,privateKey}', '')) <> ''
  ) INTO v_vapid_configured;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'smtp_outbound'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,host}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,user}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,from}', '')) ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      AND COALESCE(setting.value_json #>> '{value,port}', '') ~ '^[0-9]+$'
      AND (setting.value_json #>> '{value,port}')::integer BETWEEN 1 AND 65535
  ) INTO v_smtp_configured;

  RETURN jsonb_build_object(
    'ok', true,
    'bindings', v_bindings,
    'channelPreferences', v_preferences,
    'topicChannelRows', v_topic_preferences,
    'emailRecipient', NULLIF(btrim(v_patient_email), ''),
    'emailVerified', v_patient_email_confirmed_at IS NOT NULL,
    'muted', v_patient.reminder_muted_until IS NOT NULL AND v_patient.reminder_muted_until > p_now,
    'topicMasterEnabled', v_topic_master_enabled,
    'hasWebPushSubscription', v_has_web_push,
    'vapidConfigured', v_vapid_configured,
    'smtpConfigured', v_smtp_configured
  );
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_platform_analytics_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.read_platform_analytics_dashboard(p_start timestamp with time zone, p_end_exclusive timestamp with time zone, p_iana text, p_audience_json text)
CREATE OR REPLACE FUNCTION app.read_platform_analytics_dashboard(p_start timestamp with time zone, p_end_exclusive timestamp with time zone, p_iana text, p_audience_json text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  snapshot jsonb;
  v_audience jsonb;
  v_exclude_staff boolean;
  v_staff_roles text[];
  v_excluded_phones text[];
  v_telegram_ids text[];
  v_max_ids text[];
BEGIN
  PERFORM app.require_accepted_context('app_seam_platform_analytics_owner'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'analytics.platform-dashboard.read', app.hash_port_typed_args(ARRAY[ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)'::regprocedure);

  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive <= p_start THEN
    RAISE EXCEPTION 'platform_analytics_range_invalid' USING ERRCODE = '22023';
  END IF;
  -- Часовой пояс отбивается ЗДЕСЬ: неизвестное имя иначе всплыло бы как 22023 из середины
  -- запроса, где его никто не свяжет с параметром.
  IF p_iana IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_iana) THEN
    RAISE EXCEPTION 'platform_analytics_timezone_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_audience := p_audience_json::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'platform_analytics_audience_invalid' USING ERRCODE = '22023';
  END;
  IF v_audience IS NULL OR jsonb_typeof(v_audience) <> 'object' THEN
    RAISE EXCEPTION 'platform_analytics_audience_invalid' USING ERRCODE = '22023';
  END IF;

  v_exclude_staff := COALESCE((v_audience ->> 'excludeStaffRoles')::boolean, false);
  v_staff_roles := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'staffRoles')), ARRAY[]::text[]);
  v_excluded_phones := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'excludedPhones')), ARRAY[]::text[]);
  v_telegram_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'telegramIds')), ARRAY[]::text[]);
  v_max_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_audience -> 'maxIds')), ARRAY[]::text[]);

  WITH excluded_users AS (
    SELECT u.id AS id
      FROM public.platform_users AS u
     WHERE (v_exclude_staff AND u.role = ANY(v_staff_roles))
        OR EXISTS (
          SELECT 1 FROM public.user_contacts AS contact
          WHERE contact.platform_user_id = u.id
            AND contact.contact_kind = 'phone'
            AND cardinality(v_excluded_phones) > 0
            AND contact.value_normalized = ANY(v_excluded_phones)
        )
    UNION
    SELECT b.user_id AS id
      FROM public.user_channel_bindings AS b
     WHERE (b.channel_code = 'telegram' AND cardinality(v_telegram_ids) > 0
              AND b.external_id = ANY(v_telegram_ids))
        OR (b.channel_code = 'max' AND cardinality(v_max_ids) > 0
              AND b.external_id = ANY(v_max_ids))
  ),

  -- ── 1. Клиенты платформы ────────────────────────────────────────────────────────────────────
  clinics AS (
    SELECT count(*) FILTER (WHERE o.is_active) AS now_count,
           count(*) FILTER (WHERE o.created_at >= p_start AND o.created_at < p_end_exclusive)
             AS period_count
      FROM public.be_organizations AS o
  ),
  clinics_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, o.created_at))::date::text AS d, count(*) AS n
        FROM public.be_organizations AS o
       WHERE o.created_at >= p_start AND o.created_at < p_end_exclusive
       GROUP BY 1) AS g
  ),
  specialists AS (
    SELECT count(*) FILTER (WHERE s.is_active) AS now_count,
           count(*) FILTER (WHERE s.created_at >= p_start AND s.created_at < p_end_exclusive)
             AS period_count
      FROM public.be_specialists AS s
  ),
  specialists_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, s.created_at))::date::text AS d, count(*) AS n
        FROM public.be_specialists AS s
       WHERE s.created_at >= p_start AND s.created_at < p_end_exclusive
       GROUP BY 1) AS g
  ),
  -- Пациент считается по ОДНОМУ правилу и в «сейчас», и в срезе периода. Прежний код фильтровал
  -- `is_archived` только в «сейчас», и две карточки на одном экране считались по разным правилам.
  patient_rows AS (
    SELECT u.created_at AS created_at
      FROM public.platform_users AS u
     WHERE u.role = 'client'
       AND u.merged_into_id IS NULL
       AND u.is_archived = false
       AND u.id NOT IN (SELECT id FROM excluded_users)
  ),
  patients AS (
    SELECT count(*) AS now_count,
           count(*) FILTER (WHERE created_at >= p_start AND created_at < p_end_exclusive)
             AS period_count
      FROM patient_rows
  ),
  patients_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT (timezone(p_iana, created_at))::date::text AS d, count(*) AS n
        FROM patient_rows
       WHERE created_at >= p_start AND created_at < p_end_exclusive
       GROUP BY 1) AS g
  ),

  -- ── 2. Заходы ───────────────────────────────────────────────────────────────────────────────
  page_views AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'pageKey', page_key, 'entryChannel', entry_channel, 'views', views)), '[]'::jsonb) AS a
      FROM (
        SELECT h.page_key AS page_key, h.entry_channel AS entry_channel,
               sum(h.page_views)::bigint AS views
          FROM public.product_analytics_user_hourly AS h
         WHERE h.bucket_hour >= p_start AND h.bucket_hour < p_end_exclusive
           AND h.page_views > 0
           AND h.user_id NOT IN (SELECT id FROM excluded_users)
         GROUP BY 1, 2) AS g
  ),

  -- ── 3. Записались / отменили ────────────────────────────────────────────────────────────────
  bookings AS (
    SELECT count(*) FILTER (
             WHERE a.created_at >= p_start AND a.created_at < p_end_exclusive) AS created_count,
           count(*) FILTER (
             WHERE a.status IN ('cancelled_by_patient', 'cancelled_by_specialist', 'late_cancellation')
               AND a.updated_at >= p_start AND a.updated_at < p_end_exclusive) AS cancelled_count
      FROM public.be_appointments AS a
     WHERE a.deleted_at IS NULL
  ),

  -- ── 4. Программы и визиты с карточками ──────────────────────────────────────────────────────
  programs_assigned AS (
    SELECT count(*) AS n FROM public.treatment_program_instances AS i
     WHERE i.created_at >= p_start AND i.created_at < p_end_exclusive
  ),
  clinical_visits AS (
    SELECT count(*) AS n FROM public.clinical_visit AS v
     WHERE v.created_at >= p_start AND v.created_at < p_end_exclusive
  ),

  -- ── 5. CMS статьи, не разминки ──────────────────────────────────────────────────────────────
  cms_pages AS (
    SELECT p.created_at AS created_at, p.video_url AS video_url
      FROM public.content_pages AS p
      JOIN public.content_sections AS s ON s.slug = p.section
     WHERE p.deleted_at IS NULL
       AND (s.system_parent_code IS NULL OR s.system_parent_code <> 'warmups')
  ),
  cms_articles AS (
    SELECT count(*) AS n FROM cms_pages
     WHERE created_at >= p_start AND created_at < p_end_exclusive
  ),

  -- ── 6. Упражнения специалистов ──────────────────────────────────────────────────────────────
  period_exercises AS (
    SELECT e.id AS id, e.created_by AS created_by, e.catalog_scope AS catalog_scope
      FROM public.lfk_exercises AS e
     WHERE e.owner_kind = 'organization'
       AND e.created_at >= p_start AND e.created_at < p_end_exclusive
  ),
  exercises AS (
    SELECT count(*) AS created_count,
           count(DISTINCT created_by) AS creator_count,
           count(*) FILTER (WHERE catalog_scope = 'personal') AS personal_count,
           count(*) FILTER (WHERE catalog_scope = 'catalog') AS catalog_count
      FROM period_exercises
  ),
  -- Классификация URL (файл vs YouTube/RuTube/VK/Vimeo) — ОДНА, в `hostingUrlKind.ts`. Дублировать
  -- её regex-ами в SQL значило бы завести вторую копию правила, которая разъедется с первой,
  -- поэтому наружу отдаются пары «url → сколько», а не готовый счёт: их столько, сколько РАЗНЫХ
  -- адресов за период, а не сколько строк.
  exercise_media_urls AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('url', media_url, 'count', n)), '[]'::jsonb) AS a
      FROM (
        SELECT m.media_url AS media_url, count(*) AS n
          FROM public.lfk_exercise_media AS m
          JOIN period_exercises AS e ON e.id = m.exercise_id
         WHERE m.media_type = 'video'
         GROUP BY 1) AS g
  ),

  -- ── 7. Объём видео ──────────────────────────────────────────────────────────────────────────
  -- Медиа-id извлекается ОДИН раз и сразу как `uuid`, поэтому join идёт по первичному ключу и
  -- индекс по `media_files.id` работает. Прежний `media_files.id::text = substring(...)` приводил
  -- ключ к тексту и заставлял планировщик протаскивать всю `media_files`. Строгий шаблон uuid в
  -- `WHERE` гарантирует, что `::uuid` не встретит невалидную строку.
  exercise_media_ids AS (
    SELECT DISTINCT
           (substring(m.media_url from '/api/media/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))::uuid AS media_id
      FROM public.lfk_exercise_media AS m
      JOIN period_exercises AS e ON e.id = m.exercise_id
     WHERE m.media_type = 'video'
       AND m.media_url ~ '/api/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  ),
  cms_media_ids AS (
    SELECT DISTINCT
           (substring(c.video_url from '/api/media/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))::uuid AS media_id
      FROM cms_pages AS c
     WHERE c.created_at >= p_start AND c.created_at < p_end_exclusive
       AND c.video_url ~ '/api/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  ),
  -- Сумма байт и ступени длительности считаются ОДНИМ оператором. Прежний код тянул по строке на
  -- каждый медиафайл и складывал их в JS, то есть объём трафика рос вместе с библиотекой.
  volume_rows AS (
    SELECT 'exercises'::text AS src, f.size_bytes AS size_bytes,
           f.video_duration_seconds AS duration_seconds
      FROM public.media_files AS f
      JOIN exercise_media_ids AS m ON m.media_id = f.id
    UNION ALL
    SELECT 'cms'::text AS src, f.size_bytes AS size_bytes,
           f.video_duration_seconds AS duration_seconds
      FROM public.media_files AS f
      JOIN cms_media_ids AS m ON m.media_id = f.id
  ),
  -- Ступени владельца: до 3 / 3–5 / 5–7 / 7–10 / 10–15 / 15–20 минут. Ролик без длительности —
  -- ОТДЕЛЬНАЯ корзина, а не «до 3»: иначе «коротких» роликов оказывается тем больше, чем хуже
  -- отработал media-worker.
  volumes AS (
    SELECT src, jsonb_build_object(
             'originalsBytes', COALESCE(sum(size_bytes), 0),
             'videoCount', count(*),
             'durationBuckets', jsonb_build_object(
               'le3', count(*) FILTER (WHERE duration_seconds BETWEEN 0 AND 180),
               'm3_5', count(*) FILTER (WHERE duration_seconds > 180 AND duration_seconds <= 300),
               'm5_7', count(*) FILTER (WHERE duration_seconds > 300 AND duration_seconds <= 420),
               'm7_10', count(*) FILTER (WHERE duration_seconds > 420 AND duration_seconds <= 600),
               'm10_15', count(*) FILTER (WHERE duration_seconds > 600 AND duration_seconds <= 900),
               'm15_20', count(*) FILTER (WHERE duration_seconds > 900 AND duration_seconds <= 1200),
               'over20', count(*) FILTER (WHERE duration_seconds > 1200),
               'unknown', count(*) FILTER (WHERE duration_seconds IS NULL OR duration_seconds < 0)
             )) AS v
      FROM volume_rows
     GROUP BY src
  ),
  empty_volume AS (
    SELECT jsonb_build_object('originalsBytes', 0, 'videoCount', 0,
             'durationBuckets', jsonb_build_object('le3', 0, 'm3_5', 0, 'm5_7', 0, 'm7_10', 0,
               'm10_15', 0, 'm15_20', 0, 'over20', 0, 'unknown', 0)) AS v
  ),

  -- ── 8. Активность пациентов ─────────────────────────────────────────────────────────────────
  completions AS (
    SELECT count(*) AS n,
           count(*) FILTER (
             WHERE (l.payload ->> 'reps') IS NOT NULL
                OR (l.payload ->> 'perceivedDifficulty') IS NOT NULL
                OR (l.payload ->> 'difficulty') IS NOT NULL) AS with_metrics
      FROM public.program_action_log AS l
     WHERE l.action_type = 'done'
       AND l.created_at >= p_start AND l.created_at < p_end_exclusive
       AND l.patient_user_id NOT IN (SELECT id FROM excluded_users)
  ),
  home_wellbeing AS (
    SELECT count(*) AS n
      FROM public.symptom_entries AS e
      JOIN public.symptom_trackings AS t ON t.id = e.tracking_id
     WHERE t.symptom_key = 'general_wellbeing'
       AND e.recorded_at >= p_start AND e.recorded_at < p_end_exclusive
  ),
  active_instances AS (
    SELECT i.id AS id, i.patient_user_id AS patient_user_id
      FROM public.treatment_program_instances AS i
     WHERE i.status = 'active'
       AND i.patient_user_id NOT IN (SELECT id FROM excluded_users)
  ),
  program_activity AS (
    SELECT (SELECT count(DISTINCT patient_user_id) FROM active_instances) AS patients_with_program,
           (SELECT count(*) FROM (
              SELECT DISTINCT h.user_id, (timezone(p_iana, h.bucket_hour))::date AS d
                FROM public.product_analytics_user_hourly AS h
                JOIN active_instances AS a ON a.patient_user_id = h.user_id
               WHERE h.bucket_hour >= p_start AND h.bucket_hour < p_end_exclusive
                 AND h.page_views > 0
                 AND h.page_key LIKE '/app/patient/treatment%') AS x) AS visit_days,
           (SELECT count(*) FROM (
              SELECT DISTINCT l.patient_user_id, (timezone(p_iana, l.created_at))::date AS d
                FROM public.program_action_log AS l
                JOIN active_instances AS a ON a.id = l.instance_id
               WHERE l.action_type = 'done'
                 AND l.created_at >= p_start AND l.created_at < p_end_exclusive) AS x) AS mark_days
  ),
  playback_events AS (
    SELECT r.user_id AS user_id, r.media_id AS media_id, r.delivery AS delivery,
           (timezone(p_iana, r.resolved_at))::date::text AS d
      FROM public.media_playback_resolution_events AS r
     WHERE r.resolved_at >= p_start AND r.resolved_at < p_end_exclusive
       AND (r.user_id IS NULL OR r.user_id NOT IN (SELECT id FROM excluded_users))
  ),
  playback AS (
    -- `count(DISTINCT (user_id, media_id))` вместо склейки в текст: при `user_id IS NULL` склейка
    -- давала NULL, и анонимный просмотр входил во «всего», но исчезал из «уникальных».
    SELECT count(*) AS views_total,
           count(DISTINCT (user_id, media_id)) AS views_unique,
           count(*) FILTER (WHERE delivery = 'hls') AS hls_resolves,
           count(*) FILTER (WHERE delivery = 'mp4') AS mp4_resolves
      FROM playback_events
  ),
  playback_by_day AS (
    SELECT COALESCE(jsonb_object_agg(d, n), '{}'::jsonb) AS m FROM (
      SELECT d, count(*) AS n FROM playback_events GROUP BY 1) AS g
  ),
  playback_errors AS (
    SELECT (SELECT count(*) FROM public.media_playback_client_events AS c
             WHERE c.created_at >= p_start AND c.created_at < p_end_exclusive)
         + (SELECT count(*) FROM public.media_hls_proxy_error_events AS x
             WHERE x.created_at >= p_start AND x.created_at < p_end_exclusive) AS n
  )

  SELECT jsonb_build_object(
    'clinics', jsonb_build_object('now', clinics.now_count, 'inPeriod', clinics.period_count,
                                  'byDay', clinics_by_day.m),
    'specialists', jsonb_build_object('now', specialists.now_count,
                                      'inPeriod', specialists.period_count,
                                      'byDay', specialists_by_day.m),
    'patients', jsonb_build_object('now', patients.now_count, 'inPeriod', patients.period_count,
                                   'byDay', patients_by_day.m),
    'pageViews', page_views.a,
    'bookings', jsonb_build_object('created', bookings.created_count,
                                   'cancelled', bookings.cancelled_count),
    'programsAssigned', programs_assigned.n,
    'clinicalVisits', clinical_visits.n,
    'cmsArticlesCreated', cms_articles.n,
    'exercises', jsonb_build_object('created', exercises.created_count,
                                    'creators', exercises.creator_count,
                                    'personal', exercises.personal_count,
                                    'catalog', exercises.catalog_count,
                                    'mediaUrls', exercise_media_urls.a),
    'videoVolumeExercises', COALESCE((SELECT v FROM volumes WHERE src = 'exercises'),
                                     empty_volume.v),
    'videoVolumeCms', COALESCE((SELECT v FROM volumes WHERE src = 'cms'), empty_volume.v),
    'completions', jsonb_build_object('completions', completions.n,
                                      'withRepsOrDifficulty', completions.with_metrics),
    'homeWellbeingMarks', home_wellbeing.n,
    'programActivity', jsonb_build_object(
      'patientsWithProgram', program_activity.patients_with_program,
      'visitDaysSum', program_activity.visit_days,
      'markDaysSum', program_activity.mark_days),
    'playback', jsonb_build_object('viewsTotal', playback.views_total,
                                   'viewsUnique', playback.views_unique,
                                   'hlsResolves', playback.hls_resolves,
                                   'mp4Resolves', playback.mp4_resolves,
                                   'playbackErrors', playback_errors.n,
                                   'byDay', playback_by_day.m)
  ) INTO snapshot
  FROM clinics, clinics_by_day, specialists, specialists_by_day, patients, patients_by_day,
       page_views, bookings, programs_assigned, clinical_visits, cms_articles, exercises,
       exercise_media_urls, empty_volume, completions, home_wellbeing,
       program_activity, playback, playback_by_day, playback_errors;

  RETURN snapshot;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.redeem_patient_invite_email(p_continuation_hash text)
CREATE OR REPLACE FUNCTION app.redeem_patient_invite_email(p_continuation_hash text)
 RETURNS TABLE(ok boolean, code text, organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_authenticated_platform_user_id uuid;
  v_patient_email text;
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
  SELECT contact.value_normalized INTO v_patient_email
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_patient.id
    AND contact.contact_kind = 'email'
    AND contact.is_primary = true
  LIMIT 1;
  IF v_patient.role <> 'client' OR v_patient.merged_into_id IS NOT NULL
     OR v_patient_email IS DISTINCT FROM v_invite.invited_email_normalized
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

  UPDATE public.user_contacts AS contact
  SET confirmed_at = COALESCE(contact.confirmed_at, now()), updated_at = now()
  WHERE contact.platform_user_id = v_invite.patient_user_id
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = v_invite.invited_email_normalized;
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.resolve_public_booking_client_by_phone(p_phone_normalized text, p_display_name text, p_phone_proven boolean)
CREATE OR REPLACE FUNCTION app.resolve_public_booking_client_by_phone(p_phone_normalized text, p_display_name text, p_phone_proven boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_candidates uuid[];
  v_id uuid;
  v_display text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'booking.public-client.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure);

  -- Формат телефона проверяет сама дверь: вызывающий нормализует, но дверь ему не верит.
  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^\\+[1-9][0-9]{7,14}$' THEN
    RETURN NULL;
  END IF;

  v_display := pg_catalog.btrim(COALESCE(p_display_name, ''));
  IF v_display = '' THEN
    v_display := p_phone_normalized;
  END IF;
  v_display := pg_catalog.left(v_display, 500);

  SELECT pg_catalog.array_agg(candidate.id)
  INTO v_candidates
  FROM (
    SELECT person.id
    FROM public.platform_users AS person
    WHERE person.merged_into_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = person.id
          AND contact.contact_kind = 'phone'
          AND contact.is_primary = true
          AND contact.value_normalized = p_phone_normalized
      )
    LIMIT 2
  ) AS candidate;

  -- Два живых аккаунта на один телефон — состояние, которое разбирают слиянием, а не догадкой.
  IF pg_catalog.cardinality(v_candidates) > 1 THEN
    RETURN NULL;
  END IF;
  IF pg_catalog.cardinality(v_candidates) = 1 THEN
    RETURN v_candidates[1];
  END IF;

  INSERT INTO public.platform_users (display_name, role)
  VALUES (
    v_display,
    'client'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.user_identity (
    platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at
  )
  SELECT person.id, person.first_name, person.last_name, person.patronymic,
         COALESCE(person.display_name, ''), person.birth_date, now()
  FROM public.platform_users AS person
  WHERE person.id = v_id
  ON CONFLICT (platform_user_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    patronymic = EXCLUDED.patronymic,
    display_name = EXCLUDED.display_name,
    birth_date = EXCLUDED.birth_date,
    updated_at = now();

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at
  )
  VALUES (
    v_id, 'phone', p_phone_normalized, true,
    CASE WHEN p_phone_proven THEN now() ELSE NULL END, 'direct', now()
  );

  RETURN v_id;
END;
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.revalidate_patient_reminder_delivery_materialization(p_queue_id uuid)
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
  SELECT candidate.id, candidate.rule_id, candidate.status, candidate.organization_id,
         candidate.platform_user_id, candidate.delivery_generation
    INTO occurrence
  FROM integrator.user_reminder_occurrences AS candidate
  WHERE candidate.id = delivery.payload_json ->> 'occurrenceId';
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
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.set_current_patient_preferred_auth_channel(p_channel text)
CREATE OR REPLACE FUNCTION app.set_current_patient_preferred_auth_channel(p_channel text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.preferred-auth-channel.set', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.set_current_patient_preferred_auth_channel(text)'::regprocedure);
  IF p_channel IS NOT NULL AND p_channel NOT IN ('telegram', 'max', 'email', 'sms') THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_rejected' USING ERRCODE = 'P0001';
  END IF;
  IF p_channel IN ('telegram', 'max') AND NOT EXISTS (
    SELECT 1 FROM public.user_channel_bindings b
    WHERE b.user_id = v_patient AND b.channel_code = p_channel
  ) THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_unlinked' USING ERRCODE = 'P0001';
  END IF;
  IF p_channel = 'email' AND NOT EXISTS (
    SELECT 1 FROM public.user_contacts AS contact
    WHERE contact.platform_user_id = v_patient
      AND contact.contact_kind = 'email'
      AND contact.confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_unverified' USING ERRCODE = 'P0001';
  END IF;
  IF p_channel = 'sms' AND NOT EXISTS (
    SELECT 1 FROM public.user_contacts AS contact
    WHERE contact.platform_user_id = v_patient
      AND contact.contact_kind = 'phone'
      AND contact.confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'current_patient_preferred_auth_channel_unverified' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.user_channel_preferences p SET is_preferred_for_auth = false,
    updated_at = statement_timestamp()
  WHERE p.platform_user_id = v_patient;
  IF p_channel IS NOT NULL THEN
    INSERT INTO public.user_channel_preferences (
      user_id, platform_user_id, channel_code, is_enabled_for_messages,
      is_enabled_for_notifications, is_preferred_for_auth, updated_at
    ) VALUES (
      v_patient::text, v_patient, p_channel, true, true, true, statement_timestamp()
    ) ON CONFLICT (user_id, channel_code) DO UPDATE SET
      platform_user_id = EXCLUDED.platform_user_id,
      is_preferred_for_auth = true, updated_at = EXCLUDED.updated_at
    WHERE user_channel_preferences.platform_user_id = v_patient;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'current_patient_preferred_auth_channel_conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN true;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_specialist_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.specialist_task_reminder_materialization_fingerprint(p_task_id uuid)
CREATE OR REPLACE FUNCTION app.specialist_task_reminder_materialization_fingerprint(p_task_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_reminder_specialist_owner'::name, ARRAY['app_operational_delivery_worker'::name]::name[]);
SELECT md5(jsonb_build_object(
    'task', jsonb_build_array(
      task.organization_id, task.owner_user_id, task.patient_user_id, task.title,
      task.description, task.due_at, task.remind_at, task.is_important,
      task.completed_at, task.reminder_sent_at, task.updated_at
    ),
    'owner', jsonb_build_array(owner_email.value_normalized, owner_email.confirmed_at,
                              owner_email.updated_at, owner.updated_at),
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
  LEFT JOIN public.user_contacts AS owner_email
    ON owner_email.platform_user_id = owner.id
   AND owner_email.contact_kind = 'email'
   AND owner_email.is_primary = true
  WHERE task.id = p_task_id
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP INDEX IF EXISTS public.idx_platform_users_phone;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DO $d15b6_dependencies$
DECLARE
  v_dependents text[];
  v_legacy_functions text[];
BEGIN
  SELECT array_agg(pg_catalog.pg_describe_object(dependent.classid, dependent.objid, dependent.objsubid))
  INTO v_dependents
  FROM pg_catalog.pg_attribute AS attribute
  JOIN pg_catalog.pg_depend AS dependent
    ON dependent.refclassid = 'pg_catalog.pg_class'::regclass
   AND dependent.refobjid = attribute.attrelid
   AND dependent.refobjsubid = attribute.attnum
  WHERE attribute.attrelid = 'public.platform_users'::regclass
    AND attribute.attname IN (
      'phone_normalized', 'email', 'email_normalized',
      'email_verified_at', 'patient_phone_trust_at'
    )
    AND dependent.deptype <> 'i';

  IF cardinality(v_dependents) > 0 THEN
    RAISE EXCEPTION 'D15b/6 legacy contact columns still have dependencies: %', v_dependents;
  END IF;

  SELECT array_agg(namespace.nspname || '.' || procedure.proname)
  INTO v_legacy_functions
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname IN ('app', 'public')
    AND procedure.prosrc ~ '(u|pu|users|user|patient|person|platform_user|holder|owner|recipient|source|target|duplicate)\.(phone_normalized|email|email_normalized|email_verified_at|patient_phone_trust_at)';

  IF cardinality(v_legacy_functions) > 0 THEN
    RAISE EXCEPTION 'D15b/6 legacy contact function readers/writers remain: %', v_legacy_functions;
  END IF;
END
$d15b6_dependencies$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.platform_users
  DROP COLUMN phone_normalized,
  DROP COLUMN email,
  DROP COLUMN email_normalized,
  DROP COLUMN email_verified_at,
  DROP COLUMN patient_phone_trust_at;
