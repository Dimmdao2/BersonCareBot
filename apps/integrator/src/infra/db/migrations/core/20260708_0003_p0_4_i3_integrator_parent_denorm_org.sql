ALTER TABLE integrator.conversation_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.question_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_occurrences
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_delivery_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_organization_id
  ON integrator.conversation_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_question_messages_organization_id
  ON integrator.question_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_reminder_occurrences_organization_id
  ON integrator.user_reminder_occurrences USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_reminder_delivery_logs_organization_id
  ON integrator.user_reminder_delivery_logs USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_messages_organization_id_fkey'
      AND conrelid = 'integrator.conversation_messages'::regclass
  ) THEN
    ALTER TABLE integrator.conversation_messages
      ADD CONSTRAINT conversation_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'question_messages_organization_id_fkey'
      AND conrelid = 'integrator.question_messages'::regclass
  ) THEN
    ALTER TABLE integrator.question_messages
      ADD CONSTRAINT question_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_reminder_occurrences_organization_id_fkey'
      AND conrelid = 'integrator.user_reminder_occurrences'::regclass
  ) THEN
    ALTER TABLE integrator.user_reminder_occurrences
      ADD CONSTRAINT user_reminder_occurrences_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_reminder_delivery_logs_organization_id_fkey'
      AND conrelid = 'integrator.user_reminder_delivery_logs'::regclass
  ) THEN
    ALTER TABLE integrator.user_reminder_delivery_logs
      ADD CONSTRAINT user_reminder_delivery_logs_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

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
  v_mismatch_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM integrator.conversation_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.question_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_reminder_occurrences
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_reminder_delivery_logs
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.I3 expected no NULL organization_id rows, found %', v_null_count;
  END IF;

  SELECT sum(mismatch_rows)
  INTO v_mismatch_count
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

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.I3 expected no child/parent organization mismatches, found %', v_mismatch_count;
  END IF;
END $$;
