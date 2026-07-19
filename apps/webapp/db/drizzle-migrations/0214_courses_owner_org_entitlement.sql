-- C4C — explicit `courses` entitlement for the canonical owner organization. Phase-A flipped
-- `courses` in MECHANIC_DEFAULT_ENABLED to fail-closed (see
-- src/modules/org-entitlements/types.ts), so an organization with no tariff/override now
-- resolves `courses = false`. Without this migration that change would also hide courses from
-- the canonical owner organization established by migration 0086
-- (`a0000000-0000-4000-8000-000000000001`), which contradicts OWNER_REVIEW_2026-07-18.md §13
-- ("на текущем этапе курсы доступны только организации владельца") and
-- IMPLEMENTATION_ROADMAP.md C4C ("немедленный hide/deny вне owner organization"). No other
-- organization is granted `courses` here.
--
-- If a prior explicit override already disabled `courses` for this organization, it is
-- intentionally replaced with `enabled = true`: the owner decision requires courses to stay
-- enabled for the canonical owner organization at this cutover, and override > tariff > default
-- (src/modules/org-entitlements/service.ts#resolveOrgEntitlements) is the only precedence channel
-- that can guarantee that outcome regardless of tariff assignment. `seat_limit_override` (unused
-- by `courses`) is left untouched by the UPDATE branch.
--
-- Additive/idempotent: safe on a fresh DB (migration 0180 creates
-- saas_org_entitlement_overrides before this runs) and safe to re-run on a DB that already has
-- this override applied.
--
-- Rollback, if this migration has not been used by application code yet:
--   DELETE FROM saas_org_entitlement_overrides
--   WHERE organization_id = 'a0000000-0000-4000-8000-000000000001' AND mechanic = 'courses';
-- (Rollback returns this organization to plain tariff/default resolution, i.e. `courses = false`
-- unless a tariff explicitly enables it — confirm that is the intended state before rolling back.)

DO $$
DECLARE
  v_owner_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_owner_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'C4C.0214 expected canonical owner organization %, found %', v_owner_org_id, v_org_count;
  END IF;

  INSERT INTO saas_org_entitlement_overrides (organization_id, mechanic, enabled)
  VALUES (v_owner_org_id, 'courses', true)
  ON CONFLICT ON CONSTRAINT saas_org_entitlement_overrides_org_mechanic_uidx
  DO UPDATE SET enabled = true, updated_at = now();
END $$;

-- Prove the outcome: the canonical owner organization must resolve `courses = true` via this
-- override after this migration, independent of any tariff assignment.
DO $$
DECLARE
  v_owner_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_enabled boolean;
BEGIN
  SELECT enabled
  INTO v_enabled
  FROM saas_org_entitlement_overrides
  WHERE organization_id = v_owner_org_id AND mechanic = 'courses';

  IF v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'C4C.0214 expected courses override enabled=true for owner organization %, found %',
      v_owner_org_id, v_enabled;
  END IF;
END $$;
