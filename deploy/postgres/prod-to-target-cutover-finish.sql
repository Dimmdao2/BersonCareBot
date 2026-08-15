\set ON_ERROR_STOP on

-- runtime-settings.sql supplies the target key/audience registry, but values for keys that already
-- exist in the fresh PROD dump must come from its canonical system_settings rows, not from the DEV
-- snapshot used to generate the target schema. Only same-key registered projection rows are copied;
-- unregistered secret settings never enter app_runtime_settings.
UPDATE public.app_runtime_settings AS runtime
SET value_json = canonical.value_json,
    updated_at = canonical.updated_at,
    updated_by = canonical.updated_by
FROM cutover_source_public.system_settings AS canonical
WHERE canonical.key = runtime.key
  AND canonical.scope = runtime.scope
  AND canonical.organization_id IS NOT DISTINCT FROM runtime.organization_id
  AND runtime.value_json IS DISTINCT FROM canonical.value_json;

DROP SCHEMA cutover_source_integrator CASCADE;
DROP SCHEMA cutover_source_drizzle CASCADE;
DROP SCHEMA cutover_source_public CASCADE;

-- Canonical phone is unconditional; do not carry the retired fallback strategy into target state.
DELETE FROM public.app_runtime_settings WHERE key = 'integrator_linked_phone_source';
DELETE FROM public.system_settings
WHERE key = 'integrator_linked_phone_source'
  AND scope = 'admin'
  AND organization_id IS NULL;

-- Existing PROD snapshots predate these required global admin-settings rows. The target UI
-- deliberately fails loud when one is absent, so the A -> B cutover creates only the missing
-- canonical rows and never overwrites a configured value.
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
VALUES
  ('vk_id_application_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('vk_id_client_secret', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('vk_id_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('operator_alert_fallback_email', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('platform_integration_availability', 'admin', NULL,
   '{"value":{"version":1,"integrations":{"telegram":true,"max":true,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}}'::jsonb,
   now())
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, organization_id, 'server', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'platform_integration_availability'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

DO $final_shape_gate$
DECLARE
  violations bigint;
BEGIN
  IF to_regnamespace('cutover_source_public') IS NOT NULL
     OR to_regnamespace('cutover_source_integrator') IS NOT NULL
     OR to_regnamespace('cutover_source_drizzle') IS NOT NULL THEN
    RAISE EXCEPTION 'cutover source schemas remain after cleanup';
  END IF;

  SELECT count(*) INTO violations
  FROM public.platform_users
  WHERE merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_identity identity_row
      WHERE identity_row.platform_user_id = platform_users.id
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'canonical users without user_identity: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.be_appointments appointment
  LEFT JOIN public.be_specialists specialist
    ON specialist.id = appointment.specialist_id
   AND specialist.organization_id = appointment.organization_id
  WHERE appointment.deleted_at IS NULL
    AND (specialist.id IS NULL OR NOT specialist.is_active);
  IF violations <> 0 THEN RAISE EXCEPTION 'live appointments without active specialist: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM cutover_expected_patient_domain_membership expected
  WHERE (
      SELECT count(*) FROM public.org_enrollments enrollment
      WHERE enrollment.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
        AND enrollment.platform_user_id = expected.platform_user_id
        AND enrollment.status = 'active'
    ) <> 1;
  IF violations <> 0 THEN RAISE EXCEPTION 'patient-domain clients without active enrollment: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM cutover_expected_patient_domain_membership expected
  WHERE (
    SELECT count(*) FROM public.patient_specialist_links link
    WHERE link.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND link.patient_user_id = expected.platform_user_id
      AND link.specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      AND link.status = 'active'
  ) <> 1;
  IF violations <> 0 THEN RAISE EXCEPTION 'patient-domain clients without canonical specialist link: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.org_enrollments enrollment
  JOIN public.platform_users patient ON patient.id = enrollment.platform_user_id
  WHERE enrollment.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
    AND enrollment.status = 'active'
    AND (patient.role <> 'client' OR patient.merged_into_id IS NOT NULL OR COALESCE(patient.is_archived, false));
  IF violations <> 0 THEN RAISE EXCEPTION 'ineligible identities with active patient enrollment: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.patient_specialist_links link
  JOIN public.platform_users patient ON patient.id = link.patient_user_id
  WHERE link.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
    AND link.status = 'active'
    AND (patient.role <> 'client' OR patient.merged_into_id IS NOT NULL OR COALESCE(patient.is_archived, false));
  IF violations <> 0 THEN RAISE EXCEPTION 'ineligible identities with active specialist link: %', violations; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.be_organization_members
    WHERE organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'canonical doctor membership was not rebuilt';
  END IF;

  SELECT count(*) INTO violations
  FROM (VALUES
    ('vk_id_application_id'),
    ('vk_id_client_secret'),
    ('vk_id_redirect_uri'),
    ('operator_alert_fallback_email'),
    ('platform_integration_availability')
  ) AS required_setting(key)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.system_settings setting
    WHERE setting.key = required_setting.key
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'required global admin settings missing: %', violations; END IF;
END
$final_shape_gate$;

COMMIT;

SELECT json_build_object(
  'status', 'pass',
  'platformUsers', (SELECT count(*) FROM public.platform_users),
  'userIdentities', (SELECT count(*) FROM public.user_identity),
  'appointments', (SELECT count(*) FROM public.be_appointments),
  'patientDomainMembershipExpected', (
    SELECT count(*) FROM cutover_expected_patient_domain_membership
  ),
  'activeEnrollments', (SELECT count(*) FROM public.org_enrollments WHERE status = 'active'),
  'calendarMappings', (SELECT count(*) FROM public.booking_calendar_map),
  'pendingDeliveryQueue', (
    SELECT count(*) FROM public.outgoing_delivery_queue
    WHERE status IN ('pending', 'processing', 'failed_retryable')
  )
) AS prod_to_target_cutover;
