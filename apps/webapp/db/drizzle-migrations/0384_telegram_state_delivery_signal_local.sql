-- 0384: preserve the only live delivery signal from integrator.telegram_state before that legacy
-- table is removed. The lead assigns the final number at land; this migration has been applied to
-- DEV under 0384, so the DEV ledger must be reconciled deliberately if the filename changes.
-- TEMPORARY LOCAL MIGRATION NUMBER 0384 (AGENTS.md "Миграции").
--
-- Owner decision (09.08.2026): telegram_state is dropped in full. Dialogue state is gone; update
-- dedup belongs to the universal integrator.idempotency_keys mechanism. The surviving fact is that
-- a person has a writable channel, and that belongs to public.user_channel_bindings.
--
-- Mapping:
--   * a binding row is the positive channel fact;
--   * user_channel_bindings.bot_blocked_at is the current negative delivery fact and is maintained
--     by the delivery worker;
--   * telegram_state.is_active=false (legacy "unsubscribed/blocked") is copied only in the safe
--     direction: it may block a still-unblocked binding, but stale is_active=true never unblocks one;
--   * last_start_at is deliberately not copied. It was written only by the legacy three-second
--     /start debounce. Durable duplicate protection already lives in integrator.idempotency_keys.
--
-- The migration runs in phase 2, before the phase-3 integrator drop chain. On DEV, where
-- integrator.identities was already removed by the earlier chain, it may safely self-disarm only
-- when there are zero inactive rows to carry. Any inactive row without an exact binding mapping
-- makes the migration self-disarm before writing anything.

DO $carry_telegram_state_delivery_signal$
DECLARE
  v_total bigint;
  v_inactive bigint;
  v_with_last_start bigint;
  v_unmapped_inactive bigint;
  v_blocked bigint;
BEGIN
  IF to_regclass('integrator.telegram_state') IS NULL THEN
    RAISE NOTICE '0384: integrator.telegram_state already absent — no legacy delivery signal to carry.';
    RETURN;
  END IF;

  IF to_regclass('public.user_channel_bindings') IS NULL THEN
    RAISE NOTICE '0384 DEFERRED: public.user_channel_bindings is absent; no legacy state was changed.';
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE NOT is_active),
         count(*) FILTER (WHERE last_start_at IS NOT NULL)
    INTO v_total, v_inactive, v_with_last_start
    FROM integrator.telegram_state;

  IF to_regclass('integrator.identities') IS NULL THEN
    IF v_inactive > 0 THEN
      RAISE NOTICE '0384 DEFERRED: integrator.identities is absent while telegram_state has % inactive row(s); exact channel mapping is unavailable, so no legacy state was changed.',
        v_inactive;
      RETURN;
    END IF;

    RAISE NOTICE '0384: identities already absent; telegram_state has % row(s), zero inactive rows and % legacy /start debounce timestamp(s). Positive delivery state already lives in user_channel_bindings; no data change is required.',
      v_total, v_with_last_start;
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_unmapped_inactive
    FROM integrator.telegram_state state
    LEFT JOIN integrator.identities identity ON identity.id = state.identity_id
    LEFT JOIN public.user_channel_bindings binding
      ON binding.channel_code = identity.resource
     AND binding.external_id = identity.external_id
   WHERE NOT state.is_active
     AND binding.user_id IS NULL;

  IF v_unmapped_inactive > 0 THEN
    RAISE NOTICE '0384 DEFERRED: % inactive telegram_state row(s) have no exact public.user_channel_bindings target; no legacy state was changed.',
      v_unmapped_inactive;
    RETURN;
  END IF;

  WITH blocked AS (
    UPDATE public.user_channel_bindings binding
       SET bot_blocked_at = COALESCE(binding.bot_blocked_at, state.updated_at, now()),
           bot_blocked_reason = COALESCE(
             binding.bot_blocked_reason,
             'legacy_telegram_state_inactive'
           )
      FROM integrator.telegram_state state
      JOIN integrator.identities identity ON identity.id = state.identity_id
     WHERE NOT state.is_active
       AND binding.channel_code = identity.resource
       AND binding.external_id = identity.external_id
       AND binding.bot_blocked_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_blocked FROM blocked;

  RAISE NOTICE '0384: checked % telegram_state row(s); % inactive row(s) all had exact bindings; newly marked blocked: %. % last_start_at value(s) were legacy debounce state and were not copied.',
    v_total, v_inactive, v_blocked, v_with_last_start;
END
$carry_telegram_state_delivery_signal$;
