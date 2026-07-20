-- U3B patient portal invitations. A relationship/card already exists in org_enrollments;
-- this lifecycle only proves portal identity and activates that exact relationship.
CREATE TABLE IF NOT EXISTS public.patient_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.org_enrollments(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by_platform_user_id uuid NOT NULL REFERENCES public.platform_users(id),
  invited_email_normalized text,
  delivery_channel_hint text,
  expires_at timestamptz NOT NULL,
  accepted_by_platform_user_id uuid REFERENCES public.platform_users(id),
  accepted_via text,
  superseded_by_invite_id uuid REFERENCES public.patient_invites(id) ON DELETE SET NULL,
  continuation_hash text,
  continuation_expires_at timestamptz,
  proof_email_normalized text,
  proof_challenge_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by_platform_user_id uuid REFERENCES public.platform_users(id),
  CONSTRAINT patient_invites_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text, 'superseded'::text])
  ),
  CONSTRAINT patient_invites_accepted_via_check CHECK (
    accepted_via IS NULL OR accepted_via = ANY (ARRAY['phone_otp'::text, 'email_otp'::text, 'oauth'::text])
  ),
  CONSTRAINT patient_invites_accepted_subject_check CHECK (
    accepted_by_platform_user_id IS NULL OR accepted_by_platform_user_id = patient_user_id
  )
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

-- Raw bearer exchange. The bearer is accepted only as a SQL parameter; the returned continuation
-- is a distinct, short-lived opaque value whose hash is the only persisted representation.
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
  v_email text;
  v_phone text;
  v_hint text;
  v_enrollment_status text;
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
    SET status = 'expired', updated_at = now(), continuation_hash = NULL,
        continuation_expires_at = NULL, proof_email_normalized = NULL, proof_challenge_id = NULL
    WHERE invite.id = v_invite.id AND invite.status = 'pending';
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT enrollment.status INTO v_enrollment_status
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1;
  IF v_enrollment_status = 'active' THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  ELSIF v_enrollment_status IS DISTINCT FROM 'invited' THEN
    RETURN QUERY SELECT false, 'wrong_org'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT organization.title, patient.email_normalized, patient.phone_normalized
  INTO v_organization_title, v_email, v_phone
  FROM public.be_organizations AS organization
  INNER JOIN public.platform_users AS patient ON patient.id = v_invite.patient_user_id
  WHERE organization.id = v_invite.organization_id
    AND organization.is_active = true
    AND patient.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'organization_unavailable'::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  v_email := COALESCE(v_invite.invited_email_normalized, v_email);
  IF v_email IS NOT NULL AND position('@' IN v_email) > 1 THEN
    v_hint := left(v_email, 1) || '***@' || split_part(v_email, '@', 2);
  ELSIF v_phone IS NOT NULL AND length(v_phone) >= 2 THEN
    v_hint := '***' || right(v_phone, 2);
  ELSE
    v_hint := NULL;
  END IF;

  UPDATE public.patient_invites AS invite
  SET continuation_hash = p_continuation_hash,
      continuation_expires_at = LEAST(p_continuation_expires_at, v_invite.expires_at),
      proof_email_normalized = NULL,
      proof_challenge_id = NULL,
      updated_at = now()
  WHERE invite.id = v_invite.id;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    true,
    NULL::text,
    organization.title,
    CASE
      WHEN COALESCE(invite.invited_email_normalized, patient.email_normalized) IS NOT NULL
        AND position('@' IN COALESCE(invite.invited_email_normalized, patient.email_normalized)) > 1
        THEN left(COALESCE(invite.invited_email_normalized, patient.email_normalized), 1)
          || '***@' || split_part(COALESCE(invite.invited_email_normalized, patient.email_normalized), '@', 2)
      WHEN patient.phone_normalized IS NOT NULL AND length(patient.phone_normalized) >= 2
        THEN '***' || right(patient.phone_normalized, 2)
      ELSE NULL
    END,
    invite.expires_at
  FROM public.patient_invites AS invite
  INNER JOIN public.be_organizations AS organization
    ON organization.id = invite.organization_id AND organization.is_active = true
  INNER JOIN public.platform_users AS patient
    ON patient.id = invite.patient_user_id AND patient.merged_into_id IS NULL
  INNER JOIN public.org_enrollments AS enrollment
    ON enrollment.id = invite.enrollment_id
   AND enrollment.organization_id = invite.organization_id
   AND enrollment.platform_user_id = invite.patient_user_id
   AND enrollment.status = 'invited'
  WHERE invite.continuation_hash = p_continuation_hash
    AND invite.continuation_expires_at > now()
    AND invite.expires_at > now()
    AND invite.status = 'pending'
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.prepare_patient_invite_email_proof(
  p_continuation_hash text,
  p_email_normalized text
)
RETURNS TABLE (ok boolean, code text, patient_user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  v_invite public.patient_invites%ROWTYPE;
  v_email text := lower(btrim(p_email_normalized));
BEGIN
  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_invite.status <> 'pending'
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now() THEN
    UPDATE public.patient_invites SET status = 'expired', updated_at = now() WHERE id = v_invite.id;
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_email = '' OR position('@' IN v_email) <= 1 THEN
    RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.invited_email_normalized IS NOT NULL
     AND v_invite.invited_email_normalized <> v_email THEN
    RETURN QUERY SELECT false, 'wrong_recipient'::text, NULL::uuid;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.id = v_invite.enrollment_id
      AND enrollment.organization_id = v_invite.organization_id
      AND enrollment.platform_user_id = v_invite.patient_user_id
      AND enrollment.status = 'invited'
  ) THEN
    RETURN QUERY SELECT false, 'wrong_org'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.patient_invites AS invite
  SET proof_email_normalized = v_email, proof_challenge_id = NULL, updated_at = now()
  WHERE invite.id = v_invite.id;
  RETURN QUERY SELECT true, NULL::text, v_invite.patient_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.bind_patient_invite_email_challenge(
  p_continuation_hash text,
  p_email_normalized text,
  p_challenge_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  UPDATE public.patient_invites AS invite
  SET proof_challenge_id = p_challenge_id, updated_at = now()
  WHERE invite.continuation_hash = p_continuation_hash
    AND invite.status = 'pending'
    AND invite.expires_at > now()
    AND invite.continuation_expires_at > now()
    AND invite.proof_email_normalized = lower(btrim(p_email_normalized))
  RETURNING true
$function$;

CREATE OR REPLACE FUNCTION app.read_patient_invite_email_proof(p_continuation_hash text)
RETURNS TABLE (
  patient_user_id uuid,
  challenge_id uuid,
  email_normalized text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT invite.patient_user_id, invite.proof_challenge_id, invite.proof_email_normalized
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
    AND invite.status = 'pending'
    AND invite.expires_at > now()
    AND invite.continuation_expires_at > now()
    AND invite.proof_challenge_id IS NOT NULL
    AND invite.proof_email_normalized IS NOT NULL
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.redeem_patient_invite_email(
  p_continuation_hash text,
  p_challenge_id uuid,
  p_email_normalized text
)
RETURNS TABLE (
  ok boolean,
  code text,
  platform_user_id uuid,
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
  v_email text := lower(btrim(p_email_normalized));
  v_email_owner_id uuid;
  v_enrollment_status text;
BEGIN
  SELECT invite.* INTO v_invite
  FROM public.patient_invites AS invite
  WHERE invite.continuation_hash = p_continuation_hash
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_continuation'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false,
      CASE WHEN v_invite.status = 'accepted' THEN 'already_linked' ELSE v_invite.status || '_token' END,
      NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now()
     OR v_invite.continuation_expires_at IS NULL
     OR v_invite.continuation_expires_at <= now() THEN
    IF v_invite.expires_at <= now() THEN
      UPDATE public.patient_invites SET status = 'expired', updated_at = now() WHERE id = v_invite.id;
    END IF;
    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.proof_challenge_id IS DISTINCT FROM p_challenge_id
     OR v_invite.proof_email_normalized IS DISTINCT FROM v_email THEN
    RETURN QUERY SELECT false, 'wrong_recipient'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT patient.* INTO v_patient
  FROM public.platform_users AS patient
  WHERE patient.id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_patient.merged_into_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_invite.invited_email_normalized IS NOT NULL
     AND v_invite.invited_email_normalized <> v_email THEN
    RETURN QUERY SELECT false, 'wrong_recipient'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_patient.email_normalized IS NOT NULL AND v_patient.email_normalized <> v_email THEN
    RETURN QUERY SELECT false, 'wrong_recipient'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT user_row.id INTO v_email_owner_id
  FROM public.platform_users AS user_row
  WHERE user_row.email_normalized = v_email
    AND user_row.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE;
  IF v_email_owner_id IS NOT NULL AND v_email_owner_id <> v_invite.patient_user_id THEN
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      v_invite.organization_id, v_invite.patient_user_id, v_email_owner_id,
      'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
    )
    ON CONFLICT (anchor_user_id, candidate_user_id) WHERE status = 'pending' DO NOTHING;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT enrollment.status INTO v_enrollment_status
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
  LIMIT 1
  FOR UPDATE;
  IF v_enrollment_status = 'active' THEN
    RETURN QUERY SELECT false, 'already_linked'::text, NULL::uuid, NULL::uuid;
    RETURN;
  ELSIF v_enrollment_status IS DISTINCT FROM 'invited' THEN
    RETURN QUERY SELECT false, 'wrong_org'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.platform_users AS patient
    SET email = COALESCE(patient.email, v_email),
        email_normalized = COALESCE(patient.email_normalized, v_email),
        email_verified_at = COALESCE(patient.email_verified_at, now()),
        updated_at = now()
    WHERE patient.id = v_invite.patient_user_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT user_row.id INTO v_email_owner_id
    FROM public.platform_users AS user_row
    WHERE user_row.email_normalized = v_email
      AND user_row.merged_into_id IS NULL
      AND user_row.id <> v_invite.patient_user_id
    LIMIT 1;
    IF v_email_owner_id IS NOT NULL THEN
      INSERT INTO public.patient_merge_candidates (
        organization_id, anchor_user_id, candidate_user_id, reason, status, payload
      ) VALUES (
        v_invite.organization_id, v_invite.patient_user_id, v_email_owner_id,
        'invite_redeem_identity_conflict', 'pending', '{}'::jsonb
      )
      ON CONFLICT (anchor_user_id, candidate_user_id) WHERE status = 'pending' DO NOTHING;
    END IF;
    RETURN QUERY SELECT false, 'conflicting_identity'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END;

  UPDATE public.org_enrollments AS enrollment
  SET status = 'active'
  WHERE enrollment.id = v_invite.enrollment_id
    AND enrollment.organization_id = v_invite.organization_id
    AND enrollment.platform_user_id = v_invite.patient_user_id
    AND enrollment.status = 'invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_enrollment_activation_failed';
  END IF;

  UPDATE public.patient_invites AS invite
  SET status = 'accepted',
      accepted_by_platform_user_id = v_invite.patient_user_id,
      accepted_via = 'email_otp',
      accepted_at = now(),
      updated_at = now(),
      continuation_hash = NULL,
      continuation_expires_at = NULL,
      proof_email_normalized = NULL,
      proof_challenge_id = NULL
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invite_accept_failed';
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_invite.patient_user_id, v_invite.organization_id;
END
$function$;

REVOKE ALL ON FUNCTION app.exchange_patient_invite(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lookup_patient_invite_continuation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prepare_patient_invite_email_proof(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.bind_patient_invite_email_challenge(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_patient_invite_email_proof(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.redeem_patient_invite_email(text, uuid, text) FROM PUBLIC;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_invites TO app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.exchange_patient_invite(text, text, timestamptz) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.lookup_patient_invite_continuation(text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.prepare_patient_invite_email_proof(text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.bind_patient_invite_email_challenge(text, text, uuid) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.read_patient_invite_email_proof(text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.redeem_patient_invite_email(text, uuid, text) TO app_patient;
  END IF;
END
$block$;

-- Rollback before any invite has been issued:
-- DROP FUNCTION app.redeem_patient_invite_email(text, uuid, text);
-- DROP FUNCTION app.read_patient_invite_email_proof(text);
-- DROP FUNCTION app.bind_patient_invite_email_challenge(text, text, uuid);
-- DROP FUNCTION app.prepare_patient_invite_email_proof(text, text);
-- DROP FUNCTION app.lookup_patient_invite_continuation(text);
-- DROP FUNCTION app.exchange_patient_invite(text, text, timestamptz);
-- DROP TABLE public.patient_invites;
