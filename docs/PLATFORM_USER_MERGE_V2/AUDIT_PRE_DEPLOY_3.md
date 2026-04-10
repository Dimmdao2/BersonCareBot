# Audit — Pre-deploy 3 (retrospective repo audit)

**Дата:** 2026-04-10  
**Scope:** Deploy 3 / Stage 3 + Stage 4 — integrator merge/outbox + webapp realignment

Этот файл создан ретроспективно для восстановления полного audit trail по deploy-slice. Он фиксирует **repo readiness** для cross-DB Deploy 3.

---

## Проверка readiness

| Критерий | Статус | Комментарий |
|----------|--------|-------------|
| Scope соответствует Deploy 3 | **PASS** | `mergeIntegratorUsers`, outbox rewrite/dedup, Stage 4 SQL/job/gate |
| Миграции/код лежат в правильных местах | **PASS** | integrator repos + webapp ops/sql package |
| Rollback-путь описан | **PASS** | `CUTOVER_RUNBOOK.md` § Deploy 3, backup/restore через host contract |
| SQL gates подготовлены | **PASS** | `sql/README.md`, `preview_webapp_realignment_collisions.sql`, `realign_webapp_integrator_user_id.sql`, `diagnostics_webapp_integrator_user_id.sql` |
| Нет нарушений server conventions | **PASS** | БД/psql префиксы и cutover env задокументированы корректно |
| `pnpm run ci` зелёный | **PASS** | подтверждено в `AGENT_EXECUTION_LOG.md` и повторно в финальном fix-pass |

## Особые оговорки

- `projection_outbox` realignment intentionally затрагивает только `pending` строки; `processing` остаётся operational concern по runbook.
- Stage 4 gate подтверждает projection-таблицы webapp; production per-merge SQL evidence сохраняет оператор.

## Verdict

**PASS (repo readiness)** — Deploy 3 подготовлен как controlled cutover slice с явными SQL gate и rollback contract.

## MANDATORY FIX INSTRUCTIONS

1. Перед production merge пары обязательно использовать Stage 4 gate SQL и сохранить output в тикете.
2. Если добавляется новая webapp таблица с `integrator_user_id`, её нужно включить и в Stage 4 rekey, и в diagnostics builder/file.
