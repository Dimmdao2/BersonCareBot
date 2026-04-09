# Stage C — Закрытие инициативы

**Цель:** формально завершить Platform User Merge v2 после успешного Deploy 4.

## Регрессия

- [ ] `pnpm run ci` на актуальном `main`.
- [ ] Targeted tests:
  - `apps/webapp`: `pgPlatformUserMerge`, `platformUserMergePreview`, `events.test.ts`, merge routes, `adminMergeAccountsLogic`.
  - `apps/integrator`: writePort/outbox/merge (по мере добавления).

## Документация

- [ ] [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) — обновить § ограничений v1/v2: blocker снят только при включённом флаге; ссылка на flow.
- [ ] [`MASTER_PLAN.md`](MASTER_PLAN.md) — статус «завершено», дата.
- [ ] [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — итоговая запись: даты деплоев, инциденты, метрики.

## Отчёт о закрытии (содержание)

1. **Снятые риски:** phantom user при двух integrator id; рассинхрон projection; idempotency outbox.
2. **Оставшееся вне scope:** replay `preferences.updated` после конфликта; physical delete aliases; др. (явный список).
3. **Operational notes:** ключ `system_settings`, runbook ссылка, контакты on-call.

## Архив

- По политике проекта: при полном завершении можно перенести материалы в `docs/archive/` с индексом в `docs/archive/README.md` (опционально).

## Связь с todo «enablement-closeout»

Закрытие = выполнение чек-листов этого файла + финальная запись в execution log.
