-- TEMPORARY LOCAL MIGRATION NUMBER 0296 -- the lead assigns the final number at merge.
-- #1069 §2.12 round 2 — a slip-through audit (independent, not by reading, by running against a
-- real dev clinic with a live paid period) found the freeze did not reach every number a clinic
-- pays for. 0295 repointed the three access doors and the TS staff-snapshot read at
-- `app.saas_billing_effective_tariff`, but two more places still joined `public.saas_tariffs`
-- directly for a quota LIMIT: the `courses` and `content_pages` snapshot-quota triggers below.
-- Proven on a clinic with an active paid period: shrinking the live tariff's `courses`/`cms_pages`
-- quota was visible to these two triggers immediately, while every other mechanic/quota stayed on
-- the frozen snapshot for the rest of the period — the same bug 0295 fixed for the doors, just not
-- yet fixed here. Only the tariff-quota lookup changes; the advisory lock, the recount and every
-- other line of each trigger are untouched.
CREATE OR REPLACE FUNCTION app.enforce_courses_snapshot_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_quota jsonb;
  v_limit bigint;
  v_count bigint;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'course_organization_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas_quota:courses:' || NEW.organization_id::text, 0)
  );

  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = NEW.organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), effective_tariff AS (
    SELECT CASE
      WHEN trial.id IS NULL THEN organization.tariff_id
      WHEN v_now <= trial.grace_ends_at THEN trial.tariff_id
      WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
      ELSE trial.tariff_id
    END AS id
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    WHERE organization.id = NEW.organization_id
      AND organization.is_active = true
  )
  SELECT COALESCE(entitlement_override.quota, tariff.quotas -> 'courses')
  INTO v_quota
  FROM effective_tariff
  LEFT JOIN LATERAL app.saas_billing_effective_tariff(NEW.organization_id, effective_tariff.id) AS tariff ON true
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = NEW.organization_id
   AND entitlement_override.mechanic = 'courses'
   AND (entitlement_override.expires_at IS NULL OR entitlement_override.expires_at > v_now);

  IF v_quota IS NULL THEN
    RETURN NEW;
  END IF;
  IF (v_quota ->> 'unit') IS DISTINCT FROM 'items'
     OR (v_quota ->> 'period') IS DISTINCT FROM 'snapshot'
     OR (v_quota ->> 'usagePolicy') IS DISTINCT FROM 'snapshot'
     OR COALESCE(v_quota ->> 'kind', '') NOT IN ('numeric', 'unlimited') THEN
    RAISE EXCEPTION 'tariff_quota_enforcement_shape_invalid';
  END IF;
  IF v_quota ->> 'kind' = 'unlimited' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(v_quota ->> 'limit', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'tariff_quota_limit_invalid';
  END IF;

  v_limit := (v_quota ->> 'limit')::bigint;
  SELECT count(*) INTO v_count
  FROM public.courses
  WHERE organization_id = NEW.organization_id;

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'saas_quota_reached:courses:%/%', v_count - 1, v_limit;
  END IF;
  IF v_limit > 0 AND v_count * 5 >= v_limit * 4 THEN
    RAISE WARNING 'saas_quota_warning:courses:%/%', v_count, v_limit;
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.enforce_courses_snapshot_quota() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.enforce_courses_snapshot_quota() FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.enforce_cms_pages_snapshot_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_quota jsonb;
  v_limit bigint;
  v_count bigint;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'cms_page_organization_required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas_quota:cms_pages:' || NEW.organization_id::text, 0)
  );

  -- INSERT ... ON CONFLICT DO UPDATE fires BEFORE INSERT before PostgreSQL resolves the conflict.
  -- An existing same-tenant page is an update, not a newly consumed slot.
  IF EXISTS (
    SELECT 1
    FROM public.content_pages AS existing_page
    WHERE existing_page.organization_id = NEW.organization_id
      AND existing_page.section = NEW.section
      AND existing_page.slug = NEW.slug
  ) THEN
    RETURN NEW;
  END IF;

  -- This no-op UPDATE is a per-organization MVCC serialization token. READ COMMITTED contenders
  -- refresh their snapshot after the advisory wait; a REPEATABLE READ/SERIALIZABLE transaction
  -- whose snapshot predates another page INSERT receives PostgreSQL's normal 40001 serialization
  -- failure here. Stronger isolation remains usable without recounting from a stale snapshot.
  UPDATE public.be_organizations
  SET updated_at = updated_at
  WHERE id = NEW.organization_id;

  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = NEW.organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), effective_tariff AS (
    SELECT CASE
      WHEN trial.id IS NULL THEN organization.tariff_id
      WHEN v_now <= trial.grace_ends_at THEN trial.tariff_id
      WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
      ELSE trial.tariff_id
    END AS id
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    WHERE organization.id = NEW.organization_id
      AND organization.is_active = true
  )
  SELECT COALESCE(entitlement_override.quota, tariff.quotas -> 'cms_pages')
  INTO v_quota
  FROM effective_tariff
  LEFT JOIN LATERAL app.saas_billing_effective_tariff(NEW.organization_id, effective_tariff.id) AS tariff ON true
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = NEW.organization_id
   AND entitlement_override.mechanic = 'cms_pages'
   AND (entitlement_override.expires_at IS NULL OR entitlement_override.expires_at > v_now);

  IF v_quota IS NULL THEN
    RETURN NEW;
  END IF;
  IF (v_quota ->> 'unit') IS DISTINCT FROM 'items'
     OR (v_quota ->> 'period') IS DISTINCT FROM 'snapshot'
     OR (v_quota ->> 'usagePolicy') IS DISTINCT FROM 'snapshot'
     OR COALESCE(v_quota ->> 'kind', '') NOT IN ('numeric', 'unlimited') THEN
    RAISE EXCEPTION 'tariff_quota_enforcement_shape_invalid';
  END IF;
  IF v_quota ->> 'kind' = 'unlimited' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(v_quota ->> 'limit', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'tariff_quota_limit_invalid';
  END IF;

  v_limit := (v_quota ->> 'limit')::bigint;
  -- This is deliberately before the business INSERT: the org+mechanic transaction lock serializes
  -- contenders, and this recount is the authority rather than a mutable counter.
  SELECT app.cms_pages_snapshot_usage(NEW.organization_id) INTO v_count;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'saas_quota_reached:cms_pages:%/%', v_count, v_limit;
  END IF;
  IF v_limit > 0 AND (v_count + 1) * 5 >= v_limit * 4 THEN
    RAISE WARNING 'saas_quota_warning:cms_pages:%/%', v_count + 1, v_limit;
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.enforce_cms_pages_snapshot_quota() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.enforce_cms_pages_snapshot_quota() FROM PUBLIC;
