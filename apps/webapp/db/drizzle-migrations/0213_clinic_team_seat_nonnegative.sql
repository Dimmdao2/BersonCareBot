-- C4A correction — enforce the nonnegative seat contract in data. `included_seats` /
-- `seat_limit_override` stay nullable (NULL means "not explicitly configured", which
-- src/modules/org-entitlements/service.ts#resolveClinicSeatLimit falls back to a finite
-- fail-closed baseline for, never "unlimited"); a stored value must be a nonnegative integer.
-- Additive/idempotent: safe to run on a fresh DB or one that already has migration 0212 applied.
-- See docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md C4A and
-- OWNER_REVIEW_2026-07-18.md §§P1, 15 (owner addendum 2026-07-19, C4C5-05).

ALTER TABLE saas_tariffs
  DROP CONSTRAINT IF EXISTS saas_tariffs_included_seats_nonnegative_check,
  ADD CONSTRAINT saas_tariffs_included_seats_nonnegative_check
    CHECK (included_seats IS NULL OR included_seats >= 0);

ALTER TABLE saas_org_entitlement_overrides
  DROP CONSTRAINT IF EXISTS saas_org_entitlement_overrides_seat_limit_nonnegative_check,
  ADD CONSTRAINT saas_org_entitlement_overrides_seat_limit_nonnegative_check
    CHECK (seat_limit_override IS NULL OR seat_limit_override >= 0);

-- Rollback:
--   ALTER TABLE IF EXISTS saas_org_entitlement_overrides DROP CONSTRAINT IF EXISTS saas_org_entitlement_overrides_seat_limit_nonnegative_check;
--   ALTER TABLE IF EXISTS saas_tariffs DROP CONSTRAINT IF EXISTS saas_tariffs_included_seats_nonnegative_check;
