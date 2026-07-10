-- P0.4.BE aggregate verification.
-- Read-only check: package item tables inherit tenant scope through their package parents,
-- and the referenced service belongs to the same organization as that parent.

WITH checks AS (
  SELECT
    'be_package_items_total' AS check_name,
    count(*)::bigint AS value
  FROM public.be_package_items

  UNION ALL

  SELECT
    'be_package_items_missing_package_parent' AS check_name,
    count(*)::bigint AS value
  FROM public.be_package_items item
  LEFT JOIN public.be_subscription_packages package
    ON package.id = item.package_id
  WHERE package.id IS NULL

  UNION ALL

  SELECT
    'be_package_items_missing_service_parent' AS check_name,
    count(*)::bigint AS value
  FROM public.be_package_items item
  LEFT JOIN public.be_clinic_services service
    ON service.id = item.service_id
  WHERE service.id IS NULL

  UNION ALL

  SELECT
    'be_package_items_service_org_mismatch' AS check_name,
    count(*)::bigint AS value
  FROM public.be_package_items item
  JOIN public.be_subscription_packages package
    ON package.id = item.package_id
  JOIN public.be_clinic_services service
    ON service.id = item.service_id
  WHERE service.organization_id IS DISTINCT FROM package.organization_id

  UNION ALL

  SELECT
    'be_patient_package_items_total' AS check_name,
    count(*)::bigint AS value
  FROM public.be_patient_package_items

  UNION ALL

  SELECT
    'be_patient_package_items_missing_patient_package_parent' AS check_name,
    count(*)::bigint AS value
  FROM public.be_patient_package_items item
  LEFT JOIN public.be_patient_packages package
    ON package.id = item.patient_package_id
  WHERE package.id IS NULL

  UNION ALL

  SELECT
    'be_patient_package_items_missing_service_parent' AS check_name,
    count(*)::bigint AS value
  FROM public.be_patient_package_items item
  LEFT JOIN public.be_clinic_services service
    ON service.id = item.service_id
  WHERE service.id IS NULL

  UNION ALL

  SELECT
    'be_patient_package_items_service_org_mismatch' AS check_name,
    count(*)::bigint AS value
  FROM public.be_patient_package_items item
  JOIN public.be_patient_packages package
    ON package.id = item.patient_package_id
  JOIN public.be_clinic_services service
    ON service.id = item.service_id
  WHERE service.organization_id IS DISTINCT FROM package.organization_id
)
SELECT check_name, value
FROM checks
ORDER BY check_name;

DO $$
DECLARE
  violations text;
BEGIN
  WITH checks AS (
    SELECT
      'be_package_items_missing_package_parent' AS check_name,
      count(*)::bigint AS value
    FROM public.be_package_items item
    LEFT JOIN public.be_subscription_packages package
      ON package.id = item.package_id
    WHERE package.id IS NULL

    UNION ALL

    SELECT
      'be_package_items_missing_service_parent' AS check_name,
      count(*)::bigint AS value
    FROM public.be_package_items item
    LEFT JOIN public.be_clinic_services service
      ON service.id = item.service_id
    WHERE service.id IS NULL

    UNION ALL

    SELECT
      'be_package_items_service_org_mismatch' AS check_name,
      count(*)::bigint AS value
    FROM public.be_package_items item
    JOIN public.be_subscription_packages package
      ON package.id = item.package_id
    JOIN public.be_clinic_services service
      ON service.id = item.service_id
    WHERE service.organization_id IS DISTINCT FROM package.organization_id

    UNION ALL

    SELECT
      'be_patient_package_items_missing_patient_package_parent' AS check_name,
      count(*)::bigint AS value
    FROM public.be_patient_package_items item
    LEFT JOIN public.be_patient_packages package
      ON package.id = item.patient_package_id
    WHERE package.id IS NULL

    UNION ALL

    SELECT
      'be_patient_package_items_missing_service_parent' AS check_name,
      count(*)::bigint AS value
    FROM public.be_patient_package_items item
    LEFT JOIN public.be_clinic_services service
      ON service.id = item.service_id
    WHERE service.id IS NULL

    UNION ALL

    SELECT
      'be_patient_package_items_service_org_mismatch' AS check_name,
      count(*)::bigint AS value
    FROM public.be_patient_package_items item
    JOIN public.be_patient_packages package
      ON package.id = item.patient_package_id
    JOIN public.be_clinic_services service
      ON service.id = item.service_id
    WHERE service.organization_id IS DISTINCT FROM package.organization_id
  )
  SELECT string_agg(check_name || '=' || value, ', ' ORDER BY check_name)
  INTO violations
  FROM checks
  WHERE value <> 0;

  IF violations IS NOT NULL THEN
    RAISE EXCEPTION 'P0.4.BE FK-path invariant failed: %', violations;
  END IF;
END $$;
