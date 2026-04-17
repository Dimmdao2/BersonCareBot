# Audit — Pre-deploy 1 (retrospective repo audit)

**Дата:** 2026-04-10  
**Scope:** Deploy 1 / Stage 1 — integrator schema prep (`users.merged_into_user_id`)

Этот файл создан ретроспективно для восстановления полного audit trail по deploy-slice. Он подтверждает **repo readiness** для Deploy 1; фактический production deploy по-прежнему определяется runbook и host evidence.

---

## Проверка readiness

| Критерий | Статус | Комментарий |
|----------|--------|-------------|
| Scope ограничен schema-only изменением | **PASS** | `20260410_0001_users_merged_into_user_id.sql`, без снятия webapp blocker |
| Миграция лежит в правильной папке | **PASS** | `apps/integrator/src/infra/db/migrations/core/` |
| Rollback-путь описан | **PASS** | `CHECKLISTS.md` Deploy 1, `CUTOVER_RUNBOOK.md` Deploy 1 |
| SQL gates / post-check готовы | **PASS** | `\d users` / integrator schema docs согласованы |
| Нет нарушения server conventions | **PASS** | env/DB инструкции идут через `SERVER CONVENTIONS.md` / `CUTOVER_RUNBOOK.md` |
| `pnpm run ci` зелёный | **PASS** | подтверждено в `AGENT_EXECUTION_LOG.md` и повторно в финальном fix-pass |

## Verdict

**PASS (repo readiness)** — Deploy 1 был корректно подготовлен как backward-compatible schema slice.

## MANDATORY FIX INSTRUCTIONS

1. Если Deploy 1 снова меняет DDL `users`, обновить одновременно:
   - `apps/integrator/src/infra/db/migrations/core/...`
   - `apps/integrator/src/infra/db/schema.md`
   - `docs/ARCHITECTURE/DB_STRUCTURE.md`
2. Перед production deploy использовать только host-процедуру с backup из `deploy-prod.sh` / `CUTOVER_RUNBOOK.md`.
