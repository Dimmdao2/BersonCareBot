# AUDIT — VIDEO_HLS_DELIVERY Phase 04 (Playback API, delivery strategy)

**Дата аудита:** 2026-05-03  
**Объект:** `GET /api/media/[id]/playback`, модуль `resolveVideoPlaybackDelivery`, флаги `video_playback_api_enabled` / `video_default_delivery`, доступ и fallback на прогрессивный источник.

**Источники проверки:**  
`apps/webapp/src/app/api/media/[id]/playback/route.ts`, `route.test.ts`, `apps/webapp/src/modules/media/playbackResolveDelivery.ts`, `playbackResolveDelivery.test.ts`, `assertMediaPlaybackAccess.ts`, `apps/webapp/src/infra/repos/s3MediaStorage.ts` (`getMediaRowForPlayback`), `apps/webapp/src/app/api/api.md`, `docs/VIDEO_HLS_DELIVERY/phases/phase-04-playback-api-and-delivery-strategy.md`, `06-execution-log.md`.

---

## Вердикт

**PASS.** После **FIX 2026-05-03** Minor (док `posterUrl`, тест presign постера) закрыты; Critical / Major без изменений N/A. E2E Safari — **defer** phase-05.  
**Minor (historical):** уточнение в ops-доке поведения при ошибке presign постера; опциональный тест — **закрыт**.

---

## FIX — 2026-05-03 (AUDIT_PHASE_04 Mandatory Instructions)

- **`api.md`:** при падении presign постера при успешном HLS master поле `posterUrl` может быть `null`, `delivery` остаётся `hls`.
- **`playback/route.test.ts`:** сценарий «master ok, poster presign fails».

## 1) Контракт playback стабилен и документирован

**Проверено**

- **Маршрут:** `GET /api/media/[id]/playback`, query `?prefer=mp4|hls|auto` (только **admin**).
- **Ответ JSON (стабильные поля):** `mediaId`, `delivery` (`hls` \| `mp4` \| `file` для не-видео), `mimeType`, `durationSeconds`, `posterUrl`, `hls` (`null` \| `{ masterUrl, qualities? }`), `mp4: { url }` всегда с **`/api/media/{id}`**, `fallbackUsed`, `expiresInSeconds` (3600).
- **Документация:** блок в `apps/webapp/src/app/api/api.md` описывает флаг, стратегию, fallback, логирование без URL.
- **Резолв стратегии (документированный порядок):** `video_delivery_override` → admin `prefer` → `video_default_delivery`; реализация в `resolveVideoPlaybackDelivery` совпадает.

**Оговорка**

- Машиночитаемая JSON Schema / OpenAPI в репозитории **не** обязательны phase-04; контракт задан текстом в `api.md` + типами в коде.

**Вывод:** для потребителей API контракт **стабилен и задокументирован**.

---

## 2) Ветки fallback покрыты и реально работают

**Проверено в коде**

- **Стратегия `hls`, HLS не готов** (`status != ready` или нет trusted master): `resolveVideoPlaybackDelivery` → `useHls: false`, `fallbackUsed: true`; route отдаёт `delivery: "mp4"`, `hls: null`.
- **Стратегия `auto`, HLS не готов:** MP4 без флага fallback (не «откат с HLS», а выбор прогрессивного источника).
- **Стратегия `hls` / `auto`, HLS готов, presign master падает:** `catch` → `delivery: "mp4"`, `fallbackUsed: true`, `hls: null` (реальный откат после попытки HLS).
- **Постер:** ошибка presign постера логируется; **master остаётся валидным**, `delivery` остаётся `hls`, `posterUrl` может быть `null` — приемлемо, но клиент должен это учитывать.

**Проверено тестами**

- `playbackResolveDelivery.test.ts`: `auto`+ready / `auto`+not ready / `hls`+not ready (fallback) / `mp4`+ready / per-file override / admin prefer.
- `playback/route.test.ts`: 503 feature off, 404 нет строки, не-видео (`delivery: file`), HLS not ready → mp4, HLS ready → presign×2, non-admin игнор `?prefer=`, admin `?prefer=hls`, presign fail → mp4 + fallback.

**Вывод:** основные fallback-ветки **работают и покрыты**; edge постера («master ok, poster presign fails») — в `playback/route.test.ts` (FIX 2026-05-03).

---

## 3) Нет proxy video-streaming через Node response

**Проверено**

- Handler **только** `NextResponse.json(...)` и вызовы `presignGetUrl` для ключей в private bucket.
- **Нет** `ReadableStream`, прокси тела объекта S3 в ответ, `fs.createReadStream` медиа в playback-route, `NextResponse` с `video/*` телом из backend.
- Прогрессивное видео по-прежнему: клиент идёт на **`/api/media/[id]`** → **307** на presigned URL (существующий route), т.е. байты не через Node в playback-endpoint.

**Вывод:** требование «без stream proxy» **соблюдено** для phase-04 playback route.

---

## 4) Access checks и ошибки (401/404/feature flag)

**Проверено**

| Условие | Поведение | Статус |
|--------|-----------|--------|
| Нет сессии | **401** `unauthorized` | OK (`assertMediaPlaybackAccess`) |
| Нет `id` в params | **400** `missing id` | OK |
| Не UUID **или** пустой `DATABASE_URL` | **404** `not found` | OK (согласовано с тем, что без DB медиа не резолвится) |
| `video_playback_api_enabled === false` | **503** `feature_disabled` | OK (в phase-04 допускался и 404; выбран **503** — явная семантика «сервис выключен») |
| Нет читаемой строки `media_files` (`getMediaRowForPlayback`) | **404** `not found` | OK; фильтр **`MEDIA_READABLE_STATUS_SQL`** + непустой `s3_key` — как у безопасного чтения библиотеки |
| Success | **200** JSON | OK |

**Оговорка**

- **`assertMediaPlaybackAccess`** сейчас эквивалентен «сессия есть» — как и `GET /api/media/[id]` на phase-04; усиление по ролям/контенту — отдельная задача (заложено комментарием в модуле).

**Вывод:** обработка **401 / 404 / 503 (flag)** **корректна и проверена тестами** для ключевых веток.

---

## MANDATORY FIX INSTRUCTIONS

### Critical

- **Нет.**  
- **Статус:** **CLOSED (N/A)** — 2026-05-03.

### Major

- **Нет.** Блокирующих расхождений с целями phase-04 (JSON + presign, fallback, без proxy) не выявлено.  
- **Статус:** **CLOSED (N/A)** — 2026-05-03.

### Minor

1. **Документировать `posterUrl === null` при `delivery: "hls"`**  
   **Статус:** **CLOSED** — 2026-05-03 (добавлено в `apps/webapp/src/app/api/api.md`).

2. **Опциональный тест: presign poster fails, master ok**  
   **Статус:** **CLOSED** — 2026-05-03 (`playback/route.test.ts`).

3. **E2E Safari / hls.js (phase-05)**  
   **Статус:** **DEFERRED** по роадмапу инициативы (вне scope FIX phase-04).

---

## Закрытие аудита (матрица запроса)

| Пункт | Статус |
|-------|--------|
| 1 Контракт стабилен и документирован | OK (`api.md` + код) |
| 2 Fallback покрыты и работают | OK (код + тесты; постер — Minor) |
| 3 Нет proxy streaming через Node | OK |
| 4 Access / 401 / 404 / feature flag | OK |

**Подпись:** Minor FIX 2026-05-03 закрыт (док + тест); E2E — phase-05.
