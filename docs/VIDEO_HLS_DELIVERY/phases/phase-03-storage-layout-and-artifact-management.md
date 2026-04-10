# Phase 03 — Storage layout and artifact management

**Цель:** канонические **S3 key prefixes** для source MP4, HLS дерева, постера; политика сосуществования и cleanup.

**Зависимости:** [phase-01](./phase-01-data-model-and-dual-delivery-foundation.md), желательно совместно с [phase-02](./phase-02-transcoding-pipeline-and-worker.md).

**Готовые инструменты:** существующий S3 client webapp (`infra/s3/client.ts`); те же credentials в worker.

---

## Предлагаемый layout (пример)

Корень по `media_id`:

```
media/{uuid}/source.mp4          # или текущий ключ s3_key — не ломать существующие
media/{uuid}/hls/master.m3u8
media/{uuid}/hls/1080p/index.m3u8
media/{uuid}/hls/1080p/seg_00001.ts
media/{uuid}/hls/480p/...
media/{uuid}/poster/poster.jpg
```

**Важно:** если текущие объекты уже по пути `s3ObjectKey(id, filename)` — не обязательно физически переносить; для **новых** транскодов можно писать HLS рядом, вычисляя prefix от `dirname(s3_key)` или фиксированный шаблон. Зафиксировать **один** выбранный вариант в PR и здесь обновить.

---

## Master playlist и renditions

- 2–3 качества (например 720p, 480p) — согласовать битрейты.
- `hls_playlist_type vod` для VOD.
- Master `.m3u8` ссылается на variant playlists относительными URL — presigned должны сохранять относительную структуру или использовать absolute URLs в manifest (предпочтительно **относительные** + presign каждого файла).

---

## Coexistence MP4 и HLS

- Source MP4 **не удалять** при успешном HLS до отдельного решения retention (после phase 08).
- MP4 остаётся fallback и источник для re-transcode.

---

## Cleanup policy

- При удалении медиа (`pending_delete` flow): удалять **весь prefix** дерева `hls/` и `poster/` в addition к source (purge job расширить).
- При failed transcode: временные файлы на диске worker — всегда `finally` unlink dir.
- Опционально: S3 lifecycle на `tmp/` если когда-либо появится отдельный prefix (не обязательно v1).

---

## Безопасность хранения

- Тот же **private** bucket; без публичного ACL.
- Список объектов по prefix — только через приложение (не browser).

---

## Изменения по слоям

### `apps/webapp`

- Расширить S3 purge в `purgePendingMediaDeleteBatch` (или аналог) для удаления HLS дерева по известным ключам из `media_files`.
- Утилита `buildHlsPrefix(mediaId)` в одном модуле (shared с worker через copy или `packages/`).

### `apps/media-worker`

- Строго следовать layout; upload в правильном порядке (сегменты → variants → master последним или master с валидными относительными путями — проверить совместимость с FFmpeg output).

### Playback

- Presign master и каждый сегмент по запросу (phase-04) или batch (оптимизация позже).

---

## Риски / edge cases

- Относительные пути в `.m3u8` vs presigned absolute — протестировать в Safari.
- Смешение старых и новых key layout — в БД хранить **master key** явно, не выводить эвристикой.

---

## Тесты

- Unit: `buildHlsPrefix`, join keys.
- Integration: purge удаляет mock список ключей (mock S3).

---

## Критерии завершения

- [ ] Документированный layout в этом файле совпадает с кодом.
- [ ] Удаление медиа чистит HLS артефакты.

---

## Чек-листы

**Реализация:** layout helper; обновление purge; FFmpeg output paths.  
**Ревью:** нет public ACL; master валиден.  
**Тесты:** purge; manifest parse smoke.  
**QA:** полный delete медиа с HLS — объекты исчезли в MinIO.  
**Rollout:** совместимость со старыми ключами.  
**Rollback:** оставить объекты в S3 при откате кода (orphan cleanup ops).

**Следующая фаза:** [phase-04-playback-api-and-delivery-strategy.md](./phase-04-playback-api-and-delivery-strategy.md)
