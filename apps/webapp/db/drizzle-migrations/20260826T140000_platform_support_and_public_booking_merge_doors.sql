-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 2 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('platform_support_account_action','record_public_booking_merge_candidates')
--
-- Track D synthesis (docs/_TODO/runs/integrator-cleanup/DOMAIN_ACCESS_AUDIT_SYNTHESIS_2026-08-26.md,
-- «Platform support / public booking»): two dependent DB write paths had no named door.
--
-- 1. `/api/doctor/clients/support-account` ran `getDrizzle().delete(...)`/`.update(...)` directly at
--    route level (AGENTS.md §5 violation — no port, no door) under the `app_platform_settings`
--    principal, which holds no column grant on `platform_users`/`user_contacts`/
--    `user_channel_bindings`: every call 42501'd. Global block additionally never bumped
--    `platform_users.session_epoch`, so `docs/OWNER_DECISIONS.md`'s "действующая сессия должна
--    перестать давать доступ" (25.08) did not hold for this door even once the 42501 was fixed
--    blindly with a bare grant. One door, four action variants (AGENTS.md §5 — variants of one
--    action are parameters of one point, not four routes): block, unblock, revoke one contact,
--    revoke one channel binding. `set_blocked=true` bumps the epoch exactly like the already-correct
--    `app.set_platform_organization_is_active`-neighbour `pgDoctorClients.setClientBlocked` (only on
--    the unblocked -> blocked transition); unblock does not touch the epoch, so a cookie minted
--    before the block stays rejected by the equality check in `modules/auth/service.ts` after unblock
--    — it never gets re-validated against a lowered epoch, because the epoch never goes down.
--
-- 2. `pgPublicBookingMergeCandidates.findPublicBookingNameCollisionCandidates` read
--    `platform_users`/`user_contacts` through a bare `Pool` handed in from `getPool()` with no
--    principal installed at all (see the call site comment removed by this same branch in
--    `app-layer/booking/createVerifiedPublicBooking.ts`): every call failed with "Missing declared
--    webapp port capability: pre_session", caught, logged, and dropped — the merge-candidate write
--    (`patientMergeCandidateService.upsertPending`, itself gated by the `patient_merge_candidates`
--    clinic wall) never even ran. The two steps are folded into one door so the read and the write
--    commit atomically under the SAME principal instead of two hops that can only partially succeed.
CREATE OR REPLACE FUNCTION app.platform_support_account_action(
  p_action text,
  p_user_id uuid,
  p_actor_id uuid,
  p_blocked boolean,
  p_reason text,
  p_contact_kind text,
  p_value_normalized text,
  p_channel_code text,
  p_external_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_platform_settings'::name,
    'platform'::app.port_context_class,
    'platform.support-account.action',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_action))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_actor_id))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend(p_blocked))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_reason))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_contact_kind))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_value_normalized))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_channel_code))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_external_id))::app.port_typed_arg
    ]),
    'app.platform_support_account_action(text,uuid,uuid,boolean,text,text,text,text,text)'::regprocedure
  );

  IF p_action = 'revoke_contact' THEN
    IF p_contact_kind IS NULL OR p_value_normalized IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'revoke_contact requires contact_kind and value_normalized';
    END IF;
    DELETE FROM public.user_contacts
     WHERE platform_user_id = p_user_id
       AND contact_kind = p_contact_kind
       AND value_normalized = p_value_normalized;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
  END IF;

  IF p_action = 'revoke_channel_binding' THEN
    IF p_channel_code IS NULL OR p_external_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'revoke_channel_binding requires channel_code and external_id';
    END IF;
    DELETE FROM public.user_channel_bindings
     WHERE user_id = p_user_id
       AND channel_code = p_channel_code
       AND external_id = p_external_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
  END IF;

  IF p_action = 'set_blocked' THEN
    IF p_blocked IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'set_blocked requires blocked';
    END IF;
    IF p_blocked THEN
      -- Same session_epoch transition rule as `pgDoctorClients.setClientBlocked`: bump only when the
      -- account was not already blocked, so re-blocking an already-blocked account is a no-op on the
      -- epoch (idempotent, does not burn every other live session's cookie a second time for nothing).
      UPDATE public.platform_users
         SET is_blocked = true,
             session_epoch = session_epoch + CASE WHEN COALESCE(is_blocked, false) THEN 0 ELSE 1 END,
             blocked_at = pg_catalog.now(),
             blocked_reason = p_reason,
             blocked_by = p_actor_id,
             updated_at = pg_catalog.now()
       WHERE id = p_user_id;
    ELSE
      -- No epoch touch on unblock: a cookie minted before the block carries the OLD (lower) epoch and
      -- stays rejected by the equality check forever, exactly as the owner ruling requires — unblock
      -- must not revive it. Only a fresh login mints a cookie carrying the current epoch.
      UPDATE public.platform_users
         SET is_blocked = false,
             blocked_at = NULL,
             blocked_reason = NULL,
             blocked_by = NULL,
             updated_at = pg_catalog.now()
       WHERE id = p_user_id;
    END IF;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown platform_support_account_action';
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_public_booking_merge_candidates(
  p_organization_id uuid,
  p_anchor_user_id uuid,
  p_contact_name text,
  p_trigger_appointment_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_name text;
  v_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.public-merge-candidates.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_anchor_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_contact_name))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_trigger_appointment_id))::app.port_typed_arg
    ]),
    'app.record_public_booking_merge_candidates(uuid,uuid,text,uuid)'::regprocedure
  );

  IF app.current_org_id() IS NULL THEN
    RAISE EXCEPTION 'public_booking_merge_candidates_principal_required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'public_booking_merge_candidates_principal_mismatch' USING ERRCODE = '42501';
  END IF;

  v_name := pg_catalog.btrim(COALESCE(p_contact_name, ''));
  IF pg_catalog.length(v_name) < 2 THEN
    RETURN 0;
  END IF;

  WITH candidates AS (
    SELECT pu.id
    FROM public.platform_users pu
    LEFT JOIN public.user_identity ui ON ui.platform_user_id = pu.id
    LEFT JOIN LATERAL (
      SELECT uc.value_normalized
      FROM public.user_contacts uc
      WHERE uc.platform_user_id = pu.id
        AND uc.contact_kind = 'phone'
        AND uc.is_primary = true
      LIMIT 1
    ) uc_pri_phone ON true
    WHERE pu.merged_into_id IS NULL
      AND pu.role = 'client'
      AND pu.id <> p_anchor_user_id
      AND (uc_pri_phone.value_normalized IS NULL OR pg_catalog.btrim(uc_pri_phone.value_normalized) = '')
      AND lower(pg_catalog.btrim(ui.display_name)) = lower(v_name)
    LIMIT 5
  ), inserted AS (
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, trigger_appointment_id, payload
    )
    SELECT p_organization_id, p_anchor_user_id, c.id, 'public_booking_phone_collision', 'pending',
           p_trigger_appointment_id, jsonb_build_object('contactName', v_name)
    FROM candidates c
    ON CONFLICT (organization_id, anchor_user_id, candidate_user_id) WHERE status = 'pending'
      DO NOTHING
    RETURNING candidate_user_id
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END
$function$;
