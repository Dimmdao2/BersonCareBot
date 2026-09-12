-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clinical_test_regions_owner_guard') AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'recommendation_regions_owner_guard') AND position('clinical_test_regions' in pg_catalog.pg_get_functiondef('app.enforce_lfk_child_owner()'::regprocedure)) > 0 AND position('recommendation_regions' in pg_catalog.pg_get_functiondef('app.enforce_lfk_child_owner()'::regprocedure)) > 0
--
-- TENANT_WALL_DEBT_2026-09-12 пункт Г (владелец 12.09.2026: «конечно да, надо делать»).
--
-- ЧТО БЫЛО СЛОМАНО. У `clinical_test_regions` и `recommendation_regions` стояла только проверка
-- САМОСОГЛАСОВАННОСТИ строки — `*_owner_check`: owner_kind='organization' требует непустой
-- organization_id, owner_kind='platform' требует пустой. Про РОДИТЕЛЯ (строку `public.tests` /
-- `public.recommendations`) она не знает ничего, поэтому клиника могла привязать СВОЮ область тела
-- к ПЛАТФОРМЕННОМУ тесту или рекомендации: дочерняя строка внутренне согласована, CHECK доволен,
-- а платформенный справочник обзавёлся записью чужого владельца.
--
-- Замерено на DEV 12.09.2026 в откатываемой транзакции, оба INSERT прошли (`INSERT 0 1`):
--   INSERT INTO public.clinical_test_regions (clinical_test_id, body_region_id, organization_id, owner_kind)
--   VALUES (<платформенный тест>, <область>, <клиника>, 'organization');   -- ПРИНЯТО
--   INSERT INTO public.recommendation_regions (recommendation_id, body_region_id, organization_id, owner_kind)
--   VALUES (<платформенная рекомендация>, <область>, <клиника>, 'organization');  -- ПРИНЯТО
-- Тот же приём на соседнем `lfk_exercise_regions` отбивается триггером:
--   ERROR: lfk_child_owner_mismatch (app.enforce_lfk_child_owner)
--
-- ПОЧЕМУ ОБЩИЙ ГУАРД, А НЕ ВТОРАЯ ПОЧТИ ТАКАЯ ЖЕ ФУНКЦИЯ (AGENTS.md §5). Проверка дословно та же:
-- «owner_kind/organization_id ребёнка обязаны совпасть с родительской строкой справочника».
-- Отличается только КАК достаётся родитель, а это уже параметризовано через TG_TABLE_NAME — ровно
-- так же в эту функцию добавляли `lfk_exercise_load_types` (20260911T080000). Имя функции осталось
-- историческим (`enforce_lfk_child_owner`), потому что на него ссылаются VERIFY-строки прошлых
-- миграций и перепись функций; переименование дало бы churn без единого нового свойства.
--
-- Отказ для новой пары называется СВОИМ именем `catalog_child_owner_mismatch`: `lfk_...` в ошибке
-- про клинический тест отправил бы разбирающегося в ЛФК-семейство. Текст отказа ЛФК-таблиц не
-- меняется — на него опирается `platform-lfk-read.devDbProof.test.mjs`.
CREATE OR REPLACE FUNCTION app.enforce_lfk_child_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  parent_kind text;
  parent_org uuid;
  media_kind text;
  media_org uuid;
  media_id uuid;
BEGIN
  IF TG_TABLE_NAME IN ('lfk_exercise_regions', 'lfk_exercise_media', 'lfk_exercise_load_types') THEN
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.lfk_exercises
     WHERE id = NEW.exercise_id;
  ELSIF TG_TABLE_NAME = 'clinical_test_regions' THEN
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.tests
     WHERE id = NEW.clinical_test_id;
  ELSIF TG_TABLE_NAME = 'recommendation_regions' THEN
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.recommendations
     WHERE id = NEW.recommendation_id;
  ELSE
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.lfk_complex_templates
     WHERE id = NEW.template_id;
  END IF;

  IF parent_kind IS NULL
     OR parent_kind IS DISTINCT FROM NEW.owner_kind
     OR parent_org IS DISTINCT FROM NEW.organization_id THEN
    IF TG_TABLE_NAME IN ('clinical_test_regions', 'recommendation_regions') THEN
      RAISE EXCEPTION 'catalog_child_owner_mismatch' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'lfk_child_owner_mismatch' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'lfk_complex_template_exercises' THEN
    SELECT owner_kind, organization_id
      INTO media_kind, media_org
      FROM public.lfk_exercises
     WHERE id = NEW.exercise_id;
    IF media_kind IS NULL
       OR (
         NEW.owner_kind = 'platform'
         AND (media_kind IS DISTINCT FROM 'platform' OR media_org IS NOT NULL)
       )
       OR (
         NEW.owner_kind = 'organization'
         AND NOT (
           (media_kind = 'organization' AND media_org IS NOT DISTINCT FROM NEW.organization_id)
           OR (media_kind = 'platform' AND media_org IS NULL)
         )
       ) THEN
      RAISE EXCEPTION 'lfk_template_exercise_owner_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'lfk_exercise_media' THEN
    IF NEW.media_url ~ '^/api/media/[0-9a-fA-F-]{36}$' THEN
      media_id := substring(NEW.media_url FROM '^/api/media/([0-9a-fA-F-]{36})$')::uuid;
      SELECT owner_kind, organization_id
        INTO media_kind, media_org
        FROM public.media_files
       WHERE id = media_id;
      IF media_kind IS NULL
         OR media_kind IS DISTINCT FROM NEW.owner_kind
         OR media_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'lfk_media_owner_mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

-- Тот же набор колонок, что у ЛФК-триггеров: смена владельца ребёнка и ПЕРЕВЕШИВАНИЕ его на другого
-- родителя одинаково обязаны пройти проверку, иначе стену обходит обычный UPDATE.
CREATE TRIGGER clinical_test_regions_owner_guard
  BEFORE INSERT OR UPDATE OF owner_kind, organization_id, clinical_test_id
  ON public.clinical_test_regions
  FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE TRIGGER recommendation_regions_owner_guard
  BEFORE INSERT OR UPDATE OF owner_kind, organization_id, recommendation_id
  ON public.recommendation_regions
  FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();
