# Media Preview — Frontend Architecture

**Scope:** `apps/webapp` — все миниатюры медиа из библиотеки (`/api/media/{uuid}`) в grid/list/picker, обложки статей с library URL, гидратация picker после перезагрузки формы.

## Канонические модули

| Назначение | Модуль |
|------------|--------|
| URL превью (`/api/media/.../preview/sm|md`), парсинг UUID из app URL, **`API_MEDIA_ID_RE`** (единственное объявление в репозитории) | [`apps/webapp/src/shared/lib/mediaPreviewUrls.ts`](../../apps/webapp/src/shared/lib/mediaPreviewUrls.ts) (`mediaPreviewUrlById`, `mediaPreviewSmUrl`, `mediaPreviewMdUrl`, `parseMediaFileIdFromAppUrl`) |
| Политика URL библиотеки без regex id | [`apps/webapp/src/shared/lib/mediaUrlPolicy.ts`](../../apps/webapp/src/shared/lib/mediaUrlPolicy.ts) — `API_MEDIA_URL_RE`, `isLegacyAbsoluteUrl` (без реэкспорта `API_MEDIA_ID_RE`) |
| Единый shape для grid/list/picker + мапперы из DTO API | [`apps/webapp/src/shared/ui/media/mediaPreviewUiModel.ts`](../../apps/webapp/src/shared/ui/media/mediaPreviewUiModel.ts) |
| Фаза миниатюры (`ready` / `pending` / …) | [`apps/webapp/src/shared/ui/media/mediaThumbState.ts`](../../apps/webapp/src/shared/ui/media/mediaThumbState.ts) (`getMediaThumbPhase`) |
| Рендер миниатюры (`<img loading="lazy">`, skeleton, ошибки) | [`apps/webapp/src/shared/ui/media/MediaThumb.tsx`](../../apps/webapp/src/shared/ui/media/MediaThumb.tsx) — вход: **`media: MediaPreviewUiModel`** |
| Обложка статьи (пациент / предпросмотр врача): library URL → `MediaThumb`, иначе обычный `<img>` | [`apps/webapp/src/shared/ui/media/ContentHeroImage.tsx`](../../apps/webapp/src/shared/ui/media/ContentHeroImage.tsx) |
| Клиентский fetch метаданных строки (как у list) | [`apps/webapp/src/shared/ui/media/fetchAdminMediaListItem.ts`](../../apps/webapp/src/shared/ui/media/fetchAdminMediaListItem.ts) → **`GET /api/admin/media/{id}`** |

## Правила (обязательные)

1. Все grid/list/picker превью библиотечных файлов — только через **`<MediaThumb>`** (не `<img src={item.url}>` для миниатюры).
2. Строить путь `/api/media/.../preview/sm|md` в коде приложения — только через **`mediaPreviewUrlById`** / **`mediaPreviewSmUrl`** / **`mediaPreviewMdUrl`** из `shared/lib/mediaPreviewUrls.ts` (маршрут Next `app/api/media/.../preview` и комментарии в типах — исключения, см. скрипт инвариантов).
3. **Picker:** превью выбранного значения опирается на метаданные из **последнего pick** или на ответ **`GET /api/admin/media/{id}`** (гидратация при открытой форме с уже сохранённым `/api/media/{uuid}`). **Запрещено** выводить «готовый» thumb, угадывая только по форме URL (без `previewStatus` / preview URL из API).
4. **Лайтбокс изображения** ([`MediaLightbox.tsx`](../../apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx)): только **`previewMdUrl`** или **`previewSmUrl`** при `previewStatus === 'ready'`; при отсутствии превью — плейсхолдер (skeleton / сообщение), **не** оригинал `GET /api/media/{id}`. Видео/аудио в лайтбоксе по-прежнему с `<source src={item.url}>`.
5. Client-side resolution probe (`new Image()` / `video.src = …` для размеров в списке) — **запрещено**; размеры источника — **`sourceWidth` / `sourceHeight`** из API (воркер).
6. **Автопроверка** — `pnpm --dir apps/webapp run lint` запускает [`scripts/check-media-preview-invariants.sh`](../../apps/webapp/scripts/check-media-preview-invariants.sh): запреты на опасные `<img src={…}>`, литералы preview-path вне `mediaPreviewUrls.ts`, использование **`API_MEDIA_ID_RE`** вне `mediaPreviewUrls.ts`, локальные объявления `API_MEDIA_ID_RE`.

## Запрещено

- Прямой `<img src={mediaUrl}>` / `<img src={item.url}>` / `<img src={*.coverImageUrl}>` в list/grid/picker UI.
- `<img src={*.previewSmUrl|previewMdUrl}>` вне [`MediaThumb.tsx`](../../apps/webapp/src/shared/ui/media/MediaThumb.tsx).
- Ручное построение preview URL (`/api/media/{id}/preview/{size}`) вне `shared/lib/mediaPreviewUrls.ts` (кроме исключений скрипта: handlers `app/api/media`, комментарии в `modules/media/types.ts`).
- Локальные дубликаты **`API_MEDIA_ID_RE`** и любые ссылки на него вне `mediaPreviewUrls.ts`.
- Client-side probe оригиналов для размеров в списках.
- Fallback на оригинал в list/grid/picker и в лайтбоксе **изображений** при отсутствии preview.

## Обязательно

- Рендер миниатюры только через `MediaThumb` (или `ContentHeroImage`, который внутри использует тот же pipeline для `/api/media/{uuid}`).
- Состояние миниатюры через `getMediaThumbPhase` (внутри `MediaThumb`).
- Построение preview URL только через `mediaPreviewUrls` на границах, где URL собирается в TS (репозитории list/getById уже отдают готовые preview URL из БД через `mediaPreviewUrlById`).

## Каталог контента (пациент)

Для страниц материалов сервер подмешивает **`imageLibraryMedia`** ([`ContentStubItem`](../../apps/webapp/src/modules/content-catalog/types.ts)) при `image_url` вида `/api/media/{uuid}` — через `loadMediaById` в [`createContentCatalogResolver`](../../apps/webapp/src/modules/content-catalog/service.ts). [`ContentHeroImage`](../../apps/webapp/src/shared/ui/media/ContentHeroImage.tsx) на странице [`[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/page.tsx) использует это для `MediaThumb` без второго механизма URL.

В форме врача предпросмотр включает **`hydrateFromAdminApi`**: при необходимости строка подтягивается через `GET /api/admin/media/{id}` (тот же shape, что у элементов list).

## Матрица контекст → размер

| Контекст | Превью | srcSet md (2x) |
|----------|---------|----------------|
| Grid карточка библиотеки (`max-h-40`) | `sm` | да, если есть `previewMdUrl` |
| Таблица (`max-h-16`) | `sm` | нет |
| Picker / AutoCreate (`h-24`) | `sm` | по наличию `previewMdUrl` |
| Список упражнений (36×36) | `sm` | нет |
| Плитка упражнения | `sm` + `md` | да |
| LFK карточка комплекса | `sm` | по наличию md |
| Лайтбокс изображения | `md` при наличии, иначе `sm` | — |
| Лайтбокс видео | оригинал (`<video>`) | — |
| Обложка статьи (library URL) | `sm` (+ md в srcSet в `MediaThumb`) | по наличию md |

## Анти-паттерны

```tsx
// BAD
<img src={item.url} />
<img src={item.mediaUrl} alt="" />
<img src={imagePreviewMdUrl} />  // вне MediaThumb

// GOOD
<MediaThumb media={libraryMediaRowToPreviewUi(item)} />
// exerciseMediaToPreviewUi / lfkCoverToPreviewUi / mediaLibraryPickerSelectionToPreviewUi
// Обложка CMS: <ContentHeroImage imageUrl={...} imageLibraryMedia={...} hydrateFromAdminApi />
```

Компонент **`VideoThumbnailPreview`** удалён; превью видео в сетках — через **`MediaThumb`** (JPEG из воркера).

## Как добавить новый экран с медиа

1. Убедиться, что API отдаёт `previewSmUrl`, `previewMdUrl`, `previewStatus` (и при необходимости `sourceWidth`/`sourceHeight`) в том же shape, что и [`GET /api/admin/media`](../../apps/webapp/src/app/api/admin/media/route.ts) и [`GET /api/admin/media/[id]`](../../apps/webapp/src/app/api/admin/media/[id]/route.ts).
2. Собрать **`MediaPreviewUiModel`** через shared-маппер из `mediaPreviewUiModel.ts`.
3. Передать в **`MediaThumb`** только `media={...}`.
4. Не строить URL превью вручную в UI: только данные с API или `mediaPreviewUrls` на серверных мапперах.

## Backend / SQL (упражнения и LFK)

Для строк `lfk_exercise_media.media_url` вида `/api/media/{uuid}` превью подмешиваются через **`LEFT JOIN media_files`** по UUID из URL (переходный вариант; в SQL помечено комментарием `TEMP`). См. [`pgLfkExercises.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.ts), [`pgLfkDiary.ts`](../../apps/webapp/src/infra/repos/pgLfkDiary.ts).

## Связанные документы

- Пайплайн превью и воркер: [`MEDIA_PREVIEW_PIPELINE.md`](../MEDIA_PREVIEW_PIPELINE.md)
- Лог правок: [`REPORTS/AGENT_LOG_2026-04-16-media-preview-audit-followup.md`](../REPORTS/AGENT_LOG_2026-04-16-media-preview-audit-followup.md)
