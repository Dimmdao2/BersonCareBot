-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regclass('public.video_meetings') IS NOT NULL AND pg_catalog.to_regclass('public.video_meeting_invites') IS NOT NULL
CREATE TABLE "video_meetings" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "specialist_id" uuid NOT NULL,
  "appointment_id" uuid,
  "provider_room_ref" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "video_meetings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade,
  CONSTRAINT "video_meetings_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade,
  CONSTRAINT "video_meetings_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."be_specialists"("id") ON DELETE cascade,
  CONSTRAINT "video_meetings_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."be_appointments"("id") ON DELETE set null,
  CONSTRAINT "video_meetings_status_check" CHECK ("status" = ANY (ARRAY['active'::text, 'ended'::text, 'revoked'::text]))
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX "uq_video_meetings_active_participants" ON "video_meetings" USING btree ("organization_id", "patient_user_id", "specialist_id") WHERE "status" = 'active';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX "uq_video_meetings_provider_room_ref" ON "video_meetings" USING btree ("provider_room_ref");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX "idx_video_meetings_org_patient_created" ON "video_meetings" USING btree ("organization_id", "patient_user_id", "created_at");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX "idx_video_meetings_org_specialist_created" ON "video_meetings" USING btree ("organization_id", "specialist_id", "created_at");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE TABLE "video_meeting_invites" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "meeting_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "secret_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by_platform_user_id" uuid,
  "superseded_by_invite_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "video_meeting_invites_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."video_meetings"("id") ON DELETE cascade,
  CONSTRAINT "video_meeting_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade,
  CONSTRAINT "video_meeting_invites_revoked_by_fkey" FOREIGN KEY ("revoked_by_platform_user_id") REFERENCES "public"."platform_users"("id"),
  CONSTRAINT "video_meeting_invites_superseded_by_fkey" FOREIGN KEY ("superseded_by_invite_id") REFERENCES "public"."video_meeting_invites"("id") ON DELETE set null,
  CONSTRAINT "video_meeting_invites_status_check" CHECK ("status" = ANY (ARRAY['active'::text, 'revoked'::text, 'superseded'::text]))
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX "uq_video_meeting_invites_secret_hash" ON "video_meeting_invites" USING btree ("secret_hash");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX "uq_video_meeting_invites_active_meeting" ON "video_meeting_invites" USING btree ("meeting_id") WHERE "status" = 'active';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX "idx_video_meeting_invites_org_status_expires" ON "video_meeting_invites" USING btree ("organization_id", "status", "expires_at");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.exchange_video_meeting_invite(text)') IS NOT NULL
CREATE FUNCTION app.exchange_video_meeting_invite(p_secret_hash text)
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
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_invite_owner'::name,
    ARRAY['app_patient'::name]::name[]
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
