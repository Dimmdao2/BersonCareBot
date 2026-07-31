-- TEMPORARY LOCAL MIGRATION NUMBER 0280 — the lead assigns the final number at merge.
-- D10b (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md): dedicated counter for
-- timeout-driven reclaims (stuck "processing" rows returned to "pending"), kept separate from
-- attempt_count so a normal dispatch-retry count never gets confused with a stuck-row reclaim
-- count. Once reclaim_count reaches the configured cap, the row goes to the dead letter instead
-- of being reclaimed again — see resetStaleOutgoingDeliveryProcessing.

ALTER TABLE "outgoing_delivery_queue"
  ADD COLUMN IF NOT EXISTS "reclaim_count" integer DEFAULT 0 NOT NULL;
