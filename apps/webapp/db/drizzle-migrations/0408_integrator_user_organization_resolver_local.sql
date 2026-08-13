-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Signed M2M routes still carrying a legacy integrator user id must resolve the tenant before
-- installing an organization principal. Expose only the exactly-one active organization UUID;
-- never lend the resolver role direct access to identity or membership rows.
CREATE OR REPLACE FUNCTION app.resolve_active_organization_for_integrator_user_id(
  p_integrator_user_id bigint
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner', 'app_integrator_resolver', 'integrator',
    'integrator.user-organization.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('bigint@1', int8send(p_integrator_user_id))::app.port_typed_arg
    ]),
    'app.resolve_active_organization_for_integrator_user_id(bigint)'::regprocedure
  );

  WITH active_user_orgs AS (
    SELECT enrollment.platform_user_id, enrollment.organization_id
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.status = 'active'
    UNION
    SELECT member.platform_user_id, member.organization_id
    FROM public.be_organization_members AS member
    WHERE member.status = 'active'
  )
  SELECT (array_agg(DISTINCT active_user_orgs.organization_id
                    ORDER BY active_user_orgs.organization_id))[1]
    INTO v_organization_id
  FROM public.platform_users AS platform_user
  INNER JOIN active_user_orgs
    ON active_user_orgs.platform_user_id = platform_user.id
  WHERE platform_user.integrator_user_id = p_integrator_user_id
  HAVING count(DISTINCT active_user_orgs.organization_id) = 1;

  RETURN v_organization_id;
END
$function$;
