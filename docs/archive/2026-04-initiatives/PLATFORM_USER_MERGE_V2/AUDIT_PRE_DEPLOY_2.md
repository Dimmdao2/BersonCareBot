# Audit — Pre-deploy 2 (retrospective repo audit)

**Дата:** 2026-04-10  
**Scope:** Deploy 2 / Stage 2 — canonical read/write path в integrator

Этот файл создан ретроспективно для восстановления полного audit trail по deploy-slice. Он фиксирует **repo readiness** для Deploy 2, а не отдельное host evidence.

---

## Проверка readiness

| Критерий | Статус | Комментарий |
|----------|--------|-------------|
| Scope соответствует только Deploy 2 | **PASS** | canonical resolve перед enqueue/write, без integrator merge и без снятия webapp blocker |
| Миграции/код в правильном месте | **PASS** | integrator repos/write path, без новых webapp schema требований |
| Rollback-путь описан | **PASS** | `CHECKLISTS.md` Deploy 2, `CUTOVER_RUNBOOK.md` Deploy 2 |
| SQL / projection-health readiness есть | **PASS** | health и outbox контроль задокументированы, без Stage 3 merge SQL |
| Нет нарушений server conventions | **PASS** | новые бизнес-флаги/env не вводились |
| `pnpm run ci` зелёный | **PASS** | подтверждено в `AGENT_EXECUTION_LOG.md` и повторно в финальном fix-pass |

## Особая оговорка

Identity/state subgraph (`telegram_state`, `upsertUser`) в Stage 2 сознательно не считался полностью закрытым без Stage 3. Это documented gap, а не pre-deploy blocker для самого Deploy 2.

## Verdict

**PASS (repo readiness)** — Deploy 2 корректно подготовлен как integrator-only behavioral slice без снятия blocker в webapp.

## MANDATORY FIX INSTRUCTIONS

1. Любой новый `enqueueProjectionEvent` с `integratorUserId` обязан канонизировать id до сборки payload/idempotency key.
2. Нельзя снимать webapp blocker на Deploy 2 — это только Stage 5 под feature flag.
