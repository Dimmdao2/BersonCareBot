-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.leads') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='leads' AND c.relrowsecurity AND c.relforcerowsecurity) AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='be_booking_form_fields' AND column_name='form_surface') AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.list_public_booking_form_fields()'::regprocedure), 'form_surface = ''booking''') > 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.save_current_patient_booking_form_answers(uuid,text)'::regprocedure), 'form_surface = ''booking''') > 0
--
-- Rights analysis: the tenant relation is declared for app_staff in the canonical privilege
-- declaration; its RLS policy is produced by reconcile from that declaration. Existing definer
-- roots gain only the form_surface column in their declared relation surfaces. No rights are
-- granted or revoked by this migration.
ALTER TABLE public.be_booking_form_fields
  ADD COLUMN IF NOT EXISTS form_surface text NOT NULL DEFAULT 'booking',
  DROP CONSTRAINT IF EXISTS uq_be_booking_form_fields_org_key,
  DROP CONSTRAINT IF EXISTS be_booking_form_fields_surface_check,
  ADD CONSTRAINT be_booking_form_fields_surface_check CHECK (form_surface = ANY (ARRAY['booking'::text, 'leads'::text])),
  ADD CONSTRAINT uq_be_booking_form_fields_org_surface_key UNIQUE (organization_id, form_surface, field_key);

ALTER TABLE public.org_enrollments
  DROP CONSTRAINT IF EXISTS org_enrollments_portal_activation_check,
  ADD CONSTRAINT org_enrollments_portal_activation_check CHECK (
    (portal_activated_at IS NULL AND portal_activated_via IS NULL)
    OR (
      portal_activated_at IS NOT NULL
      AND portal_activated_via IN (
        'patient_invite_email_otp',
        'public_booking_phone_otp',
        'public_booking_verified_email',
        'public_booking_session',
        'public_lead_verified_email'
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE RESTRICT,
  submitted_first_name text,
  submitted_last_name text,
  submitted_patronymic text,
  submitted_email text NOT NULL,
  submitted_phone text,
  preferred_contact text,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  rejection_comment text,
  rejected_at timestamptz,
  accepted_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  source_surface text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_leads_id_org UNIQUE (id, organization_id),
  CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY['new'::text, 'rejected'::text, 'accepted_in_progress'::text, 'accepted_closed'::text])),
  CONSTRAINT leads_source_surface_check CHECK (source_surface = ANY (ARRAY['public_page'::text, 'widget'::text])),
  CONSTRAINT leads_email_not_blank_check CHECK (btrim(submitted_email) <> ''),
  CONSTRAINT leads_message_not_blank_check CHECK (btrim(message_text) <> '')
);
CREATE INDEX IF NOT EXISTS idx_leads_org_created ON public.leads (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_org_status_created ON public.leads (organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_user_created ON public.leads (platform_user_id, created_at);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.list_public_booking_form_fields()
CREATE OR REPLACE FUNCTION app.list_public_booking_form_fields() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE v_org uuid := app.current_org_id(); v_fields jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking.public-form-fields.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.list_public_booking_form_fields()'::regprocedure);
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.clinic_public_directory_entries d WHERE d.organization_id=v_org AND d.is_published=true) THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'organizationId',f.organization_id,'fieldKey',f.field_key,'fieldType',f.field_type,'label',f.label,'placeholder',f.placeholder,'isRequired',f.is_required,'visibleToPatient',f.is_active,'visibleToStaff',f.is_active,'sortOrder',f.sort_order,'isActive',f.is_active,'archivedAt',NULL) ORDER BY f.sort_order,f.field_key),'[]'::jsonb)
  INTO v_fields FROM public.be_booking_form_fields f WHERE f.organization_id=v_org AND f.form_surface = 'booking' AND f.archived_at IS NULL;
  RETURN v_fields;
END $$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_booking_form_fields()
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_form_fields()
RETURNS TABLE(id uuid, organization_id uuid, field_key text, field_type text, label text, placeholder text, is_required boolean, visible_to_patient boolean, visible_to_staff boolean, sort_order integer, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED SET search_path TO 'pg_catalog' AS $$
DECLARE v_org uuid := app.current_org_id(); v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-form-fields.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_current_patient_booking_form_fields()'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e WHERE e.organization_id=v_org AND e.platform_user_id=v_patient AND e.status='active') THEN RETURN; END IF;
  RETURN QUERY SELECT f.id,f.organization_id,f.field_key,f.field_type,f.label,f.placeholder,f.is_required,f.is_active,f.is_active,f.sort_order,f.is_active
  FROM public.be_booking_form_fields f WHERE f.organization_id=v_org AND f.form_surface = 'booking' AND f.archived_at IS NULL ORDER BY f.sort_order,f.label;
END $$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.save_current_patient_booking_form_answers(uuid,text)
CREATE OR REPLACE FUNCTION app.save_current_patient_booking_form_answers(p_appointment_id uuid, p_answers_json text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $_$
DECLARE v_org uuid := app.current_org_id(); v_patient uuid := app.current_patient_user_id(); p_answers jsonb := p_answers_json::jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-form-answers.save', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.save_current_patient_booking_form_answers(uuid,text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_appointment_id IS NULL OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'array' THEN RAISE EXCEPTION 'invalid patient booking form answers' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id=p_appointment_id AND a.organization_id=v_org AND a.platform_user_id=v_patient AND a.deleted_at IS NULL) THEN RAISE EXCEPTION 'patient appointment not found' USING ERRCODE='42501'; END IF;
  INSERT INTO public.be_booking_form_submissions (organization_id,appointment_id,field_id,value_text)
  SELECT v_org,p_appointment_id,f.id,a.value_text FROM jsonb_to_recordset(p_answers) AS a(field_key text,value_text text)
  JOIN public.be_booking_form_fields f ON f.organization_id=v_org AND f.form_surface = 'booking' AND f.field_key=a.field_key AND f.is_active=true AND f.archived_at IS NULL
  WHERE a.value_text IS NOT NULL ON CONFLICT (appointment_id,field_id) DO UPDATE SET value_text=EXCLUDED.value_text;
END $_$;
