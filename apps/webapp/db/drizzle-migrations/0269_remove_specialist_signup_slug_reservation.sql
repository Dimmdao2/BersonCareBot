-- 0270: remove pre-provisioning specialist signup slug reservations.
--
-- The selected slug remains on specialist_signup_intents until provisioning. The global
-- uq_organization_slug_claims_slug index atomically decides the winner when provisioning inserts
-- the durable current claim. Organization-owned reservation rows used by the clinic rename flow
-- remain valid, but no claim may be owned by a signup intent.

DROP FUNCTION IF EXISTS app.reserve_specialist_signup_slug(uuid, text);

DROP INDEX IF EXISTS public.uq_organization_slug_claims_reservation_signup_intent;
DROP INDEX IF EXISTS public.uq_organization_slug_claims_reservation_org;

ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT IF EXISTS organization_slug_claims_owner_shape_check,
  DROP CONSTRAINT IF EXISTS organization_slug_claims_signup_intent_id_fkey;

-- These are abandoned pre-provisioning holds. Durable current/alias claims and the
-- organization-owned rename reservations all have organization_id and are preserved.
DELETE FROM public.organization_slug_claims
WHERE kind = 'reservation'
  AND organization_id IS NULL;

ALTER TABLE public.organization_slug_claims
  DROP COLUMN signup_intent_id,
  ALTER COLUMN organization_id SET NOT NULL;

DO $specialist_signup_slug_reservation_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    -- The removed definer was the only app_owner writer that updated claim rows. Provisioning now
    -- needs INSERT for the durable current claim; boolean availability/resolution still need SELECT.
    REVOKE UPDATE ON TABLE public.organization_slug_claims FROM app_owner;
    GRANT SELECT, INSERT ON TABLE public.organization_slug_claims TO app_owner;
  END IF;
END
$specialist_signup_slug_reservation_acl$;
