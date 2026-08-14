-- The webapp D8 retirement runs before the deferred integrator SaaS phase and removes the three
-- mailing-domain tables. The older I1/I4/R2 migrations cannot then alter those deliberately absent
-- relations. This forward migration represents their current end-state without resurrecting them.
-- RECONCILES-INTEGRATOR-MIGRATION: core:20260708_0001_p0_4_i1_integrator_direct_user_org.sql
-- RECONCILES-INTEGRATOR-MIGRATION: core:20260708_0004_p0_4_i4_integrator_mailings_org.sql
-- RECONCILES-INTEGRATOR-MIGRATION: core:20260710_0001_r2_integrator_scoped_org_not_null.sql

DO $reconcile_retired_mailing_org$
DECLARE
  v_table_name name;
  v_relation regclass;
  v_org_count bigint;
  v_only_org_id uuid;
  v_null_count bigint;
  v_organization_attnum smallint;
  v_org_id_attnum smallint;
BEGIN
  SELECT count(*), (array_agg(id ORDER BY id))[1]
    INTO v_org_count, v_only_org_id
    FROM public.be_organizations;

  SELECT attnum
    INTO v_org_id_attnum
    FROM pg_catalog.pg_attribute
   WHERE attrelid = 'public.be_organizations'::regclass
     AND attname = 'id'
     AND attnum > 0
     AND NOT attisdropped;

  FOREACH v_table_name IN ARRAY ARRAY[
    'contacts',
    'content_access_grants',
    'conversation_messages',
    'conversations',
    'mailing_logs',
    'mailings',
    'message_drafts',
    'question_messages',
    'user_questions',
    'user_reminder_delivery_logs',
    'user_reminder_occurrences',
    'user_reminder_rules',
    'user_subscriptions'
  ]::name[] LOOP
    v_relation := to_regclass(format('integrator.%I', v_table_name));
    IF v_relation IS NULL THEN
      CONTINUE;
    END IF;

    SELECT attnum
      INTO v_organization_attnum
      FROM pg_catalog.pg_attribute
     WHERE attrelid = v_relation
       AND attname = 'organization_id'
       AND attnum > 0
       AND NOT attisdropped;
    IF v_organization_attnum IS NULL THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN organization_id uuid', v_relation);
      SELECT attnum
        INTO v_organization_attnum
        FROM pg_catalog.pg_attribute
       WHERE attrelid = v_relation
         AND attname = 'organization_id'
         AND attnum > 0
         AND NOT attisdropped;
    END IF;

    EXECUTE format('SELECT count(*) FROM %s WHERE organization_id IS NULL', v_relation)
      INTO v_null_count;
    IF v_null_count > 0 THEN
      IF v_org_count <> 1 OR v_only_org_id IS NULL THEN
        RAISE EXCEPTION
          'reconciliation found % NULL organization rows in % with % organizations; automatic assignment is ambiguous',
          v_null_count, v_relation, v_org_count;
      END IF;
      EXECUTE format('UPDATE %s SET organization_id = $1 WHERE organization_id IS NULL', v_relation)
        USING v_only_org_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.contype = 'f'
         AND constraint_row.conrelid = v_relation
         AND constraint_row.confrelid = 'public.be_organizations'::regclass
         AND constraint_row.conkey = ARRAY[v_organization_attnum]::smallint[]
         AND constraint_row.confkey = ARRAY[v_org_id_attnum]::smallint[]
    ) THEN
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE',
        v_relation,
        v_table_name || '_organization_id_fkey'
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %s USING btree (organization_id)',
      'idx_' || v_table_name || '_organization_id',
      v_relation
    );
    EXECUTE format('ALTER TABLE %s ALTER COLUMN organization_id SET NOT NULL', v_relation);
  END LOOP;
END
$reconcile_retired_mailing_org$;
