-- Greenfield forward reconciliation after the owner-approved legacy and mailing-domain drops.
-- Historical R2 also touched relations that are intentionally absent now. The two surviving
-- reminder delivery relations retain the invariant: every row belongs to one organization.

DO $live_reminder_org_not_null$
DECLARE
  v_null_count bigint;
BEGIN
  IF to_regclass('integrator.user_reminder_occurrences') IS NULL
     OR to_regclass('integrator.user_reminder_delivery_logs') IS NULL THEN
    RAISE EXCEPTION 'live reminder organization invariant requires both delivery relations';
  END IF;

  SELECT
    (SELECT count(*) FROM integrator.user_reminder_occurrences WHERE organization_id IS NULL)
    + (SELECT count(*) FROM integrator.user_reminder_delivery_logs WHERE organization_id IS NULL)
    INTO v_null_count;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'live reminder organization invariant found % NULL organization_id rows',
      v_null_count;
  END IF;
END
$live_reminder_org_not_null$;

ALTER TABLE integrator.user_reminder_occurrences
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_reminder_delivery_logs
  ALTER COLUMN organization_id SET NOT NULL;
