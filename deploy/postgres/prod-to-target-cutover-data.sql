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

-- Every source-only relation must have an explicit reviewed transition. This registry covers
-- nonempty and empty source relations alike so a newly appearing class fails the same transaction.
CREATE TEMP TABLE cutover_source_relation_disposition (
  source_relation text PRIMARY KEY,
  disposition text NOT NULL CHECK (disposition IN ('transform', 'intentionally_retire')),
  target_or_reason text NOT NULL CHECK (btrim(target_or_reason) <> '')
);

INSERT INTO cutover_source_relation_disposition VALUES
  ('integrator.booking_calendar_map', 'transform', 'public.booking_calendar_map below'),
  ('integrator.contacts', 'transform', 'public.user_contacts plus canonical platform phone'),
  ('integrator.content_access_grants', 'intentionally_retire', 'dead integrator authorization mirror'),
  ('integrator.conversation_messages', 'transform', 'canonical public support history already copied'),
  ('integrator.conversations', 'transform', 'canonical public support conversations already copied'),
  ('integrator.identities', 'transform', 'public.user_channel_bindings and user_identity'),
  ('integrator.mailing_logs', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('integrator.mailing_topics', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('integrator.mailings', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('integrator.message_drafts', 'transform', 'public.support_conversations.pending_message_drafts below'),
  ('integrator.question_messages', 'transform', 'canonical public support history already copied'),
  ('integrator.rubitime_api_throttle', 'intentionally_retire', 'retired provider throttle state'),
  ('integrator.rubitime_booking_profiles', 'intentionally_retire', 'retired provider catalog'),
  ('integrator.rubitime_branches', 'intentionally_retire', 'retired provider catalog'),
  ('integrator.rubitime_cooperators', 'intentionally_retire', 'retired provider catalog'),
  ('integrator.rubitime_create_retry_jobs', 'transform', 'public.outgoing_delivery_queue below'),
  ('integrator.rubitime_events', 'intentionally_retire', 'accepted appointments transferred before A -> B'),
  ('integrator.rubitime_records', 'intentionally_retire', 'accepted appointments transferred before A -> B'),
  ('integrator.rubitime_services', 'intentionally_retire', 'retired provider catalog'),
  ('integrator.system_settings', 'intentionally_retire', 'public.system_settings is canonical'),
  ('integrator.telegram_state', 'transform', 'public.user_channel_bindings display state below'),
  ('integrator.telegram_users', 'intentionally_retire', 'dead pre-identity messenger mirror'),
  ('integrator.user_questions', 'transform', 'canonical public support history already copied'),
  ('integrator.user_reminder_rules', 'intentionally_retire', 'public.reminder_rules is canonical'),
  ('integrator.user_subscriptions', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('integrator.users', 'transform', 'public.platform_users and user_identity'),
  ('public.appointment_records', 'transform', 'public.be_appointments before A -> B'),
  ('public.be_external_entity_mappings', 'intentionally_retire', 'retired external-system bridge removed by migration 0042'),
  ('public.be_appointment_events', 'transform', 'public.be_appointment_history_events before retirement'),
  ('public.be_product_history_events', 'intentionally_retire', 'retired empty product engine'),
  ('public.be_product_pay_links', 'intentionally_retire', 'retired empty product engine'),
  ('public.be_product_purchases', 'intentionally_retire', 'retired empty product engine'),
  ('public.be_products', 'intentionally_retire', 'retired empty product engine'),
  ('public.booking_branch_services', 'intentionally_retire', 'canonical be_* booking catalog already copied'),
  ('public.booking_branches', 'intentionally_retire', 'canonical be_* booking catalog already copied'),
  ('public.booking_services', 'intentionally_retire', 'canonical be_* booking catalog already copied'),
  ('public.booking_specialists', 'intentionally_retire', 'canonical be_* booking catalog already copied'),
  ('public.branches', 'intentionally_retire', 'canonical be_* booking catalog already copied'),
  ('public.clinical_test_measure_kinds', 'intentionally_retire', 'empty retired duplicate catalog'),
  ('public.mailing_logs_webapp', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('public.mailing_topics_webapp', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('public.schema_migrations', 'transform', 'canonical drizzle and integrator ledgers'),
  ('public.user_email_setup_tokens', 'intentionally_retire', 'replaced by password setup OTP challenges'),
  ('public.user_pins', 'intentionally_retire', 'retired PIN path'),
  ('public.user_subscriptions_webapp', 'intentionally_retire', 'retired duplicate mailing domain'),
  ('public.webapp_schema_migrations', 'intentionally_retire', 'historical emergency-runner ledger removed by B0'),
  ('public.webapp_reminder_occurrences', 'transform', 'integrator.user_reminder_occurrences below');

DO $source_only_disposition_gate$
DECLARE
  unexplained text;
  stale text;
BEGIN
  WITH source_relations AS (
    SELECT
      CASE source_namespace.nspname
        WHEN 'cutover_source_public' THEN 'public'
        WHEN 'cutover_source_integrator' THEN 'integrator'
        ELSE 'drizzle'
      END || '.' || source_class.relname AS source_relation,
      CASE source_namespace.nspname
        WHEN 'cutover_source_public' THEN 'public'
        WHEN 'cutover_source_integrator' THEN 'integrator'
        ELSE 'drizzle'
      END AS target_schema,
      source_class.relname AS table_name
    FROM pg_class source_class
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_class.relnamespace
    WHERE source_namespace.nspname IN (
      'cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle'
    )
      AND source_class.relkind IN ('r', 'p')
  ), source_only AS (
    SELECT source_relation
    FROM source_relations
    WHERE to_regclass(format('%I.%I', target_schema, table_name)) IS NULL
  )
  SELECT string_agg(source_relation, ', ' ORDER BY source_relation) INTO unexplained
  FROM source_only
  WHERE NOT EXISTS (
    SELECT 1 FROM cutover_source_relation_disposition disposition
    WHERE disposition.source_relation = source_only.source_relation
  );
  IF unexplained IS NOT NULL THEN
    RAISE EXCEPTION 'unexplained source-only relations: %', unexplained;
  END IF;

  WITH source_relations AS (
    SELECT
      CASE source_namespace.nspname
        WHEN 'cutover_source_public' THEN 'public'
        WHEN 'cutover_source_integrator' THEN 'integrator'
        ELSE 'drizzle'
      END || '.' || source_class.relname AS source_relation,
      CASE source_namespace.nspname
        WHEN 'cutover_source_public' THEN 'public'
        WHEN 'cutover_source_integrator' THEN 'integrator'
        ELSE 'drizzle'
      END AS target_schema,
      source_class.relname AS table_name
    FROM pg_class source_class
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_class.relnamespace
    WHERE source_namespace.nspname IN (
      'cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle'
    )
      AND source_class.relkind IN ('r', 'p')
  )
  SELECT string_agg(disposition.source_relation, ', ' ORDER BY disposition.source_relation) INTO stale
  FROM cutover_source_relation_disposition disposition
  WHERE NOT EXISTS (
    SELECT 1 FROM source_relations
    WHERE source_relations.source_relation = disposition.source_relation
      AND to_regclass(format('%I.%I', source_relations.target_schema, source_relations.table_name)) IS NULL
  );
  IF stale IS NOT NULL THEN
    RAISE EXCEPTION 'stale source-only disposition entries: %', stale;
  END IF;
END
$source_only_disposition_gate$;

-- Reconcile the two exact discussion images whose DB metadata survived but whose original and
-- generated S3 objects are absent in the current PROD-dump lineage. The included operation is
-- idempotent and fails before mutation if either identity or its live reference has drifted.
\ir prod-to-target-cutover-known-missing-media.sql

-- Resolve the complete live platform_users merge graph once. Every source identity must terminate
-- at exactly one surviving canonical user; a cycle or a dangling merged_into_id aborts the transition.
CREATE TEMP TABLE cutover_platform_user_canonical_map ON COMMIT DROP AS
WITH RECURSIVE identity_path AS (
  SELECT user_row.id AS source_id,
         user_row.id AS current_id,
         user_row.merged_into_id,
         ARRAY[user_row.id]::uuid[] AS visited
  FROM public.platform_users user_row
  UNION ALL
  SELECT path.source_id,
         next_user.id,
         next_user.merged_into_id,
         path.visited || next_user.id
  FROM identity_path path
  JOIN public.platform_users next_user ON next_user.id = path.merged_into_id
  WHERE NOT next_user.id = ANY(path.visited)
)
SELECT source_id, current_id AS canonical_id
FROM identity_path
WHERE merged_into_id IS NULL;

CREATE UNIQUE INDEX cutover_platform_user_canonical_map_source_uidx
  ON cutover_platform_user_canonical_map (source_id);

DO $canonical_identity_graph_gate$
DECLARE violations bigint;
BEGIN
  SELECT count(*) INTO violations
  FROM public.platform_users user_row
  LEFT JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = user_row.id
  WHERE identity_map.source_id IS NULL;
  IF violations <> 0 THEN
    RAISE EXCEPTION 'platform user merge graph has cycles or dangling targets: %', violations;
  END IF;
END
$canonical_identity_graph_gate$;

-- Preserve a source-derived oracle for every FK class that references the consolidated specialist.
-- The target post-transition gate consumes this temp table after the source schemas are gone.
CREATE TEMP TABLE cutover_specialist_transition_reference_baseline (
  table_name text PRIMARY KEY,
  column_name text NOT NULL,
  expected_rows bigint NOT NULL,
  expected_canonical_rows bigint NOT NULL
) ON COMMIT DROP;

DO $specialist_transition_reference_baseline$
DECLARE
  reference record;
  expected_rows bigint;
  expected_canonical_rows bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'cutover_source_public.be_specialists'::regclass
      AND (
        array_length(constraint_row.conkey, 1) <> 1
        OR array_length(constraint_row.confkey, 1) <> 1
      )
  ) THEN
    RAISE EXCEPTION 'source specialist baseline cannot safely audit a composite FK';
  END IF;

  FOR reference IN
    SELECT source_table.relname AS table_name, source_attribute.attname AS column_name
    FROM pg_constraint constraint_row
    JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_table.relnamespace
    JOIN pg_attribute source_attribute
      ON source_attribute.attrelid = constraint_row.conrelid
     AND source_attribute.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'cutover_source_public.be_specialists'::regclass
      AND source_namespace.nspname = 'cutover_source_public'
      AND array_length(constraint_row.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE %I = $1) FROM cutover_source_public.%I',
      reference.column_name, reference.table_name
    ) INTO expected_rows, expected_canonical_rows
      USING current_setting('bcb.cutover.canonical_specialist_id')::uuid;
    INSERT INTO cutover_specialist_transition_reference_baseline
      (table_name, column_name, expected_rows, expected_canonical_rows)
    VALUES (reference.table_name, reference.column_name, expected_rows, expected_canonical_rows);
  END LOOP;
END
$specialist_transition_reference_baseline$;

-- Two live classes have uniqueness semantics and therefore cannot be rewritten row-by-row.
-- Channel preferences keep the latest complete state per canonical user/channel. First-resolve
-- keeps the earliest observed timestamp per canonical user/media pair.
CREATE TEMP TABLE cutover_canonical_channel_preferences
  (LIKE public.user_channel_preferences INCLUDING DEFAULTS) ON COMMIT DROP;

DO $unique_identity_input_gate$
DECLARE violations bigint;
BEGIN
  SELECT count(*) INTO violations
  FROM public.user_channel_preferences preference
  LEFT JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = preference.platform_user_id
  WHERE identity_map.source_id IS NULL;
  IF violations <> 0 THEN
    RAISE EXCEPTION 'channel preferences have no canonical identity mapping: %', violations;
  END IF;

  SELECT count(*) INTO violations
  FROM public.media_playback_user_video_first_resolve playback
  LEFT JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = playback.user_id
  WHERE identity_map.source_id IS NULL;
  IF violations <> 0 THEN
    RAISE EXCEPTION 'first-resolve rows have no canonical identity mapping: %', violations;
  END IF;
END
$unique_identity_input_gate$;

INSERT INTO cutover_canonical_channel_preferences (
  id, user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications,
  created_at, updated_at, is_preferred_for_auth, platform_user_id
)
SELECT DISTINCT ON (identity_map.canonical_id, preference.channel_code)
  preference.id,
  identity_map.canonical_id::text,
  preference.channel_code,
  preference.is_enabled_for_messages,
  preference.is_enabled_for_notifications,
  preference.created_at,
  preference.updated_at,
  preference.is_preferred_for_auth,
  identity_map.canonical_id
FROM public.user_channel_preferences preference
JOIN cutover_platform_user_canonical_map identity_map
  ON identity_map.source_id = preference.platform_user_id
ORDER BY identity_map.canonical_id, preference.channel_code,
         preference.updated_at DESC, preference.created_at DESC, preference.id DESC;

TRUNCATE public.user_channel_preferences;
INSERT INTO public.user_channel_preferences
SELECT * FROM cutover_canonical_channel_preferences;

CREATE TEMP TABLE cutover_canonical_first_resolve
  (LIKE public.media_playback_user_video_first_resolve INCLUDING DEFAULTS) ON COMMIT DROP;

INSERT INTO cutover_canonical_first_resolve (
  user_id, media_id, first_resolved_at, organization_id
)
SELECT identity_map.canonical_id,
       playback.media_id,
       min(playback.first_resolved_at),
       current_setting('bcb.cutover.canonical_organization_id')::uuid
FROM public.media_playback_user_video_first_resolve playback
JOIN cutover_platform_user_canonical_map identity_map ON identity_map.source_id = playback.user_id
GROUP BY identity_map.canonical_id, playback.media_id;

TRUNCATE public.media_playback_user_video_first_resolve;
INSERT INTO public.media_playback_user_video_first_resolve
SELECT * FROM cutover_canonical_first_resolve;

-- Dynamically close every reviewed live subject/ownership UUID class. Provenance columns such as
-- author_id, actor_id, created_by and updated_by are deliberately outside this registry.
CREATE TEMP TABLE cutover_reviewed_live_identity_references (
  relation_oid oid NOT NULL,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  column_name text NOT NULL,
  PRIMARY KEY (relation_oid, column_name)
) ON COMMIT DROP;

INSERT INTO cutover_reviewed_live_identity_references
SELECT table_class.oid, namespace.nspname, table_class.relname, attribute.attname
FROM pg_class table_class
JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
JOIN pg_attribute attribute ON attribute.attrelid = table_class.oid
WHERE namespace.nspname IN ('public', 'integrator')
  AND table_class.relkind IN ('r', 'p')
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
  AND attribute.atttypid = 'uuid'::regtype
  AND attribute.attname IN (
    'platform_user_id', 'patient_user_id', 'user_id', 'owner_user_id', 'doctor_user_id'
  )
  AND (namespace.nspname, table_class.relname) NOT IN (
    ('public', 'user_channel_preferences'),
    ('public', 'media_playback_user_video_first_resolve')
  );

DO $canonicalize_live_identity_references$
DECLARE reference record;
BEGIN
  FOR reference IN
    SELECT * FROM cutover_reviewed_live_identity_references ORDER BY schema_name, table_name, column_name
  LOOP
    EXECUTE format(
      'UPDATE %I.%I target SET %I = identity_map.canonical_id '
      || 'FROM cutover_platform_user_canonical_map identity_map '
      || 'WHERE target.%I = identity_map.source_id '
      || 'AND identity_map.source_id <> identity_map.canonical_id',
      reference.schema_name, reference.table_name, reference.column_name, reference.column_name
    );
  END LOOP;
END
$canonicalize_live_identity_references$;

-- Required tenant columns added after the source snapshot.
INSERT INTO public.reference_categories (
  id, code, title, is_user_extensible, owner_id, tenant_id, created_at, organization_id
)
SELECT id, code, title, is_user_extensible, owner_id, tenant_id, created_at,
       current_setting('bcb.cutover.canonical_organization_id')::uuid
FROM cutover_source_public.reference_categories;

INSERT INTO public.reference_items (
  id, category_id, code, title, sort_order, is_active, meta_json, created_at,
  deleted_at, organization_id
)
SELECT id, category_id, code, title, sort_order, is_active, meta_json, created_at,
       deleted_at, current_setting('bcb.cutover.canonical_organization_id')::uuid
FROM cutover_source_public.reference_items;

UPDATE public.reminder_rules
SET organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
WHERE organization_id IS NULL;

-- reminder_occurrence_history predates its canonical patient key. Populate every row that can be
-- resolved mechanically through the existing platform_users.integrator_user_id identity graph.
-- NULL remains only for a source integrator identity that has no platform user at all.
UPDATE public.reminder_occurrence_history target
SET platform_user_id = identity_map.canonical_id
FROM cutover_source_public.reminder_occurrence_history source_history
JOIN public.platform_users source_user
  ON source_user.integrator_user_id = source_history.integrator_user_id
JOIN cutover_platform_user_canonical_map identity_map
  ON identity_map.source_id = source_user.id
WHERE target.id = source_history.id;

DO $reminder_occurrence_history_identity_gate$
DECLARE
  source_rows bigint;
  target_rows bigint;
  attributable_rows bigint;
  attributed_rows bigint;
  honest_null_rows bigint;
  violations bigint;
BEGIN
  SELECT count(*) INTO source_rows FROM cutover_source_public.reminder_occurrence_history;
  SELECT count(*) INTO target_rows FROM public.reminder_occurrence_history;
  SELECT count(*) INTO attributable_rows
  FROM cutover_source_public.reminder_occurrence_history source_history
  JOIN public.platform_users source_user
    ON source_user.integrator_user_id = source_history.integrator_user_id
  JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = source_user.id;
  SELECT count(*) FILTER (WHERE platform_user_id IS NOT NULL),
         count(*) FILTER (WHERE platform_user_id IS NULL)
  INTO attributed_rows, honest_null_rows
  FROM public.reminder_occurrence_history;

  SELECT count(*) INTO violations
  FROM cutover_source_public.reminder_occurrence_history source_history
  JOIN public.reminder_occurrence_history target ON target.id = source_history.id
  LEFT JOIN public.platform_users source_user
    ON source_user.integrator_user_id = source_history.integrator_user_id
  LEFT JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = source_user.id
  WHERE target.platform_user_id IS DISTINCT FROM identity_map.canonical_id;

  IF source_rows <> target_rows
    OR attributable_rows <> attributed_rows
    OR honest_null_rows <> source_rows - attributable_rows
    OR violations <> 0
  THEN
    RAISE EXCEPTION 'reminder history identity disposition drift: source %, target %, attributable %, attributed %, honest null %, mismatched %',
      source_rows, target_rows, attributable_rows, attributed_rows, honest_null_rows, violations;
  END IF;
END
$reminder_occurrence_history_identity_gate$;

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
  current_setting('bcb.cutover.canonical_organization_id')::uuid,
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
  current_setting('bcb.cutover.canonical_organization_id')::uuid,
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
LEFT JOIN cutover_source_public.be_external_entity_mappings mapping
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
    organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
FROM cutover_source_public.clinical_visit source_visit
JOIN cutover_source_public.appointment_records legacy
  ON legacy.id = source_visit.appointment_record_id
LEFT JOIN cutover_source_public.be_external_entity_mappings mapping
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

-- Preserve actionable drafts inside the canonical support-conversation path. Most source drafts
-- predate a conversation row, so create one deterministic holder per patient/channel when needed.
-- The retired integrator identity/table remains source-only; no compatibility mirror is recreated.
INSERT INTO public.support_conversations (
  id, organization_id, integrator_conversation_id, platform_user_id, integrator_user_id,
  source, admin_scope, status, opened_at, last_message_at, created_at, updated_at
)
SELECT md5('cutover-pending-drafts:' || draft_group.identity_id::text || ':' || draft_group.source)::uuid,
       current_setting('bcb.cutover.canonical_organization_id')::uuid,
       'cutover-pending-drafts:' || draft_group.identity_id::text || ':' || draft_group.source,
       draft_group.canonical_user_id,
       draft_group.integrator_user_id,
       draft_group.source,
       'canonical-pending-draft',
       'pending_confirmation',
       draft_group.opened_at,
       draft_group.last_message_at,
       draft_group.opened_at,
       draft_group.last_message_at
FROM (
  SELECT draft.identity_id,
         draft.source,
         identity_map.canonical_id AS canonical_user_id,
         source_identity.user_id AS integrator_user_id,
         min(draft.created_at) AS opened_at,
         max(draft.updated_at) AS last_message_at
  FROM cutover_source_integrator.message_drafts draft
  JOIN cutover_source_integrator.identities source_identity
    ON source_identity.id = draft.identity_id
  JOIN public.platform_users source_user
    ON source_user.integrator_user_id = source_identity.user_id
  JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = source_user.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.support_conversations existing_conversation
    WHERE existing_conversation.integrator_user_id = source_identity.user_id
      AND existing_conversation.source = draft.source
  )
  GROUP BY draft.identity_id, draft.source, identity_map.canonical_id, source_identity.user_id
) draft_group;

CREATE TEMP TABLE cutover_message_draft_bindings (
  draft_id text PRIMARY KEY,
  conversation_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO cutover_message_draft_bindings (draft_id, conversation_id)
SELECT draft.id, target_conversation.id
FROM cutover_source_integrator.message_drafts draft
JOIN cutover_source_integrator.identities source_identity
  ON source_identity.id = draft.identity_id
JOIN LATERAL (
  SELECT conversation.id
  FROM public.support_conversations conversation
  WHERE conversation.integrator_user_id = source_identity.user_id
    AND conversation.source = draft.source
  ORDER BY
    (conversation.integrator_conversation_id LIKE 'cutover-pending-drafts:%') ASC,
    conversation.last_message_at DESC,
    conversation.id
  LIMIT 1
) target_conversation ON true;

UPDATE public.support_conversations conversation
SET pending_message_drafts = draft_payload.payload,
    updated_at = GREATEST(conversation.updated_at, draft_payload.latest_update)
FROM (
  SELECT binding.conversation_id,
         jsonb_agg(
           jsonb_build_object(
             'cutoverSource', 'integrator.message_drafts',
             'id', draft.id,
             'source', draft.source,
             'externalChatId', draft.external_chat_id,
             'externalMessageId', draft.external_message_id,
             'draftTextCurrent', draft.draft_text_current,
             'state', draft.state,
             'createdAt', draft.created_at,
             'updatedAt', draft.updated_at
           ) ORDER BY draft.created_at, draft.id
         ) AS payload,
         max(draft.updated_at) AS latest_update
  FROM cutover_source_integrator.message_drafts draft
  JOIN cutover_message_draft_bindings binding ON binding.draft_id = draft.id
  GROUP BY binding.conversation_id
) draft_payload
WHERE conversation.id = draft_payload.conversation_id;

DO $message_drafts_preservation_gate$
DECLARE
  source_rows bigint;
  target_rows bigint;
  mismatched_rows bigint;
BEGIN
  SELECT count(*) INTO source_rows FROM cutover_source_integrator.message_drafts;
  SELECT count(*) INTO target_rows
  FROM public.support_conversations conversation
  CROSS JOIN LATERAL jsonb_array_elements(conversation.pending_message_drafts) draft_payload
  WHERE draft_payload->>'cutoverSource' = 'integrator.message_drafts';
  SELECT count(*) INTO mismatched_rows
  FROM cutover_source_integrator.message_drafts source_draft
  LEFT JOIN cutover_message_draft_bindings binding ON binding.draft_id = source_draft.id
  LEFT JOIN public.support_conversations conversation ON conversation.id = binding.conversation_id
  LEFT JOIN LATERAL (
    SELECT payload
    FROM jsonb_array_elements(conversation.pending_message_drafts) payload
    WHERE payload->>'cutoverSource' = 'integrator.message_drafts'
      AND payload->>'id' = source_draft.id
  ) target_draft ON true
  WHERE binding.draft_id IS NULL
     OR conversation.organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid
     OR target_draft.payload IS NULL
     OR target_draft.payload->>'source' IS DISTINCT FROM source_draft.source
     OR target_draft.payload->>'externalChatId' IS DISTINCT FROM source_draft.external_chat_id
     OR target_draft.payload->>'externalMessageId' IS DISTINCT FROM source_draft.external_message_id
     OR target_draft.payload->>'draftTextCurrent' IS DISTINCT FROM source_draft.draft_text_current
     OR target_draft.payload->>'state' IS DISTINCT FROM source_draft.state
     OR (target_draft.payload->>'createdAt')::timestamptz IS DISTINCT FROM source_draft.created_at
     OR (target_draft.payload->>'updatedAt')::timestamptz IS DISTINCT FROM source_draft.updated_at;

  IF source_rows <> target_rows OR mismatched_rows <> 0 THEN
    RAISE EXCEPTION 'message draft preservation drift: source %, target %, content mismatches %',
      source_rows, target_rows, mismatched_rows;
  END IF;
END
$message_drafts_preservation_gate$;

CREATE TEMP TABLE cutover_systemic_expected_counts (
  class text PRIMARY KEY,
  expected_count bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO cutover_systemic_expected_counts VALUES
  ('message_drafts', (SELECT count(*) FROM cutover_source_integrator.message_drafts)),
  ('delivery_attempt_logs', (SELECT count(*) FROM cutover_source_integrator.delivery_attempt_logs)),
  ('media_playback_stats_hourly', (SELECT count(*) FROM cutover_source_public.media_playback_stats_hourly)),
  ('reminder_occurrence_history', (SELECT count(*) FROM cutover_source_public.reminder_occurrence_history));

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
  current_setting('bcb.cutover.canonical_organization_id')::uuid
FROM cutover_source_integrator.rubitime_create_retry_jobs legacy
WHERE legacy.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM public.outgoing_delivery_queue existing
    WHERE existing.event_id = legacy.payload_json #>> '{intent,meta,eventId}'
  );

-- Rebuild the initial organization membership and patient visibility graph for every active
-- canonical client. Patient-domain references remain a closure oracle only; merged aliases are
-- resolved by the owner identity consolidation before this A -> B transition and are never enrolled.
\set patient_source_schema cutover_source_public
\ir prod-to-target-patient-membership-manifest.sql

INSERT INTO public.be_organization_members (
  organization_id, platform_user_id, role, specialist_id, status
)
SELECT
  current_setting('bcb.cutover.canonical_organization_id')::uuid,
  user_row.id,
  'owner',
  current_setting('bcb.cutover.canonical_specialist_id')::uuid,
  'active'
FROM public.platform_users user_row
WHERE user_row.role = 'doctor'
  AND user_row.merged_into_id IS NULL
  AND user_row.is_archived IS FALSE
;

UPDATE public.org_enrollments enrollment
SET status = 'active'
FROM cutover_expected_active_canonical_client_membership expected
WHERE enrollment.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
  AND enrollment.platform_user_id = expected.platform_user_id;

INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
SELECT current_setting('bcb.cutover.canonical_organization_id')::uuid, expected.platform_user_id, 'active'
FROM cutover_expected_active_canonical_client_membership expected
WHERE NOT EXISTS (
  SELECT 1 FROM public.org_enrollments enrollment
  WHERE enrollment.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
    AND enrollment.platform_user_id = expected.platform_user_id
);

UPDATE public.patient_specialist_links link
SET organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid,
    created_via = 'transfer'
FROM cutover_expected_active_canonical_client_membership expected
WHERE link.patient_user_id = expected.platform_user_id
  AND link.specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
  AND link.status = 'active';

INSERT INTO public.patient_specialist_links (
  organization_id, patient_user_id, specialist_id, status, created_via
)
SELECT
  current_setting('bcb.cutover.canonical_organization_id')::uuid,
  expected.platform_user_id,
  current_setting('bcb.cutover.canonical_specialist_id')::uuid,
  'active',
  'transfer'
FROM cutover_expected_active_canonical_client_membership expected
WHERE NOT EXISTS (
  SELECT 1 FROM public.patient_specialist_links link
  WHERE link.patient_user_id = expected.platform_user_id
    AND link.specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
    AND link.status = 'active'
);

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

DO $canonical_identity_reference_post_gate$
DECLARE
  reference record;
  violations bigint;
  expected_rows bigint;
  target_rows bigint;
BEGIN
  FOR reference IN
    SELECT * FROM cutover_reviewed_live_identity_references ORDER BY schema_name, table_name, column_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I target '
      || 'JOIN cutover_platform_user_canonical_map identity_map ON identity_map.source_id = target.%I '
      || 'WHERE identity_map.source_id <> identity_map.canonical_id',
      reference.schema_name, reference.table_name, reference.column_name
    ) INTO violations;
    IF violations <> 0 THEN
      RAISE EXCEPTION 'merged alias remains in reviewed live identity class %.%.%: %',
        reference.schema_name, reference.table_name, reference.column_name, violations;
    END IF;
  END LOOP;

  SELECT count(*) INTO violations
  FROM public.user_channel_preferences preference
  WHERE preference.user_id <> preference.platform_user_id::text
     OR EXISTS (
       SELECT 1 FROM cutover_platform_user_canonical_map identity_map
       WHERE identity_map.source_id = preference.platform_user_id
         AND identity_map.source_id <> identity_map.canonical_id
     );
  IF violations <> 0 THEN
    RAISE EXCEPTION 'merged alias remains in user_channel_preferences dual identity columns: %', violations;
  END IF;

  SELECT count(*) INTO expected_rows
  FROM (
    SELECT DISTINCT identity_map.canonical_id, source_preference.channel_code
    FROM cutover_source_public.user_channel_preferences source_preference
    JOIN cutover_platform_user_canonical_map identity_map
      ON identity_map.source_id = source_preference.platform_user_id
  ) expected;
  SELECT count(*) INTO target_rows FROM public.user_channel_preferences;
  IF expected_rows <> target_rows THEN
    RAISE EXCEPTION 'canonical channel preference disposition drift: expected %, target %', expected_rows, target_rows;
  END IF;

  SELECT count(*) INTO expected_rows
  FROM (
    SELECT identity_map.canonical_id, source_playback.media_id
    FROM cutover_source_public.media_playback_user_video_first_resolve source_playback
    JOIN cutover_platform_user_canonical_map identity_map
      ON identity_map.source_id = source_playback.user_id
    GROUP BY identity_map.canonical_id, source_playback.media_id
  ) expected;
  SELECT count(*) INTO target_rows FROM public.media_playback_user_video_first_resolve;
  IF expected_rows <> target_rows THEN
    RAISE EXCEPTION 'canonical first-resolve disposition drift: expected %, target %', expected_rows, target_rows;
  END IF;
END
$canonical_identity_reference_post_gate$;

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
    LEFT JOIN cutover_source_public.be_external_entity_mappings mapping
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

  SELECT count(*) INTO violations
  FROM integrator.delivery_attempt_logs
  WHERE organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid;
  IF violations <> 0 THEN RAISE EXCEPTION 'delivery attempt logs missing canonical organization: %', violations; END IF;
  IF (SELECT count(*) FROM integrator.delivery_attempt_logs)
     <> (SELECT count(*) FROM cutover_source_integrator.delivery_attempt_logs) THEN
    RAISE EXCEPTION 'delivery attempt log row count changed during cutover';
  END IF;

  SELECT count(*) INTO violations
  FROM public.media_playback_stats_hourly
  WHERE organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid;
  IF violations <> 0 THEN RAISE EXCEPTION 'media playback hourly stats missing canonical organization: %', violations; END IF;
  IF (SELECT count(*) FROM public.media_playback_stats_hourly)
     <> (SELECT count(*) FROM cutover_source_public.media_playback_stats_hourly) THEN
    RAISE EXCEPTION 'media playback hourly stats row count changed during cutover';
  END IF;
END
$copy_gate$;
