\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Copy every surviving relation by its exact common columns. Tables that gained required columns
-- are handled explicitly below. The target schema is still in its pre-data section, so foreign keys,
-- policies and triggers are installed only after the copy.
\echo '=== CUTOVER STEP D01/24: copy common-column data for surviving relations ==='
DO $copy_common_tables$
DECLARE
  relation record;
  source_schema text;
  columns_sql text;
  target_columns_sql text;
  select_columns_sql text;
  inject_organization boolean;
  affected_rows bigint;
  copied_rows bigint := 0;
  copied_relations bigint := 0;
  organization_injected_relations bigint := 0;
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
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    copied_rows := copied_rows + affected_rows;
    copied_relations := copied_relations + 1;
    IF inject_organization THEN
      organization_injected_relations := organization_injected_relations + 1;
    END IF;
  END LOOP;
  PERFORM set_config('bcb.cutover.d01.copied_rows', copied_rows::text, true);
  PERFORM set_config('bcb.cutover.d01.copied_relations', copied_relations::text, true);
  PERFORM set_config(
    'bcb.cutover.d01.organization_injected_relations',
    organization_injected_relations::text,
    true
  );
END
$copy_common_tables$;

SELECT json_build_object(
  'status', 'pass',
  'rowsWritten', current_setting('bcb.cutover.d01.copied_rows')::bigint,
  'relationsCopied', current_setting('bcb.cutover.d01.copied_relations')::bigint,
  'organizationInjectedRelations',
    current_setting('bcb.cutover.d01.organization_injected_relations')::bigint,
  'sourceRelationsAvailable', (
    SELECT count(*) FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname IN ('cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle')
      AND class.relkind IN ('r', 'p')
  ),
  'targetRelationsAvailable', (
    SELECT count(*) FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname IN ('public', 'integrator', 'drizzle') AND class.relkind IN ('r', 'p')
  ),
  'organizationInjectedWhereRequired', true
)::text AS result
\gset cutover_d01_
SELECT :'cutover_d01_result'::json AS cutover_step_d01_copy_common_relations;

-- Every source-only relation must have an explicit reviewed transition. This registry covers
-- nonempty and empty source relations alike so a newly appearing class fails the same transaction.
\echo '=== CUTOVER STEP D02/24: verify every source-only relation disposition ==='
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

SELECT json_build_object(
  'status', 'pass',
  'reviewedRelations', (SELECT count(*) FROM cutover_source_relation_disposition),
  'transformRelations', (
    SELECT count(*) FROM cutover_source_relation_disposition WHERE disposition = 'transform'
  ),
  'intentionallyRetiredRelations', (
    SELECT count(*) FROM cutover_source_relation_disposition WHERE disposition = 'intentionally_retire'
  ),
  'unreviewedSourceOnlyRelations', 0,
  'staleDispositionEntries', 0
)::text AS result
\gset cutover_d02_
SELECT :'cutover_d02_result'::json AS cutover_step_d02_source_relation_disposition;

-- Reconcile the two exact discussion images whose DB metadata survived but whose original and
-- generated S3 objects are absent in the current PROD-dump lineage. The included operation is
-- idempotent and fails before mutation if either identity or its live reference has drifted.
\echo '=== CUTOVER STEP D03/24: reconcile known-missing discussion media previews ==='
\ir prod-to-target-cutover-known-missing-media.sql

SELECT json_build_object(
  'status', 'pass',
  'knownMissingMediaRows', (
    SELECT count(*) FROM public.media_files
    WHERE id IN (
      '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
      '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
    ) AND preview_status = 'failed'
      AND preview_sm_key IS NULL
      AND preview_md_key IS NULL
      AND preview_next_attempt_at IS NULL
  ),
  'expectedKnownMissingMediaRows', 2,
  'referenceDrift', 0
)::text AS result
\gset cutover_d03_
SELECT :'cutover_d03_result'::json AS cutover_step_d03_known_missing_media;

-- Resolve the complete live platform_users merge graph once. Every source identity must terminate
-- at exactly one surviving canonical user; a cycle or a dangling merged_into_id aborts the transition.
\echo '=== CUTOVER STEP D04/24: resolve canonical platform-user merge graph ==='
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

SELECT json_build_object(
  'status', 'pass',
  'sourceUsers', (SELECT count(*) FROM public.platform_users),
  'canonicalMapRows', (SELECT count(*) FROM cutover_platform_user_canonical_map),
  'mergedAliases', (
    SELECT count(*) FROM cutover_platform_user_canonical_map WHERE source_id <> canonical_id
  ),
  'cyclesOrDanglingTargets', 0
)::text AS result
\gset cutover_d04_
SELECT :'cutover_d04_result'::json AS cutover_step_d04_canonical_user_graph;

-- Preserve a source-derived oracle for every FK class that references the consolidated specialist.
-- The target post-transition gate consumes this temp table after the source schemas are gone.
\echo '=== CUTOVER STEP D05/24: capture specialist-reference baseline ==='
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

SELECT json_build_object(
  'status', 'pass',
  'referenceClasses', (SELECT count(*) FROM cutover_specialist_transition_reference_baseline),
  'referenceRows', (
    SELECT coalesce(sum(expected_rows), 0) FROM cutover_specialist_transition_reference_baseline
  ),
  'canonicalReferenceRows', (
    SELECT coalesce(sum(expected_canonical_rows), 0)
    FROM cutover_specialist_transition_reference_baseline
  )
)::text AS result
\gset cutover_d05_
SELECT :'cutover_d05_result'::json AS cutover_step_d05_specialist_reference_baseline;

-- Two live classes have uniqueness semantics and therefore cannot be rewritten row-by-row.
-- Channel preferences keep the latest complete state per canonical user/channel. First-resolve
-- keeps the earliest observed timestamp per canonical user/media pair.
\echo '=== CUTOVER STEP D06/24: merge uniqueness-sensitive identity classes ==='
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

SELECT json_build_object(
  'status', 'pass',
  'channelPreferencesAfterMerge', (SELECT count(*) FROM public.user_channel_preferences),
  'channelPreferenceDuplicates', (
    SELECT count(*) FROM (
      SELECT platform_user_id, channel_code
      FROM public.user_channel_preferences
      GROUP BY platform_user_id, channel_code HAVING count(*) > 1
    ) duplicates
  ),
  'firstResolveRowsAfterMerge', (SELECT count(*) FROM public.media_playback_user_video_first_resolve),
  'firstResolveDuplicates', (
    SELECT count(*) FROM (
      SELECT user_id, media_id
      FROM public.media_playback_user_video_first_resolve
      GROUP BY user_id, media_id HAVING count(*) > 1
    ) duplicates
  )
)::text AS result
\gset cutover_d06_
SELECT :'cutover_d06_result'::json AS cutover_step_d06_unique_identity_classes;

-- Dynamically close every reviewed live subject/ownership UUID class. Provenance columns such as
-- author_id, actor_id, created_by and updated_by are deliberately outside this registry.
\echo '=== CUTOVER STEP D07/24: rewrite reviewed live identity references ==='
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
DECLARE
  reference record;
  affected_rows bigint;
  rewritten_rows bigint := 0;
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
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    rewritten_rows := rewritten_rows + affected_rows;
  END LOOP;
  PERFORM set_config('bcb.cutover.d07.rewritten_rows', rewritten_rows::text, true);
END
$canonicalize_live_identity_references$;

SELECT json_build_object(
  'status', 'pass',
  'reviewedReferenceClasses', (SELECT count(*) FROM cutover_reviewed_live_identity_references),
  'rowsRewritten', current_setting('bcb.cutover.d07.rewritten_rows')::bigint,
  'canonicalMapMergedAliases', (
    SELECT count(*) FROM cutover_platform_user_canonical_map WHERE source_id <> canonical_id
  ),
  'rewritePolicy', 'merged aliases replaced by canonical ids'
)::text AS result
\gset cutover_d07_
SELECT :'cutover_d07_result'::json AS cutover_step_d07_live_identity_references;

-- Required tenant columns added after the source snapshot.
\echo '=== CUTOVER STEP D08/24: populate required tenant-scoped rows ==='
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

SELECT json_build_object(
  'status', 'pass',
  'referenceCategories', (SELECT count(*) FROM public.reference_categories),
  'referenceItems', (SELECT count(*) FROM public.reference_items),
  'referenceRowsWithoutOrganization', (
    (SELECT count(*) FROM public.reference_categories WHERE organization_id IS NULL)
    + (SELECT count(*) FROM public.reference_items WHERE organization_id IS NULL)
  ),
  'reminderRulesWithoutOrganization', (
    SELECT count(*) FROM public.reminder_rules WHERE organization_id IS NULL
  )
)::text AS result
\gset cutover_d08_
SELECT :'cutover_d08_result'::json AS cutover_step_d08_required_tenant_rows;

-- reminder_occurrence_history predates its canonical patient key. Populate every row that can be
-- resolved mechanically through the existing platform_users.integrator_user_id identity graph.
-- NULL remains only for a source integrator identity that has no platform user at all.
\echo '=== CUTOVER STEP D09/24: attribute reminder history to canonical users ==='
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

SELECT json_build_object(
  'status', 'pass',
  'sourceRows', (SELECT count(*) FROM cutover_source_public.reminder_occurrence_history),
  'targetRows', (SELECT count(*) FROM public.reminder_occurrence_history),
  'attributedRows', (
    SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NOT NULL
  ),
  'deliberatelyUnmappedNoPlatformUser', (
    SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NULL
  ),
  'identityMismatches', 0
)::text AS result
\gset cutover_d09_
SELECT :'cutover_d09_result'::json AS cutover_step_d09_reminder_history_identity;

\echo '=== CUTOVER STEP D10/24: copy canonical reminder occurrences ==='
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

SELECT json_build_object(
  'status', 'pass',
  'sourceRows', (SELECT count(*) FROM cutover_source_integrator.user_reminder_occurrences),
  'rowsCopied', (
    SELECT count(*) FROM integrator.user_reminder_occurrences target
    WHERE EXISTS (
      SELECT 1 FROM cutover_source_integrator.user_reminder_occurrences source
      WHERE source.id = target.id
    )
  ),
  'skippedWithoutCanonicalRule', (
    SELECT count(*) FROM cutover_source_integrator.user_reminder_occurrences source
    WHERE NOT EXISTS (SELECT 1 FROM public.reminder_rules rule WHERE rule.integrator_rule_id = source.rule_id)
  )
)::text AS result
\gset cutover_d10_
SELECT :'cutover_d10_result'::json AS cutover_step_d10_reminder_occurrences;

-- Preserve the still actionable web-push rows from the retired parallel occurrence table.
\echo '=== CUTOVER STEP D11/24: preserve actionable legacy web-push occurrences ==='
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

SELECT json_build_object(
  'status', 'pass',
  'actionableSourceRows', (
    SELECT count(*) FROM cutover_source_public.webapp_reminder_occurrences legacy
    JOIN public.reminder_rules rule
      ON rule.integrator_rule_id = legacy.integrator_rule_id
     AND rule.platform_user_id = legacy.platform_user_id
    WHERE legacy.status IN ('planned', 'queued')
      AND legacy.planned_at >= statement_timestamp() - interval '3 minutes'
  ),
  'rowsPresentInCanonicalOccurrences', (
    SELECT count(*) FROM cutover_source_public.webapp_reminder_occurrences legacy
    JOIN integrator.user_reminder_occurrences target ON target.id = legacy.id::text
    WHERE legacy.status IN ('planned', 'queued')
  ),
  'terminalRowsDeliberatelySkipped', (
    SELECT count(*) FROM cutover_source_public.webapp_reminder_occurrences
    WHERE status NOT IN ('planned', 'queued')
  )
)::text AS result
\gset cutover_d11_
SELECT :'cutover_d11_result'::json AS cutover_step_d11_actionable_web_push;

\echo '=== CUTOVER STEP D12/24: copy reminder delivery logs ==='
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

SELECT json_build_object(
  'status', 'pass',
  'sourceRows', (SELECT count(*) FROM cutover_source_integrator.user_reminder_delivery_logs),
  'rowsCopied', (SELECT count(*) FROM integrator.user_reminder_delivery_logs),
  'skippedWithoutOccurrence', (
    SELECT count(*) FROM cutover_source_integrator.user_reminder_delivery_logs source
    WHERE NOT EXISTS (
      SELECT 1 FROM integrator.user_reminder_occurrences occurrence
      WHERE occurrence.id = source.occurrence_id
    )
  )
)::text AS result
\gset cutover_d12_
SELECT :'cutover_d12_result'::json AS cutover_step_d12_reminder_delivery_logs;

-- Calendar sync memory follows the canonical appointment mapping. Unmapped stale provider rows
-- have no surviving appointment and are intentionally not copied.
\echo '=== CUTOVER STEP D13/24: carry canonical calendar mappings ==='
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

SELECT json_build_object(
  'status', 'pass',
  'sourceRows', (SELECT count(*) FROM cutover_source_integrator.booking_calendar_map),
  'canonicalMappings', (SELECT count(*) FROM public.booking_calendar_map),
  'staleUnmappedRowsDeliberatelySkipped', (
    SELECT count(*)
    FROM cutover_source_integrator.booking_calendar_map legacy
    LEFT JOIN cutover_source_public.be_external_entity_mappings mapping
      ON mapping.external_system = 'rubitime'
     AND mapping.entity_type = 'appointment'
     AND mapping.external_id = legacy.rubitime_record_id
    LEFT JOIN public.be_appointments appointment
      ON appointment.id = COALESCE(
        mapping.canonical_id,
        CASE
          WHEN legacy.rubitime_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN substring(legacy.rubitime_record_id FROM 4)::uuid
        END
      )
    WHERE appointment.id IS NULL
  )
)::text AS result
\gset cutover_d13_
SELECT :'cutover_d13_result'::json AS cutover_step_d13_calendar_mappings;

-- The one surviving clinical link is resolved through the same appointment mapping.
\echo '=== CUTOVER STEP D14/24: link clinical visits to canonical appointments ==='
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

SELECT json_build_object(
  'status', 'pass',
  'sourceVisitsWithAppointmentRecord', (
    SELECT count(*) FROM cutover_source_public.clinical_visit
    WHERE appointment_record_id IS NOT NULL
  ),
  'canonicalVisitLinks', (
    SELECT count(*) FROM public.clinical_visit WHERE canonical_appointment_id IS NOT NULL
  ),
  'unresolvedSourceVisitLinks', (
    SELECT count(*) FROM public.clinical_visit target
    JOIN cutover_source_public.clinical_visit source_visit ON source_visit.id = target.id
    WHERE source_visit.appointment_record_id IS NOT NULL AND target.canonical_appointment_id IS NULL
  )
)::text AS result
\gset cutover_d14_
SELECT :'cutover_d14_result'::json AS cutover_step_d14_clinical_visit_links;

-- Backfill every newly added organization_id for legacy one-tenant business rows. Global settings,
-- platform/operator audit and system configuration deliberately remain global (NULL organization).
\echo '=== CUTOVER STEP D15/24: backfill legacy one-tenant organization scope ==='
DO $legacy_organization_scope$
DECLARE
  relation record;
  affected_rows bigint;
  scoped_rows bigint := 0;
  scoped_relations bigint := 0;
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
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    scoped_rows := scoped_rows + affected_rows;
    scoped_relations := scoped_relations + 1;
  END LOOP;
  PERFORM set_config('bcb.cutover.d15.scoped_rows', scoped_rows::text, true);
  PERFORM set_config('bcb.cutover.d15.scoped_relations', scoped_relations::text, true);
END
$legacy_organization_scope$;

SELECT json_build_object(
  'status', 'pass',
  'canonicalOrganizationId', current_setting('bcb.cutover.canonical_organization_id'),
  'rowsScoped', current_setting('bcb.cutover.d15.scoped_rows')::bigint,
  'relationsVisited', current_setting('bcb.cutover.d15.scoped_relations')::bigint,
  'globalClassesDeliberatelyUnscoped', json_build_array(
    'admin_audit_log',
    'operator_health_failure_archive',
    'operator_incidents',
    'system_settings',
    'system_settings_audit'
  ),
  'backfillRule', 'target organization_id added where source had no organization_id'
)::text AS result
\gset cutover_d15_
SELECT :'cutover_d15_result'::json AS cutover_step_d15_legacy_organization_scope;

-- Preserve actionable drafts inside the canonical support-conversation path. Most source drafts
-- predate a conversation row, so create one deterministic holder per patient/channel when needed.
-- The retired integrator identity/table remains source-only; no compatibility mirror is recreated.
\echo '=== CUTOVER STEP D16/24: preserve actionable message drafts ==='
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
  ('media_playback_stats_hourly', (SELECT count(*) FROM cutover_source_public.media_playback_stats_hourly)),
  ('reminder_occurrence_history', (SELECT count(*) FROM cutover_source_public.reminder_occurrence_history));

SELECT json_build_object(
  'status', 'pass',
  'sourceDrafts', (SELECT count(*) FROM cutover_source_integrator.message_drafts),
  'preservedDrafts', (
    SELECT count(*)
    FROM public.support_conversations conversation
    CROSS JOIN LATERAL jsonb_array_elements(conversation.pending_message_drafts) draft_payload
    WHERE draft_payload->>'cutoverSource' = 'integrator.message_drafts'
  ),
  'draftContentMismatches', 0,
  'holderConversationsCreated', (
    SELECT count(*) FROM public.support_conversations
    WHERE integrator_conversation_id LIKE 'cutover-pending-drafts:%'
  )
)::text AS result
\gset cutover_d16_
SELECT :'cutover_d16_result'::json AS cutover_step_d16_message_drafts;

-- The separated identity profile is derived from the already owner-reviewed platform users.
\echo '=== CUTOVER STEP D17/24: build canonical identity profiles ==='
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

SELECT json_build_object(
  'status', 'pass',
  'canonicalPlatformUsers', (
    SELECT count(*) FROM public.platform_users WHERE merged_into_id IS NULL
  ),
  'identityProfiles', (SELECT count(*) FROM public.user_identity),
  'canonicalUsersWithoutIdentityProfile', (
    SELECT count(*) FROM public.platform_users user_row
    WHERE user_row.merged_into_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_identity identity_row
        WHERE identity_row.platform_user_id = user_row.id
      )
  )
)::text AS result
\gset cutover_d17_
SELECT :'cutover_d17_result'::json AS cutover_step_d17_identity_profiles;

\echo '=== CUTOVER STEP D18/24: build normalized identity contacts ==='
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

SELECT json_build_object(
  'status', 'pass',
  'phoneContacts', (SELECT count(*) FROM public.user_contacts WHERE contact_kind = 'phone'),
  'emailContacts', (SELECT count(*) FROM public.user_contacts WHERE contact_kind = 'email'),
  'primaryContacts', (SELECT count(*) FROM public.user_contacts WHERE is_primary),
  'contactValuesPrinted', false
)::text AS result
\gset cutover_d18_
SELECT :'cutover_d18_result'::json AS cutover_step_d18_identity_contacts;

-- Preserve current channel display/block facts before the legacy identity tables disappear.
\echo '=== CUTOVER STEP D19/24: preserve channel display and block facts ==='
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

SELECT json_build_object(
  'status', 'pass',
  'bindingsWithDisplayHandle', (
    SELECT count(*) FROM public.user_channel_bindings WHERE display_handle IS NOT NULL
  ),
  'blockedBindings', (
    SELECT count(*) FROM public.user_channel_bindings WHERE bot_blocked_at IS NOT NULL
  ),
  'personalValuesPrinted', false
)::text AS result
\gset cutover_d19_
SELECT :'cutover_d19_result'::json AS cutover_step_d19_channel_display_and_block_facts;

-- Будущие напоминания о приёме, ещё не отправленные на проде, переезжают в каноническую очередь.
-- Что это за строки: в `integrator.rubitime_create_retry_jobs` со статусом `pending` лежат
-- заготовленные заранее напоминания «приём через 24 часа» и «приём через 2 часа» (eventId вида
-- `booking-reminder:<bookingId>:24h`), у которых `next_try_at` — момент отправки в будущем. В
-- целевой схеме их никто не пересоздаёт: `app.replace_appointment_reminder_generation` вызывается
-- событием жизненного цикла записи, а не обходом уже существующих будущих приёмов. Не перенести —
-- значит молча не напомнить живому пациенту о его приёме.
--
-- Вид строки — существующий универсальный `outbound_message` (решение владельца 19.08: новых видов
-- не заводим, тип сообщения — это `purpose` ВНУТРИ вида). Форма payload собрана ровно так, как её
-- собирает `app.enqueue_outbound_message`, иначе воркер не распознает намерение. Статус переносится
-- дословно, `next_retry_at` — исходный `next_try_at`, поэтому напоминание уйдёт в свой срок, а не
-- сразу после переезда. Терминальные легаси-строки (`done`/`dead`) — уже отработанный след, их
-- перенос создал бы повторную отправку.
\echo '=== CUTOVER STEP D20/24: carry pending appointment reminders into delivery queue ==='
INSERT INTO public.outgoing_delivery_queue (
  event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
  next_retry_at, last_attempt_at, last_error, created_at, updated_at, organization_id
)
SELECT
  'appointment_reminder:' || (legacy.payload_json #>> '{intent,meta,eventId}'),
  'outbound_message',
  legacy.payload_json #>> '{targets,0,resource}',
  jsonb_build_object(
    'purpose', 'appointment_reminder',
    'booking', legacy.payload_json -> 'booking',
    'intent', jsonb_build_object(
      'type', 'message.send',
      'meta', jsonb_build_object(
        'eventId', 'appointment_reminder:' || (legacy.payload_json #>> '{intent,meta,eventId}'),
        'occurredAt', legacy.payload_json #>> '{intent,meta,occurredAt}',
        'source', legacy.payload_json #>> '{targets,0,resource}',
        'correlationId', 'appointment_reminder:' || (legacy.payload_json #>> '{intent,meta,eventId}'),
        'outboundMessageClass', 'routine_product',
        'outboundCapability', 'essential_delivery'
      ),
      'payload', jsonb_build_object(
        'recipient', legacy.payload_json #> '{targets,0,address}',
        'message', jsonb_build_object('text', legacy.payload_json #>> '{intent,payload,message,text}'),
        'delivery', jsonb_build_object(
          'channels', jsonb_build_array(legacy.payload_json #>> '{targets,0,resource}')
        )
      )
    )
  ),
  legacy.status,
  legacy.attempts_done,
  legacy.max_attempts,
  legacy.next_try_at,
  CASE WHEN legacy.attempts_done > 0 THEN legacy.updated_at ELSE NULL END,
  legacy.last_error,
  legacy.created_at,
  legacy.updated_at,
  current_setting('bcb.cutover.canonical_organization_id')::uuid
FROM cutover_source_integrator.rubitime_create_retry_jobs legacy
WHERE legacy.status = 'pending'
  AND NULLIF(legacy.payload_json #>> '{intent,payload,message,text}', '') IS NOT NULL
  AND (legacy.payload_json #>> '{targets,0,resource}') IN ('telegram', 'max')
  AND legacy.payload_json #> '{targets,0,address}' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.outgoing_delivery_queue existing
    WHERE existing.event_id
      = 'appointment_reminder:' || (legacy.payload_json #>> '{intent,meta,eventId}')
  );

WITH eligible AS (
  SELECT legacy.id,
         'appointment_reminder:' || (legacy.payload_json #>> '{intent,meta,eventId}') AS event_id
  FROM cutover_source_integrator.rubitime_create_retry_jobs legacy
  WHERE legacy.status = 'pending'
    AND NULLIF(legacy.payload_json #>> '{intent,payload,message,text}', '') IS NOT NULL
    AND (legacy.payload_json #>> '{targets,0,resource}') IN ('telegram', 'max')
    AND legacy.payload_json #> '{targets,0,address}' IS NOT NULL
), carried AS (
  SELECT target.*
  FROM eligible
  JOIN public.outgoing_delivery_queue target ON target.event_id = eligible.event_id
)
SELECT json_build_object(
  'status', 'pass',
  'pendingSourceRows', (
    SELECT count(*) FROM cutover_source_integrator.rubitime_create_retry_jobs WHERE status = 'pending'
  ),
  'rowsCarried', (SELECT count(*) FROM carried),
  'futureRowsCarried', (SELECT count(*) FROM carried WHERE next_retry_at > statement_timestamp()),
  'purpose', coalesce((SELECT min(payload_json ->> 'purpose') FROM carried), 'appointment_reminder'),
  'distinctPurposeValues', (SELECT count(DISTINCT payload_json ->> 'purpose') FROM carried),
  'earliestNextRetryAt', (SELECT min(next_retry_at) FROM carried),
  'latestNextRetryAt', (SELECT max(next_retry_at) FROM carried),
  'pendingRowsDeliberatelySkippedInvalidPayloadOrChannel', (
    (SELECT count(*) FROM cutover_source_integrator.rubitime_create_retry_jobs WHERE status = 'pending')
    - (SELECT count(*) FROM eligible)
  ),
  'terminalLegacyRowsDeliberatelySkipped', (
    SELECT count(*) FROM cutover_source_integrator.rubitime_create_retry_jobs
    WHERE status IN ('done', 'dead')
  )
)::text AS result
\gset cutover_d20_
SELECT :'cutover_d20_result'::json AS cutover_step_d20_appointment_reminders;

-- Rebuild the initial organization membership and patient visibility graph for every active
-- canonical client. Patient-domain references remain a closure oracle only; merged aliases are
-- resolved by the owner identity consolidation before this A -> B transition and are never enrolled.
\echo '=== CUTOVER STEP D21/24: rebuild organization membership and patient visibility ==='
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

SELECT json_build_object(
  'status', 'pass',
  'expectedActiveCanonicalClients', (
    SELECT count(*) FROM cutover_expected_active_canonical_client_membership
  ),
  'expectedPatientDomainReferences', (
    SELECT count(*) FROM cutover_expected_patient_domain_references
  ),
  'activeCanonicalEnrollments', (
    SELECT count(*) FROM public.org_enrollments
    WHERE organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND status = 'active'
  ),
  'activeCanonicalSpecialistLinks', (
    SELECT count(*) FROM public.patient_specialist_links
    WHERE organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      AND status = 'active'
  ),
  'activeOwnerMemberships', (
    SELECT count(*) FROM public.be_organization_members
    WHERE organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND role = 'owner' AND status = 'active'
  )
)::text AS result
\gset cutover_d21_
SELECT :'cutover_d21_result'::json AS cutover_step_d21_membership_and_visibility;

-- Reseed serial/identity sequences after explicit-id copy.
\echo '=== CUTOVER STEP D22/24: reseed serial and identity sequences ==='
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

SELECT json_build_object(
  'status', 'pass',
  'ownedSequencesReseeded', (
    SELECT count(*)
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = class.oid
    WHERE namespace.nspname IN ('public', 'integrator', 'drizzle')
      AND class.relkind IN ('r', 'p')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND pg_get_serial_sequence(
        format('%I.%I', namespace.nspname, class.relname), attribute.attname
      ) IS NOT NULL
  ),
  'emptyTablesUseNextValue', 1
)::text AS result
\gset cutover_d22_
SELECT :'cutover_d22_result'::json AS cutover_step_d22_reseed_sequences;

\echo '=== CUTOVER STEP D23/24: verify canonical identity-reference closure ==='
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

SELECT json_build_object(
  'status', 'pass',
  'reviewedReferenceClasses', (SELECT count(*) FROM cutover_reviewed_live_identity_references),
  'mergedAliasesRemaining', 0,
  'channelPreferenceRows', (SELECT count(*) FROM public.user_channel_preferences),
  'firstResolveRows', (SELECT count(*) FROM public.media_playback_user_video_first_resolve)
)::text AS result
\gset cutover_d23_
SELECT :'cutover_d23_result'::json AS cutover_step_d23_identity_reference_gate;

\echo '=== CUTOVER STEP D24/24: verify copied-data completeness and scope ==='
DO $copy_gate$
DECLARE
  violations bigint;
BEGIN
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
  FROM public.media_playback_stats_hourly
  WHERE organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid;
  IF violations <> 0 THEN RAISE EXCEPTION 'media playback hourly stats missing canonical organization: %', violations; END IF;
  IF (SELECT count(*) FROM public.media_playback_stats_hourly)
     <> (SELECT count(*) FROM cutover_source_public.media_playback_stats_hourly) THEN
    RAISE EXCEPTION 'media playback hourly stats row count changed during cutover';
  END IF;
END
$copy_gate$;

SELECT json_build_object(
  'status', 'pass',
  'copyViolations', 0,
  'reminderOccurrences', (SELECT count(*) FROM integrator.user_reminder_occurrences),
  'calendarMappings', (SELECT count(*) FROM public.booking_calendar_map),
  'playbackHourlyRows', (SELECT count(*) FROM public.media_playback_stats_hourly)
)::text AS result
\gset cutover_d24_
SELECT :'cutover_d24_result'::json AS cutover_step_d24_copy_completeness_gate;
