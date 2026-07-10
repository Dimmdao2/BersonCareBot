ALTER TABLE doctor_notes
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE doctor_patient_support
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE specialist_tasks
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_conversation_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_delivery_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_question_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_questions
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_doctor_notes_organization_id
  ON doctor_notes USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_doctor_patient_support_organization_id
  ON doctor_patient_support USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_specialist_tasks_organization_id
  ON specialist_tasks USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_organization_id
  ON support_conversations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_conversation_messages_organization_id
  ON support_conversation_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_delivery_events_organization_id
  ON support_delivery_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_question_messages_organization_id
  ON support_question_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_questions_organization_id
  ON support_questions USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctor_notes_organization_id_fkey'
      AND conrelid = 'doctor_notes'::regclass
  ) THEN
    ALTER TABLE doctor_notes
      ADD CONSTRAINT doctor_notes_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctor_patient_support_organization_id_fkey'
      AND conrelid = 'doctor_patient_support'::regclass
  ) THEN
    ALTER TABLE doctor_patient_support
      ADD CONSTRAINT doctor_patient_support_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'specialist_tasks_organization_id_fkey'
      AND conrelid = 'specialist_tasks'::regclass
  ) THEN
    ALTER TABLE specialist_tasks
      ADD CONSTRAINT specialist_tasks_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_conversations_organization_id_fkey'
      AND conrelid = 'support_conversations'::regclass
  ) THEN
    ALTER TABLE support_conversations
      ADD CONSTRAINT support_conversations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_conversation_messages_organization_id_fkey'
      AND conrelid = 'support_conversation_messages'::regclass
  ) THEN
    ALTER TABLE support_conversation_messages
      ADD CONSTRAINT support_conversation_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_delivery_events_organization_id_fkey'
      AND conrelid = 'support_delivery_events'::regclass
  ) THEN
    ALTER TABLE support_delivery_events
      ADD CONSTRAINT support_delivery_events_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_question_messages_organization_id_fkey'
      AND conrelid = 'support_question_messages'::regclass
  ) THEN
    ALTER TABLE support_question_messages
      ADD CONSTRAINT support_question_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_questions_organization_id_fkey'
      AND conrelid = 'support_questions'::regclass
  ) THEN
    ALTER TABLE support_questions
      ADD CONSTRAINT support_questions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.P6 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;
END $$;

DO $$
DECLARE
  v_patient_multi_count bigint;
  v_member_multi_count bigint;
  v_mismatch_count bigint;
BEGIN
  WITH active_patient_org_counts AS (
    SELECT platform_user_id, count(DISTINCT organization_id) AS organization_count
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
  ), patient_roots AS (
    SELECT patient_user_id AS platform_user_id FROM doctor_patient_support
    UNION ALL SELECT platform_user_id FROM support_conversations WHERE platform_user_id IS NOT NULL
    UNION ALL SELECT user_id FROM doctor_notes
    UNION ALL SELECT patient_user_id FROM specialist_tasks WHERE patient_user_id IS NOT NULL
  )
  SELECT count(*)::bigint
  INTO v_patient_multi_count
  FROM patient_roots root
  JOIN active_patient_org_counts org_count
    ON org_count.platform_user_id = root.platform_user_id
  WHERE org_count.organization_count > 1;

  IF v_patient_multi_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P6 expected no multi-org patient rows, found %', v_patient_multi_count;
  END IF;

  WITH active_member_org_counts AS (
    SELECT platform_user_id, count(DISTINCT organization_id) AS organization_count
    FROM be_organization_members
    WHERE status = 'active'
    GROUP BY platform_user_id
  ), member_roots AS (
    SELECT author_id AS platform_user_id FROM doctor_notes
    UNION ALL SELECT owner_user_id FROM specialist_tasks
  )
  SELECT count(*)::bigint
  INTO v_member_multi_count
  FROM member_roots root
  JOIN active_member_org_counts org_count
    ON org_count.platform_user_id = root.platform_user_id
  WHERE org_count.organization_count > 1;

  IF v_member_multi_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P6 expected no multi-org staff rows, found %', v_member_multi_count;
  END IF;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), member_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM be_organization_members
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), mismatches AS (
    SELECT count(*) AS mismatch_count
    FROM doctor_notes note
    JOIN patient_org patient ON patient.platform_user_id = note.user_id
    JOIN member_org author ON author.platform_user_id = note.author_id
    WHERE patient.organization_id IS DISTINCT FROM author.organization_id
    UNION ALL
    SELECT count(*) AS mismatch_count
    FROM specialist_tasks task
    JOIN member_org owner_org ON owner_org.platform_user_id = task.owner_user_id
    JOIN patient_org patient ON patient.platform_user_id = task.patient_user_id
    WHERE owner_org.organization_id IS DISTINCT FROM patient.organization_id
  )
  SELECT sum(mismatch_count)::bigint
  INTO v_mismatch_count
  FROM mismatches;

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P6 expected no staff/patient org mismatches, found %', v_mismatch_count;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_doctor_support_default_rows bigint;
  v_doctor_notes_default_rows bigint;
  v_specialist_tasks_default_rows bigint;
  v_support_conversations_default_rows bigint;
  v_support_questions_default_rows bigint;
  v_support_delivery_events_default_rows bigint;
BEGIN
  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE doctor_patient_support target
  SET organization_id = COALESCE(patient_org.organization_id, v_default_org_id)
  FROM doctor_patient_support source
  LEFT JOIN patient_org
    ON patient_org.platform_user_id = source.patient_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), member_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM be_organization_members
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE doctor_notes target
  SET organization_id = COALESCE(patient_org.organization_id, author.organization_id, v_default_org_id)
  FROM doctor_notes source
  LEFT JOIN patient_org
    ON patient_org.platform_user_id = source.user_id
  LEFT JOIN member_org author
    ON author.platform_user_id = source.author_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), member_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM be_organization_members
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE specialist_tasks target
  SET organization_id = COALESCE(owner_org.organization_id, patient_org.organization_id, v_default_org_id)
  FROM specialist_tasks source
  LEFT JOIN member_org owner_org
    ON owner_org.platform_user_id = source.owner_user_id
  LEFT JOIN patient_org
    ON patient_org.platform_user_id = source.patient_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE support_conversations target
  SET organization_id = COALESCE(patient_org.organization_id, v_default_org_id)
  FROM support_conversations source
  LEFT JOIN patient_org
    ON patient_org.platform_user_id = source.platform_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  UPDATE support_conversation_messages target
  SET organization_id = parent.organization_id
  FROM support_conversations parent
  WHERE target.organization_id IS NULL
    AND target.conversation_id = parent.id
    AND parent.organization_id IS NOT NULL;

  UPDATE support_questions target
  SET organization_id = COALESCE(parent.organization_id, v_default_org_id)
  FROM support_questions source
  LEFT JOIN support_conversations parent
    ON parent.id = source.conversation_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  UPDATE support_question_messages target
  SET organization_id = parent.organization_id
  FROM support_questions parent
  WHERE target.organization_id IS NULL
    AND target.question_id = parent.id
    AND parent.organization_id IS NOT NULL;

  UPDATE support_delivery_events target
  SET organization_id = COALESCE(parent.organization_id, v_default_org_id)
  FROM support_delivery_events source
  LEFT JOIN support_conversation_messages parent
    ON parent.id = source.conversation_message_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  SELECT count(*)::bigint
  INTO v_doctor_support_default_rows
  FROM doctor_patient_support support
  LEFT JOIN patient_org patient
    ON patient.platform_user_id = support.patient_user_id
  WHERE patient.organization_id IS NULL;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), member_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM be_organization_members
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  SELECT count(*)::bigint
  INTO v_doctor_notes_default_rows
  FROM doctor_notes note
  LEFT JOIN patient_org patient
    ON patient.platform_user_id = note.user_id
  LEFT JOIN member_org author
    ON author.platform_user_id = note.author_id
  WHERE patient.organization_id IS NULL
    AND author.organization_id IS NULL;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), member_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM be_organization_members
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  SELECT count(*)::bigint
  INTO v_specialist_tasks_default_rows
  FROM specialist_tasks task
  LEFT JOIN member_org owner_org
    ON owner_org.platform_user_id = task.owner_user_id
  LEFT JOIN patient_org patient
    ON patient.platform_user_id = task.patient_user_id
  WHERE owner_org.organization_id IS NULL
    AND patient.organization_id IS NULL;

  WITH patient_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  SELECT count(*)::bigint
  INTO v_support_conversations_default_rows
  FROM support_conversations conversation
  LEFT JOIN patient_org patient
    ON patient.platform_user_id = conversation.platform_user_id
  WHERE patient.organization_id IS NULL;

  SELECT count(*)::bigint
  INTO v_support_questions_default_rows
  FROM support_questions question
  LEFT JOIN support_conversations conversation
    ON conversation.id = question.conversation_id
  WHERE conversation.id IS NULL;

  SELECT count(*)::bigint
  INTO v_support_delivery_events_default_rows
  FROM support_delivery_events event
  LEFT JOIN support_conversation_messages message
    ON message.id = event.conversation_message_id
  WHERE message.id IS NULL;

  RAISE NOTICE 'P0.4.P6 default-org fallback counts: doctor_patient_support=%, doctor_notes=%, specialist_tasks=%, support_conversations=%, support_questions_without_conversation=%, support_delivery_events_without_message=%',
    v_doctor_support_default_rows,
    v_doctor_notes_default_rows,
    v_specialist_tasks_default_rows,
    v_support_conversations_default_rows,
    v_support_questions_default_rows,
    v_support_delivery_events_default_rows;
END $$;

DO $$
DECLARE
  v_null_count bigint;
  v_child_mismatch_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM doctor_notes
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM doctor_patient_support
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM specialist_tasks
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM support_conversations
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM support_conversation_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM support_delivery_events
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM support_question_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM support_questions
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P6 expected no NULL organization_id rows, found %', v_null_count;
  END IF;

  SELECT sum(mismatch_rows)
  INTO v_child_mismatch_count
  FROM (
    SELECT count(*) AS mismatch_rows
    FROM support_conversation_messages child
    JOIN support_conversations parent
      ON parent.id = child.conversation_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*) AS mismatch_rows
    FROM support_questions child
    JOIN support_conversations parent
      ON parent.id = child.conversation_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*) AS mismatch_rows
    FROM support_question_messages child
    JOIN support_questions parent
      ON parent.id = child.question_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*) AS mismatch_rows
    FROM support_delivery_events child
    JOIN support_conversation_messages parent
      ON parent.id = child.conversation_message_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
  ) checks;

  IF v_child_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P6 expected no child/parent organization_id mismatches, found %', v_child_mismatch_count;
  END IF;
END $$;
