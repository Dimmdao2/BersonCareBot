-- 0268: expose the minimum staff-membership directory projection to platform operations.
--
-- The platform role deliberately has no SELECT on public.platform_users. The clinic card still
-- needs a staff member's display name, so this accessor joins identity internally and returns only
-- display_name plus membership metadata. Phone, email, channel bindings and every patient table
-- remain outside the projection.
--
-- The runtime SELECT grant on public.be_organization_members and this function's EXECUTE grant live
-- in deploy/postgres/c5a-platform-operations-runtime.sql. That overlay is reapplied after the
-- generic grant scrub on every closure; putting the durable grant only in this one-shot migration
-- would recreate the TEST failure mode from 2026-07-24.

SET ROLE app_owner;

CREATE OR REPLACE FUNCTION app.list_platform_organization_members(
  p_organization_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  organization_id uuid,
  platform_user_id uuid,
  membership_role text,
  specialist_id uuid,
  membership_status text,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    membership.id,
    membership.organization_id,
    membership.platform_user_id,
    membership.role,
    membership.specialist_id,
    membership.status,
    membership.created_at,
    membership.updated_at,
    NULLIF(btrim(platform_user.display_name), '')
  FROM public.be_organization_members AS membership
  INNER JOIN public.platform_users AS platform_user
    ON platform_user.id = membership.platform_user_id
  WHERE membership.organization_id = p_organization_id
  ORDER BY membership.created_at, membership.platform_user_id
$function$;

RESET ROLE;

ALTER FUNCTION app.list_platform_organization_members(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.list_platform_organization_members(uuid)
  FROM PUBLIC, app_staff, app_patient, app_platform_settings;

COMMENT ON FUNCTION app.list_platform_organization_members(uuid) IS
  'Platform-only staff directory projection: display name and membership metadata for one exact organization; no contacts or patient data.';

DO $check$
DECLARE
  target oid := 'app.list_platform_organization_members(uuid)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    WHERE procedure.oid = target
      AND procedure.prosecdef
      AND pg_get_userbyid(procedure.proowner) = 'app_owner'
      AND procedure.provolatile = 's'
      AND procedure.proconfig = ARRAY['search_path=pg_catalog']
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = target
      AND (
        privilege.grantee <> procedure.proowner
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'platform_organization_members_directory_function_wall_failed';
  END IF;
END
$check$;
