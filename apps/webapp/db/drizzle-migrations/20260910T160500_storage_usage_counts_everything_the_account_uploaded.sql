-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.read_org_enforced_quota_usage(uuid)')) LIKE '%FROM public.media_files AS uploaded%'
--
-- Решение владельца 10.09.2026, дословно: «конечно должны считаться - всё что загружено в аккаунт»,
-- «никаких разделений при подсчёте нигде быть не должно вообще».
--
-- До этой миграции `files_used` считал ТОЛЬКО `public.patient_files`: медиатека, контент и
-- материалы упражнений той же организации в лимит объёма не попадали, хотя лежат в том же
-- хранилище и загружены тем же аккаунтом. Число в «Использовано из включённого» и число, по
-- которому платформа решает про понижение тарифа, показывали часть вместо целого.
--
-- `public.media_files` — единственный журнал загруженного: в него пишут файл пациента
-- (`pgPatientFiles`), медиатека (`s3MediaStorage`) и упражнения (`pgLfkExercises`). Поэтому
-- суммируется он, а `patient_files` добавляется ровно тогда, когда своей строки в журнале у неё
-- нет (исторические записи с `media_file_id IS NULL`), — иначе один файл посчитался бы дважды.
--
-- Считаются готовые объекты: `pending` — незавершённая загрузка, места ещё не занимает (её размер
-- добавляет `increment` в проверке под замком в `pgPatientFiles`), а помеченное к удалению держать
-- в лимите нельзя. Производные нашего же энкодера (превью, HLS-варианты, иконки приложения)
-- отдельных строк в журнале не имеют и здесь не считаются: их не загружали, они
-- пересоздаются из оригинала.
--
-- Тело переписывается по якорю из ЖИВОГО определения (`pg_get_functiondef`) — тем же приёмом, что
-- `20260820T175432`, `20260823T030000`, `20260901T231600` и `20260910T142000`. Права на новую
-- колонку/отношение выдаются НЕ здесь: `public.media_files` (`organization_id`, `size_bytes`,
-- `status`) и `public.patient_files.media_file_id` объявлены владельцу этой функции в
-- `deploy/postgres/privileges/declaration.ts` и приезжают reconcile-ом (AGENTS.md §1).

DO $migration$
DECLARE
  v_identity regprocedure := 'app.read_org_enforced_quota_usage(uuid)'::regprocedure;
  v_definition text;
  v_rewritten text;
  v_anchor text := E'        COALESCE(\n'
    || E'          (SELECT sum(file.size_bytes) FROM public.patient_files AS file\n'
    || E'           WHERE file.organization_id = p_organization_id),\n'
    || E'          0\n'
    || E'        )::bigint AS files_used\n';
  v_replacement text := E'        (\n'
    || E'          -- Владелец 10.09.2026: одно число на весь аккаунт, без разделения по видам\n'
    || E'          -- загруженного. `media_files` — журнал всего загруженного организацией;\n'
    || E'          -- `patient_files` добавляется только там, где своей строки в журнале нет.\n'
    || E'          COALESCE(\n'
    || E'            (SELECT sum(uploaded.size_bytes) FROM public.media_files AS uploaded\n'
    || E'             WHERE uploaded.organization_id = p_organization_id\n'
    || E'               AND uploaded.status = ''ready''),\n'
    || E'            0\n'
    || E'          )\n'
    || E'          +\n'
    || E'          COALESCE(\n'
    || E'            (SELECT sum(file.size_bytes) FROM public.patient_files AS file\n'
    || E'             WHERE file.organization_id = p_organization_id\n'
    || E'               AND file.media_file_id IS NULL),\n'
    || E'            0\n'
    || E'          )\n'
    || E'        )::bigint AS files_used\n';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;

  IF v_definition IS NULL
    OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1
  THEN
    RAISE EXCEPTION 'files_used anchor not found or ambiguous for %', v_identity;
  END IF;

  v_rewritten := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_rewritten;
END
$migration$;
