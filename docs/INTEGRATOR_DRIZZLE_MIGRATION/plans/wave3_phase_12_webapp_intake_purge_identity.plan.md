---
name: Wave3 Phase12 Webapp intake purge identity
overview: Высокий риск — online intake, full purge, identity resolution, phone bind, merge preview, integrator-merge route.
status: pending
isProject: false
todos:
  - id: w3-p12a-intake
    content: "12A: pgOnlineIntake.ts (33) — runWebappSql + advisory parity, integration tests."
    status: pending
  - id: w3-p12b-identity-phone
    content: "12B: pgUserByPhone (21), pgIdentityResolution (12), pgPhoneMessengerBind (20) + Zod boundary checks."
    status: pending
  - id: w3-p12c-merge-route
    content: "12C: app/api/doctor/clients/integrator-merge/route.ts (14) — thin route, SQL в infra/service."
    status: pending
  - id: w3-p12d-purge-preview
    content: "12D: platformUserFullPurge.ts (40), platformUserMergePreview.ts (24), strictPlatformUserPurge.ts — TX Class B и безопасные dry-run semantics."
    status: pending
  - id: w3-p12-verify
    content: "12E: devDb integration tests purge/intake/merge; rg ноль по raw query в scope фазы."
    status: pending
---

# Wave 3 — фаза 12: Intake, purge, identity

## Размер

**L** — отдельный PR; не смешивать с booking.

## Подфазы (обязательный порядок)

### 12A — intake core

- Файл: `infra/repos/pgOnlineIntake.ts`.
- Цель: убрать прямой query-tail без изменения advisory semantics.
- Проверка:
  - targeted inprocess test на intake.
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgOnlineIntake.ts`.

### 12B — identity and phone bind

- Файлы: `pgUserByPhone.ts`, `pgIdentityResolution.ts`, `pgPhoneMessengerBind.ts`.
- Цель: унифицировать query execution и валидацию входов/rows через Zod.
- Проверка:
  - targeted tests identity/phone.
  - `rg "JSON\\.parse\\(|as unknown" apps/webapp/src/infra/repos/pgUserByPhone.ts apps/webapp/src/infra/repos/pgIdentityResolution.ts apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts`.

### 12C — integrator-merge route thinness

- Файл: `app/api/doctor/clients/integrator-merge/route.ts`.
- Цель: route остаётся thin, SQL остаётся в infra/service.
- Проверка:
  - route regression tests;
  - `rg "pool\\.query|client\\.query|db\\.query" apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts`.

### 12D — purge and merge preview

- Файлы: `platformUserFullPurge.ts`, `platformUserMergePreview.ts`, `strictPlatformUserPurge.ts`.
- Цель: безопасная TX-migration без потери семантики удаления/preview.
- Проверка:
  - devDb tests purge/preview.
  - dry-run path подтверждён тестом.

### 12E — phase verify

- Цель: контроль остатка raw SQL по scope фазы и финальная фиксация в LOG/RAW_SQL.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts"` + фильтр по scope фазы.
  - targeted suite для intake/purge/merge.

## Definition of Done

- [ ] Нет `pool.query` / `client.query` в файлах фазы (кроме Class C advisory/TX с ADR).
- [ ] `platformUserFullPurge` / `pgOnlineIntake` — существующие integration tests зелёные.
- [ ] Merge preview не ломает `platform-merge` consumer contract (merge engine остаётся pg в package).
- [ ] В identity/merge ветках все внешние payload/row-shape проходят Zod-валидацию.
- [ ] Подфазы 12A-12E закрыты последовательно, каждая с записью проверки в LOG.

## Scope

| Файл | queries |
|------|---------|
| `infra/repos/pgOnlineIntake.ts` | 33 |
| `infra/platformUserFullPurge.ts` | 40 |
| `infra/platformUserMergePreview.ts` | 24 |
| `infra/repos/pgUserByPhone.ts` | 21 |
| `infra/repos/pgPhoneMessengerBind.ts` | 20 |
| `infra/repos/pgIdentityResolution.ts` | 12 |
| `app/api/doctor/clients/integrator-merge/route.ts` | 14 |
| `infra/strictPlatformUserPurge.ts` | 6 (если не в P11) |
| `app-layer/platform-user/*` | 1–2 each |

**Вне scope:** `packages/platform-merge` implementation.

## Стратегия

1. **intake** первым — изолированный домен, advisory уже унифицирован.
2. **identity/phone** — второй блок; shared helpers с auth ports.
3. **purge/preview** — последним в PR; максимальные integration tests.

## Риски

| Риск | Митигация |
|------|-----------|
| Потеря данных purge | devDb tests + dry-run flags |
| Race intake | advisory lock tests (existing) |
| integrator-merge route fat | вынести в `infra/repos` |

## Проверки

```bash
rg 'pool\.query|client\.query' apps/webapp/src/infra/platformUserFullPurge.ts apps/webapp/src/infra/repos/pgOnlineIntake.ts
pnpm --dir apps/webapp exec vitest run --project inprocess pgOnlineIntake pgPlatformUserMerge strictPlatformUserPurge 2>/dev/null | tail -20
```
