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
| `preview_md_key` | Ключ среднего превью (~400px) для **image**, **video** и **HEIC/HEIF** (воркер пишет sm + md) |
| `preview_attempts`, `preview_next_attempt_at` | Повторы при ошибке (экспоненциальная задержка) |
| `source_width`, `source_height` | Размер исходника (пиксели), заполняет воркер (`sharp` metadata / `ffprobe`); UI библиотеки показывает «Разрешение» без client-side probe |

Объекты в бакете: `previews/sm/{uuid}.jpg`, `previews/md/{uuid}.jpg` (стабильные ключи).

## Воркер

- **HTTP:** `POST /api/internal/media-preview/process?limit=10`
- **Авторизация:** `Authorization: Bearer <INTERNAL_JOB_SECRET>` (как purge удаления медиа).
- **Логика:** `processMediaPreviewBatch` в [`apps/webapp/src/infra/repos/mediaPreviewWorker.ts`](../apps/webapp/src/infra/repos/mediaPreviewWorker.ts): выбор строк `preview_status = 'pending'` с `FOR UPDATE SKIP LOCKED`, чтение оригинала из S3, для **image** — `sharp` (sm + md) + `source_width`/`source_height` из `metadata()`, для **video** — `ffmpeg` кадр (~1 с, fallback 0 с) + `sharp` до **sm и md**, размеры источника через `ffprobe`, для **HEIC** — декод в JPEG, затем `sharp` для sm/md; размеры источника: приоритет `ffprobe` по presigned оригиналу, иначе метаданные `sharp` по декодированному кадру; при неудаче ffmpeg — magick + sharp. Загрузка в S3, `preview_status = 'ready'`. В выборке видны `source_width`/`source_height`; если оба ещё `NULL` до обработки (backfill) — **debug**-лог.
- **Cron:** см. [`deploy/HOST_DEPLOY_README.md`](../deploy/HOST_DEPLOY_README.md) (loopback `127.0.0.1:6200`).

### Лимиты и устойчивость (post-audit)

- **Изображения:** если `size_bytes` > **50 MiB**, воркер выставляет `preview_status = 'skipped'` (не грузит весь файл в Node — защита от OOM). Константа: `MAX_IMAGE_PREVIEW_BYTES` в `mediaPreviewWorker.ts`.
- **Видео:** лимит источника для превью выровнен с лимитом загрузки CMS (**3 GiB**). Если размер выше — `preview_status = 'skipped'`.
- **HEIC/HEIF:** сначала пытаемся получить `sm`-превью через `ffmpeg`; если декодер не справился, запускается fallback через `ImageMagick` (`magick`/`convert`) с конвертацией в JPEG, затем resize через `sharp`.
- **HEIC download:** перед `ImageMagick` исходник скачивается во временный файл с HTTP timeout **120 с** (`AbortController`); timeout считается ретрабельной ошибкой (backoff), а не permanent skip.
- **ffmpeg:** таймаут извлечения кадра **120 с** (`SIGKILL` на команде); очистка временного каталога в `tmpdir` при любом исходе (в т.ч. ошибка `readFile` после успешного кодирования).
- **Permanent errors:** сообщения вида `SIGSEGV`, `compression format has not been built in`, `Input buffer contains unsupported image format`, `Invalid data found when processing input` считаются неретрабельными и переводят запись в `skipped`.
- **SQL «readable» статуса:** воркер импортирует `MEDIA_READABLE_STATUS_SQL` из [`s3MediaStorage.ts`](../apps/webapp/src/infra/repos/s3MediaStorage.ts), без дублирования литерала.

## Матрица форматов

| Формат | Статус | Причина |
|--------|--------|---------|
| `image/jpeg`, `image/png`, `image/webp`, `image/gif` | `ready` | `sharp` поддерживает |
| `image/heic`, `image/heif` | `ready` при наличии `ffmpeg` или `ImageMagick` | ffmpeg first (sm+md), fallback через `magick`/`convert` + sharp sm+md; при обеих ошибках будет `skipped` |
| `video/mp4`, `video/webm` | `ready` | системный `ffmpeg` |
| `video/quicktime` (`.mov`) | `ready` при системном `ffmpeg` | `@ffmpeg-installer` может давать `SIGSEGV` на хосте |

### Доступ к превью

Как и `GET /api/media/:id`, маршрут превью требует **любую** валидную сессию, без проверки роли владельца файла (UUID как capability URL). Это осознанное совпадение с моделью отдачи оригинала; ужесточение — отдельная задача (роль врача / ACL).

## Отдача превью клиенту

- **Маршрут:** `GET /api/media/:id/preview/sm` | `md`
- **Доступ:** активная сессия (как у `GET /api/media/:id`).
- **Ответ:** тело JPEG из S3 через webapp (**proxy**), не `307` на presigned URL.
- **Кэш:** `Cache-Control: private, max-age=86400, stale-while-revalidate=604800`; **`ETag`** из `HeadObject` по ключу превью (fallback — SHA-256 тела; не от `mediaId+size`); **`Last-Modified`** из S3 (`LastModified` Head) или разумный fallback после чтения тела; **`304 Not Modified`** по `If-None-Match` и (если нет `If-None-Match`, но есть ETag из Head) по **`If-Modified-Since`**.
- **Fallback:** при ошибке чтения S3 — `307` на presigned GET (логируется как `[preview GET] fallback redirect used`).

Оригиналы по-прежнему: `GET /api/media/:id` (лайтбокс, видео).

## UI

- Канонический фронтенд: см. [`docs/ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md`](./ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md).
- Сетка/таблица/пикеры: [`MediaThumb`](../apps/webapp/src/shared/ui/media/MediaThumb.tsx) на **`MediaPreviewUiModel`** ([`mediaPreviewUiModel.ts`](../apps/webapp/src/shared/ui/media/mediaPreviewUiModel.ts)); фаза внутри через [`getMediaThumbPhase`](../apps/webapp/src/shared/ui/media/mediaThumbState.ts); URL превью только через [`mediaPreviewUrls.ts`](../apps/webapp/src/shared/lib/mediaPreviewUrls.ts). Инварианты: `pnpm --dir apps/webapp run lint` включает [`scripts/check-media-preview-invariants.sh`](../apps/webapp/scripts/check-media-preview-invariants.sh).
- Лайтбокс для **изображений:** [`MediaLightbox`](../apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx) — при `previewStatus === 'ready'` и наличии `previewMdUrl` грузится md; иначе оригинал `url`.

## Логирование (сводно)

| Место | Событие |
|--------|---------|
| `mediaPreviewWorker` | `source dimensions stored` при записи `source_width`/`source_height`; `backfill: source dimensions NULL before processing` (debug) |
| `preview/[size]/route` | успешная отдача тела / 304 — **debug** (`served body`, `not modified`); `not found` / `s3 read failed` / предупреждения — без понижения |

## Удаление

[`purgePendingMediaDeleteBatch`](../apps/webapp/src/infra/repos/s3MediaStorage.ts) удаляет из S3 `preview_sm_key`, `preview_md_key` и основной `s3_key` перед удалением строки.

## Зависимости

В `apps/webapp`: `sharp`, `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`. Для HEIC fallback в production нужен установленный `ImageMagick` (`magick` или `convert` в `PATH`, либо `MAGICK_PATH` в env).

Для production runtime воркер сначала читает `FFMPEG_PATH` из env (рекомендуемо `/usr/bin/ffmpeg`) и только затем fallback на бинарь из `@ffmpeg-installer`. Для HEIC fallback можно задать `MAGICK_PATH` (например `/usr/bin/magick`).

**Next.js production build:** пакеты с динамическим `require` у `@ffmpeg-installer/*` не бандлятся Turbopack — в [`apps/webapp/next.config.ts`](../apps/webapp/next.config.ts) задано `serverExternalPackages` для `sharp`, `fluent-ffmpeg` и `@ffmpeg-installer/*`.

## Миграция

Применить [`075_media_preview_status.sql`](../apps/webapp/migrations/075_media_preview_status.sql), [`076_requeue_skipped_mov_heic.sql`](../apps/webapp/migrations/076_requeue_skipped_mov_heic.sql), [`077_requeue_previews_skipped_by_200mb_cap.sql`](../apps/webapp/migrations/077_requeue_previews_skipped_by_200mb_cap.sql), [`079_media_files_source_dimensions.sql`](../apps/webapp/migrations/079_media_files_source_dimensions.sql), при необходимости backfill [`080_requeue_source_dimensions.sql`](../apps/webapp/migrations/080_requeue_source_dimensions.sql) и requeue видео без md [`081_requeue_video_for_md_preview.sql`](../apps/webapp/migrations/081_requeue_video_for_md_preview.sql) через процесс миграций webapp (`pnpm --dir apps/webapp migrate` в dev или принятую в проекте процедуру на хосте).

## Troubleshooting: ffmpeg SIGSEGV

- Симптом: в логах webapp есть `ffmpeg was killed with signal SIGSEGV`.
- Причина: бинарь `@ffmpeg-installer` несовместим с glibc хоста.
- Исправление: установить системный ffmpeg (`apt install ffmpeg`), задать `FFMPEG_PATH=/usr/bin/ffmpeg` в `/opt/env/bersoncarebot/webapp.prod`, затем перезапустить `bersoncarebot-webapp-prod.service`.
- После фикса рантайма применить миграцию [`076_requeue_skipped_mov_heic.sql`](../apps/webapp/migrations/076_requeue_skipped_mov_heic.sql), чтобы повторно поставить старые `skipped` MOV/HEIC в очередь воркера.
