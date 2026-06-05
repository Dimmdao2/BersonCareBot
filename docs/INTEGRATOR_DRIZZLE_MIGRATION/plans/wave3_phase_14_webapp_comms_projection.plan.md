---
name: Wave3 Phase14 Webapp comms projection
overview: Support communication, user projection, admin audit, merge legacy conversations — самые большие SQL-файлы webapp.
status: pending
isProject: false
todos:
  - id: w3-p14-support
    content: "pgSupportCommunication.ts (46) — по подсекциям (threads, messages, filters)."
    status: pending
  - id: w3-p14-projection
    content: "pgUserProjection.ts (43) — patch profile, admin client, joins."
    status: pending
  - id: w3-p14-audit
    content: "adminAuditLog.ts (16), mergeLegacySupportConversations.ts (6)."
    status: pending
  - id: w3-p14-verify
    content: "messaging/support tests; rg zero на три файла."
    status: pending
---

# Wave 3 — фаза 14: Comms + user projection

## Размер

**L** — возможно **2 commits** внутри PR (support отдельно от projection).

## Definition of Done

- [ ] `pgSupportCommunication.ts`, `pgUserProjection.ts`, `adminAuditLog.ts` — Class A или B.
- [ ] Динамические фильтры support — Class B (`sql` fragments), не конкатенация без whitelist.
- [ ] Admin audit insert/list parity.
- [ ] Входные фильтры/параметры support/projection проходят Zod-валидацию на boundary.

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
