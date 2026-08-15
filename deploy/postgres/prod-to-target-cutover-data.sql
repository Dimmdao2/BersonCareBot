\set ON_ERROR_STOP on

-- Copy every surviving relation by its exact common columns. Tables that gained required columns
-- are handled explicitly below. The target schema is still in its pre-data section, so foreign keys,
-- policies and triggers are installed only after the copy.
DO $copy_common_tables$
DECLARE
  relation record;
  source_schema text;
  columns_sql text;
  target_columns_sql text;
  select_columns_sql text;
  inject_organization boolean;
BEGIN
  FOR relation IN
    SELECT namespace.nspname AS schema_name, class.relname AS table_name
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname IN ('public', 'integrator', 'drizzle')
      AND class.relkind IN ('r', 'p')
      AND (namespace.nspname, class.relname) NOT IN (
        ('integrator', 'user_reminder_occurrences'),
        ('integrator', 'user_reminder_delivery_logs'),
        ('public', 'reference_categories'),
        ('public', 'reference_items'),
        ('drizzle', '__drizzle_migrations'),
        ('integrator', 'schema_migrations')
      )
    ORDER BY namespace.nspname, class.relname
  LOOP
    source_schema := CASE relation.schema_name
      WHEN 'public' THEN 'cutover_source_public'
      WHEN 'integrator' THEN 'cutover_source_integrator'
      WHEN 'drizzle' THEN 'cutover_source_drizzle'
    END;

    IF to_regclass(format('%I.%I', source_schema, relation.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(target_attribute.attname), ', ' ORDER BY target_attribute.attnum)
    INTO columns_sql
    FROM pg_attribute target_attribute
    JOIN pg_class target_class ON target_class.oid = target_attribute.attrelid
    JOIN pg_namespace target_namespace ON target_namespace.oid = target_class.relnamespace
    JOIN pg_class source_class
      ON source_class.relname = target_class.relname
    JOIN pg_namespace source_namespace
      ON source_namespace.oid = source_class.relnamespace
     AND source_namespace.nspname = source_schema
    JOIN pg_attribute source_attribute
      ON source_attribute.attrelid = source_class.oid
     AND source_attribute.attname = target_attribute.attname
     AND source_attribute.atttypid = target_attribute.atttypid
     AND source_attribute.attnum > 0
     AND NOT source_attribute.attisdropped
    WHERE target_namespace.nspname = relation.schema_name
      AND target_class.relname = relation.table_name
      AND target_attribute.attnum > 0
      AND NOT target_attribute.attisdropped
      AND target_attribute.attgenerated = '';

    IF columns_sql IS NULL THEN
      CONTINUE;
    END IF;

    SELECT
      EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        WHERE attribute.attrelid = format('%I.%I', relation.schema_name, relation.table_name)::regclass
          AND attribute.attname = 'organization_id'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        WHERE attribute.attrelid = format('%I.%I', source_schema, relation.table_name)::regclass
          AND attribute.attname = 'organization_id'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
      AND relation.table_name NOT IN (
        'admin_audit_log',
        'operator_health_failure_archive',
        'operator_incidents',
        'system_settings',
        'system_settings_audit'
      )
    INTO inject_organization;

    target_columns_sql := columns_sql;
    select_columns_sql := columns_sql;
    IF inject_organization THEN
      target_columns_sql := target_columns_sql || ', organization_id';
      select_columns_sql := select_columns_sql || format(
        ', %L::uuid',
        current_setting('bcb.cutover.canonical_organization_id')
      );
    END IF;

    EXECUTE format(
      'INSERT INTO %I.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM %I.%I',
      relation.schema_name,
      relation.table_name,
      target_columns_sql,
      select_columns_sql,
      source_schema,
      relation.table_name
    );
  END LOOP;
END
$copy_common_tables$;

-- Required tenant columns added after the source snapshot.
INSERT INTO public.reference_categories (
  id, code, title, is_user_extensible, owner_id, tenant_id, created_at, organization_id
)
SELECT id, code, title, is_user_extensible, owner_id, tenant_id, created_at,
       :'canonical_organization_id'::uuid
FROM cutover_source_public.reference_categories;

INSERT INTO public.reference_items (
  id, category_id, code, title, sort_order, is_active, meta_json, created_at,
  deleted_at, organization_id
)
SELECT id, category_id, code, title, sort_order, is_active, meta_json, created_at,
       deleted_at, :'canonical_organization_id'::uuid
FROM cutover_source_public.reference_items;

UPDATE public.reminder_rules
SET organization_id = :'canonical_organization_id'::uuid
WHERE organization_id IS NULL;

INSERT INTO integrator.user_reminder_occurrences (
  id, rule_id, occurrence_key, planned_at, status, queued_at, sent_at, failed_at,
  delivery_channel, delivery_job_id, error_code, created_at, updated_at,
  organization_id, platform_user_id, delivery_generation
)
SELECT
  occurrence.id,
  occurrence.rule_id,
  occurrence.occurrence_key,
  occurrence.planned_at,
  occurrence.status,
  occurrence.queued_at,
  occurrence.sent_at,
  occurrence.failed_at,
  occurrence.delivery_channel,
  occurrence.delivery_job_id,
  occurrence.error_code,
  occurrence.created_at,
  occurrence.updated_at,
  :'canonical_organization_id'::uuid,
  rule.platform_user_id,
  0
FROM cutover_source_integrator.user_reminder_occurrences occurrence
JOIN public.reminder_rules rule ON rule.integrator_rule_id = occurrence.rule_id;

-- Preserve the still actionable web-push rows from the retired parallel occurrence table.
INSERT INTO integrator.user_reminder_occurrences (
  id, rule_id, occurrence_key, planned_at, status, sent_at, failed_at, error_code,
  created_at, updated_at, organization_id, platform_user_id, delivery_generation
)
SELECT
  legacy.id::text,
  legacy.integrator_rule_id,
  legacy.occurrence_key,
  legacy.planned_at,
  legacy.status,
  legacy.sent_at,
  legacy.failed_at,
  legacy.error_code,
  legacy.created_at,
  legacy.updated_at,
  :'canonical_organization_id'::uuid,
  legacy.platform_user_id,
  0
FROM cutover_source_public.webapp_reminder_occurrences legacy
JOIN public.reminder_rules rule
  ON rule.integrator_rule_id = legacy.integrator_rule_id
 AND rule.platform_user_id = legacy.platform_user_id
WHERE legacy.status IN ('planned', 'queued')
  AND legacy.planned_at >= statement_timestamp() - interval '3 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM integrator.user_reminder_occurrences existing
    WHERE existing.occurrence_key = legacy.occurrence_key
  );

INSERT INTO integrator.user_reminder_delivery_logs (
  id, occurrence_id, channel, status, error_code, payload_json, created_at, organization_id
)
SELECT
  delivery.id,
  delivery.occurrence_id,
  delivery.channel,
  delivery.status,
  delivery.error_code,
  delivery.payload_json,
  delivery.created_at,
  occurrence.organization_id
FROM cutover_source_integrator.user_reminder_delivery_logs delivery
JOIN integrator.user_reminder_occurrences occurrence ON occurrence.id = delivery.occurrence_id;

-- Calendar sync memory follows the canonical appointment mapping. Unmapped stale provider rows
-- have no surviving appointment and are intentionally not copied.
INSERT INTO public.booking_calendar_map (
  appointment_key, gcal_event_id, created_at, updated_at
)
SELECT DISTINCT ON (appointment.id)
  'be:' || appointment.id::text,
  legacy.gcal_event_id,
  legacy.created_at,
  legacy.updated_at
FROM cutover_source_integrator.booking_calendar_map legacy
LEFT JOIN public.be_external_entity_mappings mapping
  ON mapping.external_system = 'rubitime'
 AND mapping.entity_type = 'appointment'
 AND mapping.external_id = legacy.rubitime_record_id
JOIN public.be_appointments appointment
  ON appointment.id = COALESCE(
    mapping.canonical_id,
    CASE
      WHEN legacy.rubitime_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN substring(legacy.rubitime_record_id FROM 4)::uuid
    END
  )
ORDER BY appointment.id, legacy.updated_at DESC;

-- The one surviving clinical link is resolved through the same appointment mapping.
UPDATE public.clinical_visit target
SET canonical_appointment_id = COALESCE(
      mapping.canonical_id,
      CASE
        WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN substring(legacy.integrator_record_id FROM 4)::uuid
      END
    ),
    organization_id = :'canonical_organization_id'::uuid
FROM cutover_source_public.clinical_visit source_visit
JOIN cutover_source_public.appointment_records legacy
  ON legacy.id = source_visit.appointment_record_id
LEFT JOIN public.be_external_entity_mappings mapping
  ON mapping.external_system = 'rubitime'
 AND mapping.entity_type = 'appointment'
 AND mapping.external_id = legacy.integrator_record_id
WHERE target.id = source_visit.id
  AND source_visit.appointment_record_id IS NOT NULL;

-- Backfill every newly added organization_id for legacy one-tenant business rows. Global settings,
-- platform/operator audit and system configuration deliberately remain global (NULL organization).
DO $legacy_organization_scope$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT target_namespace.nspname AS schema_name, target_class.relname AS table_name
    FROM pg_class target_class
    JOIN pg_namespace target_namespace ON target_namespace.oid = target_class.relnamespace
    JOIN pg_attribute target_attribute
      ON target_attribute.attrelid = target_class.oid
     AND target_attribute.attname = 'organization_id'
     AND target_attribute.attnum > 0
     AND NOT target_attribute.attisdropped
    JOIN pg_class source_class ON source_class.relname = target_class.relname
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_class.relnamespace
    LEFT JOIN pg_attribute source_attribute
      ON source_attribute.attrelid = source_class.oid
     AND source_attribute.attname = 'organization_id'
     AND source_attribute.attnum > 0
     AND NOT source_attribute.attisdropped
    WHERE target_namespace.nspname = 'public'
      AND source_namespace.nspname = 'cutover_source_public'
      AND source_attribute.attname IS NULL
      AND target_class.relname NOT IN (
        'admin_audit_log',
        'operator_health_failure_archive',
        'operator_incidents',
        'system_settings',
        'system_settings_audit'
      )
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET organization_id = $1 WHERE organization_id IS NULL',
      relation.schema_name,
      relation.table_name
    ) USING current_setting('bcb.cutover.canonical_organization_id')::uuid;
  END LOOP;
END
$legacy_organization_scope$;

-- The separated identity profile is derived from the already owner-reviewed platform users.
INSERT INTO public.user_identity (
  platform_user_id, first_name, last_name, patronymic, display_name, birth_date,
  created_at, updated_at
)
SELECT
  user_row.id,
  user_row.first_name,
  user_row.last_name,
  user_row.patronymic,
  COALESCE(user_row.display_name, ''),
  user_row.birth_date,
  user_row.created_at,
  user_row.updated_at
FROM public.platform_users user_row
WHERE user_row.merged_into_id IS NULL
;

INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at,
  source_origin, created_at, updated_at
)
SELECT
  user_row.id,
  'phone',
  user_row.phone_normalized,
  true,
  user_row.patient_phone_trust_at,
  'platform_users',
  user_row.created_at,
  user_row.updated_at
FROM public.platform_users user_row
WHERE user_row.merged_into_id IS NULL
  AND user_row.phone_normalized IS NOT NULL
;

INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at,
  source_origin, created_at, updated_at
)
SELECT
  user_row.id,
  'email',
  user_row.email_normalized,
  true,
  user_row.email_verified_at,
  'platform_users',
  user_row.created_at,
  user_row.updated_at
FROM public.platform_users user_row
WHERE user_row.merged_into_id IS NULL
  AND user_row.email_normalized IS NOT NULL
;

-- Preserve current channel display/block facts before the legacy identity tables disappear.
UPDATE public.user_channel_bindings binding
SET display_handle = NULLIF(
      left(regexp_replace(btrim(state_row.username), '^@+', ''), 32),
      ''
    )
FROM cutover_source_integrator.telegram_state state_row
JOIN cutover_source_integrator.identities identity_row ON identity_row.id = state_row.identity_id
WHERE binding.channel_code = identity_row.resource
  AND binding.external_id = identity_row.external_id
  AND binding.display_handle IS NULL
  AND NULLIF(btrim(state_row.username), '') IS NOT NULL;

-- Move still-live retry debt to the canonical queue; terminal legacy rows are audit-only residue.
INSERT INTO public.outgoing_delivery_queue (
  event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
  next_retry_at, last_attempt_at, last_error, created_at, updated_at, organization_id
)
SELECT
  legacy.payload_json #>> '{intent,meta,eventId}',
  'inbound_reply',
  COALESCE(
    NULLIF(legacy.payload_json #>> '{intent,payload,delivery,channels,0}', ''),
    NULLIF(legacy.payload_json #>> '{targets,0,resource}', '')
  ),
  legacy.payload_json,
  CASE legacy.status WHEN 'processing' THEN 'failed_retryable' ELSE 'pending' END,
  legacy.attempts_done,
  legacy.max_attempts,
  legacy.next_try_at,
  CASE WHEN legacy.attempts_done > 0 THEN legacy.updated_at ELSE NULL END,
  legacy.last_error,
  legacy.created_at,
  legacy.updated_at,
  :'canonical_organization_id'::uuid
FROM cutover_source_integrator.rubitime_create_retry_jobs legacy
WHERE legacy.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM public.outgoing_delivery_queue existing
    WHERE existing.event_id = legacy.payload_json #>> '{intent,meta,eventId}'
  );

-- Rebuild the initial organization membership and patient visibility graph from canonical facts.
INSERT INTO public.be_organization_members (
  organization_id, platform_user_id, role, specialist_id, status
)
SELECT
  :'canonical_organization_id'::uuid,
  user_row.id,
  'doctor',
  :'canonical_specialist_id'::uuid,
  'active'
FROM public.platform_users user_row
WHERE user_row.role = 'doctor'
  AND user_row.merged_into_id IS NULL
  AND user_row.is_archived IS FALSE
;

INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
SELECT DISTINCT appointment.organization_id, appointment.platform_user_id, 'active'
FROM public.be_appointments appointment
JOIN public.platform_users patient ON patient.id = appointment.platform_user_id
WHERE appointment.platform_user_id IS NOT NULL
  AND appointment.deleted_at IS NULL
  AND patient.role = 'client'
  AND patient.merged_into_id IS NULL
  AND COALESCE(patient.is_archived, false) = false
;

INSERT INTO public.patient_specialist_links (
  organization_id, patient_user_id, specialist_id, status, created_via
)
SELECT DISTINCT
  appointment.organization_id,
  appointment.platform_user_id,
  appointment.specialist_id,
  'active',
  'first_appointment'
FROM public.be_appointments appointment
JOIN public.platform_users patient ON patient.id = appointment.platform_user_id
JOIN public.be_specialists specialist
  ON specialist.id = appointment.specialist_id
 AND specialist.organization_id = appointment.organization_id
WHERE appointment.platform_user_id IS NOT NULL
  AND appointment.specialist_id IS NOT NULL
  AND appointment.deleted_at IS NULL
  AND patient.role = 'client'
  AND patient.merged_into_id IS NULL
;

-- Reseed serial/identity sequences after explicit-id copy.
DO $reseed_sequences$
DECLARE
  sequence_row record;
  maximum_value bigint;
BEGIN
  FOR sequence_row IN
    SELECT
      namespace.nspname AS schema_name,
      class.relname AS table_name,
      attribute.attname AS column_name,
      pg_get_serial_sequence(
        format('%I.%I', namespace.nspname, class.relname),
        attribute.attname
      ) AS sequence_name
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = class.oid
    WHERE namespace.nspname IN ('public', 'integrator', 'drizzle')
      AND class.relkind IN ('r', 'p')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND pg_get_serial_sequence(
        format('%I.%I', namespace.nspname, class.relname),
        attribute.attname
      ) IS NOT NULL
  LOOP
    EXECUTE format(
      'SELECT max(%I)::bigint FROM %I.%I',
      sequence_row.column_name,
      sequence_row.schema_name,
      sequence_row.table_name
    ) INTO maximum_value;
    IF maximum_value IS NULL THEN
      PERFORM setval(sequence_row.sequence_name, 1, false);
    ELSE
      PERFORM setval(sequence_row.sequence_name, maximum_value, true);
    END IF;
  END LOOP;
END
$reseed_sequences$;

DO $copy_gate$
DECLARE
  violations bigint;
BEGIN
  SELECT count(*) INTO violations
  FROM cutover_source_integrator.rubitime_create_retry_jobs legacy
  WHERE legacy.status IN ('pending', 'processing')
    AND NOT EXISTS (
      SELECT 1 FROM public.outgoing_delivery_queue target
      WHERE target.event_id = legacy.payload_json #>> '{intent,meta,eventId}'
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'legacy retry jobs not copied: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM cutover_source_integrator.contacts legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_contacts target
    WHERE target.value_normalized = legacy.value_normalized
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'legacy contacts not represented in user_contacts: %', violations; END IF;

  WITH expected AS (
    SELECT DISTINCT
      appointment.id AS canonical_id
    FROM cutover_source_integrator.booking_calendar_map legacy
    LEFT JOIN public.be_external_entity_mappings mapping
      ON mapping.external_system = 'rubitime'
     AND mapping.entity_type = 'appointment'
     AND mapping.external_id = legacy.rubitime_record_id
    JOIN public.be_appointments appointment
      ON appointment.id = COALESCE(
        mapping.canonical_id,
        CASE
          WHEN legacy.rubitime_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN substring(legacy.rubitime_record_id FROM 4)::uuid
        END
      )
  )
  SELECT count(*) INTO violations
  FROM expected
  WHERE NOT EXISTS (
    SELECT 1 FROM public.booking_calendar_map target
    WHERE target.appointment_key = 'be:' || expected.canonical_id::text
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'canonical calendar mappings not copied: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM integrator.user_reminder_occurrences
  WHERE organization_id IS NULL OR platform_user_id IS NULL;
  IF violations <> 0 THEN RAISE EXCEPTION 'reminder occurrences missing canonical scope: %', violations; END IF;
END
$copy_gate$;
