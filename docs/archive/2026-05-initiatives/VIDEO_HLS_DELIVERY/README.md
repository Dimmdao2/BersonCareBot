# VIDEO_HLS_DELIVERY — документация инициативы

Поэтапный переход от выдачи **MP4** (presigned private S3 через `GET /api/media/[id]`) к **dual delivery** с **HLS** (FFmpeg + объекты в S3 + hls.js / Safari), без простоя и без DRM.

## С чего начать

1. [00-master-plan.md](./00-master-plan.md) — цели, этапы, зависимости, rollback.
2. [01-current-state-and-gap-analysis.md](./01-current-state-and-gap-analysis.md) — аудит текущей кодовой базы.
3. [02-target-architecture.md](./02-target-architecture.md) — целевая модель (`apps/webapp` + `apps/media-worker`).

## Остальные документы

| Файл | Описание |
|------|----------|
| [03-rollout-strategy.md](./03-rollout-strategy.md) | Выкатка, флаги, canary, backfill |
| [04-test-strategy.md](./04-test-strategy.md) | Тесты и негативные сценарии |
| [05-risk-register.md](./05-risk-register.md) | Реестр рисков |
| [06-execution-log.md](./06-execution-log.md) | Журнал работы |
| [AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md) | Пост-аудит closure batch (метрики playback) + фиксы 2026-05-03 |
| [HLS_PROXY_DELIVERY_LOG.md](./HLS_PROXY_DELIVERY_LOG.md) | Same-origin прокси HLS (webapp), телеметрия `media_hls_proxy_error_events`, health, retention |
| [07-post-documentation-implementation-roadmap.md](./07-post-documentation-implementation-roadmap.md) | Дорожная карта после утверждения доков |
| [PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md](./PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md) | Готовые copy-paste промпты для Composer (`EXEC -> AUDIT -> FIX`, `GLOBAL AUDIT/FIX`, `PREPUSH POSTFIX AUDIT`) |

## Фазы реализации

См. каталог [phases/](./phases/) (`phase-01` … `phase-10`).

## Связь с существующими документами

- Текущее медиа: `apps/webapp/src/modules/media/media.md`
- Private S3: `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`
- Прод-сервисы: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
