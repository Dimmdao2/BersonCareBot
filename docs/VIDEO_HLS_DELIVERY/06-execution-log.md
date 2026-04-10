# VIDEO HLS delivery — agent execution log

Журнал работы по подготовке пакета документации (миграция выдачи видео на HLS, dual delivery, без простоя).

Формат записей: новые сверху (после первой инициализации).

---

## 2026-04-10 — Инициализация пакета документации (этап A)

**Проанализировано**

- Монорепо: `apps/webapp` (Next.js + route handlers API), `apps/integrator` (API + **projection worker** `dist/infra/runtime/worker/main.js`). Отдельного `apps/api` нет — домен медиа и плейбэка живёт в **webapp**.
- Выдача видео: `content_pages.video_url` + `video_type` (`url` | `youtube` | `api`); для `api` в контенте канонически `/api/media/{uuid}`.
- `GET /api/media/[id]`: сессия обязательна → **302** на presigned GET в **private** S3 (`S3_PRIVATE_BUCKET`). Поток через backend **не** идёт.
- Таблица `media_files`: `s3_key`, `status`, размер до 3 GiB, папки, multipart; нет полей HLS/transcode.
- Внутренние «воркеры» webapp: HTTP cron с `INTERNAL_JOB_SECRET` (`media-pending-delete/purge`, `media-multipart/cleanup`) — не CPU-heavy pipeline.
- Плеер: нативный `<video>` + `NoContextMenuVideo`; нет hls.js; YouTube — iframe.
- Очередь транскодинга в webapp **отсутствует**; integrator worker — домен проекций/outbox, не медиа.

**Созданные документы**

- `00-master-plan.md` — цель, этапы, зависимости, rollback, карта документов.
- `01-current-state-and-gap-analysis.md` — gap analysis (обязательный отдельный документ).
- `02-target-architecture.md` — целевая схема, границы ответственности, `apps/media-worker`.
- `03-rollout-strategy.md` — поэтапный rollout, флаги, canary, backfill.
- `04-test-strategy.md` — unit/integration/e2e, негативные сценарии.
- `05-risk-register.md` — реестр рисков и митигации.
- `phases/phase-01` … `phase-10` — детализация этапов с чек-листами.
- `07-post-documentation-implementation-roadmap.md` — этап B: порядок работ после утверждения доков.

**Решения (зафиксированы в текстах планов)**

- Backend API в терминах репозитория = **Next.js handlers в `apps/webapp`**, не отдельный Fastify-сервис для медиа.
- Новый пакет **`apps/media-worker`** (включить в `pnpm-workspace.yaml` при реализации) — отдельный процесс Node + **FFmpeg CLI**, общая БД webapp, без микросервиса «video platform».
- Очередь транскодинга: минимально **PostgreSQL** (`FOR UPDATE SKIP LOCKED` или аналог), без новой инфраструктуры Redis на старте.
- Feature flags / delivery strategy: **`system_settings` (scope `admin`)** + ключи в `ALLOWED_KEYS` при имплементации (см. правила репозитория).

**Открытые вопросы (на этап реализации)**

- Точный набор renditions (битрейт/разрешение) и политика `availableQualities` — согласовать с продуктом/ops.
- Нужен ли отдельный systemd unit `bersoncarebot-media-worker-prod` с первого прод-выката worker или совместный хост с ручным масштабированием — зафиксировать в runbook при внедрении.
- Политика CORS для HLS: при отдаче сегментов тем же presigned-origin, что и сейчас для MP4, проверить поведение Safari/hls.js на стенде.

**Изменения в коде на этом шаге**

- Нет (этап A — документация и перекрёстные ссылки).

**Обновление существующей документации**

- `docs/README.md` — добавлена ссылка на инициативу `VIDEO_HLS_DELIVERY/`.
- `apps/webapp/src/modules/media/media.md` — краткая ссылка на план HLS (текущее поведение не меняется).
- `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` — ссылка на целевой пакет для последующих этапов HLS.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md` — не менялись (новый systemd unit появится только при внедрении worker; до этого факты в доке не подтверждены).

**Риски, выявленные при аудите текущего состояния**

- Плотная связка UX с `/api/media/{id}` как единственным URL для `video_type=api` — переключение на HLS потребует **playback resolution** слоя (см. phase-04/05).
- Отсутствие очереди транскодинга — **greenfield** в рамках webapp БД; нельзя смешивать с integrator projection worker.

---

## Шаблон следующих записей

```
## YYYY-MM-DD HH:MM — краткий заголовок
**Сделано:** …
**Файлы:** …
**Код/тесты:** …
**Следующий шаг:** …
```
