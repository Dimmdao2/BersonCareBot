-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.reminder_rules AS rule WHERE rule.platform_user_id IS NULL AND rule.is_enabled AND NOT EXISTS (SELECT 1 FROM public.reminder_occurrence_history AS occurrence WHERE occurrence.integrator_rule_id = rule.integrator_rule_id))
--
-- A rule without a canonical person cannot be scheduled or delivered. If its retired numeric
-- identity no longer resolves to a live platform user and it has never produced an occurrence,
-- `is_enabled` is only stale state, not evidence of a reachable recipient. Normalize exactly that
-- class to disabled so the following identity-retirement migration can remove it. Rules with a
-- resolvable owner or any occurrence history remain fail-closed for explicit investigation.
--
-- This migration may be discovered on a DEV database where the later identity-retirement migration
-- has already removed `integrator_user_id`. The guarded dynamic statement makes that state an
-- intentional no-op while keeping the same forward migration usable before retirement on TEST/PROD.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reminder_rules'
      AND column_name = 'integrator_user_id'
  ) THEN
    EXECUTE $statement$
      UPDATE public.reminder_rules AS rule
      SET is_enabled = false,
          updated_at = statement_timestamp()
      WHERE rule.platform_user_id IS NULL
        AND rule.is_enabled
        AND NOT EXISTS (
          SELECT 1
          FROM public.platform_users AS patient
          WHERE patient.integrator_user_id = rule.integrator_user_id
            AND patient.merged_into_id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.reminder_occurrence_history AS occurrence
          WHERE occurrence.integrator_rule_id = rule.integrator_rule_id
        )
    $statement$;
  END IF;
END
$migration$;
