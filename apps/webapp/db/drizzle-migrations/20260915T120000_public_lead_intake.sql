-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.list_public_booking_form_fields(text)') IS NOT NULL AND to_regprocedure('app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)') IS NOT NULL
--
-- Rights analysis: both functions are declaration-owned SECURITY DEFINER roots executed only by
-- app_tenant_service after the accepted tenant_service context has bound a published clinic.
-- No role grants live in this migration; deploy/postgres/privileges/declaration.ts owns them.
DROP FUNCTION IF EXISTS app.list_public_booking_form_fields();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.list_public_booking_form_fields(p_surface text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE v_org uuid := app.current_org_id(); v_fields jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking.public-form-fields.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.list_public_booking_form_fields(text)'::regprocedure);
  IF p_surface NOT IN ('booking', 'leads') THEN RAISE EXCEPTION 'invalid public form surface' USING ERRCODE='22023'; END IF;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.clinic_public_directory_entries d WHERE d.organization_id=v_org AND d.is_published=true) THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'organizationId',f.organization_id,'formSurface',f.form_surface,'fieldKey',f.field_key,'fieldType',f.field_type,'label',f.label,'placeholder',f.placeholder,'isRequired',f.is_required,'visibleToPatient',f.is_active,'visibleToStaff',f.is_active,'sortOrder',f.sort_order,'isActive',f.is_active,'archivedAt',NULL) ORDER BY f.sort_order,f.field_key),'[]'::jsonb)
  INTO v_fields FROM public.be_booking_form_fields f WHERE f.organization_id=v_org AND f.form_surface=p_surface AND f.archived_at IS NULL;
  RETURN v_fields;
END $$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.create_public_lead(
  p_platform_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_patronymic text,
  p_email text,
  p_phone text,
  p_preferred_contact text,
  p_message text,
  p_source_surface text,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE v_org uuid := app.current_org_id(); v_lead public.leads%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'leads.public-submit.create', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg,ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg]), 'app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'::regprocedure);
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.clinic_public_directory_entries d WHERE d.organization_id=v_org AND d.is_published=true) THEN RAISE EXCEPTION 'public clinic not found' USING ERRCODE='42501'; END IF;
  IF p_source_surface NOT IN ('public_page','widget') OR btrim(p_email)='' OR btrim(p_message)='' THEN RAISE EXCEPTION 'invalid public lead' USING ERRCODE='22023'; END IF;
  INSERT INTO public.leads (organization_id,platform_user_id,submitted_first_name,submitted_last_name,submitted_patronymic,submitted_email,submitted_phone,preferred_contact,message_text,source_surface,created_at,updated_at)
  VALUES (v_org,p_platform_user_id,p_first_name,p_last_name,p_patronymic,p_email,p_phone,p_preferred_contact,p_message,p_source_surface,p_now,p_now)
  RETURNING * INTO v_lead;
  RETURN jsonb_build_object('id',v_lead.id,'organizationId',v_lead.organization_id,'platformUserId',v_lead.platform_user_id,'submittedFirstName',v_lead.submitted_first_name,'submittedLastName',v_lead.submitted_last_name,'submittedPatronymic',v_lead.submitted_patronymic,'submittedEmail',v_lead.submitted_email,'submittedPhone',v_lead.submitted_phone,'preferredContact',v_lead.preferred_contact,'messageText',v_lead.message_text,'status',v_lead.status,'rejectionComment',v_lead.rejection_comment,'rejectedAt',v_lead.rejected_at,'acceptedAt',v_lead.accepted_at,'closedAt',v_lead.closed_at,'archivedAt',v_lead.archived_at,'sourceSurface',v_lead.source_surface,'createdAt',v_lead.created_at,'updatedAt',v_lead.updated_at);
END $$;
