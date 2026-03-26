# Fix 02 (HIGH): YouTube videoType не маппится в videoSource

## Проблема

`saveContentPage` сохраняет YouTube-URL с `videoType = "youtube"`. Но `content-catalog/service.ts` строит `videoSource` только для `videoType === "url"` или `"api"`. YouTube-видео никогда не попадает в плеер.

## Файлы

- `apps/webapp/src/modules/content-catalog/service.ts`

## Шаги

### Шаг 2.1: Добавить маппинг для videoType === "youtube"

**Файл:** `apps/webapp/src/modules/content-catalog/service.ts`

**Найти:**
```ts
            if (row.videoUrl && row.videoType === "url") {
              item.videoSource = { type: "url", url: row.videoUrl };
            } else if (row.videoUrl && row.videoType === "api") {
              item.videoSource = { type: "api", mediaId: row.videoUrl };
            }
```

**Заменить на:**
```ts
            if (row.videoUrl && (row.videoType === "url" || row.videoType === "youtube")) {
              item.videoSource = { type: "url", url: row.videoUrl };
            } else if (row.videoUrl && row.videoType === "api") {
              item.videoSource = { type: "api", mediaId: row.videoUrl };
            }
```

YouTube-URL будет передан как `type: "url"`. Компонент `[slug]/page.tsx` уже умеет распознавать YouTube URL и рендерить iframe.

## Верификация

1. `pnpm run ci` — без ошибок.
2. Логика: сохранённый контент с YouTube URL отображает iframe на пациентской странице.
