-- Retire two duplicate tables only after proving their canonical copies are complete.
-- No CASCADE: an unexpected dependency aborts the whole migration.

DO $drop_duplicate_appointment_events$
DECLARE
  unmatched_count bigint;
  inbound_dependency text;
BEGIN
  IF to_regclass('public.be_appointment_events') IS NOT NULL THEN
    SELECT count(*)
      INTO unmatched_count
      FROM public.be_appointment_events legacy_event
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.be_appointment_history_events canonical_event
        WHERE canonical_event.organization_id = legacy_event.organization_id
          AND canonical_event.appointment_id = legacy_event.appointment_id
          AND canonical_event.event_type = legacy_event.event_type
          AND canonical_event.actor_id IS NOT DISTINCT FROM legacy_event.actor_id
          AND canonical_event.payload = legacy_event.payload
          AND canonical_event.created_at = legacy_event.created_at
     );

    IF unmatched_count > 0 THEN
      RAISE EXCEPTION
        '0389 refuses to drop public.be_appointment_events: % rows are absent from canonical history',
        unmatched_count;
    END IF;

    SELECT pg_catalog.format('%I.%I:%I', source_ns.nspname, source.relname, constraint_row.conname)
      INTO inbound_dependency
      FROM pg_catalog.pg_constraint constraint_row
      JOIN pg_catalog.pg_class source ON source.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source.relnamespace
     WHERE constraint_row.contype = 'f'
       AND constraint_row.confrelid = 'public.be_appointment_events'::regclass
     LIMIT 1;

    IF inbound_dependency IS NOT NULL THEN
      RAISE EXCEPTION
        '0389 refuses to drop public.be_appointment_events: unexpected inbound FK %',
        inbound_dependency;
    END IF;

    DROP TABLE public.be_appointment_events;
  END IF;
END
$drop_duplicate_appointment_events$;

DO $drop_legacy_public_migration_ledger$
DECLARE
  unmatched_count bigint;
  inbound_dependency text;
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    SELECT count(*)
      INTO unmatched_count
      FROM public.schema_migrations legacy_migration
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.webapp_schema_migrations canonical_migration
        WHERE canonical_migration.filename = legacy_migration.filename
     );

    IF unmatched_count > 0 THEN
      RAISE EXCEPTION
        '0389 refuses to drop public.schema_migrations: % rows are absent from canonical ledger',
        unmatched_count;
    END IF;

    SELECT pg_catalog.format('%I.%I:%I', source_ns.nspname, source.relname, constraint_row.conname)
      INTO inbound_dependency
      FROM pg_catalog.pg_constraint constraint_row
      JOIN pg_catalog.pg_class source ON source.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source.relnamespace
     WHERE constraint_row.contype = 'f'
       AND constraint_row.confrelid = 'public.schema_migrations'::regclass
     LIMIT 1;

    IF inbound_dependency IS NOT NULL THEN
      RAISE EXCEPTION
        '0389 refuses to drop public.schema_migrations: unexpected inbound FK %',
        inbound_dependency;
    END IF;

    DROP TABLE public.schema_migrations;
  END IF;
END
$drop_legacy_public_migration_ledger$;
