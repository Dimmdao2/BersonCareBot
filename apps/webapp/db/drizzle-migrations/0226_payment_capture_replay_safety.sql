-- B1: one durable capture history row per payment across crash/replay.
-- Historical duplicates are never guessed, merged, or deleted by a migration. Fail closed with
-- an aggregate-only diagnostic so an operator can inspect/remediate them under a separate gate.
ALTER TABLE public.be_payment_provider_events
  ADD COLUMN IF NOT EXISTS intent_ref text;

DO $$
DECLARE
  duplicate_capture_groups bigint;
  duplicate_intent_authorities bigint;
  duplicate_event_authorities bigint;
BEGIN
  SELECT count(*)
    INTO duplicate_capture_groups
  FROM (
    SELECT organization_id, payment_id
    FROM public.be_payment_history_events
    WHERE payment_id IS NOT NULL
      AND event_type = 'payment_captured'
    GROUP BY organization_id, payment_id
    HAVING count(*) > 1
  ) duplicate_capture_groups;

  SELECT count(*)
    INTO duplicate_intent_authorities
  FROM (
    SELECT provider_id, idempotency_key
    FROM public.be_payment_intents
    GROUP BY provider_id, idempotency_key
    HAVING count(*) > 1
  ) duplicate_intent_groups;

  SELECT count(*)
    INTO duplicate_event_authorities
  FROM (
    SELECT provider_id, idempotency_key, event_type
    FROM public.be_payment_provider_events
    GROUP BY provider_id, idempotency_key, event_type
    HAVING count(*) > 1
  ) duplicate_event_groups;

  IF duplicate_capture_groups > 0
     OR duplicate_intent_authorities > 0
     OR duplicate_event_authorities > 0 THEN
    RAISE EXCEPTION
      'payment capture replay-safety preflight failed: capture_groups=%, intent_authority_groups=%, event_authority_groups=%, manual remediation gate required',
      duplicate_capture_groups,
      duplicate_intent_authorities,
      duplicate_event_authorities;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS be_payment_intents_provider_authority_uidx
  ON public.be_payment_intents (provider_id, idempotency_key);

DROP INDEX IF EXISTS public.be_payment_provider_events_idempotency_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS be_payment_provider_events_lifecycle_uidx
  ON public.be_payment_provider_events (provider_id, idempotency_key, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS be_payment_history_capture_uidx
  ON public.be_payment_history_events (organization_id, payment_id, event_type)
  WHERE payment_id IS NOT NULL AND event_type = 'payment_captured';

-- Public provider webhooks arrive before an organization principal can be installed. Expose only
-- the exact tenant authority lookup needed to cross that boundary; payload, amounts and all other
-- payment data remain inaccessible to bootstrap callers.
CREATE OR REPLACE FUNCTION app.resolve_payment_webhook_organization(
  p_provider_id text,
  p_idempotency_key text,
  p_event_type text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_ids uuid[];
BEGIN
  IF p_provider_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_event_type IS NULL
     OR btrim(p_provider_id) = ''
     OR btrim(p_idempotency_key) = ''
     OR btrim(p_event_type) = '' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT event.organization_id)
  INTO v_organization_ids
  FROM public.be_payment_provider_events AS event
  WHERE event.provider_id = p_provider_id
    AND event.idempotency_key = p_idempotency_key
    AND event.event_type = p_event_type;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  IF cardinality(v_organization_ids) > 1 THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT intent.organization_id)
  INTO v_organization_ids
  FROM public.be_payment_intents AS intent
  WHERE intent.provider_id = p_provider_id
    AND intent.idempotency_key = p_idempotency_key;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) IS
  'Narrow fail-closed bootstrap resolver for provider webhook tenant authority; returns only organization_id from an exact lifecycle event or intent identity.';

REVOKE ALL ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO app_patient;
GRANT SELECT ON TABLE public.be_payment_provider_events, public.be_payment_intents TO app_owner;
