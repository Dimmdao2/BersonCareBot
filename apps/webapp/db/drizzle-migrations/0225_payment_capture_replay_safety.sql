-- B1: one durable capture history row per payment across crash/replay.
-- Historical duplicates are never guessed, merged, or deleted by a migration. Fail closed with
-- an aggregate-only diagnostic so an operator can inspect/remediate them under a separate gate.
ALTER TABLE public.be_payment_provider_events
  ADD COLUMN IF NOT EXISTS intent_ref text;

DO $$
DECLARE
  duplicate_groups bigint;
BEGIN
  SELECT count(*)
    INTO duplicate_groups
  FROM (
    SELECT organization_id, payment_id
    FROM public.be_payment_history_events
    WHERE payment_id IS NOT NULL
      AND event_type = 'payment_captured'
    GROUP BY organization_id, payment_id
    HAVING count(*) > 1
  ) duplicate_capture_groups;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'payment capture replay-safety preflight failed: duplicate_groups=%, manual remediation gate required',
      duplicate_groups;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS be_payment_history_capture_uidx
  ON public.be_payment_history_events (organization_id, payment_id, event_type)
  WHERE payment_id IS NOT NULL AND event_type = 'payment_captured';
