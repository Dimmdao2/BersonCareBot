-- 0257: reserve the mandatory public clinic slug before specialist signup provisioning.
--
-- A pending signup intent may own only a disposable reservation. The existing global UNIQUE(slug)
-- remains unchanged, and current/alias rows remain permanently bound to an organization.

ALTER TABLE public.specialist_signup_intents
  ADD COLUMN organization_slug text;

ALTER TABLE public.organization_slug_claims
  ALTER COLUMN organization_id DROP NOT NULL,
  ADD COLUMN signup_intent_id uuid;

ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_signup_intent_id_fkey
    FOREIGN KEY (signup_intent_id)
    REFERENCES public.specialist_signup_intents(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT organization_slug_claims_owner_shape_check
    CHECK (
      (
        kind = 'reservation'
        AND ((organization_id IS NOT NULL)::int + (signup_intent_id IS NOT NULL)::int) = 1
      )
      OR
      (
        kind IN ('current', 'alias')
        AND organization_id IS NOT NULL
        AND signup_intent_id IS NULL
      )
    );

CREATE UNIQUE INDEX uq_organization_slug_claims_reservation_signup_intent
  ON public.organization_slug_claims USING btree (signup_intent_id)
  WHERE kind = 'reservation' AND signup_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.is_organization_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS claim
    WHERE claim.slug = p_slug
  )
$function$;

CREATE OR REPLACE FUNCTION app.reserve_specialist_signup_slug(
  p_signup_intent_id uuid,
  p_slug text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
  v_reservation_id uuid;
BEGIN
  v_user_id := app.require_staff_security_self_user_id();

  PERFORM pg_advisory_xact_lock(
    hashtextextended('specialist_signup_slug:' || p_signup_intent_id::text, 0)
  );

  PERFORM 1
  FROM public.specialist_signup_intents AS intent
  WHERE intent.id = p_signup_intent_id
    AND intent.user_id = v_user_id
    AND intent.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'specialist_signup_intent_not_found';
  END IF;

  SELECT claim.id
  INTO v_reservation_id
  FROM public.organization_slug_claims AS claim
  WHERE claim.signup_intent_id = p_signup_intent_id
    AND claim.kind = 'reservation'
  LIMIT 1
  FOR UPDATE;

  IF v_reservation_id IS NULL THEN
    INSERT INTO public.organization_slug_claims (
      slug,
      kind,
      organization_id,
      signup_intent_id,
      created_by_platform_user_id
    )
    VALUES (p_slug, 'reservation', NULL, p_signup_intent_id, v_user_id);
  ELSE
    UPDATE public.organization_slug_claims AS claim
    SET slug = p_slug,
        updated_at = now()
    WHERE claim.id = v_reservation_id;
  END IF;

  UPDATE public.specialist_signup_intents AS intent
  SET organization_slug = p_slug
  WHERE intent.id = p_signup_intent_id;

  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'slug_unavailable';
END
$function$;

DO $specialist_signup_slug_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.is_organization_slug_available(text) OWNER TO app_owner;
    ALTER FUNCTION app.reserve_specialist_signup_slug(uuid, text) OWNER TO app_owner;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_slug_claims TO app_owner;
    GRANT SELECT, UPDATE ON TABLE public.specialist_signup_intents TO app_owner;
  END IF;
END
$specialist_signup_slug_owner$;

REVOKE ALL ON FUNCTION app.is_organization_slug_available(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reserve_specialist_signup_slug(uuid, text) FROM PUBLIC;

DO $specialist_signup_slug_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.is_organization_slug_available(text) TO app_patient;
  END IF;
END
$specialist_signup_slug_runtime_grants$;

COMMENT ON FUNCTION app.is_organization_slug_available(text) IS
  'Pre-signup boolean-only slug availability accessor; never reveals claim ownership or kind.';
COMMENT ON FUNCTION app.reserve_specialist_signup_slug(uuid, text) IS
  'Identity-self signup reservation: owns only a disposable reservation row and cannot mutate current or alias claims.';
