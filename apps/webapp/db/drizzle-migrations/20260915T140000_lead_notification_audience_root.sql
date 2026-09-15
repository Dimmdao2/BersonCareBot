-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.list_clinic_lead_notification_recipients(uuid)') IS NOT NULL
--
-- Rights analysis: this SECURITY DEFINER root runs as app_seam_public_booking_owner and is
-- executable only by app_tenant_service after the accepted tenant_service context has bound one
-- organization. Its body needs SELECT on the declared platform_users and be_organization_members
-- columns; deploy/postgres/privileges/declaration.ts owns those rights and the runtime capability.
-- No role grants live in this migration.
CREATE FUNCTION app.list_clinic_lead_notification_recipients(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_recipients jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'leads.clinic-notification-audience.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg
    ]),
    'app.list_clinic_lead_notification_recipients(uuid)'::regprocedure
  );

  IF p_organization_id IS DISTINCT FROM v_organization_id THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
           jsonb_agg(member.platform_user_id ORDER BY member.platform_user_id),
           '[]'::jsonb
         )
    INTO v_recipients
    FROM public.be_organization_members AS member
    JOIN public.platform_users AS staff_user
      ON staff_user.id = member.platform_user_id
   WHERE member.organization_id = v_organization_id
     AND member.status = 'active'
     AND member.role IN ('owner', 'admin')
     AND staff_user.role IN ('doctor', 'admin')
     AND staff_user.merged_into_id IS NULL;

  RETURN v_recipients;
END
$$;
