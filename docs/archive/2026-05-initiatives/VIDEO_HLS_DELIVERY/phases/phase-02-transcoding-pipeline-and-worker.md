# Phase 02 — Transcoding pipeline and worker

**Цель:** появление **`apps/media-worker`**, очереди заданий в PostgreSQL и вызова **FFmpeg** для генерации HLS; API не блокируется тяжёлой работой.

**Зачем:** отделить CPU/IO от Next.js; обеспечить retries и наблюдаемость.

**Зависимости:** [phase-01](./phase-01-data-model-and-dual-delivery-foundation.md).

**Готовые инструменты:** FFmpeg (CLI), `child_process.spawn`, существующий S3 client (вынести в shared или дублировать минимально), pg driver.

**Не реализуем:** собственный codec/packager кроме FFmpeg.

---

## Изменения по слоям

### `apps/webapp` (backend)

- Функция **enqueue transcode job** после `confirm` / `multipart complete` для `mime` video/* — **за флагом** `video_hls_pipeline_enabled` и `video_hls_new_uploads_auto_transcode` (точная политика в phase-06).
- В фазе 02 достаточно **admin-only** или **internal script** endpoint для постановки job вручную (безопаснее для первого merge).
- Таблица очереди, например `media_transcode_jobs`:
  - `id`, `media_id` FK, `status` (pending/processing/done/failed), `attempts`, `locked_at`, `locked_by`, `last_error`, `created_at`, `updated_at`.
- Индекс: `(status, created_at) WHERE status = 'pending'` для выборки.

### `apps/media-worker` (новый пакет)

- Entry: `src/main.ts` — цикл poll с интервалом, graceful shutdown SIGTERM.
- Claim job: `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)`.
- Pipeline:
  1. Load `media_files` by id, verify `s3_key`, mime video.
  2. Download source во **временный** каталог (stream to file).
  3. Run FFmpeg (см. примеры в [02-target-architecture.md](../02-target-architecture.md)).
  4. Upload `.m3u8` + сегменты + poster по layout phase-03.
  5. Update `media_files` HLS keys + `video_processing_status=ready` **только** после проверки наличия master в S3 (HeadObject).
  6. On failure: increment attempts, `failed` или backoff `pending` с `next_attempt_at`.

**Изоляция от API:** отдельный процесс; ошибка worker не влияет на HTTP latency.

### Storage

- Запись артефактов — в фазе 02 минимально (можно совместить с детализацией phase-03).

### Playback API

- Нет обязательного публичного изменения; опционально internal status для admin.

### Frontend

- Нет.

---

## FFmpeg (интеграция)

- Вызов через `spawn('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] })`.
- Логировать stderr (последние N KB) в pino при failure.
- Timeout wall-clock (например 2h configurable) — kill process.

---

## Ошибки и retries

- Transient: S3 503, disk full → retry с exponential backoff, max `K` попыток.
- Permanent: invalid format, corrupt file → `failed` + человекочитаемый код; не бесконечный retry.
- **Не блокировать** upload path: enqueue асинхронно после commit строки `media_files`.

---

## Feature flags

- `video_hls_pipeline_enabled` — worker выходит сразу если false (или не poll).
- Webapp не enqueue если false.

---

## Риски / edge cases

- Одновременный duplicate enqueue — уникальный индекс `(media_id) WHERE status IN ('pending','processing')` или идемпотентный `ON CONFLICT`.
- Worker версия ≠ webapp версия — контракт JSON в БД минимальный и версионируемый.

---

## Тесты

- Unit: job claim двумя воркерами — только один успех (интеграция с testcontainers PG опционально).
- Unit: mock spawn — проверка аргументов FFmpeg.
- Worker: тест «не трогает non-video mime».

---

## Критерии завершения

- [ ] `pnpm-workspace.yaml` включает `apps/media-worker`.
- [ ] Worker обрабатывает synthetic job в dev.
- [ ] Документирован systemd template (в phase rollout или HOST_DEPLOY).

---

## Чек-лист реализации

- [ ] Создать package `apps/media-worker` с build/start scripts.
- [ ] Миграция `media_transcode_jobs`.
- [ ] Реализовать claim/update с `SKIP LOCKED`.
- [ ] Enqueue из webapp (за флагом или admin-only).
- [ ] Логи и метрики (хотя бы structured log).

## Чек-лист код-ревью

- [ ] Нет FFmpeg в Next.js routes.
- [ ] Секреты только из env (DB URL, S3), не хардкод.

## Чек-лист тестов

- [ ] Unit тесты worker с моками.
- [ ] Webapp тест enqueue (mock pool).

## Чек-лист QA / ручная проверка

- [ ] Поднять worker локально, положить тестовый mp4 в S3, вручную insert job — получить HLS объекты.

## Чек-лист rollout

- [ ] Установить `ffmpeg` на хост worker.
- [ ] Добавить systemd unit (см. SERVER CONVENTIONS после merge).
- [ ] Включить сервис с `video_hls_pipeline_enabled=false` → убедиться idle safe → включить.

## Чек-лист rollback

- [ ] `systemctl stop` media-worker; очередь остаётся — не ломает MP4.
- [ ] Отключить enqueue флагом.

**Следующая фаза:** [phase-03-storage-layout-and-artifact-management.md](./phase-03-storage-layout-and-artifact-management.md)
