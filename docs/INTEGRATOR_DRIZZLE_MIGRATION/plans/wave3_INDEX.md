# Wave 3 — финальный closeout (raw SQL tail ↓ / Drizzle + Zod / legacy cutover)

**Статус:** in progress (2026-06-06) — фазы **00**, **08**, **09**, **10**, **11**, **12**, **13**, **14**, **15**, **16** completed; далее **17**
**Предшественник:** Wave 2 этапы 1–8 **completed**  
**Решения до старта:** [wave3_DECISIONS.md](./wave3_DECISIONS.md) (DoR закрыт фазой 00)

## Цель Wave 3

1. Integrator P1+ (**done**, фаза 09), media-worker IX (**done**, фаза 10), app-layer/auth tail (**done**, фаза 11), intake/purge/identity (**done**, фаза 12), booking/doctor (**done**, фаза 13), comms/projection (**done**, фаза 14), webapp long-tail (**done**, фаза 15), legacy cutover (**done**, фаза 16) — закрыты; далее closeout (**17**).
2. Убрать необъяснённый **`pool.query` / `client.query`** в webapp runtime (Class **A**), либо перевести в Class **B/C** с ADR.
3. Убрать потребность в регулярном `migrate:legacy` для webapp, если после фаз 09–15 не осталось raw-SQL/migration причин держать legacy runner в regular flow.
4. Синхронизировать **RAW_SQL_INVENTORY**, **DRIZZLE_TRANSITION_PLAN**, **LOG**; закрыть инициативу или явный backlog с причинами.
5. Для переносимых DB-участков в фазах 09–15: обязательный слой валидации через **Zod**.
6. До Drizzle-миграции хвостов integrator убрать/перенести дубли, которые после unified DB должны жить в `public`.

## Зафиксированные решения до старта

- Webapp scope: **полный closeout** runtime-файлов `apps/webapp/src` (без тестов), не top-N.
- `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts`: мигрируем в фазе 15 (Drizzle executor + Zod), не оставляем permanent C.
- media-worker: **без** shared schema package; только minimal executor в фазе 10.
- Staging smoke из `LOG.md` L182: обязательный gate перед closeout; без него Wave 3 остаётся blocked.
- `rubitimeApiThrottle`: throttle-row read/update переводим на Drizzle session на том же client (Class B).
- Google Calendar SQL: полностью в фазе 09.
- PR policy: **1 PR = 1 фаза**; после закрытия фазы 00 исключение `00+09` не применяется.
- Owner decisions: `public` = canonical business data; `integrator` = technical state only; duplicate `integrator` data may be disabled/removed after senior review + owner approval.
- Добавлена фаза 16: условный legacy migrations cutover + policy cleanup.
- Добавлена фаза 08: integrator schema reduction до P1+ Drizzle-работ; destructive DB actions require senior-agent review, owner approval, backup/rollback plan.

## Фазы (порядок исполнения)

| # | Файл плана | Размер | Область | PR |
|---|------------|--------|---------|-----|
| 00 | [wave3_phase_00_baseline_adr.plan.md](./wave3_phase_00_baseline_adr.plan.md) | S | Baseline `rg`, Class A/B/C, ADR permanent zones | docs (**done** 2026-06-05) |
| 08 | [wave3_phase_08_integrator_schema_reduction.plan.md](./wave3_phase_08_integrator_schema_reduction.plan.md) | L | Убрать/перенести дубли integrator после unified DB | 1 (**done** 2026-06-06) |
| 09 | [wave3_phase_09_integrator_p1plus.plan.md](./wave3_phase_09_integrator_p1plus.plan.md) | M | Integrator P1+ (декомпозиция 09A-09E) | 1 (**done** 2026-06-06) |
| 10 | [wave3_phase_10_media_worker_ix.plan.md](./wave3_phase_10_media_worker_ix.plan.md) | M | media-worker IX (декомпозиция 10A-10C) | 1 (**done** 2026-06-06) |
| 11 | [wave3_phase_11_webapp_app_layer_auth.plan.md](./wave3_phase_11_webapp_app_layer_auth.plan.md) | S | app-layer health/media; auth TX tail; мелкие outliers | 1 (**done** 2026-06-06) |
| 12 | [wave3_phase_12_webapp_intake_purge_identity.plan.md](./wave3_phase_12_webapp_intake_purge_identity.plan.md) | L | intake/purge/identity (декомпозиция 12A-12E) | 1 (**done** 2026-06-06) |
| 13 | [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md) | L | booking/doctor (декомпозиция 13A-13E) | 1 (**done** 2026-06-06) |
| 14 | [wave3_phase_14_webapp_comms_projection.plan.md](./wave3_phase_14_webapp_comms_projection.plan.md) | L | comms/projection (декомпозиция 14A-14E) | 1 (**done** 2026-06-06) |
| 15 | [wave3_phase_15_webapp_long_tail.plan.md](./wave3_phase_15_webapp_long_tail.plan.md) | M | long tail (декомпозиция 15A-15F) | 1 (**done** 2026-06-06) |
| 16 | [wave3_phase_16_legacy_cutover.plan.md](./wave3_phase_16_legacy_cutover.plan.md) | M | webapp legacy migration dependency cutover (`migrate:legacy`) | 1 (**done** 2026-06-06) |
| 17 | [wave3_phase_17_closeout.plan.md](./wave3_phase_17_closeout.plan.md) | S | docs sync, staging smoke gate, full CI, archive | 1 |

**Итого:** ~8 code PR + 1 docs baseline + 1 closeout (или baseline+09 в одном PR по согласованию).

## Рабочая декомпозиция внутри фаз

- **09A:** settings/config foundation (`public.system_settings` helper + Zod)
- **09B:** simple repos batch
- **09C:** complex repos batch (idempotency/adminStats/branchTimezone/patientHomeMorningPing)
- **09D:** Google Calendar batch
- **09E:** rubitime throttle batch
- **10A:** media-worker preflight (инварианты + baseline)
- **10B:** runtime migration на minimal executor
- **10C:** staging smoke preparation pack (для фазы 17)
- **12A:** intake core (**done** 2026-06-06)
- **12B:** identity + phone bind (**done** 2026-06-06)
- **12C:** integrator-merge route thinness (**done** 2026-06-06)
- **12D:** purge + merge preview (**done** 2026-06-06)
- **12E:** phase verify (**done** 2026-06-06) — **фаза 12 closed**; post-audit tails: opt-in devDb smokes (`RUN_ONLINE_INTAKE_DEV_DB` / `RUN_PURGE_DEV_DB` / `RUN_MERGE_PREVIEW_DEV_DB`)
- **13A:** booking catalog (**done** 2026-06-06; `runWebappPgText`, devDb smoke `RUN_BOOKING_CATALOG_DEV_DB`)
- **13B:** patient bookings + doctor appointments (**done** 2026-06-06; Rubitime sync invariant preserved)
- **13C:** doctor clients + analytics (**done** 2026-06-06)
- **13D:** motivation + doctor tails (**done** 2026-06-06)
- **13E:** phase verify (**done** 2026-06-06) — **фаза 13 closed** (gate + 123 fast tests / 12 skipped + rubitime-sync 27); opt-in devDb: `RUN_BOOKING_CATALOG_DEV_DB` / `RUN_PATIENT_BOOKINGS_DEV_DB` / `RUN_DOCTOR_CLIENTS_DEV_DB` / `RUN_PG_DOCTOR_CLIENTS_APPOINTMENT_JOIN_DB` / `RUN_DOCTOR_ANALYTICS_DEV_DB` / `RUN_DOCTOR_PHASE_13D_DEV_DB`
- **14A:** support communication core (**done** 2026-06-06; `runWebappPgText`, repo tests, Zod list query, devDb `RUN_SUPPORT_COMMUNICATION_DEV_DB`; merge helper SQL → `runWebappPgText` on tx client)
- **14B:** user projection core (**done** 2026-06-06; `runWebappPgText`/`txPgText`; repo + devDb `RUN_USER_PROJECTION_DEV_DB`; Class C TX on upsert/appointment/phone/admin patch)
- **14C:** audit + legacy merge helpers (**done** 2026-06-06; `adminAuditLog.ts` → `runWebappPgText`; Class C TX on `upsertOpenConflictLog`; merge helper regression-only)
- **14D:** comms tail (**done** 2026-06-06; 6 repos → `runWebappPgText`; Class C TX on channel prefs preferred-auth + web-push save)
- **14E:** phase verify (**done** 2026-06-06) — **фаза 14 closed** (gate 10 files; Zod query modules; **119 passed** / 11 skipped)
- **15A:** references/settings/diary (**done** 2026-06-06; `runWebappPgText` + `runWebappTransaction`; gate 3 repo = 0; **33 passed** fast bundle)
- **15B:** auth/email ports tail (**done** 2026-06-06; 7 repos → `runWebappPgText`; merge bridge + `runWebappTransaction`; gate = 0; **52 passed** fast bundle)
- **15C:** treatment and minor tails (**done** 2026-06-06; 5 repos → `runWebappPgText`; `pgPhoneHistory` TX bridge; gate = 0; **26 passed** fast bundle)
- **15D:** integrator push outbox (**done** 2026-06-06; `integratorPushOutbox` → Drizzle; claim `execute(sql)`; gate `db.query` = 0; **22 passed** fast bundle)
- **15E:** messenger bind + routes tail (**done** 2026-06-06; `messengerPhoneHttpBindExecute` + route repos; gate = 0; **26 passed** fast bundle)
- **15F:** phase verify (**done** 2026-06-06; tail **25** runtime files Class B/C; closure bundle **93 passed**)
- **16:** legacy cutover (**done** 2026-06-06; `migrate:legacy` removed from implicit test bootstrap, CI regular path blocked, runner guard + Zod ledger parsing)

## Gate-контракт (как Wave 2)

1. Перед кодом: `rg` из phase-plan → сверка с RAW_SQL → запись в LOG.
2. Scope: только слой из плана; webapp `modules/*` без нового infra import.
3. Escape hatch: claim/advisory/dynamic SQL → Class B (`execute(sql)`) + тест семантики.
4. После: targeted tests + `rg` на остатки; не закрывать todo без проверки.
5. Отмена: `status: cancelled` + причина, не «потом».
6. Для всех DB-модулей, затронутых фазой: добавить/обновить Zod validation для JSON/input boundary.

## Зависимости фаз

- `00` — обязательный старт (docs baseline + ADR).
- `08` — обязательный перед `09`: сначала reduce/delete/move, потом Drizzle хвостов.
- `09A→09B→09C→09D→09E` — строго последовательно внутри фазы 09.
- `10A→10B→10C` — строго последовательно внутри фазы 10.
- `09` и `10` можно делать параллельно только после `08`.
- `11` — **done** (2026-06-06); `12` — **done** (2026-06-06); `13` — **done** (2026-06-06); `14` — **done** (2026-06-06); `15` — **done** (2026-06-06).
- `12A→12B→12C→12D→12E` внутри фазы 12.
- `13A→13B→13C→13D→13E` внутри фазы 13.
- `14A→14B→14C→14D→14E` внутри фазы 14.
- `15A→15B→15C→15D→15E→15F` внутри фазы 15.
- `12` → `13` → `14` → `15` идут последовательно (`15` closed).
- `16` стартует после `15`; по итогу `09–15` blocker не найден, regular flow закреплён как Drizzle-only, legacy оставлен manual/emergency.
- `17` — только после `00..16`, staging smoke gate и финального `pnpm run ci`.

## Связь с DRIZZLE_TRANSITION_PLAN фазами IX–X

| Старый номер | Wave 3 |
|--------------|--------|
| IX media-worker | Фаза **10** |
| X webapp + scripts | Фазы **11–15** + integrator scripts Class C в **00/17** |
