-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.pre_session_phone_confirm_resolve(text,text,boolean,text)') IS NOT NULL
--
-- D15b/6 correction (confirm-path): after OTP verification, `POST /api/auth/phone/confirm` (and
-- the sibling `POST /api/auth/phone/messenger-bind/finish`) still hold the bootstrap principal and
-- call `pgUserByPhone.createOrBind`. Its `withPoolTransaction` resolves an unnamed `pre_session`
-- relation capability before the first query and throws "Missing declared webapp port capability:
-- pre_session" — the exact same class of gap the D15b/6 `/start` repair closed for the read-only
-- lookup, now closed here for the write that follows a successful OTP.
--
-- Scope of this root: the plain phone login/registration write — no channel key (`web`), no
-- `profileBindUserId`. That covers the confirmed defect ("existing-user login and new-user
-- registration"). Two sub-cases of `createOrBind` are deliberately NOT folded into this root and
-- keep using the original relation-based transaction:
--   - `profileBindUserId` (bind a new phone onto an already-authenticated session): `createOrBind`
--     already installs an `organization` principal for that whole transaction via
--     `runWithDbOrganizationPrincipal` BEFORE the first query, so it never reaches the bootstrap
--     capability gap this migration exists to close — out of scope, unchanged.
--   - a messenger channel key (`telegram`/`vk`/`max`, reached only from `messenger-bind/finish`
--     today): `createOrBind` calls `app.auth_phone_bind_lock_channel_binding` /
--     `..._upsert_channel_binding`, both gated by
--     `app.require_attested_context_for_roles(..., ARRAY['app_patient','app_staff'])` — they refuse
--     ANY transaction whose accepted port context carries `target_role = app_pre_session`, by
--     design (self-service channel binding is an authenticated-principal operation). Folding
--     channel binding into a pre_session root would mean either bypassing that role gate (widening
--     pre_session rights the brief forbids) or re-deriving the channel-conflict merge decision
--     (`mergePlatformUsersInTransaction`, ~1.6k lines, `packages/platform-merge`) inside SQL
--     (duplicating the merge algorithm, also forbidden). Left as a named architecture blocker for
--     the lead/owner — see the worker report for this candidate.
--
-- On an ambiguous live-duplicate phone (a data anomaly the unique contact index should already
-- prevent) this root fails closed with `outcome: 'conflict'` rather than guessing — the same
-- doctrine `app.resolve_public_booking_client_by_phone` (this same cutover) already established
-- for the read-only public-booking sibling ("два живых аккаунта на один телефон — состояние,
-- которое разбирают слиянием, а не догадкой").
CREATE FUNCTION app.pre_session_phone_confirm_resolve(p_phone_normalized text, p_display_name text, p_phone_number_proven boolean, p_confirming_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_count integer;
  v_user_id uuid;
  v_was_created boolean;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_patronymic text;
  v_role text;
  v_session_epoch integer;
  v_is_archived boolean;
  v_contacts jsonb;
  v_confirmed_at timestamptz;
  v_contact_write_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-login.confirm-resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.pre_session_phone_confirm_resolve(text,text,boolean,text)'::regprocedure);

  -- D15b/6 correction: initialized here, AFTER the gate call, never in DECLARE. The exact-gate
  -- verifier (`deploy/postgres/privileges/generate.mjs`'s `preSessionGateVerifierLines`) scans
  -- `prosrc` for `:=`/`DEFAULT` occurring BEFORE `PERFORM app.require_accepted_context(...)` and
  -- refuses to grant EXECUTE on any function where the gate isn't provably the first executable
  -- statement — a `DECLARE v_was_created boolean := false;` default trips that scan even though the
  -- gate genuinely runs first, and the whole `--execute` GRANT transaction rolls back silently.
  v_was_created := false;

  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  -- Same "не догадка" fail-closed rule as `app.resolve_public_booking_client_by_phone`: the unique
  -- contact index should make this impossible for two LIVE (non-merged) holders, so treat it as a
  -- data anomaly, not a pick to resolve silently.
  SELECT count(*), (array_agg(holder.id))[1]
  INTO v_match_count, v_user_id
  FROM public.platform_users AS holder
  JOIN public.user_contacts AS contact ON contact.platform_user_id = holder.id
  WHERE contact.contact_kind = 'phone'
    AND contact.value_normalized = p_phone_normalized
    AND contact.is_primary = true
    AND holder.merged_into_id IS NULL;

  IF v_match_count > 1 THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  v_confirmed_at := CASE WHEN p_phone_number_proven THEN now() ELSE NULL END;

  IF v_match_count = 1 THEN
    -- Existing canonical holder (`pgUserByPhone.createOrBind`'s `phoneRow` branch): the phone is
    -- unchanged, so no `user_phone_history` interval closes/opens — only re-confirm the contact and
    -- refresh the display name exactly like the TypeScript path did (never overwrite a real name).
    UPDATE public.platform_users AS pu
    SET display_name = CASE
          WHEN pu.first_name IS NOT NULL OR pu.last_name IS NOT NULL OR pu.patronymic IS NOT NULL
            THEN pu.display_name
          WHEN p_display_name IS NOT NULL AND btrim(p_display_name) <> '' THEN p_display_name
          ELSE pu.display_name
        END,
        updated_at = now()
    WHERE pu.id = v_user_id;
  ELSE
    v_was_created := true;
    INSERT INTO public.platform_users (display_name, role)
    VALUES (COALESCE(NULLIF(btrim(COALESCE(p_display_name, '')), ''), p_phone_normalized), 'client')
    RETURNING id INTO v_user_id;

    -- New phone assignment: close any (none, for a brand-new row) active interval and open one —
    -- mirrors `applyPlatformUserPhoneHistoryTransition(source: 'otp')`.
    UPDATE public.user_phone_history
    SET valid_to = now()
    WHERE platform_user_id = v_user_id AND valid_to IS NULL;

    INSERT INTO public.user_phone_history (
      platform_user_id, phone_normalized, valid_from, valid_to, source, organization_id, confirming_channel
    ) VALUES (v_user_id, p_phone_normalized, now(), NULL, 'otp', NULL, p_confirming_channel);
  END IF;

  -- `mutateCanonicalUserContacts`'s 'upsert' mutation, inlined verbatim (single kind='phone' call,
  -- `packages/platform-merge/src/userContactsMirrorWrite.ts`) — the one physical writer for
  -- canonical phone/e-mail contacts, reused rather than re-derived.
  WITH existing_value AS MATERIALIZED (
    SELECT id, platform_user_id
    FROM public.user_contacts
    WHERE contact_kind = 'phone' AND value_normalized = p_phone_normalized
    FOR UPDATE
  ), demoted_primary AS (
    UPDATE public.user_contacts
    SET is_primary = false, updated_at = now()
    WHERE platform_user_id = v_user_id
      AND contact_kind = 'phone'
      AND is_primary = true
      AND value_normalized <> p_phone_normalized
      AND NOT EXISTS (SELECT 1 FROM existing_value WHERE platform_user_id <> v_user_id)
    RETURNING id
  ), updated_value AS (
    UPDATE public.user_contacts
    SET is_primary = true,
        confirmed_at = COALESCE(v_confirmed_at, confirmed_at),
        source_origin = 'direct',
        updated_at = now()
    WHERE platform_user_id = v_user_id
      AND contact_kind = 'phone'
      AND value_normalized = p_phone_normalized
      AND (SELECT count(*) FROM demoted_primary) >= 0
    RETURNING id
  ), inserted_value AS (
    INSERT INTO public.user_contacts (
      platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at
    )
    SELECT v_user_id, 'phone', p_phone_normalized, true, v_confirmed_at, 'direct', now()
    WHERE NOT EXISTS (SELECT 1 FROM existing_value)
      AND (SELECT count(*) FROM demoted_primary) >= 0
    RETURNING id
  )
  SELECT count(*) INTO v_contact_write_count
  FROM (SELECT id FROM updated_value UNION ALL SELECT id FROM inserted_value) AS written;

  IF v_contact_write_count = 0 THEN
    -- Same fail-closed shape `mutateCanonicalUserContacts` throws on for its callers: the value is
    -- already owned by a different platform user (raced in between the resolve above and this
    -- write) — a conflict, not a silent pick. If this call just inserted a brand-new row for that
    -- race loser, undo it rather than leaving a contact-less phantom identity behind (same cleanup
    -- shape as `app.email_otp_public_find_or_create_user`'s `unique_violation` handler).
    IF v_was_created THEN
      DELETE FROM public.user_phone_history WHERE platform_user_id = v_user_id;
      DELETE FROM public.user_identity WHERE platform_user_id = v_user_id;
      DELETE FROM public.platform_users WHERE id = v_user_id;
    END IF;
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  -- FIO mirror sync (`syncUserIdentityFioMirror`, inlined verbatim).
  INSERT INTO public.user_identity (
    platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at
  )
  SELECT id, first_name, last_name, patronymic, COALESCE(display_name, ''), birth_date, now()
  FROM public.platform_users
  WHERE id = v_user_id
  ON CONFLICT (platform_user_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    patronymic = EXCLUDED.patronymic,
    display_name = EXCLUDED.display_name,
    birth_date = EXCLUDED.birth_date,
    updated_at = now();

  SELECT holder.role, holder.session_epoch, COALESCE(holder.is_archived, false),
         identity.display_name, identity.first_name, identity.last_name, identity.patronymic
  INTO v_role, v_session_epoch, v_is_archived, v_display_name, v_first_name, v_last_name, v_patronymic
  FROM public.platform_users AS holder
  LEFT JOIN public.user_identity AS identity ON identity.platform_user_id = holder.id
  WHERE holder.id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'contact_kind', contact.contact_kind,
    'value_normalized', contact.value_normalized,
    'is_primary', contact.is_primary,
    'confirmed_at', contact.confirmed_at,
    'source_origin', contact.source_origin
  ) ORDER BY contact.contact_kind, contact.is_primary DESC, contact.created_at, contact.id), '[]'::jsonb)
  INTO v_contacts
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_user_id;

  RETURN jsonb_build_object(
    'outcome', 'resolved',
    'was_created', v_was_created,
    'id', v_user_id,
    'display_name', v_display_name,
    'first_name', v_first_name,
    'last_name', v_last_name,
    'patronymic', v_patronymic,
    'role', v_role,
    'session_epoch', v_session_epoch,
    'is_archived', v_is_archived,
    'contacts', v_contacts,
    'bindings', '[]'::jsonb
  );
END
$function$
;
