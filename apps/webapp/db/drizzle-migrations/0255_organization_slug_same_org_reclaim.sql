-- 0255: allow an organization to reclaim one of its own durable slug aliases.
--
-- The global UNIQUE (slug) index from 0218 remains intact: a slug still has exactly one claim row,
-- so no other organization can reserve, claim, or alias it. Reclaim only swaps the kinds of two
-- existing rows whose organization_id is unchanged, in one audited rename transaction.

CREATE OR REPLACE FUNCTION app.guard_organization_slug_claim_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION app.assert_organization_slug_rename_complete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
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
$function$;

DROP TRIGGER organization_slug_claims_rename_complete_guard
  ON public.organization_slug_claims;
CREATE CONSTRAINT TRIGGER organization_slug_claims_rename_complete_guard
  AFTER UPDATE ON public.organization_slug_claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (
    OLD.kind = 'current'
    AND (
      (NEW.kind = 'current' AND OLD.slug IS DISTINCT FROM NEW.slug)
      OR (
        NEW.kind = 'alias'
        AND OLD.slug IS NOT DISTINCT FROM NEW.slug
        AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
      )
    )
  )
  EXECUTE FUNCTION app.assert_organization_slug_rename_complete();
