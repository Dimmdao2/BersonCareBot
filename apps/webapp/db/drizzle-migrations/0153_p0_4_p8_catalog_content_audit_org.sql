ALTER TABLE admin_audit_log
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE broadcast_audit
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE broadcast_audit_recipients
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis_catalog
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_test_regions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE content_access_grants_webapp
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE content_pages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE content_section_slug_history
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE content_sections
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE motivational_quotes
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE recommendation_regions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE reference_items
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE test_set_items
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE test_sets
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_organization_id
  ON admin_audit_log USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_audit_organization_id
  ON broadcast_audit USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_audit_recipients_organization_id
  ON broadcast_audit_recipients USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_diagnosis_catalog_organization_id
  ON clinical_diagnosis_catalog USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_test_regions_organization_id
  ON clinical_test_regions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_content_access_grants_webapp_organization_id
  ON content_access_grants_webapp USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_content_pages_organization_id
  ON content_pages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_content_section_slug_history_organization_id
  ON content_section_slug_history USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_content_sections_organization_id
  ON content_sections USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_courses_organization_id
  ON courses USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_motivational_quotes_organization_id
  ON motivational_quotes USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_regions_organization_id
  ON recommendation_regions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_organization_id
  ON recommendations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_reference_items_organization_id
  ON reference_items USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_test_set_items_organization_id
  ON test_set_items USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_test_sets_organization_id
  ON test_sets USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_tests_organization_id
  ON tests USING btree (organization_id);

DO $$
DECLARE
  v_table_name text;
  v_constraint_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'admin_audit_log',
    'broadcast_audit',
    'broadcast_audit_recipients',
    'clinical_diagnosis_catalog',
    'clinical_test_regions',
    'content_access_grants_webapp',
    'content_pages',
    'content_section_slug_history',
    'content_sections',
    'courses',
    'motivational_quotes',
    'recommendation_regions',
    'recommendations',
    'reference_items',
    'test_set_items',
    'test_sets',
    'tests'
  ]
  LOOP
    v_constraint_name := v_table_name || '_organization_id_fkey';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = v_constraint_name
        AND conrelid = v_table_name::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE',
        v_table_name,
        v_constraint_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
  v_multi_user_count bigint;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.P8 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  WITH referenced_users(platform_user_id) AS (
    SELECT actor_id FROM admin_audit_log WHERE actor_id IS NOT NULL
    UNION SELECT changed_by_user_id FROM content_section_slug_history WHERE changed_by_user_id IS NOT NULL
    UNION SELECT created_by FROM clinical_diagnosis_catalog WHERE created_by IS NOT NULL
    UNION SELECT created_by FROM recommendations WHERE created_by IS NOT NULL
    UNION SELECT created_by FROM test_sets WHERE created_by IS NOT NULL
    UNION SELECT created_by FROM tests WHERE created_by IS NOT NULL
    UNION SELECT platform_user_id FROM content_access_grants_webapp WHERE platform_user_id IS NOT NULL
    UNION SELECT actor_id::uuid FROM broadcast_audit WHERE actor_id ~ '^[0-9a-fA-F-]{36}$'
  ), active_org_counts AS (
    SELECT
      refs.platform_user_id,
      count(DISTINCT orgs.organization_id) AS organization_count
    FROM referenced_users refs
    LEFT JOIN (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
      ON orgs.platform_user_id = refs.platform_user_id
    GROUP BY refs.platform_user_id
  )
  SELECT count(*)::bigint
  INTO v_multi_user_count
  FROM active_org_counts
  WHERE organization_count > 1;

  IF v_multi_user_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P8 expected no multi-org referenced users, found % user keys', v_multi_user_count;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  UPDATE clinical_diagnosis_catalog
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE content_sections
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE content_pages
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE motivational_quotes
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE reference_items
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE recommendations
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE tests
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE test_sets
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE courses target
  SET organization_id = COALESCE(template.organization_id, intro_page.organization_id, v_default_org_id)
  FROM courses source
  LEFT JOIN treatment_program_templates template
    ON template.id = source.program_template_id
  LEFT JOIN content_pages intro_page
    ON intro_page.id = source.intro_lesson_page_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

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
  )
  UPDATE admin_audit_log target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM admin_audit_log source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.actor_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE broadcast_audit target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM broadcast_audit source
  LEFT JOIN user_org
    ON source.actor_id ~ '^[0-9a-fA-F-]{36}$'
   AND user_org.platform_user_id = source.actor_id::uuid
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  UPDATE broadcast_audit_recipients target
  SET organization_id = parent.organization_id
  FROM broadcast_audit parent
  WHERE target.organization_id IS NULL
    AND target.audit_id = parent.id
    AND parent.organization_id IS NOT NULL;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE content_section_slug_history target
  SET organization_id = COALESCE(section.organization_id, user_org.organization_id, v_default_org_id)
  FROM content_section_slug_history source
  LEFT JOIN content_sections section
    ON section.slug = source.new_slug
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.changed_by_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT platform_user.integrator_user_id, user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE content_access_grants_webapp target
  SET organization_id = COALESCE(
    platform_org.organization_id,
    integrator_user_org.organization_id,
    content_page.organization_id,
    v_default_org_id
  )
  FROM content_access_grants_webapp source
  LEFT JOIN user_org platform_org
    ON platform_org.platform_user_id = source.platform_user_id
  LEFT JOIN integrator_user_org
    ON integrator_user_org.integrator_user_id = source.integrator_user_id
  LEFT JOIN content_pages content_page
    ON content_page.id::text = source.content_id
    OR content_page.slug = source.content_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

UPDATE clinical_test_regions target
SET organization_id = parent.organization_id
FROM tests parent
WHERE target.organization_id IS NULL
  AND target.clinical_test_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE recommendation_regions target
SET organization_id = parent.organization_id
FROM recommendations parent
WHERE target.organization_id IS NULL
  AND target.recommendation_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE test_set_items target
SET organization_id = parent.organization_id
FROM test_sets parent
WHERE target.organization_id IS NULL
  AND target.test_set_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_null_count bigint;
  v_direct_org_null_count bigint;
  v_mismatch_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM admin_audit_log
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM broadcast_audit
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM broadcast_audit_recipients
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_diagnosis_catalog
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_test_regions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM content_access_grants_webapp
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM content_pages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM content_section_slug_history
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM content_sections
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM courses
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM motivational_quotes
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM recommendation_regions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM recommendations
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM reference_items
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM test_set_items
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM test_sets
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM tests
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P8 expected no NULL organization_id rows, found %', v_null_count;
  END IF;

  IF to_regclass('public.organization_member_invites') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM organization_member_invites'
    INTO v_direct_org_null_count;
    v_null_count := v_null_count + v_direct_org_null_count;
  END IF;

  IF to_regclass('public.saas_org_entitlement_overrides') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM saas_org_entitlement_overrides'
    INTO v_direct_org_null_count;
    v_null_count := v_null_count + v_direct_org_null_count;
  END IF;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P8 expected no NULL organization_id rows, found %', v_null_count;
  END IF;

  WITH mismatches AS (
    SELECT count(*) AS mismatch_count
    FROM broadcast_audit_recipients child
    JOIN broadcast_audit parent
      ON parent.id = child.audit_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM content_section_slug_history child
    JOIN content_sections parent
      ON parent.slug = child.new_slug
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM clinical_test_regions child
    JOIN tests parent
      ON parent.id = child.clinical_test_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM recommendation_regions child
    JOIN recommendations parent
      ON parent.id = child.recommendation_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM test_set_items child
    JOIN test_sets parent
      ON parent.id = child.test_set_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM courses child
    JOIN treatment_program_templates parent
      ON parent.id = child.program_template_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM content_pages child
    JOIN courses parent
      ON parent.id = child.linked_course_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
  )
  SELECT sum(mismatch_count)::bigint
  INTO v_mismatch_count
  FROM mismatches;

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P8 expected no child/parent org mismatches, found %', v_mismatch_count;
  END IF;
END $$;
