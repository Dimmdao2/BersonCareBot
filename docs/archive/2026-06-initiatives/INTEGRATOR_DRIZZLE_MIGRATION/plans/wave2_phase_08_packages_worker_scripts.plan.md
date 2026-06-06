---
name: Wave2 Phase08 Packages worker scripts
overview: Пакеты platform-merge и booking-rubitime-sync; apps/media-worker claim; ops-скрипты — унификация SQL в пакете, pg-only решения, revive guard, тесты.
status: completed
isProject: false
todos:
  - id: p08-packages
    content: "Под-PR A: packages/platform-merge — inventory + решение pg-only (merge tx); consumer-тесты без изменения API."
    status: completed
  - id: p08-booking-sync
    content: "Под-PR B: packages/booking-rubitime-sync — единый upsert/find/lookup; webapp pgPatientBookings делегирует; unit-тесты пакета + consumer."
    status: completed
  - id: p08-media-worker
    content: "Под-PR C: apps/media-worker — schema decision (pg-only + shared schema backlog); claim unit-тесты."
    status: completed
  - id: p08-scripts
    content: "Под-PR D: классификация webapp/integrator scripts — pg-only с причиной в LOG."
    status: completed
  - id: p08-verify
    content: "typecheck/test затронутых пакетов; lockfile vitest booking-rubitime-sync."
    status: completed
  - id: p08-post-audit
    content: "Post-audit + remarks closure: lookup/revive tests, integrator writePort contract, claim race, platform-merge gate, backfill→package, LOG/RAW_SQL построчно, full CI."
    status: completed
---

# Wave 2 — этап 8: пакеты, media-worker, скрипты

## Размер

**L** (накопительно по нескольким артефактам; выполнено под-PR A→B→C→D).

## Definition of Done

- [x] Для каждого затронутого пакета/приложения — зелёные typecheck/test в зоне изменений.
- [x] Ops-скрипты либо переведены, либо явно помечены как `pg`-only с причиной в LOG.
- [x] Нет новых env для интеграционных URL/ключей (правила репозитория).

## Scope

**Разрешено:** `packages/platform-merge`, `packages/booking-rubitime-sync`, `apps/media-worker`, `apps/webapp/scripts`, `apps/integrator/scripts` (точечно).

**Вне scope:** массовый рефакторинг без связи с SQL; изменение CI workflow.

## Примечание

Этот этап намеренно **последний**: максимум потребителей и операционных сценариев.

## Обязательная декомпозиция

Порядок: A `platform-merge` → B `booking-rubitime-sync` → C `media-worker` → D scripts.

## Декомпозиция исполнения

### A. `packages/platform-merge`

- [x] Inventory: `rg "query\\(" packages/platform-merge --glob "*.ts"` — **85** вызовов (`pgPlatformUserMerge.ts` 79 + bind/fallback).
- [x] Consumer gate (post-audit): webapp merge tests **44 passed** без изменения API.
- [x] Решение: **не Drizzle-мигрировать** в Wave 2 — полиморфная merge-транзакция, критичные данные; public API и consumers без изменений.
- [x] LOG + RAW_SQL_INVENTORY §4 с причиной.

### B. `packages/booking-rubitime-sync`

- [x] Inventory: `upsertPatientBookingFromRubitime`, `findExistingPatientBookingForRubitime`, `lookupBranchServiceByRubitimeIds`, `shouldSkipNativeReviveUpdate`.
- [x] Webapp + integrator: find/revive guard → upsert с `existingRow`; удалён дубль `rubitimeBranchServiceLookup.ts`.
- [x] Backfill `backfill-rubitime-compat-snapshots.ts` — catalog lookup через пакет.
- [x] `compatSyncQuality` re-export из пакета.
- [x] Unit-тесты пакета (**27 passed**) + consumer `pgPatientBookings.test.ts` (**19 passed**) + integrator appointments (**9 passed**).
- [x] Drizzle в пакете **отложен** — `SqlExecutor` + pg-text эквивалентен прежнему SQL; source-of-truth полей Rubitime не менялся.

### C. `apps/media-worker`

- [x] Schema decision: **без** локального дубля webapp Drizzle schema; shared schema package — отдельный backlog; worker остаётся на `pg.Pool`.
- [x] `claim.ts` — pg `FOR UPDATE SKIP LOCKED` без изменений; unit `claim.test.ts` (**4 tests**: empty, claim one, reclaim stale, concurrent UPDATE miss).
- [x] `processTranscodeJob.ts` — pg-only backlog (вне DoD P8).

### D. Scripts

- [x] Классификация в [LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) § Wave 2 P8 — scripts (one-off/backfill/report/runtime tick → pg или thin wrapper).

### Final verification

- [x] LOG entry + RAW_SQL_INVENTORY §3–4, §2.7.
- [x] `pnpm --dir packages/booking-rubitime-sync run build && test` — **27 passed**.
- [x] `pgPatientBookings.test.ts` — **19 passed**; platform-merge consumers — **44 passed**; integrator `writePort.appointments` — **9 passed**.
- [x] `pnpm --dir apps/media-worker run test` — **17 passed** (incl. claim **4**).
- [x] **`pnpm run ci`** — green (2026-06-05, post-audit + remarks closure).
- [x] typecheck: webapp, media-worker, booking-rubitime-sync.
- [x] Не менять `.github/workflows/*`.

## Решения по сложным местам

- `platform-merge`: pg-only до отдельного merge-engine плана; consumer semver не менялся.
- `booking-rubitime-sync`: унификация persistence в пакете важнее Drizzle builder в monorepo package без shared schema.
- `media-worker`: claim эквивалентен webapp P5 enqueue split; Drizzle в worker только после shared schema decision.
- Scripts: runtime ticks (`integrator-push-outbox-tick`, `media-preview-process-tick`) — pg/HTTP к app endpoints; domain backfills — pg batch.

## Stop conditions

- (не сработали) API platform-merge и booking canonical model не менялись.

## Закрытие (2026-06-05)

- **A:** platform-merge pg-only (~85 `query`); consumer gate **44 passed**.
- **B:** `@bersoncare/booking-rubitime-sync` — upsert/find/lookup/revive guard; webapp + integrator + backfill; vitest **27**; webapp **19**; integrator **9**.
- **C:** media-worker claim unit tests **4**; schema pg-only; `processTranscodeJob` → фаза **IX**; suite **17 passed**.
- **D:** scripts в LOG § Wave 2 этап 8 — D (**37** строк); RAW_SQL §2.7.
- **CI:** `pnpm run ci` green (post-audit + remarks closure).

## Post-audit / remarks closure (2026-06-05)

- Package: lookup, revive guard, upsert update/idempotent/ambiguous (**27**).
- Integrator `writePort.appointments`: INSERT/UPDATE contract + revive skip (**9**).
- media-worker: concurrent claim race → ROLLBACK (**4** claim tests).
- Docs: LOG § Wave 2 этап 8 — D, RAW_SQL §2.7/§3–4, `STAGE2_DECOMPOSITION.md`, archive superseded notes для `rubitimeBranchServiceLookup.ts`.
