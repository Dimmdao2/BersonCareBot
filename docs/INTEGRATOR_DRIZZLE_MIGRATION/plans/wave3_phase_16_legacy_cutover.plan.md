---
name: Wave3 Phase16 Legacy cutover
overview: Убрать зависимость регулярного потока от webapp legacy migrations и зафиксировать Drizzle-only канон для bootstrap/deploy, сохранив legacy path только как аварийный.
status: pending
isProject: false
todos:
  - id: w3-p16-inventory
    content: "Инвентаризация всех живых ссылок на migrate:legacy/run-migrations.mjs (scripts, docs, tests, deploy)."
    status: pending
  - id: w3-p16-policy
    content: "Обновить runbook/policy: regular flow = Drizzle only; legacy path = emergency-only/manual gate."
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

## Definition of Done

- [ ] В регулярном flow (`deploy-prod`, `deploy-webapp-prod`, CI/migrate scripts) нет необходимости вызывать `migrate:legacy`.
- [ ] `migrate:legacy` оставлен только как emergency/manual path с явной пометкой и guard.
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
| Тестовый bootstrap сломается при жёстком запрете legacy | выделить test-only path и задокументировать |
| Dual-ledger путаница | фиксировать source-of-truth (`drizzle.__drizzle_migrations`) и repair steps |
