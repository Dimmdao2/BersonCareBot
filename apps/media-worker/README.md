# media-worker (HLS transcode)

Node.js воркер, который через authenticated webapp control route читает очередь **`media_transcode_jobs`**, тянет исходный объект из private S3/MinIO, запускает **FFmpeg** (HLS + опциональный watermark) и выкладывает артефакты обратно в бакет. Точка входа: `src/main.ts` → `dist/main.js` (см. systemd `bersoncarebot-media-worker-prod.service` в репозитории).

## Условия работы

- В webapp DB **`video_hls_pipeline_enabled = true`** (и остальная инфраструктура S3) — иначе воркер простаивает (poll).
- `MEDIA_WORKER_CONTROL_URL` и общий с webapp `INTERNAL_JOB_SECRET` обязательны; worker не получает `DATABASE_URL`, DB pool, DB login или DB principal credential. Webapp control route сам устанавливает точный `app_operational_media_worker` role.
- На хосте нужен **ffmpeg** в `PATH` или путь из env воркера (см. `src/env.ts` / `MEDIA_WORKER_*` в деплой-доках).

## Очередь и claim

- Worker отправляет `claim` в [`src/control.ts`](./src/control.ts); атомарный выбор следующей задачи выполняет webapp seam [`../webapp/src/app-layer/media/mediaWorkerControl.ts`](../webapp/src/app-layer/media/mediaWorkerControl.ts) под `app_operational_media_worker`. Порядок — **`ORDER BY created_at ASC`** среди строк со статусом `pending` (и окном `next_attempt_at`).
- Отдельного приоритета для массового **legacy backfill** (скрипт `video-hls-backfill-legacy` в webapp) **нет**: новые загрузки и backfill конкурируют в одной очереди FIFO по времени создания job.

## Перенос / копирование модуля в другой проект

Если вы выносите этот пакет или копируете паттерн очереди:

1. Явно решите политику приоритетов: например отдельное поле **`priority`**, отдельная очередь или replica для bulk backfill, или окно обслуживания только ночью — иначе длинный backfill может задерживать свежие загрузки.
2. Пересмотрите **`reclaimStaleProcessing`** (залипшие `processing`) и TTL блокировок под ваши SLA.
3. Сохраните инвариант: тяжёлый FFmpeg **не** в Next.js request path.
