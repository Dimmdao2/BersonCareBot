-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'integrator.direct_public_write_retries'::regclass AND conname = 'direct_public_write_retries_operation_check' AND pg_get_constraintdef(oid) LIKE '%content_access_grant_upsert%') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'integrator.direct_public_write_retries'::regclass AND conname = 'direct_public_write_retries_payload_org_check' AND convalidated)
-- RLS/ACL remains exclusively in deploy/postgres/privileges reconciliation.
-- This object migration makes the durable row fail closed before replay when its payload names another org.

ALTER TABLE integrator.direct_public_write_retries
  DROP CONSTRAINT IF EXISTS direct_public_write_retries_operation_check;

ALTER TABLE integrator.direct_public_write_retries
  ADD CONSTRAINT direct_public_write_retries_operation_check CHECK (
    operation IN (
      'reminder_rule_upsert',
      'support_delivery_attempt_append',
      'reminder_occurrence_sent_record',
      'reminder_occurrence_failed_record',
      'reminder_occurrence_expired_record',
      'reminder_delivery_log_append',
      'content_access_grant_upsert'
    )
  );

UPDATE integrator.direct_public_write_retries
SET payload = jsonb_set(payload, '{organizationId}', to_jsonb(organization_id::text), true),
    updated_at = now()
WHERE operation = 'reminder_rule_upsert'
  AND NOT (payload ? 'organizationId');

UPDATE integrator.direct_public_write_retries
SET status = 'dead',
    last_error = 'direct public write retry organization mismatch',
    updated_at = now()
WHERE status <> 'dead'
  AND (
    jsonb_typeof(payload -> 'organizationId') IS DISTINCT FROM 'string'
    OR payload ->> 'organizationId' IS DISTINCT FROM organization_id::text
  );

ALTER TABLE integrator.direct_public_write_retries
  ADD CONSTRAINT direct_public_write_retries_payload_org_check CHECK (
    status = 'dead'
    OR (
      jsonb_typeof(payload -> 'organizationId') = 'string'
      AND payload ->> 'organizationId' = organization_id::text
    )
  );
