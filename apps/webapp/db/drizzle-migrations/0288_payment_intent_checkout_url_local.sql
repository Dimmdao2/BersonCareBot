-- TEMPORARY LOCAL MIGRATION NUMBER 0288 — the lead assigns the final number at merge.
-- B0.3a (docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md): the provider checkout URL was being
-- discarded on intent creation, so no screen could ever send the patient to actually pay. It now
-- lives alongside the intent it belongs to.

ALTER TABLE "be_payment_intents"
  ADD COLUMN IF NOT EXISTS "checkout_url" text;
