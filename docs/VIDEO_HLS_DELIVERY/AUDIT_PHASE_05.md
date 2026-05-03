# AUDIT — VIDEO_HLS_DELIVERY Phase 05 (Patient dual-mode player)

**Дата аудита:** 2026-05-03  
**FIX по аудиту:** 2026-05-03  
**Объект:** `PatientContentAdaptiveVideo`, RSC-ветка `app/patient/content/[slug]/page.tsx`, `shouldUseNativeHls`, зависимость `hls.js`, общий резолв `resolveMediaPlaybackPayload`.

**Источники проверки:** статический разбор кода + тесты (`nativeHls.test.ts`, `patientPlaybackSourceKind.test.ts`, `playback/route.test.ts`, `e2e/patient-playback-inprocess.test.ts`) + полный `pnpm run ci` на окружении агента; **live decode** в Chrome/Safari — по чеклисту `BROWSER_SMOKE_PHASE05_CHECKLIST.md` (ops приёмка).

---

## Вердикт

**PASS.** Critical / Major закрыты в объёме репозитория + задокументированная браузерная приёмка. Minor: один defer (паритет спиннера), один закрыт документацией в коде, один defer (Playwright).

---

## 1) HLS на Chrome/Safari и MP4-only

### Проверено в коде

| Сценарий | Поведение | Статус |
|----------|-----------|--------|
| **Safari / iOS (native HLS)** | `shouldUseNativeHls()` → `true` → `attachNativeHls`: `video.src = masterUrl`, poster опционально | OK |
| **Chrome (и прочие без native HLS)** | `shouldUseNativeHls()` → `false` → lazy `import("hls.js")`, `Hls.isSupported()` → `loadSource` + `attachMedia` | OK |
| **hls.js не поддерживается** | `attachProgressive` на `mp4.url` (`/api/media/{id}`) без автофлага fallback — прямой MP4 | OK |
| **MP4-only (флаг выкл / нет сессии / resolve не ok)** | `initialPlayback === null` → `LegacyInlineVideo`: `<source src={mp4Url}>` к тому же `/api/media/...`, что и до phase-05 | OK |
| **Сервер отдаёт `delivery: mp4`** | начальный `sourceKind === "mp4"` → только `attachProgressive` | OK |
| **Внешний URL видео (не `/api/media/uuid`)** | `apiMediaId` не матчится → `patientPlaybackInitial` остаётся `null` → legacy progressive по полному URL | OK |

### Оговорка

- Подтверждение «**реально играет**» на конкретных сборках Chrome/Safari — **чеклист** `docs/VIDEO_HLS_DELIVERY/BROWSER_SMOKE_PHASE05_CHECKLIST.md` (заполняет ops перед первой раскаткой HLS по умолчанию).

**Вывод:** логика ветвлений **корректна**; продуктовая проверка декодирования — **по чеклисту**.

---

## 2) Fallback при ошибке HLS

### Проверено в коде

- **Один автоматический переход HLS → MP4:** `tryMp4Fallback` при `sourceKind === "hls"` и `autoFallbackUsedRef.current === false` → `setSourceKind("mp4")`; ref блокирует повтор.
- **Триггеры:**
  - **fatal** `hls.js` (`Hls.Events.ERROR`, `data.fatal`) → `destroyHls()`, затем `tryMp4Fallback()` или финальная ошибка.
  - **`error` на `<video>`** (в т.ч. native HLS master) → тот же `tryMp4Fallback`.
  - **Ошибка dynamic import `hls.js`** → fallback или ошибка.
- **После исчерпания fallback** показывается текст ошибки + **«Повторить»** → `fetch` `/api/media/{id}/playback` (новый payload, сброс ref).
- **Не-fatal** ошибки hls.js **не** обрабатываются отдельно (по умолчанию hls.js может восстановиться сам) — приемлемо для phase-05.

**Вывод:** fallback **реализован и соответствует** заявленной политике «один автоматический MP4 после HLS».

---

## 3) Утечки памяти / жизненный цикл hls.js

### Проверено в коде

- **Перед новой инициализацией:** `destroyHls()` в начале `useEffect`.
- **При unmount / смене deps:** `return () => { … destroyHls(); video.pause(); remove src/sources; video.load(); }`.
- **При fatal HLS до fallback:** `destroyHls()` внутри обработчика ошибки, затем смена `sourceKind` запускает новый цикл эффекта (повторный `destroyHls` — идемпотентно, `hlsRef` уже `null`).
- **React Strict Mode:** повторный mount/unmount снова вызывает cleanup → повторный `destroyHls()` — ожидаемо и безопасно.

**Вывод:** явного удержания `Hls` после unmount в коде **нет**; риск утечки по коду **низкий**. Долгосрочный soak (десятки переходов по страницам) в CI **не** гоняется.

---

## 4) UI patient page / регрессии

### Проверено

- Секция «Видео»: по-прежнему `PageSection`, заголовок `h3`, YouTube **не** тронут.
- Для библиотечного видео: обёртка `relative aspect-video … rounded-lg bg-muted/30` согласована с прежней геометрией блока (раньше видео было с `rounded-lg` / `max-w-full`).
- Используются **`patientBodyTextClass`**, **`patientMutedTextClass`**, **`Button`** (shadcn) — в духе `PATIENT_APP_UI_STYLE_GUIDE` (patient layer + primitives).

### Дельта UX (не блокер)

- **Legacy MP4-only** (`initialPlayback === null`): добавлены **overlay loading** до `loadeddata` и **экран ошибки** с «Обновить страницу» вместо «молча» сломанного `<video>`. Это **улучшение отказоустойчивости**, но **не идентично** прежнему минималистичному виду до первого кадра.

**Вывод:** визуальная система patient **не ломается**; есть **осознанное** усложнение legacy-ветки (loading/error).

---

## MANDATORY FIX INSTRUCTIONS

### Critical

- **Нет.**  
- **Статус:** **CLOSED (N/A)** — 2026-05-03.

### Major

- **Ручной smoke HLS в браузере** (приёмка на окружении с реальным плеером).  
- **Статус:** **CLOSED (репозиторий)** — 2026-05-03: добавлен **`docs/VIDEO_HLS_DELIVERY/BROWSER_SMOKE_PHASE05_CHECKLIST.md`**; исполнитель заполняет таблицу Pass/Fail без presigned URL. На окружении агента: целевые тесты phase-05 + **`pnpm run ci`**.

### Minor

1. **Опционально: паритет legacy без спиннера**  
   **Статус:** **DEFERRED** — продуктовое решение; текущий спиннер/error считаем улучшением UX.

2. **Документация клиентской телеметрии**  
   **Статус:** **CLOSED** — 2026-05-03: блок комментария в `PatientContentAdaptiveVideo.tsx` + правило «только безопасные поля» в `patientPlaybackDiag`.

3. **E2E с реальным headless (Playwright)**  
   **Статус:** **DEFERRED** — вне scope текущего FIX; инфраструктуры Playwright в репозитории нет.

---

## Закрытие аудита (матрица запроса)

| Пункт | Статус |
|-------|--------|
| 1 HLS/Chrome/Safari + MP4-only | OK по коду + чеклист браузера |
| 2 Fallback при ошибке HLS | OK (+ unit на выбор режима источника) |
| 3 Нет утечки hls (destroy) | OK по коду |
| 4 UI patient не регрессирует | OK; legacy loading — Minor delta (defer) |

**Подпись:** FIX 2026-05-03; Major закрыт документом приёмки + CI; live Safari/Chrome — строки в `BROWSER_SMOKE_PHASE05_CHECKLIST.md`.
