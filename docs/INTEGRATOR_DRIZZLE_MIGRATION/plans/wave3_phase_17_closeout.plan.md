---
name: Wave3 Phase17 Closeout
overview: Синхронизация docs, staging smoke gate, full CI, закрытие планов Wave 3 и статусов DRIZZLE_TRANSITION_PLAN IX–X.
status: pending
isProject: false
todos:
  - id: w3-p17-docs
    content: "DRIZZLE_TRANSITION_PLAN фазы IX–X → Done/Partial; RAW_SQL дата; LOG итог Wave 3."
    status: pending
  - id: w3-p17-plans-status
    content: "wave3_phase_00..17 todos completed/cancelled; plans/README Wave 3 index."
    status: pending
  - id: w3-p17-staging-smoke
    content: "LOG L182 staging multipart→transcode — обязательный smoke и фиксация результата."
    status: pending
  - id: w3-p17-ci
    content: "pnpm install --frozen-lockfile && pnpm run ci — green на финальном коммите."
    status: pending
  - id: w3-p17-archive
    content: "При полном closeout — перенос ~/.cursor/plans/drizzle_* в .cursor/plans/archive если есть."
    status: pending
---

# Wave 3 — фаза 17: Closeout

## Размер

**S** (в основном docs + CI).

## Definition of Done

- [ ] Все фазы 00–16: `status: completed` или явный `cancelled` с причиной.
- [ ] [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md): IX media-worker **Done**; X webapp **Done** или backlog с ADR list.
- [ ] [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md): только Class B/C + scripts; дата снимка.
- [ ] **`pnpm run ci`** green.
- [ ] Staging smoke выполнен и зафиксирован в LOG (`[x]` + дата/среда).

## Scope

**Разрешено:** docs, plan frontmatter, `.cursor/plans/archive/*` при наличии дубликатов.

**Вне scope:** новые фичи; CI workflow changes.

## Финальный rg (ожидаемый остаток)

| Зона | Допустимый остаток |
|------|-------------------|
| `packages/platform-merge` | query() — ADR |
| `packages/booking-rubitime-sync` | SqlExecutor pg |
| `apps/media-worker/claim.ts` | pool.query |
| `apps/integrator/migrate.ts` | db.query |
| `apps/*/scripts/*` one-off | pg |
| Class B execute paths | documented |

## Staging smoke (обязательный gate)

Из [LOG.md](../LOG.md): e2e multipart upload + transcode claim на staging.

Обязательная проверка перед закрытием Wave 3:
- multipart upload на staging;
- enqueue/claim транскода;
- фиксация результата в `LOG.md`.

Без этого пункта Wave 3 не переводится в `completed`.

## Archive

```bash
# если остались дубликаты в ~/.cursor/plans/
git mv ~/.cursor/plans/drizzle_final_closeout_*.plan.md .cursor/plans/archive/ 2>/dev/null || true
```
