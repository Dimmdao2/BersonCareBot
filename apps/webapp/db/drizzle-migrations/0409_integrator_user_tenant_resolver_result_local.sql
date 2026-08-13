-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The first live pass proved that returning only organization_id forced the reminder writer to
-- repeat the same identity lookup under tenant RLS. Return the one proven actor+tenant pair once.
DROP FUNCTION app.resolve_active_organization_for_integrator_user_id(bigint);

CREATE FUNCTION app.resolve_active_organization_for_integrator_user_id(
  p_integrator_user_id bigint
)
RETURNS TABLE(platform_user_id uuid, organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner', 'app_integrator_resolver', 'integrator',
    'integrator.user-organization.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('bigint@1', int8send(p_integrator_user_id))::app.port_typed_arg
    ]),
    'app.resolve_active_organization_for_integrator_user_id(bigint)'::regprocedure
  );

  RETURN QUERY
  WITH active_user_orgs AS (
    SELECT enrollment.platform_user_id, enrollment.organization_id
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.status = 'active'
    UNION
    SELECT member.platform_user_id, member.organization_id
    FROM public.be_organization_members AS member
    WHERE member.status = 'active'
  ), matches AS (
    SELECT DISTINCT platform_user.id AS platform_user_id, active_user_orgs.organization_id
    FROM public.platform_users AS platform_user
    INNER JOIN active_user_orgs
      ON active_user_orgs.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id = p_integrator_user_id
  )
  SELECT
    (array_agg(DISTINCT matches.platform_user_id ORDER BY matches.platform_user_id))[1],
    (array_agg(DISTINCT matches.organization_id ORDER BY matches.organization_id))[1]
  FROM matches
  HAVING count(DISTINCT matches.platform_user_id) = 1
     AND count(DISTINCT matches.organization_id) = 1;
END
$function$;
