-- Journal the two live organization-invite roots that previously existed only in the repeatable
-- legacy deploy overlay. The final declaration injects the transaction-context gate and assigns
-- exact seam owners/ACL; this migration leaves both roots closed to PUBLIC.

CREATE OR REPLACE FUNCTION app.lookup_pending_org_invite(p_token_hash text)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  invited_email text,
  invited_role text,
  status text,
  expires_at timestamptz,
  created_by_platform_user_id uuid,
  accepted_by_platform_user_id uuid,
  accepted_membership_id uuid,
  created_at timestamptz,
  accepted_at timestamptz,
  organization_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
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

COMMENT ON FUNCTION app.lookup_pending_org_invite(text) IS
  'Narrow invite-token lookup for bootstrap accept flow. Final EXECUTE ACL is declaration-owned.';

CREATE OR REPLACE FUNCTION app.accept_org_invite(
  p_token_hash text,
  p_platform_user_id uuid,
  p_expected_email text
)
RETURNS TABLE (
  ok boolean,
  code text,
  organization_id uuid,
  membership_id uuid,
  platform_user_id uuid,
  specialist_id uuid,
  role text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
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

COMMENT ON FUNCTION app.accept_org_invite(text, uuid, text) IS
  'Atomic organization invite acceptance; final context gate, owner and EXECUTE ACL are declaration-owned.';

REVOKE ALL ON FUNCTION app.lookup_pending_org_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_org_invite(text, uuid, text) FROM PUBLIC;
