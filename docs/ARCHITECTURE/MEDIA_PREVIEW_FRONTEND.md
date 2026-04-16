# Media Preview — Frontend Architecture

**Scope:** `apps/webapp` — все grid/list/picker миниатюры медиа из библиотеки (`/api/media/{uuid}`).

## Канонические модули

| Назначение | Модуль |
|------------|--------|
| URL превью (`/api/media/.../preview/sm|md`), парсинг UUID из app URL | [`apps/webapp/src/shared/lib/mediaPreviewUrls.ts`](../../apps/webapp/src/shared/lib/mediaPreviewUrls.ts) (`mediaPreviewUrlById`, `mediaPreviewSmUrl`, `mediaPreviewMdUrl`, `parseMediaFileIdFromAppUrl`) |
| Единый shape для grid/list/picker + мапперы из DTO API | [`apps/webapp/src/shared/ui/media/mediaPreviewUiModel.ts`](../../apps/webapp/src/shared/ui/media/mediaPreviewUiModel.ts) |
| Фаза миниатюры (`ready` / `pending` / …) | [`apps/webapp/src/shared/ui/media/mediaThumbState.ts`](../../apps/webapp/src/shared/ui/media/mediaThumbState.ts) |
| Рендер миниатюры (`<img loading="lazy">`, skeleton, ошибки) | [`apps/webapp/src/shared/ui/media/MediaThumb.tsx`](../../apps/webapp/src/shared/ui/media/MediaThumb.tsx) — вход: **`media: MediaPreviewUiModel`** (фаза считается внутри через `getMediaThumbPhase`) |

`mediaUrlPolicy.ts` реэкспортирует `API_MEDIA_ID_RE` из `mediaPreviewUrls.ts` (единый regex).

## Правила (обязательные)

1. Все grid/list/picker превью библиотечных файлов — только через **`<MediaThumb>`** (не `<img src={item.url}>` для миниатюры).
2. Строить путь `/api/media/.../preview/sm|md` — только через **`mediaPreviewUrlById`** / **`mediaPreviewSmUrl`** / **`mediaPreviewMdUrl`** из `shared/lib/mediaPreviewUrls.ts`.
3. **`VideoThumbnailPreview`** — помечен `@deprecated` для grid; допустим только в лайтбоксе / плеере при необходимости, не в карточках и списках.
4. **`img src={item.mediaUrl}`** для миниатюры в списках — **запрещено** (оригинал только в lightbox / playback).
5. Client-side resolution probe (`new Image()` / `video.src = …` для размеров в списке) — **запрещено**; размеры источника — поля **`sourceWidth` / `sourceHeight`** из API (заполняет воркер).

6. **Picker выбранного файла** — не выводить «готовый» thumb по одному только URL: `previewStatus` для превью в поле выбора берётся из метаданных последнего pick из библиотеки (строка API); без pick — **pending**, без догадок по клиенту.

7. **Автопроверка** — `pnpm --dir apps/webapp run lint` запускает [`scripts/check-media-preview-invariants.sh`](../../apps/webapp/scripts/check-media-preview-invariants.sh) (запрет `<img src={item.url}>` в list/grid/picker и литералов пути preview вне `mediaPreviewUrls.ts`).

## Запрещено

- Прямой `<img src={mediaUrl}>` / `<img src={item.url}>` / `<img src={complex.coverImageUrl}>` в list/grid/picker UI.
- Ручное построение preview URL (`/api/media/{id}/preview/{size}`) вне `shared/lib/mediaPreviewUrls.ts`.
- Локальные дубликаты `API_MEDIA_ID_RE` вне `shared/lib/mediaPreviewUrls.ts`.
- Client-side probe оригиналов (`new Image()`, `video.src = ...`) для определения размеров в списках.
- Fallback на оригинал в list/grid/picker при отсутствии preview (`pending/failed/skipped` должны рендериться как состояние, не как оригинал).

## Обязательно

- Рендер миниатюры только через `MediaThumb`.
- Вычисление состояния миниатюры через `getMediaThumbPhase` (внутри `MediaThumb` или через shared-модель).
- Построение preview URL только через `mediaPreviewUrls` (`mediaPreviewUrlById`, `mediaPreviewSmUrl`, `mediaPreviewMdUrl`).
- Проверка инвариантов через `pnpm --dir apps/webapp run lint` (включая `scripts/check-media-preview-invariants.sh`).

## Матрица контекст → размер

| Контекст | Превью | srcSet md (2x) |
|----------|---------|----------------|
| Grid карточка библиотеки (`max-h-40`) | `sm` | да, если есть `previewMdUrl` |
| Таблица (`max-h-16`) | `sm` | нет |
| Picker / AutoCreate (`h-24`) | `sm` | по наличию `previewMdUrl` |
| Список упражнений (36×36) | `sm` | нет |
| Плитка упражнения | `sm` + `md` | да |
| LFK карточка комплекса | `sm` | по наличию md |
| Лайтбокс изображения | `md` или оригинал | — |
| Лайтбокс видео | оригинал | — |

## Анти-паттерны

```tsx
// BAD
<img src={item.url} />
<img src={item.mediaUrl} alt="" />
<VideoThumbnailPreview src={item.mediaUrl} />  // в grid

// GOOD
<MediaThumb
  media={libraryMediaRowToPreviewUi(item)}
/>
// или exerciseMediaToPreviewUi / lfkCoverToPreviewUi / mediaLibraryPickerSelectionToPreviewUi
```

## Как добавить новый экран с медиа

1. Убедиться, что API отдаёт `previewSmUrl`, `previewMdUrl`, `previewStatus` (и при необходимости `sourceWidth`/`sourceHeight`) в том же shape, что и [`GET /api/admin/media`](../../apps/webapp/src/app/api/admin/media/route.ts).
2. Собрать **`MediaPreviewUiModel`** через shared-маппер из `mediaPreviewUiModel.ts` (или добавить новый shared-маппер; page-local дубли логики не допускаются).
3. Передать в **`MediaThumb`** только `media={...}`; не писать собственный рендер `ready/pending/failed/skipped`.
4. Не строить URL превью вручную: только `mediaPreviewUrls`.
5. Для playback/lightbox использовать отдельные компоненты просмотра, не обходя list/grid/picker-инварианты.

## Backend / SQL (упражнения и LFK)

Для строк `lfk_exercise_media.media_url` вида `/api/media/{uuid}` превью подмешиваются через **`LEFT JOIN media_files`** по UUID, извлечённому из URL (переходный вариант до явного `media_id` в схеме; в SQL помечено комментарием `TEMP`). См. [`pgLfkExercises.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.ts), [`pgLfkDiary.ts`](../../apps/webapp/src/infra/repos/pgLfkDiary.ts).

## Связанные документы

- Пайплайн превью и воркер: [`MEDIA_PREVIEW_PIPELINE.md`](../MEDIA_PREVIEW_PIPELINE.md)
- Лог правок после аудита: [`REPORTS/AGENT_LOG_2026-04-16-media-preview-audit-followup.md`](../REPORTS/AGENT_LOG_2026-04-16-media-preview-audit-followup.md)
