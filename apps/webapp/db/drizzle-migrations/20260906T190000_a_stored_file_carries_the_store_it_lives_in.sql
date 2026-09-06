-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 2 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('media_files','patient_files') AND a.attname = 'storage_target' AND NOT a.attisdropped AND a.attnotnull AND NOT a.atthasdef)
--
-- Owner ruling 06.09.2026: файлы и видео пациентов лежат в хранилище с серверным шифрованием, а
-- библиотека упражнений и медиа CMS остаются там, где дешевле объём и трафик. Значит физических
-- хранилищ становится два, и строка обязана знать, в котором из них лежит её объект.
--
-- По ключу это не выводится. Файлы врача о пациенте уходят под префикс `patient-files/`, но видео,
-- которое пациент записывает по программе, кладётся под общий `media/` рядом с библиотекой — то есть
-- префикс разделяет не то множество, которое нужно разделить. Поэтому хранилище записывается явно.
--
-- `DEFAULT 'library'` здесь — заполнение УЖЕ СУЩЕСТВУЮЩИХ строк, и оно правдиво: ни один объект
-- никуда не переезжает, всё уже лежащее осталось на месте. Но жить в колонке умолчание не должно:
-- иначе вставка, забывшая назвать хранилище, тихо положит файл пациента в библиотеку — ровно то, что
-- владелец запретил 06.09.2026. Поэтому сразу после заполнения умолчание снимается, и такая вставка
-- падает на NOT NULL. Единственный SQL-писатель этих таблиц — `app.create_patient_program_submission_media`
-- — колонку называет; остальные пути идут через Drizzle, где она обязательна по типу.
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS storage_target text NOT NULL DEFAULT 'library';
ALTER TABLE public.patient_files
  ADD COLUMN IF NOT EXISTS storage_target text NOT NULL DEFAULT 'library';
ALTER TABLE public.media_files ALTER COLUMN storage_target DROP DEFAULT;
ALTER TABLE public.patient_files ALTER COLUMN storage_target DROP DEFAULT;

-- Замкнутое множество значений: незнакомое хранилище — это потерянный файл, а не гибкость.
ALTER TABLE public.media_files
  DROP CONSTRAINT IF EXISTS media_files_storage_target_check;
ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_storage_target_check
  CHECK (storage_target IN ('library', 'patient'));
ALTER TABLE public.patient_files
  DROP CONSTRAINT IF EXISTS patient_files_storage_target_check;
ALTER TABLE public.patient_files
  ADD CONSTRAINT patient_files_storage_target_check
  CHECK (storage_target IN ('library', 'patient'));

-- Прав здесь нет намеренно. AGENTS.md §1: GRANT/REVOKE живут в декларации
-- `deploy/postgres/privileges/declaration.ts` и приезжают отдельным reconcile, иначе миграция и
-- канонический reconcile расходятся, и первый же прогон reconcile снимет то, что выдала миграция.
-- Колонка объявлена там же, где `s3_key`: кто читает ключ объекта, обязан знать и хранилище.
