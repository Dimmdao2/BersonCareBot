-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM pg_constraint WHERE conname = 'media_files_preview_status_check' AND pg_get_constraintdef(oid) LIKE '%blocked%'
--
-- Поручение владельца 14.09.2026, дословно: «если мы уже определили причину ошибки как НЕТ
-- ДЕКОДЕРА — пытаться повторять это каждые несколько минут — бред. Надо уведомить глобал админа и
-- просто записать эти медиа в отложенные до исправления».
--
-- Замер, из которого это выросло: HEIC с айфона на новом проде крутил попытки каждые несколько
-- минут и падал `spawn convert ENOENT` — в образе не было ImageMagick, к которому воркер уходит,
-- когда ffmpeg не разобрал HEIF-контейнер. Ни одна попытка не могла закончиться иначе: файл в
-- порядке, окружение — нет. Через пять попыток строка стала бы `failed`, то есть «мы пытались,
-- файл плохой» — неправда, и бэкфилл такие строки намеренно не выбирает.
--
-- Отсюда шестое состояние. `blocked` — «разобрать нечем, ждём исправления среды»: попытки НЕ
-- планируются вовсе (`preview_next_attempt_at` пуст), в очередь строка не возвращается, а выйдет
-- из этого состояния только тогда, когда воркер на старте сообщит, что инструмент появился.
-- Отличие от соседей: `failed` — про файл, `skipped` — «превью не будет никогда» (формат, размер),
-- `blocked` — про НАС, и это единственное из трёх, что чинится деплоем.
--
-- Пользователю разницы нет: всё, что не `ready`, интерфейс показывает как «готовится»
-- (`resolveMediaPlaybackPayload`) — ровно то, чего владелец и просил.

ALTER TABLE public.media_files
  DROP CONSTRAINT IF EXISTS media_files_preview_status_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_preview_status_check
  CHECK (preview_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'skipped'::text, 'blocked'::text]));
