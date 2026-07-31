-- TEMPORARY LOCAL MIGRATION NUMBER 0281 — the lead assigns the final number at merge.
-- #1069 stage 4b.3: "ручка 2" — per-mechanic policy for a downgrade to a smaller tariff.

ALTER TABLE public.saas_tariffs
  ADD COLUMN downgrade_policies jsonb NOT NULL DEFAULT '{}'::jsonb;
