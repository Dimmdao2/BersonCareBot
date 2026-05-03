# Phase 07 — Backfill legacy library

**Цель:** батчево обработать существующие `media_files` (video), не перегружая систему; пауза/возобновление; отчёты.

**Зависимости:** [phase-02](./phase-02-transcoding-pipeline-and-worker.md), [phase-03](./phase-03-storage-layout-and-artifact-management.md), стабильный [phase-06](./phase-06-new-video-hls-default-path.md) на новых файлах.

---

## Механизм

- **Скрипт** или **internal admin route** (защищённый): выбирает N записей:
  - `mime_type` like `video/%`
  - `video_processing_status` in (`none`, null) или explicit `pending_backfill`
  - `status` readable (не pending upload)
  - optional: `created_at < cutoff` для поэтапности
- Вставляет jobs с `priority` ниже чем live user uploads (опциональная колонка `priority` в jobs).

---

## Лимиты

- `BATCH_SIZE` per run (например 50).
- Sleep между батчами.
- `max_attempts` per media.
- Concurrent worker = 1 (v1).

---

## Проблемные файлы

- FFmpeg error → `failed` + сохранить `video_processing_error`.
- Skip: размер > политики, неподдерживаемый codec (detect ffprobe) — mark `failed` с кодом `unsupported`.

---

## Отчёты

- SQL view или admin endpoint: counts by `video_processing_status`.
- Экспорт CSV optional.

---

## Пауза / возобновление

- Остановить enqueue скрипт; worker drain или stop.
- Не очищать очередь при паузе — jobs остаются `pending`.

---

## Изменения

### `apps/webapp`

- Скрипт в `apps/webapp/scripts/` или `infra/ops/` с dry-run `--limit`.

### `apps/media-worker`

- Поддержка `priority` ordering в SELECT (optional).

---

## Тесты

- Dry-run не пишет в DB (или откат в transaction test).

---

## Критерии завершения

- [ ] Backfill runner поддерживает dry-run и лимитированные batch-запуски.
- [ ] Для проблемных файлов фиксируется `failed` + диагностическая причина без падения pipeline.
- [ ] Есть операционный отчет по статусам (`hls_ready` / `failed` / `pending`) для контроля прогресса.

---

## Чек-листы

**Реализация:** backfill runner; приоритеты; logging progress.  
**Ревью:** нет unbounded loop.  
**QA:** прогнать на копии prod dump.  
**Rollout:** ночное окно; мониторинг CPU.  
**Rollback:** остановить runner; MP4 unaffected.

**Следующая фаза:** [phase-08-default-switch-to-hls.md](./phase-08-default-switch-to-hls.md)
