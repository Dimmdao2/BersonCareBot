-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A staff capability belongs to exactly one accepted organization. Lock the media row while the
-- private queue core runs so neither a foreign UUID nor a concurrent organization change can turn
-- the exact producer into a cross-tenant write.

CREATE OR REPLACE FUNCTION app.enqueue_media_transcode_job_for_staff(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner', 'app_staff', 'staff',
    'media.transcode.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_media_id IS NULL THEN NULL ELSE uuid_send(p_media_id) END)::app.port_typed_arg
    ]),
    'app.enqueue_media_transcode_job_for_staff(uuid)'::regprocedure
  );

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'staff_organization_context_required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1
    FROM public.media_files AS media
   WHERE media.id = p_media_id
     AND media.organization_id = v_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN app.enqueue_media_transcode_job_core(p_media_id);
END
$function$;
