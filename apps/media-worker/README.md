# media-worker (перекодировщик медиа)

Node.js воркер, который через authenticated webapp control route ведёт ДВЕ очереди и во всём остальном
одинаков: **`media_transcode_jobs`** (видео → HLS + опциональный watermark) и очередь превью
`media_files.preview_status` (картинка → стандартный рендишн WebP, HEIC → JPEG → рендишн, кадр-постер видео,
обложка чужого ролика). Тянет исходный объект из private S3/MinIO, разбирает его у себя и выкладывает
результат обратно в бакет. Точка входа: `src/main.ts` → `dist/main.js` (см. systemd
`bersoncarebot-media-worker-prod.service` в репозитории).

**Зачем здесь превью (10.09.2026, М7 плана `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`).** До переезда картинки,
HEIC и постеры разбирались ВНУТРИ процесса Next.js — того самого, который держит пулы к базе,
`SESSION_COOKIE_SECRET` и отвечает врачам и пациентам. Дефект памяти в libvips, ImageMagick или ffmpeg
приземлялся прямо на данные пациентов. Здесь у процесса нет ни строки подключения к БД, ни HTTP-порта, ни
ключей mTLS, а ffmpeg получает ТОЛЬКО локальный файл с `-protocol_whitelist file`.

**Решения принимает вебапп, не воркер.** Что делать со строкой, какие ключи у вывода, считать ли ошибку
постоянной и когда повторить — всё это приходит в наряде или решается по отчёту
(`apps/webapp/src/modules/media/mediaPreviewPlan.ts`, `.../infra/repos/pgMediaPreviewControl.ts`). Воркер
отдаёт текст ошибки и ни одной строки не закрывает сам.

## Условия работы

- В webapp DB **`video_hls_pipeline_enabled = true`** (и остальная инфраструктура S3) — иначе воркер простаивает (poll).
- `MEDIA_WORKER_CONTROL_URL` и общий с webapp `INTERNAL_JOB_SECRET` обязательны; worker не получает `DATABASE_URL`, DB pool, DB login или DB principal credential. Webapp control route сам устанавливает точный `app_operational_media_worker` role.
- На хосте нужен **ffmpeg** в `PATH` или путь из env воркера (см. `src/env.ts` / `MEDIA_WORKER_*` в деплой-доках).
- Для запасного разбора HEIC — **ImageMagick** (`magick`/`convert` в `PATH` либо `MAGICK_PATH`). Его отсутствие
  не ломает конвейер: сначала всё равно идёт ffmpeg, а отказ обоих вебапп разберёт как обычную ошибку строки.
- Очередь превью НЕ подчиняется `video_hls_pipeline_enabled`: этот флаг выключает конвейер HLS, а превью
  нужны всегда. Пересборка видео берётся первой, превью — когда её очередь пуста.

## Очередь и claim

- Worker отправляет `claim` в [`src/control.ts`](./src/control.ts); атомарный выбор следующей задачи выполняет webapp seam [`../webapp/src/app-layer/media/mediaWorkerControl.ts`](../webapp/src/app-layer/media/mediaWorkerControl.ts) под `app_operational_media_worker`. Порядок — **`ORDER BY created_at ASC`** среди строк со статусом `pending` (и окном `next_attempt_at`).
- Отдельного приоритета для массового **legacy backfill** (скрипт `video-hls-backfill-legacy` в webapp) **нет**: новые загрузки и backfill конкурируют в одной очереди FIFO по времени создания job.

## Перенос / копирование модуля в другой проект

Если вы выносите этот пакет или копируете паттерн очереди:

1. Явно решите политику приоритетов: например отдельное поле **`priority`**, отдельная очередь или replica для bulk backfill, или окно обслуживания только ночью — иначе длинный backfill может задерживать свежие загрузки.
2. Пересмотрите **`reclaimStaleProcessing`** (залипшие `processing`) и TTL блокировок под ваши SLA.
3. Сохраните инвариант: тяжёлый FFmpeg **не** в Next.js request path.
