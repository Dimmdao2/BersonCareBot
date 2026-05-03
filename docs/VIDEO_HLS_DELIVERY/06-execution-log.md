# VIDEO HLS delivery — agent execution log

Журнал работы по подготовке пакета документации (миграция выдачи видео на HLS, dual delivery, без простоя).

Формат записей: новые сверху (после первой инициализации).

---

## 2026-05-03 — Phase 05 (patient dual-mode player: HLS + MP4)

**Сделано**

- Зависимость **`hls.js`** (`apps/webapp`); общий резолв **`resolveMediaPlaybackPayload`** (`app-layer/media/resolveMediaPlaybackPayload.ts`) — им пользуются **`GET /api/media/[id]/playback`** и RSC страницы контента.
- Тип ответа вынесен в **`modules/media/playbackPayloadTypes.ts`**.
- **`PatientContentAdaptiveVideo`** (`app/patient/content/[slug]/PatientContentAdaptiveVideo.tsx`): RSC при включённом флаге и сессии передаёт presign payload; иначе **только** `/api/media/{id}` (как раньше). HLS: **native** (`shouldUseNativeHls`) или **lazy hls.js**; один автоматический откат на MP4; **loading / error / Повторить** (refetch JSON без логирования URL); dev-диагностика **без** presigned URL.
- **`shouldUseNativeHls`** + unit-тест `shared/lib/nativeHls.test.ts`.
- Smoke **e2e in-process:** `e2e/patient-playback-inprocess.test.ts` (импорты route / resolver / page / клиентского плеера).

**Проверки (на окружении агента)**

- `pnpm install --frozen-lockfile && pnpm run ci`

---

## 2026-05-03 — FIX AUDIT_PHASE_04 (poster contract doc + test; MP4 path)

**Сделано**

- **Minor 1:** в `apps/webapp/src/app/api/api.md` (блок playback) зафиксировано: при падении presign **только** постера при успешном HLS master ответ остаётся `delivery: hls`, `posterUrl` может быть `null`.
- **Minor 2:** в `apps/webapp/src/app/api/media/[id]/playback/route.test.ts` — тест «presign poster fails, master ok → `hls`, `posterUrl` null».
- **Minor 3 (E2E Safari / hls.js):** **defer** phase-05 по роадмапу; в `AUDIT_PHASE_04.md` статус DEFERRED.

**MP4 путь не затронут**

- Playback по-прежнему возвращает `mp4.url` как `/api/media/{id}`; байты исходного файла идут через **существующий** `GET /api/media/[id]` (redirect/presign). В этом FIX не меняли `apps/webapp/src/app/api/media/[id]/route.ts`.

**Проверки (на окружении агента)**

- `pnpm install --frozen-lockfile && pnpm run ci` — успешно (включая `playback/route.test.ts`).

---

## 2026-05-03 — Phase 04 (playback API, delivery resolver, flags)

**Сделано**

- **`GET /api/media/[id]/playback`:** JSON-контракт при **`video_playback_api_enabled=true`** (по умолчанию `false` в миграции); иначе **503** `feature_disabled`. Сессия обязательна (**401** без сессии), тот же принцип, что у `GET /api/media/[id]`.
- **Резолв стратегии:** `resolveVideoPlaybackDelivery` (`modules/media/playbackResolveDelivery.ts`) — порядок: **`video_delivery_override`** (строка) → **`?prefer=`** (только **`role=admin`**) → **`video_default_delivery`** (`mp4`|`hls`|`auto`, из `system_settings`). Для видео: при выборе HLS и готовом master (trusted key + `video_processing_status=ready`) — presign master + при успехе presign постера; иначе **fallback** на прогрессивный источник. **`mp4.url`** всегда **`/api/media/{id}`** (текущий redirect на `s3_key`). Не-видео: **`delivery: file`**, без presign.
- **Флаги в БД:** миграция `0020_video_playback_settings.sql` + journal; зеркало integrator `20260503_0002_video_playback_settings.sql`. Ключи в **`ALLOWED_KEYS`** и **`ADMIN_SCOPE_KEYS`**: `video_playback_api_enabled`, `video_default_delivery`.
- **Данные:** `getMediaRowForPlayback` в `s3MediaStorage`; парсер качеств дополнен полями **`label`** / **`path`** (worker JSON).
- **Observability:** `playback_resolved` (mediaId, delivery, hlsReady, fallbackUsed, strategy, latencyMs); `playback_presign_failed` (err, mediaId, presignTarget) — **без** полных presigned URL.
- **Док:** `apps/webapp/src/app/api/api.md`.
- **Тесты:** `playbackResolveDelivery.test.ts`, `playback/route.test.ts`.

**Проверки**

- `pnpm install --frozen-lockfile && pnpm run ci`

---

## 2026-05-03 — FIX AUDIT_PHASE_03 (purge hardening, HLS helpers sync, MP4 fallback)

**Сделано**

- **Major (AUDIT_PHASE_03):** в `collectS3KeysForMediaPurge` явные `hls_master_playlist_s3_key` и `poster_s3_key` удаляются только если проходят `isTrustedHlsArtifactS3Key` / `isTrustedPosterS3Key`; иначе `logger.warn` и ключ не уходит в S3 Delete. Для подставного `poster_s3_key` — fallback list по каноническому prefix (как в аудите).
- **Minor (дубли файлов):** `scripts/check-hls-helpers-sync.mjs` + шаг `pnpm run check:hls-helpers-sync` в корневом `ci`; выровнено тело `hlsStorageLayout.ts` и `hlsMasterPlaylist.ts` между `apps/webapp` и `apps/media-worker` от маркерных `export`.
- **Minor defer:** HLS HTTP playback (phase-04) и Safari E2E — без изменений по плану инициативы.
- **Тесты:** расширены `hlsStorageLayout.test.ts`, `s3MediaStorage.test.ts` (недоверенные ключи).

**MP4 fallback (подтверждение)**

- `apps/media-worker/src/processTranscodeJob.ts` по-прежнему не вызывает удаление исходного объекта по `s3_key` (только локальный tmp).
- `GET /api/media/[id]` по-прежнему редиректит на presigned **исходный** `s3_key` (`getMediaS3KeyForRedirect`); HLS в HTTP-слое не подменяет MP4 до phase-04.

**Проверки**

- `pnpm install --frozen-lockfile && pnpm run ci` (включая `check:hls-helpers-sync`, webapp phase-03 тесты, `test:media-worker`).

---

## 2026-05-03 — Phase 03 (storage layout, HLS purge, MP4 coexistence)

**Сделано**

- **Layout в private S3:** рядом с `s3_key` (`media/{id}/{file}.mp4`) — `hls/master.m3u8`, варианты `hls/720p/`, `hls/480p/`, постер `poster/poster.jpg`. В webapp и worker: `hlsStorageLayout.ts` / `hlsMasterPlaylist.ts` (дубликаты с пометкой «keep in sync»).
- **Сосуществование с MP4:** транскод не удаляет исходный объект; purge при удалении медиа включает source `s3_key` в список на DeleteObject.
- **Cleanup:** `s3ListObjectKeysUnderPrefix` в `infra/s3/client.ts`; `collectS3KeysForMediaPurge` + расширенный SELECT в `purgePendingMediaDeleteBatch` (`s3MediaStorage.ts`); безопасный prefix: при несовпадении `dirname(s3_key)` с `media/{id}` HLS/poster не листаются с эвристикой — остаётся удаление явных ключей и `s3_key`.
- **Тесты:** `hlsStorageLayout.test.ts`, `hlsMasterPlaylist.test.ts` (smoke master), `s3MediaStorage.test.ts` (merge list + purge backoff).
- **Док:** `phases/phase-03-storage-layout-and-artifact-management.md` приведён к коду; критерии phase-03 отмечены выполненными.

**Проверки (на окружении агента)**

- `pnpm install --frozen-lockfile && pnpm run ci` (lint, typecheck, integrator + webapp + media-worker tests, build, audit)

---

## 2026-05-03 — FIX AUDIT_PHASE_02 (ops-док + подтверждение путей)

**Сделано**

- Закрыты **Critical / Major** в `docs/VIDEO_HLS_DELIVERY/AUDIT_PHASE_02.md` (формально N/A + статус CLOSED).
- **Minor закрыт:** в `deploy/HOST_DEPLOY_README.md` уточнён scope, добавлен блок **«Не путать с HLS `apps/media-worker`»** под systemd Worker: `bersoncarebot-worker-prod` / `pnpm worker:*` = только integrator; `apps/media-worker` — отдельный процесс и команды; production unit для media-worker не смешивать с integrator и зафиксировать при выкате в `SERVER CONVENTIONS.md`.

**Контур HLS vs webapp (phase-02)**

- **`apps/webapp/src/app/api`:** нет `spawn` / `ffmpeg` / `child_process` — транскод HLS в HTTP handlers Next.js **не** выполняется; только `POST .../media-transcode/enqueue` (БД).
- **Legacy:** FFmpeg для **превью** библиотеки по-прежнему в `apps/webapp/src/infra/repos/mediaPreviewWorker.ts`, вызываемый из **`POST /api/internal/media-preview/process`** (лёгкий батч по cron) — вне scope изоляции HLS phase-02, но не путать с `apps/media-worker`.

**Проверки (на окружении агента)**

- `pnpm run ci` (lint, typecheck, `pnpm test`, `pnpm test:webapp`, `pnpm test:media-worker`, build integrator + webapp, audit) — успешно после правок документации.

---

## 2026-05-03 — Phase 02 (transcode queue + `apps/media-worker`)

**Сделано**

- Таблица **`media_transcode_jobs`** (Drizzle `mediaTranscodeJobs` + миграция `0019`): статусы `pending|processing|done|failed`, `attempts`, `locked_at` / `locked_by`, `last_error`, `next_attempt_at`, FK на `media_files`, частичный **уникальный** индекс на `(media_id)` для активных job, индекс выборки pending.
- Ключ **`video_hls_pipeline_enabled`** в `ALLOWED_KEYS` + **`ADMIN_SCOPE_KEYS`**, seed в миграции `0019` (`value: false`); зеркальный INSERT в integrator `20260503_0001_video_hls_pipeline_enabled_setting.sql`.
- Webapp: **`POST /api/internal/media-transcode/enqueue`** (Bearer `INTERNAL_JOB_SECRET`, body `{ mediaId }`), проверка флага через `getConfigBool`, логика **`enqueueMediaTranscodeJob`** в `pgMediaTranscodeJobs.ts`, фасад `app-layer/media/mediaTranscodeJobs.ts` — без FFmpeg в route.
- Пакет **`apps/media-worker`**: poll + `FOR UPDATE SKIP LOCKED` claim, reclaim зависших `processing`, FFmpeg `spawn` (HLS VOD + poster), скачивание источника / загрузка артефактов в S3, **HeadObject** master перед `video_processing_status=ready`, retry/backoff и финальный `failed` по лимиту попыток; чтение флага из **`system_settings`** (idle при `false`).
- Корневой **`pnpm-workspace.yaml`** и скрипт **`test:media-worker`** в корневом `package.json`; **`ci`** включает прогон тестов media-worker.

**Проверки (на окружении агента)**

- `pnpm --dir apps/media-worker typecheck`, `pnpm --dir apps/media-worker test`
- `pnpm --dir apps/webapp lint`, `typecheck`, `test` (включая новые тесты enqueue + `pgMediaTranscodeJobs`)
- `pnpm run ci` (полный барьер)

**Явно не делали (вне phase-02)**

- Auto-enqueue после multipart confirm (phase-06 / политика флагов).
- Playback HLS / смена `GET /api/media/[id]` (последующие фазы).
- systemd unit на хосте (после подтверждения в SERVER CONVENTIONS).

---

## 2026-05-03 — AUDIT_PHASE_01 FIX (документация + проверки)

**Сделано**

- Закрыты minor из `AUDIT_PHASE_01.md`: выровнен `docs/VIDEO_HLS_DELIVERY/02-target-architecture.md` (§2 диаграмма, §5 модель) под CHECK миграции `0018` (`ready` = HLS готов).
- В `deploy/HOST_DEPLOY_README.md` добавлено правило порядка: Drizzle `migrate` до/вместе с билдом, расширяющим `SELECT` по `media_files`.
- Обновлён `AUDIT_PHASE_01.md` (секция FIX, статусы minor CLOSED).

**MP4 path**

- Подтверждено без правок коду: `GET /api/media/[id]` → `getMediaS3KeyForRedirect` → только `s3_key`.

**Проверки**

- `pnpm --dir apps/webapp lint`
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp test`

---

## 2026-05-03 — Phase 01 implementation (data model HLS foundation)

**Сделано**

- Drizzle-миграция `apps/webapp/db/drizzle-migrations/0018_media_files_hls_foundation.sql`: nullable-колонки на `public.media_files` для статуса транскода, ключей HLS/постера, длительности, `available_qualities_json`, override выдачи; CHECK на допустимые значения; частичный индекс по `video_processing_status` для `video/%`.
- Обновлён `apps/webapp/db/schema/schema.ts` (таблица `mediaFiles`).
- Расширены `MediaRecord` и парсеры в `apps/webapp/src/modules/media/videoHlsFields.ts`; список и `getById` в `s3MediaStorage` отдают новые поля (пока из БД всё NULL).
- Документация: `apps/webapp/src/modules/media/media.md`, `apps/webapp/src/app/api/api.md`.

**Явно не делали (по phase-01)**

- Транскодинг, playback API, изменение `GET /api/media/[id]`.

**Проверки**

- `pnpm --dir apps/webapp lint`, `typecheck`, `test` (на окружении агента).

---

## 2026-04-10 — Коммит и push (этап A завершён)

- Коммит `docs: add VIDEO_HLS_DELIVERY plan for HLS dual delivery migration` на ветку `main`.
- Локально выполнен полный `pnpm run ci` (lint, typecheck, test, test:webapp, build, audit) — успешно.
- `git push origin main` выполнен.

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
