-- U3B patient portal invitations. org_enrollments.status is the care relationship state;
-- portal_activated_* is the separate, explicit proof that a patient identity claimed that relationship.
ALTER TABLE public.org_enrollments
  ADD COLUMN IF NOT EXISTS portal_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_activated_via text;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.org_enrollments'::regclass
      AND conname = 'org_enrollments_portal_activation_check'
  ) THEN
    ALTER TABLE public.org_enrollments
      ADD CONSTRAINT org_enrollments_portal_activation_check CHECK (
        (portal_activated_at IS NULL AND portal_activated_via IS NULL)
        OR (
          portal_activated_at IS NOT NULL
          AND portal_activated_via = 'patient_invite_email_otp'
        )
      );
  END IF;
END
$block$;

-- Deliberately no legacy backfill: migration 0145 marked relationships active without proving portal identity.
CREATE TABLE IF NOT EXISTS public.patient_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.org_enrollments(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by_platform_user_id uuid NOT NULL REFERENCES public.platform_users(id),
  invited_email_normalized text NOT NULL,
  delivery_channel_hint text,
  expires_at timestamptz NOT NULL,
  accepted_by_platform_user_id uuid REFERENCES public.platform_users(id),
  accepted_via text,
  superseded_by_invite_id uuid REFERENCES public.patient_invites(id) ON DELETE SET NULL,
  bearer_exchanged_at timestamptz,
  continuation_hash text,
  continuation_expires_at timestamptz,
  proof_email_normalized text,
  proof_code_hash text,
  proof_started_at timestamptz,
  proof_expires_at timestamptz,
  proof_attempts integer NOT NULL DEFAULT 0,
  proof_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by_platform_user_id uuid REFERENCES public.platform_users(id),
  CONSTRAINT patient_invites_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text, 'superseded'::text])
  ),
  CONSTRAINT patient_invites_accepted_via_check CHECK (
    accepted_via IS NULL OR accepted_via = 'email_otp'
  ),
  CONSTRAINT patient_invites_accepted_subject_check CHECK (
    accepted_by_platform_user_id IS NULL OR accepted_by_platform_user_id = patient_user_id
  ),
  CONSTRAINT patient_invites_proof_attempts_check CHECK (proof_attempts >= 0 AND proof_attempts <= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_invites_token_hash_key
  ON public.patient_invites (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS patient_invites_continuation_hash_key
  ON public.patient_invites (continuation_hash)
  WHERE continuation_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_invites_org_patient_pending
  ON public.patient_invites (organization_id, patient_user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_patient_invites_org_patient_status
  ON public.patient_invites (organization_id, patient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_invites_enrollment
  ON public.patient_invites (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_patient_invites_status_expires
  ON public.patient_invites (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_patient_invites_continuation_expires
  ON public.patient_invites (continuation_expires_at)
  WHERE continuation_hash IS NOT NULL;

ALTER TABLE public.patient_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.patient_invites;
CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_invites
  FOR ALL
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  )
  WITH CHECK (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );

-- Raw bearer exchange. One successful exchange permanently consumes the bearer; only the
-- distinct short-lived continuation hash remains usable.
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
  IF v_invite.invited_email_normalized IS NULL
     OR position('@' IN v_invite.invited_email_normalized) <= 1 THEN
    RETURN QUERY SELECT false, 'missing_recipient'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  v_hint := left(v_invite.invited_email_normalized, 1)
    || '***@' || split_part(v_invite.invited_email_normalized, '@', 2);

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

CREATE OR REPLACE FUNCTION app.lookup_patient_invite_continuation(p_continuation_hash text)
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
  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::text, NULL::text, NULL::timestamptz;
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
    AND organization.is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  v_hint := CASE
    WHEN v_invite.invited_email_normalized IS NOT NULL
      AND position('@' IN v_invite.invited_email_normalized) > 1
      THEN left(v_invite.invited_email_normalized, 1)
        || '***@' || split_part(v_invite.invited_email_normalized, '@', 2)
    ELSE NULL
  END;
  RETURN QUERY SELECT true, NULL::text, v_organization_title, v_hint, v_invite.expires_at;
END
$function$;

-- Purpose-scoped invite OTP state lives on the invite row and never deletes ordinary login/setup challenges.
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
  PERFORM 1
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text;
    RETURN;
  END IF;
  IF v_email = '' OR position('@' IN v_email) <= 1
     OR v_invite.invited_email_normalized IS NULL
     OR v_invite.invited_email_normalized <> v_email
     OR p_code_hash IS NULL OR p_code_hash = ''
     OR p_proof_expires_at IS NULL OR p_proof_expires_at <= now() THEN
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

CREATE OR REPLACE FUNCTION app.cancel_patient_invite_email_proof(
  p_continuation_hash text,
  p_code_hash text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
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
  PERFORM 1
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true
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
     OR v_invite.invited_email_normalized IS DISTINCT FROM v_email
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

-- The route resolves the canonical identity through the already-approved email auth lookup only
-- after OTP proof. Redeem accepts that authenticated identity and rechecks the proof atomically.
CREATE OR REPLACE FUNCTION app.redeem_patient_invite_email(
  p_continuation_hash text
)
RETURNS TABLE (
  ok boolean,
  code text,
  organization_id uuid
)
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

  -- Organization is locked and re-checked before any identity/enrollment/invite/session-authority mutation.
  PERFORM 1
  FROM public.be_organizations AS organization
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true
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
     OR v_patient.email_normalized IS DISTINCT FROM v_invite.invited_email_normalized THEN
    IF v_patient.id <> v_invite.patient_user_id THEN
      INSERT INTO public.patient_merge_candidates (
        organization_id, anchor_user_id, candidate_user_id, reason, status, payload
      ) VALUES (
        v_invite.organization_id, v_invite.patient_user_id, v_patient.id,
        'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
      ) ON CONFLICT (anchor_user_id, candidate_user_id) WHERE status = 'pending' DO NOTHING;
    END IF;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_patient.id <> v_invite.patient_user_id THEN
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      v_invite.organization_id, v_invite.patient_user_id, v_patient.id,
      'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
    ) ON CONFLICT (anchor_user_id, candidate_user_id) WHERE status = 'pending' DO NOTHING;
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
  SET email_verified_at = COALESCE(patient.email_verified_at, now()),
      updated_at = now()
  WHERE patient.id = v_invite.patient_user_id;

  UPDATE public.org_enrollments AS enrollment
  SET status = 'active',
      portal_activated_at = now(),
      portal_activated_via = 'patient_invite_email_otp'
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
    AND enrollment.portal_activated_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_portal_activation_failed';
  END IF;

  UPDATE public.patient_invites AS invite
  SET status = 'accepted',
      accepted_by_platform_user_id = v_invite.patient_user_id,
      accepted_via = 'email_otp',
      accepted_at = now(),
      updated_at = now(),
      proof_code_hash = NULL,
      proof_expires_at = NULL
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_invite.organization_id;
END
$function$;

REVOKE ALL ON FUNCTION app.exchange_patient_invite(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lookup_patient_invite_continuation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.start_patient_invite_email_proof(text, text, text, timestamptz, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.cancel_patient_invite_email_proof(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.verify_patient_invite_email_proof(text, text, text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.redeem_patient_invite_email(text) FROM PUBLIC;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_invites TO app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.exchange_patient_invite(text, text, timestamptz) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.lookup_patient_invite_continuation(text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.start_patient_invite_email_proof(text, text, text, timestamptz, text, bigint, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.cancel_patient_invite_email_proof(text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.verify_patient_invite_email_proof(text, text, text, text, bigint, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.redeem_patient_invite_email(text) TO app_patient;
  END IF;
END
$block$;

-- Scratch rollback order: functions, patient_invites, activation constraint, activation columns.
