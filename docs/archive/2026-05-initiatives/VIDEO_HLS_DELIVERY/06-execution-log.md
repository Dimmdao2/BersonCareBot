# VIDEO HLS delivery — agent execution log

Журнал работы по подготовке пакета документации (миграция выдачи видео на HLS, dual delivery, без простоя).

Формат записей: новые сверху (после первой инициализации).

---

## 2026-05-03 — Post-fix audit: cache TTL alignment + missing tests closure

**Цель:** закрыть хвосты после post-closure аудита: устранить риск кэширования preview redirect дольше TTL presigned URL и добавить недостающее тестовое покрытие для новых playback-метрик/retention.

**Сделано**

- **Fix:** `GET /api/media/[id]/preview/[size]` — для fallback redirect на presigned preview `Cache-Control` теперь вычисляется от runtime TTL (`video_presign_ttl_seconds`) и не переживает подпись URL; `must-revalidate` добавлен явно.
- **Тесты:** добавлены `adminPlaybackHealthMetrics.test.ts`, `playbackHourlyRetention.test.ts`, `internal/media-playback-stats/retention/route.test.ts`; обновлён `preview/[size]/route.test.ts` под новый заголовок cache-control.
- **Аудит-доки:** обновлён `AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md` (batch 3 closure) и post-closure абзац в `AUDIT_GLOBAL.md`.

**Проверки**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/playbackStatsHourly.test.ts src/app-layer/media/playbackUserVideoFirstResolve.test.ts src/app-layer/media/adminPlaybackHealthMetrics.test.ts src/app-layer/media/playbackHourlyRetention.test.ts src/app/api/admin/system-health/route.test.ts src/app/api/media/[id]/preview/[size]/route.test.ts src/app/api/internal/media-playback-stats/retention/route.test.ts src/app/api/media/[id]/playback/route.test.ts` — **OK**.

---

## 2026-05-03 — Playback metrics batch 2: уникальные пары пользователь+видео, Drizzle, UX выкл API, retention

**Цель:** закрыть продуктовые решения и хвосты после [AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md) (batch 2).

**Сделано**

- **Дедуп уникальных просмотров (lifetime по паре):** таблица `media_playback_user_video_first_resolve`, запись после успешного видео-резолва (`playbackUserVideoFirstResolve.ts`), миграция `0027_…`; в админ‑дашборде поле **`uniquePlaybackPairsFirstSeenInWindow`** (сколько новых dedup‑строк с `first_resolved_at` за последние 24 ч UTC).
- **`media_playback_stats_hourly` агрегаты в probe:** Drizzle через `adminPlaybackHealthMetrics.ts` (без raw SQL в этом пути).
- **Выключенный playback API:** при `video_playback_api_enabled=false` probe не дергает `media_playback_*`; **`SystemHealthSection`** не показывает числовые ряды воспроизведения (**`playback_disabled`**).
- **Retention почасового агрегата:** `purgeStalePlaybackHourlyStats`, `POST /api/internal/media-playback-stats/retention` (Bearer `INTERNAL_JOB_SECRET`, `?dryRun=`, `?days=`, по умолчанию 90).
- **Док:** `apps/webapp/src/app/api/api.md`, `deploy/HOST_DEPLOY_README.md`, данный файл, **`AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md`**, абзац post-closure в **`AUDIT_GLOBAL.md`**.

**Проверки**

- `pnpm install --frozen-lockfile && pnpm run ci` — OK на дереве этого коммита.

---

## 2026-05-03 — Фиксы по AUDIT_EXTRA (тесты, UI, HOST_DEPLOY, api.md)

**Цель:** закрыть backlog из [AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md) (revision 2026-05-03).

**Сделано**

- **Тесты:** `playbackStatsHourly.test.ts` — мок Drizzle для `recordPlaybackResolutionStat` (insert/values/`onConflictDoUpdate`, повтор вызова, падение insert); `system-health/route.test.ts` — маршрутизация SQL в моке pool, кейс `video_playback_probe_failed`.
- **UI:** `SystemHealthSection` — пояснение, что считаются резолвы API (в т.ч. повторный HLS JSON), подсказка при выключенном playback API и нулевой статистике.
- **Док:** `deploy/HOST_DEPLOY_README.md` — ссылка на `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` § Private bucket policy; `api.md` — уточнение семантики `videoPlayback`.
- **Док инициативы:** обновлены [AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md), [README.md](./README.md) (строка таблицы), [AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md) (post-closure).

**Проверки**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/playbackStatsHourly.test.ts src/app/api/admin/system-health/route.test.ts` — OK.
- Полный `pnpm run ci` — выполнить на финальном дереве перед merge.

---

## 2026-05-03 — Аудит выполнения плана DEFER/INFO closure (чек-листы + пост-фактум риски)

**Цель:** подробная сверка с чек-листами внутреннего плана закрытия DEFER/INFO, поиск недоделок и неожиданных эффектов после правок.

**Результат**

- Отчёт и backlog экстра-этапа: **[AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md)**.
- Ключевые выводы: функциональное закрытие плана подтверждено; **пробелы чек-листа** — нет unit/integration теста на **upsert** в `playbackStatsHourly`, нет теста на **ошибку SQL** в probe `videoPlayback`; **семантика метрик** — считаются успешные резолвы API (включая повторный JSON для HLS по таймеру), а не «уникальные просмотры»; **HOST_DEPLOY** без явной перекрёстной ссылки на § Private bucket policy в `S3_PRIVATE_MEDIA_EXECUTION_LOG`; **ретенция** строк в `media_playback_stats_hourly` не задана.

**Проверки**

- Ревью кода и тестов по grep/read в каталогах `app-layer/media`, `api/admin/system-health`, `patient/content`, `deploy/HOST_DEPLOY_README.md`, `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`.

---

## 2026-05-03 — DEFER/INFO closure (system-health playback, TTL, docs) по плану

**Цель:** закрыть оставшиеся продуктовые и документные пункты из [AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md) §8: дашборд playback в «Здоровье системы», унификация TTL presign, документация приватного бакета, TODO benchmark watermark, README media-worker, статусы Playwright / backfill.

**Сделано**

- Таблица **`media_playback_stats_hourly`** + запись почасовых агрегатов из **`resolveMediaPlaybackPayload`** (`playbackStatsHourly.ts`); расширение **`GET /api/admin/system-health`** (`videoPlayback`) и UI **`SystemHealthSection`**.
- **`GET .../preview/[size]`** и intake attachments: presigned TTL из **`getVideoPresignTtlSeconds()`** (`video_presign_ttl_seconds`).
- Док: **`docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`** (§ Private bucket policy), **`PHASE_10_WATERMARK_POLICY.md`** (TODO benchmark backlog), **`apps/media-worker/README.md`** (очередь / porting), обновлён **`AUDIT_GLOBAL.md`** §8.
- **`apps/webapp/src/app/api/api.md`** — `videoPlayback`, preview TTL.

**Проверки**

- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

---

## 2026-05-03 — FIX independent audit (IA-1 Major, IA-2 Minor) по [AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md)

**Цель:** закрыть в репозитории открытые findings независимого финального аудита: production-path для **`apps/media-worker`** и валидацию **`video_default_delivery`**.

**Сделано**

- **IA-1 (Major):** unit **`bersoncarebot-media-worker-prod.service`** (`deploy/systemd/`); сборка `pnpm --dir apps/media-worker build` и **restart** + **`systemctl is-active`** в **`deploy/host/deploy-prod.sh`**; установка/enable в **`deploy/host/bootstrap-systemd-prod.sh`** при наличии `webapp.prod` и `dist/main.js`; строки в **`deploy/sudoers-deploy.example`**. Док: **`deploy/HOST_DEPLOY_README.md`** (§ HLS media-worker, список сервисов), **`docs/ARCHITECTURE/SERVER CONVENTIONS.md`** (units, порты при необходимости).
- **IA-2 (Minor):** в **`PATCH /api/admin/settings`** для ключа **`video_default_delivery`** — только **`mp4` \| `hls` \| `auto`** (trim + lower), иначе **400** `invalid_value`; тесты в **`route.test.ts`**; строка в **`apps/webapp/src/app/api/api.md`**.
- **[AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md):** вердикт **PASS**, IA-1 / IA-2 **CLOSED**, §9 помечен как выполненный в репозитории.

**Проверки**

- `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.test.ts` — **OK**.
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

**Ops (не автоматизировано в репо):** на production после merge — обновить sudoers по примеру, один деплой для установки unit в `/etc/systemd/system/`.

---

## 2026-05-03 — Global fix по [AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md)

**Цель:** закрыть в репозитории **Critical / Major** из глобального аудита; для **minor** — исправить документацию или явный defer.

**Сделано**

- **Critical:** подтверждено отсутствие открытых пунктов.
- **Major FIND-P08-1:** **CLOSED (repo)** — в [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) добавлен § **Repo acceptance** (SQL доли `hls_ready`, события логов `playback_resolved` / `playback_presign_failed`, ссылка на [BROWSER_SMOKE_PHASE05_CHECKLIST.md](./BROWSER_SMOKE_PHASE05_CHECKLIST.md)); обновлены итоговый verdict и таблица условий gate; [AUDIT_PHASE_08.md](./AUDIT_PHASE_08.md) — вердикт §1 и строка FIND-P08-1.
- **MF-1…MF-5 (phase-08):** классифицированы как **REFERENCE** в [AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md) (правила на будущие PR, не дефекты).
- **Minor:** [07-post-documentation-implementation-roadmap.md](./07-post-documentation-implementation-roadmap.md) — актуализирован § инфраструктура. Шаблон unit и интеграция в deploy/bootstrap для media-worker закрыты отдельной записью **2026-05-03 — FIX independent audit** (см. выше в этом журнале). [03-rollout-strategy.md](./03-rollout-strategy.md) §4 — канон ключей → `apps/webapp/src/modules/system-settings/types.ts`. [AUDIT_GLOBAL.md](./AUDIT_GLOBAL.md) — пересборка вердикта и таблица **Minor defer** (до закрытия IA-1/IA-2 отдельным циклом).

**Целевые проверки (без полного CI по задаче)**

- `pnpm --dir apps/webapp exec vitest run src/modules/media/playbackResolveDelivery.test.ts "src/app/api/media/[id]/playback/route.test.ts"` — **OK** (19 tests, 2 files).

**Pre-push**

- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

---

## 2026-05-03 — FIX AUDIT_PHASE_10 (defer P10-0 benchmark, rollback confirm)

**Сделано**

- **Critical / Major:** подтверждено **N/A → CLOSED** в [`AUDIT_PHASE_10.md`](./AUDIT_PHASE_10.md); открытых не было.
- **Minor P10-0:** **CLOSED (defer docs)** — секция **Benchmark wall-time (CI vs ops)** в [`PHASE_10_WATERMARK_POLICY.md`](./PHASE_10_WATERMARK_POLICY.md); CI-бенчмарк ffmpeg не вводился намеренно.
- **Minor P10-1:** **CLOSED (accept)** — один `SELECT` на job; кэш в воркере не добавлялся.
- **Rollback:** расширен **§ Rollback (безопасный)** в `PHASE_10_WATERMARK_POLICY.md` (админка/SQL, зеркало integrator, поведение новых vs существующих HLS, рестарт воркера).

**Повтор целевых проверок phase-10**

- `pnpm --dir apps/media-worker exec vitest run src/ffmpeg/watermarkVideoFilter.test.ts src/workerToolkit.test.ts`
- `pnpm install --frozen-lockfile && pnpm run ci`

**Проверки (на окружении агента)**

- `pnpm --dir apps/media-worker exec vitest run src/ffmpeg/watermarkVideoFilter.test.ts src/workerToolkit.test.ts` — **OK** (9 tests).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

---

## 2026-05-03 — Phase 10 (watermark optional, non-PII, perf doc)

**Сделано**

- **Ключ:** `video_watermark_enabled` (admin, default false) — `ALLOWED_KEYS`, `ADMIN_SCOPE_KEYS`, PATCH boolean в `route.ts`; миграция webapp **`0024_video_watermark_enabled.sql`** + journal; зеркало integrator **`20260507_0001_video_watermark_enabled.sql`**.
- **Admin UI:** карточка **HLS: watermark при транскоде** (`VideoHlsWatermarkSettingsSection.tsx`) во вкладке «Параметры приложения».
- **Worker:** уже реализовано — `drawtext` + `textfile`, строка **`id <uuid>`**; шрифт `MEDIA_WORKER_WATERMARK_FONT` или системный TTF; таймаут ffmpeg при watermark **min(1.45×, base+45m)**; лог **`transcode completed`** с полем `watermark`.
- **Док:** [`PHASE_10_WATERMARK_POLICY.md`](./PHASE_10_WATERMARK_POLICY.md) (PII, производительность, rollback); [`CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md); критерии phase-10 в [`phase-10-watermark-and-further-hardening.md`](./phases/phase-10-watermark-and-further-hardening.md).

**Целевые проверки фазы**

- Snapshot ffmpeg args: `pnpm --dir apps/media-worker exec vitest run src/ffmpeg/watermarkVideoFilter.test.ts src/workerToolkit.test.ts`
- Visual smoke: ручной рецепт в `PHASE_10_WATERMARK_POLICY.md` (кадр через ffmpeg или просмотр сегмента).

**Проверки (на окружении агента)**

- `pnpm --dir apps/media-worker exec vitest run src/ffmpeg/watermarkVideoFilter.test.ts src/workerToolkit.test.ts` — **OK** (9 tests).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

**Явно не делали**

- Отдельный job type / очередь только для watermark (в коде — тот же transcode job при включённом флаге).
- Per-user или session-scoped текст на кадре (вне политики non-PII).

---

## 2026-05-03 — FIX AUDIT_PHASE_09 (редокция presign в логах, ops checklist private bucket)

**Сделано**

- **Critical / Major:** в аудите не было открытых — зафиксировано **N/A → CLOSED** в `AUDIT_PHASE_09.md`.
- **Minor P09-0:** **`serializePresignFailureForLog`** и регулярное удаление http(s) из текста ошибки — `presignLogRedaction.ts`; подключено в **`resolveMediaPlaybackPayload`** и **`GET /api/media/[id]`**; тесты `presignLogRedaction.test.ts`.
- **Minor P09-1:** **DEFERRED (scope)** — preview/worker TTL отдельно от playback (как в аудите).
- **Minor P09-2:** **CLOSED (док)** — секция Revision phase-09 в `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`; исполнение на хосте — ops.
- **Env vs DB:** подтверждено — TTL playback только **`video_presign_ttl_seconds`** в БД, новых env нет.

**Повтор целевых проверок phase-09**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/presignLogRedaction.test.ts src/modules/system-settings/configAdapter.test.ts src/app/api/media/\[id\]/playback/route.test.ts src/app/api/media/\[id\]/route.test.ts`
- `pnpm install --frozen-lockfile && pnpm run ci`

**Проверки (на окружении агента)**

- Целевые vitest — **OK** (29 tests в объединённом прогоне phase-09).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

---

## 2026-05-03 — Phase 09 (presign TTL в `system_settings`, клиент при истечении URL)

**Сделано**

- **Ключ:** `video_presign_ttl_seconds` (admin) — `ALLOWED_KEYS`, `ADMIN_SCOPE_KEYS`, миграция webapp **`0023_video_presign_ttl_seconds.sql`** + journal; зеркало integrator **`20260506_0001_video_presign_ttl_seconds.sql`**.
- **`getConfigPositiveInt`** в `configAdapter.ts` — clamp в диапазон; **`getVideoPresignTtlSeconds`** (`app-layer/media/videoPresignTtl.ts`) + **`videoPresignTtlConstants.ts`** (без DB — безопасно для клиента).
- **Presign:** `resolveMediaPlaybackPayload` и **`GET /api/media/[id]`** используют один TTL; JSON playback поле **`expiresInSeconds`** синхронизировано.
- **Admin UI:** вкладка «Параметры приложения» — карточка **Приватное видео (S3)** (`VideoPrivateMediaSettingsSection.tsx`); валидация PATCH в **`route.ts`** (60…604800).
- **Клиент:** `PatientContentAdaptiveVideo` — таймер обновления playback до истечения TTL (~10% буфер, min 30 с); при fatal HLS / `error` на нативном HLS — сначала **refetch** playback, затем автопереход на MP4.
- **Док:** `apps/webapp/src/app/api/api.md`, `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

**Целевые проверки фазы**

- TTL unit: `configAdapter.test.ts` (clamp / NaN), `playback/route.test.ts` (presign + TTL), `media/[id]/route.test.ts` (redirect + TTL).
- Manual expiry / reload: пациентский плеер — повторный `GET .../playback` по таймеру и после ошибки до MP4 fallback; ручной smoke: уменьшить TTL в админке, дождаться окончания сессии просмотра — сессия должна подтянуть новые URL без полного reload страницы (при сбое — «Повторить»).

**Проверки (на окружении агента)**

- `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/configAdapter.test.ts src/app/api/media/\[id\]/playback/route.test.ts src/app/api/media/\[id\]/route.test.ts`
- `pnpm install --frozen-lockfile && pnpm run ci`

**Явно не делали**

- DRM / device binding (вне phase-09).
- Изменение TTL для preview route (`FALLBACK_REDIRECT_EXPIRES_SEC`) и internal preview worker — отдельная политика.

---

## 2026-05-03 — Phase 08 (default `video_default_delivery=auto` + gate doc)

**Сделано**

- **Gate:** [GATE_READINESS_PHASE_08.md](../GATE_READINESS_PHASE_08.md) — verdict: техника **PASS**, количественные/Safari пункты **PENDING (ops)**; rollback SQL + admin path; подтверждение: **`GET /api/media/[id]`** не менялся, MP4 progressive через `s3_key` сохраняется.
- **Миграции:** webapp **`0022_video_default_delivery_auto.sql`** + journal; integrator **`20260505_0001_video_default_delivery_auto.sql`** (upsert `auto`).
- **Код:** `resolveMediaPlaybackPayload` — fallback при отсутствии ключа в конфиге **`auto`** (согласовано с миграцией).
- **Док:** [phase-08-default-switch-to-hls.md](../phases/phase-08-default-switch-to-hls.md), [03-rollout-strategy.md](../03-rollout-strategy.md), [api.md](../../apps/webapp/src/app/api/api.md) (playback bullet).

**Целевые проверки фазы**

- Playback smoke: `pnpm --dir apps/webapp exec vitest run src/modules/media/playbackResolveDelivery.test.ts src/app/api/media/[id]/playback/route.test.ts`
- Rollback rehearsal: задокументирован в gate doc (оператор: установить `mp4` в админке или UPDATE); исполнение на staging — ops.

**Проверки (на окружении агента)**

- `pnpm --dir apps/webapp exec vitest run src/modules/media/playbackResolveDelivery.test.ts src/app/api/media/\[id\]/playback/route.test.ts` — **OK** (18 tests).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

**MP4**

- Прямой стрим MP4 не затронут; только стратегия JSON playback по умолчанию → приоритет HLS когда готов.

---

## 2026-05-03 — FIX AUDIT_PHASE_07 (статусы FINDING, док dry-run, тест enqueue throw)

**Сделано**

- **Critical / Major:** **N/A → CLOSED** в `AUDIT_PHASE_07.md`.
- **Minor FIND-P07-1:** **CLOSED** — уточнение dry-run vs read-only отчёт в `phases/phase-07-backfill-legacy-library.md` (секция «Тесты») и комментарий в `videoHlsLegacyBackfill.ts`.
- **Minor FIND-P07-2:** **DEFERRED** — `pending_backfill` / приоритет jobs вне v1 (как в аудите).
- **Minor FIND-P07-3:** **CLOSED (INFO)** — зафиксировано в `AUDIT_PHASE_07.md` (FIX): маркировка `failed` остаётся в media-worker.
- **Тест MF-3:** `videoHlsLegacyBackfill.test.ts` — кейс «enqueue throw → `enqueue.errors`», процесс не падает.

**Повтор целевых проверок phase-07**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/videoHlsLegacyBackfill.test.ts` — **OK** (8 tests).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

**MP4 playback**

- Не меняли `GET /api/media/[id]`; backfill не трогает presign исходного `s3_key`; worker не удаляет source MP4 при транскоде — см. блок MP4 в `AUDIT_PHASE_07.md` (FIX).

---

## 2026-05-03 — Phase 07 (backfill legacy video library → transcode jobs)

**Сделано**

- **Runner:** `src/app-layer/media/videoHlsLegacyBackfill.ts` — выбор кандидатов `video/%`, readable, `s3_key`, без готового HLS / без активной job; опции `includeFailed`, `cutoff`, лимиты, sleep между батчами, `maxSizeBytes`, dry-run без `enqueue`, guard `video_hls_pipeline_enabled` на `--commit` (обход: `--no-require-pipeline`).
- **CLI:** `scripts/video-hls-backfill-legacy.ts` + `package.json` → `pnpm --dir apps/webapp run video-hls-backfill-legacy` — dry-run по умолчанию, `--commit`, `--state-file` + `--reset-state` + `--cursor` (пауза/возобновление: state обновляется только при `--commit`), динамический import после bootstrap `SESSION_COOKIE_SECRET` для обхода полной инициализации Next env при `--help`.
- **Отчётность:** финальный JSON: `statusHistogram` (readable video по `video_processing_status`), `failedReasons` (топ ошибок), счётчики enqueue / `skippedOversized`.
- **Тесты:** `videoHlsLegacyBackfill.test.ts` — dry-run без enqueue, commit → enqueue, oversized skip, abort при выключенном pipeline.

**Целевые проверки фазы**

- Dry-run correctness: тест «dry-run does not call enqueue» + ручной smoke `pnpm exec tsx scripts/video-hls-backfill-legacy.ts --help`.
- Backfill smoke: unit-тесты enqueue-path и oversized с мок-пулом.

**Проверки (на окружении агента)**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/videoHlsLegacyBackfill.test.ts`
- `pnpm --dir apps/webapp typecheck`
- `pnpm run ci` — **OK** (exit 0)

**Сознательно не делали (v1)**

- Колонка `priority` в `media_transcode_jobs` и сортировка в worker (опционально в phase doc; FIFO `created_at`).

---

## 2026-05-03 — FIX AUDIT_PHASE_06 (статусы FINDING, тест 23505, повтор проверок)

**Сделано**

- **Critical / Major:** формально **N/A → CLOSED** в `AUDIT_PHASE_06.md` (открытых пунктов аудита не было).
- **Minor:** **CLOSED** — регрессионный тест **`enqueueMediaTranscodeJob`** на ветку **`23505`** (`pgMediaTranscodeJobs.test.ts`): при гонке двух INSERT остаётся одна логически активная job, ответ `alreadyQueued: true`; инвариант дубля подкреплён индексом `media_transcode_jobs_one_active_per_media` в `0019_media_transcode_jobs_queue.sql`.
- **Minor:** **DEFERRED** — единый ops-runbook (реплики worker, метрики очереди) до фиксации unit/строк в `SERVER CONVENTIONS.md`; продуктовые критерии — в phase-06 doc.
- Обновлён **`AUDIT_PHASE_06.md`** (секция FIX, команды целевых тестов).

**Повтор целевых проверок phase-06**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/mediaTranscodeAutoEnqueue.test.ts src/app/api/media/confirm/route.test.ts src/app/api/media/multipart/complete/route.test.ts src/infra/repos/pgMediaTranscodeJobs.test.ts` — **OK** (25 tests).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

**Duplicate jobs**

- DB: partial unique на `(media_id)` для `status IN ('pending','processing')`; app: pre-check + обработка `23505`.

---

## 2026-05-03 — Phase 06 (auto-enqueue transcode для новых video uploads)

**Сделано**

- Ключ **`video_hls_new_uploads_auto_transcode`** (admin, default `false`): `ALLOWED_KEYS`, `ADMIN_SCOPE_KEYS`, миграция webapp **`0021_video_hls_new_uploads_auto_transcode.sql`**, зеркало integrator **`20260504_0001_video_hls_new_uploads_auto_transcode.sql`**.
- **`maybeAutoEnqueueVideoTranscodeAfterUpload`** (`app-layer/media/mediaTranscodeAutoEnqueue.ts`): при **`video_hls_pipeline_enabled`** и **`video_hls_new_uploads_auto_transcode`** вызывает **`enqueueMediaTranscodeJob`** (идемпотентно, один активный job); иначе no-op; ошибки не пробрасываются.
- Хуки: **`POST /api/media/confirm`** — только после успешного **`confirmMediaFileReady`** (не при раннем `ready`); **`POST /api/media/multipart/complete`** — при **`finalized` / `already_done`**. Легаси: повтор confirm при уже **`ready`** не ставит job.
- Тесты: **`mediaTranscodeAutoEnqueue.test.ts`** (негатив выкл флагов), расширены **`confirm/route.test.ts`**, **`multipart/complete/route.test.ts`**; **`api.md`** — описание флагов.

**Проверки (на окружении агента)**

- `pnpm install --frozen-lockfile && pnpm run ci`

---

## 2026-05-03 — FIX AUDIT_PHASE_05 (чеклист браузера, тест режима источника, телеметрия в коде)

**Сделано**

- **Critical / Major (аудит):** Critical N/A; Major — **`BROWSER_SMOKE_PHASE05_CHECKLIST.md`** для ops-приёмки Chrome/Safari + MP4-only без URL в логе; на агенте прогнаны **целевые тесты phase-05** и полный **`pnpm run ci`**.
- **`initialPlaybackSourceKind`** + **`patientPlaybackSourceKind.test.ts`** — единая логика выбора HLS vs MP4 при старте и после «Повторить» (стабильность ветвления).
- **Minor:** телеметрия — комментарий в **`PatientContentAdaptiveVideo.tsx`**; паритет спиннера legacy — **defer**; Playwright — **defer**.

**MP4 fallback / UX ошибок (подтверждение по коду и тестам)**

- Один автопереход HLS→MP4 (`tryMp4Fallback` + ref), затем сообщение + **«Повторить»** (refetch playback); **destroy** hls в cleanup и при fatal.
- Юнит-тесты: `patientPlaybackSourceKind`, `nativeHls`, `playback/route`; smoke: `e2e/patient-playback-inprocess.test.ts`.

**Проверки (на окружении агента)**

- `pnpm install --frozen-lockfile && pnpm run ci`

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

- Закрыты **Critical / Major** в `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_02.md` (формально N/A + статус CLOSED).
- **Minor закрыт:** в `deploy/HOST_DEPLOY_README.md` уточнён scope, добавлен блок **«Не путать с HLS `apps/media-worker`»** под systemd Worker: `bersoncarebot-worker-prod` / `pnpm worker:*` = только integrator; `apps/media-worker` — отдельный процесс и команды; production unit для media-worker не смешивать с integrator и зафиксировать при выкате в `SERVER CONVENTIONS.md`.

**Контур HLS vs webapp (phase-02)**

- **`apps/webapp/src/app/api`:** нет `spawn` / `ffmpeg` / `child_process` — транскод HLS в HTTP handlers Next.js **не** выполняется; только `POST .../media-transcode/enqueue` (БД).
- **Legacy:** FFmpeg для **превью** библиотеки в `apps/webapp/src/infra/repos/mediaPreviewWorker.ts`: на prod предпочтительно cron **`pnpm run media-preview:tick`** (см. `deploy/HOST_DEPLOY_README.md`); опционально **`POST /api/internal/media-preview/process`** с Bearer — вне scope изоляции HLS phase-02; не путать с `apps/media-worker`.

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

- Закрыты minor из `AUDIT_PHASE_01.md`: выровнен `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/02-target-architecture.md` (§2 диаграмма, §5 модель) под CHECK миграции `0018` (`ready` = HLS готов).
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
