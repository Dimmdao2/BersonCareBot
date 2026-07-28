-- 0271: make every persisted organization slug case-insensitive in PostgreSQL.
--
-- A UNIQUE INDEX on lower(slug), rather than CITEXT, keeps the existing text API and the
-- uq_* error identifiers consumed by provisioning while making the comparison rule explicit.
-- 0270 is already occupied; this number must be reconciled if a parallel merge takes it first.

DO $preflight$
DECLARE
  v_claim_collisions text;
  v_directory_collisions text;
BEGIN
  -- Do not silently pick a winner for durable organization identities. Earlier constraints make
  -- these rows impossible on a healthy database, but a legacy/manual bypass must stop here with
  -- an actionable diagnostic instead of failing opaquely while the expression index is built.
  SELECT string_agg(format('%s (%s)', normalized_slug, spellings), ', ')
  INTO v_claim_collisions
  FROM (
    SELECT lower(slug) AS normalized_slug, string_agg(slug, ', ' ORDER BY slug) AS spellings
    FROM public.organization_slug_claims
    GROUP BY lower(slug)
    HAVING count(*) > 1
  ) AS collisions;

  IF v_claim_collisions IS NOT NULL THEN
    RAISE EXCEPTION
      'U6B.0271 found case-colliding organization slug claims: %. Resolve durable ownership explicitly before retrying.',
      v_claim_collisions;
  END IF;

  SELECT string_agg(format('%s (%s)', normalized_slug, spellings), ', ')
  INTO v_directory_collisions
  FROM (
    SELECT lower(slug) AS normalized_slug, string_agg(slug, ', ' ORDER BY slug) AS spellings
    FROM public.clinic_public_directory_entries
    GROUP BY lower(slug)
    HAVING count(*) > 1
  ) AS collisions;

  IF v_directory_collisions IS NOT NULL THEN
    RAISE EXCEPTION
      'U6B.0271 found case-colliding clinic directory slugs: %. Resolve projection rows explicitly before retrying.',
      v_directory_collisions;
  END IF;
END
$preflight$;

-- Signup intents are no longer reservations after 0270, so their stored candidate is not a
-- namespace owner. Normalize historical candidates before adding the database check.
UPDATE public.specialist_signup_intents
SET organization_slug = lower(organization_slug)
WHERE organization_slug IS NOT NULL
  AND organization_slug IS DISTINCT FROM lower(organization_slug);

ALTER TABLE public.specialist_signup_intents
  ADD CONSTRAINT specialist_signup_intents_organization_slug_lower_check
  CHECK (organization_slug IS NULL OR organization_slug = lower(organization_slug));

-- Rename events are append-only. They are derived from the lower-case canonical claim, so no
-- normalization is necessary; this check makes a future direct writer fail closed as well.
ALTER TABLE public.organization_slug_rename_events
  ADD CONSTRAINT organization_slug_rename_events_slugs_lower_check
  CHECK (previous_slug = lower(previous_slug) AND next_slug = lower(next_slug));

DROP INDEX public.uq_organization_slug_claims_slug;
CREATE UNIQUE INDEX uq_organization_slug_claims_slug
  ON public.organization_slug_claims USING btree (lower(slug));

DROP INDEX public.uq_clinic_public_directory_entries_slug;
CREATE UNIQUE INDEX uq_clinic_public_directory_entries_slug
  ON public.clinic_public_directory_entries USING btree (lower(slug));

-- This accessor remains after the 0270 reservation removal. Normalize its SQL comparison too,
-- so direct function callers share the same case-insensitive database rule as the indexes.
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
    WHERE lower(claim.slug) = lower(p_slug)
  )
$function$;
