-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0449
-- Patient acquiring webhooks arrive before a clinic principal exists. This exact, attested
-- resolver returns only the owning organization for one server-owned acquiring lifecycle row.

CREATE INDEX IF NOT EXISTS idx_patient_payment_acquiring_webhook_authority
  ON public.patient_payment (provider, provider_payment_id)
  WHERE kind = 'acquiring'
    AND status IN ('pending', 'paid', 'failed', 'refunded')
    AND organization_id IS NOT NULL;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
GRANT SELECT (organization_id, provider, provider_payment_id, kind, status)
  ON TABLE public.patient_payment TO app_seam_payment_webhook_owner;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.resolve_patient_acquiring_webhook_organization(
  p_provider_id text,
  p_provider_payment_id text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_ids uuid[];
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'patient-payment.webhook.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_provider_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_provider_payment_id))::app.port_typed_arg
    ]),
    'app.resolve_patient_acquiring_webhook_organization(text,text)'::regprocedure
  );

  IF p_provider_id IS NULL
     OR p_provider_payment_id IS NULL
     OR pg_catalog.btrim(p_provider_id) = ''
     OR pg_catalog.btrim(p_provider_payment_id) = '' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(payment.organization_id)
  INTO v_organization_ids
  FROM public.patient_payment AS payment
  WHERE payment.kind = 'acquiring'
    AND payment.provider = p_provider_id
    AND payment.provider_payment_id = p_provider_payment_id
    AND payment.status IN ('pending', 'paid', 'failed', 'refunded')
    AND payment.organization_id IS NOT NULL;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
ALTER FUNCTION app.resolve_patient_acquiring_webhook_organization(text, text)
  OWNER TO app_seam_payment_webhook_owner;
REVOKE ALL ON FUNCTION app.resolve_patient_acquiring_webhook_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_patient_acquiring_webhook_organization(text, text) TO app_pre_session;

COMMENT ON FUNCTION app.resolve_patient_acquiring_webhook_organization(text, text) IS
  'Attested bootstrap resolver for patient acquiring callbacks: returns only one organization_id for an exact provider/payment reference and accepted acquiring lifecycle state; NULL for no match or ambiguity.';
