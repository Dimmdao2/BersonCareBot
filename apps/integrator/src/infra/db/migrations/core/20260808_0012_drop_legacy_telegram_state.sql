-- Drop the remaining legacy integrator.telegram_state table.
-- Owner decision (09.08.2026): remove the table in full. Dialogue state no longer exists;
-- update dedup belongs to integrator.idempotency_keys; notification flags have no readers.
-- The current channel/delivery fact lives in public.user_channel_bindings. Webapp migration 0384
-- copies the only meaningful negative signal (legacy is_active=false) to bot_blocked_at before this
-- phase-3 migration runs. last_start_at was only legacy /start debounce state and is not preserved.
--
-- Dependency order: this is 0012, after the existing 0010 identities and 0011 users drops.
-- No CASCADE is used. The table's own primary key, outbound FK (when still present), two indexes and
-- row type are declared self-owned objects and leave with the table. Any external FK, view,
-- materialized view, policy, function dependency or user trigger is unexpected and defers the drop.
--
-- Idempotent. A failed preservation invariant or unexpected dependency self-disarms with NOTICE
-- before any object is removed. As with the earlier drop chain, a deferred migration is still
-- recorded in the ledger, so operators must read the migration NOTICE output.

DO $drop_telegram_state$
DECLARE
  v_total bigint;
  v_inactive bigint;
  v_unpreserved_inactive bigint;
  v_unexpected_dependencies text;
BEGIN
  IF to_regclass('integrator.telegram_state') IS NULL THEN
    RAISE NOTICE 'integrator.telegram_state already absent — skip.';
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE NOT is_active)
    INTO v_total, v_inactive
    FROM integrator.telegram_state;

  -- Preservation gate. Active=true is not copied: it is stale legacy state and must never clear a
  -- newer bot_blocked_at. Only inactive rows carry a negative delivery fact that can be lost.
  IF v_inactive > 0 THEN
    IF to_regclass('integrator.identities') IS NULL
       OR to_regclass('public.user_channel_bindings') IS NULL THEN
      RAISE NOTICE 'DROP integrator.telegram_state DEFERRED: % inactive row(s) exist, but identities or user_channel_bindings is absent, so preservation cannot be proven. Nothing was removed.',
        v_inactive;
      RETURN;
    END IF;

    SELECT count(*)
      INTO v_unpreserved_inactive
      FROM integrator.telegram_state state
      LEFT JOIN integrator.identities identity ON identity.id = state.identity_id
      LEFT JOIN public.user_channel_bindings binding
        ON binding.channel_code = identity.resource
       AND binding.external_id = identity.external_id
     WHERE NOT state.is_active
       AND binding.bot_blocked_at IS NULL;

    IF v_unpreserved_inactive > 0 THEN
      RAISE NOTICE 'DROP integrator.telegram_state DEFERRED: % of % inactive row(s) are not represented by a blocked public.user_channel_bindings row. Run/fix the webapp carry-over migration first. Nothing was removed.',
        v_unpreserved_inactive, v_inactive;
      RETURN;
    END IF;
  END IF;

  WITH unexpected AS (
    SELECT format('incoming FK %s ON %s', constraint_row.conname, constraint_row.conrelid::regclass) AS object_name
      FROM pg_constraint constraint_row
     WHERE constraint_row.contype = 'f'
       AND constraint_row.confrelid = 'integrator.telegram_state'::regclass
       AND constraint_row.conrelid <> 'integrator.telegram_state'::regclass
    UNION ALL
    SELECT format('view dependency %s', rewrite_row.ev_class::regclass)
      FROM pg_depend dependency
      JOIN pg_rewrite rewrite_row ON rewrite_row.oid = dependency.objid
     WHERE dependency.classid = 'pg_rewrite'::regclass
       AND dependency.refobjid = 'integrator.telegram_state'::regclass
       AND rewrite_row.ev_class <> 'integrator.telegram_state'::regclass
    UNION ALL
    SELECT format('policy dependency %s ON %s', policy_row.polname, policy_row.polrelid::regclass)
      FROM pg_depend dependency
      JOIN pg_policy policy_row ON policy_row.oid = dependency.objid
     WHERE dependency.classid = 'pg_policy'::regclass
       AND dependency.refobjid = 'integrator.telegram_state'::regclass
       AND policy_row.polrelid <> 'integrator.telegram_state'::regclass
    UNION ALL
    SELECT format('function dependency %s', procedure_row.oid::regprocedure)
      FROM pg_depend dependency
      JOIN pg_proc procedure_row ON procedure_row.oid = dependency.objid
     WHERE dependency.classid = 'pg_proc'::regclass
       AND dependency.refobjid = 'integrator.telegram_state'::regclass
    UNION ALL
    SELECT format('own policy %s', policy_row.polname)
      FROM pg_policy policy_row
     WHERE policy_row.polrelid = 'integrator.telegram_state'::regclass
    UNION ALL
    SELECT format('user trigger %s', trigger_row.tgname)
      FROM pg_trigger trigger_row
     WHERE trigger_row.tgrelid = 'integrator.telegram_state'::regclass
       AND NOT trigger_row.tgisinternal
  )
  SELECT string_agg(DISTINCT object_name, ', ' ORDER BY object_name)
    INTO v_unexpected_dependencies
    FROM unexpected;

  IF v_unexpected_dependencies IS NOT NULL THEN
    RAISE NOTICE 'DROP integrator.telegram_state DEFERRED: undeclared dependents found (%). CASCADE is forbidden; nothing was removed.',
      v_unexpected_dependencies;
    RETURN;
  END IF;

  DROP TABLE integrator.telegram_state;
  RAISE NOTICE 'integrator.telegram_state dropped without CASCADE (rows: %, inactive legacy rows preserved before drop: %).',
    v_total, v_inactive;
END
$drop_telegram_state$;
