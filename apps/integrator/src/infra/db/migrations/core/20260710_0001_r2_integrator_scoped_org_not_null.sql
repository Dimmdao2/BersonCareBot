-- R2 tenant-isolation invariant:
-- every SCOPED integrator row must have a non-NULL organization_id before strict RLS enforcement.
--
-- POLICY:
-- - Current writers persist organization_id from the inbound channel principal; this migration preserves
--   existing non-NULL values and repairs only historical NULL rows.
-- - Pre-enrollment / first-contact rows resolve to the organization of the inbound channel. Historical
--   channel rows do not store an explicit channel->organization binding yet, so the current single-org
--   deployment represents that channel organization through the single row in public.be_organizations.
-- - Rows resolvable through exactly one active enrollment / organization membership of the integrator
--   user use that organization.
-- - Historically unresolvable rows fall back only when exactly one organization exists today. If more
--   than one organization exists and a NULL remains unresolved, the migration fails before SET NOT NULL.
--
-- DOWN / manual rollback (integrator migrator is forward-only):
--   BEGIN;
--   ALTER TABLE integrator.contacts ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.content_access_grants ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.user_reminder_rules ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.user_subscriptions ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.conversations ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.message_drafts ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.user_questions ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.mailings ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.mailing_logs ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.conversation_messages ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.question_messages ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.user_reminder_occurrences ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE integrator.user_reminder_delivery_logs ALTER COLUMN organization_id DROP NOT NULL;
--   DO $down$
--   BEGIN
--     IF EXISTS (
--       SELECT 1 FROM information_schema.columns
--       WHERE table_schema = 'integrator'
--         AND table_name = 'schema_migrations'
--         AND column_name = 'version'
--     ) THEN
--       DELETE FROM integrator.schema_migrations
--       WHERE version = 'core:20260710_0001_r2_integrator_scoped_org_not_null.sql';
--     ELSIF EXISTS (
--       SELECT 1 FROM information_schema.columns
--       WHERE table_schema = 'integrator'
--         AND table_name = 'schema_migrations'
--         AND column_name = 'filename'
--     ) THEN
--       DELETE FROM integrator.schema_migrations
--       WHERE filename = '20260710_0001_r2_integrator_scoped_org_not_null.sql';
--     END IF;
--   END $down$;
--   COMMIT;

DROP TABLE IF EXISTS pg_temp.r2_single_existing_org;
CREATE TEMP TABLE r2_single_existing_org ON COMMIT DROP AS
SELECT (array_agg(id ORDER BY id))[1]::uuid AS organization_id
FROM public.be_organizations
HAVING count(*) = 1;

DROP TABLE IF EXISTS pg_temp.r2_integrator_user_org;
CREATE TEMP TABLE r2_integrator_user_org ON COMMIT DROP AS
WITH active_user_orgs AS (
  SELECT platform_user_id, organization_id
  FROM public.org_enrollments
  WHERE status = 'active'
  UNION
  SELECT platform_user_id, organization_id
  FROM public.be_organization_members
  WHERE status = 'active'
)
SELECT
  platform_user.integrator_user_id::bigint AS user_id,
  (array_agg(DISTINCT active_user_orgs.organization_id ORDER BY active_user_orgs.organization_id))[1]::uuid AS organization_id
FROM public.platform_users platform_user
JOIN active_user_orgs
  ON active_user_orgs.platform_user_id = platform_user.id
WHERE platform_user.integrator_user_id IS NOT NULL
GROUP BY platform_user.integrator_user_id
HAVING count(DISTINCT active_user_orgs.organization_id) = 1;

CREATE UNIQUE INDEX r2_integrator_user_org_user_id_uidx
  ON r2_integrator_user_org (user_id);

DROP TABLE IF EXISTS pg_temp.r2_identity_org;
CREATE TEMP TABLE r2_identity_org ON COMMIT DROP AS
SELECT
  identity_row.id AS identity_id,
  COALESCE(user_org.organization_id, single_org.organization_id) AS organization_id
FROM integrator.identities identity_row
LEFT JOIN r2_integrator_user_org user_org
  ON user_org.user_id = identity_row.user_id
LEFT JOIN r2_single_existing_org single_org
  ON true;

CREATE UNIQUE INDEX r2_identity_org_identity_id_uidx
  ON r2_identity_org (identity_id);

DO $$
DECLARE
  v_total_org_count bigint;
  v_single_org_id uuid;
BEGIN
  SELECT count(*), (array_agg(id ORDER BY id))[1]::uuid
  INTO v_total_org_count, v_single_org_id
  FROM public.be_organizations;

  RAISE NOTICE 'R2 integrator SCOPED organization_id fallback: total organizations %, single-org fallback %',
    v_total_org_count,
    v_single_org_id;
END $$;

UPDATE integrator.mailings target
SET organization_id = single_org.organization_id
FROM r2_single_existing_org single_org
WHERE target.organization_id IS NULL
  AND single_org.organization_id IS NOT NULL;

UPDATE integrator.contacts target
SET organization_id = COALESCE(user_org.organization_id, single_org.organization_id)
FROM integrator.contacts source
LEFT JOIN r2_integrator_user_org user_org
  ON user_org.user_id = source.user_id
LEFT JOIN r2_single_existing_org single_org
  ON true
WHERE target.organization_id IS NULL
  AND target.id = source.id
  AND COALESCE(user_org.organization_id, single_org.organization_id) IS NOT NULL;

UPDATE integrator.content_access_grants target
SET organization_id = COALESCE(user_org.organization_id, single_org.organization_id)
FROM integrator.content_access_grants source
LEFT JOIN r2_integrator_user_org user_org
  ON user_org.user_id = source.user_id
LEFT JOIN r2_single_existing_org single_org
  ON true
WHERE target.organization_id IS NULL
  AND target.id = source.id
  AND COALESCE(user_org.organization_id, single_org.organization_id) IS NOT NULL;

UPDATE integrator.user_reminder_rules target
SET organization_id = COALESCE(user_org.organization_id, single_org.organization_id)
FROM integrator.user_reminder_rules source
LEFT JOIN r2_integrator_user_org user_org
  ON user_org.user_id = source.user_id
LEFT JOIN r2_single_existing_org single_org
  ON true
WHERE target.organization_id IS NULL
  AND target.id = source.id
  AND COALESCE(user_org.organization_id, single_org.organization_id) IS NOT NULL;

SET LOCAL app.stage13_bypass = 'true';

UPDATE integrator.user_subscriptions target
SET organization_id = COALESCE(user_org.organization_id, single_org.organization_id)
FROM integrator.user_subscriptions source
LEFT JOIN r2_integrator_user_org user_org
  ON user_org.user_id = source.user_id
LEFT JOIN r2_single_existing_org single_org
  ON true
WHERE target.organization_id IS NULL
  AND target.user_id = source.user_id
  AND target.topic_id = source.topic_id
  AND COALESCE(user_org.organization_id, single_org.organization_id) IS NOT NULL;

UPDATE integrator.conversations target
SET organization_id = identity_org.organization_id
FROM integrator.conversations source
JOIN r2_identity_org identity_org
  ON identity_org.identity_id = source.user_identity_id
WHERE target.organization_id IS NULL
  AND target.id = source.id
  AND identity_org.organization_id IS NOT NULL;

UPDATE integrator.message_drafts target
SET organization_id = identity_org.organization_id
FROM integrator.message_drafts source
JOIN r2_identity_org identity_org
  ON identity_org.identity_id = source.identity_id
WHERE target.organization_id IS NULL
  AND target.id = source.id
  AND identity_org.organization_id IS NOT NULL;

UPDATE integrator.user_questions target
SET organization_id = COALESCE(parent_conversation.organization_id, identity_org.organization_id)
FROM integrator.user_questions source
JOIN r2_identity_org identity_org
  ON identity_org.identity_id = source.user_identity_id
LEFT JOIN integrator.conversations parent_conversation
  ON parent_conversation.id = source.conversation_id
WHERE target.organization_id IS NULL
  AND target.id = source.id
  AND COALESCE(parent_conversation.organization_id, identity_org.organization_id) IS NOT NULL;

UPDATE integrator.mailing_logs target
SET organization_id = COALESCE(parent_mailing.organization_id, user_org.organization_id, single_org.organization_id)
FROM integrator.mailing_logs source
LEFT JOIN integrator.mailings parent_mailing
  ON parent_mailing.id = source.mailing_id
LEFT JOIN r2_integrator_user_org user_org
  ON user_org.user_id = source.user_id
LEFT JOIN r2_single_existing_org single_org
  ON true
WHERE target.organization_id IS NULL
  AND target.user_id = source.user_id
  AND target.mailing_id = source.mailing_id
  AND COALESCE(parent_mailing.organization_id, user_org.organization_id, single_org.organization_id) IS NOT NULL;

UPDATE integrator.conversation_messages target
SET organization_id = parent.organization_id
FROM integrator.conversations parent
WHERE target.organization_id IS NULL
  AND target.conversation_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE integrator.question_messages target
SET organization_id = parent.organization_id
FROM integrator.user_questions parent
WHERE target.organization_id IS NULL
  AND target.question_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE integrator.user_reminder_occurrences target
SET organization_id = parent.organization_id
FROM integrator.user_reminder_rules parent
WHERE target.organization_id IS NULL
  AND target.rule_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE integrator.user_reminder_delivery_logs target
SET organization_id = parent.organization_id
FROM integrator.user_reminder_occurrences parent
WHERE target.organization_id IS NULL
  AND target.occurrence_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_null_count bigint;
  v_child_mismatch_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM integrator.contacts
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.content_access_grants
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_reminder_rules
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_subscriptions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.conversations
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.message_drafts
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_questions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.mailings
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.mailing_logs
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.conversation_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.question_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_reminder_occurrences
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_reminder_delivery_logs
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'R2 integrator SCOPED expected no NULL organization_id rows before NOT NULL, found %',
      v_null_count;
  END IF;

  SELECT sum(mismatch_rows)
  INTO v_child_mismatch_count
  FROM (
    SELECT count(*)::bigint AS mismatch_rows
    FROM integrator.conversation_messages child
    JOIN integrator.conversations parent
      ON parent.id = child.conversation_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)::bigint
    FROM integrator.question_messages child
    JOIN integrator.user_questions parent
      ON parent.id = child.question_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)::bigint
    FROM integrator.user_reminder_occurrences child
    JOIN integrator.user_reminder_rules parent
      ON parent.id = child.rule_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)::bigint
    FROM integrator.user_reminder_delivery_logs child
    JOIN integrator.user_reminder_occurrences parent
      ON parent.id = child.occurrence_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
  ) mismatches;

  IF v_child_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'R2 integrator SCOPED expected no child/parent organization mismatches before NOT NULL, found %',
      v_child_mismatch_count;
  END IF;
END $$;

ALTER TABLE integrator.contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.content_access_grants ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_reminder_rules ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_subscriptions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.conversations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.message_drafts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_questions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.mailings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.mailing_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.conversation_messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.question_messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_reminder_occurrences ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_reminder_delivery_logs ALTER COLUMN organization_id SET NOT NULL;
