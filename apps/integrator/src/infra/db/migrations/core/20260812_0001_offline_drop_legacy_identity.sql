-- Atomic offline cutover for the retired messenger identity store.
-- Services are stopped for the whole TEST/PROD database cutover. This migration is intentionally
-- fail-loud: it never self-defers and never uses CASCADE.
--
-- Required drop order from the owner decision:
--   telegram_state -> message_drafts (the retired dialogue payload) -> identities -> users.
-- The migration runner wraps this file and its ledger insert in one transaction.

DO $offline_drop_legacy_identity$
DECLARE
  v_stub_users bigint := 0;
  v_inserted_bindings bigint := 0;
  v_unsupported_identities bigint := 0;
  v_unmapped_identities bigint := 0;
  v_unmappable_state_facts bigint := 0;
  v_unexpected_identity_fk text;
  v_unexpected_user_fk text;
BEGIN
  IF to_regclass('public.platform_users') IS NULL
     OR to_regclass('public.user_channel_bindings') IS NULL THEN
    RAISE EXCEPTION 'offline legacy identity cut requires public platform users and channel bindings';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_attribute
     WHERE attrelid = 'public.user_channel_bindings'::regclass
       AND attname IN ('display_handle', 'bot_blocked_at', 'bot_blocked_reason')
       AND attnum > 0
       AND NOT attisdropped
     GROUP BY attrelid
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'offline legacy identity cut requires canonical channel fact columns';
  END IF;

  IF to_regclass('integrator.identities') IS NOT NULL THEN
    SELECT count(*)
      INTO v_unsupported_identities
      FROM integrator.identities identity_row
     WHERE identity_row.resource NOT IN ('telegram', 'max', 'vk');

    IF v_unsupported_identities > 0 THEN
      RAISE EXCEPTION 'offline legacy identity cut found % identities with unsupported channel code',
        v_unsupported_identities;
    END IF;

    -- A historical channel identity that never became a webapp account is preserved as a minimal
    -- client stub. This does not issue credentials; it only gives the canonical binding a UUID owner.
    WITH inserted AS (
      INSERT INTO public.platform_users (
        integrator_user_id,
        display_name,
        first_name,
        last_name,
        role,
        created_at,
        updated_at
      )
      SELECT identity_row.user_id,
             '',
             NULL,
             NULL,
             'client',
             identity_row.created_at,
             identity_row.updated_at
        FROM integrator.identities identity_row
       WHERE identity_row.resource IN ('telegram', 'max', 'vk')
         AND NOT EXISTS (
           SELECT 1
             FROM public.user_channel_bindings binding
            WHERE binding.channel_code = identity_row.resource
              AND binding.external_id = identity_row.external_id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.platform_users user_row
            WHERE user_row.integrator_user_id = identity_row.user_id
              AND user_row.merged_into_id IS NULL
         )
      ON CONFLICT (integrator_user_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_stub_users FROM inserted;

    WITH inserted AS (
      INSERT INTO public.user_channel_bindings (
        user_id,
        channel_code,
        external_id,
        display_handle,
        created_at
      )
      SELECT user_row.id,
             identity_row.resource,
             identity_row.external_id,
             NULL,
             identity_row.created_at
        FROM integrator.identities identity_row
        JOIN public.platform_users legacy_user_row
          ON legacy_user_row.integrator_user_id = identity_row.user_id
        JOIN public.platform_users user_row
          ON user_row.id = COALESCE(legacy_user_row.merged_into_id, legacy_user_row.id)
         AND user_row.merged_into_id IS NULL
       WHERE identity_row.resource IN ('telegram', 'max', 'vk')
      ON CONFLICT (channel_code, external_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_inserted_bindings FROM inserted;

    -- Preserve a handle only when the canonical binding has none; newer webapp data wins.
    IF to_regclass('integrator.telegram_state') IS NOT NULL THEN
      UPDATE public.user_channel_bindings binding
         SET display_handle = NULLIF(
           LEFT(REGEXP_REPLACE(BTRIM(state_row.username), '^@+', ''), 32),
           ''
         )
        FROM integrator.telegram_state state_row
        JOIN integrator.identities identity_row ON identity_row.id = state_row.identity_id
       WHERE binding.channel_code = identity_row.resource
         AND binding.external_id = identity_row.external_id
         AND NULLIF(BTRIM(binding.display_handle), '') IS NULL
         AND NULLIF(REGEXP_REPLACE(BTRIM(state_row.username), '^@+', ''), '') IS NOT NULL;

      -- Legacy active=true never clears a newer block. Only the negative fact is carried forward.
      UPDATE public.user_channel_bindings binding
         SET bot_blocked_at = COALESCE(binding.bot_blocked_at, state_row.updated_at, now()),
             bot_blocked_reason = COALESCE(
               binding.bot_blocked_reason,
               'legacy_telegram_state_inactive'
             )
        FROM integrator.telegram_state state_row
        JOIN integrator.identities identity_row ON identity_row.id = state_row.identity_id
       WHERE NOT state_row.is_active
         AND binding.channel_code = identity_row.resource
         AND binding.external_id = identity_row.external_id
         AND binding.bot_blocked_at IS NULL;
    END IF;

    SELECT count(*)
      INTO v_unmapped_identities
      FROM integrator.identities identity_row
      LEFT JOIN public.user_channel_bindings binding
        ON binding.channel_code = identity_row.resource
       AND binding.external_id = identity_row.external_id
     WHERE identity_row.resource IN ('telegram', 'max', 'vk')
       AND binding.user_id IS NULL;

    IF v_unmapped_identities > 0 THEN
      RAISE EXCEPTION 'offline legacy identity cut found % channel identities without canonical binding',
        v_unmapped_identities;
    END IF;
  ELSIF to_regclass('integrator.telegram_state') IS NOT NULL THEN
    -- A database where an earlier ledgered migration already removed identities can be completed
    -- only when no surviving state row still carries a fact that requires an exact channel target.
    SELECT count(*)
      INTO v_unmappable_state_facts
      FROM integrator.telegram_state state_row
     WHERE NOT state_row.is_active
        OR NULLIF(BTRIM(state_row.username), '') IS NOT NULL
        OR NULLIF(BTRIM(state_row.first_name), '') IS NOT NULL
        OR NULLIF(BTRIM(state_row.last_name), '') IS NOT NULL;

    IF v_unmappable_state_facts > 0 THEN
      RAISE EXCEPTION 'offline legacy identity cut found % state facts after identity map was removed',
        v_unmappable_state_facts;
    END IF;
  END IF;

  IF to_regclass('integrator.identities') IS NOT NULL THEN
    SELECT string_agg(format('%s on %s', fk.conname, fk.conrelid::regclass), ', ')
      INTO v_unexpected_identity_fk
      FROM pg_constraint fk
     WHERE fk.contype = 'f'
       AND fk.confrelid = 'integrator.identities'::regclass
       AND fk.conrelid NOT IN (
         COALESCE(to_regclass('integrator.telegram_state'), 0::oid),
         COALESCE(to_regclass('integrator.message_drafts'), 0::oid),
         'integrator.identities'::regclass
       );

    IF v_unexpected_identity_fk IS NOT NULL THEN
      RAISE EXCEPTION 'offline legacy identity cut found unexpected identity dependency: %',
        v_unexpected_identity_fk;
    END IF;
  END IF;

  IF to_regclass('integrator.users') IS NOT NULL THEN
    SELECT string_agg(format('%s on %s', fk.conname, fk.conrelid::regclass), ', ')
      INTO v_unexpected_user_fk
      FROM pg_constraint fk
     WHERE fk.contype = 'f'
       AND fk.confrelid = 'integrator.users'::regclass
       AND fk.conrelid NOT IN (
         COALESCE(to_regclass('integrator.identities'), 0::oid),
         'integrator.users'::regclass
       );

    IF v_unexpected_user_fk IS NOT NULL THEN
      RAISE EXCEPTION 'offline legacy identity cut found unexpected user dependency: %',
        v_unexpected_user_fk;
    END IF;
  END IF;

  DROP TABLE IF EXISTS integrator.telegram_state;
  DROP TABLE IF EXISTS integrator.message_drafts;
  DROP TABLE IF EXISTS integrator.identities;
  DROP TABLE IF EXISTS integrator.users;

  RAISE NOTICE 'offline legacy identity cut complete: platform stubs %, channel bindings %',
    v_stub_users, v_inserted_bindings;
END
$offline_drop_legacy_identity$;
