-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 2 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('media_files','patient_files') AND a.attname = 'storage_target' AND NOT a.attisdropped) AND has_column_privilege('app_patient','public.media_files','storage_target','SELECT') AND has_column_privilege('app_staff','public.patient_files','storage_target','SELECT')
--
-- Owner ruling 06.09.2026: файлы и видео пациентов лежат в хранилище с серверным шифрованием, а
-- библиотека упражнений и медиа CMS остаются там, где дешевле объём и трафик. Значит физических
-- хранилищ становится два, и строка обязана знать, в котором из них лежит её объект.
--
-- По ключу это не выводится. Файлы врача о пациенте уходят под префикс `patient-files/`, но видео,
-- которое пациент записывает по программе, кладётся под общий `media/` рядом с библиотекой — то есть
-- префикс разделяет не то множество, которое нужно разделить. Поэтому хранилище записывается явно.
--
-- Умолчание `library` описывает существующие строки правдиво: ни один объект никуда не переезжает,
-- всё уже лежащее осталось на месте. Новое значение появляется только у новых загрузок.
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS storage_target text NOT NULL DEFAULT 'library';
ALTER TABLE public.patient_files
  ADD COLUMN IF NOT EXISTS storage_target text NOT NULL DEFAULT 'library';

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

-- Права выдаются ровно там, где выдан `s3_key`: кто может прочитать ключ объекта, обязан знать и
-- хранилище, иначе роль пойдёт искать существующий ключ не в том бакете и получит «файл не найден».
-- Колоночные гранты новую колонку сами не подхватывают — отсюда явный список.
GRANT SELECT (storage_target) ON public.media_files TO app_operational_media_worker;
GRANT SELECT (storage_target) ON public.media_files TO app_patient;
GRANT SELECT (storage_target) ON public.media_files TO app_seam_patient_lfk_media_owner;
GRANT SELECT (storage_target) ON public.media_files TO app_seam_public_clinic_card_owner;
GRANT SELECT (storage_target) ON public.media_files TO app_staff;
GRANT SELECT (storage_target) ON public.media_files TO saas_system_health_owner;
GRANT INSERT (storage_target) ON public.media_files TO app_seam_patient_lfk_media_owner;
GRANT INSERT (storage_target) ON public.media_files TO app_staff;
GRANT UPDATE (storage_target) ON public.media_files TO app_operational_media_worker;
GRANT UPDATE (storage_target) ON public.media_files TO app_seam_patient_lfk_media_owner;

GRANT SELECT (storage_target) ON public.patient_files TO app_staff;
GRANT INSERT (storage_target) ON public.patient_files TO app_staff;
