--
-- PostgreSQL database dump
--

\restrict bcb_a0_schema_only

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

CREATE SCHEMA app;


--
-- Name: app_ext; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app_ext;


--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: integrator; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA integrator;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA app_ext;


--
-- Name: accept_org_invite(text, uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.accept_org_invite(p_token_hash text, p_platform_user_id uuid, p_expected_email text) RETURNS TABLE(ok boolean, code text, organization_id uuid, membership_id uuid, platform_user_id uuid, specialist_id uuid, role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
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

  -- C4A correction: fail closed and atomic against the CURRENT clinic_team entitlement, not the
  -- entitlement at invite-creation time. An invite issued before a downgrade/OFF must not activate
  -- ANY clinic-team membership growth — this applies to every invited role, including `admin`,
  -- which never consumes a numeric seat but still grows the paid clinic-team capability. Mirrors
  -- isMechanicEnabled's clinic_team default-off precedence (src/modules/org-entitlements/service.ts)
  -- — duplicated here because it must run inside this same FOR UPDATE-locked transaction to be
  -- atomic. Checked, and denied, before any platform_users/membership/invite mutation below.
  SELECT COALESCE(
    (SELECT eo.enabled FROM public.saas_org_entitlement_overrides AS eo
     WHERE eo.organization_id = v_invite.organization_id AND eo.mechanic = 'clinic_team'),
    (SELECT (t.mechanics ->> 'clinic_team')::boolean
     FROM public.be_organizations AS o
     JOIN public.saas_tariffs AS t ON t.id = o.tariff_id
     WHERE o.id = v_invite.organization_id),
    false
  ) INTO v_clinic_team_enabled;

  IF NOT v_clinic_team_enabled THEN
    RETURN QUERY SELECT false, 'entitlement_disabled'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Numeric seat CAPACITY remains doctor-only: an `admin` invite never consumes or is blocked by
  -- seat count, only by the entitlement gate above. Mirrors resolveClinicSeatLimit's override >
  -- tariff > fail-closed-baseline precedence (src/modules/org-entitlements/service.ts). `i.id <>
  -- v_invite.id` excludes this invite's own prior pending reservation from the pending count:
  -- accepting does not add a NEW reservation on top of the one already held since it was created.
  IF v_invite.invited_role = 'doctor' THEN
    SELECT COALESCE(
      (SELECT eo.seat_limit_override FROM public.saas_org_entitlement_overrides AS eo
       WHERE eo.organization_id = v_invite.organization_id AND eo.mechanic = 'clinic_team'),
      (SELECT t.included_seats
       FROM public.be_organizations AS o
       JOIN public.saas_tariffs AS t ON t.id = o.tariff_id
       WHERE o.id = v_invite.organization_id),
      1 -- CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE (src/modules/org-entitlements/types.ts)
    ) INTO v_seat_limit;

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

    IF v_seat_used >= v_seat_limit THEN
      RETURN QUERY SELECT false, 'seat_limit_reached'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
      RETURN;
    END IF;
  END IF;

  v_display_name := COALESCE(NULLIF(btrim(v_user.display_name), ''), split_part(v_invite.invited_email, '@', 1), v_invite.invited_email);

  UPDATE public.platform_users AS u
  SET role = 'doctor',
      email = COALESCE(u.email, v_invite.invited_email),
      email_normalized = COALESCE(u.email_normalized, v_invite.invited_email),
      email_verified_at = COALESCE(u.email_verified_at, now()),
      updated_at = now()
  WHERE u.id = v_user.id;

  -- R1: create the membership only. Auto-provisioning a be_specialists profile is DEFERRED:
  -- be_specialists is FORCE-RLS with a staff+org policy (app.is_staff() AND organization_id =
  -- app.current_org_id(), where current_org_id() reads app.principal_context by backend_pid). A
  -- pre-session SECURITY DEFINER cannot satisfy that without a staff principal context — the same
  -- pre-session staff-provisioning gap that specialist-signup provisioning has under enforce. The
  -- invited doctor becomes an active member now; their bookable specialist profile is provisioned
  -- later from a proper staff context (clinic member management, R3 / signup-provisioning fix).
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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS alias_claim
    WHERE alias_claim.slug = OLD.slug
      AND alias_claim.kind = 'alias'
      AND alias_claim.organization_id = OLD.organization_id
  ) OR EXISTS (
    SELECT 1
    FROM public.clinic_public_directory_entries AS directory
    WHERE directory.organization_id = OLD.organization_id
      AND directory.slug <> NEW.slug
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_rename_events AS rename_event
    WHERE rename_event.organization_id = OLD.organization_id
      AND rename_event.previous_slug = OLD.slug
      AND rename_event.next_slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'organization slug rename requires retained alias, synchronized directory and audit event';
  END IF;
  RETURN NULL;
END
$$;


--
-- Name: begin_staff_login_challenge(text, timestamp with time zone); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.begin_staff_login_challenge(p_challenge_hash text, p_expires_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
	UPDATE public.staff_security_profiles p
	SET login_challenge_hash = p_challenge_hash,
	    login_challenge_expires_at = p_expires_at,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id() AND p.factor_verified_at IS NOT NULL;
	RETURN FOUND;
END
$$;


--
-- Name: cancel_patient_invite_email_proof(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cancel_patient_invite_email_proof(p_continuation_hash text, p_code_hash text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
-- Name: close_active_user_phone_history(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.close_active_user_phone_history(p_user uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'app', 'public', 'pg_catalog'
    AS $$
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
-- Name: create_specialist_signup_intent(uuid, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.create_specialist_signup_intent(p_challenge_id uuid, p_email_normalized text, p_organization_title text, p_specialist_full_name text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  INSERT INTO public.specialist_signup_intents (
    user_id,
    challenge_id,
    email_normalized,
    organization_title,
    specialist_full_name
  )
  VALUES (
    app.require_staff_security_self_user_id(),
    p_challenge_id,
    lower(btrim(p_email_normalized)),
    btrim(p_organization_title),
    btrim(p_specialist_full_name)
  )
  RETURNING id
$$;


--
-- Name: current_integrator_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_integrator_user_id() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'app', 'pg_catalog'
    AS $$
  SELECT integrator_user_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;


--
-- Name: current_org_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_org_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'app', 'pg_catalog'
    AS $$
  SELECT org_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
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
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'app', 'pg_catalog'
    AS $$
  SELECT patient_user_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;


--
-- Name: email_auth_delete_email_challenge_by_id(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_delete_email_challenge_by_id(p_challenge_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.email_challenges WHERE id = p_challenge_id
$$;


--
-- Name: email_auth_delete_email_challenges_for_user(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_delete_email_challenges_for_user(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.email_challenges WHERE user_id = p_user_id
$$;


--
-- Name: email_auth_find_email_challenge_for_confirm(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_challenge_for_confirm(p_challenge_id uuid, p_user_id uuid) RETURNS TABLE(id uuid, email text, code_hash text, expires_at bigint, attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;


--
-- Name: email_auth_find_email_challenge_for_consume(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_challenge_for_consume(p_challenge_id uuid, p_user_id uuid) RETURNS TABLE(id uuid, code_hash text, expires_at bigint, attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;


--
-- Name: email_auth_find_email_owner_conflict(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_users AS u
    WHERE u.id <> p_user_id
      AND u.merged_into_id IS NULL
      AND u.email_normalized = lower(btrim(p_email))
  )
$$;


--
-- Name: email_auth_find_email_send_cooldown(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_email_send_cooldown(p_user_id uuid, p_email_norm text) RETURNS TABLE(last_sent_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT c.last_sent_at
  FROM public.email_send_cooldowns AS c
  WHERE c.user_id = p_user_id
    AND c.email_normalized = p_email_norm
  LIMIT 1
$$;


--
-- Name: email_auth_find_latest_email_challenge_for_user(uuid, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_latest_email_challenge_for_user(p_user_id uuid, p_now_sec bigint) RETURNS TABLE(id uuid, code_hash text, expires_at bigint, attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;


--
-- Name: email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(p_user_id uuid, p_now_sec bigint) RETURNS TABLE(id uuid, email text, code_hash text, expires_at bigint, attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;


--
-- Name: email_auth_insert_email_challenge(uuid, text, text, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_insert_email_challenge(p_user_id uuid, p_email text, p_code_hash text, p_expires_at bigint) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  INSERT INTO public.email_challenges (user_id, email, code_hash, expires_at, attempts)
  VALUES (p_user_id, p_email, p_code_hash, p_expires_at, 0)
  RETURNING id
$$;


--
-- Name: email_auth_update_email_challenge_attempts(uuid, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_update_email_challenge_attempts(p_challenge_id uuid, p_attempts integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  UPDATE public.email_challenges
  SET attempts = p_attempts
  WHERE id = p_challenge_id
$$;


--
-- Name: email_auth_upsert_email_send_cooldown(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_auth_upsert_email_send_cooldown(p_user_id uuid, p_email_norm text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    AS $$
  UPDATE public.platform_users
  SET email = p_email,
      email_normalized = lower(btrim(p_email)),
      email_verified_at = now(),
      updated_at = now()
  WHERE id = p_user_id
$$;


--
-- Name: email_otp_public_delete_unverified_registration(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_delete_unverified_registration(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.platform_users
  WHERE id = p_user_id AND role = 'client' AND merged_into_id IS NULL AND email_verified_at IS NULL
$$;


--
-- Name: email_otp_public_find_email_send_cooldown_by_email(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(p_email_norm text) RETURNS TABLE(last_sent_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT c.last_sent_at
  FROM public.email_send_cooldowns AS c
  WHERE c.email_normalized = p_email_norm
  ORDER BY c.last_sent_at DESC
  LIMIT 1
$$;


--
-- Name: email_otp_public_find_latest_email_challenge_by_email(text, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(p_email_norm text, p_now_sec bigint) RETURNS TABLE(id uuid, user_id uuid, code_hash text, expires_at bigint, attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    AS $$
DECLARE
  v_existing_id uuid;
  v_merged_id uuid;
  v_canonical_id uuid;
  v_inserted_id uuid;
  v_display_name text := COALESCE(NULLIF(split_part(p_email_norm, '@', 1), ''), p_email_norm);
BEGIN
  SELECT u.id
  INTO v_existing_id
  FROM public.platform_users AS u
  WHERE u.email_normalized = p_email_norm
    AND u.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  SELECT u.id
  INTO v_merged_id
  FROM public.platform_users AS u
  WHERE u.email_normalized = p_email_norm
    AND u.merged_into_id IS NOT NULL
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF v_merged_id IS NOT NULL THEN
    WITH RECURSIVE chain AS (
      SELECT u.id, u.merged_into_id, 0 AS depth, ARRAY[u.id] AS path
      FROM public.platform_users AS u
      WHERE u.id = v_merged_id
      UNION ALL
      SELECT u.id, u.merged_into_id, c.depth + 1, c.path || u.id
      FROM public.platform_users AS u
      JOIN chain AS c ON u.id = c.merged_into_id
      WHERE c.depth < 5
        AND NOT u.id = ANY(c.path)
    )
    SELECT c.id
    INTO v_canonical_id
    FROM chain AS c
    ORDER BY (c.merged_into_id IS NULL) DESC, c.depth DESC
    LIMIT 1;

    IF v_canonical_id IS NOT NULL THEN
      RETURN QUERY SELECT v_canonical_id, false;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.platform_users (email, email_normalized, display_name, role)
  VALUES (p_email_norm, p_email_norm, v_display_name, 'client')
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_inserted_id, true;
    RETURN;
  END IF;

  SELECT u.id
  INTO v_existing_id
  FROM public.platform_users AS u
  WHERE u.email_normalized = p_email_norm
    AND u.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'email_otp_public_find_or_create_user_failed';
  END IF;

  RETURN QUERY SELECT v_existing_id, false;
END
$$;


--
-- Name: email_otp_public_find_user_by_email(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_find_user_by_email(p_email_norm text) RETURNS TABLE(user_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  WITH RECURSIVE chain AS (
    SELECT u.id, u.merged_into_id, 0 AS depth, ARRAY[u.id] AS path
    FROM public.platform_users AS u
    WHERE u.email_normalized = lower(btrim(p_email_norm))
    UNION ALL
    SELECT u.id, u.merged_into_id, chain.depth + 1, chain.path || u.id
    FROM public.platform_users AS u
    JOIN chain ON u.id = chain.merged_into_id
    WHERE chain.depth < 5 AND NOT u.id = ANY(chain.path)
  )
  SELECT chain.id FROM chain
  ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
  LIMIT 1
$$;


--
-- Name: email_otp_public_register_patient(text, text, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_otp_public_register_patient(p_email_norm text, p_last_name text, p_first_name text, p_patronymic text) RETURNS TABLE(ok boolean, code text, user_id uuid, was_created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
#variable_conflict use_column
DECLARE
  v_email_norm text := lower(btrim(p_email_norm));
  v_last_name text := NULLIF(btrim(p_last_name), '');
  v_first_name text := NULLIF(btrim(p_first_name), '');
  v_patronymic text := NULLIF(btrim(p_patronymic), '');
  v_existing public.platform_users%ROWTYPE;
  v_user_id uuid;
BEGIN
  IF v_email_norm = '' THEN RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid, false; RETURN; END IF;
  IF v_last_name IS NULL OR v_first_name IS NULL THEN RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid, false; RETURN; END IF;
  SELECT u.* INTO v_existing FROM public.platform_users AS u WHERE u.email_normalized = v_email_norm AND u.merged_into_id IS NULL LIMIT 1;
  IF FOUND THEN
    IF v_existing.email_verified_at IS NULL
      AND v_existing.role = 'client'
      AND v_existing.last_name IS NOT NULL
      AND v_existing.first_name IS NOT NULL THEN
      RETURN QUERY SELECT true, 'pending_registration'::text, v_existing.id, false;
    ELSE
      RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.platform_users (display_name, last_name, first_name, patronymic, email, email_normalized, role)
  VALUES (concat_ws(' ', v_last_name, v_first_name, v_patronymic), v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, 'client')
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_user_id;
  IF v_user_id IS NULL THEN RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false; RETURN; END IF;
  RETURN QUERY SELECT true, NULL::text, v_user_id, true;
END
$$;


--
-- Name: email_password_delete_unverified_registration(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_delete_unverified_registration(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    AS $$
  SELECT upc.user_id, upc.password_hash, (pu.email_verified_at IS NOT NULL)
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  WHERE pu.merged_into_id IS NULL
    AND pu.email_normalized = lower(btrim(p_email_norm))
  LIMIT 1
$$;


--
-- Name: email_password_find_user_id_by_email_challenge(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.email_password_find_user_id_by_email_challenge(p_challenge_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
-- Name: ensure_staff_security_profile(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.ensure_staff_security_profile() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
-- Name: get_latest_specialist_signup_intent_for_user(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_latest_specialist_signup_intent_for_user() RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
	SELECT i.id, i.user_id, i.challenge_id, i.email_normalized, i.organization_title,
	       i.specialist_full_name, i.status, i.provisioned_organization_id,
	       i.provisioned_specialist_id, i.provisioned_membership_id
	FROM public.specialist_signup_intents i
	WHERE i.user_id = app.require_staff_security_self_user_id()
	ORDER BY i.created_at DESC
	LIMIT 1
$$;


--
-- Name: get_pending_specialist_signup_intent(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_pending_specialist_signup_intent(p_user_id uuid, p_challenge_id uuid) RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
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
-- Name: get_public_config_bool(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_public_config_bool(p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  WITH latest AS (
    SELECT definition_json
    FROM public.reference_catalog_baselines
    ORDER BY version DESC
    LIMIT 1
  ), category AS (
    SELECT value AS definition
    FROM latest, jsonb_array_elements(definition_json->'categories')
    WHERE value->>'code' = p_category_code
      AND p_category_code <> 'visit_manipulation'
  )
  SELECT
    md5('public-reference-item:' || p_category_code || ':' || ((expanded.item_definition::jsonb)->>0))::uuid,
    md5('public-reference-category:' || p_category_code)::uuid,
    (expanded.item_definition::jsonb)->>0,
    (expanded.item_definition::jsonb)->>1,
    ((expanded.item_definition::jsonb)->>2)::integer,
    true,
    NULL::timestamptz,
    COALESCE((expanded.item_definition::jsonb)->3, '{}'::jsonb)
  FROM category
  CROSS JOIN LATERAL jsonb_array_elements(category.definition->'items') AS expanded(item_definition)
  ORDER BY ((expanded.item_definition::jsonb)->>2)::integer, (expanded.item_definition::jsonb)->>1
$$;


--
-- Name: get_specialist_signup_intent_by_challenge(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_specialist_signup_intent_by_challenge(p_challenge_id uuid) RETURNS TABLE(id uuid, user_id uuid, challenge_id uuid, email_normalized text, organization_title text, specialist_full_name text, status text, provisioned_organization_id uuid, provisioned_specialist_id uuid, provisioned_membership_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT
    i.id,
    i.user_id,
    i.challenge_id,
    i.email_normalized,
    i.organization_title,
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
    AS $$
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
    AS $$
	SELECT p.session_version, (p.factor_verified_at IS NOT NULL)
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
$$;


--
-- Name: get_web_push_vapid_public_key(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_web_push_vapid_public_key() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT NULLIF(btrim(s.value_json #>> '{value,publicKey}'), '')
  FROM public.system_settings AS s
  WHERE s.key = 'web_push_vapid'
    AND s.scope = 'admin'
    AND s.organization_id IS NULL
  LIMIT 1
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
  IF TG_OP = 'UPDATE' AND OLD.kind = 'alias' THEN
    RAISE EXCEPTION 'organization slug aliases are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'current' AND (
    NEW.kind <> 'current'
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'current organization slug target is immutable';
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
  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  -- Staff principal context currently does not carry a DB-verifiable staff actor id. This
  -- patient-behaviour telemetry therefore accepts only an exact signed patient identity.
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

  INSERT INTO public.media_playback_stats_hourly
    (bucket_hour, delivery, resolved_count, fallback_count)
  VALUES
    (date_trunc('hour', clock_timestamp()), p_delivery, 1, CASE WHEN p_fallback_used THEN 1 ELSE 0 END)
  ON CONFLICT (bucket_hour, delivery) DO UPDATE
    SET resolved_count = public.media_playback_stats_hourly.resolved_count + 1,
        fallback_count = public.media_playback_stats_hourly.fallback_count
          + CASE WHEN EXCLUDED.fallback_count > 0 THEN 1 ELSE 0 END;
END
$$;


--
-- Name: install_signed_context(text, integer, bigint, uuid, uuid, bigint, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.install_signed_context(p_nonce text, p_backend_pid integer, p_expires_epoch bigint, p_org_id uuid, p_patient_user_id uuid, p_integrator_user_id bigint, p_signature_hex text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'app', 'app_ext', 'pg_catalog'
    AS $_$
DECLARE
  v_secret text;
  v_canonical text;
  v_expected text;
  v_now_epoch bigint;
BEGIN
  IF p_nonce IS NULL OR p_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$' THEN
    RAISE EXCEPTION 'invalid_nonce';
  END IF;

  IF p_backend_pid <> pg_backend_pid() THEN
    RAISE EXCEPTION 'wrong_backend';
  END IF;

  v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF p_expires_epoch <= v_now_epoch THEN
    RAISE EXCEPTION 'expired_context';
  END IF;
  IF p_expires_epoch > v_now_epoch + 300 THEN
    RAISE EXCEPTION 'context_ttl_too_long';
  END IF;

  IF p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'bad_signature';
  END IF;

  SELECT secret INTO STRICT v_secret
  FROM app.context_signing_secrets
  WHERE id = true;

  v_canonical := concat_ws(
    '|',
    'v1',
    p_nonce,
    p_backend_pid::text,
    p_expires_epoch::text,
    COALESCE(p_org_id::text, ''),
    COALESCE(p_patient_user_id::text, ''),
    COALESCE(p_integrator_user_id::text, '')
  );
  v_expected := encode(app_ext.hmac(v_canonical, v_secret, 'sha256'), 'hex');

  IF lower(p_signature_hex) IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'bad_signature';
  END IF;

  BEGIN
    INSERT INTO app.context_nonce_ledger (nonce, backend_pid, expires_epoch)
    VALUES (p_nonce, p_backend_pid, p_expires_epoch);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'replayed_context_signature';
  END;

  INSERT INTO app.principal_context (
    backend_pid,
    org_id,
    patient_user_id,
    integrator_user_id,
    nonce,
    expires_epoch
  )
  VALUES (
    p_backend_pid,
    p_org_id,
    p_patient_user_id,
    p_integrator_user_id,
    p_nonce,
    p_expires_epoch
  )
  ON CONFLICT (backend_pid) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    patient_user_id = EXCLUDED.patient_user_id,
    integrator_user_id = EXCLUDED.integrator_user_id,
    nonce = EXCLUDED.nonce,
    expires_epoch = EXCLUDED.expires_epoch,
    installed_at = clock_timestamp();
END;
$_$;


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
-- Name: is_staff(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_staff() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT current_user = 'app_staff'
    OR pg_has_role(current_user, 'app_staff', 'member')
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
    AS $$
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
BEGIN
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

    IF FOUND
      AND v_intent.provisioned_organization_id IS NOT NULL
      AND v_intent.provisioned_membership_id IS NOT NULL THEN
      RETURN QUERY SELECT
        true,
        NULL::text,
        v_intent.provisioned_organization_id,
        v_intent.provisioned_specialist_id,
        v_intent.provisioned_membership_id;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'specialist_signup_intent_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

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

  -- Same SECURITY DEFINER transaction: the new organization is not observable without its own
  -- independent catalog snapshot. The helper only inserts the current repo-managed baseline.
  PERFORM app.seed_reference_catalog_snapshot(v_organization_id);

  UPDATE public.specialist_signup_intents AS i
  SET status = 'provisioned',
      provisioned_organization_id = v_organization_id,
      provisioned_membership_id = v_membership_id,
      provisioned_specialist_id = NULL,
      provisioned_at = now()
  WHERE i.id = v_intent.id;

  RETURN QUERY SELECT true, NULL::text, v_organization_id, NULL::uuid, v_membership_id;
END
$$;


--
-- Name: read_curated_playback_health(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_playback_health() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    AS $$
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
    AS $_$
WITH base AS MATERIALIZED (
  SELECT app.read_curated_system_health_pre_0203() AS value
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
          WHEN diagnostic.reason ~ '^provider_[a-z0-9_]{1,64}$'
            THEN diagnostic.reason
          ELSE NULL
        END,
        'lastErrorMessage', CASE
          WHEN diagnostic.error_message ~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$'
            THEN diagnostic.error_message
          ELSE NULL
        END
      )
  ) AS value
  FROM base
  CROSS JOIN (VALUES ('telegram'), ('max'), ('web_push'), ('email')) AS channels(channel)
  LEFT JOIN LATERAL (
    SELECT
      attempt.provider_status_code,
      attempt.reason,
      attempt.error_message
    FROM public.notification_delivery_attempts AS attempt
    WHERE attempt.channel = channels.channel
      AND attempt.status IN ('failed', 'skipped')
      AND attempt.created_at >= now() - interval '24 hours'
    ORDER BY attempt.created_at DESC
    LIMIT 1
  ) AS diagnostic ON true
  GROUP BY base.value
)
SELECT jsonb_set(
  base.value,
  ARRAY['notificationDelivery', 'byChannel'],
  channel_diagnostics.value,
  false
)
FROM base, channel_diagnostics
$_$;


--
-- Name: read_curated_system_health_pre_0196(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_system_health_pre_0196() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
      'lastStatus', last_status,
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
-- Name: read_curated_system_health_pre_0203(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_curated_system_health_pre_0203() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
)
SELECT app.read_curated_system_health_pre_0196()
  || jsonb_build_object(
    'mediaPreview', media_preview.value,
    'videoPlaybackClient', playback_client.value
  )
FROM media_preview, playback_client
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


SET default_tablespace = '';

SET default_table_access_method = heap;

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
    rubitime_id text,
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
    rubitime_branch_id_snapshot text,
    rubitime_cooperator_id_snapshot text,
    rubitime_service_id_snapshot text,
    source text DEFAULT 'native'::text NOT NULL,
    compat_quality text,
    provenance_created_by text,
    provenance_updated_by text,
    rubitime_manage_url text,
    canonical_appointment_id uuid,
    CONSTRAINT patient_bookings_booking_type_check CHECK ((booking_type = ANY (ARRAY['in_person'::text, 'online'::text]))),
    CONSTRAINT patient_bookings_category_check CHECK ((category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text]))),
    CONSTRAINT patient_bookings_check CHECK ((slot_end > slot_start)),
    CONSTRAINT patient_bookings_compat_quality_check CHECK ((compat_quality = ANY (ARRAY['full'::text, 'partial'::text, 'minimal'::text]))),
    CONSTRAINT patient_bookings_platform_user_native_required CHECK (((source <> 'native'::text) OR (platform_user_id IS NOT NULL))),
    CONSTRAINT patient_bookings_source_check CHECK ((source = ANY (ARRAY['native'::text, 'rubitime_projection'::text]))),
    CONSTRAINT patient_bookings_status_check CHECK ((status = ANY (ARRAY['creating'::text, 'awaiting_payment'::text, 'confirmed'::text, 'cancelling'::text, 'cancel_failed'::text, 'cancelled'::text, 'rescheduled'::text, 'completed'::text, 'no_show'::text, 'failed_sync'::text])))
);


--
-- Name: read_current_patient_booking_rows(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_booking_rows() RETURNS SETOF public.patient_bookings
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
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
  SELECT booking.*
  FROM public.patient_bookings AS booking
  WHERE booking.platform_user_id = v_patient_user_id;
END
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
      AND EXISTS (
        SELECT 1 FROM public.be_appointments appointment
        WHERE appointment.id = row.canonical_appointment_id
          AND appointment.organization_id = v_org
          AND appointment.platform_user_id = v_patient
          AND appointment.deleted_at IS NULL
      )
  ), selected AS (
    SELECT row.*
    FROM scoped row
    WHERE (
      p_kind = 'upcoming'
      AND row.cancelled_at IS NULL
      AND row.status IN ('creating','awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
      AND row.slot_start >= p_now
      AND NOT (row.status = 'creating' AND row.rubitime_id IS NULL AND row.canonical_appointment_id IS NULL)
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
  )
  SELECT jsonb_build_object(
    'id', row.id, 'platform_user_id', row.platform_user_id, 'booking_type', row.booking_type,
    'city', row.city, 'category', row.category, 'slot_start', row.slot_start, 'slot_end', row.slot_end,
    'status', row.status, 'cancelled_at', row.cancelled_at, 'cancel_reason', row.cancel_reason,
    'rubitime_id', row.rubitime_id, 'gcal_event_id', row.gcal_event_id,
    'contact_phone', row.contact_phone, 'contact_email', row.contact_email, 'contact_name', row.contact_name,
    'reminder_24h_sent', row.reminder_24h_sent, 'reminder_2h_sent', row.reminder_2h_sent,
    'created_at', row.created_at, 'updated_at', row.updated_at,
    'branch_id', row.branch_id, 'service_id', row.service_id, 'branch_service_id', row.branch_service_id,
    'city_code_snapshot', row.city_code_snapshot, 'branch_title_snapshot', row.branch_title_snapshot,
    'service_title_snapshot', row.service_title_snapshot, 'duration_minutes_snapshot', row.duration_minutes_snapshot,
    'price_minor_snapshot', row.price_minor_snapshot, 'rubitime_branch_id_snapshot', row.rubitime_branch_id_snapshot,
    'rubitime_cooperator_id_snapshot', row.rubitime_cooperator_id_snapshot,
    'rubitime_service_id_snapshot', row.rubitime_service_id_snapshot, 'source', row.source,
    'compat_quality', row.compat_quality, 'provenance_created_by', row.provenance_created_by,
    'provenance_updated_by', row.provenance_updated_by, 'rubitime_manage_url', row.rubitime_manage_url,
    'canonical_appointment_id', row.canonical_appointment_id
  )
  FROM selected row;
END
$$;


--
-- Name: read_current_patient_organization_entitlements(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_current_patient_organization_entitlements() RETURNS TABLE(tariff_mechanics jsonb, included_seats integer, override_mechanic text, override_enabled boolean, seat_limit_override integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tariff.mechanics,
    tariff.included_seats,
    entitlement_override.mechanic,
    entitlement_override.enabled,
    entitlement_override.seat_limit_override
  FROM public.org_enrollments AS enrollment
  INNER JOIN public.be_organizations AS organization
    ON organization.id = enrollment.organization_id
   AND organization.is_active = true
  LEFT JOIN public.saas_tariffs AS tariff
    ON tariff.id = organization.tariff_id
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = organization.id
  WHERE enrollment.organization_id = v_organization_id
    AND enrollment.platform_user_id = v_patient_user_id
    AND enrollment.status = 'active'
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
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL OR p_scope <> 'admin' THEN
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
  SELECT setting.key, setting.scope, setting.organization_id, setting.value_json,
         setting.updated_at, setting.updated_by
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (setting.organization_id = v_organization_id OR setting.organization_id IS NULL)
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
    AS $$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$$;


--
-- Name: read_public_runtime_setting(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text) RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND setting.organization_id IS NULL
    AND setting.audience = 'public'
  LIMIT 1
$$;


--
-- Name: read_webapp_server_runtime_setting(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text) RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND setting.organization_id IS NULL
    AND setting.audience = 'server'
    AND setting.key IN (
      'debug_forward_to_admin', 'video_presign_ttl_seconds',
      'admin_telegram_ids', 'admin_max_ids', 'admin_phones',
      'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones'
    )
  LIMIT 1
$$;


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
-- Name: release_principal_context(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.release_principal_context() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'app', 'pg_catalog'
    AS $$
  DELETE FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
$$;


--
-- Name: replace_pending_specialist_signup_challenge(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.replace_pending_specialist_signup_challenge(p_challenge_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
	UPDATE public.specialist_signup_intents
	SET challenge_id = p_challenge_id
	WHERE user_id = app.require_staff_security_self_user_id() AND status = 'pending';
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
  IF p_event_class NOT IN (
    'missing_principal','invalid_signature_or_install','role_pool_mismatch',
    'rls_denial','cleanup_failure','unclassified_background_operation'
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_event_class' USING ERRCODE = '22023'; END IF;
  IF (p_source_service, p_source_operation) NOT IN (
    ('webapp','webapp_db_request'), ('webapp','webapp_admin_system_health'),
    ('webapp','public_auth_config'), ('webapp','auth_role_config'),
    ('webapp','patient_runtime_config'), ('webapp','public_booking_config'),
    ('webapp','patient_identity_exception_check'), ('webapp','patient_booking_history'),
    ('webapp','patient_product_analytics'), ('webapp','patient_ui_config'),
    ('webapp','patient_calendar_timezone'), ('webapp','patient_content_catalog'),
    ('webapp','patient_diary'),
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
-- Name: require_staff_security_self_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.require_staff_security_self_user_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
	v_user_id uuid;
BEGIN
	v_user_id := app.current_patient_user_id();
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'staff_security_self_principal_required';
	END IF;
	RETURN v_user_id;
END
$$;


--
-- Name: reset_principal_context(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reset_principal_context() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'app', 'pg_catalog'
    AS $$
  DELETE FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
$$;


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
-- Name: resolve_public_booking_organization(uuid, uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_public_booking_organization(p_branch_id uuid, p_service_id uuid, p_branch_service_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_organization_ids uuid[];
BEGIN
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
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT resolved.organization_id
  FROM app.resolve_public_organization_slug(p_slug) AS resolved
  LIMIT 1
$$;


--
-- Name: resolve_public_organization_slug(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.resolve_public_organization_slug(p_slug text) RETURNS TABLE(organization_id uuid, requested_slug text, requested_kind text, canonical_slug text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT
    requested.organization_id,
    requested.slug,
    requested.kind,
    current_claim.slug
  FROM public.organization_slug_claims AS requested
  INNER JOIN public.organization_slug_claims AS current_claim
    ON current_claim.organization_id = requested.organization_id
    AND current_claim.kind = 'current'
  INNER JOIN public.clinic_public_directory_entries AS directory
    ON directory.organization_id = requested.organization_id
    AND directory.is_published = true
  INNER JOIN public.be_organizations AS organization
    ON organization.id = requested.organization_id
    AND organization.is_active = true
  WHERE requested.slug = lower(btrim(p_slug))
    AND requested.kind IN ('current', 'alias')
  LIMIT 1
$$;


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


--
-- Name: save_pending_staff_totp(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.save_pending_staff_totp(p_secret_ciphertext text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
-- Name: staff_user_has_password_credentials(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.staff_user_has_password_credentials(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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
    AS $$
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
-- Name: stage13_prevent_write_mailing_topics(); Type: FUNCTION; Schema: integrator; Owner: -
--

CREATE FUNCTION integrator.stage13_prevent_write_mailing_topics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.stage13_bypass', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'mailing_topics is frozen (Stage 13): use webapp projection only';
END;
$$;


--
-- Name: stage13_prevent_write_user_subscriptions(); Type: FUNCTION; Schema: integrator; Owner: -
--

CREATE FUNCTION integrator.stage13_prevent_write_user_subscriptions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.stage13_bypass', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'user_subscriptions is frozen (Stage 13): use webapp projection only';
END;
$$;


--
-- Name: audit_app_runtime_settings_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_app_runtime_settings_change() RETURNS trigger
    LANGUAGE plpgsql
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
END;
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
BEGIN
  IF NEW.key = 'patient_booking_url' AND NEW.scope = 'admin' THEN
    IF NEW.organization_id IS NULL THEN
      DELETE FROM public.app_runtime_settings
      WHERE key = NEW.key AND scope = NEW.scope AND organization_id IS NULL;
    ELSE
      INSERT INTO public.app_runtime_settings
        (key, scope, organization_id, audience, value_json, updated_at, updated_by)
      VALUES (
        NEW.key, NEW.scope, NEW.organization_id, 'authenticated_client',
        NEW.value_json, NEW.updated_at, NEW.updated_by
      )
      ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
      DO UPDATE SET
        audience = EXCLUDED.audience,
        value_json = EXCLUDED.value_json,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.scope = 'admin' AND NEW.key IN (
    'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
    'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
    'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
    'apple_oauth_key_id', 'apple_oauth_private_key'
  ) THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    SELECT provider.key, 'admin', NULL, 'public', jsonb_build_object('value', provider.enabled), now(), NEW.updated_by
    FROM (VALUES
      ('oauth_yandex_enabled', (
        SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri')
      )),
      ('oauth_google_enabled', (
        SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri')
      )),
      ('oauth_apple_enabled', (
        SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
                      'apple_oauth_key_id', 'apple_oauth_private_key')
      ))
    ) AS provider(key, enabled)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.key = 'sms_fallback_enabled' AND NEW.scope IN ('doctor', 'admin') THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (
      'public_sms_fallback_enabled', 'admin', NULL, 'public',
      jsonb_build_object('value', COALESCE((
        SELECT CASE lower(value_json->>'value')
          WHEN 'true' THEN true WHEN '1' THEN true WHEN 'false' THEN false WHEN '0' THEN false ELSE NULL END
        FROM public.system_settings
        WHERE key = 'sms_fallback_enabled' AND organization_id IS NULL AND scope IN ('doctor', 'admin')
        ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END LIMIT 1
      ), false)),
      NEW.updated_at, NEW.updated_by
    )
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
-- Name: context_nonce_ledger; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.context_nonce_ledger (
    nonce text NOT NULL,
    backend_pid integer NOT NULL,
    accepted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_epoch bigint NOT NULL
);


--
-- Name: context_signing_secrets; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.context_signing_secrets (
    id boolean DEFAULT true NOT NULL,
    secret text NOT NULL,
    CONSTRAINT context_signing_secrets_id_check CHECK (id),
    CONSTRAINT context_signing_secrets_secret_check CHECK ((length(secret) >= 32))
);


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


--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


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
-- Name: booking_calendar_map; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.booking_calendar_map (
    id bigint NOT NULL,
    rubitime_record_id text NOT NULL,
    gcal_event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.booking_calendar_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.booking_calendar_map_id_seq OWNED BY integrator.booking_calendar_map.id;


--
-- Name: contacts; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.contacts (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    type text NOT NULL,
    value_normalized text NOT NULL,
    label text,
    is_primary boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: contacts_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.contacts_id_seq OWNED BY integrator.contacts.id;


--
-- Name: content_access_grants; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.content_access_grants (
    id text NOT NULL,
    user_id bigint NOT NULL,
    content_id text NOT NULL,
    purpose text NOT NULL,
    token_hash text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: conversation_messages; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.conversation_messages (
    id text NOT NULL,
    conversation_id text NOT NULL,
    sender_role text NOT NULL,
    text text NOT NULL,
    source text NOT NULL,
    external_chat_id text,
    external_message_id text,
    created_at timestamp with time zone NOT NULL,
    organization_id uuid NOT NULL,
    CONSTRAINT conversation_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.conversations (
    id text NOT NULL,
    source text NOT NULL,
    user_identity_id bigint NOT NULL,
    admin_scope text NOT NULL,
    status text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    last_message_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    organization_id uuid NOT NULL,
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'waiting_admin'::text, 'waiting_user'::text, 'closed'::text])))
);


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
    CONSTRAINT delivery_attempt_logs_attempt_check CHECK ((attempt > 0)),
    CONSTRAINT delivery_attempt_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);


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


--
-- Name: identities; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.identities (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    resource text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identities_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.identities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identities_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.identities_id_seq OWNED BY integrator.identities.id;


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
-- Name: mailing_logs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.mailing_logs (
    user_id bigint NOT NULL,
    mailing_id bigint NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    error text,
    organization_id uuid NOT NULL
);


--
-- Name: mailing_topics; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.mailing_topics (
    id bigint NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mailings; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.mailings (
    id bigint NOT NULL,
    topic_id bigint NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: mailings_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.mailings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mailings_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.mailings_id_seq OWNED BY integrator.mailings.id;


--
-- Name: message_drafts; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.message_drafts (
    id text NOT NULL,
    identity_id bigint NOT NULL,
    source text NOT NULL,
    external_chat_id text,
    external_message_id text,
    draft_text_current text NOT NULL,
    state text DEFAULT 'pending_confirmation'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL,
    CONSTRAINT message_drafts_state_check CHECK ((state = 'pending_confirmation'::text))
);


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
-- Name: question_messages; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.question_messages (
    id text NOT NULL,
    question_id text NOT NULL,
    sender_type text NOT NULL,
    message_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: rubitime_api_throttle; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_api_throttle (
    id smallint NOT NULL,
    last_completed_at timestamp with time zone DEFAULT '1970-01-01 01:00:00+01'::timestamp with time zone NOT NULL,
    CONSTRAINT rubitime_api_throttle_id_check CHECK ((id = 1))
);


--
-- Name: rubitime_booking_profiles; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_booking_profiles (
    id bigint NOT NULL,
    booking_type text NOT NULL,
    category_code text NOT NULL,
    city_code text,
    branch_id bigint NOT NULL,
    service_id bigint NOT NULL,
    cooperator_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rubitime_booking_profiles_booking_type_check CHECK ((booking_type = ANY (ARRAY['online'::text, 'in_person'::text])))
);


--
-- Name: rubitime_booking_profiles_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_booking_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_booking_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_booking_profiles_id_seq OWNED BY integrator.rubitime_booking_profiles.id;


--
-- Name: rubitime_branches; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_branches (
    id bigint NOT NULL,
    rubitime_branch_id integer NOT NULL,
    city_code text NOT NULL,
    title text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL
);


--
-- Name: rubitime_branches_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_branches_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_branches_id_seq OWNED BY integrator.rubitime_branches.id;


--
-- Name: rubitime_cooperators; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_cooperators (
    id bigint NOT NULL,
    rubitime_cooperator_id integer NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_cooperators_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_cooperators_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_cooperators_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_cooperators_id_seq OWNED BY integrator.rubitime_cooperators.id;


--
-- Name: rubitime_create_retry_jobs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_create_retry_jobs (
    id bigint NOT NULL,
    phone_normalized text,
    message_text text,
    next_try_at timestamp with time zone NOT NULL,
    attempts_done integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 2 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'message.deliver'::text NOT NULL,
    payload_json jsonb
);


--
-- Name: rubitime_create_retry_jobs_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_create_retry_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_create_retry_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_create_retry_jobs_id_seq OWNED BY integrator.rubitime_create_retry_jobs.id;


--
-- Name: rubitime_events; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_events (
    id bigint NOT NULL,
    rubitime_record_id text,
    event text NOT NULL,
    payload_json jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_events_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_events_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_events_id_seq OWNED BY integrator.rubitime_events.id;


--
-- Name: rubitime_records; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_records (
    id bigint NOT NULL,
    rubitime_record_id text NOT NULL,
    phone_normalized text,
    record_at timestamp with time zone,
    status text NOT NULL,
    payload_json jsonb NOT NULL,
    last_event text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gcal_event_id text,
    CONSTRAINT rubitime_records_status_check CHECK ((status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])))
);


--
-- Name: rubitime_records_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_records_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_records_id_seq OWNED BY integrator.rubitime_records.id;


--
-- Name: rubitime_services; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_services (
    id bigint NOT NULL,
    rubitime_service_id integer NOT NULL,
    title text NOT NULL,
    category_code text NOT NULL,
    duration_minutes integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rubitime_services_duration_minutes_check CHECK ((duration_minutes > 0))
);


--
-- Name: rubitime_services_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_services_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_services_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_services_id_seq OWNED BY integrator.rubitime_services.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.subscriptions_id_seq OWNED BY integrator.mailing_topics.id;


--
-- Name: system_settings; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.system_settings (
    key text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    organization_id uuid,
    CONSTRAINT system_settings_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])))
);


--
-- Name: telegram_state; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.telegram_state (
    identity_id bigint NOT NULL,
    username text,
    first_name text,
    last_name text,
    state text,
    notify_spb boolean DEFAULT false NOT NULL,
    notify_msk boolean DEFAULT false NOT NULL,
    notify_online boolean DEFAULT false NOT NULL,
    last_update_id bigint,
    last_start_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_bookings boolean DEFAULT false NOT NULL
);


--
-- Name: telegram_users; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.telegram_users (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    username text,
    first_name text,
    last_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    updated_at timestamp with time zone DEFAULT now(),
    state text,
    notify_spb boolean DEFAULT false NOT NULL,
    notify_msk boolean DEFAULT false NOT NULL,
    notify_online boolean DEFAULT false NOT NULL,
    last_update_id bigint,
    last_start_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: telegram_users_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.telegram_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_users_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.telegram_users_id_seq OWNED BY integrator.telegram_users.id;


--
-- Name: user_questions; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_questions (
    id text NOT NULL,
    user_identity_id bigint NOT NULL,
    conversation_id text,
    telegram_message_id text,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered boolean DEFAULT false NOT NULL,
    answered_at timestamp with time zone,
    organization_id uuid NOT NULL
);


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
    organization_id uuid NOT NULL
);


--
-- Name: user_reminder_rules; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_reminder_rules (
    id text NOT NULL,
    user_id bigint NOT NULL,
    category text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    schedule_type text DEFAULT 'interval_window'::text NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL,
    interval_minutes integer NOT NULL,
    window_start_minute integer NOT NULL,
    window_end_minute integer NOT NULL,
    days_mask text DEFAULT '1111111'::text NOT NULL,
    content_mode text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_object_type text,
    linked_object_id text,
    custom_title text,
    custom_text text,
    deep_link text,
    schedule_data jsonb,
    reminder_intent text DEFAULT 'generic'::text,
    quiet_hours_start_minute integer,
    quiet_hours_end_minute integer,
    notification_topic_code text,
    organization_id uuid NOT NULL
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_subscriptions (
    user_id bigint NOT NULL,
    topic_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.users (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merged_into_user_id bigint,
    CONSTRAINT users_merged_into_user_id_not_self_check CHECK (((merged_into_user_id IS NULL) OR (merged_into_user_id <> id)))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.users_id_seq OWNED BY integrator.users.id;


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


--
-- Name: appointment_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_record_id text NOT NULL,
    phone_normalized text,
    record_at timestamp with time zone,
    status text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_event text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    deleted_at timestamp with time zone,
    platform_user_id uuid,
    CONSTRAINT appointment_records_status_check CHECK ((status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])))
);


--
-- Name: auth_rate_limit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limit_events (
    scope text NOT NULL,
    key text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: be_appointment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    CONSTRAINT be_appointments_source_check CHECK ((source = ANY (ARRAY['native'::text, 'rubitime_projection'::text, 'admin_manual'::text, 'public_widget'::text]))),
    CONSTRAINT be_appointments_status_check CHECK ((status = ANY (ARRAY['created'::text, 'awaiting_payment'::text, 'paid'::text, 'confirmed'::text, 'rescheduled'::text, 'cancelled_by_patient'::text, 'cancelled_by_specialist'::text, 'late_cancellation'::text, 'no_show'::text, 'completed'::text, 'visit_confirmed'::text, 'charged_to_package'::text, 'manual_review_required'::text]))),
    CONSTRAINT be_appointments_time_check CHECK ((end_at > start_at))
);


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
    CONSTRAINT be_organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'doctor'::text, 'assistant'::text]))),
    CONSTRAINT be_organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'disabled'::text])))
);


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
    tariff_id uuid
);


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
    CONSTRAINT be_payment_intents_amount_check CHECK ((amount_minor >= 0))
);


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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: be_product_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_product_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_purchase_id uuid NOT NULL,
    event_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_product_pay_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_product_pay_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone,
    max_uses integer,
    use_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_product_pay_links_use_count_check CHECK ((use_count >= 0))
);


--
-- Name: be_product_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_product_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_type text NOT NULL,
    platform_user_id uuid,
    buyer_phone_normalized text,
    gift_recipient_phone_normalized text,
    status text DEFAULT 'offered'::text NOT NULL,
    title text NOT NULL,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    validity_days integer,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    fulfillment_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    payment_intent_id uuid,
    payment_ref text,
    pay_link_id uuid,
    assigned_by_platform_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_product_purchases_price_check CHECK ((price_minor >= 0)),
    CONSTRAINT be_product_purchases_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'awaiting_payment'::text, 'active'::text, 'used'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: be_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_type text NOT NULL,
    title text NOT NULL,
    description text,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    composition_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    access_rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    payment_rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    validity_days integer,
    course_id uuid,
    subscription_package_id uuid,
    show_in_patient_catalog boolean DEFAULT true NOT NULL,
    pay_by_link_enabled boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_products_price_check CHECK ((price_minor >= 0)),
    CONSTRAINT be_products_type_check CHECK ((product_type = ANY (ARRAY['single_visit'::text, 'membership'::text, 'gift_certificate'::text, 'promo'::text, 'course'::text, 'subscription'::text, 'content_access'::text, 'individual_offer'::text])))
);


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
    duration_minutes_override integer,
    price_minor_override integer,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: booking_branch_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_branch_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    service_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    rubitime_service_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city_id uuid NOT NULL,
    title text NOT NULL,
    address text,
    rubitime_branch_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL
);


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


--
-- Name: booking_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price_minor integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    break_after_minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT booking_services_break_after_check CHECK (((break_after_minutes >= 0) AND ((break_after_minutes % 5) = 0)))
);


--
-- Name: booking_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_specialists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    full_name text NOT NULL,
    description text,
    rubitime_cooperator_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_branch_id bigint NOT NULL,
    name text,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL
);


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


--
-- Name: broadcast_audit_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_audit_recipients (
    audit_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    organization_id uuid
);


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


--
-- Name: clinical_test_measure_kinds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_test_measure_kinds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clinical_test_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_test_regions (
    clinical_test_id uuid NOT NULL,
    body_region_id uuid NOT NULL,
    organization_id uuid
);


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
    appointment_record_id uuid,
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_send_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_cooldowns (
    user_id uuid NOT NULL,
    email_normalized text NOT NULL,
    last_sent_at timestamp with time zone NOT NULL
);


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


--
-- Name: integration_webhook_error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_webhook_error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    error_class text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: mailing_logs_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailing_logs_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_user_id bigint NOT NULL,
    integrator_mailing_id bigint NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    error_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);


--
-- Name: mailing_topics_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailing_topics_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_topic_id bigint NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: media_playback_stats_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_stats_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    delivery text NOT NULL,
    resolved_count integer DEFAULT 0 NOT NULL,
    fallback_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT media_playback_stats_hourly_delivery_check CHECK ((delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))
);


--
-- Name: media_playback_user_video_first_resolve; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_user_video_first_resolve (
    user_id uuid NOT NULL,
    media_id uuid NOT NULL,
    first_resolved_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);


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
    CONSTRAINT online_intake_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_review'::text, 'contacted'::text, 'closed'::text]))),
    CONSTRAINT online_intake_requests_type_check CHECK ((type = ANY (ARRAY['lfk'::text, 'nutrition'::text])))
);


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


--
-- Name: operator_health_alert_sent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_health_alert_sent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedup_key text NOT NULL,
    severity text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    alert_sent_at timestamp with time zone
);


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
    CONSTRAINT organization_slug_rename_events_slug_change_check CHECK ((previous_slug <> next_slug))
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
    CONSTRAINT outgoing_delivery_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed_retryable'::text, 'dead'::text])))
);


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


--
-- Name: phone_otp_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_otp_locks (
    phone_normalized text NOT NULL,
    locked_until bigint NOT NULL
);


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
    CONSTRAINT platform_users_no_self_merge CHECK (((merged_into_id IS NULL) OR (merged_into_id <> id))),
    CONSTRAINT platform_users_role_check CHECK ((role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text])))
);


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


--
-- Name: program_item_discussion_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_item_discussion_reads (
    patient_user_id uuid NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);


--
-- Name: recommendation_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_regions (
    recommendation_id uuid NOT NULL,
    body_region_id uuid NOT NULL,
    organization_id uuid
);


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


--
-- Name: reference_catalog_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_catalog_baselines (
    version integer NOT NULL,
    definition_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reference_catalog_baselines_definition_object_check CHECK ((jsonb_typeof(definition_json) = 'object'::text))
);


--
-- Name: reference_catalog_snapshot_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_catalog_snapshot_receipts (
    organization_id uuid NOT NULL,
    baseline_version integer NOT NULL,
    seeded_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: reminder_occurrence_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_occurrence_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_occurrence_id text NOT NULL,
    integrator_rule_id text NOT NULL,
    integrator_user_id bigint NOT NULL,
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
    CONSTRAINT chk_reminder_occurrence_skip_reason_len CHECK (((skip_reason IS NULL) OR (length(skip_reason) <= 500))),
    CONSTRAINT chk_reminder_occurrence_snooze_pair CHECK ((((snoozed_at IS NULL) AND (snoozed_until IS NULL)) OR ((snoozed_at IS NOT NULL) AND (snoozed_until IS NOT NULL)))),
    CONSTRAINT reminder_occurrence_history_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);


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
    CONSTRAINT saas_isolation_coverage_runs_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'incomplete'::text, 'failed'::text]))),
    CONSTRAINT saas_isolation_coverage_runs_time_check CHECK ((finished_at >= started_at)),
    CONSTRAINT saas_isolation_coverage_runs_unexpected_count_check CHECK ((unexpected_errors_count >= 0))
);


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
    CONSTRAINT saas_isolation_events_source_operation_check CHECK ((((((((((((((((((((((((((((source_service = 'webapp'::text) AND (source_operation = 'webapp_db_request'::text)) OR ((source_service = 'webapp'::text) AND (source_operation = 'webapp_admin_system_health'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'public_auth_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'auth_role_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_runtime_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'public_booking_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_identity_exception_check'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_booking_history'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_product_analytics'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_ui_config'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_calendar_timezone'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_content_catalog'::text))) OR ((source_service = 'webapp'::text) AND (source_operation = 'patient_diary'::text))) OR ((source_service = 'integrator'::text) AND (source_operation = 'integrator_http_request'::text))) OR ((source_service = 'integrator'::text) AND (source_operation = 'integrator_projection'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_queue_drain'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_projection_delivery'::text))) OR ((source_service = 'worker'::text) AND (source_operation = 'worker_outgoing_delivery'::text))) OR ((source_service = 'scheduler'::text) AND (source_operation = 'scheduler_lock'::text))) OR ((source_service = 'scheduler'::text) AND (source_operation = 'scheduler_dispatch_tick'::text))) OR ((source_service = 'media_worker'::text) AND (source_operation = 'media_transcode_tick'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_health'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_media'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_analytics'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_reminders'::text))) OR ((source_service = 'cron'::text) AND (source_operation = 'cron_specialist_tasks'::text))))
);


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
    CONSTRAINT saas_org_entitlement_overrides_seat_limit_nonnegative_check CHECK (((seat_limit_override IS NULL) OR (seat_limit_override >= 0)))
);

ALTER TABLE ONLY public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;


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
    CONSTRAINT saas_tariffs_included_seats_nonnegative_check CHECK (((included_seats IS NULL) OR (included_seats >= 0)))
);

ALTER TABLE ONLY public.saas_tariffs FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    CONSTRAINT specialist_signup_intents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'provisioned'::text])))
);


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
    organization_id uuid
);


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
    CONSTRAINT user_channel_bindings_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])))
);


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


--
-- Name: user_email_setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_email_setup_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_normalized text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    source text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_email_setup_tokens_source_check CHECK ((source = ANY (ARRAY['rubitime'::text, 'doctor_profile'::text, 'manual_resend'::text, 'registration_claim'::text])))
);


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


--
-- Name: user_notification_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_topics (
    user_id uuid NOT NULL,
    topic_code text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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


--
-- Name: user_password_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_password_credentials (
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    algo text DEFAULT 'argon2id'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    CONSTRAINT user_phone_history_source_check CHECK ((source = ANY (ARRAY['otp'::text, 'messenger'::text, 'merge'::text, 'admin'::text, 'projection'::text])))
);


--
-- Name: user_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pins (
    user_id uuid NOT NULL,
    pin_hash text NOT NULL,
    attempts_failed smallint DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_subscriptions_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_user_id bigint NOT NULL,
    integrator_topic_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);


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


--
-- Name: webapp_reminder_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webapp_reminder_occurrences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_rule_id text NOT NULL,
    platform_user_id uuid NOT NULL,
    occurrence_key text NOT NULL,
    planned_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid
);


--
-- Name: webapp_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webapp_schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: booking_calendar_map id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.booking_calendar_map ALTER COLUMN id SET DEFAULT nextval('integrator.booking_calendar_map_id_seq'::regclass);


--
-- Name: contacts id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts ALTER COLUMN id SET DEFAULT nextval('integrator.contacts_id_seq'::regclass);


--
-- Name: delivery_attempt_logs id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.delivery_attempt_logs ALTER COLUMN id SET DEFAULT nextval('integrator.delivery_attempt_logs_id_seq'::regclass);


--
-- Name: identities id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities ALTER COLUMN id SET DEFAULT nextval('integrator.identities_id_seq'::regclass);


--
-- Name: integration_data_quality_incidents id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents ALTER COLUMN id SET DEFAULT nextval('integrator.integration_data_quality_incidents_id_seq'::regclass);


--
-- Name: mailing_topics id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_topics ALTER COLUMN id SET DEFAULT nextval('integrator.subscriptions_id_seq'::regclass);


--
-- Name: mailings id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings ALTER COLUMN id SET DEFAULT nextval('integrator.mailings_id_seq'::regclass);


--
-- Name: projection_outbox id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.projection_outbox ALTER COLUMN id SET DEFAULT nextval('integrator.projection_outbox_id_seq'::regclass);


--
-- Name: rubitime_booking_profiles id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_booking_profiles_id_seq'::regclass);


--
-- Name: rubitime_branches id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_branches ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_branches_id_seq'::regclass);


--
-- Name: rubitime_cooperators id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_cooperators ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_cooperators_id_seq'::regclass);


--
-- Name: rubitime_create_retry_jobs id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_create_retry_jobs ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_create_retry_jobs_id_seq'::regclass);


--
-- Name: rubitime_events id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_events ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_events_id_seq'::regclass);


--
-- Name: rubitime_records id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_records ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_records_id_seq'::regclass);


--
-- Name: rubitime_services id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_services ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_services_id_seq'::regclass);


--
-- Name: telegram_users id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_users ALTER COLUMN id SET DEFAULT nextval('integrator.telegram_users_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.users ALTER COLUMN id SET DEFAULT nextval('integrator.users_id_seq'::regclass);


--
-- Name: be_patient_packages display_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages ALTER COLUMN display_number SET DEFAULT nextval('public.be_patient_packages_display_number_seq'::regclass);


--
-- Name: integrator_push_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox ALTER COLUMN id SET DEFAULT nextval('public.integrator_push_outbox_id_seq'::regclass);


--
-- Name: context_nonce_ledger context_nonce_ledger_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.context_nonce_ledger
    ADD CONSTRAINT context_nonce_ledger_pkey PRIMARY KEY (nonce);


--
-- Name: context_signing_secrets context_signing_secrets_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.context_signing_secrets
    ADD CONSTRAINT context_signing_secrets_pkey PRIMARY KEY (id);


--
-- Name: principal_context principal_context_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.principal_context
    ADD CONSTRAINT principal_context_pkey PRIMARY KEY (backend_pid);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: booking_calendar_map booking_calendar_map_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.booking_calendar_map
    ADD CONSTRAINT booking_calendar_map_pkey PRIMARY KEY (id);


--
-- Name: booking_calendar_map booking_calendar_map_rubitime_record_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.booking_calendar_map
    ADD CONSTRAINT booking_calendar_map_rubitime_record_id_key UNIQUE (rubitime_record_id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_type_value_normalized_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_type_value_normalized_key UNIQUE (type, value_normalized);


--
-- Name: content_access_grants content_access_grants_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.content_access_grants
    ADD CONSTRAINT content_access_grants_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: delivery_attempt_logs delivery_attempt_logs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.delivery_attempt_logs
    ADD CONSTRAINT delivery_attempt_logs_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_resource_external_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities
    ADD CONSTRAINT identities_resource_external_id_key UNIQUE (resource, external_id);


--
-- Name: integration_data_quality_incidents integration_data_quality_incidents_dedup; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents
    ADD CONSTRAINT integration_data_quality_incidents_dedup UNIQUE (integration, entity, external_id, field, error_reason);


--
-- Name: integration_data_quality_incidents integration_data_quality_incidents_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents
    ADD CONSTRAINT integration_data_quality_incidents_pkey PRIMARY KEY (id);


--
-- Name: mailing_logs mailing_logs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_pkey PRIMARY KEY (user_id, mailing_id);


--
-- Name: mailings mailings_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings
    ADD CONSTRAINT mailings_pkey PRIMARY KEY (id);


--
-- Name: message_drafts message_drafts_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.message_drafts
    ADD CONSTRAINT message_drafts_pkey PRIMARY KEY (id);


--
-- Name: projection_outbox projection_outbox_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.projection_outbox
    ADD CONSTRAINT projection_outbox_pkey PRIMARY KEY (id);


--
-- Name: question_messages question_messages_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.question_messages
    ADD CONSTRAINT question_messages_pkey PRIMARY KEY (id);


--
-- Name: rubitime_api_throttle rubitime_api_throttle_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_api_throttle
    ADD CONSTRAINT rubitime_api_throttle_pkey PRIMARY KEY (id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_pkey PRIMARY KEY (id);


--
-- Name: rubitime_branches rubitime_branches_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_branches
    ADD CONSTRAINT rubitime_branches_pkey PRIMARY KEY (id);


--
-- Name: rubitime_branches rubitime_branches_rubitime_branch_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_branches
    ADD CONSTRAINT rubitime_branches_rubitime_branch_id_key UNIQUE (rubitime_branch_id);


--
-- Name: rubitime_cooperators rubitime_cooperators_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_cooperators
    ADD CONSTRAINT rubitime_cooperators_pkey PRIMARY KEY (id);


--
-- Name: rubitime_cooperators rubitime_cooperators_rubitime_cooperator_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_cooperators
    ADD CONSTRAINT rubitime_cooperators_rubitime_cooperator_id_key UNIQUE (rubitime_cooperator_id);


--
-- Name: rubitime_create_retry_jobs rubitime_create_retry_jobs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_create_retry_jobs
    ADD CONSTRAINT rubitime_create_retry_jobs_pkey PRIMARY KEY (id);


--
-- Name: rubitime_events rubitime_events_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_events
    ADD CONSTRAINT rubitime_events_pkey PRIMARY KEY (id);


--
-- Name: rubitime_records rubitime_records_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_records
    ADD CONSTRAINT rubitime_records_pkey PRIMARY KEY (id);


--
-- Name: rubitime_records rubitime_records_rubitime_record_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_records
    ADD CONSTRAINT rubitime_records_rubitime_record_id_key UNIQUE (rubitime_record_id);


--
-- Name: rubitime_services rubitime_services_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_services
    ADD CONSTRAINT rubitime_services_pkey PRIMARY KEY (id);


--
-- Name: rubitime_services rubitime_services_rubitime_service_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_services
    ADD CONSTRAINT rubitime_services_rubitime_service_id_key UNIQUE (rubitime_service_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: mailing_topics subscriptions_code_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_topics
    ADD CONSTRAINT subscriptions_code_key UNIQUE (code);


--
-- Name: mailing_topics subscriptions_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_topics
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: telegram_state telegram_state_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_state
    ADD CONSTRAINT telegram_state_pkey PRIMARY KEY (identity_id);


--
-- Name: telegram_users telegram_users_chat_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_users
    ADD CONSTRAINT telegram_users_chat_id_key UNIQUE (telegram_id);


--
-- Name: telegram_users telegram_users_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_users
    ADD CONSTRAINT telegram_users_pkey PRIMARY KEY (id);


--
-- Name: user_questions user_questions_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_occurrences user_reminder_occurrences_occurrence_key_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_occurrence_key_key UNIQUE (occurrence_key);


--
-- Name: user_reminder_occurrences user_reminder_occurrences_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_rules user_reminder_rules_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (user_id, topic_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: app_runtime_settings_audit app_runtime_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_runtime_settings_audit
    ADD CONSTRAINT app_runtime_settings_audit_pkey PRIMARY KEY (id);


--
-- Name: appointment_records appointment_records_integrator_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_integrator_record_id_key UNIQUE (integrator_record_id);


--
-- Name: appointment_records appointment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_cancellations be_appointment_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_events be_appointment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_history_events be_appointment_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_no_shows be_appointment_no_shows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_no_shows
    ADD CONSTRAINT be_appointment_no_shows_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_reschedules be_appointment_reschedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_pkey PRIMARY KEY (id);


--
-- Name: be_appointments be_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_pkey PRIMARY KEY (id);


--
-- Name: be_appointments be_appointments_specialist_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_specialist_no_overlap EXCLUDE USING gist (specialist_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&) WHERE (((specialist_id IS NOT NULL) AND (deleted_at IS NULL) AND (status <> ALL (ARRAY['cancelled_by_patient'::text, 'cancelled_by_specialist'::text, 'late_cancellation'::text, 'no_show'::text, 'completed'::text, 'visit_confirmed'::text]))));


--
-- Name: be_availability_rules be_availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_pkey PRIMARY KEY (id);


--
-- Name: be_booking_form_fields be_booking_form_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_fields
    ADD CONSTRAINT be_booking_form_fields_pkey PRIMARY KEY (id);


--
-- Name: be_booking_form_submissions be_booking_form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_pkey PRIMARY KEY (id);


--
-- Name: be_branches be_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_branches
    ADD CONSTRAINT be_branches_pkey PRIMARY KEY (id);


--
-- Name: be_cancellation_policies be_cancellation_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_cancellation_policies
    ADD CONSTRAINT be_cancellation_policies_pkey PRIMARY KEY (id);


--
-- Name: be_clinic_services be_clinic_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_clinic_services
    ADD CONSTRAINT be_clinic_services_pkey PRIMARY KEY (id);


--
-- Name: be_external_entity_mappings be_external_entity_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_external_entity_mappings
    ADD CONSTRAINT be_external_entity_mappings_pkey PRIMARY KEY (id);


--
-- Name: be_organization_members be_organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organization_members
    ADD CONSTRAINT be_organization_members_pkey PRIMARY KEY (id);


--
-- Name: be_organizations be_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organizations
    ADD CONSTRAINT be_organizations_pkey PRIMARY KEY (id);


--
-- Name: be_package_history_events be_package_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_history_events
    ADD CONSTRAINT be_package_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_package_items be_package_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_items
    ADD CONSTRAINT be_package_items_pkey PRIMARY KEY (id);


--
-- Name: be_package_usages be_package_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_pkey PRIMARY KEY (id);


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_pkey PRIMARY KEY (id);


--
-- Name: be_patient_package_items be_patient_package_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_package_items
    ADD CONSTRAINT be_patient_package_items_pkey PRIMARY KEY (id);


--
-- Name: be_patient_packages be_patient_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_pkey PRIMARY KEY (id);


--
-- Name: be_patient_timeline_events be_patient_timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_timeline_events
    ADD CONSTRAINT be_patient_timeline_events_pkey PRIMARY KEY (id);


--
-- Name: be_payment_history_events be_payment_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_payment_intents be_payment_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_pkey PRIMARY KEY (id);


--
-- Name: be_payment_provider_events be_payment_provider_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_provider_events
    ADD CONSTRAINT be_payment_provider_events_pkey PRIMARY KEY (id);


--
-- Name: be_payments be_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_pkey PRIMARY KEY (id);


--
-- Name: be_prepayment_policies be_prepayment_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_prepayment_policies
    ADD CONSTRAINT be_prepayment_policies_pkey PRIMARY KEY (id);


--
-- Name: be_product_history_events be_product_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_history_events
    ADD CONSTRAINT be_product_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_product_pay_links be_product_pay_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_pay_links
    ADD CONSTRAINT be_product_pay_links_pkey PRIMARY KEY (id);


--
-- Name: be_product_purchases be_product_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_pkey PRIMARY KEY (id);


--
-- Name: be_products be_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_pkey PRIMARY KEY (id);


--
-- Name: be_refunds be_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_pkey PRIMARY KEY (id);


--
-- Name: be_reschedule_policies be_reschedule_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_reschedule_policies
    ADD CONSTRAINT be_reschedule_policies_pkey PRIMARY KEY (id);


--
-- Name: be_rooms be_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT be_rooms_pkey PRIMARY KEY (id);


--
-- Name: be_schedule_blocks be_schedule_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_pkey PRIMARY KEY (id);


--
-- Name: be_schedule_templates be_schedule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_templates
    ADD CONSTRAINT be_schedule_templates_pkey PRIMARY KEY (id);


--
-- Name: be_service_location_availability be_service_location_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_service_location_availability_pkey PRIMARY KEY (id);


--
-- Name: be_specialist_locations be_specialist_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_pkey PRIMARY KEY (id);


--
-- Name: be_specialist_rooms be_specialist_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_pkey PRIMARY KEY (id);


--
-- Name: be_specialist_service_availability be_specialist_service_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_specialist_service_availability_pkey PRIMARY KEY (id);


--
-- Name: be_specialists be_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialists
    ADD CONSTRAINT be_specialists_pkey PRIMARY KEY (id);


--
-- Name: be_subscription_packages be_subscription_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_subscription_packages
    ADD CONSTRAINT be_subscription_packages_pkey PRIMARY KEY (id);


--
-- Name: be_working_days be_working_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_days
    ADD CONSTRAINT be_working_days_pkey PRIMARY KEY (id);


--
-- Name: be_working_hours be_working_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_pkey PRIMARY KEY (id);


--
-- Name: booking_branch_services booking_branch_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_pkey PRIMARY KEY (id);


--
-- Name: booking_branches booking_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branches
    ADD CONSTRAINT booking_branches_pkey PRIMARY KEY (id);


--
-- Name: booking_cities booking_cities_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cities
    ADD CONSTRAINT booking_cities_code_key UNIQUE (code);


--
-- Name: booking_cities booking_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cities
    ADD CONSTRAINT booking_cities_pkey PRIMARY KEY (id);


--
-- Name: booking_services booking_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_services
    ADD CONSTRAINT booking_services_pkey PRIMARY KEY (id);


--
-- Name: booking_specialists booking_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_specialists
    ADD CONSTRAINT booking_specialists_pkey PRIMARY KEY (id);


--
-- Name: branches branches_integrator_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_integrator_branch_id_key UNIQUE (integrator_branch_id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: broadcast_audit broadcast_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit
    ADD CONSTRAINT broadcast_audit_pkey PRIMARY KEY (id);


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_audit_id_platform_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_audit_id_platform_user_id_pk PRIMARY KEY (audit_id, platform_user_id);


--
-- Name: broadcast_drafts broadcast_drafts_doctor_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_drafts
    ADD CONSTRAINT broadcast_drafts_doctor_user_id_key UNIQUE (doctor_user_id);


--
-- Name: broadcast_drafts broadcast_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_drafts
    ADD CONSTRAINT broadcast_drafts_pkey PRIMARY KEY (id);


--
-- Name: channel_link_secrets channel_link_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_secrets
    ADD CONSTRAINT channel_link_secrets_pkey PRIMARY KEY (id);


--
-- Name: clinic_public_directory_entries clinic_public_directory_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_public_directory_entries
    ADD CONSTRAINT clinic_public_directory_entries_pkey PRIMARY KEY (organization_id);


--
-- Name: clinical_anamnesis_illness clinical_anamnesis_illness_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_illness
    ADD CONSTRAINT clinical_anamnesis_illness_pkey PRIMARY KEY (id);


--
-- Name: clinical_anamnesis_lifestyle clinical_anamnesis_lifestyle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_lifestyle
    ADD CONSTRAINT clinical_anamnesis_lifestyle_pkey PRIMARY KEY (id);


--
-- Name: clinical_anamnesis_trauma clinical_anamnesis_trauma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_trauma
    ADD CONSTRAINT clinical_anamnesis_trauma_pkey PRIMARY KEY (id);


--
-- Name: clinical_complaint clinical_complaint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint
    ADD CONSTRAINT clinical_complaint_pkey PRIMARY KEY (id);


--
-- Name: clinical_complaint_update clinical_complaint_update_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint_update
    ADD CONSTRAINT clinical_complaint_update_pkey PRIMARY KEY (id);


--
-- Name: clinical_diagnosis_catalog clinical_diagnosis_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_catalog
    ADD CONSTRAINT clinical_diagnosis_catalog_pkey PRIMARY KEY (id);


--
-- Name: clinical_diagnosis clinical_diagnosis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis
    ADD CONSTRAINT clinical_diagnosis_pkey PRIMARY KEY (id);


--
-- Name: clinical_diagnosis_status_history clinical_diagnosis_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_status_history
    ADD CONSTRAINT clinical_diagnosis_status_history_pkey PRIMARY KEY (id);


--
-- Name: clinical_diagnosis_update clinical_diagnosis_update_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_update
    ADD CONSTRAINT clinical_diagnosis_update_pkey PRIMARY KEY (id);


--
-- Name: clinical_test_measure_kinds clinical_test_measure_kinds_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_measure_kinds
    ADD CONSTRAINT clinical_test_measure_kinds_code_key UNIQUE (code);


--
-- Name: clinical_test_measure_kinds clinical_test_measure_kinds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_measure_kinds
    ADD CONSTRAINT clinical_test_measure_kinds_pkey PRIMARY KEY (id);


--
-- Name: clinical_test_regions clinical_test_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_pkey PRIMARY KEY (clinical_test_id, body_region_id);


--
-- Name: clinical_visit clinical_visit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_visit
    ADD CONSTRAINT clinical_visit_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: content_access_grants_webapp content_access_grants_webapp_integrator_grant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_integrator_grant_id_key UNIQUE (integrator_grant_id);


--
-- Name: content_access_grants_webapp content_access_grants_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_pkey PRIMARY KEY (id);


--
-- Name: content_pages content_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_pkey PRIMARY KEY (id);


--
-- Name: content_pages content_pages_section_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_section_slug_key UNIQUE (section, slug);


--
-- Name: content_section_slug_history content_section_slug_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_section_slug_history
    ADD CONSTRAINT content_section_slug_history_pkey PRIMARY KEY (id);


--
-- Name: content_sections content_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_sections
    ADD CONSTRAINT content_sections_pkey PRIMARY KEY (id);


--
-- Name: content_sections content_sections_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_sections
    ADD CONSTRAINT content_sections_slug_key UNIQUE (slug);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: doctor_notes doctor_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_pkey PRIMARY KEY (id);


--
-- Name: doctor_patient_support doctor_patient_support_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_pkey PRIMARY KEY (id);


--
-- Name: email_challenges email_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_challenges
    ADD CONSTRAINT email_challenges_pkey PRIMARY KEY (id);


--
-- Name: email_send_cooldowns email_send_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_cooldowns
    ADD CONSTRAINT email_send_cooldowns_pkey PRIMARY KEY (user_id, email_normalized);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: integration_webhook_error_events integration_webhook_error_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_error_events
    ADD CONSTRAINT integration_webhook_error_events_pkey PRIMARY KEY (id);


--
-- Name: integration_webhook_last_status integration_webhook_last_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_last_status
    ADD CONSTRAINT integration_webhook_last_status_pkey PRIMARY KEY (source);


--
-- Name: integrator_push_outbox integrator_push_outbox_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox
    ADD CONSTRAINT integrator_push_outbox_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: integrator_push_outbox integrator_push_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox
    ADD CONSTRAINT integrator_push_outbox_pkey PRIMARY KEY (id);


--
-- Name: lfk_complex_exercises lfk_complex_exercises_complex_id_exercise_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_complex_id_exercise_id_key UNIQUE (complex_id, exercise_id);


--
-- Name: lfk_complex_exercises lfk_complex_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_pkey PRIMARY KEY (id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_pkey PRIMARY KEY (id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_template_id_exercise_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_template_id_exercise_id_key UNIQUE (template_id, exercise_id);


--
-- Name: lfk_complex_templates lfk_complex_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_templates
    ADD CONSTRAINT lfk_complex_templates_pkey PRIMARY KEY (id);


--
-- Name: lfk_complexes lfk_complexes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_pkey PRIMARY KEY (id);


--
-- Name: lfk_exercise_media lfk_exercise_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_media
    ADD CONSTRAINT lfk_exercise_media_pkey PRIMARY KEY (id);


--
-- Name: lfk_exercise_regions lfk_exercise_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_pkey PRIMARY KEY (exercise_id, region_ref_id);


--
-- Name: lfk_exercises lfk_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_pkey PRIMARY KEY (id);


--
-- Name: lfk_sessions lfk_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_pkey PRIMARY KEY (id);


--
-- Name: login_tokens login_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_pkey PRIMARY KEY (id);


--
-- Name: login_tokens login_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: mailing_logs_webapp mailing_logs_webapp_integrator_user_id_integrator_mailing_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs_webapp
    ADD CONSTRAINT mailing_logs_webapp_integrator_user_id_integrator_mailing_i_key UNIQUE (integrator_user_id, integrator_mailing_id);


--
-- Name: mailing_logs_webapp mailing_logs_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs_webapp
    ADD CONSTRAINT mailing_logs_webapp_pkey PRIMARY KEY (id);


--
-- Name: mailing_topics_webapp mailing_topics_webapp_integrator_topic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics_webapp
    ADD CONSTRAINT mailing_topics_webapp_integrator_topic_id_key UNIQUE (integrator_topic_id);


--
-- Name: mailing_topics_webapp mailing_topics_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics_webapp
    ADD CONSTRAINT mailing_topics_webapp_pkey PRIMARY KEY (id);


--
-- Name: manual_patient_commands manual_patient_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_patient_commands
    ADD CONSTRAINT manual_patient_commands_pkey PRIMARY KEY (command_id);


--
-- Name: material_ratings material_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_pkey PRIMARY KEY (id);


--
-- Name: material_ratings material_ratings_user_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_user_target_unique UNIQUE (user_id, target_kind, target_id);


--
-- Name: media_files media_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);


--
-- Name: media_folders media_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_pkey PRIMARY KEY (id);


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_pkey PRIMARY KEY (id);


--
-- Name: media_playback_client_events media_playback_client_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_pkey PRIMARY KEY (id);


--
-- Name: media_playback_resolution_events media_playback_resolution_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_pkey PRIMARY KEY (id);


--
-- Name: media_playback_stats_hourly media_playback_stats_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_stats_hourly
    ADD CONSTRAINT media_playback_stats_hourly_pkey PRIMARY KEY (bucket_hour, delivery);


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_pkey PRIMARY KEY (user_id, media_id);


--
-- Name: media_transcode_jobs media_transcode_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_transcode_jobs
    ADD CONSTRAINT media_transcode_jobs_pkey PRIMARY KEY (id);


--
-- Name: media_upload_sessions media_upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: message_log message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_pkey PRIMARY KEY (id);


--
-- Name: motivational_quotes motivational_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivational_quotes
    ADD CONSTRAINT motivational_quotes_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_attempts notification_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_attempts
    ADD CONSTRAINT notification_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: online_intake_answers online_intake_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_pkey PRIMARY KEY (id);


--
-- Name: online_intake_answers online_intake_answers_request_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_request_id_question_id_key UNIQUE (request_id, question_id);


--
-- Name: online_intake_attachments online_intake_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_attachments
    ADD CONSTRAINT online_intake_attachments_pkey PRIMARY KEY (id);


--
-- Name: online_intake_requests online_intake_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_requests
    ADD CONSTRAINT online_intake_requests_pkey PRIMARY KEY (id);


--
-- Name: online_intake_status_history online_intake_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_pkey PRIMARY KEY (id);


--
-- Name: operator_health_alert_sent operator_health_alert_sent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_health_alert_sent
    ADD CONSTRAINT operator_health_alert_sent_pkey PRIMARY KEY (id);


--
-- Name: operator_health_failure_archive operator_health_failure_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_health_failure_archive
    ADD CONSTRAINT operator_health_failure_archive_pkey PRIMARY KEY (id);


--
-- Name: operator_incidents operator_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_incidents
    ADD CONSTRAINT operator_incidents_pkey PRIMARY KEY (id);


--
-- Name: operator_job_status operator_job_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_job_status
    ADD CONSTRAINT operator_job_status_pkey PRIMARY KEY (job_key);


--
-- Name: org_enrollments org_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_enrollments
    ADD CONSTRAINT org_enrollments_pkey PRIMARY KEY (id);


--
-- Name: organization_member_invites organization_member_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_invites
    ADD CONSTRAINT organization_member_invites_pkey PRIMARY KEY (id);


--
-- Name: organization_slug_claims organization_slug_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_slug_claims
    ADD CONSTRAINT organization_slug_claims_pkey PRIMARY KEY (id);


--
-- Name: organization_slug_rename_events organization_slug_rename_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_slug_rename_events
    ADD CONSTRAINT organization_slug_rename_events_pkey PRIMARY KEY (id);


--
-- Name: outgoing_delivery_queue outgoing_delivery_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_delivery_queue
    ADD CONSTRAINT outgoing_delivery_queue_pkey PRIMARY KEY (id);


--
-- Name: patient_bookings patient_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_pkey PRIMARY KEY (id);


--
-- Name: patient_bookings patient_bookings_rubitime_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_rubitime_id_key UNIQUE (rubitime_id);


--
-- Name: patient_bookings patient_bookings_slot_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_slot_no_overlap EXCLUDE USING gist (rubitime_cooperator_id_snapshot WITH =, tstzrange(slot_start, slot_end, '[)'::text) WITH &&) WHERE (((status = ANY (ARRAY['confirmed'::text, 'rescheduled'::text])) AND (rubitime_cooperator_id_snapshot IS NOT NULL)));


--
-- Name: patient_comorbidity patient_comorbidity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_comorbidity
    ADD CONSTRAINT patient_comorbidity_pkey PRIMARY KEY (id);


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_pkey PRIMARY KEY (id);


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_pkey PRIMARY KEY (user_id);


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_pkey PRIMARY KEY (id);


--
-- Name: patient_diary_day_snapshots patient_diary_day_snapshots_platform_user_id_local_date_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_diary_day_snapshots
    ADD CONSTRAINT patient_diary_day_snapshots_platform_user_id_local_date_pk PRIMARY KEY (platform_user_id, local_date);


--
-- Name: patient_files patient_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_files
    ADD CONSTRAINT patient_files_pkey PRIMARY KEY (id);


--
-- Name: patient_home_block_items patient_home_block_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_block_items
    ADD CONSTRAINT patient_home_block_items_pkey PRIMARY KEY (id);


--
-- Name: patient_home_blocks patient_home_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_blocks
    ADD CONSTRAINT patient_home_blocks_pkey PRIMARY KEY (code);


--
-- Name: patient_invites patient_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_pkey PRIMARY KEY (id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_pkey PRIMARY KEY (id);


--
-- Name: patient_merge_candidates patient_merge_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_pkey PRIMARY KEY (id);


--
-- Name: patient_payment patient_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_payment
    ADD CONSTRAINT patient_payment_pkey PRIMARY KEY (id);


--
-- Name: patient_practice_completions patient_practice_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_practice_completions
    ADD CONSTRAINT patient_practice_completions_pkey PRIMARY KEY (id);


--
-- Name: phone_challenges phone_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_challenges
    ADD CONSTRAINT phone_challenges_pkey PRIMARY KEY (challenge_id);


--
-- Name: phone_messenger_bind_secrets phone_messenger_bind_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_messenger_bind_secrets
    ADD CONSTRAINT phone_messenger_bind_secrets_pkey PRIMARY KEY (id);


--
-- Name: phone_messenger_bind_secrets phone_messenger_bind_secrets_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_messenger_bind_secrets
    ADD CONSTRAINT phone_messenger_bind_secrets_token_hash_key UNIQUE (token_hash);


--
-- Name: phone_otp_locks phone_otp_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_otp_locks
    ADD CONSTRAINT phone_otp_locks_pkey PRIMARY KEY (phone_normalized);


--
-- Name: platform_user_contacts platform_user_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_user_contacts
    ADD CONSTRAINT platform_user_contacts_pkey PRIMARY KEY (id);


--
-- Name: platform_users platform_users_integrator_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_integrator_user_id_key UNIQUE (integrator_user_id) DEFERRABLE;


--
-- Name: platform_users platform_users_phone_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_phone_normalized_key UNIQUE (phone_normalized) DEFERRABLE;


--
-- Name: platform_users platform_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_pkey PRIMARY KEY (id);


--
-- Name: product_analytics_events_recent product_analytics_events_recent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_events_recent
    ADD CONSTRAINT product_analytics_events_recent_pkey PRIMARY KEY (id);


--
-- Name: product_push_notifications product_push_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_notifications
    ADD CONSTRAINT product_push_notifications_pkey PRIMARY KEY (id);


--
-- Name: program_action_log program_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_pkey PRIMARY KEY (id);


--
-- Name: program_item_discussion_messages program_item_discussion_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_pkey PRIMARY KEY (id);


--
-- Name: program_item_discussion_reads program_item_discussion_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_pkey PRIMARY KEY (patient_user_id, instance_stage_item_id);


--
-- Name: recommendation_regions recommendation_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_pkey PRIMARY KEY (recommendation_id, body_region_id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: reference_catalog_baselines reference_catalog_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_catalog_baselines
    ADD CONSTRAINT reference_catalog_baselines_pkey PRIMARY KEY (version);


--
-- Name: reference_catalog_snapshot_receipts reference_catalog_snapshot_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_catalog_snapshot_receipts
    ADD CONSTRAINT reference_catalog_snapshot_receipts_pkey PRIMARY KEY (organization_id);


--
-- Name: reference_categories reference_categories_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_categories
    ADD CONSTRAINT reference_categories_id_organization_id_key UNIQUE (id, organization_id);


--
-- Name: reference_categories reference_categories_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_categories
    ADD CONSTRAINT reference_categories_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: reference_categories reference_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_categories
    ADD CONSTRAINT reference_categories_pkey PRIMARY KEY (id);


--
-- Name: reference_items reference_items_category_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_category_id_code_key UNIQUE (category_id, code);


--
-- Name: reference_items reference_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_pkey PRIMARY KEY (id);


--
-- Name: reminder_delivery_events reminder_delivery_events_integrator_delivery_log_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_delivery_events
    ADD CONSTRAINT reminder_delivery_events_integrator_delivery_log_id_key UNIQUE (integrator_delivery_log_id);


--
-- Name: reminder_delivery_events reminder_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_delivery_events
    ADD CONSTRAINT reminder_delivery_events_pkey PRIMARY KEY (id);


--
-- Name: reminder_journal reminder_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_pkey PRIMARY KEY (id);


--
-- Name: reminder_occurrence_history reminder_occurrence_history_integrator_occurrence_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_occurrence_history
    ADD CONSTRAINT reminder_occurrence_history_integrator_occurrence_id_key UNIQUE (integrator_occurrence_id);


--
-- Name: reminder_occurrence_history reminder_occurrence_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_occurrence_history
    ADD CONSTRAINT reminder_occurrence_history_pkey PRIMARY KEY (id);


--
-- Name: reminder_rules reminder_rules_integrator_rule_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_integrator_rule_id_key UNIQUE (integrator_rule_id);


--
-- Name: reminder_rules reminder_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: saas_isolation_coverage_runs saas_isolation_coverage_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saas_isolation_coverage_runs
    ADD CONSTRAINT saas_isolation_coverage_runs_pkey PRIMARY KEY (id);


--
-- Name: saas_isolation_events saas_isolation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saas_isolation_events
    ADD CONSTRAINT saas_isolation_events_pkey PRIMARY KEY (id);


--
-- Name: saas_org_entitlement_overrides saas_org_entitlement_overrides_org_mechanic_uidx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saas_org_entitlement_overrides
    ADD CONSTRAINT saas_org_entitlement_overrides_org_mechanic_uidx UNIQUE (organization_id, mechanic);


--
-- Name: saas_org_entitlement_overrides saas_org_entitlement_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saas_org_entitlement_overrides
    ADD CONSTRAINT saas_org_entitlement_overrides_pkey PRIMARY KEY (id);


--
-- Name: saas_tariffs saas_tariffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saas_tariffs
    ADD CONSTRAINT saas_tariffs_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: specialist_signup_intents specialist_signup_intents_challenge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_signup_intents
    ADD CONSTRAINT specialist_signup_intents_challenge_id_key UNIQUE (challenge_id);


--
-- Name: specialist_signup_intents specialist_signup_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_signup_intents
    ADD CONSTRAINT specialist_signup_intents_pkey PRIMARY KEY (id);


--
-- Name: specialist_tasks specialist_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_tasks
    ADD CONSTRAINT specialist_tasks_pkey PRIMARY KEY (id);


--
-- Name: staff_security_profiles staff_security_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_security_profiles
    ADD CONSTRAINT staff_security_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: support_conversation_messages support_conversation_messages_integrator_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_integrator_message_id_key UNIQUE (integrator_message_id);


--
-- Name: support_conversation_messages support_conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: support_conversations support_conversations_integrator_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_integrator_conversation_id_key UNIQUE (integrator_conversation_id);


--
-- Name: support_conversations support_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_pkey PRIMARY KEY (id);


--
-- Name: support_delivery_events support_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_delivery_events
    ADD CONSTRAINT support_delivery_events_pkey PRIMARY KEY (id);


--
-- Name: support_question_messages support_question_messages_integrator_question_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_integrator_question_message_id_key UNIQUE (integrator_question_message_id);


--
-- Name: support_question_messages support_question_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_pkey PRIMARY KEY (id);


--
-- Name: support_questions support_questions_integrator_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_integrator_question_id_key UNIQUE (integrator_question_id);


--
-- Name: support_questions support_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_pkey PRIMARY KEY (id);


--
-- Name: symptom_entries symptom_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_pkey PRIMARY KEY (id);


--
-- Name: symptom_trackings symptom_trackings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_pkey PRIMARY KEY (id);


--
-- Name: system_settings_audit system_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings_audit
    ADD CONSTRAINT system_settings_audit_pkey PRIMARY KEY (id);


--
-- Name: test_attempts test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);


--
-- Name: test_results test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_pkey PRIMARY KEY (id);


--
-- Name: test_set_items test_set_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_pkey PRIMARY KEY (id);


--
-- Name: test_sets test_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sets
    ADD CONSTRAINT test_sets_pkey PRIMARY KEY (id);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_events treatment_program_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instances treatment_program_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_template_stage_groups treatment_program_template_stage_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_groups
    ADD CONSTRAINT treatment_program_template_stage_groups_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_template_stages treatment_program_template_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stages
    ADD CONSTRAINT treatment_program_template_stages_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_templates treatment_program_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_templates
    ADD CONSTRAINT treatment_program_templates_pkey PRIMARY KEY (id);


--
-- Name: be_booking_form_fields uq_be_booking_form_fields_org_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_fields
    ADD CONSTRAINT uq_be_booking_form_fields_org_key UNIQUE (organization_id, field_key);


--
-- Name: be_booking_form_submissions uq_be_booking_form_submissions_appt_field; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT uq_be_booking_form_submissions_appt_field UNIQUE (appointment_id, field_id);


--
-- Name: be_branches uq_be_branches_org_city_title; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_branches
    ADD CONSTRAINT uq_be_branches_org_city_title UNIQUE (organization_id, city_code, title);


--
-- Name: be_clinic_services uq_be_clinic_services_org_title_duration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_clinic_services
    ADD CONSTRAINT uq_be_clinic_services_org_title_duration UNIQUE (organization_id, title, duration_minutes);


--
-- Name: be_organization_members uq_be_organization_members_org_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organization_members
    ADD CONSTRAINT uq_be_organization_members_org_user UNIQUE (organization_id, platform_user_id);


--
-- Name: be_rooms uq_be_rooms_branch_title; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT uq_be_rooms_branch_title UNIQUE (branch_id, title);


--
-- Name: be_service_location_availability uq_be_sla_service_branch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT uq_be_sla_service_branch UNIQUE (service_id, branch_id);


--
-- Name: be_specialist_locations uq_be_specialist_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT uq_be_specialist_locations UNIQUE (specialist_id, branch_id);


--
-- Name: be_specialist_rooms uq_be_specialist_rooms; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT uq_be_specialist_rooms UNIQUE (specialist_id, room_id);


--
-- Name: be_specialist_service_availability uq_be_ssa_specialist_service_scope; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT uq_be_ssa_specialist_service_scope UNIQUE (specialist_id, service_id, branch_id, room_id, city_code);


--
-- Name: booking_branch_services uq_booking_branch_services; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT uq_booking_branch_services UNIQUE (branch_id, service_id);


--
-- Name: booking_services uq_booking_services_title_duration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_services
    ADD CONSTRAINT uq_booking_services_title_duration UNIQUE (title, duration_minutes);


--
-- Name: org_enrollments uq_org_enrollments_org_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_enrollments
    ADD CONSTRAINT uq_org_enrollments_org_user UNIQUE (organization_id, platform_user_id);


--
-- Name: user_channel_bindings user_channel_bindings_channel_code_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_bindings
    ADD CONSTRAINT user_channel_bindings_channel_code_external_id_key UNIQUE (channel_code, external_id);


--
-- Name: user_channel_preferences user_channel_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_preferences
    ADD CONSTRAINT user_channel_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_channel_preferences user_channel_preferences_user_id_channel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_preferences
    ADD CONSTRAINT user_channel_preferences_user_id_channel_code_key UNIQUE (user_id, channel_code);


--
-- Name: user_email_setup_tokens user_email_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_setup_tokens
    ADD CONSTRAINT user_email_setup_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_notification_topic_channels user_notification_topic_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topic_channels
    ADD CONSTRAINT user_notification_topic_channels_pkey PRIMARY KEY (user_id, topic_code, channel_code);


--
-- Name: user_notification_topics user_notification_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topics
    ADD CONSTRAINT user_notification_topics_pkey PRIMARY KEY (user_id, topic_code);


--
-- Name: user_oauth_bindings user_oauth_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oauth_bindings
    ADD CONSTRAINT user_oauth_bindings_pkey PRIMARY KEY (id);


--
-- Name: user_oauth_bindings user_oauth_bindings_provider_provider_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oauth_bindings
    ADD CONSTRAINT user_oauth_bindings_provider_provider_user_id_key UNIQUE (provider, provider_user_id);


--
-- Name: user_password_credentials user_password_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_password_credentials
    ADD CONSTRAINT user_password_credentials_pkey PRIMARY KEY (user_id);


--
-- Name: user_phone_history user_phone_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_history
    ADD CONSTRAINT user_phone_history_pkey PRIMARY KEY (id);


--
-- Name: user_pins user_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_pkey PRIMARY KEY (user_id);


--
-- Name: user_subscriptions_webapp user_subscriptions_webapp_integrator_user_id_integrator_top_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions_webapp
    ADD CONSTRAINT user_subscriptions_webapp_integrator_user_id_integrator_top_key UNIQUE (integrator_user_id, integrator_topic_id);


--
-- Name: user_subscriptions_webapp user_subscriptions_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions_webapp
    ADD CONSTRAINT user_subscriptions_webapp_pkey PRIMARY KEY (id);


--
-- Name: user_web_push_subscriptions user_web_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_web_push_subscriptions
    ADD CONSTRAINT user_web_push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: webapp_reminder_occurrences webapp_reminder_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_reminder_occurrences
    ADD CONSTRAINT webapp_reminder_occurrences_pkey PRIMARY KEY (id);


--
-- Name: webapp_schema_migrations webapp_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_schema_migrations
    ADD CONSTRAINT webapp_schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: content_access_grants_user_expires_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX content_access_grants_user_expires_idx ON integrator.content_access_grants USING btree (user_id, expires_at DESC);


--
-- Name: conversation_messages_conversation_created_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX conversation_messages_conversation_created_idx ON integrator.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: conversations_open_user_source_uidx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX conversations_open_user_source_uidx ON integrator.conversations USING btree (user_identity_id, source) WHERE ((closed_at IS NULL) AND (status <> 'closed'::text));


--
-- Name: conversations_status_last_message_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX conversations_status_last_message_idx ON integrator.conversations USING btree (status, last_message_at DESC);


--
-- Name: idempotency_keys_expires_at_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idempotency_keys_expires_at_idx ON integrator.idempotency_keys USING btree (expires_at);


--
-- Name: idx_booking_calendar_map_gcal_event_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_booking_calendar_map_gcal_event_id ON integrator.booking_calendar_map USING btree (gcal_event_id);


--
-- Name: idx_contacts_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_contacts_organization_id ON integrator.contacts USING btree (organization_id);


--
-- Name: idx_contacts_user_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_contacts_user_id ON integrator.contacts USING btree (user_id);


--
-- Name: idx_content_access_grants_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_content_access_grants_organization_id ON integrator.content_access_grants USING btree (organization_id);


--
-- Name: idx_conversation_messages_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_conversation_messages_organization_id ON integrator.conversation_messages USING btree (organization_id);


--
-- Name: idx_conversations_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_conversations_organization_id ON integrator.conversations USING btree (organization_id);


--
-- Name: idx_delivery_attempt_logs_channel_occurred; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_channel_occurred ON integrator.delivery_attempt_logs USING btree (channel, occurred_at DESC);


--
-- Name: idx_delivery_attempt_logs_correlation; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_correlation ON integrator.delivery_attempt_logs USING btree (correlation_id);


--
-- Name: idx_delivery_attempt_logs_event; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_event ON integrator.delivery_attempt_logs USING btree (intent_event_id);


--
-- Name: idx_identities_user_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_identities_user_id ON integrator.identities USING btree (user_id);


--
-- Name: idx_integration_data_quality_incidents_last_seen; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_integration_data_quality_incidents_last_seen ON integrator.integration_data_quality_incidents USING btree (last_seen_at DESC);


--
-- Name: idx_mailing_logs_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_mailing_logs_organization_id ON integrator.mailing_logs USING btree (organization_id);


--
-- Name: idx_mailings_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_mailings_organization_id ON integrator.mailings USING btree (organization_id);


--
-- Name: idx_message_drafts_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_message_drafts_organization_id ON integrator.message_drafts USING btree (organization_id);


--
-- Name: idx_projection_outbox_due; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_projection_outbox_due ON integrator.projection_outbox USING btree (status, next_try_at) WHERE (status = 'pending'::text);


--
-- Name: idx_projection_outbox_idempotency_key; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX idx_projection_outbox_idempotency_key ON integrator.projection_outbox USING btree (idempotency_key);


--
-- Name: idx_question_messages_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_question_messages_organization_id ON integrator.question_messages USING btree (organization_id);


--
-- Name: idx_rbp_is_active; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rbp_is_active ON integrator.rubitime_booking_profiles USING btree (is_active);


--
-- Name: idx_rbp_type_category_city; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX idx_rbp_type_category_city ON integrator.rubitime_booking_profiles USING btree (booking_type, category_code, COALESCE(city_code, ''::text));


--
-- Name: idx_rubitime_create_retry_jobs_due; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rubitime_create_retry_jobs_due ON integrator.rubitime_create_retry_jobs USING btree (status, next_try_at);


--
-- Name: idx_rubitime_records_phone_normalized; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rubitime_records_phone_normalized ON integrator.rubitime_records USING btree (phone_normalized);


--
-- Name: idx_rubitime_records_record_at; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rubitime_records_record_at ON integrator.rubitime_records USING btree (record_at);


--
-- Name: idx_user_questions_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_user_questions_organization_id ON integrator.user_questions USING btree (organization_id);


--
-- Name: idx_user_reminder_delivery_logs_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_user_reminder_delivery_logs_organization_id ON integrator.user_reminder_delivery_logs USING btree (organization_id);


--
-- Name: idx_user_reminder_occurrences_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_user_reminder_occurrences_organization_id ON integrator.user_reminder_occurrences USING btree (organization_id);


--
-- Name: idx_user_reminder_rules_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_user_reminder_rules_organization_id ON integrator.user_reminder_rules USING btree (organization_id);


--
-- Name: idx_user_subscriptions_organization_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_user_subscriptions_organization_id ON integrator.user_subscriptions USING btree (organization_id);


--
-- Name: idx_users_merged_into_user_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_users_merged_into_user_id ON integrator.users USING btree (merged_into_user_id) WHERE (merged_into_user_id IS NOT NULL);


--
-- Name: integrator_system_settings_global_key_scope_uidx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX integrator_system_settings_global_key_scope_uidx ON integrator.system_settings USING btree (key, scope) WHERE (organization_id IS NULL);


--
-- Name: integrator_system_settings_org_key_scope_uidx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX integrator_system_settings_org_key_scope_uidx ON integrator.system_settings USING btree (key, scope, organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: message_drafts_identity_source_uidx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX message_drafts_identity_source_uidx ON integrator.message_drafts USING btree (identity_id, source);


--
-- Name: message_drafts_source_updated_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX message_drafts_source_updated_idx ON integrator.message_drafts USING btree (source, updated_at DESC);


--
-- Name: question_messages_question_created_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX question_messages_question_created_idx ON integrator.question_messages USING btree (question_id, created_at);


--
-- Name: telegram_state_last_start_at_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_state_last_start_at_idx ON integrator.telegram_state USING btree (last_start_at);


--
-- Name: telegram_state_last_update_id_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_state_last_update_id_idx ON integrator.telegram_state USING btree (last_update_id);


--
-- Name: telegram_users_last_start_at_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_users_last_start_at_idx ON integrator.telegram_users USING btree (last_start_at);


--
-- Name: telegram_users_last_update_id_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_users_last_update_id_idx ON integrator.telegram_users USING btree (last_update_id);


--
-- Name: user_questions_answered_created_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_questions_answered_created_idx ON integrator.user_questions USING btree (answered, created_at DESC) WHERE (answered = false);


--
-- Name: user_questions_conversation_id_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_questions_conversation_id_idx ON integrator.user_questions USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: user_reminder_delivery_logs_occurrence_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_reminder_delivery_logs_occurrence_idx ON integrator.user_reminder_delivery_logs USING btree (occurrence_id, created_at DESC);


--
-- Name: user_reminder_occurrences_due_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_reminder_occurrences_due_idx ON integrator.user_reminder_occurrences USING btree (status, planned_at);


--
-- Name: user_reminder_rules_enabled_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_reminder_rules_enabled_idx ON integrator.user_reminder_rules USING btree (is_enabled, category);


--
-- Name: app_runtime_settings_audit_global_key_history_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_runtime_settings_audit_global_key_history_idx ON public.app_runtime_settings_audit USING btree (key, scope, changed_at DESC) WHERE (organization_id IS NULL);


--
-- Name: app_runtime_settings_audit_org_key_history_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_runtime_settings_audit_org_key_history_idx ON public.app_runtime_settings_audit USING btree (organization_id, key, scope, changed_at DESC) WHERE (organization_id IS NOT NULL);


--
-- Name: app_runtime_settings_global_key_scope_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_runtime_settings_global_key_scope_uidx ON public.app_runtime_settings USING btree (key, scope) WHERE (organization_id IS NULL);


--
-- Name: app_runtime_settings_org_key_scope_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_runtime_settings_org_key_scope_uidx ON public.app_runtime_settings USING btree (key, scope, organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: be_payment_intents_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_payment_intents_idempotency_uidx ON public.be_payment_intents USING btree (organization_id, idempotency_key);


--
-- Name: be_payment_provider_events_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_payment_provider_events_idempotency_uidx ON public.be_payment_provider_events USING btree (organization_id, provider_id, idempotency_key);


--
-- Name: be_payments_intent_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_payments_intent_uidx ON public.be_payments USING btree (payment_intent_id);


--
-- Name: be_prepayment_policies_online_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_prepayment_policies_online_uidx ON public.be_prepayment_policies USING btree (organization_id, online_category) WHERE (online_category IS NOT NULL);


--
-- Name: be_prepayment_policies_service_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_prepayment_policies_service_uidx ON public.be_prepayment_policies USING btree (organization_id, service_id) WHERE (service_id IS NOT NULL);


--
-- Name: be_product_pay_links_token_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_product_pay_links_token_uidx ON public.be_product_pay_links USING btree (token);


--
-- Name: content_section_slug_history_old_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX content_section_slug_history_old_slug_key ON public.content_section_slug_history USING btree (old_slug);


--
-- Name: idx_admin_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log USING btree (action);


--
-- Name: idx_admin_audit_log_conflict_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_conflict_key ON public.admin_audit_log USING btree (conflict_key) WHERE (conflict_key IS NOT NULL);


--
-- Name: idx_admin_audit_log_conflict_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_admin_audit_log_conflict_open ON public.admin_audit_log USING btree (conflict_key) WHERE ((conflict_key IS NOT NULL) AND (resolved_at IS NULL));


--
-- Name: idx_admin_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_admin_audit_log_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_organization_id ON public.admin_audit_log USING btree (organization_id);


--
-- Name: idx_admin_audit_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_target ON public.admin_audit_log USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_appointment_records_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_branch_id ON public.appointment_records USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: idx_appointment_records_integrator_record_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_appointment_records_integrator_record_id ON public.appointment_records USING btree (integrator_record_id);


--
-- Name: idx_appointment_records_phone_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_phone_normalized ON public.appointment_records USING btree (phone_normalized) WHERE (phone_normalized IS NOT NULL);


--
-- Name: idx_appointment_records_phone_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_phone_not_deleted ON public.appointment_records USING btree (phone_normalized, record_at DESC) WHERE ((deleted_at IS NULL) AND (phone_normalized IS NOT NULL));


--
-- Name: idx_appointment_records_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_platform_user_id ON public.appointment_records USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_appointment_records_record_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_record_at ON public.appointment_records USING btree (record_at) WHERE (record_at IS NOT NULL);


--
-- Name: idx_appointment_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_status ON public.appointment_records USING btree (status);


--
-- Name: idx_assignments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_patient ON public.patient_lfk_assignments USING btree (patient_user_id, is_active);


--
-- Name: idx_auth_rate_limit_events_scope_key_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_rate_limit_events_scope_key_time ON public.auth_rate_limit_events USING btree (scope, key, occurred_at);


--
-- Name: idx_be_appointment_events_appt_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointment_events_appt_created ON public.be_appointment_events USING btree (appointment_id, created_at);


--
-- Name: idx_be_appointment_history_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointment_history_appt ON public.be_appointment_history_events USING btree (appointment_id, occurred_at);


--
-- Name: idx_be_appointments_attribution_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_attribution_gin ON public.be_appointments USING gin (attribution_json);


--
-- Name: idx_be_appointments_org_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_org_start ON public.be_appointments USING btree (organization_id, start_at);


--
-- Name: idx_be_appointments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_patient ON public.be_appointments USING btree (platform_user_id);


--
-- Name: idx_be_appointments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_status ON public.be_appointments USING btree (status);


--
-- Name: idx_be_appt_cancellations_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_cancellations_appt ON public.be_appointment_cancellations USING btree (appointment_id, created_at DESC);


--
-- Name: idx_be_appt_no_shows_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_no_shows_appt ON public.be_appointment_no_shows USING btree (appointment_id, created_at DESC);


--
-- Name: idx_be_appt_reschedules_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_reschedules_appt ON public.be_appointment_reschedules USING btree (appointment_id, created_at DESC);


--
-- Name: idx_be_appt_staff_comments_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_staff_comments_appt ON public.be_appointment_staff_comments USING btree (appointment_id);


--
-- Name: idx_be_appt_staff_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_staff_comments_user ON public.be_appointment_staff_comments USING btree (platform_user_id, created_at);


--
-- Name: idx_be_booking_form_fields_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_booking_form_fields_org ON public.be_booking_form_fields USING btree (organization_id);


--
-- Name: idx_be_booking_form_submissions_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_booking_form_submissions_appt ON public.be_booking_form_submissions USING btree (appointment_id);


--
-- Name: idx_be_branches_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_branches_city ON public.be_branches USING btree (organization_id, city_code);


--
-- Name: idx_be_branches_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_branches_org ON public.be_branches USING btree (organization_id);


--
-- Name: idx_be_cancel_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_cancel_policies_org ON public.be_cancellation_policies USING btree (organization_id);


--
-- Name: idx_be_clinic_services_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_clinic_services_org ON public.be_clinic_services USING btree (organization_id);


--
-- Name: idx_be_external_mapping_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_external_mapping_canonical ON public.be_external_entity_mappings USING btree (entity_type, canonical_id);


--
-- Name: idx_be_external_mapping_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_be_external_mapping_unique ON public.be_external_entity_mappings USING btree (external_system, entity_type, external_id);


--
-- Name: idx_be_organization_members_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_organization_members_org ON public.be_organization_members USING btree (organization_id);


--
-- Name: idx_be_organization_members_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_organization_members_specialist ON public.be_organization_members USING btree (specialist_id);


--
-- Name: idx_be_organization_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_organization_members_user ON public.be_organization_members USING btree (platform_user_id);


--
-- Name: idx_be_organizations_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_organizations_is_active ON public.be_organizations USING btree (is_active);


--
-- Name: idx_be_package_history_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_history_pkg ON public.be_package_history_events USING btree (patient_package_id);


--
-- Name: idx_be_package_items_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_items_package ON public.be_package_items USING btree (package_id);


--
-- Name: idx_be_package_usages_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_usages_appointment ON public.be_package_usages USING btree (appointment_id);


--
-- Name: idx_be_package_usages_appointment_consume_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_be_package_usages_appointment_consume_unique ON public.be_package_usages USING btree (appointment_id) WHERE (usage_kind = 'consume'::text);


--
-- Name: idx_be_package_usages_appointment_debit_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_be_package_usages_appointment_debit_unique ON public.be_package_usages USING btree (appointment_id) WHERE ((appointment_id IS NOT NULL) AND (usage_kind = ANY (ARRAY['consume'::text, 'penalty'::text, 'manual_adjust'::text])));


--
-- Name: idx_be_package_usages_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_usages_pkg ON public.be_package_usages USING btree (patient_package_id);


--
-- Name: idx_be_patient_booking_profiles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_booking_profiles_user ON public.be_patient_booking_profiles USING btree (platform_user_id);


--
-- Name: idx_be_patient_package_items_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_package_items_pkg ON public.be_patient_package_items USING btree (patient_package_id);


--
-- Name: idx_be_patient_packages_display_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_be_patient_packages_display_number_unique ON public.be_patient_packages USING btree (display_number);


--
-- Name: idx_be_patient_packages_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_packages_org_user ON public.be_patient_packages USING btree (organization_id, platform_user_id);


--
-- Name: idx_be_patient_packages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_packages_status ON public.be_patient_packages USING btree (status);


--
-- Name: idx_be_patient_timeline_user_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_timeline_user_occurred ON public.be_patient_timeline_events USING btree (platform_user_id, occurred_at);


--
-- Name: idx_be_payment_history_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payment_history_appointment ON public.be_payment_history_events USING btree (appointment_id);


--
-- Name: idx_be_payment_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payment_history_user ON public.be_payment_history_events USING btree (platform_user_id);


--
-- Name: idx_be_payment_intents_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payment_intents_appointment ON public.be_payment_intents USING btree (appointment_id);


--
-- Name: idx_be_payments_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payments_appointment ON public.be_payments USING btree (appointment_id);


--
-- Name: idx_be_prepayment_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_prepayment_policies_org ON public.be_prepayment_policies USING btree (organization_id);


--
-- Name: idx_be_product_history_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_history_purchase ON public.be_product_history_events USING btree (product_purchase_id);


--
-- Name: idx_be_product_pay_links_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_pay_links_product ON public.be_product_pay_links USING btree (product_id);


--
-- Name: idx_be_product_purchases_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_org_user ON public.be_product_purchases USING btree (organization_id, platform_user_id);


--
-- Name: idx_be_product_purchases_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_phone ON public.be_product_purchases USING btree (organization_id, buyer_phone_normalized);


--
-- Name: idx_be_product_purchases_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_product ON public.be_product_purchases USING btree (product_id);


--
-- Name: idx_be_product_purchases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_status ON public.be_product_purchases USING btree (status);


--
-- Name: idx_be_products_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_products_org ON public.be_products USING btree (organization_id);


--
-- Name: idx_be_products_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_products_org_type ON public.be_products USING btree (organization_id, product_type);


--
-- Name: idx_be_refunds_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_refunds_payment ON public.be_refunds USING btree (payment_id);


--
-- Name: idx_be_reschedule_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_reschedule_policies_org ON public.be_reschedule_policies USING btree (organization_id);


--
-- Name: idx_be_rooms_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_rooms_branch ON public.be_rooms USING btree (branch_id);


--
-- Name: idx_be_schedule_blocks_org_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_schedule_blocks_org_start ON public.be_schedule_blocks USING btree (organization_id, start_at);


--
-- Name: idx_be_schedule_templates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_schedule_templates_org ON public.be_schedule_templates USING btree (organization_id);


--
-- Name: idx_be_specialists_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_specialists_org ON public.be_specialists USING btree (organization_id);


--
-- Name: idx_be_ssa_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_ssa_service ON public.be_specialist_service_availability USING btree (service_id);


--
-- Name: idx_be_ssa_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_ssa_specialist ON public.be_specialist_service_availability USING btree (specialist_id);


--
-- Name: idx_be_subscription_packages_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_subscription_packages_org ON public.be_subscription_packages USING btree (organization_id);


--
-- Name: idx_be_working_days_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_working_days_org_date ON public.be_working_days USING btree (organization_id, work_date);


--
-- Name: idx_be_working_hours_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_working_hours_scope ON public.be_working_hours USING btree (organization_id, specialist_id, branch_id);


--
-- Name: idx_booking_branch_services_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branch_services_branch_id ON public.booking_branch_services USING btree (branch_id);


--
-- Name: idx_booking_branch_services_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branch_services_is_active ON public.booking_branch_services USING btree (is_active);


--
-- Name: idx_booking_branch_services_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branch_services_service_id ON public.booking_branch_services USING btree (service_id);


--
-- Name: idx_booking_branches_city_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branches_city_id ON public.booking_branches USING btree (city_id);


--
-- Name: idx_booking_branches_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branches_is_active ON public.booking_branches USING btree (is_active);


--
-- Name: idx_booking_branches_rubitime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_booking_branches_rubitime_id ON public.booking_branches USING btree (rubitime_branch_id);


--
-- Name: idx_booking_cities_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_cities_is_active ON public.booking_cities USING btree (is_active);


--
-- Name: idx_booking_services_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_services_is_active ON public.booking_services USING btree (is_active);


--
-- Name: idx_booking_specialists_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_specialists_branch_id ON public.booking_specialists USING btree (branch_id);


--
-- Name: idx_booking_specialists_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_specialists_is_active ON public.booking_specialists USING btree (is_active);


--
-- Name: idx_booking_specialists_rubitime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_booking_specialists_rubitime_id ON public.booking_specialists USING btree (rubitime_cooperator_id, branch_id);


--
-- Name: idx_branches_integrator_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_branches_integrator_branch_id ON public.branches USING btree (integrator_branch_id);


--
-- Name: idx_broadcast_audit_executed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_executed_at ON public.broadcast_audit USING btree (executed_at DESC);


--
-- Name: idx_broadcast_audit_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_organization_id ON public.broadcast_audit USING btree (organization_id);


--
-- Name: idx_broadcast_audit_recipients_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_recipients_organization_id ON public.broadcast_audit_recipients USING btree (organization_id);


--
-- Name: idx_broadcast_audit_recipients_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_recipients_platform_user_id ON public.broadcast_audit_recipients USING btree (platform_user_id);


--
-- Name: idx_broadcast_drafts_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_drafts_organization_id ON public.broadcast_drafts USING btree (organization_id);


--
-- Name: idx_channel_link_secrets_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_link_secrets_expires ON public.channel_link_secrets USING btree (expires_at);


--
-- Name: idx_channel_link_secrets_user_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_link_secrets_user_channel ON public.channel_link_secrets USING btree (user_id, channel_code);


--
-- Name: idx_clinic_public_directory_entries_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinic_public_directory_entries_published ON public.clinic_public_directory_entries USING btree (is_published);


--
-- Name: idx_clinical_anamnesis_illness_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_anamnesis_illness_organization_id ON public.clinical_anamnesis_illness USING btree (organization_id);


--
-- Name: idx_clinical_anamnesis_illness_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_anamnesis_illness_patient ON public.clinical_anamnesis_illness USING btree (patient_user_id);


--
-- Name: idx_clinical_anamnesis_lifestyle_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_anamnesis_lifestyle_organization_id ON public.clinical_anamnesis_lifestyle USING btree (organization_id);


--
-- Name: idx_clinical_anamnesis_lifestyle_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_anamnesis_lifestyle_patient ON public.clinical_anamnesis_lifestyle USING btree (patient_user_id);


--
-- Name: idx_clinical_anamnesis_trauma_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_anamnesis_trauma_organization_id ON public.clinical_anamnesis_trauma USING btree (organization_id);


--
-- Name: idx_clinical_anamnesis_trauma_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_anamnesis_trauma_patient ON public.clinical_anamnesis_trauma USING btree (patient_user_id);


--
-- Name: idx_clinical_complaint_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_complaint_organization_id ON public.clinical_complaint USING btree (organization_id);


--
-- Name: idx_clinical_complaint_patient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_complaint_patient_user_id ON public.clinical_complaint USING btree (patient_user_id);


--
-- Name: idx_clinical_complaint_update_complaint_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_complaint_update_complaint_id ON public.clinical_complaint_update USING btree (complaint_id);


--
-- Name: idx_clinical_complaint_update_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_complaint_update_organization_id ON public.clinical_complaint_update USING btree (organization_id);


--
-- Name: idx_clinical_complaint_update_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_complaint_update_visit_id ON public.clinical_complaint_update USING btree (visit_id);


--
-- Name: idx_clinical_diagnosis_catalog_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_catalog_label ON public.clinical_diagnosis_catalog USING btree (label);


--
-- Name: idx_clinical_diagnosis_catalog_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_catalog_organization_id ON public.clinical_diagnosis_catalog USING btree (organization_id);


--
-- Name: idx_clinical_diagnosis_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_organization_id ON public.clinical_diagnosis USING btree (organization_id);


--
-- Name: idx_clinical_diagnosis_patient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_patient_user_id ON public.clinical_diagnosis USING btree (patient_user_id);


--
-- Name: idx_clinical_diagnosis_status_history_diagnosis_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_status_history_diagnosis_id ON public.clinical_diagnosis_status_history USING btree (diagnosis_id);


--
-- Name: idx_clinical_diagnosis_status_history_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_status_history_organization_id ON public.clinical_diagnosis_status_history USING btree (organization_id);


--
-- Name: idx_clinical_diagnosis_update_diagnosis_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_update_diagnosis_id ON public.clinical_diagnosis_update USING btree (diagnosis_id);


--
-- Name: idx_clinical_diagnosis_update_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_update_organization_id ON public.clinical_diagnosis_update USING btree (organization_id);


--
-- Name: idx_clinical_diagnosis_update_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_diagnosis_update_visit_id ON public.clinical_diagnosis_update USING btree (visit_id);


--
-- Name: idx_clinical_test_measure_kinds_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_test_measure_kinds_sort ON public.clinical_test_measure_kinds USING btree (sort_order);


--
-- Name: idx_clinical_test_regions_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_test_regions_body_region ON public.clinical_test_regions USING btree (body_region_id);


--
-- Name: idx_clinical_test_regions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_test_regions_organization_id ON public.clinical_test_regions USING btree (organization_id);


--
-- Name: idx_clinical_visit_canonical_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_visit_canonical_appointment_id ON public.clinical_visit USING btree (canonical_appointment_id);


--
-- Name: idx_clinical_visit_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_visit_organization_id ON public.clinical_visit USING btree (organization_id);


--
-- Name: idx_clinical_visit_patient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_visit_patient_user_id ON public.clinical_visit USING btree (patient_user_id);


--
-- Name: idx_clinical_visit_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_visit_visited_at ON public.clinical_visit USING btree (visited_at);


--
-- Name: idx_comments_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_organization_id ON public.comments USING btree (organization_id);


--
-- Name: idx_comments_target_type_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_target_type_target_id ON public.comments USING btree (target_type, target_id);


--
-- Name: idx_content_access_grants_webapp_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_webapp_expires_at ON public.content_access_grants_webapp USING btree (expires_at DESC);


--
-- Name: idx_content_access_grants_webapp_integrator_grant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_content_access_grants_webapp_integrator_grant_id ON public.content_access_grants_webapp USING btree (integrator_grant_id);


--
-- Name: idx_content_access_grants_webapp_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_webapp_integrator_user_id ON public.content_access_grants_webapp USING btree (integrator_user_id);


--
-- Name: idx_content_access_grants_webapp_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_webapp_organization_id ON public.content_access_grants_webapp USING btree (organization_id);


--
-- Name: idx_content_pages_linked_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_linked_course ON public.content_pages USING btree (linked_course_id);


--
-- Name: idx_content_pages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_organization_id ON public.content_pages USING btree (organization_id);


--
-- Name: idx_content_pages_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_section ON public.content_pages USING btree (section);


--
-- Name: idx_content_pages_section_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_section_sort ON public.content_pages USING btree (section, sort_order);


--
-- Name: idx_content_pages_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_slug ON public.content_pages USING btree (slug);


--
-- Name: idx_content_section_slug_history_new_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_section_slug_history_new_slug ON public.content_section_slug_history USING btree (new_slug);


--
-- Name: idx_content_section_slug_history_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_section_slug_history_organization_id ON public.content_section_slug_history USING btree (organization_id);


--
-- Name: idx_content_sections_kind_parent_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_sections_kind_parent_sort ON public.content_sections USING btree (kind, system_parent_code, sort_order, title);


--
-- Name: idx_content_sections_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_sections_organization_id ON public.content_sections USING btree (organization_id);


--
-- Name: idx_content_sections_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_sections_sort ON public.content_sections USING btree (sort_order, title);


--
-- Name: idx_courses_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_organization_id ON public.courses USING btree (organization_id);


--
-- Name: idx_courses_program_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_program_template ON public.courses USING btree (program_template_id);


--
-- Name: idx_courses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_status ON public.courses USING btree (status);


--
-- Name: idx_doctor_notes_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctor_notes_organization_id ON public.doctor_notes USING btree (organization_id);


--
-- Name: idx_doctor_notes_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctor_notes_user_created ON public.doctor_notes USING btree (user_id, created_at DESC);


--
-- Name: idx_doctor_patient_support_on_support; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctor_patient_support_on_support ON public.doctor_patient_support USING btree (on_support);


--
-- Name: idx_doctor_patient_support_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctor_patient_support_organization_id ON public.doctor_patient_support USING btree (organization_id);


--
-- Name: idx_email_challenges_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_challenges_email ON public.email_challenges USING btree (email);


--
-- Name: idx_email_challenges_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_challenges_expires_at ON public.email_challenges USING btree (expires_at);


--
-- Name: idx_email_challenges_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_challenges_user_id ON public.email_challenges USING btree (user_id);


--
-- Name: idx_email_send_cooldowns_email_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_cooldowns_email_normalized ON public.email_send_cooldowns USING btree (email_normalized);


--
-- Name: idx_idempotency_keys_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_integration_webhook_error_events_burst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_webhook_error_events_burst ON public.integration_webhook_error_events USING btree (source, error_class, occurred_at DESC);


--
-- Name: idx_integrator_push_outbox_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrator_push_outbox_due ON public.integrator_push_outbox USING btree (status, next_try_at) WHERE (status = 'pending'::text);


--
-- Name: idx_lfk_complex_exercises_complex; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complex_exercises_complex ON public.lfk_complex_exercises USING btree (complex_id, sort_order);


--
-- Name: idx_lfk_complex_exercises_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complex_exercises_organization_id ON public.lfk_complex_exercises USING btree (organization_id);


--
-- Name: idx_lfk_complex_template_exercises_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complex_template_exercises_organization_id ON public.lfk_complex_template_exercises USING btree (organization_id);


--
-- Name: idx_lfk_complex_templates_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complex_templates_organization_id ON public.lfk_complex_templates USING btree (organization_id);


--
-- Name: idx_lfk_complex_templates_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complex_templates_owner ON public.lfk_complex_templates USING btree (owner_kind, organization_id, status, updated_at DESC);


--
-- Name: idx_lfk_complexes_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complexes_organization_id ON public.lfk_complexes USING btree (organization_id);


--
-- Name: idx_lfk_complexes_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complexes_platform_user_id ON public.lfk_complexes USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_lfk_complexes_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complexes_user_active ON public.lfk_complexes USING btree (user_id, is_active);


--
-- Name: idx_lfk_exercise_media_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_media_exercise ON public.lfk_exercise_media USING btree (exercise_id, sort_order);


--
-- Name: idx_lfk_exercise_media_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_media_organization_id ON public.lfk_exercise_media USING btree (organization_id);


--
-- Name: idx_lfk_exercise_media_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_media_owner ON public.lfk_exercise_media USING btree (owner_kind, organization_id, exercise_id, sort_order);


--
-- Name: idx_lfk_exercise_regions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_regions_organization_id ON public.lfk_exercise_regions USING btree (organization_id);


--
-- Name: idx_lfk_exercise_regions_region_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_regions_region_ref ON public.lfk_exercise_regions USING btree (region_ref_id);


--
-- Name: idx_lfk_exercises_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_archived ON public.lfk_exercises USING btree (is_archived);


--
-- Name: idx_lfk_exercises_catalog_scope_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_catalog_scope_owner ON public.lfk_exercises USING btree (owner_kind, organization_id, catalog_scope, is_archived, updated_at DESC);


--
-- Name: idx_lfk_exercises_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_organization_id ON public.lfk_exercises USING btree (organization_id);


--
-- Name: idx_lfk_exercises_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_owner ON public.lfk_exercises USING btree (owner_kind, organization_id, is_archived, updated_at DESC);


--
-- Name: idx_lfk_exercises_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_region ON public.lfk_exercises USING btree (region_ref_id) WHERE (NOT is_archived);


--
-- Name: idx_lfk_sessions_complex_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_complex_completed ON public.lfk_sessions USING btree (complex_id, completed_at DESC);


--
-- Name: idx_lfk_sessions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_organization_id ON public.lfk_sessions USING btree (organization_id);


--
-- Name: idx_lfk_sessions_user_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_user_completed ON public.lfk_sessions USING btree (user_id, completed_at DESC);


--
-- Name: idx_login_tokens_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_tokens_status ON public.login_tokens USING btree (status, expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_mailing_logs_webapp_mailing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_logs_webapp_mailing ON public.mailing_logs_webapp USING btree (integrator_mailing_id);


--
-- Name: idx_mailing_logs_webapp_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_logs_webapp_organization_id ON public.mailing_logs_webapp USING btree (organization_id);


--
-- Name: idx_mailing_logs_webapp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_logs_webapp_user ON public.mailing_logs_webapp USING btree (integrator_user_id);


--
-- Name: idx_mailing_topics_webapp_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mailing_topics_webapp_integrator_id ON public.mailing_topics_webapp USING btree (integrator_topic_id);


--
-- Name: idx_mailing_topics_webapp_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_topics_webapp_key ON public.mailing_topics_webapp USING btree (key);


--
-- Name: idx_manual_patient_commands_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_patient_commands_org_created ON public.manual_patient_commands USING btree (organization_id, created_at DESC);


--
-- Name: idx_material_ratings_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_ratings_organization_id ON public.material_ratings USING btree (organization_id);


--
-- Name: idx_material_ratings_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_ratings_target ON public.material_ratings USING btree (target_kind, target_id);


--
-- Name: idx_media_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_created_at ON public.media_files USING btree (created_at DESC);


--
-- Name: idx_media_files_folder_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_folder_created ON public.media_files USING btree (folder_id, created_at DESC) WHERE (folder_id IS NOT NULL);


--
-- Name: idx_media_files_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_organization_id ON public.media_files USING btree (organization_id);


--
-- Name: idx_media_files_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_owner ON public.media_files USING btree (owner_kind, organization_id, status, created_at DESC);


--
-- Name: idx_media_files_preview_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_preview_status ON public.media_files USING btree (preview_status) WHERE (preview_status = 'pending'::text);


--
-- Name: idx_media_files_purge_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_purge_queue ON public.media_files USING btree (next_attempt_at NULLS FIRST) WHERE (status = ANY (ARRAY['pending_delete'::text, 'deleting'::text]));


--
-- Name: idx_media_files_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_uploaded_by ON public.media_files USING btree (uploaded_by);


--
-- Name: idx_media_files_video_processing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_video_processing_status ON public.media_files USING btree (video_processing_status) WHERE (mime_type ~~ 'video/%'::text);


--
-- Name: idx_media_folders_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_folders_organization_id ON public.media_folders USING btree (organization_id);


--
-- Name: idx_media_folders_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_folders_parent_id ON public.media_folders USING btree (parent_id);


--
-- Name: idx_media_hls_proxy_error_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_hls_proxy_error_events_created_at ON public.media_hls_proxy_error_events USING btree (created_at DESC);


--
-- Name: idx_media_hls_proxy_error_events_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_hls_proxy_error_events_organization_id ON public.media_hls_proxy_error_events USING btree (organization_id);


--
-- Name: idx_media_hls_proxy_error_events_reason_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_hls_proxy_error_events_reason_time ON public.media_hls_proxy_error_events USING btree (reason_code, created_at DESC);


--
-- Name: idx_media_playback_client_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_created_at ON public.media_playback_client_events USING btree (created_at DESC);


--
-- Name: idx_media_playback_client_events_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_event_time ON public.media_playback_client_events USING btree (event_class, created_at DESC);


--
-- Name: idx_media_playback_client_events_media_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_media_time ON public.media_playback_client_events USING btree (media_id, created_at DESC);


--
-- Name: idx_media_playback_client_events_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_organization_id ON public.media_playback_client_events USING btree (organization_id);


--
-- Name: idx_media_playback_resolution_events_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_resolution_events_organization_id ON public.media_playback_resolution_events USING btree (organization_id);


--
-- Name: idx_media_playback_resolution_events_resolved_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_resolution_events_resolved_at ON public.media_playback_resolution_events USING btree (resolved_at DESC);


--
-- Name: idx_media_playback_resolution_events_user_resolved_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_resolution_events_user_resolved_at ON public.media_playback_resolution_events USING btree (user_id, resolved_at DESC);


--
-- Name: idx_media_playback_stats_hourly_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_stats_hourly_bucket ON public.media_playback_stats_hourly USING btree (bucket_hour);


--
-- Name: idx_media_playback_user_video_first_resolve_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_user_video_first_resolve_org ON public.media_playback_user_video_first_resolve USING btree (organization_id);


--
-- Name: idx_media_playback_user_video_first_resolve_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_user_video_first_resolve_time ON public.media_playback_user_video_first_resolve USING btree (first_resolved_at);


--
-- Name: idx_media_transcode_jobs_finished_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_transcode_jobs_finished_at ON public.media_transcode_jobs USING btree (finished_at DESC) WHERE ((finished_at IS NOT NULL) AND (status = ANY (ARRAY['done'::text, 'failed'::text])));


--
-- Name: idx_media_transcode_jobs_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_transcode_jobs_organization_id ON public.media_transcode_jobs USING btree (organization_id);


--
-- Name: idx_media_transcode_jobs_pending_pick; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_transcode_jobs_pending_pick ON public.media_transcode_jobs USING btree (next_attempt_at, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_media_upload_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_upload_sessions_expires ON public.media_upload_sessions USING btree (expires_at) WHERE (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]));


--
-- Name: idx_media_upload_sessions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_upload_sessions_organization_id ON public.media_upload_sessions USING btree (organization_id);


--
-- Name: idx_media_upload_sessions_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_upload_sessions_owner ON public.media_upload_sessions USING btree (owner_user_id);


--
-- Name: idx_message_log_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_organization_id ON public.message_log USING btree (organization_id);


--
-- Name: idx_message_log_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_platform_user_id ON public.message_log USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_message_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_sent_at ON public.message_log USING btree (sent_at DESC);


--
-- Name: idx_message_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_user_id ON public.message_log USING btree (user_id);


--
-- Name: idx_motivational_quotes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motivational_quotes_active ON public.motivational_quotes USING btree (is_active, sort_order);


--
-- Name: idx_motivational_quotes_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motivational_quotes_organization_id ON public.motivational_quotes USING btree (organization_id);


--
-- Name: idx_notification_delivery_attempts_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_channel_created ON public.notification_delivery_attempts USING btree (channel, created_at);


--
-- Name: idx_notification_delivery_attempts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_created_at ON public.notification_delivery_attempts USING btree (created_at);


--
-- Name: idx_notification_delivery_attempts_occurrence_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_occurrence_created ON public.notification_delivery_attempts USING btree (occurrence_id, created_at);


--
-- Name: idx_notification_delivery_attempts_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_organization_id ON public.notification_delivery_attempts USING btree (organization_id);


--
-- Name: idx_notification_delivery_attempts_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_status_created ON public.notification_delivery_attempts USING btree (status, created_at);


--
-- Name: idx_notification_delivery_attempts_topic_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_topic_created ON public.notification_delivery_attempts USING btree (topic_code, created_at);


--
-- Name: idx_notification_delivery_attempts_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_user_created ON public.notification_delivery_attempts USING btree (user_id, created_at);


--
-- Name: idx_oauth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_user ON public.user_oauth_bindings USING btree (user_id);


--
-- Name: idx_online_intake_answers_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_answers_organization_id ON public.online_intake_answers USING btree (organization_id);


--
-- Name: idx_online_intake_answers_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_answers_request_id ON public.online_intake_answers USING btree (request_id);


--
-- Name: idx_online_intake_attachments_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_attachments_organization_id ON public.online_intake_attachments USING btree (organization_id);


--
-- Name: idx_online_intake_attachments_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_attachments_request_id ON public.online_intake_attachments USING btree (request_id);


--
-- Name: idx_online_intake_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_created_at ON public.online_intake_requests USING btree (created_at DESC);


--
-- Name: idx_online_intake_requests_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_organization_id ON public.online_intake_requests USING btree (organization_id);


--
-- Name: idx_online_intake_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_status ON public.online_intake_requests USING btree (status);


--
-- Name: idx_online_intake_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_type ON public.online_intake_requests USING btree (type);


--
-- Name: idx_online_intake_requests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_user_id ON public.online_intake_requests USING btree (user_id);


--
-- Name: idx_online_intake_status_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_status_history_changed_at ON public.online_intake_status_history USING btree (changed_at DESC);


--
-- Name: idx_online_intake_status_history_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_status_history_organization_id ON public.online_intake_status_history USING btree (organization_id);


--
-- Name: idx_online_intake_status_history_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_status_history_request_id ON public.online_intake_status_history USING btree (request_id);


--
-- Name: idx_operator_health_alert_sent_dedup_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_alert_sent_dedup_sent_at ON public.operator_health_alert_sent USING btree (dedup_key, sent_at DESC);


--
-- Name: idx_operator_health_failure_archive_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_archived_at ON public.operator_health_failure_archive USING btree (archived_at);


--
-- Name: idx_operator_health_failure_archive_doctor_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_doctor_archived ON public.operator_health_failure_archive USING btree (doctor_user_id, archived_at);


--
-- Name: idx_operator_health_failure_archive_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_organization_id ON public.operator_health_failure_archive USING btree (organization_id);


--
-- Name: idx_operator_health_failure_archive_probe_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_probe_archived ON public.operator_health_failure_archive USING btree (health_probe, archived_at);


--
-- Name: idx_operator_incidents_open_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_incidents_open_last_seen ON public.operator_incidents USING btree (last_seen_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: idx_operator_job_status_family_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_job_status_family_key ON public.operator_job_status USING btree (job_family, job_key);


--
-- Name: idx_operator_job_status_last_finished; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_job_status_last_finished ON public.operator_job_status USING btree (last_finished_at DESC);


--
-- Name: idx_org_enrollments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_enrollments_org ON public.org_enrollments USING btree (organization_id);


--
-- Name: idx_org_enrollments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_enrollments_user ON public.org_enrollments USING btree (platform_user_id);


--
-- Name: idx_organization_member_invites_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_member_invites_expires_at ON public.organization_member_invites USING btree (expires_at);


--
-- Name: idx_organization_member_invites_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_member_invites_org_status ON public.organization_member_invites USING btree (organization_id, status);


--
-- Name: idx_organization_slug_claims_org_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_slug_claims_org_kind ON public.organization_slug_claims USING btree (organization_id, kind);


--
-- Name: idx_organization_slug_rename_events_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_slug_rename_events_org_created ON public.organization_slug_rename_events USING btree (organization_id, created_at DESC);


--
-- Name: idx_outgoing_delivery_queue_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outgoing_delivery_queue_due ON public.outgoing_delivery_queue USING btree (status, next_retry_at);


--
-- Name: idx_patient_bookings_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_branch_id ON public.patient_bookings USING btree (branch_id);


--
-- Name: idx_patient_bookings_branch_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_branch_service_id ON public.patient_bookings USING btree (branch_service_id);


--
-- Name: idx_patient_bookings_canonical_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_canonical_appt ON public.patient_bookings USING btree (canonical_appointment_id);


--
-- Name: idx_patient_bookings_rubitime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_rubitime_id ON public.patient_bookings USING btree (rubitime_id);


--
-- Name: idx_patient_bookings_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_service_id ON public.patient_bookings USING btree (service_id);


--
-- Name: idx_patient_bookings_slot_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_slot_start ON public.patient_bookings USING btree (slot_start);


--
-- Name: idx_patient_bookings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_source ON public.patient_bookings USING btree (source);


--
-- Name: idx_patient_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_status ON public.patient_bookings USING btree (status);


--
-- Name: idx_patient_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_user_id ON public.patient_bookings USING btree (platform_user_id);


--
-- Name: idx_patient_comorbidity_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_comorbidity_organization_id ON public.patient_comorbidity USING btree (organization_id);


--
-- Name: idx_patient_comorbidity_patient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_comorbidity_patient_user_id ON public.patient_comorbidity USING btree (patient_user_id);


--
-- Name: idx_patient_comorbidity_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_comorbidity_status ON public.patient_comorbidity USING btree (patient_user_id, status);


--
-- Name: idx_patient_daily_warmup_presentations_content_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_presentations_content_page ON public.patient_daily_warmup_presentations USING btree (content_page_id);


--
-- Name: idx_patient_daily_warmup_presentations_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_presentations_organization_id ON public.patient_daily_warmup_presentations USING btree (organization_id);


--
-- Name: idx_patient_daily_warmup_video_views_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_video_views_organization_id ON public.patient_daily_warmup_video_views USING btree (organization_id);


--
-- Name: idx_patient_daily_warmup_video_views_page_viewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_video_views_page_viewed ON public.patient_daily_warmup_video_views USING btree (content_page_id, viewed_at);


--
-- Name: idx_patient_daily_warmup_video_views_viewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_video_views_viewed_at ON public.patient_daily_warmup_video_views USING btree (viewed_at);


--
-- Name: idx_patient_diary_day_snapshots_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_diary_day_snapshots_organization_id ON public.patient_diary_day_snapshots USING btree (organization_id);


--
-- Name: idx_patient_files_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_files_category ON public.patient_files USING btree (category);


--
-- Name: idx_patient_files_media_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_files_media_file_id ON public.patient_files USING btree (media_file_id) WHERE (media_file_id IS NOT NULL);


--
-- Name: idx_patient_files_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_files_organization_id ON public.patient_files USING btree (organization_id);


--
-- Name: idx_patient_files_patient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_files_patient_user_id ON public.patient_files USING btree (patient_user_id);


--
-- Name: idx_patient_files_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_files_visit_id ON public.patient_files USING btree (visit_id) WHERE (visit_id IS NOT NULL);


--
-- Name: idx_patient_home_block_items_block_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_home_block_items_block_sort ON public.patient_home_block_items USING btree (block_code, sort_order);


--
-- Name: idx_patient_home_block_items_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_home_block_items_organization_id ON public.patient_home_block_items USING btree (organization_id);


--
-- Name: idx_patient_home_blocks_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_home_blocks_organization_id ON public.patient_home_blocks USING btree (organization_id);


--
-- Name: idx_patient_invites_continuation_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_invites_continuation_expires ON public.patient_invites USING btree (continuation_expires_at) WHERE (continuation_hash IS NOT NULL);


--
-- Name: idx_patient_invites_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_invites_enrollment ON public.patient_invites USING btree (enrollment_id);


--
-- Name: idx_patient_invites_org_patient_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_invites_org_patient_status ON public.patient_invites USING btree (organization_id, patient_user_id, status);


--
-- Name: idx_patient_invites_status_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_invites_status_expires ON public.patient_invites USING btree (status, expires_at);


--
-- Name: idx_patient_lfk_assign_active_template; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patient_lfk_assign_active_template ON public.patient_lfk_assignments USING btree (organization_id, patient_user_id, template_id) WHERE (is_active = true);


--
-- Name: idx_patient_lfk_assignments_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_lfk_assignments_organization_id ON public.patient_lfk_assignments USING btree (organization_id);


--
-- Name: idx_patient_merge_candidates_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_merge_candidates_org_status ON public.patient_merge_candidates USING btree (organization_id, status, created_at DESC);


--
-- Name: idx_patient_payment_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_payment_created_at ON public.patient_payment USING btree (created_at);


--
-- Name: idx_patient_payment_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_payment_organization_id ON public.patient_payment USING btree (organization_id);


--
-- Name: idx_patient_payment_patient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_payment_patient_user_id ON public.patient_payment USING btree (patient_user_id);


--
-- Name: idx_patient_practice_completions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_practice_completions_organization_id ON public.patient_practice_completions USING btree (organization_id);


--
-- Name: idx_pcrf_content_page_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pcrf_content_page_created_desc ON public.patient_content_rating_feedback USING btree (content_page_id, created_at);


--
-- Name: idx_pcrf_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pcrf_organization_id ON public.patient_content_rating_feedback USING btree (organization_id);


--
-- Name: idx_pcrf_user_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pcrf_user_created_desc ON public.patient_content_rating_feedback USING btree (user_id, created_at);


--
-- Name: idx_phone_challenges_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_challenges_expires_at ON public.phone_challenges USING btree (expires_at);


--
-- Name: idx_phone_challenges_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_challenges_phone ON public.phone_challenges USING btree (phone);


--
-- Name: idx_phone_messenger_bind_secrets_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_messenger_bind_secrets_expires ON public.phone_messenger_bind_secrets USING btree (expires_at);


--
-- Name: idx_phone_messenger_bind_secrets_phone_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_messenger_bind_secrets_phone_status ON public.phone_messenger_bind_secrets USING btree (phone_normalized, status);


--
-- Name: idx_platform_user_contacts_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_user_contacts_organization_id ON public.platform_user_contacts USING btree (organization_id);


--
-- Name: idx_platform_user_contacts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_user_contacts_user ON public.platform_user_contacts USING btree (platform_user_id);


--
-- Name: idx_platform_users_integrator_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_integrator_uid ON public.platform_users USING btree (integrator_user_id) WHERE (integrator_user_id IS NOT NULL);


--
-- Name: idx_platform_users_merged_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_merged_at ON public.platform_users USING btree (merged_at) WHERE (merged_at IS NOT NULL);


--
-- Name: idx_platform_users_merged_into; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_merged_into ON public.platform_users USING btree (merged_into_id) WHERE (merged_into_id IS NOT NULL);


--
-- Name: idx_platform_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_phone ON public.platform_users USING btree (phone_normalized) WHERE (phone_normalized IS NOT NULL);


--
-- Name: idx_ppc_user_completed_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppc_user_completed_desc ON public.patient_practice_completions USING btree (user_id, completed_at);


--
-- Name: idx_ppc_user_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppc_user_page ON public.patient_practice_completions USING btree (user_id, content_page_id);


--
-- Name: idx_product_analytics_events_recent_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_events_recent_occurred ON public.product_analytics_events_recent USING btree (occurred_at);


--
-- Name: idx_product_analytics_events_recent_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_events_recent_organization_id ON public.product_analytics_events_recent USING btree (organization_id);


--
-- Name: idx_product_analytics_events_recent_push_open_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_analytics_events_recent_push_open_dedupe ON public.product_analytics_events_recent USING btree (push_tracking_id) WHERE ((event_type = 'push_open'::text) AND (push_tracking_id IS NOT NULL));


--
-- Name: idx_product_analytics_events_recent_type_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_events_recent_type_occurred ON public.product_analytics_events_recent USING btree (event_type, occurred_at);


--
-- Name: idx_product_analytics_hourly_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_hourly_bucket ON public.product_analytics_hourly USING btree (bucket_hour);


--
-- Name: idx_product_analytics_hourly_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_hourly_organization_id ON public.product_analytics_hourly USING btree (organization_id);


--
-- Name: idx_product_analytics_user_hourly_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_user_hourly_organization_id ON public.product_analytics_user_hourly USING btree (organization_id);


--
-- Name: idx_product_analytics_user_hourly_user_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_user_hourly_user_bucket ON public.product_analytics_user_hourly USING btree (user_id, bucket_hour);


--
-- Name: idx_product_push_notifications_kind_slogan_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_kind_slogan_created ON public.product_push_notifications USING btree (push_kind, warmup_slogan_key, created_at);


--
-- Name: idx_product_push_notifications_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_organization_id ON public.product_push_notifications USING btree (organization_id);


--
-- Name: idx_product_push_notifications_topic_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_topic_created ON public.product_push_notifications USING btree (topic_code, created_at);


--
-- Name: idx_product_push_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_user_created ON public.product_push_notifications USING btree (user_id, created_at);


--
-- Name: idx_program_action_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_created_at ON public.program_action_log USING btree (created_at);


--
-- Name: idx_program_action_log_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_instance ON public.program_action_log USING btree (instance_id);


--
-- Name: idx_program_action_log_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_organization_id ON public.program_action_log USING btree (organization_id);


--
-- Name: idx_program_action_log_stage_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_stage_item ON public.program_action_log USING btree (instance_stage_item_id);


--
-- Name: idx_program_item_discussion_item_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_item_created ON public.program_item_discussion_messages USING btree (instance_stage_item_id, created_at);


--
-- Name: idx_program_item_discussion_messages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_messages_organization_id ON public.program_item_discussion_messages USING btree (organization_id);


--
-- Name: idx_program_item_discussion_patient_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_patient_created ON public.program_item_discussion_messages USING btree (patient_user_id, created_at DESC);


--
-- Name: idx_program_item_discussion_reads_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_reads_item ON public.program_item_discussion_reads USING btree (instance_stage_item_id);


--
-- Name: idx_program_item_discussion_reads_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_reads_organization_id ON public.program_item_discussion_reads USING btree (organization_id);


--
-- Name: idx_recommendation_regions_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_regions_body_region ON public.recommendation_regions USING btree (body_region_id);


--
-- Name: idx_recommendation_regions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_regions_organization_id ON public.recommendation_regions USING btree (organization_id);


--
-- Name: idx_recommendations_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_archived ON public.recommendations USING btree (is_archived);


--
-- Name: idx_recommendations_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_body_region ON public.recommendations USING btree (body_region_id);


--
-- Name: idx_recommendations_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_domain ON public.recommendations USING btree (domain);


--
-- Name: idx_recommendations_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_organization_id ON public.recommendations USING btree (organization_id);


--
-- Name: idx_ref_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_items_category ON public.reference_items USING btree (category_id, sort_order);


--
-- Name: idx_reference_categories_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_categories_organization_id ON public.reference_categories USING btree (organization_id);


--
-- Name: idx_reference_items_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_items_organization_id ON public.reference_items USING btree (organization_id);


--
-- Name: idx_reminder_delivery_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_delivery_events_created_at ON public.reminder_delivery_events USING btree (created_at DESC);


--
-- Name: idx_reminder_delivery_events_integrator_log_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reminder_delivery_events_integrator_log_id ON public.reminder_delivery_events USING btree (integrator_delivery_log_id);


--
-- Name: idx_reminder_delivery_events_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_delivery_events_integrator_user_id ON public.reminder_delivery_events USING btree (integrator_user_id);


--
-- Name: idx_reminder_delivery_events_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_delivery_events_organization_id ON public.reminder_delivery_events USING btree (organization_id);


--
-- Name: idx_reminder_journal_action_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_action_created_at ON public.reminder_journal USING btree (action, created_at DESC);


--
-- Name: idx_reminder_journal_occurrence_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_occurrence_id ON public.reminder_journal USING btree (occurrence_id, created_at DESC) WHERE (occurrence_id IS NOT NULL);


--
-- Name: idx_reminder_journal_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_organization_id ON public.reminder_journal USING btree (organization_id);


--
-- Name: idx_reminder_journal_rule_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_rule_created_at ON public.reminder_journal USING btree (rule_id, created_at DESC);


--
-- Name: idx_reminder_occurrence_history_integrator_occ_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reminder_occurrence_history_integrator_occ_id ON public.reminder_occurrence_history USING btree (integrator_occurrence_id);


--
-- Name: idx_reminder_occurrence_history_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_integrator_user_id ON public.reminder_occurrence_history USING btree (integrator_user_id);


--
-- Name: idx_reminder_occurrence_history_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_occurred_at ON public.reminder_occurrence_history USING btree (occurred_at DESC);


--
-- Name: idx_reminder_occurrence_history_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_organization_id ON public.reminder_occurrence_history USING btree (organization_id);


--
-- Name: idx_reminder_occurrence_history_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_seen_at ON public.reminder_occurrence_history USING btree (seen_at) WHERE (seen_at IS NULL);


--
-- Name: idx_reminder_occurrence_history_skipped_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_skipped_at ON public.reminder_occurrence_history USING btree (skipped_at DESC) WHERE (skipped_at IS NOT NULL);


--
-- Name: idx_reminder_occurrence_history_snoozed_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_snoozed_until ON public.reminder_occurrence_history USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL);


--
-- Name: idx_reminder_rules_integrator_rule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reminder_rules_integrator_rule_id ON public.reminder_rules USING btree (integrator_rule_id);


--
-- Name: idx_reminder_rules_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_integrator_user_id ON public.reminder_rules USING btree (integrator_user_id);


--
-- Name: idx_reminder_rules_integrator_user_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_integrator_user_updated_at ON public.reminder_rules USING btree (integrator_user_id, updated_at DESC);


--
-- Name: idx_reminder_rules_linked_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_linked_object ON public.reminder_rules USING btree (linked_object_type, linked_object_id) WHERE ((linked_object_type IS NOT NULL) AND (linked_object_id IS NOT NULL));


--
-- Name: idx_reminder_rules_linked_object_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_linked_object_type ON public.reminder_rules USING btree (linked_object_type) WHERE (linked_object_type IS NOT NULL);


--
-- Name: idx_reminder_rules_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_organization_id ON public.reminder_rules USING btree (organization_id);


--
-- Name: idx_reminder_rules_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_platform_user_id ON public.reminder_rules USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_reminder_rules_platform_user_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_platform_user_updated_at ON public.reminder_rules USING btree (platform_user_id, updated_at DESC) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_saas_org_entitlement_overrides_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saas_org_entitlement_overrides_org ON public.saas_org_entitlement_overrides USING btree (organization_id);


--
-- Name: idx_specialist_signup_intents_user_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_signup_intents_user_pending ON public.specialist_signup_intents USING btree (user_id, status);


--
-- Name: idx_specialist_tasks_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_organization_id ON public.specialist_tasks USING btree (organization_id);


--
-- Name: idx_specialist_tasks_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_owner ON public.specialist_tasks USING btree (owner_user_id);


--
-- Name: idx_specialist_tasks_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_patient ON public.specialist_tasks USING btree (patient_user_id);


--
-- Name: idx_specialist_tasks_remind_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_remind_open ON public.specialist_tasks USING btree (remind_at);


--
-- Name: idx_support_conv_msg_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conv_msg_conv_created ON public.support_conversation_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_support_conv_msg_unread_incoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conv_msg_unread_incoming ON public.support_conversation_messages USING btree (conversation_id) WHERE ((read_at IS NULL) AND (sender_role <> 'user'::text));


--
-- Name: idx_support_conv_msg_unread_user_msgs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conv_msg_unread_user_msgs ON public.support_conversation_messages USING btree (conversation_id) WHERE ((read_at IS NULL) AND (sender_role = 'user'::text));


--
-- Name: idx_support_conversation_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversation_messages_conversation_created ON public.support_conversation_messages USING btree (conversation_id, created_at);


--
-- Name: idx_support_conversation_messages_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_conversation_messages_integrator_id ON public.support_conversation_messages USING btree (integrator_message_id);


--
-- Name: idx_support_conversation_messages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversation_messages_organization_id ON public.support_conversation_messages USING btree (organization_id);


--
-- Name: idx_support_conversations_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_conversations_integrator_id ON public.support_conversations USING btree (integrator_conversation_id);


--
-- Name: idx_support_conversations_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_integrator_user_id ON public.support_conversations USING btree (integrator_user_id) WHERE (integrator_user_id IS NOT NULL);


--
-- Name: idx_support_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_last_message ON public.support_conversations USING btree (last_message_at DESC);


--
-- Name: idx_support_conversations_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_organization_id ON public.support_conversations USING btree (organization_id);


--
-- Name: idx_support_conversations_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_platform_user_id ON public.support_conversations USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_channel_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_channel_occurred ON public.support_delivery_events USING btree (channel_code, occurred_at DESC);


--
-- Name: idx_support_delivery_events_conversation_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_conversation_message ON public.support_delivery_events USING btree (conversation_message_id) WHERE (conversation_message_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_correlation ON public.support_delivery_events USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_integrator_intent_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_delivery_events_integrator_intent_uniq ON public.support_delivery_events USING btree (integrator_intent_event_id) WHERE (integrator_intent_event_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_intent_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_intent_event ON public.support_delivery_events USING btree (integrator_intent_event_id) WHERE (integrator_intent_event_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_organization_id ON public.support_delivery_events USING btree (organization_id);


--
-- Name: idx_support_question_messages_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_question_messages_integrator_id ON public.support_question_messages USING btree (integrator_question_message_id);


--
-- Name: idx_support_question_messages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_question_messages_organization_id ON public.support_question_messages USING btree (organization_id);


--
-- Name: idx_support_question_messages_question_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_question_messages_question_created ON public.support_question_messages USING btree (question_id, created_at);


--
-- Name: idx_support_questions_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_questions_conversation_id ON public.support_questions USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_support_questions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_questions_created ON public.support_questions USING btree (created_at DESC);


--
-- Name: idx_support_questions_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_questions_integrator_id ON public.support_questions USING btree (integrator_question_id);


--
-- Name: idx_support_questions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_questions_organization_id ON public.support_questions USING btree (organization_id);


--
-- Name: idx_symptom_entries_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_organization_id ON public.symptom_entries USING btree (organization_id);


--
-- Name: idx_symptom_entries_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_platform_user_id ON public.symptom_entries USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_symptom_entries_tracking_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_tracking_recorded ON public.symptom_entries USING btree (tracking_id, recorded_at DESC);


--
-- Name: idx_symptom_entries_user_type_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_user_type_recorded ON public.symptom_entries USING btree (user_id, entry_type, recorded_at DESC);


--
-- Name: idx_symptom_trackings_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_deleted ON public.symptom_trackings USING btree (user_id) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_symptom_trackings_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_organization_id ON public.symptom_trackings USING btree (organization_id);


--
-- Name: idx_symptom_trackings_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_platform_user_id ON public.symptom_trackings USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_symptom_trackings_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_user_active ON public.symptom_trackings USING btree (user_id, is_active);


--
-- Name: idx_system_settings_audit_key_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_audit_key_at ON public.system_settings_audit USING btree (key, changed_at DESC);


--
-- Name: idx_system_settings_audit_org_key_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_audit_org_key_at ON public.system_settings_audit USING btree (organization_id, key, changed_at DESC);


--
-- Name: idx_template_exercises_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_exercises_order ON public.lfk_complex_template_exercises USING btree (template_id, sort_order);


--
-- Name: idx_test_attempts_one_open_per_item_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_test_attempts_one_open_per_item_patient ON public.test_attempts USING btree (instance_stage_item_id, patient_user_id) WHERE (submitted_at IS NULL);


--
-- Name: idx_test_attempts_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_organization_id ON public.test_attempts USING btree (organization_id);


--
-- Name: idx_test_attempts_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_patient ON public.test_attempts USING btree (patient_user_id);


--
-- Name: idx_test_attempts_stage_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_stage_item ON public.test_attempts USING btree (instance_stage_item_id);


--
-- Name: idx_test_results_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_results_attempt ON public.test_results USING btree (attempt_id);


--
-- Name: idx_test_results_attempt_test; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_test_results_attempt_test ON public.test_results USING btree (attempt_id, test_id);


--
-- Name: idx_test_results_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_results_organization_id ON public.test_results USING btree (organization_id);


--
-- Name: idx_test_results_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_results_test ON public.test_results USING btree (test_id);


--
-- Name: idx_test_set_items_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_set_items_organization_id ON public.test_set_items USING btree (organization_id);


--
-- Name: idx_test_set_items_set_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_set_items_set_order ON public.test_set_items USING btree (test_set_id, sort_order);


--
-- Name: idx_test_sets_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_sets_archived ON public.test_sets USING btree (is_archived);


--
-- Name: idx_test_sets_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_sets_organization_id ON public.test_sets USING btree (organization_id);


--
-- Name: idx_test_sets_publication_arch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_sets_publication_arch ON public.test_sets USING btree (is_archived, publication_status);


--
-- Name: idx_tests_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_archived ON public.tests USING btree (is_archived);


--
-- Name: idx_tests_assessment_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_assessment_kind ON public.tests USING btree (assessment_kind);


--
-- Name: idx_tests_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_body_region ON public.tests USING btree (body_region_id);


--
-- Name: idx_tests_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_organization_id ON public.tests USING btree (organization_id);


--
-- Name: idx_tests_title_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_title_search ON public.tests USING btree (title);


--
-- Name: idx_treatment_program_events_instance_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_events_instance_created ON public.treatment_program_events USING btree (instance_id, created_at DESC);


--
-- Name: idx_treatment_program_events_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_events_organization_id ON public.treatment_program_events USING btree (organization_id);


--
-- Name: idx_treatment_program_inst_stage_groups_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_inst_stage_groups_stage_order ON public.treatment_program_instance_stage_groups USING btree (stage_id, sort_order);


--
-- Name: idx_treatment_program_instance_stage_groups_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stage_groups_organization_id ON public.treatment_program_instance_stage_groups USING btree (organization_id);


--
-- Name: idx_treatment_program_instance_stage_items_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stage_items_organization_id ON public.treatment_program_instance_stage_items USING btree (organization_id);


--
-- Name: idx_treatment_program_instance_stage_items_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stage_items_stage_order ON public.treatment_program_instance_stage_items USING btree (stage_id, sort_order);


--
-- Name: idx_treatment_program_instance_stages_instance_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stages_instance_order ON public.treatment_program_instance_stages USING btree (instance_id, sort_order);


--
-- Name: idx_treatment_program_instance_stages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stages_organization_id ON public.treatment_program_instance_stages USING btree (organization_id);


--
-- Name: idx_treatment_program_instances_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instances_organization_id ON public.treatment_program_instances USING btree (organization_id);


--
-- Name: idx_treatment_program_instances_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instances_patient ON public.treatment_program_instances USING btree (patient_user_id, updated_at);


--
-- Name: idx_treatment_program_instances_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instances_template ON public.treatment_program_instances USING btree (template_id);


--
-- Name: idx_treatment_program_stage_items_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_stage_items_stage_order ON public.treatment_program_template_stage_items USING btree (stage_id, sort_order);


--
-- Name: idx_treatment_program_template_stage_groups_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_template_stage_groups_organization_id ON public.treatment_program_template_stage_groups USING btree (organization_id);


--
-- Name: idx_treatment_program_template_stage_items_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_template_stage_items_organization_id ON public.treatment_program_template_stage_items USING btree (organization_id);


--
-- Name: idx_treatment_program_template_stages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_template_stages_organization_id ON public.treatment_program_template_stages USING btree (organization_id);


--
-- Name: idx_treatment_program_template_stages_template_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_template_stages_template_order ON public.treatment_program_template_stages USING btree (template_id, sort_order);


--
-- Name: idx_treatment_program_templates_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_templates_organization_id ON public.treatment_program_templates USING btree (organization_id);


--
-- Name: idx_treatment_program_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_templates_status ON public.treatment_program_templates USING btree (status);


--
-- Name: idx_treatment_program_tpl_stage_groups_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_tpl_stage_groups_stage_order ON public.treatment_program_template_stage_groups USING btree (stage_id, sort_order);


--
-- Name: idx_user_channel_bindings_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_bindings_lookup ON public.user_channel_bindings USING btree (channel_code, external_id);


--
-- Name: idx_user_channel_bindings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_bindings_user_id ON public.user_channel_bindings USING btree (user_id);


--
-- Name: idx_user_channel_preferences_one_auth_pref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_channel_preferences_one_auth_pref ON public.user_channel_preferences USING btree (user_id) WHERE (is_preferred_for_auth = true);


--
-- Name: idx_user_channel_preferences_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_preferences_platform_user_id ON public.user_channel_preferences USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_user_channel_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_preferences_user_id ON public.user_channel_preferences USING btree (user_id);


--
-- Name: idx_user_email_setup_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_setup_tokens_expires_at ON public.user_email_setup_tokens USING btree (expires_at);


--
-- Name: idx_user_email_setup_tokens_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_setup_tokens_user_email ON public.user_email_setup_tokens USING btree (user_id, email_normalized);


--
-- Name: idx_user_notification_topic_channels_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_topic_channels_user ON public.user_notification_topic_channels USING btree (user_id);


--
-- Name: idx_user_notification_topics_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_topics_user ON public.user_notification_topics USING btree (user_id);


--
-- Name: idx_user_phone_history_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_phone_history_organization_id ON public.user_phone_history USING btree (organization_id);


--
-- Name: idx_user_phone_history_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_phone_history_phone ON public.user_phone_history USING btree (phone_normalized);


--
-- Name: idx_user_phone_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_phone_history_user ON public.user_phone_history USING btree (platform_user_id);


--
-- Name: idx_user_subscriptions_webapp_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_webapp_organization_id ON public.user_subscriptions_webapp USING btree (organization_id);


--
-- Name: idx_user_subscriptions_webapp_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_webapp_topic ON public.user_subscriptions_webapp USING btree (integrator_topic_id);


--
-- Name: idx_user_subscriptions_webapp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_webapp_user ON public.user_subscriptions_webapp USING btree (integrator_user_id);


--
-- Name: idx_user_web_push_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_web_push_subscriptions_user ON public.user_web_push_subscriptions USING btree (user_id);


--
-- Name: idx_webapp_reminder_occurrences_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webapp_reminder_occurrences_organization_id ON public.webapp_reminder_occurrences USING btree (organization_id);


--
-- Name: media_transcode_jobs_one_active_per_media; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_transcode_jobs_one_active_per_media ON public.media_transcode_jobs USING btree (media_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: operator_incidents_open_dedup_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operator_incidents_open_dedup_key_uniq ON public.operator_incidents USING btree (dedup_key) WHERE (resolved_at IS NULL);


--
-- Name: organization_member_invites_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_member_invites_token_hash_key ON public.organization_member_invites USING btree (token_hash);


--
-- Name: patient_invites_continuation_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX patient_invites_continuation_hash_key ON public.patient_invites USING btree (continuation_hash) WHERE (continuation_hash IS NOT NULL);


--
-- Name: patient_invites_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX patient_invites_token_hash_key ON public.patient_invites USING btree (token_hash);


--
-- Name: product_analytics_hourly_global_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_analytics_hourly_global_unique ON public.product_analytics_hourly USING btree (bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind, warmup_slogan_key) WHERE (organization_id IS NULL);


--
-- Name: product_analytics_hourly_org_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_analytics_hourly_org_unique ON public.product_analytics_hourly USING btree (organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind, warmup_slogan_key) WHERE (organization_id IS NOT NULL);


--
-- Name: product_analytics_user_hourly_global_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_analytics_user_hourly_global_unique ON public.product_analytics_user_hourly USING btree (bucket_hour, user_id, entry_channel, page_key) WHERE (organization_id IS NULL);


--
-- Name: product_analytics_user_hourly_org_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_analytics_user_hourly_org_unique ON public.product_analytics_user_hourly USING btree (organization_id, bucket_hour, user_id, entry_channel, page_key) WHERE (organization_id IS NOT NULL);


--
-- Name: reference_items_category_deleted_active_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_items_category_deleted_active_sort_idx ON public.reference_items USING btree (category_id, deleted_at, is_active, sort_order);


--
-- Name: saas_isolation_coverage_runs_finished_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saas_isolation_coverage_runs_finished_at_idx ON public.saas_isolation_coverage_runs USING btree (finished_at);


--
-- Name: saas_isolation_events_fingerprint_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX saas_isolation_events_fingerprint_uidx ON public.saas_isolation_events USING btree (fingerprint);


--
-- Name: saas_isolation_events_status_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saas_isolation_events_status_last_seen_idx ON public.saas_isolation_events USING btree (lifecycle_status, last_seen_at);


--
-- Name: system_settings_global_key_scope_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_settings_global_key_scope_uidx ON public.system_settings USING btree (key, scope) WHERE (organization_id IS NULL);


--
-- Name: system_settings_org_key_scope_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_settings_org_key_scope_uidx ON public.system_settings USING btree (key, scope, organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: treatment_program_instance_stage_groups_one_rec_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_instance_stage_groups_one_rec_per_stage ON public.treatment_program_instance_stage_groups USING btree (stage_id) WHERE (system_kind = 'recommendations'::text);


--
-- Name: treatment_program_instance_stage_groups_one_tests_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_instance_stage_groups_one_tests_per_stage ON public.treatment_program_instance_stage_groups USING btree (stage_id) WHERE (system_kind = 'tests'::text);


--
-- Name: treatment_program_template_stage_groups_one_rec_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_template_stage_groups_one_rec_per_stage ON public.treatment_program_template_stage_groups USING btree (stage_id) WHERE (system_kind = 'recommendations'::text);


--
-- Name: treatment_program_template_stage_groups_one_tests_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_template_stage_groups_one_tests_per_stage ON public.treatment_program_template_stage_groups USING btree (stage_id) WHERE (system_kind = 'tests'::text);


--
-- Name: treatment_program_template_stages_tpl_id_sort_order_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_template_stages_tpl_id_sort_order_uidx ON public.treatment_program_template_stages USING btree (template_id, sort_order);


--
-- Name: uq_be_cancel_policies_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_cancel_policies_scope ON public.be_cancellation_policies USING btree (organization_id, scope_level, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: uq_be_patient_booking_profiles_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_patient_booking_profiles_org_user ON public.be_patient_booking_profiles USING btree (organization_id, platform_user_id);


--
-- Name: uq_be_reschedule_policies_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_reschedule_policies_scope ON public.be_reschedule_policies USING btree (organization_id, scope_level, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: uq_be_working_days_scope_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_working_days_scope_date ON public.be_working_days USING btree (organization_id, COALESCE(specialist_id, '00000000-0000-0000-0000-000000000000'::uuid), work_date);


--
-- Name: uq_clinic_public_directory_entries_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_clinic_public_directory_entries_slug ON public.clinic_public_directory_entries USING btree (slug);


--
-- Name: uq_doctor_patient_support_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_doctor_patient_support_patient ON public.doctor_patient_support USING btree (patient_user_id);


--
-- Name: uq_media_folders_child_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_child_name ON public.media_folders USING btree (parent_id, name_normalized) WHERE (parent_id IS NOT NULL);


--
-- Name: uq_media_folders_client_files_root; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_client_files_root ON public.media_folders USING btree ((1)) WHERE (kind = 'client_files_root'::text);


--
-- Name: uq_media_folders_client_patient_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_client_patient_user ON public.media_folders USING btree (patient_user_id) WHERE ((kind = 'client_patient'::text) AND (patient_user_id IS NOT NULL));


--
-- Name: uq_media_folders_root_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_root_name ON public.media_folders USING btree (name_normalized) WHERE (parent_id IS NULL);


--
-- Name: uq_media_upload_sessions_one_active_per_media; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_upload_sessions_one_active_per_media ON public.media_upload_sessions USING btree (media_id) WHERE (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]));


--
-- Name: uq_organization_member_invites_org_email_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_organization_member_invites_org_email_pending ON public.organization_member_invites USING btree (organization_id, invited_email) WHERE (status = 'pending'::text);


--
-- Name: uq_organization_slug_claims_current_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_organization_slug_claims_current_org ON public.organization_slug_claims USING btree (organization_id) WHERE (kind = 'current'::text);


--
-- Name: uq_organization_slug_claims_reservation_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_organization_slug_claims_reservation_org ON public.organization_slug_claims USING btree (organization_id) WHERE (kind = 'reservation'::text);


--
-- Name: uq_organization_slug_claims_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_organization_slug_claims_slug ON public.organization_slug_claims USING btree (slug);


--
-- Name: uq_outgoing_delivery_queue_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outgoing_delivery_queue_event_id ON public.outgoing_delivery_queue USING btree (event_id);


--
-- Name: uq_patient_invites_org_patient_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_patient_invites_org_patient_pending ON public.patient_invites USING btree (organization_id, patient_user_id) WHERE (status = 'pending'::text);


--
-- Name: uq_patient_merge_candidates_org_pending_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_patient_merge_candidates_org_pending_pair ON public.patient_merge_candidates USING btree (organization_id, anchor_user_id, candidate_user_id) WHERE (status = 'pending'::text);


--
-- Name: uq_platform_user_contacts_user_type_value; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_platform_user_contacts_user_type_value ON public.platform_user_contacts USING btree (platform_user_id, contact_type, value_normalized);


--
-- Name: uq_platform_users_email_normalized_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_platform_users_email_normalized_active ON public.platform_users USING btree (email_normalized) WHERE ((merged_into_id IS NULL) AND (email_normalized IS NOT NULL));


--
-- Name: uq_program_item_discussion_support_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_program_item_discussion_support_message_id ON public.program_item_discussion_messages USING btree (support_message_id) WHERE (support_message_id IS NOT NULL);


--
-- Name: uq_reminder_journal_once_done_per_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reminder_journal_once_done_per_occurrence ON public.reminder_journal USING btree (occurrence_id, action) WHERE ((occurrence_id IS NOT NULL) AND (action = 'done'::text));


--
-- Name: uq_reminder_journal_once_skipped_per_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reminder_journal_once_skipped_per_occurrence ON public.reminder_journal USING btree (occurrence_id, action) WHERE ((occurrence_id IS NOT NULL) AND (action = 'skipped'::text));


--
-- Name: uq_reminder_journal_snooze_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reminder_journal_snooze_dedupe ON public.reminder_journal USING btree (occurrence_id, action, snooze_until) WHERE ((occurrence_id IS NOT NULL) AND (action = 'snoozed'::text) AND (snooze_until IS NOT NULL));


--
-- Name: uq_specialist_signup_intents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_specialist_signup_intents_user_id ON public.specialist_signup_intents USING btree (user_id);


--
-- Name: uq_symptom_entries_patient_practice_completion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_symptom_entries_patient_practice_completion_id ON public.symptom_entries USING btree (patient_practice_completion_id) WHERE (patient_practice_completion_id IS NOT NULL);


--
-- Name: uq_symptom_trackings_general_wellbeing_active_platform_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_symptom_trackings_general_wellbeing_active_platform_user ON public.symptom_trackings USING btree (platform_user_id) WHERE ((symptom_key = 'general_wellbeing'::text) AND (deleted_at IS NULL) AND (platform_user_id IS NOT NULL));


--
-- Name: uq_symptom_trackings_warmup_feeling_active_platform_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_symptom_trackings_warmup_feeling_active_platform_user ON public.symptom_trackings USING btree (platform_user_id) WHERE ((symptom_key = 'warmup_feeling'::text) AND (deleted_at IS NULL) AND (platform_user_id IS NOT NULL));


--
-- Name: uq_treatment_program_instances_one_active_per_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_treatment_program_instances_one_active_per_patient ON public.treatment_program_instances USING btree (patient_user_id) WHERE (status = 'active'::text);


--
-- Name: uq_user_channel_preferences_platform_user_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_channel_preferences_platform_user_channel ON public.user_channel_preferences USING btree (platform_user_id, channel_code);


--
-- Name: uq_user_phone_history_phone_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_phone_history_phone_active ON public.user_phone_history USING btree (phone_normalized) WHERE (valid_to IS NULL);


--
-- Name: uq_user_phone_history_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_phone_history_user_active ON public.user_phone_history USING btree (platform_user_id) WHERE (valid_to IS NULL);


--
-- Name: uq_user_web_push_subscriptions_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_web_push_subscriptions_endpoint ON public.user_web_push_subscriptions USING btree (endpoint);


--
-- Name: user_email_setup_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_email_setup_tokens_token_hash_key ON public.user_email_setup_tokens USING btree (token_hash);


--
-- Name: webapp_reminder_occurrences_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webapp_reminder_occurrences_due_idx ON public.webapp_reminder_occurrences USING btree (status, planned_at) WHERE (status = 'planned'::text);


--
-- Name: webapp_reminder_occurrences_platform_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webapp_reminder_occurrences_platform_user_idx ON public.webapp_reminder_occurrences USING btree (platform_user_id);


--
-- Name: webapp_reminder_occurrences_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webapp_reminder_occurrences_rule_idx ON public.webapp_reminder_occurrences USING btree (integrator_rule_id);


--
-- Name: webapp_reminder_occurrences_rule_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webapp_reminder_occurrences_rule_key_uniq ON public.webapp_reminder_occurrences USING btree (integrator_rule_id, occurrence_key);


--
-- Name: mailing_topics stage13_freeze_mailing_topics; Type: TRIGGER; Schema: integrator; Owner: -
--

CREATE TRIGGER stage13_freeze_mailing_topics BEFORE INSERT OR DELETE OR UPDATE ON integrator.mailing_topics FOR EACH ROW EXECUTE FUNCTION integrator.stage13_prevent_write_mailing_topics();


--
-- Name: user_subscriptions stage13_freeze_user_subscriptions; Type: TRIGGER; Schema: integrator; Owner: -
--

CREATE TRIGGER stage13_freeze_user_subscriptions BEFORE INSERT OR DELETE OR UPDATE ON integrator.user_subscriptions FOR EACH ROW EXECUTE FUNCTION integrator.stage13_prevent_write_user_subscriptions();


--
-- Name: app_runtime_settings app_runtime_settings_audit_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_runtime_settings_audit_change AFTER INSERT OR UPDATE ON public.app_runtime_settings FOR EACH ROW EXECUTE FUNCTION public.audit_app_runtime_settings_change();


--
-- Name: be_organizations be_organizations_reference_catalog_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER be_organizations_reference_catalog_snapshot AFTER INSERT ON public.be_organizations FOR EACH ROW EXECUTE FUNCTION app.seed_reference_catalog_after_organization_insert();


--
-- Name: clinic_public_directory_entries clinic_public_directory_current_slug_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_public_directory_current_slug_guard BEFORE INSERT OR UPDATE OF organization_id, slug ON public.clinic_public_directory_entries FOR EACH ROW EXECUTE FUNCTION app.guard_clinic_directory_current_slug();


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lfk_complex_template_exercises_owner_guard BEFORE INSERT OR UPDATE OF owner_kind, organization_id, template_id, exercise_id ON public.lfk_complex_template_exercises FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();


--
-- Name: lfk_exercise_media lfk_exercise_media_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lfk_exercise_media_owner_guard BEFORE INSERT OR UPDATE OF owner_kind, organization_id, exercise_id, media_url ON public.lfk_exercise_media FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();


--
-- Name: lfk_exercise_regions lfk_exercise_regions_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lfk_exercise_regions_owner_guard BEFORE INSERT OR UPDATE OF owner_kind, organization_id, exercise_id ON public.lfk_exercise_regions FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();


--
-- Name: organization_slug_claims organization_slug_claims_alias_complete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER organization_slug_claims_alias_complete_guard AFTER INSERT ON public.organization_slug_claims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((new.kind = 'alias'::text)) EXECUTE FUNCTION app.assert_organization_slug_alias_complete();


--
-- Name: organization_slug_claims organization_slug_claims_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_slug_claims_immutable_guard BEFORE DELETE OR UPDATE ON public.organization_slug_claims FOR EACH ROW EXECUTE FUNCTION app.guard_organization_slug_claim_mutation();


--
-- Name: organization_slug_claims organization_slug_claims_rename_complete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER organization_slug_claims_rename_complete_guard AFTER UPDATE ON public.organization_slug_claims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.kind = 'current'::text) AND (new.kind = 'current'::text) AND (old.slug IS DISTINCT FROM new.slug))) EXECUTE FUNCTION app.assert_organization_slug_rename_complete();


--
-- Name: organization_slug_rename_events organization_slug_rename_events_immutable_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_slug_rename_events_immutable_guard BEFORE DELETE OR UPDATE ON public.organization_slug_rename_events FOR EACH ROW EXECUTE FUNCTION app.guard_organization_slug_rename_event_mutation();


--
-- Name: system_settings system_settings_sync_registered_runtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER system_settings_sync_registered_runtime AFTER INSERT OR UPDATE OF value_json, updated_at, updated_by ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.sync_registered_app_runtime_setting();


--
-- Name: media_folders trg_media_folders_cycle_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_folders_cycle_upd BEFORE UPDATE OF parent_id ON public.media_folders FOR EACH ROW WHEN ((new.parent_id IS DISTINCT FROM old.parent_id)) EXECUTE FUNCTION public.media_folders_prevent_cycle();


--
-- Name: media_folders trg_media_folders_depth_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_folders_depth_ins BEFORE INSERT ON public.media_folders FOR EACH ROW EXECUTE FUNCTION public.media_folders_enforce_depth();


--
-- Name: media_folders trg_media_folders_depth_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_folders_depth_upd BEFORE UPDATE OF parent_id ON public.media_folders FOR EACH ROW WHEN ((new.parent_id IS DISTINCT FROM old.parent_id)) EXECUTE FUNCTION public.media_folders_enforce_depth();


--
-- Name: contacts contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: content_access_grants content_access_grants_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.content_access_grants
    ADD CONSTRAINT content_access_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: content_access_grants content_access_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.content_access_grants
    ADD CONSTRAINT content_access_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES integrator.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversation_messages
    ADD CONSTRAINT conversation_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversations
    ADD CONSTRAINT conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversations
    ADD CONSTRAINT conversations_user_identity_id_fkey FOREIGN KEY (user_identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: system_settings integrator_system_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.system_settings
    ADD CONSTRAINT integrator_system_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_mailing_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_mailing_id_fkey FOREIGN KEY (mailing_id) REFERENCES integrator.mailings(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: mailings mailings_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings
    ADD CONSTRAINT mailings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: mailings mailings_topic_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings
    ADD CONSTRAINT mailings_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES integrator.mailing_topics(id) ON DELETE CASCADE;


--
-- Name: message_drafts message_drafts_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.message_drafts
    ADD CONSTRAINT message_drafts_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: message_drafts message_drafts_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.message_drafts
    ADD CONSTRAINT message_drafts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: question_messages question_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.question_messages
    ADD CONSTRAINT question_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: question_messages question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.question_messages
    ADD CONSTRAINT question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES integrator.user_questions(id) ON DELETE CASCADE;


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES integrator.rubitime_branches(id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_cooperator_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_cooperator_id_fkey FOREIGN KEY (cooperator_id) REFERENCES integrator.rubitime_cooperators(id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_service_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_service_id_fkey FOREIGN KEY (service_id) REFERENCES integrator.rubitime_services(id);


--
-- Name: telegram_state telegram_state_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_state
    ADD CONSTRAINT telegram_state_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: user_questions user_questions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES integrator.conversations(id) ON DELETE SET NULL;


--
-- Name: user_questions user_questions_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_questions user_questions_user_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_user_identity_id_fkey FOREIGN KEY (user_identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES integrator.user_reminder_occurrences(id) ON DELETE CASCADE;


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_reminder_occurrences user_reminder_occurrences_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_reminder_occurrences user_reminder_occurrences_rule_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES integrator.user_reminder_rules(id) ON DELETE CASCADE;


--
-- Name: user_reminder_rules user_reminder_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_reminder_rules user_reminder_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_subscription_id_fkey FOREIGN KEY (topic_id) REFERENCES integrator.mailing_topics(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: users users_merged_into_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.users
    ADD CONSTRAINT users_merged_into_user_id_fkey FOREIGN KEY (merged_into_user_id) REFERENCES integrator.users(id);


--
-- Name: admin_audit_log admin_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: admin_audit_log admin_audit_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: app_runtime_settings_audit app_runtime_settings_audit_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_runtime_settings_audit
    ADD CONSTRAINT app_runtime_settings_audit_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: app_runtime_settings_audit app_runtime_settings_audit_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_runtime_settings_audit
    ADD CONSTRAINT app_runtime_settings_audit_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: app_runtime_settings app_runtime_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_runtime_settings
    ADD CONSTRAINT app_runtime_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: app_runtime_settings app_runtime_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_runtime_settings
    ADD CONSTRAINT app_runtime_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: appointment_records appointment_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: appointment_records appointment_records_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_applied_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_applied_policy_id_fkey FOREIGN KEY (applied_policy_id) REFERENCES public.be_cancellation_policies(id) ON DELETE SET NULL;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_events be_appointment_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_events be_appointment_events_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_events be_appointment_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_history_events be_appointment_history_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_history_events be_appointment_history_events_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_history_events be_appointment_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_no_shows be_appointment_no_shows_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_no_shows
    ADD CONSTRAINT be_appointment_no_shows_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_no_shows be_appointment_no_shows_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_no_shows
    ADD CONSTRAINT be_appointment_no_shows_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_no_shows be_appointment_no_shows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_no_shows
    ADD CONSTRAINT be_appointment_no_shows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_applied_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_applied_policy_id_fkey FOREIGN KEY (applied_policy_id) REFERENCES public.be_reschedule_policies(id) ON DELETE SET NULL;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_appointments be_appointments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointments be_appointments_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE SET NULL;


--
-- Name: be_availability_rules be_availability_rules_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_availability_rules be_availability_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_availability_rules be_availability_rules_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_fields be_booking_form_fields_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_fields
    ADD CONSTRAINT be_booking_form_fields_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_submissions be_booking_form_submissions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_submissions be_booking_form_submissions_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.be_booking_form_fields(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_submissions be_booking_form_submissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_branches be_branches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_branches
    ADD CONSTRAINT be_branches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_cancellation_policies be_cancellation_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_cancellation_policies
    ADD CONSTRAINT be_cancellation_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_clinic_services be_clinic_services_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_clinic_services
    ADD CONSTRAINT be_clinic_services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_external_entity_mappings be_external_entity_mappings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_external_entity_mappings
    ADD CONSTRAINT be_external_entity_mappings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_organization_members be_organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organization_members
    ADD CONSTRAINT be_organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_organization_members be_organization_members_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organization_members
    ADD CONSTRAINT be_organization_members_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_organization_members be_organization_members_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organization_members
    ADD CONSTRAINT be_organization_members_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE SET NULL;


--
-- Name: be_organizations be_organizations_tariff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organizations
    ADD CONSTRAINT be_organizations_tariff_id_fkey FOREIGN KEY (tariff_id) REFERENCES public.saas_tariffs(id) ON DELETE SET NULL;


--
-- Name: be_package_history_events be_package_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_history_events
    ADD CONSTRAINT be_package_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_package_history_events be_package_history_events_patient_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_history_events
    ADD CONSTRAINT be_package_history_events_patient_package_id_fkey FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE CASCADE;


--
-- Name: be_package_items be_package_items_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_items
    ADD CONSTRAINT be_package_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.be_subscription_packages(id) ON DELETE CASCADE;


--
-- Name: be_package_items be_package_items_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_items
    ADD CONSTRAINT be_package_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE RESTRICT;


--
-- Name: be_package_usages be_package_usages_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_package_usages be_package_usages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_created_by_fkey FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_package_usages be_package_usages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_package_usages be_package_usages_patient_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_patient_package_id_fkey FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE CASCADE;


--
-- Name: be_package_usages be_package_usages_patient_package_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_patient_package_item_id_fkey FOREIGN KEY (patient_package_item_id) REFERENCES public.be_patient_package_items(id) ON DELETE CASCADE;


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_patient_package_items be_patient_package_items_patient_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_package_items
    ADD CONSTRAINT be_patient_package_items_patient_package_id_fkey FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE CASCADE;


--
-- Name: be_patient_package_items be_patient_package_items_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_package_items
    ADD CONSTRAINT be_patient_package_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE RESTRICT;


--
-- Name: be_patient_packages be_patient_packages_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_assigned_by_fkey FOREIGN KEY (assigned_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_patient_packages be_patient_packages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_patient_packages be_patient_packages_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_patient_packages be_patient_packages_subscription_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_subscription_package_id_fkey FOREIGN KEY (subscription_package_id) REFERENCES public.be_subscription_packages(id) ON DELETE SET NULL;


--
-- Name: be_patient_timeline_events be_patient_timeline_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_timeline_events
    ADD CONSTRAINT be_patient_timeline_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_patient_timeline_events be_patient_timeline_events_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_timeline_events
    ADD CONSTRAINT be_patient_timeline_events_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_payment_history_events be_payment_history_events_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_payment_history_events be_payment_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payment_history_events be_payment_history_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.be_payments(id) ON DELETE SET NULL;


--
-- Name: be_payment_history_events be_payment_history_events_refund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.be_refunds(id) ON DELETE SET NULL;


--
-- Name: be_payment_intents be_payment_intents_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_payment_intents be_payment_intents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payment_intents be_payment_intents_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_payment_provider_events be_payment_provider_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_provider_events
    ADD CONSTRAINT be_payment_provider_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payments be_payments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_payments be_payments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payments be_payments_payment_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES public.be_payment_intents(id) ON DELETE CASCADE;


--
-- Name: be_prepayment_policies be_prepayment_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_prepayment_policies
    ADD CONSTRAINT be_prepayment_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_prepayment_policies be_prepayment_policies_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_prepayment_policies
    ADD CONSTRAINT be_prepayment_policies_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE CASCADE;


--
-- Name: be_product_history_events be_product_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_history_events
    ADD CONSTRAINT be_product_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_product_history_events be_product_history_events_product_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_history_events
    ADD CONSTRAINT be_product_history_events_product_purchase_id_fkey FOREIGN KEY (product_purchase_id) REFERENCES public.be_product_purchases(id) ON DELETE CASCADE;


--
-- Name: be_product_pay_links be_product_pay_links_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_pay_links
    ADD CONSTRAINT be_product_pay_links_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_product_pay_links be_product_pay_links_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_pay_links
    ADD CONSTRAINT be_product_pay_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.be_products(id) ON DELETE CASCADE;


--
-- Name: be_product_purchases be_product_purchases_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_assigned_by_fkey FOREIGN KEY (assigned_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_product_purchases be_product_purchases_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_product_purchases be_product_purchases_pay_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_pay_link_id_fkey FOREIGN KEY (pay_link_id) REFERENCES public.be_product_pay_links(id) ON DELETE SET NULL;


--
-- Name: be_product_purchases be_product_purchases_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_product_purchases be_product_purchases_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.be_products(id) ON DELETE RESTRICT;


--
-- Name: be_products be_products_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: be_products be_products_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_products be_products_subscription_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_subscription_package_id_fkey FOREIGN KEY (subscription_package_id) REFERENCES public.be_subscription_packages(id) ON DELETE SET NULL;


--
-- Name: be_refunds be_refunds_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_refunds be_refunds_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_refunds be_refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.be_payments(id) ON DELETE CASCADE;


--
-- Name: be_reschedule_policies be_reschedule_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_reschedule_policies
    ADD CONSTRAINT be_reschedule_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_rooms be_rooms_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT be_rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_rooms be_rooms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT be_rooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_schedule_templates be_schedule_templates_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_templates
    ADD CONSTRAINT be_schedule_templates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_schedule_templates be_schedule_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_templates
    ADD CONSTRAINT be_schedule_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_service_location_availability be_sla_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_sla_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_service_location_availability be_sla_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_sla_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_service_location_availability be_sla_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_sla_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE CASCADE;


--
-- Name: be_specialist_locations be_specialist_locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_specialist_locations be_specialist_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_locations be_specialist_locations_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_specialist_rooms be_specialist_rooms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_rooms be_specialist_rooms_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_specialist_rooms be_specialist_rooms_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_specialists be_specialists_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialists
    ADD CONSTRAINT be_specialists_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE SET NULL;


--
-- Name: be_specialist_service_availability be_ssa_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_subscription_packages be_subscription_packages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_subscription_packages
    ADD CONSTRAINT be_subscription_packages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_working_days be_working_days_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_days
    ADD CONSTRAINT be_working_days_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_working_days be_working_days_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_days
    ADD CONSTRAINT be_working_days_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_working_days be_working_days_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_days
    ADD CONSTRAINT be_working_days_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_working_days be_working_days_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_days
    ADD CONSTRAINT be_working_days_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: booking_branch_services booking_branch_services_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.booking_branches(id);


--
-- Name: booking_branch_services booking_branch_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.booking_services(id);


--
-- Name: booking_branch_services booking_branch_services_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.booking_specialists(id);


--
-- Name: booking_branches booking_branches_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branches
    ADD CONSTRAINT booking_branches_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.booking_cities(id);


--
-- Name: booking_specialists booking_specialists_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_specialists
    ADD CONSTRAINT booking_specialists_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.booking_branches(id);


--
-- Name: broadcast_audit broadcast_audit_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit
    ADD CONSTRAINT broadcast_audit_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_audit_id_broadcast_audit_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_audit_id_broadcast_audit_id_fk FOREIGN KEY (audit_id) REFERENCES public.broadcast_audit(id) ON DELETE CASCADE;


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_platform_user_id_platform_users_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_platform_user_id_platform_users_id_f FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: broadcast_drafts broadcast_drafts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_drafts
    ADD CONSTRAINT broadcast_drafts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: channel_link_secrets channel_link_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_secrets
    ADD CONSTRAINT channel_link_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinic_public_directory_entries clinic_public_directory_entries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_public_directory_entries
    ADD CONSTRAINT clinic_public_directory_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_anamnesis_illness clinical_anamnesis_illness_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_illness
    ADD CONSTRAINT clinical_anamnesis_illness_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: clinical_anamnesis_illness clinical_anamnesis_illness_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_illness
    ADD CONSTRAINT clinical_anamnesis_illness_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_anamnesis_illness clinical_anamnesis_illness_patient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_illness
    ADD CONSTRAINT clinical_anamnesis_illness_patient_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinical_anamnesis_lifestyle clinical_anamnesis_lifestyle_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_lifestyle
    ADD CONSTRAINT clinical_anamnesis_lifestyle_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: clinical_anamnesis_lifestyle clinical_anamnesis_lifestyle_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_lifestyle
    ADD CONSTRAINT clinical_anamnesis_lifestyle_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_anamnesis_lifestyle clinical_anamnesis_lifestyle_patient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_lifestyle
    ADD CONSTRAINT clinical_anamnesis_lifestyle_patient_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinical_anamnesis_trauma clinical_anamnesis_trauma_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_trauma
    ADD CONSTRAINT clinical_anamnesis_trauma_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: clinical_anamnesis_trauma clinical_anamnesis_trauma_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_trauma
    ADD CONSTRAINT clinical_anamnesis_trauma_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_anamnesis_trauma clinical_anamnesis_trauma_patient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_anamnesis_trauma
    ADD CONSTRAINT clinical_anamnesis_trauma_patient_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinical_complaint clinical_complaint_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint
    ADD CONSTRAINT clinical_complaint_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_complaint clinical_complaint_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint
    ADD CONSTRAINT clinical_complaint_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinical_complaint clinical_complaint_source_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint
    ADD CONSTRAINT clinical_complaint_source_visit_id_fkey FOREIGN KEY (source_visit_id) REFERENCES public.clinical_visit(id) ON DELETE CASCADE;


--
-- Name: clinical_complaint_update clinical_complaint_update_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint_update
    ADD CONSTRAINT clinical_complaint_update_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.clinical_complaint(id) ON DELETE CASCADE;


--
-- Name: clinical_complaint_update clinical_complaint_update_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint_update
    ADD CONSTRAINT clinical_complaint_update_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_complaint_update clinical_complaint_update_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_complaint_update
    ADD CONSTRAINT clinical_complaint_update_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.clinical_visit(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis_catalog clinical_diagnosis_catalog_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_catalog
    ADD CONSTRAINT clinical_diagnosis_catalog_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: clinical_diagnosis clinical_diagnosis_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis
    ADD CONSTRAINT clinical_diagnosis_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.clinical_diagnosis_catalog(id) ON DELETE SET NULL;


--
-- Name: clinical_diagnosis_catalog clinical_diagnosis_catalog_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_catalog
    ADD CONSTRAINT clinical_diagnosis_catalog_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis clinical_diagnosis_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis
    ADD CONSTRAINT clinical_diagnosis_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis clinical_diagnosis_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis
    ADD CONSTRAINT clinical_diagnosis_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis clinical_diagnosis_source_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis
    ADD CONSTRAINT clinical_diagnosis_source_visit_id_fkey FOREIGN KEY (source_visit_id) REFERENCES public.clinical_visit(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis_status_history clinical_diagnosis_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_status_history
    ADD CONSTRAINT clinical_diagnosis_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: clinical_diagnosis_status_history clinical_diagnosis_status_history_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_status_history
    ADD CONSTRAINT clinical_diagnosis_status_history_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.clinical_diagnosis(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis_status_history clinical_diagnosis_status_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_status_history
    ADD CONSTRAINT clinical_diagnosis_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis_update clinical_diagnosis_update_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_update
    ADD CONSTRAINT clinical_diagnosis_update_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.clinical_diagnosis(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis_update clinical_diagnosis_update_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_update
    ADD CONSTRAINT clinical_diagnosis_update_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_diagnosis_update clinical_diagnosis_update_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_diagnosis_update
    ADD CONSTRAINT clinical_diagnosis_update_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.clinical_visit(id) ON DELETE CASCADE;


--
-- Name: clinical_test_regions clinical_test_regions_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE CASCADE;


--
-- Name: clinical_test_regions clinical_test_regions_clinical_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_clinical_test_id_fkey FOREIGN KEY (clinical_test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: clinical_test_regions clinical_test_regions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_visit clinical_visit_appointment_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_visit
    ADD CONSTRAINT clinical_visit_appointment_record_id_fkey FOREIGN KEY (appointment_record_id) REFERENCES public.appointment_records(id) ON DELETE SET NULL;


--
-- Name: clinical_visit clinical_visit_canonical_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_visit
    ADD CONSTRAINT clinical_visit_canonical_appointment_id_fkey FOREIGN KEY (canonical_appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: clinical_visit clinical_visit_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_visit
    ADD CONSTRAINT clinical_visit_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: clinical_visit clinical_visit_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_visit
    ADD CONSTRAINT clinical_visit_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: clinical_visit clinical_visit_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_visit
    ADD CONSTRAINT clinical_visit_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: comments comments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: content_access_grants_webapp content_access_grants_webapp_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: content_access_grants_webapp content_access_grants_webapp_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: content_pages content_pages_linked_course_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_linked_course_fkey FOREIGN KEY (linked_course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: content_pages content_pages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: content_section_slug_history content_section_slug_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_section_slug_history
    ADD CONSTRAINT content_section_slug_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: content_sections content_sections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_sections
    ADD CONSTRAINT content_sections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: courses courses_intro_lesson_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_intro_lesson_page_id_fkey FOREIGN KEY (intro_lesson_page_id) REFERENCES public.content_pages(id) ON DELETE SET NULL;


--
-- Name: courses courses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: courses courses_program_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_program_template_id_fkey FOREIGN KEY (program_template_id) REFERENCES public.treatment_program_templates(id) ON DELETE RESTRICT;


--
-- Name: doctor_notes doctor_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.platform_users(id);


--
-- Name: doctor_notes doctor_notes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: doctor_notes doctor_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: doctor_patient_support doctor_patient_support_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: doctor_patient_support doctor_patient_support_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: doctor_patient_support doctor_patient_support_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: email_challenges email_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_challenges
    ADD CONSTRAINT email_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: email_send_cooldowns email_send_cooldowns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_cooldowns
    ADD CONSTRAINT email_send_cooldowns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_exercises lfk_complex_exercises_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_exercises lfk_complex_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id);


--
-- Name: lfk_complex_exercises lfk_complex_exercises_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.lfk_complex_templates(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_templates lfk_complex_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_templates
    ADD CONSTRAINT lfk_complex_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id);


--
-- Name: lfk_complex_templates lfk_complex_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_templates
    ADD CONSTRAINT lfk_complex_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_complexes lfk_complexes_diagnosis_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_diagnosis_ref_id_fkey FOREIGN KEY (diagnosis_ref_id) REFERENCES public.reference_items(id);


--
-- Name: lfk_complexes lfk_complexes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_complexes lfk_complexes_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: lfk_complexes lfk_complexes_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id);


--
-- Name: lfk_complexes lfk_complexes_symptom_tracking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_symptom_tracking_id_fkey FOREIGN KEY (symptom_tracking_id) REFERENCES public.symptom_trackings(id);


--
-- Name: lfk_exercise_media lfk_exercise_media_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_media
    ADD CONSTRAINT lfk_exercise_media_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id) ON DELETE CASCADE;


--
-- Name: lfk_exercise_media lfk_exercise_media_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_media
    ADD CONSTRAINT lfk_exercise_media_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_exercise_regions lfk_exercise_regions_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id) ON DELETE CASCADE;


--
-- Name: lfk_exercise_regions lfk_exercise_regions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_exercise_regions lfk_exercise_regions_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id) ON DELETE CASCADE;


--
-- Name: lfk_exercises lfk_exercises_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id);


--
-- Name: lfk_exercises lfk_exercises_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_exercises lfk_exercises_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id);


--
-- Name: lfk_sessions lfk_sessions_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id) ON DELETE CASCADE;


--
-- Name: lfk_sessions lfk_sessions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: lfk_sessions lfk_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: login_tokens login_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: mailing_logs_webapp mailing_logs_webapp_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs_webapp
    ADD CONSTRAINT mailing_logs_webapp_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: manual_patient_commands manual_patient_commands_enrollment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_patient_commands
    ADD CONSTRAINT manual_patient_commands_enrollment_fkey FOREIGN KEY (organization_id, platform_user_id) REFERENCES public.org_enrollments(organization_id, platform_user_id);


--
-- Name: material_ratings material_ratings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: material_ratings material_ratings_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_files media_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.media_folders(id) ON DELETE RESTRICT;


--
-- Name: media_files media_files_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_files media_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: media_folders media_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: media_folders media_folders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_folders media_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.media_folders(id) ON DELETE RESTRICT;


--
-- Name: media_folders media_folders_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_playback_client_events media_playback_client_events_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_playback_client_events media_playback_client_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_playback_client_events media_playback_client_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_playback_resolution_events media_playback_resolution_events_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_playback_resolution_events media_playback_resolution_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_playback_resolution_events media_playback_resolution_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_transcode_jobs media_transcode_jobs_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_transcode_jobs
    ADD CONSTRAINT media_transcode_jobs_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_transcode_jobs media_transcode_jobs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_transcode_jobs
    ADD CONSTRAINT media_transcode_jobs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_upload_sessions media_upload_sessions_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_upload_sessions media_upload_sessions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: media_upload_sessions media_upload_sessions_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: message_log message_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: message_log message_log_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: motivational_quotes motivational_quotes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivational_quotes
    ADD CONSTRAINT motivational_quotes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: notification_delivery_attempts notification_delivery_attempts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_attempts
    ADD CONSTRAINT notification_delivery_attempts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: online_intake_answers online_intake_answers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: online_intake_answers online_intake_answers_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.online_intake_requests(id) ON DELETE CASCADE;


--
-- Name: online_intake_attachments online_intake_attachments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_attachments
    ADD CONSTRAINT online_intake_attachments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: online_intake_attachments online_intake_attachments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_attachments
    ADD CONSTRAINT online_intake_attachments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.online_intake_requests(id) ON DELETE CASCADE;


--
-- Name: online_intake_requests online_intake_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_requests
    ADD CONSTRAINT online_intake_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: online_intake_requests online_intake_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_requests
    ADD CONSTRAINT online_intake_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id);


--
-- Name: online_intake_status_history online_intake_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.platform_users(id);


--
-- Name: online_intake_status_history online_intake_status_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: online_intake_status_history online_intake_status_history_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.online_intake_requests(id) ON DELETE CASCADE;


--
-- Name: operator_health_failure_archive operator_health_failure_archive_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_health_failure_archive
    ADD CONSTRAINT operator_health_failure_archive_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: org_enrollments org_enrollments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_enrollments
    ADD CONSTRAINT org_enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: org_enrollments org_enrollments_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_enrollments
    ADD CONSTRAINT org_enrollments_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: organization_member_invites organization_member_invites_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_invites
    ADD CONSTRAINT organization_member_invites_accepted_by_fkey FOREIGN KEY (accepted_by_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: organization_member_invites organization_member_invites_accepted_membership_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_invites
    ADD CONSTRAINT organization_member_invites_accepted_membership_fkey FOREIGN KEY (accepted_membership_id) REFERENCES public.be_organization_members(id) ON DELETE SET NULL;


--
-- Name: organization_member_invites organization_member_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_invites
    ADD CONSTRAINT organization_member_invites_created_by_fkey FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: organization_member_invites organization_member_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_member_invites
    ADD CONSTRAINT organization_member_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: organization_slug_claims organization_slug_claims_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_slug_claims
    ADD CONSTRAINT organization_slug_claims_created_by_fkey FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: organization_slug_claims organization_slug_claims_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_slug_claims
    ADD CONSTRAINT organization_slug_claims_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id);


--
-- Name: organization_slug_rename_events organization_slug_rename_events_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_slug_rename_events
    ADD CONSTRAINT organization_slug_rename_events_actor_fkey FOREIGN KEY (actor_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: organization_slug_rename_events organization_slug_rename_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_slug_rename_events
    ADD CONSTRAINT organization_slug_rename_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id);


--
-- Name: patient_bookings patient_bookings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.booking_branches(id);


--
-- Name: patient_bookings patient_bookings_branch_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_branch_service_id_fkey FOREIGN KEY (branch_service_id) REFERENCES public.booking_branch_services(id);


--
-- Name: patient_bookings patient_bookings_canonical_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_canonical_appointment_id_fkey FOREIGN KEY (canonical_appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: patient_bookings patient_bookings_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_bookings patient_bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.booking_services(id);


--
-- Name: patient_comorbidity patient_comorbidity_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_comorbidity
    ADD CONSTRAINT patient_comorbidity_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: patient_comorbidity patient_comorbidity_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_comorbidity
    ADD CONSTRAINT patient_comorbidity_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_comorbidity patient_comorbidity_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_comorbidity
    ADD CONSTRAINT patient_comorbidity_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_content_page_id_content_pages_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_content_page_id_content_pages_i FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_content_page_id_content_page; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_content_page_id_content_page FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_content_page_id_content_pages_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_content_page_id_content_pages_ FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_diary_day_snapshots patient_diary_day_snapshots_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_diary_day_snapshots
    ADD CONSTRAINT patient_diary_day_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_files patient_files_media_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_files
    ADD CONSTRAINT patient_files_media_file_id_fkey FOREIGN KEY (media_file_id) REFERENCES public.media_files(id) ON DELETE SET NULL;


--
-- Name: patient_files patient_files_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_files
    ADD CONSTRAINT patient_files_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_files patient_files_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_files
    ADD CONSTRAINT patient_files_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_files patient_files_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_files
    ADD CONSTRAINT patient_files_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: patient_files patient_files_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_files
    ADD CONSTRAINT patient_files_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.clinical_visit(id) ON DELETE SET NULL;


--
-- Name: patient_home_block_items patient_home_block_items_block_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_block_items
    ADD CONSTRAINT patient_home_block_items_block_fkey FOREIGN KEY (block_code) REFERENCES public.patient_home_blocks(code) ON DELETE CASCADE;


--
-- Name: patient_home_block_items patient_home_block_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_block_items
    ADD CONSTRAINT patient_home_block_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_home_blocks patient_home_blocks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_blocks
    ADD CONSTRAINT patient_home_blocks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_invites patient_invites_accepted_by_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_accepted_by_platform_user_id_fkey FOREIGN KEY (accepted_by_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: patient_invites patient_invites_created_by_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_created_by_platform_user_id_fkey FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: patient_invites patient_invites_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.org_enrollments(id) ON DELETE CASCADE;


--
-- Name: patient_invites patient_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_invites patient_invites_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_invites patient_invites_revoked_by_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_revoked_by_platform_user_id_fkey FOREIGN KEY (revoked_by_platform_user_id) REFERENCES public.platform_users(id);


--
-- Name: patient_invites patient_invites_superseded_by_invite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_invites
    ADD CONSTRAINT patient_invites_superseded_by_invite_id_fkey FOREIGN KEY (superseded_by_invite_id) REFERENCES public.patient_invites(id) ON DELETE SET NULL;


--
-- Name: patient_lfk_assignments patient_lfk_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.platform_users(id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_lfk_assignments patient_lfk_assignments_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.lfk_complex_templates(id);


--
-- Name: patient_merge_candidates patient_merge_candidates_anchor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_anchor_user_id_fkey FOREIGN KEY (anchor_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_merge_candidates patient_merge_candidates_candidate_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_candidate_user_id_fkey FOREIGN KEY (candidate_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_merge_candidates patient_merge_candidates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_merge_candidates patient_merge_candidates_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: patient_merge_candidates patient_merge_candidates_trigger_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_trigger_appointment_id_fkey FOREIGN KEY (trigger_appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: patient_payment patient_payment_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_payment
    ADD CONSTRAINT patient_payment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


--
-- Name: patient_payment patient_payment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_payment
    ADD CONSTRAINT patient_payment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_payment patient_payment_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_payment
    ADD CONSTRAINT patient_payment_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_payment patient_payment_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_payment
    ADD CONSTRAINT patient_payment_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.clinical_visit(id) ON DELETE SET NULL;


--
-- Name: patient_practice_completions patient_practice_completions_content_page_id_content_pages_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_practice_completions
    ADD CONSTRAINT patient_practice_completions_content_page_id_content_pages_id_f FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_practice_completions patient_practice_completions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_practice_completions
    ADD CONSTRAINT patient_practice_completions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: phone_messenger_bind_secrets phone_messenger_bind_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_messenger_bind_secrets
    ADD CONSTRAINT phone_messenger_bind_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: platform_user_contacts platform_user_contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_user_contacts
    ADD CONSTRAINT platform_user_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: platform_user_contacts platform_user_contacts_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_user_contacts
    ADD CONSTRAINT platform_user_contacts_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: platform_users platform_users_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.platform_users(id);


--
-- Name: platform_users platform_users_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: product_analytics_events_recent product_analytics_events_recent_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_events_recent
    ADD CONSTRAINT product_analytics_events_recent_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: product_analytics_events_recent product_analytics_events_recent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_events_recent
    ADD CONSTRAINT product_analytics_events_recent_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: product_analytics_hourly product_analytics_hourly_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_hourly
    ADD CONSTRAINT product_analytics_hourly_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: product_analytics_user_hourly product_analytics_user_hourly_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_user_hourly
    ADD CONSTRAINT product_analytics_user_hourly_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: product_analytics_user_hourly product_analytics_user_hourly_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_user_hourly
    ADD CONSTRAINT product_analytics_user_hourly_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: product_push_notifications product_push_notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_notifications
    ADD CONSTRAINT product_push_notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: product_push_notifications product_push_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_notifications
    ADD CONSTRAINT product_push_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.treatment_program_instances(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_instance_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_instance_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_media_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_media_file_id_fkey FOREIGN KEY (media_file_id) REFERENCES public.media_files(id) ON DELETE SET NULL;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_support_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_support_message_id_fkey FOREIGN KEY (support_message_id) REFERENCES public.support_conversation_messages(id) ON DELETE SET NULL;


--
-- Name: program_item_discussion_reads program_item_discussion_reads_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_reads program_item_discussion_reads_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_reads program_item_discussion_reads_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: recommendation_regions recommendation_regions_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE CASCADE;


--
-- Name: recommendation_regions recommendation_regions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: recommendation_regions recommendation_regions_recommendation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE SET NULL;


--
-- Name: recommendations recommendations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: recommendations recommendations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reference_catalog_snapshot_receipts reference_catalog_snapshot_receipts_baseline_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_catalog_snapshot_receipts
    ADD CONSTRAINT reference_catalog_snapshot_receipts_baseline_version_fkey FOREIGN KEY (baseline_version) REFERENCES public.reference_catalog_baselines(version);


--
-- Name: reference_catalog_snapshot_receipts reference_catalog_snapshot_receipts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_catalog_snapshot_receipts
    ADD CONSTRAINT reference_catalog_snapshot_receipts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reference_categories reference_categories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_categories
    ADD CONSTRAINT reference_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reference_items reference_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.reference_categories(id) ON DELETE CASCADE;


--
-- Name: reference_items reference_items_category_organization_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_category_organization_fkey FOREIGN KEY (category_id, organization_id) REFERENCES public.reference_categories(id, organization_id) ON DELETE CASCADE;


--
-- Name: reference_items reference_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reminder_delivery_events reminder_delivery_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_delivery_events
    ADD CONSTRAINT reminder_delivery_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reminder_journal reminder_journal_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.reminder_occurrence_history(integrator_occurrence_id) ON DELETE SET NULL;


--
-- Name: reminder_journal reminder_journal_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reminder_journal reminder_journal_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.reminder_rules(id) ON DELETE CASCADE;


--
-- Name: reminder_occurrence_history reminder_occurrence_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_occurrence_history
    ADD CONSTRAINT reminder_occurrence_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reminder_rules reminder_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: reminder_rules reminder_rules_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: saas_org_entitlement_overrides saas_org_entitlement_overrides_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saas_org_entitlement_overrides
    ADD CONSTRAINT saas_org_entitlement_overrides_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: specialist_signup_intents specialist_signup_intents_membership_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_signup_intents
    ADD CONSTRAINT specialist_signup_intents_membership_fkey FOREIGN KEY (provisioned_membership_id) REFERENCES public.be_organization_members(id) ON DELETE SET NULL;


--
-- Name: specialist_signup_intents specialist_signup_intents_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_signup_intents
    ADD CONSTRAINT specialist_signup_intents_org_fkey FOREIGN KEY (provisioned_organization_id) REFERENCES public.be_organizations(id) ON DELETE SET NULL;


--
-- Name: specialist_signup_intents specialist_signup_intents_specialist_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_signup_intents
    ADD CONSTRAINT specialist_signup_intents_specialist_fkey FOREIGN KEY (provisioned_specialist_id) REFERENCES public.be_specialists(id) ON DELETE SET NULL;


--
-- Name: specialist_signup_intents specialist_signup_intents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_signup_intents
    ADD CONSTRAINT specialist_signup_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: specialist_tasks specialist_tasks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_tasks
    ADD CONSTRAINT specialist_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: specialist_tasks specialist_tasks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_tasks
    ADD CONSTRAINT specialist_tasks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: staff_security_profiles staff_security_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_security_profiles
    ADD CONSTRAINT staff_security_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: support_conversation_messages support_conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE CASCADE;


--
-- Name: support_conversation_messages support_conversation_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: support_conversations support_conversations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: support_conversations support_conversations_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: support_delivery_events support_delivery_events_conversation_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_delivery_events
    ADD CONSTRAINT support_delivery_events_conversation_message_id_fkey FOREIGN KEY (conversation_message_id) REFERENCES public.support_conversation_messages(id) ON DELETE SET NULL;


--
-- Name: support_delivery_events support_delivery_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_delivery_events
    ADD CONSTRAINT support_delivery_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: support_question_messages support_question_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: support_question_messages support_question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.support_questions(id) ON DELETE CASCADE;


--
-- Name: support_questions support_questions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE SET NULL;


--
-- Name: support_questions support_questions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: symptom_entries symptom_entries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: symptom_entries symptom_entries_patient_practice_completion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_patient_practice_completion_id_fkey FOREIGN KEY (patient_practice_completion_id) REFERENCES public.patient_practice_completions(id) ON DELETE SET NULL;


--
-- Name: symptom_entries symptom_entries_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: symptom_entries symptom_entries_tracking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_tracking_id_fkey FOREIGN KEY (tracking_id) REFERENCES public.symptom_trackings(id) ON DELETE CASCADE;


--
-- Name: symptom_trackings symptom_trackings_diagnosis_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_diagnosis_ref_id_fkey FOREIGN KEY (diagnosis_ref_id) REFERENCES public.reference_items(id);


--
-- Name: symptom_trackings symptom_trackings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: symptom_trackings symptom_trackings_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: symptom_trackings symptom_trackings_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id);


--
-- Name: symptom_trackings symptom_trackings_stage_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_stage_ref_id_fkey FOREIGN KEY (stage_ref_id) REFERENCES public.reference_items(id);


--
-- Name: symptom_trackings symptom_trackings_symptom_type_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_symptom_type_ref_id_fkey FOREIGN KEY (symptom_type_ref_id) REFERENCES public.reference_items(id);


--
-- Name: system_settings_audit system_settings_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings_audit
    ADD CONSTRAINT system_settings_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.platform_users(id);


--
-- Name: system_settings_audit system_settings_audit_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings_audit
    ADD CONSTRAINT system_settings_audit_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE SET NULL;


--
-- Name: system_settings system_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id);


--
-- Name: test_attempts test_attempts_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: test_attempts test_attempts_instance_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_instance_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.test_attempts(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: test_results test_results_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE RESTRICT;


--
-- Name: test_set_items test_set_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: test_set_items test_set_items_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE RESTRICT;


--
-- Name: test_set_items test_set_items_test_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_test_set_id_fkey FOREIGN KEY (test_set_id) REFERENCES public.test_sets(id) ON DELETE CASCADE;


--
-- Name: test_sets test_sets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sets
    ADD CONSTRAINT test_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: test_sets test_sets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sets
    ADD CONSTRAINT test_sets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: tests tests_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE SET NULL;


--
-- Name: tests tests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: tests tests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_events treatment_program_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: treatment_program_events treatment_program_events_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.treatment_program_instances(id) ON DELETE CASCADE;


--
-- Name: treatment_program_events treatment_program_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_source_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_source_group_id_fkey FOREIGN KEY (source_group_id) REFERENCES public.treatment_program_template_stage_groups(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_instance_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.treatment_program_instance_stage_groups(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_instance_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.treatment_program_instances(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_source_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_source_stage_id_fkey FOREIGN KEY (source_stage_id) REFERENCES public.treatment_program_template_stages(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instances treatment_program_instances_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instances treatment_program_instances_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instances treatment_program_instances_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instances treatment_program_instances_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.treatment_program_templates(id) ON DELETE SET NULL;


--
-- Name: treatment_program_template_stage_groups treatment_program_template_stage_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_groups
    ADD CONSTRAINT treatment_program_template_stage_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stage_groups treatment_program_template_stage_groups_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_groups
    ADD CONSTRAINT treatment_program_template_stage_groups_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_template_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.treatment_program_template_stage_groups(id) ON DELETE SET NULL;


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_template_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stages treatment_program_template_stages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stages
    ADD CONSTRAINT treatment_program_template_stages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stages treatment_program_template_stages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stages
    ADD CONSTRAINT treatment_program_template_stages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.treatment_program_templates(id) ON DELETE CASCADE;


--
-- Name: treatment_program_templates treatment_program_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_templates
    ADD CONSTRAINT treatment_program_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: treatment_program_templates treatment_program_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_templates
    ADD CONSTRAINT treatment_program_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_channel_bindings user_channel_bindings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_bindings
    ADD CONSTRAINT user_channel_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_channel_preferences user_channel_preferences_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_preferences
    ADD CONSTRAINT user_channel_preferences_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_email_setup_tokens user_email_setup_tokens_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_setup_tokens
    ADD CONSTRAINT user_email_setup_tokens_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: user_email_setup_tokens user_email_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_setup_tokens
    ADD CONSTRAINT user_email_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_notification_topic_channels user_notification_topic_channels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topic_channels
    ADD CONSTRAINT user_notification_topic_channels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_notification_topics user_notification_topics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topics
    ADD CONSTRAINT user_notification_topics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_oauth_bindings user_oauth_bindings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oauth_bindings
    ADD CONSTRAINT user_oauth_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_password_credentials user_password_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_password_credentials
    ADD CONSTRAINT user_password_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_phone_history user_phone_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_history
    ADD CONSTRAINT user_phone_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_phone_history user_phone_history_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_history
    ADD CONSTRAINT user_phone_history_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_pins user_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions_webapp user_subscriptions_webapp_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions_webapp
    ADD CONSTRAINT user_subscriptions_webapp_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: user_web_push_subscriptions user_web_push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_web_push_subscriptions
    ADD CONSTRAINT user_web_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: webapp_reminder_occurrences webapp_reminder_occurrences_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_reminder_occurrences
    ADD CONSTRAINT webapp_reminder_occurrences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: webapp_reminder_occurrences webapp_reminder_occurrences_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_reminder_occurrences
    ADD CONSTRAINT webapp_reminder_occurrences_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: contacts; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: content_access_grants; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.content_access_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_messages; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.conversation_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: mailing_logs; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.mailing_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: mailings; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.mailings ENABLE ROW LEVEL SECURITY;

--
-- Name: message_drafts; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.message_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: question_messages; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.question_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings saas_bootstrap_hybrid_p0_8_6; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_bootstrap_hybrid_p0_8_6 ON integrator.system_settings USING (((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK (((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: contacts saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.contacts USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id()))));


--
-- Name: content_access_grants saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.content_access_grants USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id()))));


--
-- Name: conversation_messages saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.conversation_messages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (integrator.conversations b4f_conv
     JOIN integrator.identities b4f_ident ON ((b4f_ident.id = b4f_conv.user_identity_id)))
  WHERE ((b4f_conv.id = conversation_messages.conversation_id) AND (b4f_ident.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (integrator.conversations b4f_conv
     JOIN integrator.identities b4f_ident ON ((b4f_ident.id = b4f_conv.user_identity_id)))
  WHERE ((b4f_conv.id = conversation_messages.conversation_id) AND (b4f_ident.user_id = app.current_integrator_user_id())))))));


--
-- Name: conversations saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.conversations USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.identities b4f_conversations_identity
  WHERE ((b4f_conversations_identity.id = conversations.user_identity_id) AND (b4f_conversations_identity.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.identities b4f_conversations_identity
  WHERE ((b4f_conversations_identity.id = conversations.user_identity_id) AND (b4f_conversations_identity.user_id = app.current_integrator_user_id())))))));


--
-- Name: mailing_logs saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.mailing_logs USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id()))));


--
-- Name: mailings saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.mailings USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: message_drafts saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.message_drafts USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.identities b4f_message_drafts_identity
  WHERE ((b4f_message_drafts_identity.id = message_drafts.identity_id) AND (b4f_message_drafts_identity.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.identities b4f_message_drafts_identity
  WHERE ((b4f_message_drafts_identity.id = message_drafts.identity_id) AND (b4f_message_drafts_identity.user_id = app.current_integrator_user_id())))))));


--
-- Name: question_messages saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.question_messages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (integrator.user_questions b4f_question
     JOIN integrator.identities b4f_ident ON ((b4f_ident.id = b4f_question.user_identity_id)))
  WHERE ((b4f_question.id = question_messages.question_id) AND (b4f_ident.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (integrator.user_questions b4f_question
     JOIN integrator.identities b4f_ident ON ((b4f_ident.id = b4f_question.user_identity_id)))
  WHERE ((b4f_question.id = question_messages.question_id) AND (b4f_ident.user_id = app.current_integrator_user_id())))))));


--
-- Name: user_questions saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_questions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.identities b4f_user_questions_identity
  WHERE ((b4f_user_questions_identity.id = user_questions.user_identity_id) AND (b4f_user_questions_identity.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.identities b4f_user_questions_identity
  WHERE ((b4f_user_questions_identity.id = user_questions.user_identity_id) AND (b4f_user_questions_identity.user_id = app.current_integrator_user_id())))))));


--
-- Name: user_reminder_delivery_logs saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_reminder_delivery_logs USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (integrator.user_reminder_occurrences b4f_occ
     JOIN integrator.user_reminder_rules b4f_rule ON ((b4f_rule.id = b4f_occ.rule_id)))
  WHERE ((b4f_occ.id = user_reminder_delivery_logs.occurrence_id) AND (b4f_rule.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (integrator.user_reminder_occurrences b4f_occ
     JOIN integrator.user_reminder_rules b4f_rule ON ((b4f_rule.id = b4f_occ.rule_id)))
  WHERE ((b4f_occ.id = user_reminder_delivery_logs.occurrence_id) AND (b4f_rule.user_id = app.current_integrator_user_id())))))));


--
-- Name: user_reminder_occurrences saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_reminder_occurrences USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.user_reminder_rules b4f_rule
  WHERE ((b4f_rule.id = user_reminder_occurrences.rule_id) AND (b4f_rule.user_id = app.current_integrator_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM integrator.user_reminder_rules b4f_rule
  WHERE ((b4f_rule.id = user_reminder_occurrences.rule_id) AND (b4f_rule.user_id = app.current_integrator_user_id())))))));


--
-- Name: user_reminder_rules saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_reminder_rules USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id()))));


--
-- Name: user_subscriptions saas_org_dormant_p0_8_5; Type: POLICY; Schema: integrator; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_5 ON integrator.user_subscriptions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (user_id = app.current_integrator_user_id()))));


--
-- Name: system_settings; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_questions; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.user_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reminder_delivery_logs; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.user_reminder_delivery_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reminder_occurrences; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.user_reminder_occurrences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reminder_rules; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.user_reminder_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: integrator; Owner: -
--

ALTER TABLE integrator.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: app_runtime_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_runtime_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_runtime_settings_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_runtime_settings_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointment_cancellations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointment_cancellations ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointment_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointment_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointment_history_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointment_history_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointment_no_shows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointment_no_shows ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointment_reschedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointment_reschedules ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointment_staff_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointment_staff_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: be_appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: be_availability_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_availability_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: be_booking_form_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_booking_form_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: be_booking_form_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_booking_form_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: be_branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_branches ENABLE ROW LEVEL SECURITY;

--
-- Name: be_cancellation_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_cancellation_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: be_clinic_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_clinic_services ENABLE ROW LEVEL SECURITY;

--
-- Name: be_external_entity_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_external_entity_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: be_package_history_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_package_history_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_package_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_package_items ENABLE ROW LEVEL SECURITY;

--
-- Name: be_package_usages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_package_usages ENABLE ROW LEVEL SECURITY;

--
-- Name: be_patient_booking_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_patient_booking_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: be_patient_package_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_patient_package_items ENABLE ROW LEVEL SECURITY;

--
-- Name: be_patient_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_patient_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: be_patient_timeline_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_patient_timeline_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_payment_history_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_payment_history_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_payment_intents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_payment_intents ENABLE ROW LEVEL SECURITY;

--
-- Name: be_payment_provider_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_payment_provider_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: be_prepayment_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_prepayment_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: be_product_history_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_product_history_events ENABLE ROW LEVEL SECURITY;

--
-- Name: be_product_pay_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_product_pay_links ENABLE ROW LEVEL SECURITY;

--
-- Name: be_product_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_product_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: be_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_products ENABLE ROW LEVEL SECURITY;

--
-- Name: be_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: be_reschedule_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_reschedule_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: be_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: be_schedule_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_schedule_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: be_schedule_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_schedule_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: be_service_location_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_service_location_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: be_specialist_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_specialist_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: be_specialist_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_specialist_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: be_specialist_service_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_specialist_service_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: be_specialists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_specialists ENABLE ROW LEVEL SECURITY;

--
-- Name: be_subscription_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_subscription_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: be_working_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_working_days ENABLE ROW LEVEL SECURITY;

--
-- Name: be_working_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.be_working_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcast_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcast_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcast_audit_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcast_audit_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcast_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcast_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_complex_template_exercises c4d_platform_library_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c4d_platform_library_read ON public.lfk_complex_template_exercises FOR SELECT USING (((owner_kind = 'platform'::text) AND (organization_id IS NULL)));


--
-- Name: lfk_complex_templates c4d_platform_library_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c4d_platform_library_read ON public.lfk_complex_templates FOR SELECT USING (((owner_kind = 'platform'::text) AND (organization_id IS NULL)));


--
-- Name: lfk_exercise_media c4d_platform_library_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c4d_platform_library_read ON public.lfk_exercise_media FOR SELECT USING (((owner_kind = 'platform'::text) AND (organization_id IS NULL)));


--
-- Name: lfk_exercise_regions c4d_platform_library_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c4d_platform_library_read ON public.lfk_exercise_regions FOR SELECT USING (((owner_kind = 'platform'::text) AND (organization_id IS NULL)));


--
-- Name: lfk_exercises c4d_platform_library_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c4d_platform_library_read ON public.lfk_exercises FOR SELECT USING (((owner_kind = 'platform'::text) AND (organization_id IS NULL)));


--
-- Name: media_files c4d_platform_library_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c4d_platform_library_read ON public.media_files FOR SELECT USING (((owner_kind = 'platform'::text) AND (organization_id IS NULL)));


--
-- Name: clinic_public_directory_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinic_public_directory_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_public_directory_entries clinic_public_directory_entries_exact_org_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinic_public_directory_entries_exact_org_staff ON public.clinic_public_directory_entries TO app_staff USING ((organization_id = app.current_org_id())) WITH CHECK ((organization_id = app.current_org_id()));


--
-- Name: clinical_anamnesis_illness; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_anamnesis_illness ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_anamnesis_lifestyle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_anamnesis_lifestyle ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_anamnesis_trauma; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_anamnesis_trauma ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_complaint; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_complaint ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_complaint_update; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_complaint_update ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_diagnosis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_diagnosis ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_diagnosis_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_diagnosis_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_diagnosis_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_diagnosis_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_diagnosis_update; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_diagnosis_update ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_test_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_test_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_visit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_visit ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: content_access_grants_webapp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_access_grants_webapp ENABLE ROW LEVEL SECURITY;

--
-- Name: content_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: content_section_slug_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_section_slug_history ENABLE ROW LEVEL SECURITY;

--
-- Name: content_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: doctor_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doctor_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: doctor_patient_support; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doctor_patient_support ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_complex_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_complex_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_complex_template_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_complex_template_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_complex_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_complex_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_complexes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_complexes ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_exercise_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_exercise_media ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_exercise_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_exercise_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: lfk_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lfk_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: mailing_logs_webapp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mailing_logs_webapp ENABLE ROW LEVEL SECURITY;

--
-- Name: manual_patient_commands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manual_patient_commands ENABLE ROW LEVEL SECURITY;

--
-- Name: manual_patient_commands manual_patient_commands_exact_staff_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manual_patient_commands_exact_staff_org ON public.manual_patient_commands USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())));


--
-- Name: material_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: media_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;

--
-- Name: media_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: media_hls_proxy_error_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_hls_proxy_error_events ENABLE ROW LEVEL SECURITY;

--
-- Name: media_playback_client_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_playback_client_events ENABLE ROW LEVEL SECURITY;

--
-- Name: media_playback_resolution_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_playback_resolution_events ENABLE ROW LEVEL SECURITY;

--
-- Name: media_playback_user_video_first_resolve; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_playback_user_video_first_resolve ENABLE ROW LEVEL SECURITY;

--
-- Name: media_transcode_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_transcode_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: media_upload_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_upload_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: message_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;

--
-- Name: motivational_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motivational_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_delivery_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: online_intake_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_intake_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: online_intake_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_intake_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: online_intake_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_intake_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: online_intake_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_intake_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: operator_health_failure_archive; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operator_health_failure_archive ENABLE ROW LEVEL SECURITY;

--
-- Name: org_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_member_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_member_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_slug_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_slug_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_slug_claims organization_slug_claims_exact_org_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_slug_claims_exact_org_staff ON public.organization_slug_claims TO app_staff USING ((organization_id = app.current_org_id())) WITH CHECK ((organization_id = app.current_org_id()));


--
-- Name: organization_slug_rename_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_slug_rename_events ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_slug_rename_events organization_slug_rename_events_insert_org_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_slug_rename_events_insert_org_staff ON public.organization_slug_rename_events FOR INSERT TO app_staff WITH CHECK ((organization_id = app.current_org_id()));


--
-- Name: organization_slug_rename_events organization_slug_rename_events_select_org_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_slug_rename_events_select_org_staff ON public.organization_slug_rename_events FOR SELECT TO app_staff USING ((organization_id = app.current_org_id()));


--
-- Name: patient_comorbidity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_comorbidity ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_content_rating_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_content_rating_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: content_section_slug_history patient_current_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_current_org_select ON public.content_section_slug_history FOR SELECT USING (((app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = app.current_org_id()) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: patient_home_block_items patient_current_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_current_org_select ON public.patient_home_block_items FOR SELECT USING (((app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = app.current_org_id()) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: patient_home_blocks patient_current_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_current_org_select ON public.patient_home_blocks FOR SELECT USING (((app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = app.current_org_id()) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: patient_daily_warmup_presentations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_daily_warmup_presentations ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_daily_warmup_video_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_daily_warmup_video_views ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_diary_day_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_diary_day_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_home_block_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_home_block_items ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_home_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_home_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_lfk_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_lfk_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_merge_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_merge_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_payment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_payment ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_practice_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_practice_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: content_pages patient_visible_current_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_visible_current_org_select ON public.content_pages FOR SELECT USING (((app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (is_published = true) AND (archived_at IS NULL) AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = app.current_org_id()) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: content_sections patient_visible_current_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patient_visible_current_org_select ON public.content_sections FOR SELECT USING (((app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (is_visible = true) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = app.current_org_id()) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: platform_user_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_user_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: product_analytics_events_recent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_analytics_events_recent ENABLE ROW LEVEL SECURITY;

--
-- Name: product_analytics_user_hourly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_analytics_user_hourly ENABLE ROW LEVEL SECURITY;

--
-- Name: product_push_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_push_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: program_action_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_action_log ENABLE ROW LEVEL SECURITY;

--
-- Name: program_item_discussion_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_item_discussion_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: program_item_discussion_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_item_discussion_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendation_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendation_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_categories reference_catalog_patient_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_catalog_patient_select ON public.reference_categories FOR SELECT TO app_patient USING (((app.current_org_id() IS NOT NULL) AND (app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = reference_categories.organization_id) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: reference_items reference_catalog_patient_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_catalog_patient_select ON public.reference_items FOR SELECT TO app_patient USING (((app.current_org_id() IS NOT NULL) AND (app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.org_enrollments enrollment
  WHERE ((enrollment.organization_id = reference_items.organization_id) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))));


--
-- Name: reference_categories reference_catalog_seed_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_catalog_seed_owner ON public.reference_categories TO bcb_a0_owner USING (((CURRENT_USER = 'bcb_a0_owner'::name) AND (NOT (EXISTS ( SELECT 1
   FROM public.reference_catalog_snapshot_receipts receipt
  WHERE (receipt.organization_id = reference_categories.organization_id)))))) WITH CHECK (((CURRENT_USER = 'bcb_a0_owner'::name) AND (NOT (EXISTS ( SELECT 1
   FROM public.reference_catalog_snapshot_receipts receipt
  WHERE (receipt.organization_id = reference_categories.organization_id))))));


--
-- Name: reference_items reference_catalog_seed_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_catalog_seed_owner ON public.reference_items TO bcb_a0_owner USING (((CURRENT_USER = 'bcb_a0_owner'::name) AND (NOT (EXISTS ( SELECT 1
   FROM public.reference_catalog_snapshot_receipts receipt
  WHERE (receipt.organization_id = reference_items.organization_id)))))) WITH CHECK (((CURRENT_USER = 'bcb_a0_owner'::name) AND (NOT (EXISTS ( SELECT 1
   FROM public.reference_catalog_snapshot_receipts receipt
  WHERE (receipt.organization_id = reference_items.organization_id))))));


--
-- Name: reference_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_items ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_delivery_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_delivery_events ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_journal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_journal ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_occurrence_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_occurrence_history ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: app_runtime_settings_audit s5_runtime_settings_audit_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY s5_runtime_settings_audit_staff ON public.app_runtime_settings_audit USING (((CURRENT_USER = 'app_staff'::name) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))))) WITH CHECK (((CURRENT_USER = 'app_staff'::name) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))));


--
-- Name: app_runtime_settings s5_runtime_settings_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY s5_runtime_settings_isolation ON public.app_runtime_settings USING ((((CURRENT_USER = 'app_staff'::name) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) OR ((CURRENT_USER = 'app_patient'::name) AND (audience = ANY (ARRAY['public'::text, 'authenticated_client'::text])) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) OR ((CURRENT_USER = 'app_runtime_nonstaff_login'::name) AND (audience = 'public'::text) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) OR (pg_has_role(CURRENT_USER, 'app_worker'::name, 'member'::text) AND (audience = 'server'::text) AND (organization_id IS NULL) AND (app.current_org_id() IS NULL)))) WITH CHECK ((((CURRENT_USER = 'app_staff'::name) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) OR ((CURRENT_USER = 'app_patient'::name) AND (audience = ANY (ARRAY['public'::text, 'authenticated_client'::text])) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) OR ((CURRENT_USER = 'app_runtime_nonstaff_login'::name) AND (audience = 'public'::text) AND ((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) OR (pg_has_role(CURRENT_USER, 'app_worker'::name, 'member'::text) AND (audience = 'server'::text) AND (organization_id IS NULL) AND (app.current_org_id() IS NULL))));


--
-- Name: platform_user_contacts saas_bootstrap_hybrid_p0_8_6; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_bootstrap_hybrid_p0_8_6 ON public.platform_user_contacts USING ((((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())) OR ((organization_id IS NULL) AND (app.current_org_id() IS NULL) AND (app.current_patient_user_id() IS NULL) AND (app.current_integrator_user_id() IS NULL) AND (NOT app.is_staff())))) WITH CHECK ((((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())) OR ((organization_id IS NULL) AND (app.current_org_id() IS NULL) AND (app.current_patient_user_id() IS NULL) AND (app.current_integrator_user_id() IS NULL) AND (NOT app.is_staff()))));


--
-- Name: system_settings saas_bootstrap_hybrid_p0_8_6; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_bootstrap_hybrid_p0_8_6 ON public.system_settings USING (((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK (((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: system_settings_audit saas_bootstrap_hybrid_p0_8_6; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_bootstrap_hybrid_p0_8_6 ON public.system_settings_audit USING (((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK (((organization_id IS NULL) OR ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: user_phone_history saas_bootstrap_hybrid_p0_8_6; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_bootstrap_hybrid_p0_8_6 ON public.user_phone_history USING ((((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())) OR ((organization_id IS NULL) AND (app.current_org_id() IS NULL) AND (app.current_patient_user_id() IS NULL) AND (app.current_integrator_user_id() IS NULL) AND (NOT app.is_staff())))) WITH CHECK ((((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())) OR ((organization_id IS NULL) AND (app.current_org_id() IS NULL) AND (app.current_patient_user_id() IS NULL) AND (app.current_integrator_user_id() IS NULL) AND (NOT app.is_staff()))));


--
-- Name: admin_audit_log saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.admin_audit_log USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_appointment_cancellations saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointment_cancellations USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_cancellations.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_cancellations.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_appointment_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointment_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_events.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_events.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_appointment_history_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointment_history_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_history_events.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_history_events.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_appointment_no_shows saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointment_no_shows USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_no_shows.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_no_shows.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_appointment_reschedules saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointment_reschedules USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_reschedules.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_appointment_reschedules.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_appointment_staff_comments saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointment_staff_comments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_appointments saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_appointments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_availability_rules saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_availability_rules USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_booking_form_fields saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_booking_form_fields USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_booking_form_submissions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_booking_form_submissions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_booking_form_submissions.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_appointments b4f_appt
  WHERE ((b4f_appt.id = be_booking_form_submissions.appointment_id) AND (b4f_appt.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_branches saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_branches USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_cancellation_policies saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_cancellation_policies USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_clinic_services saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_clinic_services USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_external_entity_mappings saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_external_entity_mappings USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_package_history_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_package_history_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_patient_packages b4f_pkg
  WHERE ((b4f_pkg.id = be_package_history_events.patient_package_id) AND (b4f_pkg.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_patient_packages b4f_pkg
  WHERE ((b4f_pkg.id = be_package_history_events.patient_package_id) AND (b4f_pkg.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_package_usages saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_package_usages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_patient_packages b4f_pkg
  WHERE ((b4f_pkg.id = be_package_usages.patient_package_id) AND (b4f_pkg.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_patient_packages b4f_pkg
  WHERE ((b4f_pkg.id = be_package_usages.patient_package_id) AND (b4f_pkg.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_patient_booking_profiles saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_patient_booking_profiles USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_patient_packages saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_patient_packages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_patient_timeline_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_patient_timeline_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_payment_history_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_payment_history_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_payment_intents saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_payment_intents USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_payment_provider_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_payment_provider_events USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_payments saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_payments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_prepayment_policies saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_prepayment_policies USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_product_history_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_product_history_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_product_purchases b4f_purchase
  WHERE ((b4f_purchase.id = be_product_history_events.product_purchase_id) AND (b4f_purchase.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_product_purchases b4f_purchase
  WHERE ((b4f_purchase.id = be_product_history_events.product_purchase_id) AND (b4f_purchase.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_product_pay_links saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_product_pay_links USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_product_purchases saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_product_purchases USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: be_products saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_products USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_refunds saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_refunds USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_payments b4f_payment
  WHERE ((b4f_payment.id = be_refunds.payment_id) AND (b4f_payment.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_payments b4f_payment
  WHERE ((b4f_payment.id = be_refunds.payment_id) AND (b4f_payment.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: be_reschedule_policies saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_reschedule_policies USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_rooms saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_rooms USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_schedule_blocks saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_schedule_blocks USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_schedule_templates saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_schedule_templates USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_service_location_availability saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_service_location_availability USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_specialist_locations saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_specialist_locations USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_specialist_rooms saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_specialist_rooms USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_specialist_service_availability saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_specialist_service_availability USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_specialists saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_specialists USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_subscription_packages saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_subscription_packages USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_working_days saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_working_days USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: be_working_hours saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.be_working_hours USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: broadcast_audit saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.broadcast_audit USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: broadcast_drafts saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.broadcast_drafts USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: clinic_public_directory_entries saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinic_public_directory_entries USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: clinical_anamnesis_illness saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_anamnesis_illness USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: clinical_anamnesis_lifestyle saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_anamnesis_lifestyle USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: clinical_anamnesis_trauma saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_anamnesis_trauma USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: clinical_complaint saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_complaint USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: clinical_diagnosis saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_diagnosis USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: clinical_diagnosis_catalog saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_diagnosis_catalog USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: clinical_test_regions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_test_regions USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: clinical_visit saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.clinical_visit USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: content_access_grants_webapp saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.content_access_grants_webapp USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: content_pages saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.content_pages USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: content_sections saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.content_sections USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: courses saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.courses USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4course_instance
  WHERE ((b4course_instance.patient_user_id = app.current_patient_user_id()) AND (b4course_instance.template_id = courses.program_template_id))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4course_instance
  WHERE ((b4course_instance.patient_user_id = app.current_patient_user_id()) AND (b4course_instance.template_id = courses.program_template_id)))))));


--
-- Name: doctor_notes saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.doctor_notes USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: doctor_patient_support saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.doctor_patient_support USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: lfk_complex_templates saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.lfk_complex_templates USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: lfk_complexes saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.lfk_complexes USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: lfk_exercise_regions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.lfk_exercise_regions USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: lfk_exercises saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.lfk_exercises USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: lfk_sessions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.lfk_sessions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: mailing_logs_webapp saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.mailing_logs_webapp USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id()))));


--
-- Name: material_ratings saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.material_ratings USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: media_files saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_files USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND ((usage_purpose IS DISTINCT FROM 'program_item_submission'::text) OR (uploaded_by = app.current_patient_user_id()))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND ((usage_purpose IS DISTINCT FROM 'program_item_submission'::text) OR (uploaded_by = app.current_patient_user_id())))));


--
-- Name: media_folders saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_folders USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((patient_user_id IS NULL) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((patient_user_id IS NULL) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))));


--
-- Name: media_hls_proxy_error_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_hls_proxy_error_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: media_playback_client_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_playback_client_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: media_playback_resolution_events saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_playback_resolution_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: media_playback_user_video_first_resolve saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_playback_user_video_first_resolve USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: media_upload_sessions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.media_upload_sessions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (owner_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (owner_user_id = app.current_patient_user_id()))));


--
-- Name: message_log saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.message_log USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: motivational_quotes saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.motivational_quotes USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: online_intake_requests saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.online_intake_requests USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: operator_health_failure_archive saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.operator_health_failure_archive USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: org_enrollments saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.org_enrollments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: organization_member_invites saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.organization_member_invites USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())));


--
-- Name: patient_comorbidity saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_comorbidity USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: patient_content_rating_feedback saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_content_rating_feedback USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: patient_daily_warmup_presentations saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_daily_warmup_presentations USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: patient_diary_day_snapshots saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_diary_day_snapshots USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: patient_files saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_files USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: patient_home_blocks saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_home_blocks USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: patient_invites saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_invites USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())));


--
-- Name: patient_lfk_assignments saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_lfk_assignments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: patient_merge_candidates saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_merge_candidates USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: patient_payment saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_payment USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: patient_practice_completions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_practice_completions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: product_analytics_events_recent saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.product_analytics_events_recent USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: product_analytics_user_hourly saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.product_analytics_user_hourly USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: product_push_notifications saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.product_push_notifications USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: recommendation_regions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.recommendation_regions USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: recommendations saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.recommendations USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: reference_categories saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.reference_categories USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: reminder_journal saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.reminder_journal USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.reminder_rules b4f_rule
  WHERE ((b4f_rule.id = reminder_journal.rule_id) AND (b4f_rule.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.reminder_rules b4f_rule
  WHERE ((b4f_rule.id = reminder_journal.rule_id) AND (b4f_rule.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: reminder_rules saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.reminder_rules USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: saas_org_entitlement_overrides saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.saas_org_entitlement_overrides USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: specialist_tasks saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.specialist_tasks USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: support_conversations saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.support_conversations USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: support_questions saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.support_questions USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.support_conversations b4f_conv
  WHERE ((b4f_conv.id = support_questions.conversation_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.support_conversations b4f_conv
  WHERE ((b4f_conv.id = support_questions.conversation_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: symptom_trackings saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.symptom_trackings USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: test_attempts saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.test_attempts USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: test_sets saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.test_sets USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: tests saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.tests USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: treatment_program_instances saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.treatment_program_instances USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: treatment_program_templates saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.treatment_program_templates USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: user_subscriptions_webapp saas_org_dormant_p0_8_3; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_3 ON public.user_subscriptions_webapp USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id()))));


--
-- Name: be_package_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.be_package_items USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.be_subscription_packages p0_8_4_parent
  WHERE ((p0_8_4_parent.id = be_package_items.package_id) AND (p0_8_4_parent.organization_id = app.current_org_id())))) AND (EXISTS ( SELECT 1
   FROM public.be_clinic_services p0_8_4_cross
  WHERE ((p0_8_4_cross.id = be_package_items.service_id) AND (p0_8_4_cross.organization_id = app.current_org_id())))))))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.be_subscription_packages p0_8_4_parent
  WHERE ((p0_8_4_parent.id = be_package_items.package_id) AND (p0_8_4_parent.organization_id = app.current_org_id())))) AND (EXISTS ( SELECT 1
   FROM public.be_clinic_services p0_8_4_cross
  WHERE ((p0_8_4_cross.id = be_package_items.service_id) AND (p0_8_4_cross.organization_id = app.current_org_id()))))))));


--
-- Name: be_patient_package_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.be_patient_package_items USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.be_patient_packages p0_8_4_parent
  WHERE ((p0_8_4_parent.id = be_patient_package_items.patient_package_id) AND (p0_8_4_parent.organization_id = app.current_org_id())))) AND (EXISTS ( SELECT 1
   FROM public.be_clinic_services p0_8_4_cross
  WHERE ((p0_8_4_cross.id = be_patient_package_items.service_id) AND (p0_8_4_cross.organization_id = app.current_org_id()))))))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_patient_packages p0_8_4_patient_parent
  WHERE ((p0_8_4_patient_parent.id = be_patient_package_items.patient_package_id) AND (p0_8_4_patient_parent.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.be_patient_packages p0_8_4_parent
  WHERE ((p0_8_4_parent.id = be_patient_package_items.patient_package_id) AND (p0_8_4_parent.organization_id = app.current_org_id())))) AND (EXISTS ( SELECT 1
   FROM public.be_clinic_services p0_8_4_cross
  WHERE ((p0_8_4_cross.id = be_patient_package_items.service_id) AND (p0_8_4_cross.organization_id = app.current_org_id()))))))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.be_patient_packages p0_8_4_patient_parent
  WHERE ((p0_8_4_patient_parent.id = be_patient_package_items.patient_package_id) AND (p0_8_4_patient_parent.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: broadcast_audit_recipients saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.broadcast_audit_recipients USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: clinical_complaint_update saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.clinical_complaint_update USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.clinical_complaint b4f_complaint
  WHERE ((b4f_complaint.id = clinical_complaint_update.complaint_id) AND (b4f_complaint.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.clinical_complaint b4f_complaint
  WHERE ((b4f_complaint.id = clinical_complaint_update.complaint_id) AND (b4f_complaint.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: clinical_diagnosis_status_history saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.clinical_diagnosis_status_history USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.clinical_diagnosis b4f_diagnosis
  WHERE ((b4f_diagnosis.id = clinical_diagnosis_status_history.diagnosis_id) AND (b4f_diagnosis.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.clinical_diagnosis b4f_diagnosis
  WHERE ((b4f_diagnosis.id = clinical_diagnosis_status_history.diagnosis_id) AND (b4f_diagnosis.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: clinical_diagnosis_update saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.clinical_diagnosis_update USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.clinical_diagnosis b4f_diagnosis
  WHERE ((b4f_diagnosis.id = clinical_diagnosis_update.diagnosis_id) AND (b4f_diagnosis.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.clinical_diagnosis b4f_diagnosis
  WHERE ((b4f_diagnosis.id = clinical_diagnosis_update.diagnosis_id) AND (b4f_diagnosis.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: comments saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.comments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((target_type = ANY (ARRAY['exercise'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text])) OR ((target_type = 'program_instance'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4c4_comment_program
  WHERE ((b4c4_comment_program.id = comments.target_id) AND (b4c4_comment_program.patient_user_id = app.current_patient_user_id())))))) OR ((target_type = 'lfk_complex'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.lfk_complexes b4c4_comment_complex
  WHERE ((b4c4_comment_complex.id = comments.target_id) AND (b4c4_comment_complex.platform_user_id = app.current_patient_user_id())))))) OR ((target_type = 'stage_instance'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.treatment_program_instance_stages b4c4_comment_stage
     JOIN public.treatment_program_instances b4c4_comment_stage_program ON ((b4c4_comment_stage_program.id = b4c4_comment_stage.instance_id)))
  WHERE ((b4c4_comment_stage.id = comments.target_id) AND (b4c4_comment_stage_program.patient_user_id = app.current_patient_user_id())))))) OR ((target_type = 'stage_item_instance'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((public.treatment_program_instance_stage_items b4c4_comment_stage_item
     JOIN public.treatment_program_instance_stages b4c4_comment_item_stage ON ((b4c4_comment_item_stage.id = b4c4_comment_stage_item.stage_id)))
     JOIN public.treatment_program_instances b4c4_comment_item_program ON ((b4c4_comment_item_program.id = b4c4_comment_item_stage.instance_id)))
  WHERE ((b4c4_comment_stage_item.id = comments.target_id) AND (b4c4_comment_item_program.patient_user_id = app.current_patient_user_id()))))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((target_type = ANY (ARRAY['exercise'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text])) OR ((target_type = 'program_instance'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4c4_comment_program
  WHERE ((b4c4_comment_program.id = comments.target_id) AND (b4c4_comment_program.patient_user_id = app.current_patient_user_id())))))) OR ((target_type = 'lfk_complex'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.lfk_complexes b4c4_comment_complex
  WHERE ((b4c4_comment_complex.id = comments.target_id) AND (b4c4_comment_complex.platform_user_id = app.current_patient_user_id())))))) OR ((target_type = 'stage_instance'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.treatment_program_instance_stages b4c4_comment_stage
     JOIN public.treatment_program_instances b4c4_comment_stage_program ON ((b4c4_comment_stage_program.id = b4c4_comment_stage.instance_id)))
  WHERE ((b4c4_comment_stage.id = comments.target_id) AND (b4c4_comment_stage_program.patient_user_id = app.current_patient_user_id())))))) OR ((target_type = 'stage_item_instance'::text) AND ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((public.treatment_program_instance_stage_items b4c4_comment_stage_item
     JOIN public.treatment_program_instance_stages b4c4_comment_item_stage ON ((b4c4_comment_item_stage.id = b4c4_comment_stage_item.stage_id)))
     JOIN public.treatment_program_instances b4c4_comment_item_program ON ((b4c4_comment_item_program.id = b4c4_comment_item_stage.instance_id)))
  WHERE ((b4c4_comment_stage_item.id = comments.target_id) AND (b4c4_comment_item_program.patient_user_id = app.current_patient_user_id())))))))));


--
-- Name: content_section_slug_history saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.content_section_slug_history USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: lfk_complex_exercises saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.lfk_complex_exercises USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.lfk_complexes b4f_complex
  WHERE ((b4f_complex.id = lfk_complex_exercises.complex_id) AND (b4f_complex.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.lfk_complexes b4f_complex
  WHERE ((b4f_complex.id = lfk_complex_exercises.complex_id) AND (b4f_complex.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: lfk_complex_template_exercises saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.lfk_complex_template_exercises USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: lfk_exercise_media saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.lfk_exercise_media USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: media_transcode_jobs saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.media_transcode_jobs USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.media_files b4c4_transcode_media
  WHERE ((b4c4_transcode_media.id = media_transcode_jobs.media_id) AND ((b4c4_transcode_media.usage_purpose IS DISTINCT FROM 'program_item_submission'::text) OR (b4c4_transcode_media.uploaded_by = app.current_patient_user_id())))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.media_files b4c4_transcode_media
  WHERE ((b4c4_transcode_media.id = media_transcode_jobs.media_id) AND ((b4c4_transcode_media.usage_purpose IS DISTINCT FROM 'program_item_submission'::text) OR (b4c4_transcode_media.uploaded_by = app.current_patient_user_id()))))))));


--
-- Name: notification_delivery_attempts saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.notification_delivery_attempts USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: online_intake_answers saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.online_intake_answers USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.online_intake_requests b4f_intake_request
  WHERE ((b4f_intake_request.id = online_intake_answers.request_id) AND (b4f_intake_request.user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.online_intake_requests b4f_intake_request
  WHERE ((b4f_intake_request.id = online_intake_answers.request_id) AND (b4f_intake_request.user_id = app.current_patient_user_id())))))));


--
-- Name: online_intake_attachments saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.online_intake_attachments USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.online_intake_requests b4f_intake_request
  WHERE ((b4f_intake_request.id = online_intake_attachments.request_id) AND (b4f_intake_request.user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.online_intake_requests b4f_intake_request
  WHERE ((b4f_intake_request.id = online_intake_attachments.request_id) AND (b4f_intake_request.user_id = app.current_patient_user_id())))))));


--
-- Name: online_intake_status_history saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.online_intake_status_history USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.online_intake_requests b4f_intake_request
  WHERE ((b4f_intake_request.id = online_intake_status_history.request_id) AND (b4f_intake_request.user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.online_intake_requests b4f_intake_request
  WHERE ((b4f_intake_request.id = online_intake_status_history.request_id) AND (b4f_intake_request.user_id = app.current_patient_user_id())))))));


--
-- Name: patient_daily_warmup_video_views saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.patient_daily_warmup_video_views USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (user_id = app.current_patient_user_id()))));


--
-- Name: patient_home_block_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.patient_home_block_items USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: program_action_log saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.program_action_log USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: program_item_discussion_messages saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.program_item_discussion_messages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: program_item_discussion_reads saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.program_item_discussion_reads USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (patient_user_id = app.current_patient_user_id()))));


--
-- Name: reference_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.reference_items USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: reminder_delivery_events saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.reminder_delivery_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id()))));


--
-- Name: reminder_occurrence_history saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.reminder_occurrence_history USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_integrator_user_id() IS NOT NULL) AND (integrator_user_id = app.current_integrator_user_id()))));


--
-- Name: support_conversation_messages saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.support_conversation_messages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.support_conversations b4f_conv
  WHERE ((b4f_conv.id = support_conversation_messages.conversation_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.support_conversations b4f_conv
  WHERE ((b4f_conv.id = support_conversation_messages.conversation_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: support_delivery_events saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.support_delivery_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.support_conversation_messages b4f_msg
     JOIN public.support_conversations b4f_conv ON ((b4f_conv.id = b4f_msg.conversation_id)))
  WHERE ((b4f_msg.id = support_delivery_events.conversation_message_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.support_conversation_messages b4f_msg
     JOIN public.support_conversations b4f_conv ON ((b4f_conv.id = b4f_msg.conversation_id)))
  WHERE ((b4f_msg.id = support_delivery_events.conversation_message_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: support_question_messages saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.support_question_messages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.support_questions b4f_question
     JOIN public.support_conversations b4f_conv ON ((b4f_conv.id = b4f_question.conversation_id)))
  WHERE ((b4f_question.id = support_question_messages.question_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.support_questions b4f_question
     JOIN public.support_conversations b4f_conv ON ((b4f_conv.id = b4f_question.conversation_id)))
  WHERE ((b4f_question.id = support_question_messages.question_id) AND (b4f_conv.platform_user_id = app.current_patient_user_id())))))));


--
-- Name: symptom_entries saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.symptom_entries USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: test_results saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.test_results USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.test_attempts b4f_attempt
  WHERE ((b4f_attempt.id = test_results.attempt_id) AND (b4f_attempt.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.test_attempts b4f_attempt
  WHERE ((b4f_attempt.id = test_results.attempt_id) AND (b4f_attempt.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: test_set_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.test_set_items USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: treatment_program_events saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_events USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4f_instance
  WHERE ((b4f_instance.id = treatment_program_events.instance_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4f_instance
  WHERE ((b4f_instance.id = treatment_program_events.instance_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: treatment_program_instance_stage_groups saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_instance_stage_groups USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.treatment_program_instance_stages b4f_stage
     JOIN public.treatment_program_instances b4f_instance ON ((b4f_instance.id = b4f_stage.instance_id)))
  WHERE ((b4f_stage.id = treatment_program_instance_stage_groups.stage_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.treatment_program_instance_stages b4f_stage
     JOIN public.treatment_program_instances b4f_instance ON ((b4f_instance.id = b4f_stage.instance_id)))
  WHERE ((b4f_stage.id = treatment_program_instance_stage_groups.stage_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: treatment_program_instance_stage_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_instance_stage_items USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.treatment_program_instance_stages b4f_stage
     JOIN public.treatment_program_instances b4f_instance ON ((b4f_instance.id = b4f_stage.instance_id)))
  WHERE ((b4f_stage.id = treatment_program_instance_stage_items.stage_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.treatment_program_instance_stages b4f_stage
     JOIN public.treatment_program_instances b4f_instance ON ((b4f_instance.id = b4f_stage.instance_id)))
  WHERE ((b4f_stage.id = treatment_program_instance_stage_items.stage_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: treatment_program_instance_stages saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_instance_stages USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4f_instance
  WHERE ((b4f_instance.id = treatment_program_instance_stages.instance_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id()))))))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.treatment_program_instances b4f_instance
  WHERE ((b4f_instance.id = treatment_program_instance_stages.instance_id) AND (b4f_instance.patient_user_id = app.current_patient_user_id())))))));


--
-- Name: treatment_program_template_stage_groups saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_template_stage_groups USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: treatment_program_template_stage_items saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_template_stage_items USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: treatment_program_template_stages saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.treatment_program_template_stages USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: webapp_reminder_occurrences saas_org_dormant_p0_8_4; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_dormant_p0_8_4 ON public.webapp_reminder_occurrences USING (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))) OR ((app.current_patient_user_id() IS NOT NULL) AND (platform_user_id = app.current_patient_user_id()))));


--
-- Name: saas_org_entitlement_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saas_org_entitlement_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: saas_org_entitlement_overrides saas_org_entitlement_overrides_current_patient_capability_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_entitlement_overrides_current_patient_capability_read ON public.saas_org_entitlement_overrides FOR SELECT USING (((app.current_org_id() IS NOT NULL) AND (app.current_patient_user_id() IS NOT NULL) AND (organization_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM (public.be_organizations organization
     JOIN public.org_enrollments enrollment ON (((enrollment.organization_id = organization.id) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))
  WHERE ((organization.id = app.current_org_id()) AND (organization.is_active = true))))));


--
-- Name: saas_org_entitlement_overrides saas_org_entitlement_overrides_org_wall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_org_entitlement_overrides_org_wall ON public.saas_org_entitlement_overrides USING ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id())))) WITH CHECK ((app.is_staff() AND ((app.current_org_id() IS NOT NULL) AND (organization_id = app.current_org_id()))));


--
-- Name: saas_tariffs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saas_tariffs ENABLE ROW LEVEL SECURITY;

--
-- Name: saas_tariffs saas_tariffs_current_patient_capability_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_tariffs_current_patient_capability_read ON public.saas_tariffs FOR SELECT USING (((app.current_org_id() IS NOT NULL) AND (app.current_patient_user_id() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.be_organizations organization
     JOIN public.org_enrollments enrollment ON (((enrollment.organization_id = organization.id) AND (enrollment.platform_user_id = app.current_patient_user_id()) AND (enrollment.status = 'active'::text))))
  WHERE ((organization.id = app.current_org_id()) AND (organization.is_active = true) AND (organization.tariff_id = saas_tariffs.id))))));


--
-- Name: saas_tariffs saas_tariffs_staff_read_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saas_tariffs_staff_read_write ON public.saas_tariffs USING (app.is_staff()) WITH CHECK (app.is_staff());


--
-- Name: specialist_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.specialist_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: support_conversation_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_conversation_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: support_delivery_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_delivery_events ENABLE ROW LEVEL SECURITY;

--
-- Name: support_question_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_question_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: symptom_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.symptom_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: symptom_trackings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.symptom_trackings ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: test_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

--
-- Name: test_set_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_set_items ENABLE ROW LEVEL SECURITY;

--
-- Name: test_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_events ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_instance_stage_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_instance_stage_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_instance_stage_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_instance_stage_items ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_instance_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_instance_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_template_stage_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_template_stage_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_template_stage_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_template_stage_items ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_template_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_template_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_program_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treatment_program_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: user_phone_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_phone_history ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions_webapp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions_webapp ENABLE ROW LEVEL SECURITY;

--
-- Name: webapp_reminder_occurrences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webapp_reminder_occurrences ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict bcb_a0_schema_only
