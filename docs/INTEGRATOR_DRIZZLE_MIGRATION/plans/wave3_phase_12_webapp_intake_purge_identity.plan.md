---
name: Wave3 Phase12 Webapp intake purge identity
overview: Высокий риск — online intake, full purge, identity resolution, phone bind, merge preview, integrator-merge route.
status: pending
isProject: false
todos:
  - id: w3-p12-intake
    content: "pgOnlineIntake.ts (33) — runWebappSql + advisory (P3 done); integration tests."
    status: pending
  - id: w3-p12-purge
    content: "platformUserFullPurge.ts (40), platformUserMergePreview.ts (24) — поэтапно, TX Class B."
    status: pending
  - id: w3-p12-identity
    content: "pgUserByPhone (21), pgIdentityResolution (12), pgPhoneMessengerBind (20)."
    status: pending
  - id: w3-p12-route
    content: "app/api/doctor/clients/integrator-merge/route.ts (14) — thin; SQL в infra."
    status: pending
  - id: w3-p12-verify
    content: "devDb integration tests purge/intake/merge; rg на фазу."
    status: pending
---

# Wave 3 — фаза 12: Intake, purge, identity

## Размер

**L** — отдельный PR; не смешивать с booking.

## Definition of Done

- [ ] Нет `pool.query` / `client.query` в файлах фазы (кроме Class C advisory/TX с ADR).
- [ ] `platformUserFullPurge` / `pgOnlineIntake` — существующие integration tests зелёные.
- [ ] Merge preview не ломает `platform-merge` consumer contract (merge engine остаётся pg в package).
- [ ] В identity/merge ветках все внешние payload/row-shape проходят Zod-валидацию.

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
