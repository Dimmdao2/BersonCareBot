# AUDIT — VIDEO_HLS_DELIVERY Phase 02 (Transcoding queue + `apps/media-worker`)

**Дата аудита:** 2026-05-03  
**Объект:** очередь `media_transcode_jobs`, internal enqueue, пакет `apps/media-worker`, флаг `video_hls_pipeline_enabled`, отсутствие транскода в Next.js request path.

**Источники проверки:**  
`apps/media-worker/**`, `apps/webapp/src/app/api/internal/media-transcode/enqueue/route.ts`, `apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts`, `apps/webapp/db/drizzle-migrations/0019_media_transcode_jobs_queue.sql`, `pnpm-workspace.yaml`, корневой `package.json`, `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md`, `apps/integrator` (поиск пересечений с media-worker).

---

## Вердикт

**PASS.** Пять пунктов запроса аудита выполнены по коду и зафиксированным проверкам. Обязательных исправлений коду (**Critical / Major**) нет. Есть **minor** операционно‑документационного характера (различение двух воркеров в runbook/скриптах).

---

## 1) `apps/media-worker` изолирован от integrator worker

**Проверено**

- В дереве `apps/integrator` **нет** ссылок на `media-worker`, `media_transcode_jobs`, `mediaTranscode` (поиск по репозиторию integrator).
- Процесс `apps/media-worker` — отдельный entrypoint `src/main.ts`, зависимости только `pg`, S3 SDK, FFmpeg installer, `pino`, `zod`; **нет** импортов из `@bersoncare/integrator`, `grammy`, projection/outbox и т.п.
- Общий контур с integrator возможен **только на уровне инфраструктуры** (одна PostgreSQL, общая таблица `system_settings` для флага `video_hls_pipeline_enabled` в зеркале integrator — миграция `20260503_0001_*`). Это данные/конфиг, а не общий код воркера.

**Оговорка (ops, не дефект изоляции кода)**

- В **корневом** `package.json` команды `worker:dev` / `worker:start` / `worker:start:host` относятся к **`apps/integrator`**, а не к `apps/media-worker`. Оператор может ошибочно считать, что «worker» в монорепо — один. См. **MANDATORY FIX INSTRUCTIONS → Minor**.

**Вывод:** изоляция **кода и процесса** соблюдена.

---

## 2) Очередь устойчива к повторным попыткам и не создаёт дубликаты активных job

**Проверено**

- **Уникальность активных job на `media_id`:** частичный уникальный индекс `media_transcode_jobs_one_active_per_media` на `(media_id) WHERE status IN ('pending','processing')` в миграции `0019`.
- **Enqueue:** предварительный `SELECT` активной job; при гонке — обработка `23505` и повторный `SELECT` активной строки → ответ `alreadyQueued` (см. `pgMediaTranscodeJobs.ts`).
- **Worker:** claim в транзакции с `FOR UPDATE SKIP LOCKED` и перевод в `processing` с инкрементом `attempts`; reclaim зависших `processing` по `locked_at` (см. `apps/media-worker/src/jobs/claim.ts`).
- **Сбои пайплайна:** `retryableFail` с `next_attempt_at` и backoff; при достижении лимита попыток — `failed` на job и обновление `media_files` (см. `processTranscodeJob.ts`).

**Оговорка (принятая модель)**

- После финального **`failed`** повторный **новый** job на тот же `media_id` **возможен** (нет активной `pending`/`processing`). Это не дубликат активных job и соответствует ручному повтору/исправлению источника.

**Вывод:** дубликатов активных job БД не допускает; retries не застревают бесконечно без лимита.

---

## 3) Ошибки FFmpeg не «валят» API

**Проверено**

- Вызов FFmpeg реализован через `spawn` в **`apps/media-worker/src/ffmpeg/runFfmpeg.ts`**; обработка ошибок — внутри `processTranscodeJob` (retry / `failed`, логирование), без HTTP.
- `POST /api/internal/media-transcode/enqueue` только ставит строку в очередь (`enqueueMediaTranscodeJob`) и возвращает JSON; **нет** вызова FFmpeg, `child_process` для транскода.
- При **неожиданном исключении** в enqueue (БД и т.п.) route возвращает **`500`** с `enqueue_failed` — это отказ **insert/metadata**, не падение процесса от FFmpeg на стороне webapp.

**Вывод:** сбои транскодинга изолированы в отдельном процессе `media-worker` и не привязаны к циклу выполнения FFmpeg в Next.js.

---

## 4) Нет выполнения транскодинга внутри route handlers

**Проверено**

- Поиск по `apps/webapp/src/app/api/**/*.ts`: **нет** совпадений `ffmpeg`, `runFfmpeg`, `spawn(` в API routes.
- Единственный HLS‑связанный internal route — `internal/media-transcode/enqueue`: валидация, флаг, вызов репозитория.

**Вывод:** транскодинг в handlers не выполняется.

---

## 5) Целевые проверки выполнены и зафиксированы

**Проверено по артефакту**

- В `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md` (запись **Phase 02**) указаны:
  - `pnpm --dir apps/media-worker typecheck`, `pnpm --dir apps/media-worker test`;
  - `pnpm --dir apps/webapp` lint, typecheck, test (включая тесты enqueue / `pgMediaTranscodeJobs`);
  - полный **`pnpm run ci`** (lint, typecheck, integrator + webapp + media-worker tests, build, audit).

**Дополнительно по коду**

- Тесты: `apps/webapp/src/app/api/internal/media-transcode/enqueue/route.test.ts`, `apps/webapp/src/infra/repos/pgMediaTranscodeJobs.test.ts`, `apps/media-worker/src/*.test.ts`.

**Вывод:** критерий «проверки приложены» выполнен через execution-log и наличие целевых тестов в репозитории.

---

## MANDATORY FIX INSTRUCTIONS

### Critical

- **Нет.** Блокирующих нарушений изоляции воркера, очереди, API и транскода в routes не выявлено.  
- **Статус после FIX:** **CLOSED (N/A)** — 2026-05-03.

### Major

- **Нет.**  
- **Статус после FIX:** **CLOSED (N/A)** — 2026-05-03.

### Minor

1. **Runbook / операторская ясность: два разных «worker»**  
   **Действие (выполнено):** в `deploy/HOST_DEPLOY_README.md` добавлен явный блок под systemd **Worker**: отличие `bersoncarebot-worker-prod` (integrator) от `apps/media-worker`, корневые `pnpm worker:*` только для integrator, команды сборки/старта media-worker; указано, что **имя production systemd‑unit** для media-worker **не зафиксировано** до выката HLS и **не** должно переиспользовать integrator worker.

   **Статус:** **CLOSED** — 2026-05-03 (FIX AUDIT_PHASE_02).

---

## Закрытие аудита

| Пункт запроса | Статус |
|---------------|--------|
| 1 Изоляция `apps/media-worker` от integrator worker | OK (код + runbook `HOST_DEPLOY_README.md`, FIX 2026-05-03) |
| 2 Очередь: retries, без дубликатов активных job | OK |
| 3 FFmpeg не валит API | OK |
| 4 Нет транскода в route handlers | OK |
| 5 Целевые проверки задокументированы | OK (`06-execution-log.md` + тесты) |

**Gate phase-03:** путаница «worker» в ops‑документации снята в `deploy/HOST_DEPLOY_README.md` (FIX 2026-05-03). Имя production systemd‑unit для `apps/media-worker` по‑прежнему вносится в `SERVER CONVENTIONS.md` при фактическом выкате на хост.

---

## FIX 2026-05-03 (закрытие MANDATORY FIX INSTRUCTIONS)

- **Critical / Major:** подтверждение закрытия — см. разделы выше.
- **Minor:** правка `deploy/HOST_DEPLOY_README.md` (scope + блок под integrator **Worker**).
