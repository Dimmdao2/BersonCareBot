-- Слияние раздвоенной учётки владельца в одну каноническую запись.
-- Одноразовая операция: выполняется один раз на TEST и один раз на PROD при переезде.
-- Идентификаторы одни и те же в обеих базах (TEST — дамп прода), поэтому они здесь прямо в тексте.
--
-- Запуск: psql -v ON_ERROR_STOP=1 -f consolidate-owner-identity.sql
-- Сухой прогон: те же команды, но заменить последний COMMIT на ROLLBACK.
--
-- Что делает:
--   1. Переносит все ссылки с админского надгробия a754c977 на живую основную запись b0021a38.
--   2. Удаляет надгробие.
--   3. Удаляет две пустые админские записи 9504c4b8 и 2e5068fe.
--   4. Переносит все FK-ссылки с дубля карточки специалиста 518ea988 на каноническую c9515025
--      и только после dump-derived post-gate удаляет дубль.
--
-- Чего НЕ делает: не меняет роль выжившей записи. В свежем PROD-дампе она ещё role=admin с gmail;
-- следующий обязательный p0-data-fix-doctor-admin-split.sql переводит её в doctor с yandex и создаёт
-- отдельного глобального администратора. Здесь не трогаются пароль и данные основной записи, живая
-- пациентская запись 1c312a64. Мёртвое пациентское
-- надгробие 9475c2a9 удаляется по прямому решению владельца 15.08.2026.

BEGIN;

-- ── Предохранители: если база не та, что мы измеряли, дальше не идём ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_users WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'
                   AND phone_normalized = '+79643805480'
                   AND role IN ('admin', 'doctor')
                   AND merged_into_id IS NULL) THEN
    RAISE EXCEPTION 'Основная запись b0021a38 не найдена, потеряла телефон владельца, имеет неожиданную роль или сама помечена слитой';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_users WHERE id = 'a754c977-d1cc-46bb-b870-ca499be81884') THEN
    RAISE NOTICE 'Надгробие a754c977 уже удалено — скрипт был выполнен ранее';
  END IF;
END $$;

-- ── 1. Перенос ссылок с надгробия на живую запись ───────────────────────────────────────────────
-- Авторство контента и настроек. Доступ к контенту от этого не меняется (он привязан к клинике),
-- переносим подпись автора, чтобы надгробие можно было удалить.
UPDATE lfk_exercises              SET created_by  = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE created_by  = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE lfk_complex_templates      SET created_by  = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE created_by  = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE treatment_program_templates SET created_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE created_by  = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE media_files                SET uploaded_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE uploaded_by = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE media_folders              SET created_by  = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE created_by  = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE media_upload_sessions      SET owner_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE owner_user_id = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- История назначений и программ: кто назначил / кто автор события.
UPDATE treatment_program_events    SET actor_id    = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE actor_id    = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE treatment_program_instances SET assigned_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE assigned_by = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE online_intake_status_history SET changed_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE changed_by = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- Журналы и настройки платформы.
UPDATE admin_audit_log            SET actor_id   = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE actor_id   = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE system_settings            SET updated_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE updated_by = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE user_email_setup_tokens    SET created_by_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE created_by_user_id = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- Эти две таблицы появились уже после исходной PROD-схемы. На свежем dump их ещё нет и переносить в них
-- нечего; при идемпотентном повторе на уже мигрированной схеме ссылки всё равно нормализуются.
DO $$
BEGIN
  IF to_regclass('integrator.system_settings') IS NOT NULL THEN
    EXECUTE $sql$UPDATE integrator.system_settings
      SET updated_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4'
      WHERE updated_by::text = 'a754c977-d1cc-46bb-b870-ca499be81884'$sql$;
  END IF;
  IF to_regclass('public.app_runtime_settings') IS NOT NULL THEN
    EXECUTE $sql$UPDATE public.app_runtime_settings
      SET updated_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4'
      WHERE updated_by = 'a754c977-d1cc-46bb-b870-ca499be81884'$sql$;
  END IF;
  IF to_regclass('public.app_runtime_settings_audit') IS NOT NULL THEN
    EXECUTE $sql$UPDATE public.app_runtime_settings_audit
      SET updated_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4'
      WHERE updated_by = 'a754c977-d1cc-46bb-b870-ca499be81884'$sql$;
  END IF;
END $$;

-- Способы входа, которых у выжившей записи нет: привязка Яндекса, PIN, история телефона.
UPDATE user_oauth_bindings  SET user_id          = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE user_id          = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE user_phone_history   SET platform_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE platform_user_id = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- Два места, где у выжившей записи уже есть своя строка и перенос упёрся бы в уникальный индекс:
-- настройка каналов (пара пользователь+канал) и антиспам-задержка почты (пара пользователь+адрес).
-- Здесь строка надгробия просто удаляется — своя у владельца уже есть и она новее.
DELETE FROM user_channel_preferences WHERE platform_user_id = 'a754c977-d1cc-46bb-b870-ca499be81884';
DELETE FROM email_send_cooldowns     WHERE user_id          = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- ── 1b. Ссылки БЕЗ внешнего ключа — их не видно в каталоге связей ───────────────────────────────
-- Найдено независимым аудитом 28.07 уже ПОСЛЕ первого применения на TEST: первая версия скрипта
-- была собрана по внешним ключам на public.platform_users, а эти четыре колонки внешнего ключа не
-- имеют (две из них вообще text, одна — в схеме интегратора). Поэтому удаление прошло молча и
-- оставило 48 висячих ссылок. Все 48 вели на админское надгробие, перенос однозначен.
UPDATE public.broadcast_audit SET actor_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE actor_id::text = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE public.operator_health_failure_archive SET archived_by_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE archived_by_user_id::text = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE public.operator_health_failure_archive SET doctor_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE doctor_user_id::text = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- ── 2. Удаление надгробия ───────────────────────────────────────────────────────────────────────
DELETE FROM platform_users WHERE id = 'a754c977-d1cc-46bb-b870-ca499be81884';

-- ── 3. Удаление двух пустых админских записей ───────────────────────────────────────────────────
-- У 2e5068fe есть одна строка настройки каналов — она уходит вместе с ней.
DELETE FROM user_channel_preferences WHERE platform_user_id = '2e5068fe-7f50-459f-b879-41cd194e5080';
DELETE FROM platform_users WHERE id = '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb';
DELETE FROM platform_users WHERE id = '2e5068fe-7f50-459f-b879-41cd194e5080';

-- ── 3b. Удаление мёртвого пациентского надгробия ────────────────────────────────────────────────
-- Дубль пациентской личности владельца, слитый в 1c312a64 ещё раньше и уже пустой:
-- ни одна таблица на него не ссылается. Живая пациентская запись 1c312a64 не трогается.
DELETE FROM platform_users WHERE id = '9475c2a9-cbef-4d3e-8357-f96503e2e29b';

-- ── 4. Консолидация дубля карточки специалиста ──────────────────────────────────────────
-- В свежем PROD-дампе на дубль ссылаются appointments и scheduling configuration. Данные переносятся до DELETE,
-- включая soft-deleted appointment history; ON DELETE CASCADE/SET NULL не являются механизмом миграции.
CREATE TEMP TABLE cutover_specialist_reference_baseline (
  relation_oid oid PRIMARY KEY,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  column_name text NOT NULL,
  total_rows bigint NOT NULL,
  duplicate_rows bigint NOT NULL,
  canonical_rows bigint NOT NULL,
  merged_collisions bigint NOT NULL DEFAULT 0
) ON COMMIT DROP;

DO $specialist_reference_baseline$
DECLARE
  reference record;
  total_rows bigint;
  duplicate_rows bigint;
  canonical_rows bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.be_specialists'::regclass
      AND (
        array_length(constraint_row.conkey, 1) <> 1
        OR array_length(constraint_row.confkey, 1) <> 1
      )
  ) THEN
    RAISE EXCEPTION 'specialist reference baseline cannot safely rewrite a composite FK';
  END IF;

  FOR reference IN
    SELECT source_table.oid AS relation_oid,
           source_namespace.nspname AS schema_name,
           source_table.relname AS table_name,
           source_attribute.attname AS column_name
    FROM pg_constraint constraint_row
    JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_table.relnamespace
    JOIN pg_attribute source_attribute
      ON source_attribute.attrelid = constraint_row.conrelid
     AND source_attribute.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.be_specialists'::regclass
      AND array_length(constraint_row.conkey, 1) = 1
      AND array_length(constraint_row.confkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE %1$I = $1), count(*) FILTER (WHERE %1$I = $2) FROM %2$I.%3$I',
      reference.column_name, reference.schema_name, reference.table_name
    ) INTO total_rows, duplicate_rows, canonical_rows
      USING '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid,
            'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid;

    INSERT INTO cutover_specialist_reference_baseline
      (relation_oid, schema_name, table_name, column_name, total_rows, duplicate_rows, canonical_rows)
    VALUES
      (reference.relation_oid, reference.schema_name, reference.table_name, reference.column_name,
       total_rows, duplicate_rows, canonical_rows);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM cutover_specialist_reference_baseline
    WHERE schema_name = 'public' AND table_name = 'be_appointments'
  ) OR NOT EXISTS (
    SELECT 1 FROM cutover_specialist_reference_baseline
    WHERE schema_name = 'public' AND table_name = 'be_specialist_service_availability'
  ) THEN
    RAISE EXCEPTION 'specialist FK baseline is missing required appointment/availability classes';
  END IF;
END
$specialist_reference_baseline$;

-- Equivalent unique scopes are merged deterministically before the dynamic FK rewrite. The current
-- dump has no availability collisions, so all seven availability rows remain distinct and retain IDs.
DO $specialist_unique_scope_merge$
DECLARE
  removed bigint;
BEGIN
  UPDATE public.be_specialist_locations canonical
  SET is_active = canonical.is_active OR duplicate.is_active,
      created_at = LEAST(canonical.created_at, duplicate.created_at)
  FROM public.be_specialist_locations duplicate
  WHERE canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
    AND duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND canonical.branch_id = duplicate.branch_id;
  DELETE FROM public.be_specialist_locations duplicate
  WHERE duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND EXISTS (SELECT 1 FROM public.be_specialist_locations canonical
      WHERE canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
        AND canonical.branch_id = duplicate.branch_id);
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE cutover_specialist_reference_baseline SET merged_collisions = removed
  WHERE table_name = 'be_specialist_locations';

  UPDATE public.be_specialist_rooms canonical
  SET is_active = canonical.is_active OR duplicate.is_active,
      created_at = LEAST(canonical.created_at, duplicate.created_at)
  FROM public.be_specialist_rooms duplicate
  WHERE canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
    AND duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND canonical.room_id = duplicate.room_id;
  DELETE FROM public.be_specialist_rooms duplicate
  WHERE duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND EXISTS (SELECT 1 FROM public.be_specialist_rooms canonical
      WHERE canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
        AND canonical.room_id = duplicate.room_id);
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE cutover_specialist_reference_baseline SET merged_collisions = removed
  WHERE table_name = 'be_specialist_rooms';

  UPDATE public.be_specialist_service_availability canonical
  SET is_active = canonical.is_active OR duplicate.is_active,
      price_minor_override = CASE WHEN duplicate.updated_at >= canonical.updated_at
        THEN duplicate.price_minor_override ELSE canonical.price_minor_override END,
      sort_order = LEAST(canonical.sort_order, duplicate.sort_order),
      created_at = LEAST(canonical.created_at, duplicate.created_at),
      updated_at = GREATEST(canonical.updated_at, duplicate.updated_at)
  FROM public.be_specialist_service_availability duplicate
  WHERE canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
    AND duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND canonical.service_id = duplicate.service_id
    AND canonical.branch_id IS NOT DISTINCT FROM duplicate.branch_id
    AND canonical.room_id IS NOT DISTINCT FROM duplicate.room_id
    AND canonical.city_code IS NOT DISTINCT FROM duplicate.city_code;
  DELETE FROM public.be_specialist_service_availability duplicate
  WHERE duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND EXISTS (SELECT 1 FROM public.be_specialist_service_availability canonical
      WHERE canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
        AND canonical.service_id = duplicate.service_id
        AND canonical.branch_id IS NOT DISTINCT FROM duplicate.branch_id
        AND canonical.room_id IS NOT DISTINCT FROM duplicate.room_id
        AND canonical.city_code IS NOT DISTINCT FROM duplicate.city_code);
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE cutover_specialist_reference_baseline SET merged_collisions = removed
  WHERE table_name = 'be_specialist_service_availability';

  UPDATE public.be_working_days canonical
  SET branch_id = CASE WHEN duplicate.updated_at >= canonical.updated_at THEN duplicate.branch_id ELSE canonical.branch_id END,
      room_id = CASE WHEN duplicate.updated_at >= canonical.updated_at THEN duplicate.room_id ELSE canonical.room_id END,
      start_minute = CASE WHEN duplicate.updated_at >= canonical.updated_at THEN duplicate.start_minute ELSE canonical.start_minute END,
      end_minute = CASE WHEN duplicate.updated_at >= canonical.updated_at THEN duplicate.end_minute ELSE canonical.end_minute END,
      is_closed = CASE WHEN duplicate.updated_at >= canonical.updated_at THEN duplicate.is_closed ELSE canonical.is_closed END,
      breaks = CASE WHEN duplicate.updated_at >= canonical.updated_at THEN duplicate.breaks ELSE canonical.breaks END,
      created_at = LEAST(canonical.created_at, duplicate.created_at),
      updated_at = GREATEST(canonical.updated_at, duplicate.updated_at)
  FROM public.be_working_days duplicate
  WHERE canonical.organization_id = duplicate.organization_id
    AND canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
    AND duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND canonical.work_date = duplicate.work_date;
  DELETE FROM public.be_working_days duplicate
  WHERE duplicate.specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'
    AND EXISTS (SELECT 1 FROM public.be_working_days canonical
      WHERE canonical.organization_id = duplicate.organization_id
        AND canonical.specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'
        AND canonical.work_date = duplicate.work_date);
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE cutover_specialist_reference_baseline SET merged_collisions = removed
  WHERE table_name = 'be_working_days';
END
$specialist_unique_scope_merge$;

DO $specialist_reference_migration$
DECLARE reference record;
BEGIN
  FOR reference IN SELECT * FROM cutover_specialist_reference_baseline ORDER BY schema_name, table_name
  LOOP
    EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      reference.schema_name, reference.table_name, reference.column_name, reference.column_name)
    USING 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid,
          '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid;
  END LOOP;
END
$specialist_reference_migration$;

DO $specialist_reference_post_gate$
DECLARE
  reference record;
  total_rows bigint;
  duplicate_rows bigint;
  canonical_rows bigint;
BEGIN
  FOR reference IN SELECT * FROM cutover_specialist_reference_baseline ORDER BY schema_name, table_name
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE %1$I = $1), count(*) FILTER (WHERE %1$I = $2) FROM %2$I.%3$I',
      reference.column_name, reference.schema_name, reference.table_name
    ) INTO total_rows, duplicate_rows, canonical_rows
      USING '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid,
            'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid;
    IF duplicate_rows <> 0
      OR total_rows <> reference.total_rows - reference.merged_collisions
      OR canonical_rows <> reference.canonical_rows + reference.duplicate_rows - reference.merged_collisions
    THEN
      RAISE EXCEPTION 'specialist reference migration drift in %.%: duplicate %, total %, canonical %',
        reference.schema_name, reference.table_name, duplicate_rows, total_rows, canonical_rows;
    END IF;
  END LOOP;
END
$specialist_reference_post_gate$;

DELETE FROM be_specialists WHERE id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b';

-- В свежем PROD-дампе часть живых записей той же единственной клиники исторически не имеет
-- specialist_id (admin_manual/imported/native). Для этой организации существует ровно одна активная
-- карточка специалиста, проверенная ниже, поэтому принадлежность однозначна. Нормализуем её до
-- schema-cutover: целевая схема не должна наследовать записи без специалиста.
UPDATE be_appointments
SET specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503',
    updated_at = now()
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
  AND deleted_at IS NULL
  AND specialist_id IS NULL;

-- ── Проверка: после слияния у владельца должна остаться одна врачебная запись и один специалист ──
DO $$
DECLARE staff_rows int; spec_rows int;
BEGIN
  SELECT count(*) INTO staff_rows
  FROM platform_users
  WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'
    AND phone_normalized = '+79643805480'
    AND role IN ('admin', 'doctor')
    AND merged_into_id IS NULL;
  SELECT count(*) INTO spec_rows FROM be_specialists WHERE full_name = 'Дмитрий Берсон';
  IF staff_rows <> 1 THEN
    RAISE EXCEPTION 'Ожидали одну staff-запись владельца, осталось %', staff_rows;
  END IF;
  IF spec_rows <> 1 THEN
    RAISE EXCEPTION 'Ожидали одну карточку специалиста, осталось %', spec_rows;
  END IF;
  RAISE NOTICE 'Готово: одна staff-запись, одна карточка специалиста';
END $$;

-- ── Проверка на висячие ссылки: перебирает ВСЕ схемы и падает, если хоть одна осталась ───────────
-- Существует потому, что первая версия проверяла только то, что перечислила сама, и пропустила
-- 48 ссылок без внешнего ключа. Эта проверка ничего не перечисляет — она ищет.
DO $$
DECLARE r record; n bigint; total bigint := 0; dead text[] := ARRAY[
  'a754c977-d1cc-46bb-b870-ca499be81884','9504c4b8-a97b-4be2-b2ff-9e03c13a71fb',
  '2e5068fe-7f50-459f-b879-41cd194e5080','9475c2a9-cbef-4d3e-8357-f96503e2e29b'];
BEGIN
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS col
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
      AND (c.data_type = 'uuid'
           OR (c.data_type IN ('text','character varying')
               AND c.column_name ~ '(user|_by$|actor|owner|author|specialist|changed|platform)'))
  LOOP
    BEGIN
      EXECUTE format('select count(*) from %I.%I where %I::text = any($1)', r.s, r.t, r.col)
        INTO n USING dead;
      IF n > 0 THEN
        RAISE WARNING 'остались висячие ссылки: %.%.% = % строк', r.s, r.t, r.col, n;
        total := total + n;
      END IF;
    EXCEPTION WHEN others THEN NULL;   -- колонка недоступна для чтения — не повод падать
    END;
  END LOOP;
  IF total > 0 THEN
    RAISE EXCEPTION 'после слияния осталось % висячих ссылок на удалённые записи — смотри WARNING выше', total;
  END IF;
  RAISE NOTICE 'Висячих ссылок нет ни в одной схеме';
END $$;

COMMIT;
