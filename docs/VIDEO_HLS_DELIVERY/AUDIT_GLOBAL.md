# Глобальный аудит — VIDEO_HLS_DELIVERY (фазы 01–10)

**Дата аудита:** 2026-05-03  
**Дата global fix (репозиторий):** 2026-05-03  
**Дата независимого финального аудита (code review):** 2026-05-03  
**Дата закрытия IA-1 / IA-2 (репозиторий):** 2026-05-03  
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
| MANDATORY FIX INSTRUCTIONS с severity | **Сводка ниже** |

**Вывод:** инициатива по коду playback/HLS и production-пути для **`apps/media-worker`** в состоянии **PASS** по репозиторию: **FIND-P08-1** закрыт; независимые **IA-1** (systemd + deploy) и **IA-2** (валидация `video_default_delivery`) закрыты кодом и документацией от **2026-05-03**. Подпись на конкретном хосте (обновлённый sudoers под новый unit, первый deploy с новым unit) — **ops**.

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
| `apps/webapp/src/app/api/api.md` | Актуален |
| [06-execution-log.md](./06-execution-log.md) | Ведётся |
| [07-post-documentation-implementation-roadmap.md](./07-post-documentation-implementation-roadmap.md) | Актуализирован (§ инфраструктура после global fix) |
| [03-rollout-strategy.md](./03-rollout-strategy.md) | §4 — канон имён в `types.ts` |

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

### INFO / DEFER (не блокируют merge)

| Тема | Решение |
|------|---------|
| Кэш `getConfigValue` до **60 с** при чистом SQL-откате | **INFO** — задокументировано; предпочитать админку (`invalidateConfigKey`) |
| Нет встроенного UI-dashboard по `playback_resolved` | **DEFER** — вне scope; агрегация во внешних логах (обоснование: phase-08 observability = structured logs) |
| Preview / intake `presignGetUrl` с дефолтом SDK vs playback TTL | **DEFER** — отдельная продуктовая политика ([AUDIT_PHASE_09](./AUDIT_PHASE_09.md) P09-1) |
| Bucket policy private на хосте | **DEFER (ops)** — чеклист в S3 execution log; выполнение на prod |
| CI-бенчмарк watermark wall-time | **DEFER (docs)** — [PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md); ops опционально |
| Один `SELECT` watermark на job | **ACCEPT** — см. [AUDIT_PHASE_10.md](./AUDIT_PHASE_10.md) |
| Playwright E2E patient playback | **DEFER** — нет инфраструктуры в репо ([AUDIT_PHASE_05](./AUDIT_PHASE_05.md)) |
| Приоритет очереди `pending_backfill` | **DEFER** — вне v1 ([AUDIT_PHASE_07](./AUDIT_PHASE_07.md)) |

**Prescriptive MF (phase-09 / phase-10)** — без изменений; см. профильные `AUDIT_PHASE_09.md`, `AUDIT_PHASE_10.md`.

---

## 9) Рекомендации по исправлению (independent final audit) — **выполнено в репозитории (2026-05-03)**

IA-1 и IA-2 закрыты (см. §8 и [06-execution-log.md](./06-execution-log.md)). На production-хосте оператору остаётся при необходимости обновить sudoers по [`deploy/sudoers-deploy.example`](../../deploy/sudoers-deploy.example) и выполнить один деплой, чтобы unit попал в `/etc/systemd/system/`.

---

**Исторический текст задач (до фикса):**

1. ~~Закрыть IA-1~~ — unit `bersoncarebot-media-worker-prod.service`, сборка в `deploy-prod`, restart + `is-active`.
2. ~~Закрыть IA-2~~ — валидация `video_default_delivery`, тесты, `api.md`.

---

## Definition of Done (инициатива 01–10 в репозитории)

1. Фазы **01–10** отражены в [06-execution-log.md](./06-execution-log.md) и **AUDIT_PHASE_XX.md**.
2. MP4 и fallback консистентны по тестам playback.
3. FFmpeg HLS в **`apps/media-worker`**; API routes без транскода.
4. Контракт playback и **`expiresInSeconds`** из **`system_settings`**.
5. Phase-08 **FIND-P08-1** закрыт в репозитории (§ Repo acceptance); ops sign-off на среде — отдельно.
6. Закрыты открытые findings независимого аудита: **IA-1 (Major)**, **IA-2 (Minor)**.

---

**Следующее обновление:** при смене контракта playback, ключей `system_settings`, или по результатам ops sign-off (дата + ссылка на runbook).
