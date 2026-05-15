---
name: Wave2 Phase05 Webapp media
overview: Миграция сырого SQL в медиа-слое webapp (s3MediaStorage, folders, upload sessions, preview worker, multipart routes, transcode jobs) на Drizzle + execute(sql) для advisory/claim где нужно.
status: pending
isProject: false
todos:
  - id: p05-inventory
    content: "Сверка с RAW_SQL_INVENTORY §2.4 (медиа) + §2.5 multipart; порядок: сначала изолированные repos, затем preview worker (самый большой tx)."
    status: pending
  - id: p05-core-repos
    content: "s3MediaStorage.ts, mediaFoldersRepo.ts, mediaUploadSessionsRepo.ts, pgMediaTranscodeJobs.ts — Drizzle; advisory оставить execute(sql) в tx при необходимости."
    status: pending
  - id: p05-preview-multipart
    content: "mediaPreviewWorker.ts, routes multipart cleanup/init — транзакции и cleanup путей; не ослаблять проверки статусов media_files."
    status: pending
  - id: p05-system-health
    content: "Проверить, что метрики system-health / operator health по-прежнему согласованы с новыми запросами (при изменении полей)."
    status: pending
  - id: p05-verify
    content: "typecheck + целевые webapp тесты; ручной smoke загрузки/превью по чеклисту продукта (вне CI — отметить в LOG)."
    status: pending
---

# Wave 2 — этап 5: webapp медиа

## Размер

**L**

## Definition of Done

- [ ] Ключевые медиа-репозитории и критичные route-handlers не используют сырой `pool.query`/`client.query` без обоснования.
- [ ] S3 + БД остаются согласованы (нет «лишних» ready без объекта и т.д.) — инварианты перечислены в PR.
- [ ] CI по затронутым пакетам зелёный.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/s3MediaStorage.ts`, `media*`, `pgMediaTranscodeJobs.ts`, `src/app/api/**/multipart/**`, `mediaPreviewWorker.ts`.

**Вне scope:** изменение пайплайна ffmpeg в media-worker (этап 8), смена ACL модели.

## Риски

Advisory locks, pending_delete, multipart abort — обязательны тесты и поэтапный rollout.
