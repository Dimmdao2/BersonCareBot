-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0026
--
-- Живой прогон владельца на TEST 18.08: после разминки он выбрал вторую по счёту иконку
-- самочувствия и получил «Не удалось сохранить». В журнале
-- (journalctl -u bersoncarebot-webapp-test, 11:20:36 и 11:21:22 MSK) оба отказа одинаковы:
--
--   params: d70accd9-…,4,880adad6-…,Самочувствие после разминки,…
--   cause: error: current_patient_warmup_feeling_rejected (P0001)
--   where: PL/pgSQL function app.apply_current_patient_warmup_feeling(…) line 16 at RAISE
--
-- Строка 16 — это `IF NOT FOUND OR p_feeling NOT IN (1, 3, 5)`. Completion существует
-- (SELECT по bersoncarebot_test: id d70accd9-…, source='daily_warmup', feeling IS NULL),
-- то есть отказала ровно проверка шкалы: балл 4 не входит в (1, 3, 5).
--
-- Шкала самочувствия в продукте — 1..5, и это не спорно:
--   * сетка выбора отдаёт 1,2,3,4,5 — PATIENT_HOME_MOOD_OPTIONS
--     (apps/webapp/src/modules/patient-home/patientHomeStaticIcons.ts);
--   * маршрут принимает 1..5 — z.number().int().min(1).max(5)
--     (apps/webapp/src/app/api/patient/practice/completion/[id]/feeling/route.ts);
--   * таблица разрешает 1..5 — CHECK ppc_feeling_check (apps/webapp/db/schema/patientPractice.ts);
--   * соседний корень ТОГО ЖЕ шва уже написан правильно — в 0016
--     app.record_current_patient_practice_completion проверяет `p_feeling NOT BETWEEN 1 AND 5`;
--   * до переноса записи за SECURITY DEFINER шов (коммит 4d38438c9) ограничения по значению
--     не было вовсе — apps/webapp/src/infra/repos/pgWarmupFeelingCompletion.ts писал любой балл,
--     прошедший zod.
--
-- То есть (1, 3, 5) — не решение владельца о трёхбалльной шкале, а сузившаяся при переносе
-- проверка: она молча отвергала баллы 2 и 4, то есть две пятых всех отметок самочувствия
-- после разминки. Правится значение проверки, а не шкала UI.
--
-- Вместе со значением проверка получает явный `p_feeling IS NULL`. И `NOT IN (1, 3, 5)`, и
-- `NOT BETWEEN 1 AND 5` на NULL дают NULL, то есть пропускают его дальше — а
-- public.symptom_entries.value_0_10 объявлена NOT NULL, значит NULL обернулся бы сырым 23502
-- вместо названного отказа шва. Через маршрут NULL не приходит (zod требует число); проверка
-- закрывает границу самого шва.
--
-- Больше в теле не меняется ничего: остальные условия отказа (чужой completion, чужая клиника,
-- не daily_warmup, неактивный справочник symptom_type) остаются как были — они защищают стену
-- пациента, и человек теперь читает их словами (маршрут переводит P0001 в предложение).

CREATE OR REPLACE FUNCTION app.apply_current_patient_warmup_feeling(
  p_completion_id uuid, p_feeling integer, p_warmup_ref_id uuid, p_warmup_title text,
  p_general_ref_id uuid, p_general_title text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_completed_at timestamp with time zone;
  v_warmup_tracking uuid;
  v_general_tracking uuid;
  v_inserted boolean := false;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  SELECT c.completed_at INTO v_completed_at
  FROM public.patient_practice_completions c
  WHERE c.id = p_completion_id AND c.organization_id = v_org
    AND c.user_id = v_patient AND c.source = 'daily_warmup' FOR UPDATE;
  IF NOT FOUND OR p_feeling IS NULL OR p_feeling NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'current_patient_warmup_feeling_rejected' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(btrim(p_warmup_title), '') IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.reference_items ri
    JOIN public.reference_categories rc ON rc.id = ri.category_id
    WHERE ri.id = p_warmup_ref_id AND ri.is_active AND rc.code = 'symptom_type'
      AND (ri.organization_id = v_org OR ri.organization_id IS NULL)
  ) OR (p_general_ref_id IS NOT NULL AND (
    nullif(btrim(p_general_title), '') IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.reference_items ri
      JOIN public.reference_categories rc ON rc.id = ri.category_id
      WHERE ri.id = p_general_ref_id AND ri.is_active AND rc.code = 'symptom_type'
        AND (ri.organization_id = v_org OR ri.organization_id IS NULL)
    )
  )) THEN
    RAISE EXCEPTION 'current_patient_warmup_reference_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.symptom_trackings (
    organization_id, user_id, platform_user_id, symptom_key, symptom_title,
    is_active, updated_at, symptom_type_ref_id
  ) VALUES (
    v_org, v_patient::text, v_patient, 'warmup_feeling', btrim(p_warmup_title),
    true, statement_timestamp(), p_warmup_ref_id
  ) ON CONFLICT (platform_user_id) WHERE (
    symptom_key = 'warmup_feeling' AND deleted_at IS NULL AND platform_user_id IS NOT NULL
  ) DO UPDATE SET updated_at = symptom_trackings.updated_at
  RETURNING id INTO v_warmup_tracking;
  INSERT INTO public.symptom_entries (
    organization_id, user_id, platform_user_id, tracking_id, value_0_10,
    entry_type, recorded_at, source, notes, patient_practice_completion_id
  ) VALUES (
    v_org, v_patient::text, v_patient, v_warmup_tracking, p_feeling,
    'instant', v_completed_at, 'webapp', NULL, p_completion_id
  ) ON CONFLICT (patient_practice_completion_id) WHERE patient_practice_completion_id IS NOT NULL
    DO NOTHING;
  v_inserted := FOUND;
  IF v_inserted AND p_general_ref_id IS NOT NULL AND nullif(btrim(p_general_title), '') IS NOT NULL THEN
    INSERT INTO public.symptom_trackings (
      organization_id, user_id, platform_user_id, symptom_key, symptom_title,
      is_active, updated_at, symptom_type_ref_id
    ) VALUES (
      v_org, v_patient::text, v_patient, 'general_wellbeing', btrim(p_general_title),
      true, statement_timestamp(), p_general_ref_id
    ) ON CONFLICT (platform_user_id) WHERE (
      symptom_key = 'general_wellbeing' AND deleted_at IS NULL AND platform_user_id IS NOT NULL
    ) DO UPDATE SET updated_at = symptom_trackings.updated_at
    RETURNING id INTO v_general_tracking;
    INSERT INTO public.symptom_entries (
      organization_id, user_id, platform_user_id, tracking_id, value_0_10,
      entry_type, recorded_at, source, notes
    ) VALUES (
      v_org, v_patient::text, v_patient, v_general_tracking, p_feeling,
      'instant', v_completed_at, 'webapp', '__bcc_warmup_general_mirror__'
    );
  END IF;
  UPDATE public.patient_practice_completions c SET feeling = p_feeling
  WHERE c.id = p_completion_id AND c.organization_id = v_org AND c.user_id = v_patient;
  RETURN NOT v_inserted;
END
$function$;
