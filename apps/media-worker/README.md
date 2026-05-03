# media-worker (HLS transcode)

Node.js воркер, который читает очередь **`media_transcode_jobs`**, тянет исходный объект из private S3/MinIO, запускает **FFmpeg** (HLS + опциональный watermark) и выкладывает артефакты обратно в бакет. Точка входа: `src/main.ts` → `dist/main.js` (см. systemd `bersoncarebot-media-worker-prod.service` в репозитории).

## Условия работы

- В БД **`video_hls_pipeline_enabled = true`** (и остальная инфраструктура S3) — иначе воркер простаивает (poll).
- Тот же `DATABASE_URL`, что и у webapp в unified-postgres среде; **`system_settings`** читается из БД (зеркалирование integrator — по правилам проекта).
- На хосте нужен **ffmpeg** в `PATH` или путь из env воркера (см. `src/env.ts` / `MEDIA_WORKER_*` в деплой-доках).

## Очередь и claim

- Выбор следующей задачи: [`src/jobs/claim.ts`](./src/jobs/claim.ts) — `claimNextJob`, порядок **`ORDER BY created_at ASC`** среди строк со статусом `pending` (и окном `next_attempt_at`).
- Отдельного приоритета для массового **legacy backfill** (скрипт `video-hls-backfill-legacy` в webapp) **нет**: новые загрузки и backfill конкурируют в одной очереди FIFO по времени создания job.

## Перенос / копирование модуля в другой проект

Если вы выносите этот пакет или копируете паттерн очереди:

1. Явно решите политику приоритетов: например отдельное поле **`priority`**, отдельная очередь или replica для bulk backfill, или окно обслуживания только ночью — иначе длинный backfill может задерживать свежие загрузки.
2. Пересмотрите **`reclaimStaleProcessing`** (залипшие `processing`) и TTL блокировок под ваши SLA.
3. Сохраните инвариант: тяжёлый FFmpeg **не** в Next.js request path.
