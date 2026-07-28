-- #1069 / owner punchlist §10.2: atomic snapshot quota for CMS pages.
--
-- `content_pages` already has idx_content_pages_organization_id, which covers the authoritative
-- tenant count below.
--
-- The quota counts physical rows, including archived/soft-deleted pages. Those rows still exist
-- and can be restored without an INSERT, so excluding them here would create an UPDATE bypass.
CREATE OR REPLACE FUNCTION app.cms_pages_snapshot_usage(
  p_organization_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT count(*)
  FROM public.content_pages
  WHERE organization_id = p_organization_id
$function$;
--> statement-breakpoint
ALTER FUNCTION app.cms_pages_snapshot_usage(uuid) OWNER TO app_owner;
GRANT SELECT ON TABLE public.content_pages TO app_owner;
GRANT UPDATE (updated_at) ON TABLE public.be_organizations TO app_owner;
REVOKE ALL ON FUNCTION app.cms_pages_snapshot_usage(uuid)
  FROM PUBLIC, app_staff, app_patient, app_platform_settings;
GRANT EXECUTE ON FUNCTION app.cms_pages_snapshot_usage(uuid)
  TO app_platform_settings;
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
  LEFT JOIN public.saas_tariffs AS tariff ON tariff.id = effective_tariff.id
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS content_pages_snapshot_quota_guard ON public.content_pages;
CREATE TRIGGER content_pages_snapshot_quota_guard
  BEFORE INSERT ON public.content_pages
  FOR EACH ROW EXECUTE FUNCTION app.enforce_cms_pages_snapshot_quota();
