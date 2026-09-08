-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.exchange_video_meeting_invite(text)
-- BCB-MIGRATION-VERIFY: SELECT position('video-meeting.guest.exchange' in pg_catalog.pg_get_functiondef('app.exchange_video_meeting_invite(text)'::regprocedure)) > 0
CREATE OR REPLACE FUNCTION app.exchange_video_meeting_invite(p_secret_hash text)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  patient_user_id uuid,
  specialist_id uuid,
  provider_room_ref text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_invite_owner'::name,
    'app_patient'::name,
    'pre_session'::app.port_context_class,
    'video-meeting.guest.exchange',
    app.hash_port_typed_args(
      ARRAY[
        ROW('text@1', pg_catalog.textsend(p_secret_hash))::app.port_typed_arg
      ]
    ),
    'app.exchange_video_meeting_invite(text)'::regprocedure
  );

  RETURN QUERY
  SELECT meeting.id, meeting.organization_id, meeting.patient_user_id, meeting.specialist_id,
         meeting.provider_room_ref, meeting.status, meeting.expires_at
  FROM public.video_meeting_invites AS invite
  JOIN public.video_meetings AS meeting ON meeting.id = invite.meeting_id
  WHERE invite.secret_hash = p_secret_hash
    AND invite.status = 'active'
    AND invite.expires_at > now()
    AND meeting.status = 'active'
    AND meeting.expires_at > now()
  LIMIT 1;
END
$function$;
