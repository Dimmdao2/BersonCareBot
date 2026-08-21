-- BCB-MIGRATION-OWNER: app_seam_org_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND pg_catalog.strpos(p.prosrc, 'ON CONFLICT (platform_user_id, contact_kind, value_normalized)') > 0);
-- D15b/6 (owner blocker, 22.08.2026): the e-mail login door died `42P10 there is no unique or
-- exclusion constraint matching the ON CONFLICT specification` on its success branch, right behind
-- the row-lock privilege refusal that was paid a day earlier. Four bodies written by
-- `20260821T040000_cut_over_canonical_contacts.sql` name `ON CONFLICT (platform_user_id,
-- contact_kind, value_normalized)` on `public.user_contacts`, and no such index exists. The
-- canonical index is `uq_user_contacts_email UNIQUE (value_normalized) WHERE contact_kind =
-- 'email'`: one confirmed e-mail belongs to exactly ONE account, which is what makes "log into the
-- one account by any confirmed contact of it" true. The very same file already writes the arbiter
-- that way for `'phone'`, so this is one file disagreeing with itself, not a decision. The fix names
-- the real index. A three-column unique index is deliberately NOT introduced: it would let one
-- e-mail sit on several accounts and break identity.
--
-- Applied migrations are never edited, so the four bodies are re-created here. Owner, signature,
-- argument list, the accepted-context gate as the first executable statement and every other line
-- stay exactly as landed on 21.08 — only the conflict target moves, so `function_identity`
-- (`regprocedure`), the declared capability rows and every callsite address the same objects.
--
-- `app.email_auth_verify_user_email(uuid,text)` is the one body that also changes shape. The other
-- three refuse a foreign owner of the same e-mail BEFORE the upsert is reached (`email_mismatch`,
-- `conflicting_identity`, `email_conflict`), so their arbiter can only ever meet the caller's own
-- row. That door returns `void` and pre-checks nothing: with a plain `DO UPDATE` on
-- `(value_normalized)` an e-mail owned by somebody else would have their confirmed row silently
-- re-stamped `is_primary`/`confirmed_at` while the caller got no contact and no error. It therefore
-- takes the update-then-insert shape of the single canonical writer
-- (`packages/platform-merge/src/userContactsMirrorWrite.ts`): the caller's own row is updated, and a
-- foreign e-mail reaches `uq_user_contacts_email` and is refused `23505` — which is what this door
-- did before the 21.08 cut-over moved e-mail out of `platform_users`.
--
-- No GRANT/REVOKE/POLICY here (AGENTS.md §1). All four already declare `public.user_contacts`
-- SELECT+INSERT+UPDATE over the canonical contact columns in
-- `deploy/postgres/privileges/declaration.ts` (`CANONICAL_CONTACT_SURFACE_CORRECTIONS`); the changed
-- bodies touch no new relation and no new column (`RETURNING 1`, never `id`), and no
-- `FOR UPDATE`/`FOR SHARE` is added or removed, so `ROW_LOCK_SURFACES` is unchanged too.
--
-- Live proof of behaviour:
-- `deploy/postgres/privileges/canonical-email-contact-upsert.devDbProof.test.mjs`.
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
  ON CONFLICT (value_normalized) WHERE contact_kind = 'email'
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
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
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
    ON CONFLICT (value_normalized) WHERE contact_kind = 'email'
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
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- D15b/6 root: app.email_auth_verify_user_email(p_user_id uuid, p_email text)
CREATE OR REPLACE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_email_otp_owner'::name, ARRAY['app_patient'::name]::name[]);
WITH confirmed_own_contact AS (
  UPDATE public.user_contacts
  SET is_primary = true,
      confirmed_at = now(),
      updated_at = now()
  WHERE platform_user_id = p_user_id
    AND contact_kind = 'email'
    AND value_normalized = lower(btrim(p_email))
  RETURNING 1
)
INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, value_normalized, is_primary,
  confirmed_at, source_origin, updated_at
)
SELECT p_user_id, 'email', lower(btrim(p_email)), true, now(), 'direct', now()
WHERE NOT EXISTS (SELECT 1 FROM confirmed_own_contact)
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
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
  ON CONFLICT (value_normalized) WHERE contact_kind = 'email'
  DO UPDATE SET
    is_primary = true,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = EXCLUDED.updated_at;
  DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
  RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer;
END
$function$
;
