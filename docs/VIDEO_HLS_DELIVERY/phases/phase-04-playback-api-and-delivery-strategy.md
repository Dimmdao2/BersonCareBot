# Phase 04 — Playback API and delivery strategy

**Цель:** единый **JSON playback endpoint** (или расширение существующего паттерна) с выбором `mp4` / `hls` / `auto`, проверкой сессии, fallback на MP4, feature flags.

**Зависимости:** [phase-01](./phase-01-data-model-and-dual-delivery-foundation.md), желательно [phase-03](./phase-03-storage-layout-and-artifact-management.md). HLS URL осмысленны после [phase-02](./phase-02-transcoding-pipeline-and-worker.md).

**Готовые инструменты:** `presignGetUrl` из `infra/s3/client.ts`, `getCurrentSession` из auth.

**Не делаем:** проксирование видео через NextResponse stream.

---

## Предлагаемый маршрут

- `GET /api/media/[id]/playback` (или `GET /api/playback/media?id=` — выбрать REST-стиль; предпочтительно вложенный под `media`).
- Метод: **GET**, cookie session.

**Query (опционально):**

- `prefer=mp4|hls|auto` — override для отладки; игнорировать для не-admin или не whitelisted.

---

## Право доступа

- Те же правила, что и `GET /api/media/[id]`: на фазе 04 достаточно «любая валидная сессия» (как сейчас для чтения медиа).  
- **Будущее усложнение:** привязка к роли patient/doctor и к контенту страницы — отдельная задача; в плане заложить helper `assertMediaReadable(session, mediaId)` с одним местом расширения.

---

## Delivery resolution (псевдокод)

```
default = system_settings.video_default_delivery  // mp4 | hls | auto
if media.mime not video → mp4 path only (redirect url style) или error
if media.video_processing_status != 'ready' for hls → hls unavailable
if default == mp4 → return mp4Url
if default == hls && hls ready → return hlsMasterUrl (+ variants info)
if default == auto && hls ready → prefer hls else mp4
if default == hls && !ready → fallback mp4 if allow else error JSON
```

**Логирование:** structured log `playback_resolved` с `mediaId`, `delivery`, `hlsReady` (без presigned query).

---

## Response contract (пример)

```json
{
  "mediaId": "uuid",
  "delivery": "hls",
  "mimeType": "video/mp4",
  "durationSeconds": 120,
  "posterUrl": "https://...",
  "hls": { "masterUrl": "https://..." },
  "mp4": { "url": "/api/media/uuid" },
  "fallbackUsed": false,
  "expiresInSeconds": 3600
}
```

Поле `mp4.url` может оставаться app-relative redirect path для совместимости с `<video>`; либо сразу presigned (фаза 09).

---

## Feature flags

- `video_playback_api_enabled` — если false → `404` или `503 feature_disabled` для нового route (старый `/api/media/id` работает).
- `video_default_delivery` — см. phase-01 rollout doc.

---

## Observability

- Счётчик ошибок presign.
- Латентность handler (должна быть низкой — только DB + presign).

---

## Риски / edge cases

- Клиент запрашивает HLS, но master обновился mid-play — короткий TTL и refresh strategy на клиенте (phase-05).
- Слишком длинные presigned URL — не логировать.

---

## Тесты

- `route.test.ts`: 401, 404, mp4-only, hls-ready, auto-fallback.
- Unit: чистая функция `resolveDelivery(...)`.

---

## Критерии завершения

- [ ] Контракт задокументирован в `apps/webapp/src/app/api/api.md`.
- [ ] Все ветки delivery покрыты тестами.

---

## Чек-листы

**Реализация:** новый route; resolver; presign master; флаги из `system_settings`.  
**Ревью:** нет stream proxy; нет утечки s3 key в JSON.  
**Тесты:** негативные + fallback.  
**QA:** curl с cookie / браузер — JSON валиден.  
**Rollout:** флаг выкл по умолчанию.  
**Rollback:** выключить флаг или убрать route (клиенты не должны зависеть до phase-05).

**Следующая фаза:** [phase-05-player-integration-and-dual-mode-frontend.md](./phase-05-player-integration-and-dual-mode-frontend.md)
