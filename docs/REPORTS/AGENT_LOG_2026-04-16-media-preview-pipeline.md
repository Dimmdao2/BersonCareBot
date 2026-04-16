# Agent log — media preview pipeline (2026-04-16)

## Сделано

- Миграция [`075_media_preview_status.sql`](../apps/webapp/migrations/075_media_preview_status.sql): колонки превью и индекс по `pending`.
- S3: [`s3PreviewKey`](../apps/webapp/src/infra/s3/client.ts), [`s3GetObjectBody`](../apps/webapp/src/infra/s3/client.ts).
- Воркер: [`mediaPreviewWorker.ts`](../apps/webapp/src/infra/repos/mediaPreviewWorker.ts); internal route [`media-preview/process`](../apps/webapp/src/app/api/internal/media-preview/process/route.ts).
- API превью: [`/api/media/[id]/preview/[size]`](../apps/webapp/src/app/api/media/[id]/preview/[size]/route.ts).
- Репозиторий: расширены `list` / `getById`, [`getMediaPreviewS3KeyForRedirect`](../apps/webapp/src/infra/repos/s3MediaStorage.ts); purge удаляет объекты превью.
- Типы: [`MediaRecord`](../apps/webapp/src/modules/media/types.ts) + `MediaPreviewStatus`.
- UI: `MediaCard`, `MediaPickerList`, таблица в `MediaLibraryClient`, `MediaLightbox` (md для картинок).
- Документация: [`MEDIA_PREVIEW_PIPELINE.md`](../MEDIA_PREVIEW_PIPELINE.md), [`HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) (cron + перечень internal routes).
- Зависимости: `sharp`, `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@types/fluent-ffmpeg`; `pnpm.onlyBuiltDependencies` в корневом [`package.json`](../../package.json).

## Чеклист после мержа

- [ ] Применить миграцию `075` на нужных окружениях.
- [ ] Добавить cron `media-preview/process` на prod (loopback + Bearer), см. deploy README.
- [ ] Убедиться, что `pnpm install` разрешает build scripts для `sharp` / `@ffmpeg-installer/*` на CI и на хосте.

## Проверки (локально)

- `pnpm --dir apps/webapp typecheck` — OK на момент коммита.

## Продолжение

Последующие точечные правки по аудиту фронта/DTO/маршрута/воркера: [`AGENT_LOG_2026-04-16-media-preview-audit-followup.md`](./AGENT_LOG_2026-04-16-media-preview-audit-followup.md).
