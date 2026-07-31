-- D6: preserve every integrator occurrence that already reached the technical `failed` state.
-- This runs inside the existing migration-owner window; locked runtime logins are intentionally
-- not granted cross-schema backfill access.

DO $$
DECLARE
  unresolved_count bigint;
BEGIN
  SELECT count(*)
  INTO unresolved_count
  FROM integrator.user_reminder_occurrences occurrence
  INNER JOIN integrator.user_reminder_rules rule
    ON rule.id = occurrence.rule_id
  LEFT JOIN public.reminder_occurrence_history history
    ON history.integrator_occurrence_id = occurrence.id
  WHERE occurrence.status = 'failed'
    AND history.integrator_occurrence_id IS NULL
    AND (
      occurrence.failed_at IS NULL
      OR COALESCE(occurrence.organization_id, rule.organization_id) IS NULL
    );

  IF unresolved_count <> 0 THEN
    RAISE EXCEPTION
      'D6 failed occurrence history backfill found % unresolved rows (failed_at or organization_id missing)',
      unresolved_count;
  END IF;
END $$;

INSERT INTO public.reminder_occurrence_history (
  organization_id,
  integrator_occurrence_id,
  integrator_rule_id,
  integrator_user_id,
  category,
  status,
  delivery_channel,
  error_code,
  occurred_at,
  created_at
)
SELECT
  COALESCE(occurrence.organization_id, rule.organization_id),
  occurrence.id,
  occurrence.rule_id,
  rule.user_id,
  rule.category,
  'failed',
  occurrence.delivery_channel,
  occurrence.error_code,
  occurrence.failed_at,
  occurrence.failed_at
FROM integrator.user_reminder_occurrences occurrence
INNER JOIN integrator.user_reminder_rules rule
  ON rule.id = occurrence.rule_id
WHERE occurrence.status = 'failed'
ON CONFLICT (integrator_occurrence_id) DO NOTHING;
