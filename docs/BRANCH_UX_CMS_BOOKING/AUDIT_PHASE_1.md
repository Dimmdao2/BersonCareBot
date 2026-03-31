# Аудит Фазы 1 (CMS + Медиабиблиотека)

- **Дата первичного аудита:** 2026-03-31
- **Дата закрытия замечаний:** 2026-03-31
- **Аудитор:** GPT-5.3 Codex
- **Источники:**
  - `docs/BRANCH_UX_CMS_BOOKING/PHASE_1_TASKS.md`
  - `docs/BRANCH_UX_CMS_BOOKING/AGENT_LOG.md`
  - изменения Фазы 1 в коде (`apps/webapp/src/app/app/doctor/content/**`, `apps/webapp/src/app/api/media/**`, связанные тесты)
- **Итог:** **pass** (все findings закрыты; `pnpm run ci` зелёный после доработок)

## Findings — первичный аудит (архив)

Ниже — исходные замечания; статус **исправлено** для каждого пункта.

### 1) High — invalid nested interactive elements в grid-карточке медиатеки — **исправлено**

- **Было:** превью обёрнуто в `<button>` с вложенными `video`/`audio`/`a`.
- **Сделано:** в [`MediaCard.tsx`](apps/webapp/src/app/app/doctor/content/library/MediaCard.tsx) для изображения — только `<img>` внутри кнопки; для video/audio/file — контролы и ссылки вне обёртки-кнопки, отдельная кнопка «Предпросмотр» для lightbox; у кнопок копирования/удаления добавлен `stopPropagation`.

### 2) Medium — ослаблен контракт `contentPages.listAll` в `saveContentPage` — **исправлено**

- **Было:** `(await deps.contentPages.listAll?.()) ?? []`.
- **Сделано:** в [`actions.ts`](apps/webapp/src/app/app/doctor/content/actions.ts) обязательный `await deps.contentPages.listAll()` в `try/catch`; при ошибке — `{ ok: false, error: "…список страниц…" }`. Unit-тест «listAll fails» в [`actions.test.ts`](apps/webapp/src/app/app/doctor/content/actions.test.ts); e2e [`cms-content.test.ts`](apps/webapp/e2e/cms-content.test.ts) дополнен моком `listAll`.

### 3) Low — mobile default grid при сохранённом desktop-предпочтении — **исправлено**

- **Было:** `localStorage` перекрывал mobile-first grid.
- **Сделано:** в [`MediaLibraryClient.tsx`](apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx) при `matchMedia` mobile viewport всегда `setViewMode("grid")`; на desktop — значение из `localStorage` или `table`.

### Дополнительно (CI)

- [`MediaLibraryPickerDialog.tsx`](apps/webapp/src/app/app/doctor/content/MediaLibraryPickerDialog.tsx): определение mobile viewport переведено на `useSyncExternalStore` (устранение `react-hooks/set-state-in-effect`).

## Проверка требований из задачи (после доработок)

| Требование | Статус |
|------------|--------|
| Множественная загрузка + progress | pass (UI — последовательные POST; API — multi-file) |
| Grid-view адаптивен | pass |
| Drag-and-drop не ломает обычную загрузку | pass |
| Picker — Dialog/Sheet | pass |
| CMS без регрессий по sortOrder / listAll | pass |
| accept / capture | pass |

## Верификация

- `pnpm run ci` — green после исправлений.

## Рекомендация

Фаза 1 по аудиту **закрыта**; дальнейшие изменения — только по новым задачам/регрессам.
