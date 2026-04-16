# Media library — background preview pipeline

**Статус:** реализовано в webapp (миграция `075_media_preview_status.sql`). **Дата:** 2026-04-16.

## Назначение

Сетка библиотеки и модалка выбора медиа показывают **готовые JPEG-превью** с сервера, без декодирования видео в браузере и без загрузки полноразмерных оригиналов в списке.

## Данные

Таблица `media_files` (доп. колонки):

| Колонка | Смысл |
|--------|--------|
| `preview_status` | `pending` \| `ready` \| `failed` \| `skipped` |
| `preview_sm_key` | Ключ объекта в private S3 (миниатюра ~160px) |
| `preview_md_key` | Ключ среднего превью (~400px), только для **изображений** |
| `preview_attempts`, `preview_next_attempt_at` | Повторы при ошибке (экспоненциальная задержка) |

Объекты в бакете: `previews/sm/{uuid}.jpg`, `previews/md/{uuid}.jpg` (стабильные ключи).

## Воркер

- **HTTP:** `POST /api/internal/media-preview/process?limit=10`
- **Авторизация:** `Authorization: Bearer <INTERNAL_JOB_SECRET>` (как purge удаления медиа).
- **Логика:** `processMediaPreviewBatch` в [`apps/webapp/src/infra/repos/mediaPreviewWorker.ts`](../apps/webapp/src/infra/repos/mediaPreviewWorker.ts): выбор строк `preview_status = 'pending'` с `FOR UPDATE SKIP LOCKED`, чтение оригинала из S3, для **image** — `sharp` (sm + md), для **video** — `ffmpeg` кадр (~1 с, fallback 0 с) + `sharp` до sm, загрузка в S3, `preview_status = 'ready'`.
- **Cron:** см. [`deploy/HOST_DEPLOY_README.md`](../deploy/HOST_DEPLOY_README.md) (loopback `127.0.0.1:6200`).

### Лимиты и устойчивость (post-audit)

- **Изображения:** если `size_bytes` > **50 MiB**, воркер выставляет `preview_status = 'skipped'` (не грузит весь файл в Node — защита от OOM). Константа: `MAX_IMAGE_PREVIEW_BYTES` в `mediaPreviewWorker.ts`.
- **Видео:** если `size_bytes` > **200 MiB**, превью пропускается (`skipped`) — ограничение нагрузки `ffmpeg` по presigned URL.
- **ffmpeg:** таймаут извлечения кадра **120 с** (`SIGKILL` на команде); очистка временного каталога в `tmpdir` при любом исходе (в т.ч. ошибка `readFile` после успешного кодирования).
- **SQL «readable» статуса:** воркер импортирует `MEDIA_READABLE_STATUS_SQL` из [`s3MediaStorage.ts`](../apps/webapp/src/infra/repos/s3MediaStorage.ts), без дублирования литерала.

### Доступ к превью

Как и `GET /api/media/:id`, маршрут превью требует **любую** валидную сессию, без проверки роли владельца файла (UUID как capability URL). Это осознанное совпадение с моделью отдачи оригинала; ужесточение — отдельная задача (роль врача / ACL).

## Отдача превью клиенту

- **Маршрут:** `GET /api/media/:id/preview/sm` | `md`
- **Доступ:** активная сессия (как у `GET /api/media/:id`).
- **Ответ:** `307` на presigned GET; `Cache-Control: private, max-age=3500` (короче TTL presign 3600 с).

Оригиналы по-прежнему: `GET /api/media/:id` (лайтбокс, видео).

## UI

- Основная библиотека: [`MediaCard`](../apps/webapp/src/app/app/doctor/content/library/MediaCard.tsx) — `<img src={previewSmUrl}>`, skeleton при `pending`, плейсхолдер при `failed` / `skipped` (**без** загрузки оригинала в сетке).
- Таблица файлов: [`MediaLibraryClient`](../apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx) — тот же подход (`TableMediaThumb`).
- Модалка выбора: [`MediaPickerList`](../apps/webapp/src/shared/ui/media/MediaPickerList.tsx) — только статичные превью, без `<video>`.
- Лайтбокс для **изображений:** [`MediaLightbox`](../apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx) — при `previewStatus === 'ready'` и наличии `previewMdUrl` грузится md; иначе оригинал `url`.

## Удаление

[`purgePendingMediaDeleteBatch`](../apps/webapp/src/infra/repos/s3MediaStorage.ts) удаляет из S3 `preview_sm_key`, `preview_md_key` и основной `s3_key` перед удалением строки.

## Зависимости

В `apps/webapp`: `sharp`, `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`. В корневом `package.json` перечислены в `pnpm.onlyBuiltDependencies`, чтобы postinstall установил нативные бинарники.

**Next.js production build:** пакеты с динамическим `require` у `@ffmpeg-installer/*` не бандлятся Turbopack — в [`apps/webapp/next.config.ts`](../apps/webapp/next.config.ts) задано `serverExternalPackages` для `sharp`, `fluent-ffmpeg` и `@ffmpeg-installer/*`.

## Миграция

Применить [`075_media_preview_status.sql`](../apps/webapp/migrations/075_media_preview_status.sql) через процесс миграций webapp (`pnpm --dir apps/webapp migrate` в dev или принятую в проце процедуру на хосте).
