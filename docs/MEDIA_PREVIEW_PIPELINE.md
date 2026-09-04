# Media library — background preview pipeline

**Статус:** работает для загруженных файлов и hosted-video; актуализировано 2026-08-28.

## Назначение

Сетка библиотеки и модалка выбора медиа показывают **готовые JPEG-превью** с сервера, без декодирования видео в браузере и без загрузки полноразмерных оригиналов в списке.

## Данные

Таблица `media_files` (доп. колонки):

| Колонка                                       | Смысл                                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `preview_status`                              | `pending` \| `ready` \| `failed` \| `skipped`                                                                                            |
| `preview_sm_key`                              | Ключ объекта в private S3 (миниатюра ~160px)                                                                                             |
| `preview_md_key`                              | Ключ среднего превью (~400px) для **image**, **video** и **HEIC/HEIF** (воркер пишет sm + md)                                            |
| `preview_attempts`, `preview_next_attempt_at` | Повторы при ошибке (экспоненциальная задержка)                                                                                           |
| `source_width`, `source_height`               | Размер исходника (пиксели), заполняет воркер (`sharp` metadata / `ffprobe`); UI библиотеки показывает «Разрешение» без client-side probe |

Объекты в бакете: `previews/sm/{uuid}.jpg`, `previews/md/{uuid}.jpg` (стабильные ключи).

## Воркер

- **Канонический host tick:** typed manifest
  [`backgroundJobManifest.ts`](../apps/webapp/src/modules/operator-health/backgroundJobManifest.ts) →
  сгенерированный `/etc/cron.d` artifact → единый
  [`run-internal-job.sh`](../deploy/host/run-internal-job.sh). Он раз в минуту вызывает
  `POST /api/internal/media-preview/process?limit=10` с правильными Host/Origin и Bearer. Прямой
  `media-preview:tick` оставлен только для диагностики: он не пишет операторский health tick.
- **Результат HTTP:** batch с `errors=0` возвращает `200` и зелёный tick; хотя бы одна retryable/failed строка
  возвращает `500` и красный tick. Terminal `skipped` — обработанный исход, а не авария задания.
- **Логика:** `processMediaPreviewBatch` в [`apps/webapp/src/infra/repos/mediaPreviewWorker.ts`](../apps/webapp/src/infra/repos/mediaPreviewWorker.ts): выбор строк `preview_status = 'pending'` с `FOR UPDATE SKIP LOCKED`, чтение оригинала из S3, для **image** — `sharp` (sm + md) + `source_width`/`source_height` из `metadata()`, для **video** — `ffmpeg` кадр (~1 с, fallback 0 с) + `sharp` до **sm и md**, размеры источника через `ffprobe`, для **HEIC** — декод в JPEG, затем `sharp` для sm/md. Для `hosted_video_preview` сервер получает обложку YouTube/VK, тем же энкодером нормализует её и кладёт в private S3; браузер пациента к провайдеру картинки не обращается. Временный отказ получает bounded retry, private/deleted/unsupported — terminal `skipped`.
- **Cron / установка:** см. [`deploy/HOST_DEPLOY_README.md`](../deploy/HOST_DEPLOY_README.md); manifest,
  artifact и реально установленное расписание сверяются перед переключением релиза.

### Лимиты и устойчивость (post-audit)

- **Изображения:** если `size_bytes` > **50 MiB**, воркер выставляет `preview_status = 'skipped'` (не грузит весь файл в Node — защита от OOM). Константа: `MAX_IMAGE_PREVIEW_BYTES` в `mediaPreviewWorker.ts`.
- **Видео:** лимит источника для превью выровнен с лимитом загрузки CMS (**3 GiB**). Если размер выше — `preview_status = 'skipped'`.
- **HEIC/HEIF:** сначала пытаемся получить `sm`-превью через `ffmpeg`; если декодер не справился, запускается fallback через `ImageMagick` (`magick`/`convert`) с конвертацией в JPEG, затем resize через `sharp`.
- **HEIC download:** перед `ImageMagick` исходник скачивается во временный файл с HTTP timeout **120 с** (`AbortController`); timeout считается ретрабельной ошибкой (backoff), а не permanent skip.
- **ffmpeg:** таймаут извлечения кадра **120 с** (`SIGKILL` на команде); очистка временного каталога в `tmpdir` при любом исходе (в т.ч. ошибка `readFile` после успешного кодирования).
- **Permanent errors:** сообщения вида `SIGSEGV`, `compression format has not been built in`, `Input buffer contains unsupported image format`, `Invalid data found when processing input` считаются неретрабельными и переводят запись в `skipped`.
- **SQL «readable» статуса:** воркер импортирует `MEDIA_READABLE_STATUS_SQL` из [`s3MediaStorage.ts`](../apps/webapp/src/infra/repos/s3MediaStorage.ts), без дублирования литерала.

## Матрица форматов

| Формат                                               | Статус                                         | Причина                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `image/jpeg`, `image/png`, `image/webp`, `image/gif` | `ready`                                        | `sharp` поддерживает                                                                                     |
| `image/heic`, `image/heif`                           | `ready` при наличии `ffmpeg` или `ImageMagick` | ffmpeg first (sm+md), fallback через `magick`/`convert` + sharp sm+md; при обеих ошибках будет `skipped` |
| `video/mp4`, `video/webm`                            | `ready`                                        | системный `ffmpeg`                                                                                       |
| `video/quicktime` (`.mov`)                           | `ready` при системном `ffmpeg`                 | `@ffmpeg-installer` может давать `SIGSEGV` на хосте                                                      |

### Доступ к превью

Маршрут требует валидный doctor workspace либо активную patient organization и применяет тот же
organization/submission access row, что playback. Знание UUID файла другой клиники не даёт доступ. Канон:
[`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](./ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md).

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
- Метаданные одной строки для гидратации picker / формы: **`GET /api/admin/media/{id}`** (роль врача), тот же shape полей, что у элементов list; клиент: [`fetchAdminMediaListItem.ts`](../apps/webapp/src/shared/ui/media/fetchAdminMediaListItem.ts).
- Лайтбокс для **изображений:** [`MediaLightbox`](../apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx) — только **`previewMdUrl`** или **`previewSmUrl`** при `previewStatus === 'ready'`; без превью — плейсхолдер, **не** загрузка оригинала по `url`. Видео/аудио — воспроизведение с `item.url`.
- Обложки материалов (пациент / предпросмотр врача) с library URL: [`ContentHeroImage`](../apps/webapp/src/shared/ui/media/ContentHeroImage.tsx) + при необходимости `imageLibraryMedia` из каталога ([`content-catalog/service.ts`](../apps/webapp/src/modules/content-catalog/service.ts)).

## Логирование (сводно)

| Место                  | Событие                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `mediaPreviewWorker`   | `source dimensions stored` при записи `source_width`/`source_height`; `backfill: source dimensions NULL before processing` (debug)      |
| `preview/[size]/route` | успешная отдача тела / 304 — **debug** (`served body`, `not modified`); `not found` / `s3 read failed` / предупреждения — без понижения |

## Удаление

[`purgePendingMediaDeleteBatch`](../apps/webapp/src/infra/repos/s3MediaStorage.ts) удаляет из S3 `preview_sm_key`, `preview_md_key` и основной `s3_key` перед удалением строки.

## Зависимости

В `apps/webapp`: `sharp` и системный `ffmpeg`/`ffprobe`. Для HEIC fallback в production нужен установленный `ImageMagick` (`magick` или `convert` в `PATH`, либо `MAGICK_PATH` в env).

Node-обёртка `fluent-ffmpeg` снята (upstream deprecated, без релизов): движок остался тем же системным FFmpeg, воркер запускает его напрямую через [`apps/webapp/src/infra/media/ffmpegPreview.ts`](../apps/webapp/src/infra/media/ffmpegPreview.ts) — argv массивом без `shell`, SIGKILL по таймауту 120 c, ограниченный хвост `stderr`, временный каталог убирается всегда. Тексты ошибок (`ffmpeg exited with code N: …`, `ffmpeg was killed with signal …`) сохранены дословно: по ним воркер отличает постоянную ошибку файла (`skipped`) от временной (retry/backoff).

Воркер сначала читает `FFMPEG_PATH` из env (на сервере канонично `/usr/bin/ffmpeg`), иначе разрешает `ffmpeg` через `PATH`. Для `ffprobe` (размеры источника) порядок прежний: `FFPROBE_PATH` из env → `ffprobe` из `PATH` → сосед указанного `ffmpeg`. Для HEIC fallback можно задать `MAGICK_PATH` (например `/usr/bin/magick`).

**Next.js production build:** в [`apps/webapp/next.config.ts`](../apps/webapp/next.config.ts) нативный `sharp` остаётся в `serverExternalPackages` (`fluent-ffmpeg` оттуда убран вместе с пакетом). Для preview-route исключены исходники и test/config-файлы, которые NFT ошибочно захватывал из-за динамических временных путей. Платформенный `@ffmpeg-installer` из webapp удалён отдельно: сервер использует системный ffmpeg, а bundled-бинарь уже давал `SIGSEGV` на хосте.

## Миграции

Исторические `075…081` уже применены и не являются текущей инструкцией запуска. Hosted-preview и единая
leased media-purge машина поставляются forward-only Drizzle-миграциями из
[`apps/webapp/db/drizzle-migrations`](../apps/webapp/db/drizzle-migrations/) и накатываются штатным deploy/migrate
runner; legacy replay вручную не запускать.

## Troubleshooting: ffmpeg SIGSEGV

- Симптом: в логах webapp есть `ffmpeg was killed with signal SIGSEGV`.
- Причина: исторически это давал bundled-бинарь; после его удаления проверить системный `ffmpeg`, значение `FFMPEG_PATH` и конкретный входной файл.
- Исправление: установить системный ffmpeg (`apt install ffmpeg`), задать `FFMPEG_PATH=/usr/bin/ffmpeg` в `/opt/env/bersoncarebot/webapp.prod`, затем перезапустить `bersoncarebot-webapp-prod.service`.
- После фикса рантайма применить миграцию [`076_requeue_skipped_mov_heic.sql`](../apps/webapp/migrations/076_requeue_skipped_mov_heic.sql), чтобы повторно поставить старые `skipped` MOV/HEIC в очередь воркера.
