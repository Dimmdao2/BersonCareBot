-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)') IS NOT NULL
--
-- D15b/6 correction (messenger confirm-path): two reachable Telegram/MAX seams still ran full
-- relation transactions under the bootstrap principal after the D15b/6 `/start` and plain-phone
-- `/confirm` repairs closed that gap for the web channel only:
--   - `applyMessengerContactPreOtpImpl` (`pgPhoneMessengerBind.ts`), invoked from the signed
--     integrator webhook `POST /api/integrator/phone-messenger-bind/complete` BEFORE any OTP is
--     sent, to resolve-or-create the canonical holder for a messenger contact and lock the channel
--     binding to it.
--   - `pgUserByPhone.createOrBind`'s messenger-channel branch, invoked from `confirmPhoneAuth` after
--     OTP verification (`POST /api/auth/phone/confirm`'s sibling `POST
--     /api/auth/phone/messenger-bind/finish`), which re-resolves the now-bound channel to refresh the
--     canonical phone contact and mint a session.
-- Both called `runIdentityClientPgText`-style relation SQL directly, and (`pgPhoneMessengerBind.ts`
-- only) never wrote `public.user_contacts` at all for the "channel binding exists, phone unchanged"
-- branch — leaving the canonical phone authority out of sync with the channel-bound holder.
--
-- This root replaces BOTH call sites with one atomic SECURITY DEFINER door, owned by the same
-- `app_seam_identity_lookup_owner` as `app.pre_session_phone_confirm_resolve` — no new seam owner.
-- It is keyed by the CHANNEL BINDING (not just the phone), so it never needs
-- `app.pre_session_phone_confirm_resolve`'s doctrine applied blindly to a channel-bound holder: doing
-- that would ignore the existing binding and risk creating a duplicate identity for an already-known
-- messenger contact.
--
-- Scope: resolve-or-create the ONE unambiguous canonical holder for a (channel, external_id, phone)
-- triple (and, for `profile_bind`, an already-authenticated `p_session_user_id`), atomically writing
-- the canonical phone contact, phone history, channel binding and broadcast defaults — the same
-- writers `app.pre_session_phone_confirm_resolve` already inlines, reused verbatim, not re-derived.
-- When the channel-binding owner, the phone owner and (for `profile_bind`) the session owner are NOT
-- all the same canonical holder, this root does not guess and does not attempt the merge decision:
-- `mergePlatformUsersInTransaction`/`applyMessengerPhonePublicBind` (`packages/platform-merge`, ~1.6k
-- lines) cannot run under the bootstrap principal (no tenant/medical relation access, by the owner's
-- 11.08.2026 pre-session decision) and this root does not duplicate that algorithm in SQL. It fails
-- closed with `outcome: 'conflict'` and the candidate ids instead — same "не догадка" doctrine
-- `app.pre_session_phone_confirm_resolve`/`app.resolve_public_booking_client_by_phone` already
-- established — and the caller already routes a `conflict` outcome to the existing manual-merge
-- review path (`recordMessengerBindBlocked` → `admin_audit_log`).
--
-- Trusted messenger provenance (brief D15b/6, "Preserve trusted messenger provenance"): unlike
-- `app.pre_session_phone_confirm_resolve`'s `p_phone_number_proven` gate, this root always confirms
-- the phone contact it writes. A messenger contact reaching this seam already went through the bot's
-- own contact-share attestation before OTP is ever sent — the existing (pre-D15b/6) TypeScript path
-- (`applyPlatformUserPhoneHistoryTransition`'s unconditional `confirmedAt: new Date().toISOString()`)
-- already treated that provenance as sufficient; this root preserves that, it does not introduce it.
CREATE FUNCTION app.pre_session_messenger_channel_resolve(p_channel_code text, p_external_id text, p_phone_normalized text, p_display_name text, p_confirming_channel text, p_session_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_binding_owner_id uuid;
  v_phone_match_count integer;
  v_phone_owner_id uuid;
  v_session_owner_id uuid;
  v_candidate_ids uuid[];
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
  v_bindings jsonb;
  v_contact_write_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.messenger-login.channel-resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($6))::app.port_typed_arg]), 'app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)'::regprocedure);

  v_was_created := false;

  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;
  IF p_channel_code IS NULL OR p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  -- Existing channel-binding owner, if any (canonical, non-merged holder only — a binding still
  -- pointing at an already-merged row is a data anomaly a merge transaction should have re-pointed;
  -- treated here as "no usable binding" rather than guessed at).
  SELECT binding_owner.id INTO v_binding_owner_id
  FROM public.user_channel_bindings AS binding
  JOIN public.platform_users AS binding_owner
    ON binding_owner.id = binding.user_id AND binding_owner.merged_into_id IS NULL
  WHERE binding.channel_code = p_channel_code AND binding.external_id = p_external_id;

  -- Same "не догадка" fail-closed rule as `app.pre_session_phone_confirm_resolve`: two live
  -- (non-merged) holders for one phone is a data anomaly the unique contact index should already
  -- prevent, not a pick to resolve silently.
  SELECT count(*), (array_agg(holder.id))[1]
  INTO v_phone_match_count, v_phone_owner_id
  FROM public.platform_users AS holder
  JOIN public.user_contacts AS contact ON contact.platform_user_id = holder.id
  WHERE contact.contact_kind = 'phone'
    AND contact.value_normalized = p_phone_normalized
    AND contact.is_primary = true
    AND holder.merged_into_id IS NULL;

  IF v_phone_match_count > 1 THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  IF p_session_user_id IS NOT NULL THEN
    SELECT pu.merged_into_id INTO v_session_owner_id
    FROM public.platform_users AS pu
    WHERE pu.id = p_session_user_id;
    IF v_session_owner_id IS NULL THEN
      v_session_owner_id := p_session_user_id;
    END IF;
  END IF;

  SELECT array_agg(DISTINCT candidate.id) INTO v_candidate_ids
  FROM (
    SELECT v_binding_owner_id AS id WHERE v_binding_owner_id IS NOT NULL
    UNION
    SELECT v_phone_owner_id WHERE v_phone_owner_id IS NOT NULL
    UNION
    SELECT v_session_owner_id WHERE v_session_owner_id IS NOT NULL
  ) AS candidate;

  IF array_length(v_candidate_ids, 1) > 1 THEN
    -- Channel owner, phone owner and/or session owner disagree: a real merge decision, not this
    -- root's job (see header). Fail closed with the candidates for the existing manual-merge path.
    RETURN jsonb_build_object('outcome', 'conflict', 'candidate_ids', to_jsonb(v_candidate_ids));
  END IF;

  IF array_length(v_candidate_ids, 1) = 1 THEN
    v_user_id := v_candidate_ids[1];
  ELSIF p_session_user_id IS NOT NULL THEN
    -- Unreachable in practice (a given session id always resolves to a candidate above), but a
    -- `profile_bind` call must never invent a NEW identity for an already-authenticated principal.
    RETURN jsonb_build_object('outcome', 'conflict');
  ELSE
    v_was_created := true;
    INSERT INTO public.platform_users (display_name, role)
    VALUES (COALESCE(NULLIF(btrim(COALESCE(p_display_name, '')), ''), p_phone_normalized), 'client')
    RETURNING id INTO v_user_id;
  END IF;

  -- Phone newly assigned to the resolved holder (new user, or an existing channel/session holder
  -- that did not already own this phone) — mirrors `applyPlatformUserPhoneHistoryTransition(source:
  -- 'messenger')`. When `v_phone_owner_id` is already this same holder, the phone is unchanged: no
  -- interval closes/opens, exactly like the relation-based code this replaces.
  IF v_phone_owner_id IS NULL THEN
    UPDATE public.user_phone_history
    SET valid_to = now()
    WHERE platform_user_id = v_user_id AND valid_to IS NULL;

    INSERT INTO public.user_phone_history (
      platform_user_id, phone_normalized, valid_from, valid_to, source, organization_id, confirming_channel
    ) VALUES (v_user_id, p_phone_normalized, now(), NULL, 'messenger', NULL, p_confirming_channel);
  END IF;

  -- `mutateCanonicalUserContacts`'s 'upsert' mutation, inlined verbatim (single kind='phone' call,
  -- `packages/platform-merge/src/userContactsMirrorWrite.ts`), same block
  -- `app.pre_session_phone_confirm_resolve` already inlines — reused, not re-derived. `confirmed_at`
  -- is always set (see header: trusted messenger provenance), matching the pre-D15b/6 TypeScript
  -- path's unconditional `markPatientPhoneTrusted` call on every one of this root's call sites.
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
        confirmed_at = now(),
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
    SELECT v_user_id, 'phone', p_phone_normalized, true, now(), 'direct', now()
    WHERE NOT EXISTS (SELECT 1 FROM existing_value)
      AND (SELECT count(*) FROM demoted_primary) >= 0
    RETURNING id
  )
  SELECT count(*) INTO v_contact_write_count
  FROM (SELECT id FROM updated_value UNION ALL SELECT id FROM inserted_value) AS written;

  IF v_contact_write_count = 0 THEN
    -- Same fail-closed shape `app.pre_session_phone_confirm_resolve` uses: the value raced onto a
    -- different platform user in between the resolve above and this write. Undo a just-inserted
    -- phantom row rather than leaving one behind.
    IF v_was_created THEN
      DELETE FROM public.user_phone_history WHERE platform_user_id = v_user_id;
      DELETE FROM public.user_identity WHERE platform_user_id = v_user_id;
      DELETE FROM public.platform_users WHERE id = v_user_id;
    END IF;
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  -- FIO mirror sync (`syncUserIdentityFioMirror`, inlined verbatim) — idempotent, always run like
  -- `app.pre_session_phone_confirm_resolve` does.
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

  -- Display-name refresh for an EXISTING holder only (a newly created row already got its display
  -- name at INSERT time above) — same CASE `app.pre_session_phone_confirm_resolve` uses, never
  -- overwrite a real name.
  IF NOT v_was_created THEN
    UPDATE public.platform_users AS pu
    SET display_name = CASE
          WHEN pu.first_name IS NOT NULL OR pu.last_name IS NOT NULL OR pu.patronymic IS NOT NULL
            THEN pu.display_name
          WHEN p_display_name IS NOT NULL AND btrim(p_display_name) <> '' THEN p_display_name
          ELSE pu.display_name
        END,
        updated_at = now()
    WHERE pu.id = v_user_id;
  END IF;

  INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
  VALUES (v_user_id, p_channel_code, p_external_id)
  ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id;

  -- `upsertBroadcastDefaultsAfterChannelBind`, inlined verbatim (`LINK_CHANNELS` set) — explicit
  -- messages/notifications opt-in for a freshly (re)bound delivery channel.
  IF p_channel_code = ANY (ARRAY['telegram', 'max', 'sms']) THEN
    INSERT INTO public.user_channel_preferences (
      user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at
    )
    VALUES (v_user_id::text, v_user_id, p_channel_code, true, true, now())
    ON CONFLICT (user_id, channel_code) DO UPDATE SET
      platform_user_id = COALESCE(public.user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
      is_enabled_for_messages = true,
      is_enabled_for_notifications = true,
      updated_at = EXCLUDED.updated_at;
  END IF;

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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channel_code', binding.channel_code,
    'external_id', binding.external_id
  ) ORDER BY binding.channel_code), '[]'::jsonb)
  INTO v_bindings
  FROM public.user_channel_bindings AS binding
  WHERE binding.user_id = v_user_id;

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
    'bindings', v_bindings
  );
END
$function$
;
