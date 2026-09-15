-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.list_public_booking_form_fields(text)') IS NOT NULL AND to_regprocedure('app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('app.public_lead_consume_altcha_challenge(text,uuid,text)') IS NOT NULL
--
-- The pre-session/tenant-service gate must be the first executable operation in every public
-- lead door.  The landed L3 bodies initialized app.current_org_id()/statement_timestamp() in
-- DECLARE, which computes before require_accepted_context.  This replacement preserves each
-- body and moves only those initializations after its exact gate.
CREATE OR REPLACE FUNCTION app.list_public_booking_form_fields(p_surface text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE
  v_org uuid;
  v_fields jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking.public-form-fields.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.list_public_booking_form_fields(text)'::regprocedure);
  v_org := app.current_org_id();
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
DECLARE
  v_org uuid;
  v_lead public.leads%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'leads.public-submit.create', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg,ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg]), 'app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'::regprocedure);
  v_org := app.current_org_id();
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.clinic_public_directory_entries d WHERE d.organization_id=v_org AND d.is_published=true) THEN RAISE EXCEPTION 'public clinic not found' USING ERRCODE='42501'; END IF;
  IF p_source_surface NOT IN ('public_page','widget') OR btrim(p_email)='' OR btrim(p_message)='' THEN RAISE EXCEPTION 'invalid public lead' USING ERRCODE='22023'; END IF;
  INSERT INTO public.leads (organization_id,platform_user_id,submitted_first_name,submitted_last_name,submitted_patronymic,submitted_email,submitted_phone,preferred_contact,message_text,source_surface,created_at,updated_at)
  VALUES (v_org,p_platform_user_id,p_first_name,p_last_name,p_patronymic,p_email,p_phone,p_preferred_contact,p_message,p_source_surface,p_now,p_now)
  RETURNING * INTO v_lead;
  RETURN jsonb_build_object('id',v_lead.id,'organizationId',v_lead.organization_id,'platformUserId',v_lead.platform_user_id,'submittedFirstName',v_lead.submitted_first_name,'submittedLastName',v_lead.submitted_last_name,'submittedPatronymic',v_lead.submitted_patronymic,'submittedEmail',v_lead.submitted_email,'submittedPhone',v_lead.submitted_phone,'preferredContact',v_lead.preferred_contact,'messageText',v_lead.message_text,'status',v_lead.status,'rejectionComment',v_lead.rejection_comment,'rejectedAt',v_lead.rejected_at,'acceptedAt',v_lead.accepted_at,'closedAt',v_lead.closed_at,'archivedAt',v_lead.archived_at,'sourceSurface',v_lead.source_surface,'createdAt',v_lead.created_at,'updatedAt',v_lead.updated_at);
END $$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.public_lead_issue_altcha_challenge(
  p_identifier_key text,
  p_challenge_id uuid,
  p_challenge_digest text,
  p_expires_at timestamp with time zone
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE
  v_now timestamptz;
  v_live_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.public-lead.altcha-issue', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg]), 'app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure);
  v_now := statement_timestamp();
  IF p_identifier_key IS NULL
    OR p_identifier_key !~ '^lead-email:v1:[0-9a-f]{64}$'
    OR p_challenge_id IS NULL
    OR p_challenge_digest IS NULL
    OR p_challenge_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '10 minutes'
  THEN
    RETURN false;
  END IF;
  SELECT count(*)::integer
  INTO v_live_count
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.identifier_key = p_identifier_key
    AND challenge.purpose = 'public_lead'
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at > v_now;
  IF v_live_count >= 3 THEN
    RETURN false;
  END IF;
  INSERT INTO public.password_altcha_challenges (
    challenge_id, identifier_key, purpose, challenge_digest, expires_at
  )
  VALUES (p_challenge_id, p_identifier_key, 'public_lead', p_challenge_digest, p_expires_at);
  RETURN true;
END $$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.public_lead_consume_altcha_challenge(
  p_identifier_key text,
  p_challenge_id uuid,
  p_challenge_digest text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE
  v_now timestamptz;
  v_challenge public.password_altcha_challenges%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.public-lead.altcha-consume', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.public_lead_consume_altcha_challenge(text,uuid,text)'::regprocedure);
  v_now := statement_timestamp();
  IF p_identifier_key IS NULL OR p_challenge_id IS NULL OR p_challenge_digest IS NULL THEN
    RETURN false;
  END IF;
  SELECT challenge.*
  INTO v_challenge
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.challenge_id = p_challenge_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_challenge.purpose IS DISTINCT FROM 'public_lead'
    OR v_challenge.identifier_key IS DISTINCT FROM p_identifier_key
    OR v_challenge.challenge_digest IS DISTINCT FROM p_challenge_digest
    OR v_challenge.expires_at <= v_now
    OR v_challenge.consumed_at IS NOT NULL
  THEN
    RETURN false;
  END IF;
  UPDATE public.password_altcha_challenges AS challenge
  SET consumed_at = v_now
  WHERE challenge.challenge_id = p_challenge_id;
  RETURN true;
END $$;
