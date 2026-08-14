-- Слияние раздвоенной учётки владельца в одну каноническую запись.
-- Одноразовая операция: выполняется один раз на TEST и один раз на PROD при переезде.
-- Идентификаторы одни и те же в обеих базах (TEST — дамп прода), поэтому они здесь прямо в тексте.
--
-- Запуск: psql -v ON_ERROR_STOP=1 -f consolidate-owner-identity.sql
-- Сухой прогон: те же команды, но заменить последний COMMIT на ROLLBACK.
--
-- Что делает:
--   1. Переносит все ссылки с админского надгробия a754c977 на живую врачебную запись b0021a38.
--   2. Удаляет надгробие.
--   3. Удаляет две пустые админские записи 9504c4b8 и 2e5068fe.
--   4. Удаляет пустой дубль карточки специалиста 518ea988.
--
-- Чего НЕ делает: не меняет роль выжившей записи (остаётся doctor + владелец клиники, глобальным
-- админом она не становится), не трогает её почту, пароль и данные. Не трогает gmail-запись
-- глобального админа 9c40e322 и живую пациентскую запись 1c312a64. Мёртвое пациентское
-- надгробие 9475c2a9 удаляется по прямому решению владельца 15.08.2026.

BEGIN;

-- ── Предохранители: если база не та, что мы измеряли, дальше не идём ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_users WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'
                   AND role = 'doctor' AND merged_into_id IS NULL) THEN
    RAISE EXCEPTION 'Выжившая запись b0021a38 не найдена, либо у неё не роль doctor, либо она сама помечена слитой';
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
UPDATE app_runtime_settings       SET updated_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE updated_by = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE app_runtime_settings_audit SET updated_by = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE updated_by = 'a754c977-d1cc-46bb-b870-ca499be81884';
UPDATE user_email_setup_tokens    SET created_by_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4' WHERE created_by_user_id = 'a754c977-d1cc-46bb-b870-ca499be81884';

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

-- ── 4. Удаление пустого дубля карточки специалиста ──────────────────────────────────────────────
-- На неё не ссылается ни одна запись, ни расписание, ни услуга. Живая карточка c9515025 не трогается.
DELETE FROM be_specialists WHERE id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b';

-- ── Проверка: после слияния у владельца должна остаться одна врачебная запись и один специалист ──
DO $$
DECLARE staff_rows int; spec_rows int;
BEGIN
  SELECT count(*) INTO staff_rows FROM platform_users WHERE lower(email) = 'dimmdao@yandex.ru';
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
