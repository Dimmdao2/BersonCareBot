-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'be_booking_form_fields' AND a.attname = 'archived_at' AND NOT a.attisdropped) AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.list_public_booking_form_fields()'::regprocedure), 'field.archived_at IS NULL') > 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.save_current_patient_booking_form_answers(uuid,text)'::regprocedure), 'field.archived_at IS NULL') > 0
--
-- `is_active` is the only product flag controlling whether a field is shown to and accepted from
-- a patient. The two older visibility columns remain physically for compatibility, but runtime no
-- longer uses them as independent mechanics. Custom fields are archived so historical appointment
-- answers keep their field metadata.
--
-- Rights analysis: the table alteration and compatibility backfill run under app_object_owner.
-- Three existing SECURITY DEFINER roots are replaced under their existing seam owners. Their
-- relation/column surfaces, including archived_at, are declared in
-- deploy/postgres/privileges/declaration.ts. This migration contains no GRANT or REVOKE.
ALTER TABLE public.be_booking_form_fields
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
UPDATE public.be_booking_form_fields
SET visible_to_patient = is_active,
    visible_to_staff = is_active,
    updated_at = statement_timestamp()
WHERE visible_to_patient IS DISTINCT FROM is_active
   OR visible_to_staff IS DISTINCT FROM is_active;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.list_public_booking_form_fields()
CREATE OR REPLACE FUNCTION app.list_public_booking_form_fields() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_org uuid := app.current_org_id();
  v_fields jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking.public-form-fields.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.list_public_booking_form_fields()'::regprocedure);

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries directory
    WHERE directory.organization_id = v_org
      AND directory.is_published = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', field.id,
    'organizationId', field.organization_id,
    'fieldKey', field.field_key,
    'fieldType', field.field_type,
    'label', field.label,
    'placeholder', field.placeholder,
    'isRequired', field.is_required,
    'visibleToPatient', field.is_active,
    'visibleToStaff', field.is_active,
    'sortOrder', field.sort_order,
    'isActive', field.is_active,
    'archivedAt', NULL
  ) ORDER BY field.sort_order, field.field_key), '[]'::jsonb)
  INTO v_fields
  FROM public.be_booking_form_fields field
  WHERE field.organization_id = v_org
    AND field.archived_at IS NULL;

  RETURN v_fields;
END;
$$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_booking_form_fields()
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_form_fields()
RETURNS TABLE(id uuid, organization_id uuid, field_key text, field_type text, label text, placeholder text, is_required boolean, visible_to_patient boolean, visible_to_staff boolean, sort_order integer, is_active boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL RESTRICTED
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-form-fields.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_current_patient_booking_form_fields()'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT field.id, field.organization_id, field.field_key, field.field_type, field.label,
         field.placeholder, field.is_required, field.is_active, field.is_active,
         field.sort_order, field.is_active
  FROM public.be_booking_form_fields field
  WHERE field.organization_id = v_org
    AND field.archived_at IS NULL
  ORDER BY field.sort_order, field.label;
END;
$$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.save_current_patient_booking_form_answers(uuid,text)
CREATE OR REPLACE FUNCTION app.save_current_patient_booking_form_answers(p_appointment_id uuid, p_answers_json text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_answers jsonb := p_answers_json::jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-form-answers.save', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.save_current_patient_booking_form_answers(uuid,text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_appointment_id IS NULL
     OR p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'invalid patient booking form answers' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.be_appointments appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = v_org
      AND appointment.platform_user_id = v_patient
      AND appointment.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'patient appointment not found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.be_booking_form_submissions (
    organization_id, appointment_id, field_id, value_text
  )
  SELECT v_org, p_appointment_id, field.id, answer.value_text
  FROM jsonb_to_recordset(p_answers) AS answer(field_key text, value_text text)
  JOIN public.be_booking_form_fields field
    ON field.organization_id = v_org
   AND field.field_key = answer.field_key
   AND field.is_active = TRUE
   AND field.archived_at IS NULL
  WHERE answer.value_text IS NOT NULL
  ON CONFLICT (appointment_id, field_id)
  DO UPDATE SET value_text = EXCLUDED.value_text;
END
$_$;
