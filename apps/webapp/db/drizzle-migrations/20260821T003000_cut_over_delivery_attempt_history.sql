-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('integrator.delivery_attempt_logs') IS NULL
--
-- D10a/D16: this is a one-way history cutover.  The UUID is deterministically derived from the
-- legacy primary key, so a re-run has exactly the same canonical identity.  The legacy-only audit
-- fields stay together in metadata; no runtime writer or reader remains on the old relation.

INSERT INTO public.notification_delivery_attempts (
  id,
  created_at,
  organization_id,
  intent_type,
  channel,
  status,
  reason,
  event_id,
  metadata
)
SELECT
  (
    substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 1, 8) || '-' ||
    substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 9, 4) || '-' ||
    substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 13, 4) || '-' ||
    substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 17, 4) || '-' ||
    substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 21, 12)
  )::uuid,
  legacy.occurred_at,
  legacy.organization_id,
  legacy.intent_type,
  legacy.channel,
  legacy.status,
  legacy.reason,
  legacy.intent_event_id,
  jsonb_build_object(
    'attempt', legacy.attempt,
    'correlationId', legacy.correlation_id,
    'payload', legacy.payload_json,
    'source', 'legacy_delivery_attempt_logs_cutover',
    'legacySource', 'integrator.delivery_attempt_logs',
    'legacyId', legacy.id
  )
FROM integrator.delivery_attempt_logs AS legacy
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
--
-- Fail closed before the legacy evidence can be dropped: all rows must have one provenance-marked
-- canonical row, every provenance id must be unique, and all preserved fields must match exactly.

DO $cutover_delivery_attempt_history$
DECLARE
  v_legacy_count bigint;
  v_canonical_count bigint;
  v_distinct_legacy_ids bigint;
BEGIN
  SELECT count(*) INTO v_legacy_count
  FROM integrator.delivery_attempt_logs;

  SELECT count(*), count(DISTINCT metadata->>'legacyId')
  INTO v_canonical_count, v_distinct_legacy_ids
  FROM public.notification_delivery_attempts
  WHERE metadata->>'legacySource' = 'integrator.delivery_attempt_logs';

  IF v_canonical_count <> v_legacy_count
    OR v_distinct_legacy_ids <> v_legacy_count
  THEN
    RAISE EXCEPTION
      'delivery attempt history cutover count/provenance mismatch: legacy %, canonical %, distinct provenance %',
      v_legacy_count, v_canonical_count, v_distinct_legacy_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM integrator.delivery_attempt_logs AS legacy
    FULL OUTER JOIN (
      SELECT *
      FROM public.notification_delivery_attempts
      WHERE metadata->>'legacySource' = 'integrator.delivery_attempt_logs'
    ) AS canonical
      ON canonical.id = (
        substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 1, 8) || '-' ||
        substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 9, 4) || '-' ||
        substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 13, 4) || '-' ||
        substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 17, 4) || '-' ||
        substr(md5('integrator.delivery_attempt_logs:' || legacy.id::text), 21, 12)
      )::uuid
    WHERE legacy.id IS NULL
      OR canonical.id IS NULL
      OR canonical.created_at IS DISTINCT FROM legacy.occurred_at
      OR canonical.organization_id IS DISTINCT FROM legacy.organization_id
      OR canonical.intent_type IS DISTINCT FROM legacy.intent_type
      OR canonical.channel IS DISTINCT FROM legacy.channel
      OR canonical.status IS DISTINCT FROM legacy.status
      OR canonical.reason IS DISTINCT FROM legacy.reason
      OR canonical.event_id IS DISTINCT FROM legacy.intent_event_id
      OR canonical.metadata IS DISTINCT FROM jsonb_build_object(
        'attempt', legacy.attempt,
        'correlationId', legacy.correlation_id,
        'payload', legacy.payload_json,
        'source', 'legacy_delivery_attempt_logs_cutover',
        'legacySource', 'integrator.delivery_attempt_logs',
        'legacyId', legacy.id
      )
  ) THEN
    RAISE EXCEPTION 'delivery attempt history cutover field-parity mismatch';
  END IF;
END
$cutover_delivery_attempt_history$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner

DROP FUNCTION IF EXISTS app.record_operational_delivery_attempt_audit(
  text, text, text, uuid, text, text, integer, text, text, timestamp with time zone
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

DROP TABLE integrator.delivery_attempt_logs;
