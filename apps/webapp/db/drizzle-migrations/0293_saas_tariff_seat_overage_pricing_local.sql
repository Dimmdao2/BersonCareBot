-- TEMPORARY LOCAL MIGRATION NUMBER 0293 -- the lead assigns the final number at merge.
-- §5a item 5.1: price of one specialist seat beyond a tariff's included_seats. NULL keeps the
-- §5.2 hard block at the ceiling; a stored nonnegative value allows confirmed, paid overage.
-- See docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md #1057.

ALTER TABLE public.saas_tariffs ADD COLUMN additional_seat_price_minor integer;

ALTER TABLE public.saas_tariffs
  ADD CONSTRAINT saas_tariffs_additional_seat_price_nonnegative_check
  CHECK (additional_seat_price_minor IS NULL OR additional_seat_price_minor >= 0);
