---
name: Wave3 Phase16 Legacy cutover
overview: Убрать зависимость регулярного потока от webapp legacy migrations только если после фаз 09–15 нет raw-SQL/migration причин держать legacy runner; иначе зафиксировать blocker/backlog.
status: pending
isProject: false
todos:
  - id: w3-p16-inventory
    content: "Инвентаризация всех живых ссылок на migrate:legacy/run-migrations.mjs (scripts, docs, tests, deploy)."
    status: pending
  - id: w3-p16-policy
    content: "Если нет blockers после 09–15: обновить runbook/policy: regular flow = Drizzle only; legacy path = emergency-only/manual gate."
    status: pending
  - id: w3-p16-blocker-decision
    content: "Если остаётся raw SQL, который может требовать legacy migrations: не отключать migrate:legacy, зафиксировать blocker, owner decision и критерии повторного cutover."
    status: pending
  - id: w3-p16-script-guards
    content: "Усилить guardrails: запрет использования migrate:legacy в регулярных pipeline/CI и явный warning gate в runner."
    status: pending
  - id: w3-p16-test-bootstrap
    content: "Для test/bootstrap path убрать неявную зависимость от legacy runner или явно изолировать её в dedicated emergency setup."
    status: pending
  - id: w3-p16-zod-ledger
    content: "Добавить Zod-валидацию ledger/runtime parsing в migration tooling, где есть untyped JSON/shape."
    status: pending
  - id: w3-p16-verify
    content: "Проверить: rg migrate:legacy/run-migrations в регулярных путях = 0; docs/LOG/RAW_SQL синхронизированы."
    status: pending
---

# Wave 3 — фаза 16: Legacy migrations cutover

## Размер

**M** (docs + scripts + test bootstrap policy).

## Decision gate before changes

Фаза 16 не отключает `migrate:legacy` автоматически. Сначала исполнитель обязан проверить результат фаз 09–15:

- если в regular runtime/deploy больше нет raw-SQL/migration причин держать legacy runner — переводим `migrate:legacy` в emergency/manual path;
- если такая причина есть — regular flow не меняем силой, фиксируем blocker/backlog в `LOG.md`, `RAW_SQL_INVENTORY.md` и `DRIZZLE_TRANSITION_PLAN.md`.

## Definition of Done

- [ ] Проверено состояние после фаз 09–15: есть или нет причин держать `migrate:legacy` в regular flow.
- [ ] Если blockers отсутствуют: в регулярном flow (`deploy-prod`, `deploy-webapp-prod`, CI/migrate scripts) нет необходимости вызывать `migrate:legacy`.
- [ ] Если blockers отсутствуют: `migrate:legacy` оставлен только как emergency/manual path с явной пометкой и guard.
- [ ] Если blockers есть: они перечислены с owner decision, и `migrate:legacy` не отключён «любой ценой».
- [ ] В `RAW_SQL_INVENTORY.md` и `LOG.md` отражён новый статус legacy-path.
- [ ] `wave3_DECISIONS.md` и `DRIZZLE_TRANSITION_PLAN.md` синхронизированы с cutover-решением.
- [ ] Zod-проверки добавлены в затронутые скриптовые parsing points (если есть JSON/unknown shape).

## Scope

**Разрешено:** `apps/webapp/scripts/*migrate*`, `apps/webapp/package.json`, `apps/webapp/vitest.globalSetup.ts`, `deploy/HOST_DEPLOY_README.md`, `docs/INTEGRATOR_DRIZZLE_MIGRATION/**`, а также профильные docs с регулярными ссылками на `migrate:legacy`.

**Вне scope:** переписывание исторических SQL-файлов `apps/webapp/migrations/*.sql`; удаление архивных документов.

## Проверки

```bash
rg "migrate:legacy|run-migrations\\.mjs" apps/webapp deploy docs --glob "!docs/archive/**"
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp run lint
```

## Риски

| Риск | Митигация |
|------|-----------|
| Старые окружения всё ещё требуют legacy bootstrap | emergency-runbook + explicit gate, не regular deploy |
| После 09–15 остался raw SQL, который может требовать legacy migrations | не отключать regular legacy path; зафиксировать blocker и повторный cutover gate |
| Тестовый bootstrap сломается при жёстком запрете legacy | выделить test-only path и задокументировать |
| Dual-ledger путаница | фиксировать source-of-truth (`drizzle.__drizzle_migrations`) и repair steps |
