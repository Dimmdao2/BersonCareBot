-- TEMPORARY LOCAL MIGRATION NUMBER 0378 -- final number assigned at merge.
-- #1069 T2: registration notification anchor = first entry into the doctor cabinet.

ALTER TABLE public.be_organizations
  ADD COLUMN IF NOT EXISTS cabinet_first_entered_at timestamptz;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.prepare_organization_lifecycle_notification_context(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_registered_at timestamptz;
  v_trial record;
BEGIN
  IF v_current_organization_id IS NULL OR v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_context_mismatch';
  END IF;

  UPDATE public.be_organizations
  SET cabinet_first_entered_at = COALESCE(cabinet_first_entered_at, now()),
      updated_at = now()
  WHERE id = p_organization_id
  RETURNING cabinet_first_entered_at INTO v_registered_at;

  SELECT trial.started_at, trial.ends_at, trial.discount_ends_at
  INTO v_trial
  FROM public.saas_organization_trials AS trial
  WHERE trial.organization_id = p_organization_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'registeredAt', v_registered_at,
    'trialStartedAt', v_trial.started_at,
    'trialEndsAt', v_trial.ends_at,
    'discountEndsAt', v_trial.discount_ends_at
  );
END;
$function$;
--> statement-breakpoint

ALTER FUNCTION app.prepare_organization_lifecycle_notification_context(uuid) OWNER TO app_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.prepare_organization_lifecycle_notification_context(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.prepare_organization_lifecycle_notification_context(uuid) TO app_staff;
