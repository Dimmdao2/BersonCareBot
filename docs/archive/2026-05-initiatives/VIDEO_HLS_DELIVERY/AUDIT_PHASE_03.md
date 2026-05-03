# AUDIT — VIDEO_HLS_DELIVERY Phase 03 (Storage layout, coexistence, HLS purge)

**Дата аудита:** 2026-05-03  
**Объект:** канонический layout в private S3 (`media/{id}/…`), транскод `apps/media-worker`, расширенный purge в `apps/webapp`, утилиты `hlsStorageLayout` / `hlsMasterPlaylist`, ListObjectsV2 по prefix.

**Источники проверки:**  
`apps/webapp/src/shared/lib/hlsStorageLayout.ts`, `hlsMasterPlaylist.ts`, `apps/webapp/src/infra/repos/s3MediaStorage.ts` (`collectS3KeysForMediaPurge`, `purgePendingMediaDeleteBatch`), `apps/webapp/src/infra/s3/client.ts` (`s3ListObjectKeysUnderPrefix`), `apps/media-worker/src/processTranscodeJob.ts`, `apps/media-worker/src/ffmpeg/hlsArgs.ts`, `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-03-storage-layout-and-artifact-management.md`, `06-execution-log.md`, `apps/webapp/src/app/api/media/[id]/route.ts` (граница с phase-04).

---

## Вердикт

**PASS.** После **FIX 2026-05-03** (см. ниже) Major hardening внедрён; Critical по-прежнему N/A.  
**Minor:** дублирование файлов снято **CI-проверкой** `pnpm run check:hls-helpers-sync`; playback HLS и Safari E2E **отложены** до phase-04 / QA по плану (обоснованный defer).

---

## FIX — 2026-05-03 (закрытие MANDATORY INSTRUCTIONS)

**Сделано в коде**

- `collectS3KeysForMediaPurge`: перед удалением по явным полям БД проверка `isTrustedHlsArtifactS3Key` / `isTrustedPosterS3Key` (`hlsStorageLayout.ts`); при нарушении — `logger.warn`, ключ **не** попадает в `DeleteObject`.
- Недоверенный `poster_s3_key` → fallback на list по каноническому `resolvePosterPurgeListPrefix` (если доступен).
- Утилиты `normalizeMediaS3Key`, `isTrustedHlsArtifactS3Key`, `isTrustedPosterS3Key` + unit-тесты; интеграционные кейсы в `s3MediaStorage.test.ts`.
- Синхронизация тел webapp/media-worker для `hlsStorageLayout.ts` и `hlsMasterPlaylist.ts` (общее тело от маркерного `export …`) — скрипт `scripts/check-hls-helpers-sync.mjs`, шаг в корневом `pnpm run ci`.

---

## 1) Layout S3 стабилен и предсказуем для playback resolver

**Проверено**

- **Канон:** корень артефактов = `dirname(s3_key)`; при нормальном upload через `s3ObjectKey(id, filename)` это **`media/{uuid}/`**. HLS: `media/{id}/hls/master.m3u8`, варианты `hls/720p/index.m3u8`, `hls/480p/index.m3u8`, сегменты рядом; постер: `media/{id}/poster/poster.jpg` (`hlsStorageLayout.ts`, `processTranscodeJob.ts`).
- **БД для резолвера:** после успешного транскода пишутся `hls_master_playlist_s3_key`, `hls_artifact_prefix`, `available_qualities_json` с путями вида `720p/index.m3u8` (согласовано с master).
- **Master:** относительные URI вариантов (`720p/index.m3u8`, `480p/index.m3u8`) относительно каталога master — для presign по ключам S3 это ожидаемая схема (phase-04).

**Оговорка (граница phase-03 / phase-04)**

- Текущий **`GET /api/media/[id]`** по-прежнему резолвит только **исходный** `s3_key` (MP4) через `getMediaS3KeyForRedirect`; **отдельного HLS playback resolver в HTTP-слое пока нет**. Это не регресс phase-03, но означает: «стабильность для resolver» проверена как **контракт ключей и полей БД**, а не как готовый пользовательский сценарий HLS в webapp.

**Вывод:** layout **стабилен и документирован**; готов к внедрению resolver в phase-04.

---

## 2) MP4 не удаляется преждевременно

**Проверено**

- **`processTranscodeJob`:** исходник только **скачивается** (`downloadObjectToFile`), после работы удаляется локальный tmp (`rm` в `finally`). Вызовов **`DeleteObject` по `media.s3_key` нет**; комментарий в коде явно фиксирует политику.

- **Пurge:** исходный MP4 попадает в список удаления **только** в `collectS3KeysForMediaPurge` при финальном удалении медиа (`pending_delete` / `deleting`) — это намеренное полное удаление объекта медиа, а не побочный эффект транскода.

**Вывод:** **преждевременного** удаления MP4 при транскоде **нет**.

---

## 3) Cleanup не затрагивает чужие/нецелевые объекты

**Проверено (основной путь)**

- **List HLS:** `resolveHlsPurgeListPrefix` требует `isCanonicalMediaRootForId(dirname(s3_key), id)`. Иначе prefix-листинг **не выполняется**; подзловещий `hls_artifact_prefix` вне `media/{id}/hls…` **сводится к каноническому** prefix (`return canonical`).
- **List poster:** при отсутствии явного `poster_s3_key` листится только `resolvePosterPurgeListPrefix` → `media/{id}/poster` при том же каноническом root.
- **Превью:** как и раньше, удаляются только явные `preview_sm_key` / `preview_md_key` из строки.

**Риск (Major / hardening)**

- Если заданы **`poster_s3_key`** или (в ветке без list) **`hls_master_playlist_s3_key`**, ключи добавляются в delete **без проверки**, что они принадлежат `media/{id}/…`. Запись полей в коде сейчас идёт из **`media-worker`** по каноническому layout; прямых апдейтов из webapp-API по grep **нет**. При **ошибочной/злонамеренной строке в БД** purge может вызвать `DeleteObject` по **чужому** ключу.

**Орфанные объекты (Minor, ops)**

- При **неканоническом** `s3_key` и отсутствии корректных HLS-полей HLS-дерево в S3 purge может **не охватить list-ом**; master может быть удалён точечно, сегменты теоретически остаются как мусор — вне scope автоматической гарантии phase-v1.

**Вывод:** для **нормальных** строк и канонического layout изоляция **хорошая**. Узкое место — **доверие к явным ключам** в purge → см. MANDATORY FIX (Major).

---

## 4) Артефакты HLS реально воспроизводимы через master playlist

**Проверено**

- **FFmpeg:** `-f hls`, `-hls_playlist_type vod`, `-hls_flags independent_segments`, сегменты `seg_%03d.ts` в каталоге варианта, `index.m3u8` в том же `cwd` — типичная VOD-схема; сегменты в плейлисте варианта относительные к нему.
- **Master:** генерируется **после** успешных двух вариантов, кладётся в `hls/master.m3u8`, затем всё дерево `hlsDir` уходит в S3 через **`uploadDirRecursive`** (master не «отстаёт» от сегментов при успешном завершении).
- **Gate:** перед `ready` — **`headObjectExists`** на master в bucket.

- **Тесты в repo:** unit/smoke на тело master (`hlsMasterPlaylist.test.ts`); **нет** интеграционного прогона FFmpeg→S3→плеер в CI.

**Оговорки (Minor)**

- В master зашиты **статические** `CODECS="avc1.64001f,mp4a.40.2"`; реальный поток может отличаться по profile/level — на части клиентов возможны предупреждения или edge-cases (валидация ffprobe / Safari — позже).

**Вывод:** по конструкции пайплайна воспроизведение через master **ожидаемо корректно**; формальное «реально в браузере» — **рекомендуется** закрыть в phase-04/QA gate.

---

## MANDATORY FIX INSTRUCTIONS

### Critical

- **Нет.**  
- **Статус:** **CLOSED (N/A)** — 2026-05-03.

### Major

1. **Усилить `collectS3KeysForMediaPurge` против произвольных ключей в БД**  
   **Статус:** **CLOSED** — 2026-05-03 (реализация + тесты `hlsStorageLayout.test.ts`, `s3MediaStorage.test.ts`).

### Minor

1. **Дублирование `hlsStorageLayout` / `hlsMasterPlaylist` (webapp + media-worker)**  
   **Статус:** **CLOSED (CI)** — 2026-05-03: `scripts/check-hls-helpers-sync.mjs` + шаг в `pnpm run ci` (хэш тела от синхронизированных `export`‑маркеров). Полный вынос в `packages/*` не требован — отложен как необязательная реорганизация.

2. **Playback resolver (phase-04)**  
   **Статус:** **DEFERRED** по плану инициативы — не входит в FIX phase-03; MP4 fallback сохранён в `GET /api/media/[id]` через `s3_key`.

3. **E2E / Safari**  
   **Статус:** **DEFERRED** до phase-04 / отдельного QA gate (после появления HLS playback API).

---

## Закрытие аудита (матрица запроса)

| Пункт запроса | Статус | Комментарий |
|---------------|--------|-------------|
| 1 Layout стабилен для playback resolver | **OK** | Контракт ключей + БД; HTTP HLS resolver — phase-04 |
| 2 MP4 не удаляется преждевременно | **OK** | Worker не трогает source; purge только при удалении медиа |
| 3 Cleanup не бьёт чужие объекты | **OK** | Prefix list + доверенные явные ключи (FIX 2026-05-03) |
| 4 Воспроизводимость через master | **OK (с оговоркой)** | VOD pipeline + относительные URI; нет browser E2E в phase-03 |

**Подпись аудита:** исходное зафиксировано 2026-05-03; Major FIX применён 2026-05-03 (`06-execution-log.md`, запись FIX AUDIT_PHASE_03).
