-- Разворачивает legacy `lfk_complex` в строки `exercise` по каталогу `lfk_complex_template_exercises`.
-- Перед удалением строки комплекса переносит `program_action_log` на новые пункты (FK ON DELETE CASCADE).

DO $$
DECLARE
  rec RECORD;
  ex RECORD;
  ex_count int;
  shift int;
  base_sort int;
  ins_sort int;
  snap jsonb;
  item_settings jsonb;
  new_item_id uuid;
  first_new_item_id uuid;
BEGIN
  -- Шаблоны: от большего sort_order к меньшему, чтобы вставки не ломали порядок
  FOR rec IN
    SELECT i.id, i.stage_id, i.sort_order, i.group_id, i.comment AS row_comment, i.item_ref_id AS complex_id, i.settings AS row_settings
    FROM treatment_program_template_stage_items i
    WHERE i.item_type = 'lfk_complex'
    ORDER BY i.stage_id, i.sort_order DESC, i.id
  LOOP
    SELECT count(*)::int INTO ex_count
    FROM lfk_complex_template_exercises cte
    WHERE cte.template_id = rec.complex_id;

    IF ex_count = 0 THEN
      RAISE NOTICE 'skip template item %: complex % has no exercises', rec.id, rec.complex_id;
      DELETE FROM treatment_program_template_stage_items WHERE id = rec.id;
      CONTINUE;
    END IF;

    shift := ex_count - 1;
    IF shift > 0 THEN
      UPDATE treatment_program_template_stage_items
      SET sort_order = sort_order + shift
      WHERE stage_id = rec.stage_id AND sort_order > rec.sort_order;
    END IF;

    item_settings := COALESCE(rec.row_settings, '{}'::jsonb) || jsonb_build_object('lfkComplexTemplateId', rec.complex_id::text);

    base_sort := rec.sort_order;
    ins_sort := 0;
    FOR ex IN
      SELECT cte.exercise_id, cte.comment AS line_comment, cte.sort_order AS ex_ord, cte.id AS line_id
      FROM lfk_complex_template_exercises cte
      WHERE cte.template_id = rec.complex_id
      ORDER BY cte.sort_order ASC, cte.id ASC
    LOOP
      INSERT INTO treatment_program_template_stage_items (stage_id, item_type, item_ref_id, sort_order, comment, group_id, settings)
      VALUES (
        rec.stage_id,
        'exercise',
        ex.exercise_id,
        base_sort + ins_sort,
        COALESCE(ex.line_comment, rec.row_comment),
        rec.group_id,
        item_settings
      );
      ins_sort := ins_sort + 1;
    END LOOP;

    DELETE FROM treatment_program_template_stage_items WHERE id = rec.id;
  END LOOP;

  -- Инстансы
  FOR rec IN
    SELECT
      i.id,
      i.stage_id,
      i.sort_order,
      i.group_id,
      i.comment AS row_comment,
      i.local_comment,
      i.settings,
      i.completed_at,
      i.is_actionable,
      i.status,
      i.created_at,
      i.last_viewed_at,
      i.item_ref_id AS complex_id
    FROM treatment_program_instance_stage_items i
    WHERE i.item_type = 'lfk_complex'
    ORDER BY i.stage_id, i.sort_order DESC, i.id
  LOOP
    SELECT count(*)::int INTO ex_count
    FROM lfk_complex_template_exercises cte
    WHERE cte.template_id = rec.complex_id;

    IF ex_count = 0 THEN
      RAISE NOTICE 'skip instance item %: complex % has no exercises (program_action_log on this item will CASCADE-delete)', rec.id, rec.complex_id;
      DELETE FROM treatment_program_instance_stage_items WHERE id = rec.id;
      CONTINUE;
    END IF;

    shift := ex_count - 1;
    IF shift > 0 THEN
      UPDATE treatment_program_instance_stage_items
      SET sort_order = sort_order + shift
      WHERE stage_id = rec.stage_id AND sort_order > rec.sort_order;
    END IF;

    item_settings := COALESCE(rec.settings, '{}'::jsonb) || jsonb_build_object('lfkComplexTemplateId', rec.complex_id::text);

    base_sort := rec.sort_order;
    ins_sort := 0;
    first_new_item_id := NULL;

    FOR ex IN
      SELECT cte.exercise_id, cte.comment AS line_comment, cte.sort_order AS ex_ord, cte.id AS line_id
      FROM lfk_complex_template_exercises cte
      WHERE cte.template_id = rec.complex_id
      ORDER BY cte.sort_order ASC, cte.id ASC
    LOOP
      SELECT jsonb_build_object(
        'itemType', 'exercise',
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'contraindications', e.contraindications,
        'difficulty', e.difficulty_1_10,
        'loadType', e.load_type
      )
      INTO snap
      FROM lfk_exercises e
      WHERE e.id = ex.exercise_id AND e.is_archived = false;

      IF snap IS NULL THEN
        snap := jsonb_build_object('itemType', 'exercise', 'id', ex.exercise_id, 'title', null);
      END IF;

      INSERT INTO treatment_program_instance_stage_items (
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
      )
      VALUES (
        rec.stage_id,
        'exercise',
        ex.exercise_id,
        base_sort + ins_sort,
        COALESCE(ex.line_comment, rec.row_comment),
        rec.local_comment,
        item_settings,
        snap,
        CASE WHEN ins_sort = 0 THEN rec.completed_at ELSE NULL END,
        rec.is_actionable,
        rec.status,
        rec.group_id,
        rec.created_at,
        COALESCE(rec.last_viewed_at, rec.created_at)
      )
      RETURNING id INTO new_item_id;

      IF ins_sort = 0 THEN
        first_new_item_id := new_item_id;
      END IF;

      UPDATE program_action_log pal
      SET instance_stage_item_id = new_item_id
      WHERE pal.instance_stage_item_id = rec.id
        AND COALESCE(pal.payload->>'source', '') = 'lfk_exercise_done'
        AND (pal.payload->>'exerciseId')::uuid = ex.exercise_id;

      ins_sort := ins_sort + 1;
    END LOOP;

    IF first_new_item_id IS NOT NULL THEN
      UPDATE program_action_log pal
      SET instance_stage_item_id = first_new_item_id
      WHERE pal.instance_stage_item_id = rec.id;
    END IF;

    DELETE FROM treatment_program_instance_stage_items WHERE id = rec.id;
  END LOOP;
END $$;
