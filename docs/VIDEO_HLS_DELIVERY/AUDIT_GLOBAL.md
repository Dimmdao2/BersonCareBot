# Глобальный аудит — VIDEO_HLS_DELIVERY (фазы 01–10)

**Дата аудита:** 2026-05-03  
**Дата global fix (репозиторий):** 2026-05-03  
**Дата независимого финального аудита (code review):** 2026-05-03  
**Дата закрытия IA-1 / IA-2 (репозиторий):** 2026-05-03  
**Дата EXTRA audit closure (batch 2 — метрики playback / retention):** 2026-05-03  
**Дата post-fix closure (batch 3 — preview cache TTL / тесты):** 2026-05-03  
**Область:** завершённые фазы **phase-01 … phase-10** после циклов **EXEC → AUDIT → FIX** по [07-post-documentation-implementation-roadmap.md](./07-post-documentation-implementation-roadmap.md).  
**Источники:** `AUDIT_PHASE_01.md` … `AUDIT_PHASE_10.md`, [06-execution-log.md](./06-execution-log.md), [00-master-plan.md](./00-master-plan.md), [03-rollout-strategy.md](./03-rollout-strategy.md), [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md), `apps/webapp/src/app/api/api.md`, кодовые модули playback / media-worker.

---

## Итоговый вердикт

| Критерий | Статус |
|----------|--------|
| Цикл EXEC / AUDIT / FIX и закрытие gate по фазам | **PASS** — репозиторные артефакты для phase-08 gate: [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) § Repo acceptance |
| MP4 fallback и прямой `GET /api/media/[id]` | **PASS** |
| Тяжёлая работа вне request path webapp | **PASS** (с оговоркой про легаси preview в webapp) |
| Контракт playback ↔ фронтенд | **PASS** |
| Rollout / rollback задокументированы | **PASS (док)**; живая репетиция rollback на staging / audit bucket — **ops** (не дефект кода) |
| Runtime-политики: env vs DB | **PASS** |
| Синхронизация документации | **PASS** (после global fix) |
| Независимый финальный code review (infra/operability) | **PASS** — IA-1 / IA-2 закрыты в репозитории (2026-05-03): см. §8 |
| EXTRA audit + post-fix (метрики playback, dedup, Drizzle, retention, preview cache TTL, тесты) | **CLOSED (repo, batch 3)** — см. §8 чеклист и [AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md) |
| MANDATORY FIX INSTRUCTIONS с severity | **Сводка ниже** |

**Вывод:** инициатива по коду playback/HLS и production-пути для **`apps/media-worker`** в состоянии **PASS** по репозиторию: **FIND-P08-1** закрыт; независимые **IA-1** (systemd + deploy) и **IA-2** (валидация `video_default_delivery`) закрыты кодом и документацией от **2026-05-03**; цикл **EXTRA / post-fix** (batch 2–3) по метрикам playback и смежным докам — **CLOSED в repo**. Подпись на конкретном хосте (sudoers/media-worker unit, **cron** retention playback-stats по **HOST_DEPLOY**) — **ops**.

---

## 1) Последовательность фаз, EXEC / AUDIT / FIX, gate

**Последовательность выполнения работ**

- [06-execution-log.md](./06-execution-log.md) фиксирует внедрение и FIX в порядке **01 → 02 → … → 10** без перескоков «фаза N+2 до N».
- Граф зависимостей в [00-master-plan.md](./00-master-plan.md) допускает параллель **02 и 03** после **01**; фактическая история в execution log — **линейная** (02 затем 03), что **строже** минимальных зависимостей.

**Артефакты AUDIT**

- Для каждой фазы **01–10** существует файл **`AUDIT_PHASE_XX.md`**.

**Gate phase-08**

- [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md): техника **PASS**; **FIND-P08-1** — **CLOSED (repo)** см. § Repo acceptance.

**Вердикт §1:** **PASS.**

---

## 2) MP4 fallback на всех этапах

Проверка по сводке аудитов и коду:

| Тема | Статус |
|------|--------|
| `GET /api/media/[id]` → presigned исходный `s3_key` | Сохранён; phase-01/03/04/08/09 подтверждают отсутствие подмены HLS на уровне redirect |
| JSON playback: всегда `mp4.url` = `/api/media/{id}` для видео | [`playbackPayloadTypes.ts`](../../apps/webapp/src/modules/media/playbackPayloadTypes.ts), резолверы |
| HLS не готов / presign master падает | `delivery` / `fallbackUsed` — покрыто тестами (`playbackResolveDelivery.test.ts`, `playback/route.test.ts`) |
| Клиент: один авто HLS→MP4, refetch, «Повторить» | [AUDIT_PHASE_05.md](./AUDIT_PHASE_05.md), patient player |

**Вердикт §2:** **PASS.**

---

## 3) Тяжёлая работа: только `apps/media-worker`; webapp request path лёгкий

**Соблюдено**

- Транскод HLS (FFmpeg `spawn`, загрузка артефактов) — **`apps/media-worker`** ([AUDIT_PHASE_02.md](./AUDIT_PHASE_02.md)).
- `apps/webapp/src/app/api/**/*.ts`: **нет** `ffmpeg` / `spawn` / `child_process` (контрольный grep на `apps/webapp/src/app/api`).
- `POST /api/internal/media-transcode/enqueue` только ставит job в БД.

**Оговорка (не отменяет требование HLS)**

- Легаси **превью библиотеки** может использовать FFmpeg в **`apps/webapp`** — вне scope изоляции HLS; на **пациентский playback path** не влияет ([06-execution-log.md](./06-execution-log.md), phase-02).

**Вердикт §3:** **PASS** для цели инициативы (HLS pipeline и playback).

---

## 4) Согласованность Playback API и фронтенда (delivery / mp4 / hls / fallback / expires)

| Поле / поведение | Источник истины |
|------------------|-----------------|
| `delivery`, `hls`, `mp4`, `fallbackUsed` | `resolveVideoPlaybackDelivery` + `resolveMediaPlaybackPayload`; тип **`MediaPlaybackPayload`** |
| `expiresInSeconds` | **`getVideoPresignTtlSeconds()`** → `system_settings.video_presign_ttl_seconds`; синхронно с presign в **`GET /api/media/[id]`** |
| Документация HTTP | `apps/webapp/src/app/api/api.md` — согласовано с миграциями **`0022`**, **`0023`** |

**Вердикт §4:** **PASS.**

---

## 5) Rollout и rollback

| Артефакт | Содержание |
|----------|------------|
| [03-rollout-strategy.md](./03-rollout-strategy.md) | Фазы выкатки, флаги, canonical ключи → `types.ts` |
| [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) | Rollback: админка или SQL + зеркало integrator; кэш читателя конфига до **60 с** |
| Phase-10 | [PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md) |
| Phase-09 | Bucket / ACL — чеклист в `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` |

**Вердикт §5:** **PASS (док)** + **ops** для исполнения чеклистов на хосте.

---

## 6) Runtime-настройки и правила env vs DB

Ключи в **`ALLOWED_KEYS`** (`apps/webapp/src/modules/system-settings/types.ts`):

- `video_hls_pipeline_enabled`, `video_hls_new_uploads_auto_transcode`, `video_playback_api_enabled`, `video_default_delivery`, `video_presign_ttl_seconds`, `video_watermark_enabled`.

**Вердикт §6:** **PASS.**

---

## 7) Синхронизация документации

| Документ | Статус |
|----------|--------|
| `apps/webapp/src/app/api/api.md` | **Актуален** — playback metrics, preview TTL, internal retention |
| [06-execution-log.md](./06-execution-log.md) | **Ведётся** — записи closure / EXTRA / post-fix (2026-05-03) |
| [07-post-documentation-implementation-roadmap.md](./07-post-documentation-implementation-roadmap.md) | **Актуализирован** (§ инфраструктура после global fix) |
| [03-rollout-strategy.md](./03-rollout-strategy.md) | **Актуален** — §4 канон имён в `types.ts` |
| [AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md) | **CLOSED (repo, batch 3)** — см. §8 post-closure |
| [deploy/HOST_DEPLOY_README.md](../../deploy/HOST_DEPLOY_README.md) | **Актуален** — retention cron, `INTERNAL_JOB_SECRET` для playback-stats |
| [S3_PRIVATE_MEDIA_EXECUTION_LOG.md](../REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md) | **Актуален** — § Private bucket policy |

**Вердикт §7:** **PASS.**

---

## 8) Сводка MANDATORY FIX INSTRUCTIONS (по severity)

### Critical

- Открытых **Critical** нет (**N/A → CLOSED**).

### Major

| ID / источник | Суть | Статус |
|---------------|------|-------------------------|
| **IA-1 (independent, 2026-05-03)** | Отдельный systemd unit и lifecycle для `apps/media-worker` в deploy/bootstrap. | **CLOSED (repo, 2026-05-03)** — `deploy/systemd/bersoncarebot-media-worker-prod.service`, `deploy/host/deploy-prod.sh`, `deploy/host/bootstrap-systemd-prod.sh`, `deploy/sudoers-deploy.example`, `deploy/HOST_DEPLOY_README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md` |
| **FIND-P08-1** | Количественный / Safari gate | **CLOSED (repo)** — [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) § Repo acceptance; [AUDIT_PHASE_08.md](./AUDIT_PHASE_08.md) обновлён |
| **MF-1 … MF-5** ([AUDIT_PHASE_08.md](./AUDIT_PHASE_08.md)) | Правила для будущих PR (fallback, откат, gate `hls`, observability, integrator) | **REFERENCE** — не дефекты; соблюдать при изменениях playback |

### Minor

- **IA-2 (independent, 2026-05-03):** `video_default_delivery` в `PATCH /api/admin/settings` — строгая enum-валидация `mp4` \| `hls` \| `auto` (**400** `invalid_value`). **CLOSED (repo, 2026-05-03)** — `apps/webapp/src/app/api/admin/settings/route.ts`, `route.test.ts`, `apps/webapp/src/app/api/api.md`.

### INFO / DEFER / решения проекта (не блокируют merge)

| Тема | Решение |
|------|---------|
| Кэш `getConfigValue` до **60 с** при чистом SQL-откате | **INFO** — задокументировано; предпочитать админку (`invalidateConfigKey`) |
| Нет встроенного UI-dashboard по `playback_resolved` | **CLOSED (repo)** — блок **«Воспроизведение видео»** в **Здоровье системы** (`GET /api/admin/system-health` → `videoPlayback`), агрегаты в **`media_playback_stats_hourly`** |
| Preview / intake presign TTL vs playback TTL | **CLOSED (repo)** — `getVideoPresignTtlSeconds()` для preview redirect и intake file attachments |
| Bucket policy private на хосте | **CLOSED (док)** — чеклист и проверка без анонимного чтения: [S3_PRIVATE_MEDIA_EXECUTION_LOG.md](../REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md) § Private bucket policy |
| Уникальные пары пользователь+видео (дашборд) | **CLOSED (repo)** — `media_playback_user_video_first_resolve`, KPI **uniquePlaybackPairsFirstSeenInWindow** в system-health |
| Ретенция `media_playback_stats_hourly` | **CLOSED (repo)** — `POST /api/internal/media-playback-stats/retention`, Drizzle purge; **ops:** cron по примеру в [HOST_DEPLOY_README.md](../../deploy/HOST_DEPLOY_README.md) |
| Preview fallback redirect: cache-control vs TTL presign | **CLOSED (repo, batch 3)** — redirect не кэшируется дольше `video_presign_ttl_seconds` |
| Корневые скрипты `ci:resume:after-*` (ускорение после падения CI) | **CLOSED (repo)** — `package.json`, `.cursor/rules/pre-push-ci.mdc`, `README.md` |
| CI-бенчмарк watermark wall-time | **TODO (docs)** — [PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md) § TODO benchmark backlog; ops опционально |
| Один `SELECT` watermark на job | **ACCEPT** — см. [AUDIT_PHASE_10.md](./AUDIT_PHASE_10.md) |
| Playwright E2E patient playback | **NOT PLANNED** — решение проекта; при необходимости ручной/API smoke ([AUDIT_PHASE_05](./AUDIT_PHASE_05.md)) |
| Приоритет очереди `pending_backfill` | **DOC (portability)** — для текущего продукта приемлемо; при копировании модуля см. [`apps/media-worker/README.md`](../../apps/media-worker/README.md) ([AUDIT_PHASE_07](./AUDIT_PHASE_07.md)) |

**Prescriptive MF (phase-09 / phase-10)** — без изменений; см. профильные `AUDIT_PHASE_09.md`, `AUDIT_PHASE_10.md`.

### Post-closure audit (batch playback metrics / TTL / docs)

Сверка реализации закрытия пунктов §8 (дашборд playback, TTL, bucket-док и т.д.) с чек-листами плана и backlog улучшений: **[AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md)** (revision **2026-05-03** — тесты probe/upsert, UI подписи, HOST_DEPLOY → S3; **batch 2** — Drizzle‑агрегаты, счётчик **uniquePlaybackPairsFirstSeenInWindow**, UX без ложных нулей при выключенном playback API, internal retention почасового агрегата; **batch 3** — post-fix: alignment cache-control preview redirect с TTL подписи + недостающее тестовое покрытие retention/aggregator route/service). Вердикт §1–§7 и статусы CLOSED в таблице §8 **не отменяются**; документ описывает дополнительные тесты, уточнение смысла метрик и оставшиеся ops‑шаги (cron retention).

**Чеклист EXTRA / post-fix (репозиторий — выполнено):**

- [x] Почасовые агрегаты `media_playback_stats_hourly` + запись из `resolveMediaPlaybackPayload`
- [x] Дедуп уникальных пар пользователь+видео `media_playback_user_video_first_resolve` + KPI в system-health
- [x] Агрегация метрик playback в admin health через **Drizzle** (`loadAdminPlaybackHealthMetrics`)
- [x] При выключенном `video_playback_api_enabled` — без запросов к `media_playback_*` в probe; UI без «живых» нулей (**playback_disabled**)
- [x] Internal retention `POST /api/internal/media-playback-stats/retention` + документированный cron в **HOST_DEPLOY**
- [x] TTL preview redirect / intake — `getVideoPresignTtlSeconds`; **fix** cache-control redirect preview не дольше TTL подписи (batch 3)
- [x] Тесты: upsert hourly stats, probe videoPlayback, dedup insert, adminPlaybackHealthMetrics, playbackHourlyRetention, retention route
- [ ] **Ops (не в коде):** включить cron retention на production-хосте по примеру из **HOST_DEPLOY**

---

## 9) Рекомендации по исправлению (independent final audit) — **выполнено в репозитории (2026-05-03)**

IA-1 и IA-2 закрыты (см. §8 и [06-execution-log.md](./06-execution-log.md)). На production-хосте оператору остаётся при необходимости обновить sudoers по [`deploy/sudoers-deploy.example`](../../deploy/sudoers-deploy.example) и выполнить один деплой, чтобы unit попал в `/etc/systemd/system/`.

---

**Исторический текст задач (до фикса):**

1. ~~Закрыть IA-1~~ — unit `bersoncarebot-media-worker-prod.service`, сборка в `deploy-prod`, restart + `is-active`.
2. ~~Закрыть IA-2~~ — валидация `video_default_delivery`, тесты, `api.md`.

---

## Definition of Done (инициатива 01–10 в репозитории)

- [x] Фазы **01–10** отражены в [06-execution-log.md](./06-execution-log.md) и **AUDIT_PHASE_XX.md**.
- [x] MP4 и fallback консистентны по тестам playback.
- [x] FFmpeg HLS в **`apps/media-worker`**; API routes без транскода.
- [x] Контракт playback и **`expiresInSeconds`** из **`system_settings`**.
- [x] Phase-08 **FIND-P08-1** закрыт в репозитории (§ Repo acceptance); ops sign-off на среде — отдельно.
- [x] Закрыты открытые findings независимого аудита: **IA-1 (Major)**, **IA-2 (Minor)**.
- [x] Дополнительные пункты §8 INFO/DEFER (dashboard playback, TTL preview/intake, bucket policy checklist) — закрыты по [06-execution-log.md](./06-execution-log.md) и **[AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md](./AUDIT_EXTRA_PLAYBACK_METRICS_CLOSURE.md)** (batch 2–3).
- [ ] Ops-only: при необходимости — cron `media-playback-stats/retention` на хосте, sudoers/media-worker unit по **HOST_DEPLOY** (не блокер вердикта repo).

---

**Следующее обновление:** при смене контракта playback, ключей `system_settings`, или по результатам ops sign-off (дата + ссылка на runbook).
