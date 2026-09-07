-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT appointments_manage_own, availability_manage_own FROM public.be_organization_members LIMIT 1;
ALTER TABLE public.be_organization_members
  ADD COLUMN appointments_manage_own boolean NOT NULL DEFAULT true,
  ADD COLUMN availability_manage_own boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_directory_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
DROP FUNCTION app.resolve_staff_workspace_memberships(uuid);
CREATE FUNCTION app.resolve_staff_workspace_memberships(p_platform_user_id uuid)
RETURNS TABLE(id uuid, organization_id uuid, platform_user_id uuid, role text, specialist_id uuid, status text, doctor_screens_disabled boolean, appointments_manage_own boolean, availability_manage_own boolean, created_at text, updated_at text)
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $$
DECLARE v_staff_context boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_org_directory_owner',
    CASE WHEN pg_has_role(session_user, 'app_staff', 'MEMBER') THEN 'app_staff'::name ELSE 'app_pre_session'::name END,
    CASE WHEN pg_has_role(session_user, 'app_staff', 'MEMBER') THEN 'staff'::app.port_context_class ELSE 'pre_session'::app.port_context_class END,
    'auth.staff-workspace.resolve',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg]),
    'app.resolve_staff_workspace_memberships(uuid)'::regprocedure
  );
  v_staff_context := pg_has_role(session_user, 'app_staff', 'MEMBER');
  IF p_platform_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'platform user id required'; END IF;
  IF v_staff_context AND p_platform_user_id <> app.current_actor_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'staff workspace self-resolution required';
  END IF;
  RETURN QUERY SELECT membership.id, membership.organization_id, membership.platform_user_id,
    membership.role, membership.specialist_id, membership.status, membership.doctor_screens_disabled,
    membership.appointments_manage_own, membership.availability_manage_own,
    membership.created_at::text, membership.updated_at::text
  FROM public.be_organization_members membership
  WHERE membership.platform_user_id = p_platform_user_id AND membership.status = 'active'
  ORDER BY membership.created_at, membership.organization_id;
END $$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_directory_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
DROP FUNCTION app.list_platform_organization_members(uuid);
CREATE FUNCTION app.list_platform_organization_members(p_organization_id uuid)
RETURNS TABLE(membership_id uuid, organization_id uuid, platform_user_id uuid, membership_role text, specialist_id uuid, membership_status text, doctor_screens_disabled boolean, appointments_manage_own boolean, availability_manage_own boolean, created_at timestamptz, updated_at timestamptz, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
SELECT app.require_attested_context_for_roles('app_seam_org_directory_owner'::name, ARRAY['app_platform_settings'::name]::name[]);
SELECT membership.id, membership.organization_id, membership.platform_user_id, membership.role,
  membership.specialist_id, membership.status, membership.doctor_screens_disabled,
  membership.appointments_manage_own, membership.availability_manage_own,
  membership.created_at, membership.updated_at, NULLIF(btrim(platform_user.display_name), '')
FROM public.be_organization_members AS membership
INNER JOIN public.platform_users AS platform_user ON platform_user.id = membership.platform_user_id
WHERE membership.organization_id = p_organization_id
ORDER BY membership.created_at, membership.platform_user_id
$$;
