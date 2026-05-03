# Phase 06 — New video HLS default path

**Цель:** новые загрузки видео **автоматически** ставятся в очередь транскодинга и получают HLS при включённых флагах; **старые** медиа работают как раньше до backfill.

**Зависимости:** [phase-02](./phase-02-transcoding-pipeline-and-worker.md), [phase-04](./phase-04-playback-api-and-delivery-strategy.md), [phase-05](./phase-05-player-integration-and-dual-mode-frontend.md).

---

## Поведение

- После успешного `confirm` или `multipart complete`, если `mime` ∈ video/* и `video_hls_new_uploads_auto_transcode=true` и `video_hls_pipeline_enabled=true`:
  - `INSERT media_transcode_jobs` (или обновление статуса на `pending`).
- Существующие файлы: **не** трогать автоматически.

---

## Изменения по слоям

### `apps/webapp`

- Хук в `s3MediaStorage` или в route `confirm` / `complete` — одно место, чтобы не дублировать.
- Идемпотентность: не создавать второй job если уже есть pending/processing для `media_id`.

### `apps/media-worker`

- Без изменений логики, только увеличение потока jobs.

### Frontend

- Опционально: в библиотеке показывать badge «HLS processing» по статусу из list API (расширить admin media list).

---

## Метрики и проверки перед phase-07

- Доля `failed` среди новых uploads < порога.
- Среднее время transcode P95.
- Нет роста 5xx на webapp upload path.

---

## Feature flags

- `video_hls_new_uploads_auto_transcode` (admin).

---

## Риски

- Всплеск нагрузки при массовых загрузках — ограничить concurrent jobs (phase-02).

---

## Тесты

- Integration: complete upload → одна строка в jobs.
- Негатив: флаг выкл → нет строки.

---

## Критерии завершения

- [x] Для новых video uploads при включенных флагах создается ровно один transcode job (идемпотентность в `enqueueMediaTranscodeJob`).
- [x] При выключенном `video_hls_new_uploads_auto_transcode` enqueue не выполняется.
- [x] Регрессии upload flow: ответы confirm/complete без изменения контракта; ошибки enqueue глотаются (`maybeAutoEnqueue…`).

---

## Чек-листы

**Реализация:** single enqueue point; guard flags.  
**Ревью:** транзакционность с commit media_files.  
**Тесты:** интеграция.  
**QA:** загрузить новое видео, дождаться ready, проиграть.  
**Rollout:** включить флаг на staging → prod canary.  
**Rollback:** флаг false — новые остаются MP4-only.

**Следующая фаза:** [phase-07-backfill-legacy-library.md](./phase-07-backfill-legacy-library.md)
