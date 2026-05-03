# Phase 03 — Storage layout and artifact management

**Цель:** канонические **S3 key prefixes** для source MP4, HLS дерева, постера; политика сосуществования и cleanup.

**Зависимости:** [phase-01](./phase-01-data-model-and-dual-delivery-foundation.md), желательно совместно с [phase-02](./phase-02-transcoding-pipeline-and-worker.md).

**Готовые инструменты:** существующий S3 client webapp (`infra/s3/client.ts`); те же credentials в worker.

---

## Канонический layout (как в коде, phase-03)

Корень объекта = `dirname(s3_key)` → **`media/{mediaId}/`**, когда upload идёт через `s3ObjectKey(id, filename)`.

```
media/{uuid}/{filename}.mp4      # s3_key — исходный MP4 (fallback / re-transcode); транскод не удаляет
media/{uuid}/hls/master.m3u8     # VOD master, относительные URI на варианты
media/{uuid}/hls/720p/index.m3u8
media/{uuid}/hls/720p/*.ts       # сегменты FFmpeg
media/{uuid}/hls/480p/index.m3u8
media/{uuid}/hls/480p/*.ts
media/{uuid}/poster/poster.jpg   # JPEG постер; не под `hls/`
```

Рендеры **720p** и **480p** в master: bandwidth **2 800 000** и **900 000** (см. `apps/media-worker` + `buildVodMasterPlaylistBody`).

**Важно:** существующие объекты с произвольным именем файла в `s3_key` остаются; HLS и постер пишутся **рядом** под тем же `media/{uuid}/`. Если `s3_key` когда-либо не согласован с `id` строки `media_files`, purge-list по HLS/poster опирается на канонический `media/{id}/…` только когда `dirname(s3_key)` совпадает с `media/{id}` (`hlsStorageLayout.ts`).

---

## Master playlist и renditions

- Два качества: **720p**, **480p** (битрейты см. выше).
- `hls_playlist_type vod` для VOD.
- Master `.m3u8` ссылается на variant playlists относительными URL — presigned должны сохранять относительную структуру или использовать absolute URLs в manifest (предпочтительно **относительные** + presign каждого файла).

---

## Coexistence MP4 и HLS

- Source MP4 **не удалять** при успешном HLS до отдельного решения retention (после phase 08).
- MP4 остаётся fallback и источник для re-transcode.

---

## Cleanup policy

- При удалении медиа (`pending_delete` flow): `collectS3KeysForMediaPurge` удаляет объекты под prefix `hls/` и `poster/` (ListObjectsV2), плюс явный `poster_s3_key`, preview keys и source `s3_key`.
- При failed transcode: временные файлы на диске worker — всегда `finally` unlink dir.
- Опционально: S3 lifecycle на `tmp/` если когда-либо появится отдельный prefix (не обязательно v1).

---

## Безопасность хранения

- Тот же **private** bucket; без публичного ACL.
- Список объектов по prefix — только через приложение (не browser).

---

## Изменения по слоям (реализовано)

### `apps/webapp`

- `purgePendingMediaDeleteBatch` + `collectS3KeysForMediaPurge`: list по prefix (`s3ListObjectKeysUnderPrefix`), HLS + poster + previews + source `s3_key`; доверенный `hls_artifact_prefix` только под каноническим `media/{id}/hls`.
- Модуль `src/shared/lib/hlsStorageLayout.ts` (копия логики в `apps/media-worker/src/hlsStorageLayout.ts`).

### `apps/media-worker`

- `processTranscodeJob`: выкладка под layout; master последним; исходный MP4 не удаляется.

### Playback

- Presign master и каждый сегмент по запросу (phase-04) или batch (оптимизация позже).

---

## Риски / edge cases

- Относительные пути в `.m3u8` vs presigned absolute — протестировать в Safari.
- Смешение старых и новых key layout — в БД хранить **master key** явно, не выводить эвристикой.

---

## Тесты

- Unit: `apps/webapp/src/shared/lib/hlsStorageLayout.test.ts` (пути, purge prefix).
- Unit / smoke manifest: `apps/webapp/src/shared/lib/hlsMasterPlaylist.test.ts` (`buildVodMasterPlaylistBody` + парс вариантов).
- Purge: `apps/webapp/src/infra/repos/s3MediaStorage.test.ts` (`collectS3KeysForMediaPurge`, list prefix + source MP4; ошибка S3 delete → backoff).

---

## Критерии завершения

- [x] Документированный layout в этом файле совпадает с кодом.
- [x] Удаление медиа чистит HLS артефакты (list по prefix `…/hls`, постер `…/poster` или `poster_s3_key`, плюс source `s3_key` и preview keys).

---

## Чек-листы

**Реализация:** layout helper; обновление purge; FFmpeg output paths.  
**Ревью:** нет public ACL; master валиден.  
**Тесты:** purge; manifest parse smoke.  
**QA:** полный delete медиа с HLS — объекты исчезли в MinIO.  
**Rollout:** совместимость со старыми ключами.  
**Rollback:** оставить объекты в S3 при откате кода (orphan cleanup ops).

**Следующая фаза:** [phase-04-playback-api-and-delivery-strategy.md](./phase-04-playback-api-and-delivery-strategy.md)
