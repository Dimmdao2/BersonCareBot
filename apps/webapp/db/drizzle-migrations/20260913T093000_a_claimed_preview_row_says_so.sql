-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM pg_constraint WHERE conname = 'media_files_preview_status_check' AND pg_get_constraintdef(oid) LIKE '%processing%'
--
-- М7 плана `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`: разбор картинок, HEIC и постеров уезжает
-- из процесса вебаппа в `apps/media-worker`. До этого превью считались ВНУТРИ одной транзакции —
-- строка держалась `FOR UPDATE SKIP LOCKED` всё время, пока крутились sharp и ffmpeg, и «занята»
-- означало «есть открытая транзакция». Разбор в другом процессе так не запереть: транзакция должна
-- закрыться сразу, а занятость — пережить её.
--
-- Отсюда четвёртое состояние. Занятая строка стоит в `processing`, а её `preview_next_attempt_at`
-- становится сроком аренды: не уложился воркер — строка возвращается в оборот сама, без отдельного
-- задания-сборщика. Отдельной колонки под замок НЕ заводим: исход наряда детерминирован (ключи
-- выводятся из `media_id`), от гонки достаточно условия `preview_status = 'processing'` в отчёте.
--
-- Интерфейс это состояние уже понимает: всё, что не `ready`/`failed`/`skipped`, показывается как
-- «готовится» (`resolveMediaPlaybackPayload`), то есть ровно то, чем `processing` и является.

ALTER TABLE public.media_files
  DROP CONSTRAINT IF EXISTS media_files_preview_status_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_preview_status_check
  CHECK (preview_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'skipped'::text]));
