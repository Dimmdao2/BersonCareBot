---
name: Wave3 Phase14 Webapp comms projection
overview: "Phase 14 completed (2026-06-06): support comms, user projection, admin audit, comms tail — runWebappPgText bridge, Zod boundaries, gate 10 files, Vitest 118/11."
status: completed
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
    status: completed
---

# Wave 3 — фаза 14: Comms + user projection

## Предшественник

- Фаза **13** **completed** (2026-06-06): booking / doctor — [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md), журнал [LOG.md §Wave 3 phase 13](../LOG.md).

## Размер

**L** — возможно **2 commits** внутри PR (support отдельно от projection).

## Подфазы (обязательный порядок)

### 14A — support communication core (**done** 2026-06-06)

- Файл: `pgSupportCommunication.ts`.
- Цель: убрать raw query из крупных секций без big-bang переписывания.
- Проверка:
  - targeted support tests;
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgSupportCommunication.ts`.

### 14B — user projection core (**done** 2026-06-06)

- Файл: `pgUserProjection.ts`.
- Цель: сохранить контракт полей/фильтров для admin/patient projection.
- Проверка:
  - projection/admin tests;
  - parity проверка по выборке до/после для ключевых фильтров.

### 14C — audit and legacy merge helpers (**done** 2026-06-06)

- Файлы: `adminAuditLog.ts`, `mergeLegacySupportConversations.ts`.
- Цель: сохранить insert/list parity; merge helper — regression-only (`mergeLegacySupportConversations.ts` уже на `runWebappPgText` с 14A post-audit).
- Проверка:
  - audit tests;
  - targeted regression для legacy merge (no rewrite unless drift).

### 14D — comms tail (**done** 2026-06-06)

- Файлы: `pgMessageLog.ts`, `pgChannelPreferences.ts`, `pgWebPushSubscriptions.ts`, `pgBroadcastAudit.ts`, `pgSubscriptionMailingProjection.ts`, `pgPatientCalendarTimezone.ts`.
- Цель: закрыть хвост comms-проекций и подписок в рамках фазы.
- Проверка:
  - targeted tests comms/subscriptions;
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgMessageLog.ts apps/webapp/src/infra/repos/pgChannelPreferences.ts apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts apps/webapp/src/infra/repos/pgBroadcastAudit.ts apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts`.

### 14E — phase verify (**done** 2026-06-06)

- Цель: финальная проверка raw query остатка в scope и фиксация Zod-boundaries.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts"` + фильтр scope 14;
  - запись результатов в LOG/RAW_SQL.

#### Закрытие 14E (2026-06-06)

- **Gate scope (10 файлов):** `pool.query` = **0** (runtime; JSDoc «no direct pool.query» в headers допустим); domain SQL → `runWebappPgText` / `txPgText`.
- **Class C transport:** `pgSupportCommunication` merge wrapper (3×); `pgUserProjection` (4 TX); `adminAuditLog.upsertOpenConflictLog` (3×); `pgChannelPreferences.setPreferredAuthChannel`; `pgWebPushSubscriptions.saveSubscription` — только `BEGIN`/`COMMIT`/`ROLLBACK` (+ `SET CONSTRAINTS` в user projection TX).
- **Zod boundaries:** `supportAdminListQuery.ts`; `adminAuditListQuery.ts`; `messageLogListQuery.ts` + admin profile PATCH bodySchema (`/api/admin/users/[userId]/profile`).
- **Tests:** webapp fast phase-14 bundle — **118 passed** / **11 skipped** (repos + query modules + route tests); devDb opt-in smokes из 14A/14B/14C/14D — вне CI по умолчанию; staging/production smoke — gate **phase 17**, не 14.
- **Фаза 14 closed**; следующая — [wave3_phase_15_webapp_long_tail.plan.md](./wave3_phase_15_webapp_long_tail.plan.md).

## Definition of Done

- [x] `pgSupportCommunication.ts`, `pgUserProjection.ts`, `adminAuditLog.ts` — Class A или B.
- [x] Динамические фильтры support — Class B (`sql` fragments), не конкатенация без whitelist.
- [x] Admin audit insert/list parity.
- [x] Входные фильтры/параметры support/projection проходят Zod-валидацию на boundary.
- [x] Подфазы 14A-14E выполнены последовательно и отражены в LOG.

## Scope

| Файл | bridge calls (14E) | pre-14 baseline (`pool.query`) |
|------|-------------------:|-------------------------------:|
| `pgSupportCommunication.ts` | 46 | 46 |
| `pgUserProjection.ts` | 32 (15 `runWebappPgText` + 17 `txPgText`) | 43 |
| `adminAuditLog.ts` | 17 (11 + 6 `txPgText`) | 16 |
| `mergeLegacySupportConversations.ts` | 2 | 6 |
| `pgMessageLog.ts` | 7 | 5 |
| `pgChannelPreferences.ts` | 11 | 11 |
| `pgWebPushSubscriptions.ts` | 11 | 10 |
| `pgBroadcastAudit.ts` | 4 | 2 |
| `pgSubscriptionMailingProjection.ts` | 7 | 5 |
| `pgPatientCalendarTimezone.ts` | 5 | 3 |

*Baseline — снимок inventory до миграции; bridge — факт после gate 14E (`rg 'runWebappPgText|txPgText'`). Расхождения — консолидация call sites, не регресс gate.*

**Вне scope:** integrator `messageThreads` (уже runIntegratorSql).

## Стратегия

- Не «big bang» rewrite: файл → группа функций → `runWebappSql` → затем builder где Н.
- Сохранить transaction boundaries в support TX.

## Проверки

Gate (10 scope-файлов):

```bash
SCOPE=(
  apps/webapp/src/infra/repos/pgSupportCommunication.ts
  apps/webapp/src/infra/repos/pgUserProjection.ts
  apps/webapp/src/infra/adminAuditLog.ts
  apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts
  apps/webapp/src/infra/repos/pgMessageLog.ts
  apps/webapp/src/infra/repos/pgChannelPreferences.ts
  apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts
  apps/webapp/src/infra/repos/pgBroadcastAudit.ts
  apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts
  apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts
)
for f in "${SCOPE[@]}"; do rg 'pool\.query' "$f" | rg -v 'no direct|Wave 3|JSDoc' || true; done
```

Fast bundle (из корня репо):

```bash
pnpm --dir apps/webapp exec vitest run --project fast \
  pgSupportCommunication pgUserProjection adminAuditLog mergeLegacySupportConversations \
  pgMessageLog pgChannelPreferences pgWebPushSubscriptions pgBroadcastAudit \
  pgSubscriptionMailingProjection pgPatientCalendarTimezone pgPhase14D \
  supportAdminListQuery adminAuditListQuery messageLogListQuery \
  src/app/api/admin/audit-log/route.test.ts \
  src/modules/doctor-messaging/service.test.ts
```

## Закрытие (2026-06-06)

| Подфаза | Коммит | Результат |
|---------|--------|-----------|
| **14A** | `e9a33a1e` | `pgSupportCommunication` → `runWebappPgText`; merge helper bridge; Zod `supportAdminListQuery`; Class C merge TX |
| **14B** | `53f414b3` | `pgUserProjection` → `runWebappPgText`/`txPgText`; 4 Class C TX; repo + devDb |
| **14C** | `c288d942` | `adminAuditLog` → bridge; dedupe TX; merge helper verify-only |
| **14D** | `18ce7e6e` | 6 comms/subscription repos → bridge; Class C channel prefs + web-push |
| **14E** | `ae07ad0e`, `c3b18629` | gate + Zod modules; RAW_SQL §14; full audit doc sync |
| **14 sidecar** | `8d213076` | doctor KPI drill-down fix в диапазоне фазы; задокументирован отдельно, без влияния на SQL gate 14 |

**Gate:** runtime `pool.query` = **0** в 10 scope-файлах (см. §Scope, §Проверки).

**Tests:** Vitest `--project fast` phase-14 bundle — **118 passed** / **11 skipped**; devDb opt-in — `RUN_SUPPORT_COMMUNICATION_DEV_DB`, `RUN_USER_PROJECTION_DEV_DB`, `RUN_ADMIN_AUDIT_LOG_DEV_DB`, `RUN_PHASE_14D_DEV_DB` + `USE_REAL_DATABASE=1`.

**Class C TX:** support merge wrapper; user projection (4 entrypoints); audit dedupe; channel preferred-auth; web-push save.

## Следующая фаза

[wave3_phase_15_webapp_long_tail.plan.md](./wave3_phase_15_webapp_long_tail.plan.md) — webapp long tail (15A–15F).

## Документация (sync при закрытии)

- YAML frontmatter: `status: completed`, все `todos` → `completed`.
- [../LOG.md](../LOG.md) §Wave 3 phase 14 — итог + post-audit + full audit closure.
- [wave3_INDEX.md](./wave3_INDEX.md), [README.md](./README.md), [../DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md), [../RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) §Wave 3 phase 14, [../../README.md](../../README.md).
