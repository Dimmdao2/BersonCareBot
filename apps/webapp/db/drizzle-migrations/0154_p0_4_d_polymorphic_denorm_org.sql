ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_home_block_items
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_comments_organization_id
  ON comments USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_home_block_items_organization_id
  ON patient_home_block_items USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_organization_id_fkey'
      AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_home_block_items_organization_id_fkey'
      AND conrelid = 'patient_home_block_items'::regclass
  ) THEN
    ALTER TABLE patient_home_block_items
      ADD CONSTRAINT patient_home_block_items_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
  v_multi_author_count bigint;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.D expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  WITH active_org_counts AS (
    SELECT
      comments.author_id,
      count(DISTINCT orgs.organization_id) AS organization_count
    FROM comments
    LEFT JOIN (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
      ON orgs.platform_user_id = comments.author_id
    GROUP BY comments.author_id
  )
  SELECT count(*)::bigint
  INTO v_multi_author_count
  FROM active_org_counts
  WHERE organization_count > 1;

  IF v_multi_author_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.D expected no multi-org comment authors, found % author keys', v_multi_author_count;
  END IF;
END $$;

UPDATE patient_home_block_items target
SET organization_id = parent.organization_id
FROM patient_home_blocks parent
WHERE target.organization_id IS NULL
  AND target.block_code = parent.code
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), resolved_comment_org AS (
    SELECT
      comment.id,
      COALESCE(
        exercise.organization_id,
        lfk_complex.organization_id,
        clinical_test.organization_id,
        test_set.organization_id,
        recommendation.organization_id,
        lesson.organization_id,
        stage_item.organization_id,
        stage.organization_id,
        program.organization_id,
        author_org.organization_id,
        v_default_org_id
      ) AS organization_id
    FROM comments comment
    LEFT JOIN lfk_exercises exercise
      ON comment.target_type = 'exercise'
     AND exercise.id = comment.target_id
    LEFT JOIN lfk_complexes lfk_complex
      ON comment.target_type = 'lfk_complex'
     AND lfk_complex.id = comment.target_id
    LEFT JOIN tests clinical_test
      ON comment.target_type = 'test'
     AND clinical_test.id = comment.target_id
    LEFT JOIN test_sets test_set
      ON comment.target_type = 'test_set'
     AND test_set.id = comment.target_id
    LEFT JOIN recommendations recommendation
      ON comment.target_type = 'recommendation'
     AND recommendation.id = comment.target_id
    LEFT JOIN content_pages lesson
      ON comment.target_type = 'lesson'
     AND lesson.id = comment.target_id
    LEFT JOIN treatment_program_instance_stage_items stage_item
      ON comment.target_type = 'stage_item_instance'
     AND stage_item.id = comment.target_id
    LEFT JOIN treatment_program_instance_stages stage
      ON comment.target_type = 'stage_instance'
     AND stage.id = comment.target_id
    LEFT JOIN treatment_program_instances program
      ON comment.target_type = 'program_instance'
     AND program.id = comment.target_id
    LEFT JOIN user_org author_org
      ON author_org.platform_user_id = comment.author_id
  )
  UPDATE comments target
  SET organization_id = resolved.organization_id
  FROM resolved_comment_org resolved
  WHERE target.organization_id IS NULL
    AND target.id = resolved.id;
END $$;

DO $$
DECLARE
  v_null_count bigint;
  v_mismatch_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM comments
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_home_block_items
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.D expected no NULL organization_id rows, found %', v_null_count;
  END IF;

  WITH mismatches AS (
    SELECT count(*) AS mismatch_count
    FROM patient_home_block_items child
    JOIN patient_home_blocks parent
      ON parent.code = child.block_code
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN lfk_exercises parent
      ON child.target_type = 'exercise'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN lfk_complexes parent
      ON child.target_type = 'lfk_complex'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN tests parent
      ON child.target_type = 'test'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN test_sets parent
      ON child.target_type = 'test_set'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN recommendations parent
      ON child.target_type = 'recommendation'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN content_pages parent
      ON child.target_type = 'lesson'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN treatment_program_instance_stage_items parent
      ON child.target_type = 'stage_item_instance'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN treatment_program_instance_stages parent
      ON child.target_type = 'stage_instance'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM comments child
    JOIN treatment_program_instances parent
      ON child.target_type = 'program_instance'
     AND parent.id = child.target_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
  )
  SELECT sum(mismatch_count)::bigint
  INTO v_mismatch_count
  FROM mismatches;

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.D expected no resolver/parent org mismatches, found %', v_mismatch_count;
  END IF;
END $$;
