-- Flatten treatment program stage items: test_set -> clinical_test (one row per catalog test).
-- Expansion uses catalog rows in **test_set_items** (not JSON snapshot). Instance branch mirrors template.
-- Drops legacy test_set rows after expansion. test_attempts / program_action_log rows tied to old
-- instance stage items are removed via ON DELETE CASCADE.

ALTER TABLE "treatment_program_template_stage_items" DROP CONSTRAINT IF EXISTS "treatment_program_template_stage_items_item_type_check";--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" DROP CONSTRAINT IF EXISTS "treatment_program_instance_stage_items_item_type_check";--> statement-breakpoint

ALTER TABLE "treatment_program_template_stage_items" ADD CONSTRAINT "treatment_program_template_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'test_set'::text, 'clinical_test'::text]));--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD CONSTRAINT "treatment_program_instance_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'test_set'::text, 'clinical_test'::text]));--> statement-breakpoint

DO $$
DECLARE
  r RECORD;
  r_line RECORD;
  cnt integer;
  i integer;
BEGIN
  -- Template: repeatedly take lowest sort_order test_set per stage and expand.
  WHILE EXISTS (SELECT 1 FROM treatment_program_template_stage_items WHERE item_type = 'test_set') LOOP
    SELECT si.* INTO r
    FROM treatment_program_template_stage_items si
    WHERE si.item_type = 'test_set'
    ORDER BY si.stage_id, si.sort_order, si.id
    LIMIT 1;

    SELECT count(*)::integer INTO cnt FROM test_set_items WHERE test_set_id = r.item_ref_id;
    IF cnt = 0 THEN
      DELETE FROM treatment_program_template_stage_items WHERE id = r.id;
      CONTINUE;
    END IF;

    UPDATE treatment_program_template_stage_items s
    SET sort_order = s.sort_order + (cnt - 1)
    WHERE s.stage_id = r.stage_id AND s.sort_order > r.sort_order AND s.id <> r.id;

    i := 0;
    FOR r_line IN
      SELECT tsi.test_id AS tid, tsi.sort_order AS ord, tsi.comment AS line_comment
      FROM test_set_items tsi
      WHERE tsi.test_set_id = r.item_ref_id
      ORDER BY tsi.sort_order, tsi.id
    LOOP
      INSERT INTO treatment_program_template_stage_items (
        id, stage_id, item_type, item_ref_id, sort_order, comment, settings, group_id
      ) VALUES (
        gen_random_uuid(),
        r.stage_id,
        'clinical_test',
        r_line.tid,
        r.sort_order + i,
        CASE WHEN i = 0 THEN r.comment ELSE r_line.line_comment END,
        r.settings,
        r.group_id
      );
      i := i + 1;
    END LOOP;

    DELETE FROM treatment_program_template_stage_items WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint

DO $$
DECLARE
  r RECORD;
  r_line RECORD;
  cnt integer;
  i integer;
  snap jsonb;
BEGIN
  WHILE EXISTS (SELECT 1 FROM treatment_program_instance_stage_items WHERE item_type = 'test_set') LOOP
    SELECT si.* INTO r
    FROM treatment_program_instance_stage_items si
    WHERE si.item_type = 'test_set'
    ORDER BY si.stage_id, si.sort_order, si.id
    LIMIT 1;

    SELECT count(*)::integer INTO cnt FROM test_set_items WHERE test_set_id = r.item_ref_id;
    IF cnt = 0 THEN
      DELETE FROM treatment_program_instance_stage_items WHERE id = r.id;
      CONTINUE;
    END IF;

    UPDATE treatment_program_instance_stage_items s
    SET sort_order = s.sort_order + (cnt - 1)
    WHERE s.stage_id = r.stage_id AND s.sort_order > r.sort_order AND s.id <> r.id;

    i := 0;
    FOR r_line IN
      SELECT tsi.test_id AS tid, tsi.sort_order AS ord, tsi.comment AS line_comment
      FROM test_set_items tsi
      WHERE tsi.test_set_id = r.item_ref_id
      ORDER BY tsi.sort_order, tsi.id
    LOOP
      SELECT jsonb_build_object(
        'itemType', 'clinical_test',
        'id', ct.id,
        'title', ct.title,
        'tests', jsonb_build_array(
          jsonb_build_object(
            'testId', ct.id,
            'title', ct.title,
            'sortOrder', 0,
            'scoringConfig', ct.scoring,
            'comment', CASE WHEN r_line.line_comment IS NULL THEN 'null'::jsonb ELSE to_jsonb(r_line.line_comment) END
          )
        )
      )
      INTO snap
      FROM tests ct
      WHERE ct.id = r_line.tid;

      IF snap IS NULL THEN
        snap := jsonb_build_object(
          'itemType', 'clinical_test',
          'id', r_line.tid,
          'title', null,
          'tests', jsonb_build_array(
            jsonb_build_object(
              'testId', r_line.tid,
              'title', null,
              'sortOrder', 0,
              'scoringConfig', null,
              'comment', CASE WHEN r_line.line_comment IS NULL THEN 'null'::jsonb ELSE to_jsonb(r_line.line_comment) END
            )
          )
        );
      END IF;

      INSERT INTO treatment_program_instance_stage_items (
        id,
        stage_id,
        item_type,
        item_ref_id,
        sort_order,
        comment,
        local_comment,
        settings,
        snapshot,
        completed_at,
        is_actionable,
        status,
        group_id,
        created_at,
        last_viewed_at
      ) VALUES (
        gen_random_uuid(),
        r.stage_id,
        'clinical_test',
        r_line.tid,
        r.sort_order + i,
        CASE WHEN i = 0 THEN r.comment ELSE r_line.line_comment END,
        CASE WHEN i = 0 THEN r.local_comment ELSE NULL END,
        r.settings,
        snap,
        CASE WHEN r.completed_at IS NOT NULL THEN r.completed_at ELSE NULL END,
        r.is_actionable,
        r.status,
        r.group_id,
        r.created_at,
        CASE WHEN i = 0 THEN r.last_viewed_at ELSE NULL END
      );
      i := i + 1;
    END LOOP;

    DELETE FROM treatment_program_instance_stage_items WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint

ALTER TABLE "treatment_program_template_stage_items" DROP CONSTRAINT IF EXISTS "treatment_program_template_stage_items_item_type_check";--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" DROP CONSTRAINT IF EXISTS "treatment_program_instance_stage_items_item_type_check";--> statement-breakpoint

ALTER TABLE "treatment_program_template_stage_items" ADD CONSTRAINT "treatment_program_template_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text]));--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD CONSTRAINT "treatment_program_instance_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text]));--> statement-breakpoint
