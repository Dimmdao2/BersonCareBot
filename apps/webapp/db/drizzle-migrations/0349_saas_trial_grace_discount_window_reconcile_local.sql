-- Final migration number 0349.
-- RECONCILES-MIGRATION-HASH: 0346_saas_trial_grace_discount_window_local
--
-- #1057 B0.3: applying this branch's migrations to DEV (`bash deploy/host/migrate-dev.sh
-- --execute`) surfaced the same migration-number COLLISION class `AGENTS.md` §1 warns about
-- ("миграция под уже применённым номером не доедет никогда") and that `0345` already fixed once
-- for `0343` on this same branch. `0346` was originally written and applied to this shared
-- `bcb_webapp_dev` under its own TEMPORARY local number `0344` (commit `ac185efb1`, branch
-- `wt/trial-grace-model`). A DIFFERENT parallel worktree independently reserved and applied its own,
-- unrelated migration under that same journal `when` slot (`1793539230050`) before the renumber to
-- final `0346` landed here — `drizzle.__drizzle_migrations` has exactly one row at
-- `created_at=1793539230050`, and its hash (`bf945d4597cb5de8f3f9aaa25f1f819216a2c9580652ccbb4c93314050a845e5`)
-- matches neither the original temp-`0344`-named file nor the current `0346` file. Confirmed live:
-- none of `saas_tariffs.discounted_price_minor`, `saas_trial_policy.discount_window_days`, or
-- `saas_organization_trials.discount_ends_at` exist on `bcb_webapp_dev` even after `pnpm migrate`
-- completed with exit 0 -- the installed migrator advances a single `created_at` watermark, not
-- per-hash (see `run-webapp-drizzle-migrate.mjs`'s own completeness check, added for exactly this
-- class), so once another migration occupies that watermark slot `0346`'s real body can never run
-- through the ordinary migrator again. Same repair idiom as `0330`/`0331`/`0345`: an append-only
-- forward migration that reapplies the missed body verbatim (every statement below is
-- `IF NOT EXISTS`/`DROP ... IF EXISTS`/`CREATE OR REPLACE`, so re-running it is a no-op wherever a
-- fragment already landed) and declares the reconciliation so
-- `apps/webapp/scripts/check-drizzle-journal-sync.sh` and the completeness check in
-- `run-webapp-drizzle-migrate.mjs` both treat `0346` as satisfied. `0346`'s own file is untouched.

-- 1. saas_tariffs — Т8: exact discounted price, explicit per tariff, no global fallback.
ALTER TABLE "saas_tariffs"
  ADD COLUMN IF NOT EXISTS "discounted_price_minor" integer;
--> statement-breakpoint
ALTER TABLE "saas_tariffs"
  DROP CONSTRAINT IF EXISTS "saas_tariffs_discounted_price_nonnegative_check";
--> statement-breakpoint
ALTER TABLE "saas_tariffs"
  ADD CONSTRAINT "saas_tariffs_discounted_price_nonnegative_check"
  CHECK ("discounted_price_minor" IS NULL OR "discounted_price_minor" >= 0);
--> statement-breakpoint

-- 2. saas_trial_policy — Т3/Т5: no own tariff_id any more; Т6: grace_days becomes the discount
--    window's duration setting (new column, new meaning).
ALTER TABLE "saas_trial_policy"
  DROP COLUMN IF EXISTS "tariff_id";
--> statement-breakpoint
ALTER TABLE "saas_trial_policy"
  DROP COLUMN IF EXISTS "grace_days";
--> statement-breakpoint
ALTER TABLE "saas_trial_policy"
  ADD COLUMN IF NOT EXISTS "discount_window_days" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_trial_policy"
  DROP CONSTRAINT IF EXISTS "saas_trial_policy_discount_window_check";
--> statement-breakpoint
ALTER TABLE "saas_trial_policy"
  ADD CONSTRAINT "saas_trial_policy_discount_window_check"
  CHECK ("discount_window_days" >= 0);
--> statement-breakpoint

-- 3. saas_organization_trials — Т2: discount_ends_at replaces grace_ends_at outright (new meaning,
--    never gates access); the admin "продлить триал" capability (extension_count) is removed.
ALTER TABLE "saas_organization_trials"
  ADD COLUMN IF NOT EXISTS "discount_ends_at" timestamptz;
--> statement-breakpoint
UPDATE "saas_organization_trials"
  SET "discount_ends_at" = "ends_at"
  WHERE "discount_ends_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "saas_organization_trials"
  ALTER COLUMN "discount_ends_at" SET NOT NULL;
--> statement-breakpoint

-- 0346's own file did not account for this: `0225_saas_tariff_quotas_trial.sql` left an RLS policy
-- on `saas_tariffs` whose USING clause reads `trial.grace_ends_at` directly, which blocks
-- `DROP COLUMN grace_ends_at` below with `2BP01 dependent_objects_still_exist` (confirmed live
-- against `bcb_webapp_dev`, not assumed). Same fix already applied by 0346's own
-- `app.read_current_patient_organization_entitlements()` rewrite (4a below): the removed
-- trial-extension `grace` stage means the post-trial rule now applies at `trial.ends_at`, so the
-- policy's boundary moves from `grace_ends_at` to `ends_at` — the same CASE shape, one column
-- renamed, no other behavior change.
DROP POLICY IF EXISTS saas_tariffs_current_patient_capability_read ON public.saas_tariffs;
--> statement-breakpoint
CREATE POLICY saas_tariffs_current_patient_capability_read ON public.saas_tariffs
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.be_organizations AS organization
      INNER JOIN public.org_enrollments AS enrollment
        ON enrollment.organization_id = organization.id
       AND enrollment.platform_user_id = app.current_patient_user_id()
       AND enrollment.status = 'active'
      LEFT JOIN public.saas_organization_trials AS trial
        ON trial.organization_id = organization.id
       AND trial.status = 'active'
      WHERE organization.id = app.current_org_id()
        AND organization.is_active = true
        AND saas_tariffs.id = CASE
          WHEN trial.id IS NULL THEN organization.tariff_id
          WHEN statement_timestamp() <= trial.ends_at THEN trial.tariff_id
          WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
          ELSE trial.tariff_id
        END
    )
  );
--> statement-breakpoint

ALTER TABLE "saas_organization_trials"
  DROP COLUMN IF EXISTS "grace_ends_at";
--> statement-breakpoint
ALTER TABLE "saas_organization_trials"
  DROP COLUMN IF EXISTS "extension_count";
--> statement-breakpoint
ALTER TABLE "saas_organization_trials"
  DROP CONSTRAINT IF EXISTS "saas_organization_trials_dates_check";
--> statement-breakpoint
ALTER TABLE "saas_organization_trials"
  ADD CONSTRAINT "saas_organization_trials_dates_check"
  CHECK ("started_at" < "ends_at" AND "ends_at" <= "discount_ends_at");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_saas_organization_trials_lifecycle";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saas_organization_trials_lifecycle"
  ON "saas_organization_trials" USING btree ("status", "ends_at");
--> statement-breakpoint

-- 4. Access computation — remove the trial-extension branch so the post-trial rule applies
--    immediately at `ends_at` in all three doors. `degradation_started_at` was already anchored at
--    `trial.ends_at` (never `grace_ends_at`), so only the `tariff_id` / `lifecycle` / `access_source`
--    CASE branches change; the general (unrelated) tariff-policy access ladder — `graceDays`/
--    `readOnlyDays` on `system_access_policy` / `mechanic_access_policies`, measured from
--    `degradation_started_at` — is untouched.

-- 4a. Patient projection (current body owned by 0326, itself matching 0305's hash).
CREATE OR REPLACE FUNCTION app.read_current_patient_organization_entitlements()
RETURNS TABLE (
  tariff_mechanics jsonb,
  tariff_quotas jsonb,
  tariff_system_access_policy jsonb,
  tariff_mechanic_access_policies jsonb,
  included_seats integer,
  override_mechanic text,
  override_enabled boolean,
  override_quota jsonb,
  override_expires_at timestamptz,
  seat_limit_override integer,
  lifecycle text,
  effective_tariff_id uuid,
  access_source text,
  degradation_started_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH exact_context AS (
    SELECT organization.id, organization.tariff_id
    FROM public.org_enrollments AS enrollment
    INNER JOIN public.be_organizations AS organization
      ON organization.id = enrollment.organization_id
     AND organization.is_active = true
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ), active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    INNER JOIN exact_context ON exact_context.id = trial.organization_id
    WHERE trial.status = 'active'
    LIMIT 1
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    INNER JOIN exact_context ON exact_context.id = subscription.organization_id
    WHERE subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), effective AS (
    SELECT
      context.id AS organization_id,
      CASE
        WHEN trial.id IS NULL THEN context.tariff_id
        WHEN v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        ELSE trial.tariff_id
      END AS tariff_id,
      -- #1069 Т5-Т8: the trial-extension `grace` lifecycle stage is removed — the post-trial rule
      -- applies the instant `ends_at` passes, not after a further access-extending window.
      CASE
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at
    FROM exact_context AS context
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
  )
  SELECT
    tariff.mechanics,
    tariff.quotas,
    tariff.system_access_policy,
    tariff.mechanic_access_policies,
    tariff.included_seats,
    entitlement_override.mechanic,
    entitlement_override.enabled,
    entitlement_override.quota,
    entitlement_override.expires_at,
    entitlement_override.seat_limit_override,
    effective.lifecycle,
    effective.tariff_id,
    effective.access_source,
    effective.degradation_started_at
  FROM effective
  LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = effective.organization_id
   AND (entitlement_override.expires_at IS NULL OR entitlement_override.expires_at > v_now)
  ORDER BY entitlement_override.mechanic;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.read_current_patient_organization_entitlements() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_current_patient_organization_entitlements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.read_current_patient_organization_entitlements() TO app_patient;
--> statement-breakpoint

-- 4b. Mechanic door (current body owned by 0320).
CREATE OR REPLACE FUNCTION app.resolve_organization_mechanic_access(
  p_organization_id uuid,
  p_mechanic text
)
RETURNS TABLE (
  mechanic text,
  state text,
  policy_source text,
  warning jsonb,
  mutation_allowed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_current_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_mechanic_access_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_mechanic_access_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF p_mechanic IS NULL OR btrim(p_mechanic) = '' THEN
    RAISE EXCEPTION 'organization_mechanic_access_mechanic_required'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = p_organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    WHERE subscription.organization_id = p_organization_id
      AND subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), effective AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN trial.id IS NULL THEN organization.tariff_id
        WHEN v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        ELSE trial.tariff_id
      END AS tariff_id,
      -- #1069 Т5-Т8: no more trial-extension `grace` stage — post-trial rule applies at `ends_at`.
      CASE
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,
      -- Which clock the ladder is running on. The door cannot tell non-payment from an expired
      -- trial without this, and «условие: ошибка оплаты» has to follow the real one.
      CASE
        WHEN trial.ends_at IS NOT NULL THEN 'trial'
        WHEN paid_period.period_ends_at IS NOT NULL THEN 'paid_period'
        ELSE NULL
      END AS period_source
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
    WHERE organization.id = p_organization_id
      AND organization.is_active = true
  ), snapshot AS (
    SELECT
      effective.*,
      tariff.id AS resolved_tariff_id,
      tariff.mechanics,
      tariff.quotas,
      tariff.system_access_policy,
      tariff.mechanic_access_policies,
      tariff.included_seats,
      entitlement_override.mechanic AS override_mechanic,
      entitlement_override.enabled AS override_enabled,
      COALESCE(
        tariff.mechanic_access_policies -> p_mechanic,
        tariff.system_access_policy
      ) AS policy,
      CASE
        WHEN tariff.mechanic_access_policies ? p_mechanic THEN 'mechanic'
        WHEN tariff.system_access_policy IS NOT NULL THEN 'system'
        ELSE 'unconfigured'
      END AS configured_policy_source
    FROM effective
    LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
    LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
      ON entitlement_override.organization_id = effective.organization_id
     AND entitlement_override.mechanic = p_mechanic
     AND (
       entitlement_override.expires_at IS NULL
       OR entitlement_override.expires_at > v_now
     )
  ), policy_history AS (
    -- §5a 2.9/2.10: tariff edits are live once a paid period has ended, but an edit must not
    -- retroactively erase a stage already earned by the organization. The tariff audit already
    -- keeps the exact before/after row and edit time, so it is the data boundary without a second
    -- per-organization snapshot. Only changes after this organization's degradation anchor matter.
    SELECT
      audit.created_at,
      CASE
        WHEN (audit.details -> 'before' -> 'mechanicAccessPolicies') ? p_mechanic
          THEN audit.details -> 'before' -> 'mechanicAccessPolicies' -> p_mechanic
        ELSE audit.details -> 'before' -> 'systemAccessPolicy'
      END AS previous_policy
    FROM public.admin_audit_log AS audit
    WHERE audit.action = 'saas_tariff_update'
      AND audit.target_id = (SELECT resolved_tariff_id::text FROM snapshot)
      AND audit.created_at > (SELECT degradation_started_at FROM snapshot)
  ), policy_timing AS (
    SELECT
      snapshot.*,
      CASE
        WHEN degradation_started_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer),
          COALESCE(
            (
              SELECT max(
                degradation_started_at
                  + make_interval(days => (previous_policy ->> 'graceDays')::integer)
              )
              FROM policy_history
            ),
            '-infinity'::timestamptz
          )
        )
      END AS grace_ends_at
    FROM snapshot
  ), policy_schedule AS (
    SELECT
      policy_timing.*,
      CASE
        WHEN policy_timing.grace_ends_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          policy_timing.grace_ends_at
            + make_interval(days => (policy ->> 'readOnlyDays')::integer),
          COALESCE(
            (
              SELECT max(
                policy_timing.grace_ends_at
                  + make_interval(days => (previous_policy ->> 'readOnlyDays')::integer)
              )
              FROM policy_history
              WHERE policy_history.created_at >= policy_timing.grace_ends_at
            ),
            '-infinity'::timestamptz
          )
        )
      END AS read_only_ends_at
    FROM policy_timing
  ), included AS (
    SELECT
      policy_schedule.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN true
        WHEN override_mechanic IS NOT NULL THEN override_enabled
        -- #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала → доступа нет» — no
        -- compatibility carve-out survives for an organization with no resolved tariff at all.
        WHEN resolved_tariff_id IS NULL THEN false
        WHEN p_mechanic = 'clinic_team' THEN included_seats IS NOT NULL
        WHEN p_mechanic = ANY (ARRAY['files', 'patient_count', 'branches'])
          THEN quotas ? p_mechanic
        ELSE COALESCE((mechanics ->> p_mechanic)::boolean, false)
      END AS mechanic_included
    FROM policy_schedule
  ), resolved AS (
    SELECT
      included.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'full_access'
        WHEN resolved_tariff_id IS NULL THEN 'unconfigured'
        WHEN NOT mechanic_included THEN 'disabled'
        -- Period exists and has not run out. This is the ONLY «полный доступ навсегда» left: it
        -- lasts exactly as long as the paid period (or the trial) does. Checked before the policy
        -- so a tariff whose ladder is not configured yet still grants access inside a live period.
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- No period at all: an assigned tariff with nothing yet to measure from (§2.12/7.0 keeps
        -- this open, on purpose — not the removed `compatibility` state, which needed no tariff at
        -- all; `resolved_tariff_id IS NULL` above already excludes that case here).
        WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < included.grace_ends_at
          THEN 'grace'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < included.read_only_ends_at
          THEN 'read_only'
        WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'
        WHEN lifecycle = 'read_only' THEN 'read_only'
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
        ELSE 'unconfigured'
      END AS resolved_state
    FROM included
  )
  SELECT
    p_mechanic,
    resolved_state,
    CASE
      WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'critical'
      WHEN NOT mechanic_included THEN 'unconfigured'
      -- Mirrors the no-anchor full-access branch above: an assigned tariff with no period at all is
      -- held open by the system, not by a configured mechanic policy.
      WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'system'
      ELSE configured_policy_source
    END,
    CASE
      WHEN resolved_state = 'grace' THEN jsonb_build_object(
        'until', resolved.grace_ends_at,
        'periodEndsAt', degradation_started_at,
        'periodSource', period_source,
        'notifications', COALESCE(policy -> 'notifications', '[]'::jsonb),
        'nextState', CASE
          WHEN (policy ->> 'readOnlyDays')::integer > 0 THEN 'read_only'
          ELSE policy ->> 'terminalState'
        END
      )
      ELSE NULL
    END,
    resolved_state = ANY (ARRAY['full_access', 'grace'])
  FROM resolved;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.resolve_organization_mechanic_access(uuid, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_organization_mechanic_access(uuid, text)
  FROM PUBLIC, app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.resolve_organization_mechanic_access(uuid, text)
  TO app_staff, app_patient;
--> statement-breakpoint

-- 4c. Cabinet door (current body owned by 0320).
CREATE OR REPLACE FUNCTION app.resolve_organization_cabinet_access(
  p_organization_id uuid
)
RETURNS TABLE (
  state text,
  policy_source text,
  warning jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_current_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_cabinet_access_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_cabinet_access_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = p_organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    WHERE subscription.organization_id = p_organization_id
      AND subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), effective AS (
    SELECT
      CASE
        WHEN trial.id IS NULL THEN organization.tariff_id
        WHEN v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        ELSE trial.tariff_id
      END AS tariff_id,
      -- #1069 Т5-Т8: no more trial-extension `grace` stage — post-trial rule applies at `ends_at`.
      CASE
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,
      CASE
        WHEN trial.ends_at IS NOT NULL THEN 'trial'
        WHEN paid_period.period_ends_at IS NOT NULL THEN 'paid_period'
        ELSE NULL
      END AS period_source
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
    WHERE organization.id = p_organization_id
      AND organization.is_active = true
  ), snapshot AS (
    SELECT
      effective.*,
      tariff.id AS resolved_tariff_id,
      tariff.system_access_policy AS policy
    FROM effective
    LEFT JOIN LATERAL app.saas_billing_effective_tariff(p_organization_id, effective.tariff_id) AS tariff ON true
  ), policy_history AS (
    -- §5a 2.9/2.10: the immutable tariff audit supplies the prior system-policy deadline, so a
    -- live shortening cannot eject a clinic from an already-running stage retroactively.
    SELECT
      audit.created_at,
      audit.details -> 'before' -> 'systemAccessPolicy' AS previous_policy
    FROM public.admin_audit_log AS audit
    WHERE audit.action = 'saas_tariff_update'
      AND audit.target_id = (SELECT resolved_tariff_id::text FROM snapshot)
      AND audit.created_at > (SELECT degradation_started_at FROM snapshot)
  ), policy_timing AS (
    SELECT
      snapshot.*,
      CASE
        WHEN degradation_started_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer),
          COALESCE(
            (
              SELECT max(
                degradation_started_at
                  + make_interval(days => (previous_policy ->> 'graceDays')::integer)
              )
              FROM policy_history
            ),
            '-infinity'::timestamptz
          )
        )
      END AS grace_ends_at
    FROM snapshot
  ), policy_schedule AS (
    SELECT
      policy_timing.*,
      CASE
        WHEN policy_timing.grace_ends_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          policy_timing.grace_ends_at
            + make_interval(days => (policy ->> 'readOnlyDays')::integer),
          COALESCE(
            (
              SELECT max(
                policy_timing.grace_ends_at
                  + make_interval(days => (previous_policy ->> 'readOnlyDays')::integer)
              )
              FROM policy_history
              WHERE policy_history.created_at >= policy_timing.grace_ends_at
            ),
            '-infinity'::timestamptz
          )
        )
      END AS read_only_ends_at
    FROM policy_timing
  ), resolved AS (
    SELECT
      policy_schedule.*,
      CASE
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- #1069 §2.13: without a resolved tariff there is nothing to hold access open with —
        -- `resolved_tariff_id IS NOT NULL` is what used to be carried by the `compatibility` state.
        WHEN degradation_started_at IS NULL
          AND resolved_tariff_id IS NOT NULL AND lifecycle = 'active' THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < policy_schedule.grace_ends_at
          THEN 'grace'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < policy_schedule.read_only_ends_at
          THEN 'read_only'
        WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'
        WHEN lifecycle = 'read_only' THEN 'read_only'
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
        ELSE 'unconfigured'
      END AS resolved_state
    FROM policy_schedule
  )
  SELECT
    resolved_state,
    CASE WHEN policy IS NULL THEN 'unconfigured' ELSE 'system' END,
    CASE
      WHEN resolved_state = 'grace' THEN jsonb_build_object(
        'until', resolved.grace_ends_at,
        'periodEndsAt', degradation_started_at,
        'periodSource', period_source,
        'notifications', COALESCE(policy -> 'notifications', '[]'::jsonb),
        'nextState', CASE
          WHEN (policy ->> 'readOnlyDays')::integer > 0 THEN 'read_only'
          ELSE policy ->> 'terminalState'
        END
      )
      ELSE NULL
    END
  FROM resolved;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.resolve_organization_cabinet_access(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_organization_cabinet_access(uuid)
  FROM PUBLIC, app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.resolve_organization_cabinet_access(uuid)
  TO app_staff, app_patient;
