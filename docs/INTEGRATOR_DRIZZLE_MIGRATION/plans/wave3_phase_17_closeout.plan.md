---
name: Wave3 Phase17 Closeout
overview: Синхронизация docs, staging smoke gate, full CI, закрытие планов Wave 3 и статусов DRIZZLE_TRANSITION_PLAN IX–X.
status: completed
isProject: false
todos:
  - id: w3-p17-docs
    content: "DRIZZLE_TRANSITION_PLAN фазы IX–X → Done/Partial; RAW_SQL дата; LOG итог Wave 3."
    status: completed
  - id: w3-p17-plans-status
    content: "wave3_phase_00..17 todos completed/cancelled; plans/README Wave 3 index."
    status: completed
  - id: w3-p17-staging-smoke
    content: "LOG L182 staging multipart→transcode — обязательный smoke по чеклисту; подтверждает owner или человек/агент с доступом к staging/prod logs, очередям, БД и внешним сервисам."
    status: cancelled
  - id: w3-p17-ci
    content: "pnpm install --frozen-lockfile && pnpm run ci — green на финальном коммите."
    status: completed
  - id: w3-p17-archive
    content: "При полном closeout — перенос ~/.cursor/plans/drizzle_* в .cursor/plans/archive если есть."
    status: completed
---

# Wave 3 — фаза 17: Closeout

## Размер

**S** (в основном docs + CI).

## Definition of Done

- [x] Все фазы 00–16: `status: completed` или явный `cancelled` с причиной.
- [x] [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md): IX media-worker **Done**; X webapp **Done** или backlog с ADR list.
- [x] [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md): только Class B/C + scripts; дата снимка.
- [x] **`pnpm run ci`** green.
- [ ] Staging smoke выполнен, подтверждён owner/ops/dev lead/senior agent с доступом и зафиксирован в LOG (`[x]` + дата/среда + кто подтвердил). **Cancelled в phase 17 repo-сессии** — нет доступа к staging; open gate, см. [LOG](../LOG.md) §Wave 3 phase 17.

## Scope

**Разрешено:** docs, plan frontmatter, `.cursor/plans/archive/*` при наличии дубликатов.

**Вне scope:** новые фичи; CI workflow changes.

## Финальный rg (ожидаемый остаток)

| Зона | Допустимый остаток | Факт (2026-06-06) |
|------|-------------------|-------------------|
| `packages/platform-merge` | query() — ADR | 85 hits / 3 files |
| `packages/booking-rubitime-sync` | SqlExecutor pg | 4 hits / 1 file |
| `apps/media-worker/claim.ts` | pool.query | 1 |
| `apps/integrator/migrate.ts` | db.query | 1 (client.ts health path) |
| `apps/*/scripts/*` one-off | pg | documented Class C |
| Class B execute paths | documented | 25 webapp runtime files |

## Staging smoke (обязательный gate)

Из [LOG.md](../LOG.md): e2e multipart upload + transcode claim на staging.

Обязательная проверка перед закрытием Wave 3:
- multipart upload на staging;
- enqueue/claim транскода;
- фиксация результата в `LOG.md`.
- подтверждение owner или другого ответственного с доступом к staging/prod logs, очередям, БД и внешним сервисам.

Без этого пункта Wave 3 не переводится в `completed` (инициатива остаётся **blocked on staging smoke**).

## Archive

```bash
# выполнено 2026-06-06: cp ~/.cursor/plans/drizzle_* → .cursor/plans/archive/
```

## Закрытие (2026-06-06)

- Docs/rg/CI/archive выполнены; staging smoke — **cancelled** (open gate).
- Wave 3 initiative: **code/docs closeout done**; полный `completed` — после staging smoke sign-off.
