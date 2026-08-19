-- BCB-MIGRATION-OWNER: app_object_owner
-- Ограничение снимается и ставится заново одним ALTER TABLE, поэтому классификатор видит только
-- снятие; доказательство — что новое значение в ограничении есть.
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'lfk_exercise_media_media_type_check' AND pg_get_constraintdef(oid) LIKE '%hosted_video%')
--
-- Решение владельца 19.08: «в упражнение нужно вставить ссылку на YouTube / RuTube / VK Видео /
-- Vimeo — открывается в iframe» (docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/OWNER_DECISIONS.md п. 11;
-- исполнение — DOCTOR_UI_REWORK_2026-07-20/PLAN.md UI-EX-HOST-01).
--
-- До этой миграции строка `lfk_exercise_media` могла быть только 'image' | 'video' | 'gif', и все
-- три означают файл нашей медиатеки: `media_url` = `/api/media/{uuid}`, за ним строка
-- `media_files` с превью, перекодированием и длительностью. Ссылка на чужой хостинг ничем из
-- этого не обладает: файла у нас нет, конвертировать нечего, миниатюры своей не будет никогда.
--
-- Записать её как 'video' было бы прямой ложью в данных, и она сразу же материализуется:
--   * пациентский экран пункта программы для 'video' ищет id медиатеки в URL и, не найдя, пишет
--     «видео без привязки к медиатеке нельзя воспроизвести здесь» — то есть ролик не показывается;
--   * лестница превью (`getMediaThumbPhase`) для 'video' без превью говорит «Видео готовится» —
--     ожидание конвертации, которой не будет никогда;
--   * платформенная аналитика считает файлы и iframe одним и тем же срезом по `media_type='video'`
--     и не смогла бы их развести иначе как догадкой по форме URL.
--
-- Поэтому — отдельный вид медиа. 'hosted_video' означает ровно одно: `media_url` хранит публичный
-- канонический URL ролика на одном из четырёх разрешённых хостов
-- (apps/webapp/src/shared/lib/hostingEmbedUrls.ts, parseHostedVideoLink), строки `media_files`
-- за ним нет и не будет, показывается он через `<iframe>`.
--
-- Существующие строки не трогаются: ни одна из них не может быть 'hosted_video', потому что до
-- сих пор такого значения не существовало. Бэкфилла нет.
--
-- Новых индексов не нужно: `media_type` не участвует ни в одном WHERE/ORDER BY на нагруженном
-- пути — медиа читаются по `exercise_id` (idx_lfk_exercise_media_exercise), а аналитический срез
-- фильтрует уже отобранное окно упражнений.
--
-- Владелец шага — `app_object_owner`: SCHEME §обычные объекты, DDL обычной прикладной таблицы.
-- Ни ролей, ни грантов, ни definer-функций эта миграция не касается.

ALTER TABLE public.lfk_exercise_media
  DROP CONSTRAINT IF EXISTS lfk_exercise_media_media_type_check;

ALTER TABLE public.lfk_exercise_media
  ADD CONSTRAINT lfk_exercise_media_media_type_check
  CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'gif'::text, 'hosted_video'::text]));

COMMENT ON COLUMN public.lfk_exercise_media.media_url IS
  'Для image/video/gif — /api/media/{uuid} (строка media_files). Для hosted_video — канонический публичный URL ролика на YouTube/RuTube/VK Видео/Vimeo; файла у нас нет, показывается через iframe.';
