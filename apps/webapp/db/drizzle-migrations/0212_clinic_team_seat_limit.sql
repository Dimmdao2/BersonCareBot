-- C4A — clinic boundary. Adds the tariff-level included specialist seat count for the
-- `clinic_team` mechanic and an optional per-organization seat-limit override, reusing the
-- existing override > tariff precedence established by saas_org_entitlement_overrides.
-- See docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md C4A and
-- OWNER_REVIEW_2026-07-18.md §§P1, 15 (owner addendum 2026-07-19, C4C5-05).

ALTER TABLE saas_tariffs
  ADD COLUMN IF NOT EXISTS included_seats integer;

ALTER TABLE saas_org_entitlement_overrides
  ADD COLUMN IF NOT EXISTS seat_limit_override integer;

-- Rollback, if this migration has not been used by application code yet:
--   ALTER TABLE IF EXISTS saas_org_entitlement_overrides DROP COLUMN IF EXISTS seat_limit_override;
--   ALTER TABLE IF EXISTS saas_tariffs DROP COLUMN IF EXISTS included_seats;
