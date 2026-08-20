-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('integrator.direct_public_write_retries') IS NOT NULL
-- Direct-write durability replaces the retired HTTP projection outbox only for D4/D5 fallback failures.
-- Grants and RLS belong exclusively to deploy/postgres/privileges reconciliation, never migrations.

CREATE TABLE integrator.direct_public_write_retries (
  id bigserial PRIMARY KEY,
  operation text NOT NULL CHECK (
    operation IN ('reminder_rule_upsert', 'support_delivery_attempt_append')
  ),
  organization_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_try_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX direct_public_write_retries_due_idx
  ON integrator.direct_public_write_retries (next_try_at)
  WHERE status = 'pending';

CREATE INDEX direct_public_write_retries_processing_idx
  ON integrator.direct_public_write_retries (updated_at)
  WHERE status = 'processing';
