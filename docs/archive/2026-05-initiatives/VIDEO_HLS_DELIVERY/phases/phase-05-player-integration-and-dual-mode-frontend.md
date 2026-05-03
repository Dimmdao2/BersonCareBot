# Phase 05 — Player integration and dual-mode frontend

**Цель:** UI получает **playback JSON** (или серверный fetch в RSC) и рендерит **MP4** или **HLS** с ошибками и fallback.

**Зависимости:** [phase-04](./phase-04-playback-api-and-delivery-strategy.md).

**Готовые инструменты:** **hls.js** (npm), нативный HLS в Safari (`video.canPlayType('application/vnd.apple.mpegurl')`), существующий `NoContextMenuVideo`.

**Не делаем:** собственный демuxer/parser.

---

## Поток данных на клиенте

1. Для страницы контента с `video_type=api` и `mediaId`:  
   - **Вариант A:** Server Component запрашивает resolver на сервере (internal call) и передаёт в клиент только URL (меньше утечки в клиентский JS).  
   - **Вариант B:** Client fetch `GET /api/media/id/playback` после mount.  
   Выбрать один стиль; A предпочтительнее для SSR и кэширования.

2. Если `delivery === 'hls'` и есть `masterUrl`:
   - Safari / iOS: `<video src={masterUrl}>` внутри `NoContextMenuVideo`.
   - Иначе: создать `Hls` instance, `loadSource(masterUrl)`, `attachMedia(videoElement)`.

3. Если fallback или `delivery === 'mp4'`: текущий `<source src={mp4Url}>`.

---

## Состояния UI

- `loading` — спиннер/placeholder в области видео.
- `error` — сообщение + кнопка «повторить»; если был HLS и есть mp4 в ответе — **автоматический fallback** один раз.
- Логирование клиента: не отправлять presigned URL в внешние сервисы.

---

## Минимальные точки изменения

- `apps/webapp/src/app/app/patient/content/[slug]/page.tsx` — ветка для internal video.
- `ContentPreview.tsx` — превью для врача (можно оставить MP4 до phase-08 для простоты).
- `MediaLightbox.tsx` — приоритет: библиотека может сначала оставить MP4 redirect; HLS в lightbox — optional в этой фазе или follow-up.

**Принцип:** не ломать текущий UX; HLS включается когда playback говорит `hls`.

---

## Зависимости npm

- `hls.js` — добавить в `apps/webapp/package.json`; проверить лицензию (MIT).

---

## Риски / edge cases

- **CORS:** presigned GET на MinIO уже используется для MP4 — HLS сегменты должны работать аналогично; если нет — ops задача на CORS bucket.
- **HEVC/HLS** — вне scope; использовать H.264+AAC в FFmpeg для совместимости.
- Двойная инициализация hls.js при Strict Mode — cleanup в `useEffect`.

---

## Тесты

- Unit: утилита `shouldUseNativeHls()` — мок `window`, Safari UA.
- Component test: при `delivery mp4` не импортирует hls.js lazy path (optional).
- E2E (staging): один сценарий play HLS.

---

## Критерии завершения

- [ ] Пациентский просмотр играет HLS для тестового медиа с `hls_ready`.
- [ ] Регрессия: MP4-only контент без изменений.

---

## Чек-листы

**Реализация:** wrapper `AdaptiveVideoPlayer`; lazy import hls.js.  
**Ревью:** memory leak, destroy on unmount.  
**Тесты:** unit + smoke e2e.  
**QA:** Chrome + Safari + мобильный Safari.  
**Rollout:** за флагом `video_playback_api_enabled` + контент тестовый.  
**Rollback:** флаг выкл → старый путь только `/api/media/id`.

**Следующая фаза:** [phase-06-new-video-hls-default-path.md](./phase-06-new-video-hls-default-path.md)
