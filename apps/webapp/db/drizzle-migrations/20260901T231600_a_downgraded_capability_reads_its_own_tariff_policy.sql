-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.resolve_organization_mechanic_access(uuid,text)')) LIKE '%downgrade_policies ->> p_mechanic = ''read_only''%'
--
-- §5a 4b.3/4b.4 (owner 30.07, re-opened by code sweep 20.08): a capability mechanic's downgrade
-- policy offers three values — `block` (already refused earlier, at transition time) ·
-- `disable_immediately` · `read_only` — but this door only ever emitted `disabled` for an excluded
-- mechanic, so the two capability values that DID reach here (`disable_immediately`, `read_only`)
-- produced the identical final state. `downgradePolicies` is already stored per tariff
-- (`0281_…downgrade_policy…`, `saas_tariffs.downgrade_policies`) and already reaches this function
-- through the existing `saas_billing_effective_tariff` LATERAL join — it only needed to be
-- SELECTed and READ. No new column, no second evaluator: `checkEntitlement` in
-- `requireEntitlement.ts` already branches on `state === 'read_only'` vs `'disabled'` correctly for
-- every mechanic; this door was the one link not producing the distinction.
--
-- Audit FAIL 7dbb1a38a (02.09, K13): the previous version of this migration was a top-level
-- `CREATE OR REPLACE` whose body was copied from `20260819T210005_a_clinic_is_billed_for_seats_not_
-- for_people.sql`. Two later applied migrations rewrote the SAME function since then —
-- `20260820T175432_paid_period_global_access_authority.sql` (global paid-period policy/history:
-- `global_paid_policy_history`, `effective_global_paid_policy`, `was_tightened`, the
-- `global_paid_period` outcome branches) and `20260823T030000_integrator_tenant_role_reaches_
-- delivery_roots.sql` (the `app_integrator_tenant_service` accepted-context gate and the
-- `v_current_organization_id`/`v_now` initialization moved after the gate) — and `CREATE OR
-- REPLACE` with a fixed body silently reverted both. This migration instead anchor-rewrites
-- whatever definition is ACTUALLY live when it runs (`pg_get_functiondef`), the same pattern
-- `20260820` and `20260823` use, and fails loud if its anchors are missing or ambiguous instead of
-- assuming any particular prior body.
--
-- Numeric mechanics (`freeze_growth`/`block`) never reach the touched branch at all — `included`
-- already treats `files`/`branches` as always-included, so their own write door
-- (`transactionQuotaPort`) is what freezes growth, exactly as before this migration.
DO $migration$
DECLARE
  v_identity regprocedure := 'app.resolve_organization_mechanic_access(uuid,text)'::regprocedure;
  v_definition text;
  v_rewritten text;
  v_snapshot_anchor text := E'      tariff.included_seats,\n';
  v_snapshot_replacement text := E'      tariff.included_seats,\n'
    || E'      -- §5a 4b.3/4b.4 — the value the owner stored for THIS mechanic on THIS tariff; read\n'
    || E'      -- once here so the `resolved` CTE below can select behaviour by data instead of\n'
    || E'      -- adding a branch.\n'
    || E'      tariff.downgrade_policies,\n';
  v_outcome_anchor text := E'        WHEN NOT mechanic_included THEN ''disabled''\n';
  v_outcome_replacement text := E'        -- §5a 4b.3/4b.4: this tariff excludes the mechanic — which final state depends\n'
    || E'        -- on the VALUE this tariff stored for it, not on a mechanic name.\n'
    || E'        -- `disable_immediately` and an unset policy both fail closed to `disabled`\n'
    || E'        -- (unchanged default); `read_only` is the one stored value that keeps read access\n'
    || E'        -- instead.\n'
    || E'        WHEN NOT mechanic_included THEN\n'
    || E'          CASE\n'
    || E'            WHEN downgrade_policies ->> p_mechanic = ''read_only'' THEN ''read_only''\n'
    || E'            ELSE ''disabled''\n'
    || E'          END\n';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;

  IF v_definition IS NULL
    OR (length(v_definition) - length(replace(v_definition, v_snapshot_anchor, ''))) / length(v_snapshot_anchor) <> 1
  THEN
    RAISE EXCEPTION 'downgrade_policies snapshot anchor not found or ambiguous for %', v_identity;
  END IF;
  v_rewritten := replace(v_definition, v_snapshot_anchor, v_snapshot_replacement);

  IF (length(v_rewritten) - length(replace(v_rewritten, v_outcome_anchor, ''))) / length(v_outcome_anchor) <> 1
  THEN
    RAISE EXCEPTION 'downgrade_policies outcome anchor not found or ambiguous for %', v_identity;
  END IF;
  v_rewritten := replace(v_rewritten, v_outcome_anchor, v_outcome_replacement);

  IF position('downgrade_policies ->> p_mechanic = ''read_only''' IN v_rewritten) = 0 THEN
    RAISE EXCEPTION 'downgrade_policies read_only branch not written for %', v_identity;
  END IF;

  EXECUTE v_rewritten;
END
$migration$;
