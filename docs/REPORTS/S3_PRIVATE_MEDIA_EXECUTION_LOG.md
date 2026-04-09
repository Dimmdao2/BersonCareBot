# S3 private media — execution log

Дата внедрения: 2026-04-08 (репозиторий BersonCareBot).

## Решения

- **Хранение:** новые объекты CMS и вложений (`media_files`) пишутся в бакет **`S3_PRIVATE_BUCKET`** (presigned PUT, PutObject, Head, Delete, presigned GET).
- **Публичный бакет `S3_PUBLIC_BUCKET`:** опционален; используется только для легаси-матчинга в `findUsage` (полные URL в контенте) и возможных будущих прямых CDN-URL.
- **Канонический URL в API и CMS:** `/api/media/{uuid}`. `GET /api/media/[id]` отвечает **302** на **presigned GET** к объекту в private-бакете; заголовок `Cache-Control: private, max-age=0, must-revalidate`.
- **Presign:** `POST /api/media/presign` возвращает `readUrl` (путь приложения); поля `publicUrl` и сырого S3 `key` в ответе нет (ключ остаётся только на сервере при insert).
- **Confirm:** `POST /api/media/confirm` возвращает `url` как `/api/media/{mediaId}`.
- **Включение S3 в webapp:** `isS3MediaEnabled` требует `S3_ENDPOINT`, ключи и **`S3_PRIVATE_BUCKET`** (не public).
- **Удаление:** `DELETE /api/admin/media/[id]` ставит строку в статус `pending_delete`; ответ `{ ok, deleted, scheduled: true }`. Фон: `POST /api/internal/media-pending-delete/purge` с заголовком `Authorization: Bearer <INTERNAL_JOB_SECRET>` (cron/systemd). Переменная `INTERNAL_JOB_SECRET` пуста → маршрут возвращает 503. Воркер обрабатывает и **`deleting`** (застрявшие записи от старой синхронной схемы удаления).
- **Онлайн-заявка ЛФК (врач):** при включённом S3 ссылки на файлы — `presignGetUrl` для private-бакета.

## Cutover на проде (операции, без секретов)

1. Скопировать объекты из старого public-бакета в private с **теми же ключами** (`mc mirror`, `aws s3 sync` или аналог).
2. В env webapp задать **`S3_PRIVATE_BUCKET`** (и сохранить endpoint/ключи).
3. Задеплоить приложение.
4. Настроить периодический вызов purge (cron) с `INTERNAL_JOB_SECRET`.
5. Проверить CORS на MinIO для **private** бакета (presigned PUT с браузера).

## Миграция public → private и отказоустойчивость чтения

- **Cutover (реализовано в ops):** объекты копируются в private с теми же ключами, env переключается на `S3_PRIVATE_BUCKET`, деплой. В коде **нет dual-read** (нет fallback «сначала private, потом public»): приложение читает только private-бакет для presigned GET.
- **Dual-read в приложении не делали** — проще cutover или короткое окно; иначе усложняются обработчики и тесты.

## Видео (Range / seek)

Сейчас `GET /api/media/:id` — **302** на presigned URL; Range для `<video>` обычно работает на стороне MinIO. Если появятся сбои seek/буферизации — отдельная задача: проксирование `GetObject` через webapp с пробросом `Range` (см. `apps/webapp/src/app/api/api.md`).

## Легаси URL в контенте

Если в `content_pages` остались **полные** URL старого public endpoint, а `S3_PUBLIC_BUCKET` в env пуст — `findUsage` может не найти вхождения. Ops: обновить строки в БД или временно задать public bucket для матчинга.

## Доступ к медиа и internal purge

- **`GET /api/media/{uuid}`:** требуется **сессия** (cookie); без сессии — `401`. Браузер передаёт cookie при same-origin запросах к `/api/media/...` (в т.ч. для `<img>` / `<video>`).
- **`POST /api/internal/media-pending-delete/purge`:** помимо `INTERNAL_JOB_SECRET` на production рекомендуется ограничить `/api/internal/` в nginx только `127.0.0.1` и вызывать cron на loopback — см. `deploy/HOST_DEPLOY_README.md`. Ответ включает **`errors`** — число строк, у которых в этом прогоне не удалось удалить объект в S3 (запланирован retry).

## Операционный канон

Фактический systemd webapp и пути env на хосте: **`docs/ARCHITECTURE/SERVER CONVENTIONS.md`** и синхронизированный **`deploy/HOST_DEPLOY_README.md`** (после правок 2026-04-08).

## Файлы (ориентир)

- `apps/webapp/src/config/env.ts` — `S3_PRIVATE_BUCKET`, `INTERNAL_JOB_SECRET`, `isS3MediaEnabled`
- `apps/webapp/src/infra/s3/client.ts`
- `apps/webapp/src/infra/repos/s3MediaStorage.ts` — `MEDIA_READABLE_STATUS_SQL`, `purgePendingMediaDeleteBatch`
- `apps/webapp/src/app/api/media/[id]/route.ts`, `presign`, `confirm`
- `apps/webapp/src/app/api/internal/media-pending-delete/purge/route.ts`
- `apps/webapp/migrations/045_media_pending_delete_status.sql` (документация статуса)
- `apps/webapp/migrations/060_media_files_status_retry.sql` — CHECK, `delete_attempts`, `next_attempt_at`, индекс purge
- `apps/webapp/src/infra/logging/logger.ts` — pino
- `apps/webapp/src/app/api/admin/media/delete-errors/route.ts`

## Revision 2 (2026-04-09)

- **`GET /api/media/[id]`:** только с **сессией** (иначе `401`); presigned redirect без изменений по смыслу private-бакета.
- **Логи webapp:** структурированный **pino** (`apps/webapp/src/infra/logging/logger.ts`), уровень **`LOG_LEVEL`** в env (по умолчанию `info`); `logServerRuntimeError` пишет через pino.
- **MIME:** расширенный белый список в `uploadAllowedMime.ts` + magic bytes в `POST /api/media/upload` (см. `api.md`).
- **Purge retry:** колонки `delete_attempts`, `next_attempt_at`; миграция `060_media_files_status_retry.sql` (CHECK на `status`); при сбое S3 — backoff до 1 суток; ответ purge `{ removed, errors }`.
- **Админ/UI:** `GET /api/admin/media/delete-errors`, страница `/app/doctor/content/library/delete-errors`, бейдж в библиотеке при `total > 0`.

## Чек-лист агента

- [x] Env + client + storage + routes + intake + UI + async delete
- [x] Миграция SQL (документ статуса)
- [x] Unit-тесты обновлены; прогнан `pnpm run ci`
- [x] `api.md` обновлён
- [x] Этот отчёт
