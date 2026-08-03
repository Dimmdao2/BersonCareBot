-- Live TEST checkout repair: tariff transition evaluation runs under app_clinic_billing, which
-- must see aggregate usage for the signed clinic without receiving direct access to member,
-- invitation, patient or file rows.

DROP FUNCTION IF EXISTS app.read_org_enforced_quota_usage(uuid);

CREATE FUNCTION app.read_org_enforced_quota_usage(p_organization_id uuid)
RETURNS TABLE(
  clinic_team_used integer,
  patient_count_used integer,
  files_used bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    (
      (SELECT count(*) FROM public.be_organization_members AS membership
       WHERE membership.organization_id = p_organization_id
         AND membership.status = 'active'
         AND membership.specialist_id IS NOT NULL)
      +
      (SELECT count(*) FROM public.organization_member_invites AS invite
       WHERE invite.organization_id = p_organization_id
         AND invite.status = 'pending'
         AND invite.expires_at > now()
         AND invite.invited_role = 'doctor')
      +
      (SELECT count(*) FROM public.organization_member_invites AS invite
       JOIN public.be_organization_members AS membership
         ON membership.id = invite.accepted_membership_id
       WHERE invite.organization_id = p_organization_id
         AND invite.status = 'accepted'
         AND invite.invited_role = 'doctor'
         AND membership.status = 'active'
         AND membership.specialist_id IS NULL)
    )::integer AS clinic_team_used,
    (SELECT count(*) FROM public.org_enrollments AS enrollment
     WHERE enrollment.organization_id = p_organization_id
       AND enrollment.status IN ('invited', 'active'))::integer AS patient_count_used,
    COALESCE(
      (SELECT sum(file.size_bytes) FROM public.patient_files AS file
       WHERE file.organization_id = p_organization_id),
      0
    )::bigint AS files_used
  WHERE p_organization_id IS NOT NULL
$function$;

ALTER FUNCTION app.read_org_enforced_quota_usage(uuid) OWNER TO app_owner;
GRANT SELECT ON TABLE
  public.be_organization_members,
  public.organization_member_invites,
  public.org_enrollments,
  public.patient_files,
  public.be_branches
TO app_owner;
REVOKE ALL ON FUNCTION app.read_org_enforced_quota_usage(uuid)
FROM PUBLIC, app_staff, app_patient, app_clinic_billing, app_platform_settings;
GRANT EXECUTE ON FUNCTION app.read_org_enforced_quota_usage(uuid)
TO app_platform_settings;

CREATE OR REPLACE FUNCTION app.read_current_org_tariff_transition_usage()
RETURNS TABLE(
  organization_id uuid,
  clinic_team_used integer,
  patient_count_used integer,
  files_used bigint,
  branches_used integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    context.organization_id,
    usage.clinic_team_used,
    usage.patient_count_used,
    usage.files_used,
    (
      SELECT count(*)::integer
      FROM public.be_branches AS branch
      WHERE branch.organization_id = context.organization_id
        AND branch.is_active = true
    ) AS branches_used
  FROM (SELECT app.current_org_id() AS organization_id) AS context
  CROSS JOIN LATERAL app.read_org_enforced_quota_usage(context.organization_id) AS usage
  WHERE context.organization_id IS NOT NULL
$function$;

ALTER FUNCTION app.read_current_org_tariff_transition_usage() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_current_org_tariff_transition_usage()
FROM PUBLIC, app_patient, app_platform_settings, app_staff, app_clinic_billing;
GRANT EXECUTE ON FUNCTION app.read_current_org_tariff_transition_usage()
TO app_staff, app_clinic_billing;

DO $clinic_billing_usage_capability$
BEGIN
  IF NOT has_function_privilege(
    'app_clinic_billing',
    'app.read_current_org_tariff_transition_usage()',
    'EXECUTE'
  )
    OR has_function_privilege(
      'app_clinic_billing',
      'app.read_org_enforced_quota_usage(uuid)',
      'EXECUTE'
    )
    OR has_table_privilege('app_clinic_billing', 'public.be_organization_members', 'SELECT')
    OR has_table_privilege('app_clinic_billing', 'public.organization_member_invites', 'SELECT')
    OR has_table_privilege('app_clinic_billing', 'public.org_enrollments', 'SELECT')
    OR has_table_privilege('app_clinic_billing', 'public.patient_files', 'SELECT')
  THEN
    RAISE EXCEPTION '0332 clinic billing quota capability is not narrow'
      USING ERRCODE = '42501';
  END IF;
END
$clinic_billing_usage_capability$;
