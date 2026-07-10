-- P0.3.3 read-only bridge/quarantine report.
--
-- Purpose:
--   Build a count-only map for:
--   public.platform_users.integrator_user_id <-> integrator.users.id
--   and identify bridge rows that cannot resolve to an organization through
--   org_enrollments or be_organization_members.
--
-- Prerequisite:
--   Requires migrations 0144_org_enrollments.sql and
--   0145_seed_client_org_enrollments.sql to be applied in the target DB.
--
-- Safety:
--   * Read-only SELECTs only.
--   * Does not select phone, email, display_name, names, chat ids, or message content.
--   * Do not run against production without the owner-approved production SQL workflow.
--   * Dev DB contains PII; if this report is executed, keep outputs aggregate/id-only.

WITH user_orgs AS (
  SELECT
    platform_user_id,
    organization_id,
    'enrollment'::text AS source
  FROM public.org_enrollments
  WHERE status = 'active'

  UNION

  SELECT
    platform_user_id,
    organization_id,
    'membership'::text AS source
  FROM public.be_organization_members
  WHERE status = 'active'
),
bridge AS (
  SELECT
    pu.id AS platform_user_id,
    pu.integrator_user_id,
    iu.id AS integrator_user_id_from_integrator,
    pu.role AS platform_role,
    pu.merged_into_id AS platform_merged_into_id,
    iu.merged_into_user_id AS integrator_merged_into_user_id,
    count(DISTINCT uo.organization_id) AS organization_count,
    array_remove(array_agg(DISTINCT uo.organization_id), NULL) AS organization_ids,
    array_remove(array_agg(DISTINCT uo.source), NULL) AS organization_sources
  FROM public.platform_users pu
  LEFT JOIN integrator.users iu ON iu.id = pu.integrator_user_id
  LEFT JOIN user_orgs uo ON uo.platform_user_id = pu.id
  WHERE pu.integrator_user_id IS NOT NULL
  GROUP BY
    pu.id,
    pu.integrator_user_id,
    iu.id,
    pu.role,
    pu.merged_into_id,
    iu.merged_into_user_id
),
integrator_orphans AS (
  SELECT
    iu.id AS integrator_user_id,
    iu.merged_into_user_id
  FROM integrator.users iu
  LEFT JOIN public.platform_users pu ON pu.integrator_user_id = iu.id
  WHERE pu.id IS NULL
),
missing_integrator_rows AS (
  SELECT
    platform_user_id,
    integrator_user_id,
    platform_role,
    platform_merged_into_id
  FROM bridge
  WHERE integrator_user_id_from_integrator IS NULL
),
unresolved_org_bridge AS (
  SELECT
    platform_user_id,
    integrator_user_id,
    platform_role,
    platform_merged_into_id,
    integrator_merged_into_user_id
  FROM bridge
  WHERE integrator_user_id_from_integrator IS NOT NULL
    AND organization_count = 0
),
multi_org_bridge AS (
  SELECT
    platform_user_id,
    integrator_user_id,
    platform_role,
    organization_count,
    organization_ids,
    organization_sources
  FROM bridge
  WHERE organization_count > 1
)
SELECT
  'summary' AS section,
  'platform_users_with_integrator_id' AS metric,
  count(*)::text AS value
FROM bridge

UNION ALL

SELECT
  'summary',
  'bridge_rows_resolved_to_one_org',
  count(*)::text
FROM bridge
WHERE organization_count = 1

UNION ALL

SELECT
  'summary',
  'bridge_rows_resolved_to_multiple_orgs',
  count(*)::text
FROM multi_org_bridge

UNION ALL

SELECT
  'summary',
  'bridge_rows_without_org_resolution',
  count(*)::text
FROM unresolved_org_bridge

UNION ALL

SELECT
  'summary',
  'platform_users_pointing_to_missing_integrator_user',
  count(*)::text
FROM missing_integrator_rows

UNION ALL

SELECT
  'summary',
  'integrator_users_without_platform_user',
  count(*)::text
FROM integrator_orphans

UNION ALL

SELECT
  'quarantine_integrator_orphans',
  integrator_user_id::text,
  coalesce(merged_into_user_id::text, '')
FROM integrator_orphans

UNION ALL

SELECT
  'quarantine_missing_integrator_rows',
  platform_user_id::text,
  integrator_user_id::text
FROM missing_integrator_rows

UNION ALL

SELECT
  'quarantine_unresolved_org_bridge',
  platform_user_id::text,
  integrator_user_id::text
FROM unresolved_org_bridge

UNION ALL

SELECT
  'review_multi_org_bridge',
  platform_user_id::text,
  integrator_user_id::text
FROM multi_org_bridge
ORDER BY section, metric;
