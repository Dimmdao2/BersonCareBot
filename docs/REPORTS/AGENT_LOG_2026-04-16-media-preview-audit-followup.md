# Agent log — Media Preview: аудит и точечные правки (2026-04-16)

## Контекст

После внедрения пайплайна превью (P0–P7) выполнен аудит клиентского слоя и смежных частей; внесены **точечные** исправления без смены архитектуры API.

## Сделано

1. **Парсинг UUID из `/api/media/{uuid}`** — дублирующий regex в `actionsShared.ts` удалён; единый источник: [`mediaPreviewUrls.ts`](../../apps/webapp/src/shared/lib/mediaPreviewUrls.ts) (`API_MEDIA_ID_RE`, `parseMediaFileIdFromAppUrl`).

2. **Picker (`MediaLibraryPickerDialog`)** — убрано принудительное `previewStatus: "ready"` при отсутствии строки выбора из API; без достоверного статуса — фаза `pending`, без `<img>` готового thumb.

3. **Канонический DTO на фронте** — тип [`MediaPreviewUiModel`](../../apps/webapp/src/shared/ui/media/mediaPreviewUiModel.ts) и мапперы (`libraryMediaRowToPreviewUi`, `exerciseMediaToPreviewUi`, `lfkCoverToPreviewUi`, `mediaLibraryPickerSelectionToPreviewUi`); [`MediaThumb`](../../apps/webapp/src/shared/ui/media/MediaThumb.tsx) принимает только `media: MediaPreviewUiModel`.

4. **Инварианты (CI)** — скрипт [`apps/webapp/scripts/check-media-preview-invariants.sh`](../../apps/webapp/scripts/check-media-preview-invariants.sh): запрет `<img src={item.url}>` в list/grid/picker (исключая lightbox) и запрет литералов `/api/media/.../preview/sm|md` вне `mediaPreviewUrls.ts`. Включён в `pnpm --dir apps/webapp run lint`.

5. **SQL (переходный JOIN)** — в [`pgLfkExercises.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.ts) и [`pgLfkDiary.ts`](../../apps/webapp/src/infra/repos/pgLfkDiary.ts) добавлены комментарии `TEMP: parsing media_id из media_url…` у `LEFT JOIN media_files`.

6. **Маршрут превью** — [`preview/[size]/route.ts`](../../apps/webapp/src/app/api/media/[id]/preview/[size]/route.ts): успешная отдача/304 логируется уровнем **debug**; `ETag` — из S3 Head или SHA-256 тела; `Last-Modified` — из S3 или fallback; добавлен **`If-Modified-Since`** (без конфликта с `If-None-Match`).

7. **Воркер** — в выборку добавлены `source_width`/`source_height`; при обоих `NULL` до обработки — `debug`-лог backfill; для HEIC размеры источника дополняются метаданными `sharp` по декодированному JPEG до sm/md.

8. **Прочее** — стабилизированы зависимости `IntersectionObserver` (load more) в [`MediaLibraryClient`](../../apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx); [`VideoThumbnailPreview`](../../apps/webapp/src/shared/ui/media/VideoThumbnailPreview.tsx) помечен `@deprecated` (в grid не используется).

## Тесты и проверки (на момент правок)

- `pnpm --dir apps/webapp exec vitest --run src/app/app/doctor/content/MediaLibraryPickerDialog.test.tsx`
- `pnpm --dir apps/webapp run lint` (eslint + invariant script)
- `pnpm --dir apps/webapp exec tsc --noEmit`

## Связанные документы

- [`docs/ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md`](../ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md) — обновлено под `MediaPreviewUiModel` и guard.
- [`docs/MEDIA_PREVIEW_PIPELINE.md`](../MEDIA_PREVIEW_PIPELINE.md) — обновлены разделы про отдачу превью и логи воркера.
