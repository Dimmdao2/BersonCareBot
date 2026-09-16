-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'platform_users' AND a.attname = 'email_first_requested_at' AND NOT a.attisdropped
-- The timestamp is the single persistent clock between the first post-login email request and the
-- mandatory gate fourteen days later. It is read by primary key, so no new scan/index is needed.
-- Rights analysis: app_object_owner adds the nullable column. Runtime never receives direct UPDATE;
-- app_patient reaches it only through app.patient_email_gate_state(boolean), declared below.
ALTER TABLE public.platform_users
  ADD COLUMN email_first_requested_at timestamp with time zone;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.patient_email_gate_state(boolean)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.patient_email_gate_state(p_mark_first_request boolean)
RETURNS TABLE(email_verified boolean, email_first_requested_at timestamp with time zone)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_self_actions_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'patient.email-gate.state',
    app.hash_port_typed_args(ARRAY[
      ROW('boolean@1', pg_catalog.boolsend(p_mark_first_request))::app.port_typed_arg
    ]),
    'app.patient_email_gate_state(boolean)'::regprocedure
  );

  v_user_id := app.current_actor_user_id();

  IF p_mark_first_request THEN
    UPDATE public.platform_users AS target
       SET email_first_requested_at = COALESCE(
         target.email_first_requested_at,
         pg_catalog.statement_timestamp()
       )
     WHERE target.id = v_user_id
       AND target.role = 'client'
       AND target.merged_into_id IS NULL;
  END IF;

  RETURN QUERY
  SELECT EXISTS (
           SELECT 1
             FROM public.user_contacts AS contact
            WHERE contact.platform_user_id = account.id
              AND contact.contact_kind = 'email'
              AND contact.confirmed_at IS NOT NULL
         ) AS email_verified,
         account.email_first_requested_at
    FROM public.platform_users AS account
   WHERE account.id = v_user_id
     AND account.role = 'client'
     AND account.merged_into_id IS NULL;
END
$function$;
