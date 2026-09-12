# Media library — background preview pipeline

**Статус:** работает для загруженных файлов и hosted-video; актуализировано 2026-09-10 — разбор байт
переехал из процесса вебаппа в `apps/media-worker` (М7, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`).

## Назначение

Сетка библиотеки и модалка выбора медиа показывают **готовые JPEG-превью** с сервера, без декодирования видео в браузере и без загрузки полноразмерных оригиналов в списке.

## Данные

Таблица `media_files` (доп. колонки):

| Колонка                                       | Смысл                                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `preview_status`                              | `pending` \| `processing` (занято воркером) \| `ready` \| `failed` \| `skipped`                                                          |
| `preview_sm_key`                              | Ключ объекта в private S3 (миниатюра ~160px)                                                                                             |
| `preview_md_key`                              | Ключ среднего превью (~400px) для **image**, **video** и **HEIC/HEIF** (воркер пишет sm + md)                                            |
| `preview_attempts`, `preview_next_attempt_at` | Повторы при ошибке (экспоненциальная задержка)                                                                                           |
| `source_width`, `source_height`               | Размер исходника (пиксели), заполняет воркер (`sharp` metadata / `ffprobe`); UI библиотеки показывает «Разрешение» без client-side probe |

Объекты в бакете: `previews/sm/{uuid}.jpg`, `previews/md/{uuid}.jpg` (стабильные ключи).

## Воркер

**Кто это делает.** Байты разбирает отдельный процесс [`apps/media-worker`](../apps/media-worker/) — тот же,
что режет видео в HLS. Учётных данных БД у него нет вовсе (`src/env.ts` падает, если они появятся), HTTP-порта
нет, к базе он ходит только через контрольный шов вебаппа. До 10.09.2026 всё это крутилось ВНУТРИ процесса
Next.js — рядом с пулами к базе, `SESSION_COOKIE_SECRET` и живыми запросами врачей и пациентов; дефект памяти
в libvips, ImageMagick или ffmpeg приземлялся прямо на данные пациентов.

**Кто что решает.** Решения остались в вебаппе, у воркера — только разбор:

- что делать со строкой — [`modules/media/mediaPreviewPlan.ts`](../apps/webapp/src/modules/media/mediaPreviewPlan.ts)
  (чистая функция: ветка по mime и размеру, потолки, классификация ошибки, backoff);
- очередь, аренда и запись исхода — [`infra/repos/pgMediaPreviewControl.ts`](../apps/webapp/src/infra/repos/pgMediaPreviewControl.ts);
- разбор байт — [`apps/media-worker/src/processPreviewJob.ts`](../apps/media-worker/src/processPreviewJob.ts).

**Шов.** `POST /api/internal/media-worker/control` (Bearer `INTERNAL_JOB_SECRET`), команды:
`preview_claim` (занять наряд), `preview_hosted_bytes` (байты чужой обложки — наружу за ней ходит вебапп),
`preview_done_image`, `preview_done_poster`, `preview_failed`, `preview_tick` (отметка живости).
**Ни один ключ объекта в отчёте не передаётся:** и ключи вывода, и вытесненный исходник вебапп считает сам от
`media_id` и от текущей строки — иначе у процесса, разбирающего враждебные байты, появился бы примитив
«перенаправь строку на произвольный объект» и «удали произвольный объект».

**Замок.** Занятая строка стоит в `preview_status = 'processing'`, её `preview_next_attempt_at` — срок аренды
(`MEDIA_WORKER_PREVIEW_LEASE_MINUTES`, по умолчанию 15 мин). Истёкшая аренда возвращает строку в оборот сама.

**Порядок записи** (решение владельца 19.08.2026, SECURITY_CANON §5) не изменился, только распался на два
процесса: воркер делает encode → PUT рендишна → HEAD → PUT эскизов, и лишь затем отчитывается; вебапп по
отчёту перенаправляет строку, коммитит и ТОЛЬКО ПОСЛЕ этого удаляет вытесненный исходник. Отказ на любом шаге
не доходит до отчёта — исходник остаётся единственной копией, и следующая попытка начинает с него же.

**Расписание.** Host-cron у превью больше нет: очередь ведёт резидентный воркер собственным опросом. Строка
«Превью медиа» в «Здоровье системы» осталась и стала честнее — отметку пишет тот, кто делает работу, поэтому
пустая строка означает «воркер не работает», а не «cron не сработал». В typed manifest
[`backgroundJobManifest.ts`](../apps/webapp/src/modules/operator-health/backgroundJobManifest.ts) задание
`media_preview` объявлено как `resident_scheduler`, шаблоны `/etc/cron.d` для него не генерируются.

### Лимиты и устойчивость (post-audit)

- **Изображения:** если `size_bytes` > **50 MiB**, воркер выставляет `preview_status = 'skipped'` (не грузит весь файл в Node — защита от OOM). Константа: `MAX_IMAGE_PREVIEW_BYTES` в `mediaPreviewPlan.ts`.
- **Видео:** лимит источника для превью выровнен с лимитом загрузки CMS (**3 GiB**). Если размер выше — `preview_status = 'skipped'`.
- **HEIC/HEIF:** сначала пытаемся получить `sm`-превью через `ffmpeg`; если декодер не справился, запускается fallback через `ImageMagick` (`magick`/`convert`) с конвертацией в JPEG, затем resize через `sharp`.
- **Локальный вход ffmpeg:** исходник скачивается из S3 во временный файл, и ffmpeg получает путь, а не подписанный HTTPS-URL, с `-protocol_whitelist file` — ссылку наружу, спрятанную внутри контейнера, он не пойдёт разрешать.
- **ffmpeg:** таймаут одного разбора — `MEDIA_WORKER_PREVIEW_TIMEOUT_MS` (по умолчанию **120 с**, `SIGKILL` на команде); очистка временного каталога в `tmpdir` при любом исходе.
- **Permanent errors:** сообщения вида `SIGSEGV`, `compression format has not been built in`, `Input buffer contains unsupported image format`, `Invalid data found when processing input` считаются неретрабельными и переводят запись в `skipped`.

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
| `media-worker`         | `preview_order_done` / `preview_order_failed` (короткий код ошибки, без stderr и без имён объектов)                                     |
| `mediaPreviewControl`  | `standard rendition stored`; `original deleted after standard rendition`; `preview failed`                                              |
| `preview/[size]/route` | успешная отдача тела / 304 — **debug** (`served body`, `not modified`); `not found` / `s3 read failed` / предупреждения — без понижения |

## Удаление

[`purgePendingMediaDeleteBatch`](../apps/webapp/src/infra/repos/s3MediaStorage.ts) удаляет из S3 `preview_sm_key`, `preview_md_key` и основной `s3_key` перед удалением строки.

## Зависимости

В `apps/media-worker`: `sharp`, `ffmpeg` (bundled `@ffmpeg-installer/ffmpeg` либо системный через `FFMPEG_PATH`)
и, для запасного разбора HEIC, `ImageMagick` (`magick`/`convert` в `PATH` либо `MAGICK_PATH`). В `apps/webapp`
`sharp` остался только для иконок клиники (`modules/media/orgAppIconRenditions.ts`) — это отдельная поверхность,
которая в этот переезд не входила.

FFmpeg запускается argv-массивом без `shell` ([`ffmpeg/runFfmpeg.ts`](../apps/media-worker/src/ffmpeg/runFfmpeg.ts)), с SIGKILL по таймауту и ограниченным хвостом `stderr`; временный каталог убирается всегда. Тексты ошибок (`ffmpeg exited with code N: …`, `ffmpeg was killed with signal …`) сохранены дословно: по ним ВЕБАПП отличает постоянную ошибку файла (`skipped`) от временной (retry/backoff) — классификация принадлежит ему, а не процессу, который разбирал байты.

Воркер сначала читает `FFMPEG_PATH` из env (на сервере канонично `/usr/bin/ffmpeg`), иначе разрешает `ffmpeg` через `PATH`. Для `ffprobe` (размеры источника) порядок прежний: `FFPROBE_PATH` из env → `ffprobe` из `PATH` → сосед указанного `ffmpeg`. Для HEIC fallback можно задать `MAGICK_PATH` (например `/usr/bin/magick`).

**Next.js production build:** в [`apps/webapp/next.config.ts`](../apps/webapp/next.config.ts) нативный `sharp` остаётся в `serverExternalPackages` — он всё ещё нужен вебаппу для иконок клиники. Preview-маршрут `/api/internal/media-preview/process` снят вместе с обработчиком, поэтому его исключения из NFT больше ни на что не влияют.

## Миграции

Исторические `075…081` уже применены и не являются текущей инструкцией запуска. Hosted-preview и единая
leased media-purge машина поставляются forward-only Drizzle-миграциями из
[`apps/webapp/db/drizzle-migrations`](../apps/webapp/db/drizzle-migrations/) и накатываются штатным deploy/migrate
runner; legacy replay вручную не запускать.

## Troubleshooting: ffmpeg SIGSEGV

- Симптом: в логах **media-worker** есть `ffmpeg was killed with signal SIGSEGV`.
- Причина: исторически это давал bundled-бинарь; проверить системный `ffmpeg`, значение `FFMPEG_PATH` и конкретный входной файл.
- Исправление: установить системный ffmpeg (`apt install ffmpeg`), задать `FFMPEG_PATH=/usr/bin/ffmpeg` в `/opt/env/bersoncarebot/media-worker.prod`, затем перезапустить службу media-worker.
- После фикса рантайма применить миграцию [`076_requeue_skipped_mov_heic.sql`](../apps/webapp/migrations/076_requeue_skipped_mov_heic.sql), чтобы повторно поставить старые `skipped` MOV/HEIC в очередь воркера.
