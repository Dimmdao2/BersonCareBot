ALTER TABLE treatment_program_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_template_stages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_template_stage_groups
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_template_stage_items
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instances
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instance_stages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instance_stage_groups
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instance_stage_items
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE program_action_log
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE program_item_discussion_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE program_item_discussion_reads
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_treatment_program_templates_organization_id
  ON treatment_program_templates USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_template_stages_organization_id
  ON treatment_program_template_stages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_template_stage_groups_organization_id
  ON treatment_program_template_stage_groups USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_template_stage_items_organization_id
  ON treatment_program_template_stage_items USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_instances_organization_id
  ON treatment_program_instances USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_instance_stages_organization_id
  ON treatment_program_instance_stages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_instance_stage_groups_organization_id
  ON treatment_program_instance_stage_groups USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_instance_stage_items_organization_id
  ON treatment_program_instance_stage_items USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_program_action_log_organization_id
  ON program_action_log USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_program_item_discussion_messages_organization_id
  ON program_item_discussion_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_program_item_discussion_reads_organization_id
  ON program_item_discussion_reads USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_program_events_organization_id
  ON treatment_program_events USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_templates_organization_id_fkey') THEN
    ALTER TABLE treatment_program_templates
      ADD CONSTRAINT treatment_program_templates_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_template_stages_organization_id_fkey') THEN
    ALTER TABLE treatment_program_template_stages
      ADD CONSTRAINT treatment_program_template_stages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_template_stage_groups_organization_id_fkey') THEN
    ALTER TABLE treatment_program_template_stage_groups
      ADD CONSTRAINT treatment_program_template_stage_groups_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_template_stage_items_organization_id_fkey') THEN
    ALTER TABLE treatment_program_template_stage_items
      ADD CONSTRAINT treatment_program_template_stage_items_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_instances_organization_id_fkey') THEN
    ALTER TABLE treatment_program_instances
      ADD CONSTRAINT treatment_program_instances_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_instance_stages_organization_id_fkey') THEN
    ALTER TABLE treatment_program_instance_stages
      ADD CONSTRAINT treatment_program_instance_stages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_instance_stage_groups_organization_id_fkey') THEN
    ALTER TABLE treatment_program_instance_stage_groups
      ADD CONSTRAINT treatment_program_instance_stage_groups_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_instance_stage_items_organization_id_fkey') THEN
    ALTER TABLE treatment_program_instance_stage_items
      ADD CONSTRAINT treatment_program_instance_stage_items_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_action_log_organization_id_fkey') THEN
    ALTER TABLE program_action_log
      ADD CONSTRAINT program_action_log_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_item_discussion_messages_organization_id_fkey') THEN
    ALTER TABLE program_item_discussion_messages
      ADD CONSTRAINT program_item_discussion_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_item_discussion_reads_organization_id_fkey') THEN
    ALTER TABLE program_item_discussion_reads
      ADD CONSTRAINT program_item_discussion_reads_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_program_events_organization_id_fkey') THEN
    ALTER TABLE treatment_program_events
      ADD CONSTRAINT treatment_program_events_organization_id_fkey
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
    RAISE EXCEPTION 'P0.4.P2 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  UPDATE treatment_program_templates
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
END $$;

UPDATE treatment_program_template_stages target
SET organization_id = parent.organization_id
FROM treatment_program_templates parent
WHERE target.organization_id IS NULL
  AND target.template_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE treatment_program_template_stage_groups target
SET organization_id = parent.organization_id
FROM treatment_program_template_stages parent
WHERE target.organization_id IS NULL
  AND target.stage_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE treatment_program_template_stage_items target
SET organization_id = parent.organization_id
FROM treatment_program_template_stages parent
WHERE target.organization_id IS NULL
  AND target.stage_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH resolved_patient_org AS (
    SELECT
      platform_user_id,
      (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE treatment_program_instances target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, template.organization_id, v_default_org_id)
  FROM treatment_program_templates template
  RIGHT JOIN treatment_program_instances instance_for_join
    ON instance_for_join.template_id = template.id
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = instance_for_join.patient_user_id
  WHERE target.organization_id IS NULL
    AND target.id = instance_for_join.id;
END $$;

UPDATE treatment_program_instance_stages target
SET organization_id = parent.organization_id
FROM treatment_program_instances parent
WHERE target.organization_id IS NULL
  AND target.instance_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE treatment_program_instance_stage_groups target
SET organization_id = parent.organization_id
FROM treatment_program_instance_stages parent
WHERE target.organization_id IS NULL
  AND target.stage_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE treatment_program_instance_stage_items target
SET organization_id = parent.organization_id
FROM treatment_program_instance_stages parent
WHERE target.organization_id IS NULL
  AND target.stage_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE program_action_log target
SET organization_id = parent.organization_id
FROM treatment_program_instances parent
WHERE target.organization_id IS NULL
  AND target.instance_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE treatment_program_events target
SET organization_id = parent.organization_id
FROM treatment_program_instances parent
WHERE target.organization_id IS NULL
  AND target.instance_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE program_item_discussion_messages target
SET organization_id = parent.organization_id
FROM treatment_program_instance_stage_items parent
WHERE target.organization_id IS NULL
  AND target.instance_stage_item_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE program_item_discussion_reads target
SET organization_id = parent.organization_id
FROM treatment_program_instance_stage_items parent
WHERE target.organization_id IS NULL
  AND target.instance_stage_item_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM treatment_program_templates
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_template_stages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_template_stage_groups
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_template_stage_items
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_instances
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_instance_stages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_instance_stage_groups
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_instance_stage_items
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM program_action_log
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM program_item_discussion_messages
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM program_item_discussion_reads
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM treatment_program_events
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P2 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
