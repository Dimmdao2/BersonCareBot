-- 0386: offline retirement of the duplicate appointment projection.
-- public.be_appointments is the only appointment store after this migration.  The cut is
-- deliberately fail-loud and uses no CASCADE: an unresolved clinical link or an unexpected inbound
-- foreign key aborts the whole migration instead of silently discarding a dependency.

DO $migration$
DECLARE
  unexpected_fk text;
  unresolved_links bigint;
  conflicting_links bigint;
BEGIN
  IF to_regclass('public.be_appointments') IS NULL THEN
    RAISE EXCEPTION '0386 requires public.be_appointments';
  END IF;

  IF to_regclass('public.clinical_visit') IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.clinical_visit'::regclass
          AND attname = 'appointment_record_id'
          AND NOT attisdropped
     ) THEN
    IF to_regclass('public.appointment_records') IS NULL THEN
      EXECUTE 'SELECT count(*) FROM public.clinical_visit WHERE appointment_record_id IS NOT NULL'
        INTO unresolved_links;
      IF unresolved_links <> 0 THEN
        RAISE EXCEPTION
          '0386 cannot resolve % clinical_visit legacy links because public.appointment_records is absent',
          unresolved_links;
      END IF;
    ELSE
      SELECT count(*)
        INTO conflicting_links
        FROM public.clinical_visit visit
        JOIN public.appointment_records legacy ON legacy.id = visit.appointment_record_id
        LEFT JOIN public.be_external_entity_mappings mapping
          ON mapping.external_system = 'rubitime'
         AND mapping.entity_type = 'appointment'
         AND mapping.external_id = legacy.integrator_record_id
        LEFT JOIN public.be_appointments direct_appointment
          ON direct_appointment.id = CASE
               WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               THEN substring(legacy.integrator_record_id FROM 4)::uuid
             END
       WHERE visit.appointment_record_id IS NOT NULL
         AND direct_appointment.id IS NOT NULL
         AND mapping.canonical_id IS NOT NULL
         AND direct_appointment.id <> mapping.canonical_id;

      IF conflicting_links <> 0 THEN
        RAISE EXCEPTION
          '0386 found % clinical_visit links with conflicting direct and external canonical appointments',
          conflicting_links;
      END IF;

      SELECT count(*)
        INTO conflicting_links
        FROM public.clinical_visit visit
        JOIN public.appointment_records legacy ON legacy.id = visit.appointment_record_id
        LEFT JOIN public.be_external_entity_mappings mapping
          ON mapping.external_system = 'rubitime'
         AND mapping.entity_type = 'appointment'
         AND mapping.external_id = legacy.integrator_record_id
        LEFT JOIN public.be_appointments mapped_appointment
          ON mapped_appointment.id = mapping.canonical_id
        LEFT JOIN public.be_appointments direct_appointment
          ON direct_appointment.id = CASE
               WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               THEN substring(legacy.integrator_record_id FROM 4)::uuid
             END
       WHERE visit.canonical_appointment_id IS NOT NULL
         AND COALESCE(direct_appointment.id, mapped_appointment.id) IS NOT NULL
         AND visit.canonical_appointment_id <> COALESCE(direct_appointment.id, mapped_appointment.id);

      IF conflicting_links <> 0 THEN
        RAISE EXCEPTION
          '0386 found % clinical_visit links whose existing canonical appointment conflicts with the legacy target',
          conflicting_links;
      END IF;

      SELECT count(*)
        INTO unresolved_links
        FROM public.clinical_visit visit
        JOIN public.appointment_records legacy ON legacy.id = visit.appointment_record_id
        LEFT JOIN public.be_external_entity_mappings mapping
          ON mapping.external_system = 'rubitime'
         AND mapping.entity_type = 'appointment'
         AND mapping.external_id = legacy.integrator_record_id
        LEFT JOIN public.be_appointments mapped_appointment
          ON mapped_appointment.id = mapping.canonical_id
        LEFT JOIN public.be_appointments direct_appointment
          ON direct_appointment.id = CASE
               WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               THEN substring(legacy.integrator_record_id FROM 4)::uuid
             END
       WHERE COALESCE(direct_appointment.id, mapped_appointment.id) IS NULL;

      IF unresolved_links <> 0 THEN
        RAISE EXCEPTION
          '0386 refuses to drop public.appointment_records: % clinical_visit legacy targets are unresolved',
          unresolved_links;
      END IF;

      UPDATE public.clinical_visit visit
         SET canonical_appointment_id = COALESCE(direct_appointment.id, mapped_appointment.id)
        FROM public.appointment_records legacy
        LEFT JOIN public.be_external_entity_mappings mapping
          ON mapping.external_system = 'rubitime'
         AND mapping.entity_type = 'appointment'
         AND mapping.external_id = legacy.integrator_record_id
        LEFT JOIN public.be_appointments mapped_appointment
          ON mapped_appointment.id = mapping.canonical_id
        LEFT JOIN public.be_appointments direct_appointment
          ON direct_appointment.id = CASE
               WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               THEN substring(legacy.integrator_record_id FROM 4)::uuid
             END
       WHERE visit.appointment_record_id = legacy.id
         AND visit.canonical_appointment_id IS NULL
         AND COALESCE(direct_appointment.id, mapped_appointment.id) IS NOT NULL;

    END IF;

    EXECUTE 'ALTER TABLE public.clinical_visit DROP COLUMN appointment_record_id';
  END IF;

  IF to_regclass('public.appointment_records') IS NOT NULL THEN
    SELECT pg_catalog.format('%I.%I:%s', source_ns.nspname, source.relname, constraint_row.conname)
      INTO unexpected_fk
      FROM pg_catalog.pg_constraint constraint_row
      JOIN pg_catalog.pg_class source ON source.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source.relnamespace
     WHERE constraint_row.contype = 'f'
       AND constraint_row.confrelid = 'public.appointment_records'::regclass
     LIMIT 1;

    IF unexpected_fk IS NOT NULL THEN
      RAISE EXCEPTION
        '0386 refuses to drop public.appointment_records; unexpected inbound FK remains: %',
        unexpected_fk;
    END IF;

    DROP TABLE public.appointment_records;
  END IF;
END
$migration$;
