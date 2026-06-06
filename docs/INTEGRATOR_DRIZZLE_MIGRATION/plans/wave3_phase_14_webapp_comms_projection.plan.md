---
name: Wave3 Phase14 Webapp comms projection
overview: Support communication, user projection, admin audit, merge legacy conversations — самые большие SQL-файлы webapp.
status: pending
isProject: false
todos:
  - id: w3-p14a-support-core
    content: "14A: pgSupportCommunication.ts (46) — по подсекциям (threads, messages, filters) в отдельных commit-батчах."
    status: completed
  - id: w3-p14b-user-projection-core
    content: "14B: pgUserProjection.ts (43) — patch profile, admin client, joins; без изменения контрактов ответов."
    status: completed
  - id: w3-p14c-audit-merge
    content: "14C: adminAuditLog.ts (16) — insert/list parity; mergeLegacySupportConversations.ts — verify only (SQL bridge done in 14A post-audit)."
    status: completed
  - id: w3-p14d-comms-tail
    content: "14D: pgMessageLog.ts, pgChannelPreferences.ts, pgWebPushSubscriptions.ts, pgBroadcastAudit.ts, pgSubscriptionMailingProjection.ts, pgPatientCalendarTimezone.ts."
    status: completed
  - id: w3-p14-verify
    content: "14E: messaging/support tests; rg zero по scope фазы; Zod boundary checks на filters/params."
    status: pending
---

# Wave 3 — фаза 14: Comms + user projection

## Предшественник

- Фаза **13** **completed** (2026-06-06): booking / doctor — [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md), журнал [LOG.md §Wave 3 phase 13](../LOG.md).

## Размер

**L** — возможно **2 commits** внутри PR (support отдельно от projection).

## Подфазы (обязательный порядок)

### 14A — support communication core

- Файл: `pgSupportCommunication.ts`.
- Цель: убрать raw query из крупных секций без big-bang переписывания.
- Проверка:
  - targeted support tests;
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgSupportCommunication.ts`.

### 14B — user projection core

- Файл: `pgUserProjection.ts`.
- Цель: сохранить контракт полей/фильтров для admin/patient projection.
- Проверка:
  - projection/admin tests;
  - parity проверка по выборке до/после для ключевых фильтров.

### 14C — audit and legacy merge helpers

- Файлы: `adminAuditLog.ts`, `mergeLegacySupportConversations.ts`.
- Цель: сохранить insert/list parity; merge helper — regression-only (`mergeLegacySupportConversations.ts` уже на `runWebappPgText` с 14A post-audit).
- Проверка:
  - audit tests;
  - targeted regression для legacy merge (no rewrite unless drift).

### 14D — comms tail

- Файлы: `pgMessageLog.ts`, `pgChannelPreferences.ts`, `pgWebPushSubscriptions.ts`, `pgBroadcastAudit.ts`, `pgSubscriptionMailingProjection.ts`, `pgPatientCalendarTimezone.ts`.
- Цель: закрыть хвост comms-проекций и подписок в рамках фазы.
- Проверка:
  - targeted tests comms/subscriptions;
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgMessageLog.ts apps/webapp/src/infra/repos/pgChannelPreferences.ts apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts apps/webapp/src/infra/repos/pgBroadcastAudit.ts apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts`.

### 14E — phase verify

- Цель: финальная проверка raw query остатка в scope и фиксация Zod-boundaries.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts"` + фильтр scope 14;
  - запись результатов в LOG/RAW_SQL.

## Definition of Done

- [ ] `pgSupportCommunication.ts`, `pgUserProjection.ts`, `adminAuditLog.ts` — Class A или B.
- [ ] Динамические фильтры support — Class B (`sql` fragments), не конкатенация без whitelist.
- [ ] Admin audit insert/list parity.
- [ ] Входные фильтры/параметры support/projection проходят Zod-валидацию на boundary.
- [ ] Подфазы 14A-14E выполнены последовательно и отражены в LOG.

## Scope

| Файл | queries |
|------|---------|
| `pgSupportCommunication.ts` | 46 |
| `pgUserProjection.ts` | 43 |
| `adminAuditLog.ts` | 16 |
| `mergeLegacySupportConversations.ts` | 6 |
| `pgMessageLog.ts` | 5 |
| `pgChannelPreferences.ts` | 11 |
| `pgWebPushSubscriptions.ts` | 10 |
| `pgBroadcastAudit.ts` | 2 |
| `pgSubscriptionMailingProjection.ts` | 5 |
| `pgPatientCalendarTimezone.ts` | 3 |

**Вне scope:** integrator `messageThreads` (уже runIntegratorSql).

## Стратегия

- Не «big bang» rewrite: файл → группа функций → `runWebappSql` → затем builder где Н.
- Сохранить transaction boundaries в support TX.

## Проверки

```bash
rg 'pool\.query|client\.query' apps/webapp/src/infra/repos/pgSupportCommunication.ts apps/webapp/src/infra/repos/pgUserProjection.ts
pnpm --dir apps/webapp exec vitest run --project fast adminAuditLog 2>/dev/null | tail -10
```
