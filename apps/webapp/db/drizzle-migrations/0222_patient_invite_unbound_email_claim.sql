-- U3B #806: contactless patient invitations claim a newly verified email on the existing
-- canonical placeholder. Existing bound-email invitations keep their 0220 semantics.
ALTER TABLE public.patient_invites
  ADD COLUMN IF NOT EXISTS recipient_binding text NOT NULL DEFAULT 'bound_email';

ALTER TABLE public.patient_invites
  ALTER COLUMN invited_email_normalized DROP NOT NULL;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.patient_invites'::regclass
      AND conname = 'patient_invites_recipient_binding_check'
  ) THEN
    ALTER TABLE public.patient_invites
      ADD CONSTRAINT patient_invites_recipient_binding_check CHECK (
        (
          recipient_binding = 'bound_email'
          AND invited_email_normalized IS NOT NULL
          AND position('@' IN invited_email_normalized) > 1
        )
        OR (
          recipient_binding = 'unbound_email_claim'
          AND invited_email_normalized IS NULL
        )
      );
  END IF;
END
$block$;

-- A conflict belongs to the organization whose invite observed it. The previous pair-only
-- index could suppress the same canonical pair in a second organization.
DROP INDEX IF EXISTS public.uq_patient_merge_candidates_pending_pair;
DROP INDEX IF EXISTS public.patient_merge_candidates_pending_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_merge_candidates_org_pending_pair
  ON public.patient_merge_candidates (organization_id, anchor_user_id, candidate_user_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION app.exchange_patient_invite(
  p_token_hash text,
  p_continuation_hash text,
  p_continuation_expires_at timestamptz
)
RETURNS TABLE (
  ok boolean,
  code text,
  organization_title text,
  recipient_hint text,
  invite_expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
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
$function$;

-- Preserve the bound-email 0220 contract while making conflict deduplication organization-scoped.
CREATE OR REPLACE FUNCTION app.redeem_patient_invite_email(p_continuation_hash text)
RETURNS TABLE (ok boolean, code text, organization_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
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
$function$;

-- The only unbound claim mutation. It derives the target identity and organization from the
-- locked invite, requires the already-verified invite-scoped OTP, and never calls generic registration.
CREATE OR REPLACE FUNCTION app.claim_unbound_patient_invite_email(
  p_continuation_hash text,
  p_email_normalized text,
  p_authorization_nonce text,
  p_authorization_expires_epoch bigint,
  p_authorization_signature text
)
RETURNS TABLE (ok boolean, code text, organization_id uuid, patient_user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_patient public.platform_users%ROWTYPE;
  v_email_owner_id uuid;
  v_enrollment_status text;
  v_portal_activated_at timestamptz;
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
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid, NULL::uuid;
    RETURN;
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
     OR v_invite.proof_email_normalized IS DISTINCT FROM v_email THEN
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

  SELECT enrollment.status, enrollment.portal_activated_at
  INTO v_enrollment_status, v_portal_activated_at
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF v_portal_activated_at IS NOT NULL THEN
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
      accepted_via = 'email_otp', accepted_at = now(), updated_at = now(),
      proof_code_hash = NULL, proof_expires_at = NULL
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;
  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id, v_invite.patient_user_id;
END
$function$;

REVOKE ALL ON FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text) FROM PUBLIC;
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text)
      TO app_patient;
  END IF;
END
$block$;

CREATE OR REPLACE FUNCTION app.start_patient_invite_email_proof(
  p_continuation_hash text,
  p_email_normalized text,
  p_code_hash text,
  p_proof_expires_at timestamptz,
  p_authorization_nonce text,
  p_authorization_expires_epoch bigint,
  p_authorization_signature text
)
RETURNS TABLE (ok boolean, code text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION app.verify_patient_invite_email_proof(
  p_continuation_hash text,
  p_email_normalized text,
  p_code_hash text,
  p_authorization_nonce text,
  p_authorization_expires_epoch bigint,
  p_authorization_signature text
)
RETURNS TABLE (ok boolean, code text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
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
  IF NOT FOUND OR v_invite.status <> 'pending'
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
$function$;
