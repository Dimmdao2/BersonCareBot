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

## Private bucket policy (ops checklist)

Модель безопасности presigned GET предполагает, что объекты в **`S3_PRIVATE_BUCKET`** **недоступны анонимно** (нет публичного read ни для префикса, ни для всего бакета). Иначе любой, кто знает ключ объекта, может обойти контроль доступа приложения.

**Проверка на MinIO / S3-совместимом хранилище (пример, без секретов):**

- Консоль MinIO: Bucket → **Access Policy** / **Anonymous** — доступ только через авторизованные операции; или через CLI:
  - `mc anonymous get <alias>/<bucket>` — не должно быть `download` / `public` для анонимов.
- После изменений политики — повторить smoke: `GET /api/media/{uuid}` только с сессией (**401** без cookie); presigned URL из ответа работает в окне TTL.

Подробнее про канонические env и пути: **`docs/ARCHITECTURE/SERVER CONVENTIONS.md`**, **`deploy/HOST_DEPLOY_README.md`**.

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

## Revision 4 (2026-04-09, multipart + папки)

- **Multipart:** для крупных файлов — `POST /api/media/multipart/init`, `part-url`, PUT частей в S3 с **ETag**, `POST /api/media/multipart/complete` переводит `media_files` в `ready` и возвращает `url` без отдельного `confirm`. Отмена: `POST /api/media/multipart/abort`. Легаси путь `presign` → PUT → `confirm` сохранён для малых/внешних клиентов.
- **Папки:** `media_folders`, `media_files.folder_id`; admin API под дерево и перенос файлов. Ссылки в контенте по-прежнему `/api/media/{id}`.
- **Очистка:** `POST /api/internal/media-multipart/cleanup` (Bearer `INTERNAL_JOB_SECRET`), рекомендуется cron на loopback; на MinIO — lifecycle **`AbortIncompleteMultipartUpload`**.
- **CORS private-бакета:** для multipart критично **Expose ETag** и заголовки `x-amz-*` — см. `deploy/HOST_DEPLOY_README.md`.
- **Миграция:** `067_media_folders_and_multipart.sql` (webapp).

## Revision 5 (2026-04-10, multipart hardening + ошибки API)

- **Сериализация:** `complete` / `abort` / internal `media-multipart/cleanup` по одному `sessionId` — **advisory transaction lock** (`apps/webapp/src/infra/multipartSessionLock.ts`), чтобы не гонялись финализация и отмена.
- **Повтор `complete`:** если сессия уже в `completing` после успешного S3 `CompleteMultipartUpload`, повторный запрос не вызывает S3 complete снова — Head + идемпотентная финализация в БД; при рассинхроне — `409 finalize_inconsistent_state`, при временном сбое БД — `500 finalize_failed` с `retryable: true` в теле.
- **Коды ошибок (контракт для клиента):** `part-url` и недоступный `complete` различают `404 session_not_found`, `409 session_expired`, `409 session_state_conflict` (вместо одного неразличимого ответа). См. актуальный перечень в `apps/webapp/src/app/api/api.md`.
- **Клиент CMS:** после успешного `init` при ошибке multipart выполняется best-effort `POST /api/media/multipart/abort`.
- **Логи (pino):** поиск по сообщениям вида `[media/multipart/init|complete|abort]` и `[internal/media-multipart/cleanup]` (в теле ответов API также бывает `multipart_init_failed` и пр. поле `error`).

## Revision 3 (2026-04-09, production verification)

- **Runtime webapp:** `systemctl is-active bersoncarebot-webapp-prod.service` -> `active`; `curl -sS http://127.0.0.1:6200/api/health` -> `{"ok":true,...}`.
- **Env (webapp.prod):** подтверждены `DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PRIVATE_BUCKET`; `LOG_LEVEL` может отсутствовать (runtime default `info`).
- **Migration 060:** запись в `schema_migrations` присутствует (`060_media_files_status_retry.sql`, applied 2026-04-09). Проверены фактические объекты в БД: колонки `delete_attempts`/`next_attempt_at`, `media_files_status_check`, индекс `idx_media_files_purge_queue`.
- **Internal purge auth:** `INTERNAL_JOB_SECRET` добавлен в `/opt/env/bersoncarebot/webapp.prod`, после рестарта webapp `POST /api/internal/media-pending-delete/purge` с Bearer возвращает `{"ok":true,...}`.
- **Cron purge:** создан `/etc/cron.d/bersoncarebot-media-purge`, период `* * * * *`, вызов loopback `http://127.0.0.1:6200/api/internal/media-pending-delete/purge?limit=25` с Bearer из `webapp.prod`.
- **Cron service:** `systemctl is-active cron` -> `active`. На этом хосте `systemctl reload cron` не поддерживается (`Job type reload is not applicable`), использовать `systemctl restart cron`.

### Production commands executed (non-secret)

```bash
systemctl is-active bersoncarebot-webapp-prod.service
curl -sS http://127.0.0.1:6200/api/health

set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT filename, applied_at FROM schema_migrations WHERE filename='060_media_files_status_retry.sql';"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='media_files' AND column_name IN ('delete_attempts','next_attempt_at') ORDER BY column_name;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='media_files'::regclass AND conname='media_files_status_check';"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='media_files' AND indexname='idx_media_files_purge_queue';"

set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
curl -sS -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" "http://127.0.0.1:6200/api/internal/media-pending-delete/purge?limit=1"

cat /etc/cron.d/bersoncarebot-media-purge
systemctl is-active cron
```

## Чек-лист агента

- [x] Env + client + storage + routes + intake + UI + async delete
- [x] Миграция SQL (документ статуса)
- [x] Unit-тесты обновлены; прогнан `pnpm run ci`
- [x] `api.md` обновлён
- [x] Этот отчёт

## Связанные инициативы

- План **HLS dual delivery** (сохранение private S3 и presigned URL; расширение артефактов и playback API): `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/00-master-plan.md`.

## Revision — VIDEO_HLS_DELIVERY phase-09 (private bucket, ops checklist)

Связано с `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_09.md` (finding P09-2). Код webapp подписывает только **`S3_PRIVATE_BUCKET`** и требует сессию на **`GET /api/media/[id]`** / playback; ниже — **подтверждение инфраструктуры** (вне репозитория):

1. Для бакета **`S3_PRIVATE_BUCKET`**: запретить анонимный **`s3:GetObject`** (bucket policy + при необходимости Block Public Access в AWS / эквивалент в MinIO).
2. Периодически проверять отсутствие **публичных ACL** чтения на объектах медиа.
3. Убедиться, что прод-доступ браузера к байтам видео — через **presigned** URL после приложения, а не через публичный endpoint хранилища.

TTL presigned GET для patient playback / progressive redirect задаётся в **`system_settings.video_presign_ttl_seconds`** (не env); см. `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-09-signed-urls-ttl-and-private-access.md`.
