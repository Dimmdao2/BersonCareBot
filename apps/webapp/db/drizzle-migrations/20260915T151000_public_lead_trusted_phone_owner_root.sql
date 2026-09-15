-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_public_lead_trusted_phone_owner(text)') IS NOT NULL
--
-- Rights analysis: this SECURITY DEFINER root runs as app_seam_public_booking_owner and is
-- executable only by app_tenant_service inside an accepted organization context. Its body needs
-- SELECT on exactly user_contacts(platform_user_id, contact_kind, value_normalized, confirmed_at)
-- and platform_users(id, merged_into_id); deploy/postgres/privileges/declaration.ts owns those
-- rights and the runtime capability. No role grants live in this migration.
--
-- The submitted phone is not proved by the lead form. This root therefore cannot create or confirm
-- a contact: it may only return the sole non-merged account that already owns that exact confirmed
-- phone. Zero or multiple matches fail closed as NULL. The public tenant_service class keeps no
-- relation capability and cannot read either identity relation directly.
CREATE FUNCTION app.read_public_lead_trusted_phone_owner(p_phone_normalized text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_match_count integer;
  v_platform_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'leads.trusted-phone-owner.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_phone_normalized))::app.port_typed_arg
    ]),
    'app.read_public_lead_trusted_phone_owner(text)'::regprocedure
  );

  SELECT count(*), (array_agg(contact.platform_user_id))[1]
    INTO v_match_count, v_platform_user_id
    FROM public.user_contacts AS contact
    INNER JOIN public.platform_users AS holder
      ON holder.id = contact.platform_user_id
   WHERE contact.contact_kind = 'phone'
     AND contact.value_normalized = p_phone_normalized
     AND contact.confirmed_at IS NOT NULL
     AND holder.merged_into_id IS NULL;

  IF v_match_count <> 1 THEN
    RETURN NULL;
  END IF;
  RETURN v_platform_user_id;
END
$$;
