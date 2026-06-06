---
name: Wave3 Phase16 Legacy cutover
overview: Убрать зависимость регулярного потока от webapp legacy migrations только если после фаз 09–15 нет raw-SQL/migration причин держать legacy runner; иначе зафиксировать blocker/backlog.
status: completed
isProject: false
todos:
  - id: w3-p16-inventory
    content: "Инвентаризация всех живых ссылок на migrate:legacy/run-migrations.mjs (scripts, docs, tests, deploy)."
    status: completed
  - id: w3-p16-policy
    content: "Если нет blockers после 09–15: обновить runbook/policy: regular flow = Drizzle only; legacy path = emergency-only/manual gate."
    status: completed
  - id: w3-p16-blocker-decision
    content: "Проверено: blocker после 09–15 не найден; regular flow закреплён как Drizzle-only, legacy путь оставлен manual/emergency."
    status: completed
  - id: w3-p16-script-guards
    content: "Усилить guardrails: запрет использования migrate:legacy в регулярных pipeline/CI и явный warning gate в runner."
    status: completed
  - id: w3-p16-test-bootstrap
    content: "Для test/bootstrap path убрать неявную зависимость от legacy runner или явно изолировать её в dedicated emergency setup."
    status: completed
  - id: w3-p16-zod-ledger
    content: "Добавить Zod-валидацию ledger/runtime parsing в migration tooling, где есть untyped JSON/shape."
    status: completed
  - id: w3-p16-verify
    content: "Проверить: rg migrate:legacy/run-migrations в регулярных путях = 0; docs/LOG/RAW_SQL синхронизированы."
    status: completed
---

# Wave 3 — фаза 16: Legacy migrations cutover

## Размер

**M** (docs + scripts + test bootstrap policy).

## Decision gate before changes

Фаза 16 не отключает `migrate:legacy` автоматически. Сначала исполнитель обязан проверить результат фаз 09–15:

- если в regular runtime/deploy больше нет raw-SQL/migration причин держать legacy runner — переводим `migrate:legacy` в emergency/manual path;
- если такая причина есть — regular flow не меняем силой, фиксируем blocker/backlog в `LOG.md`, `RAW_SQL_INVENTORY.md` и `DRIZZLE_TRANSITION_PLAN.md`.

## Definition of Done

- [x] Проверено состояние после фаз 09–15: есть или нет причин держать `migrate:legacy` в regular flow.
- [x] Если blockers отсутствуют: в регулярном flow (`deploy-prod`, `deploy-webapp-prod`, CI/migrate scripts) нет необходимости вызывать `migrate:legacy`.
- [x] Если blockers отсутствуют: `migrate:legacy` оставлен только как emergency/manual path с явной пометкой и guard.
- [x] Если blockers есть: они перечислены с owner decision, и `migrate:legacy` не отключён «любой ценой» (N/A, blockers не выявлены).
- [x] В `RAW_SQL_INVENTORY.md` и `LOG.md` отражён новый статус legacy-path.
- [x] `wave3_DECISIONS.md` и `DRIZZLE_TRANSITION_PLAN.md` синхронизированы с cutover-решением.
- [x] Zod-проверки добавлены в затронутые скриптовые parsing points (если есть JSON/unknown shape).

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

## Закрытие (2026-06-06)

- Decision gate: blocker после фаз 09–15 не найден; regular deploy/CI остаётся на Drizzle-only path.
- Guardrails выполнены:
  - `run-migrations.mjs`: warning gate + `WEBAPP_LEGACY_MIGRATIONS_MODE` + CI блок для `manual` режима.
  - `vitest.globalSetup.ts`: legacy миграции убраны из неявного bootstrap; включаются только через opt-in env.
  - `run-migrations.mjs`: Zod-валидация shape (`COUNT(*)` ledger row, migration filenames).
- Документация синхронизирована: `wave3_INDEX`, `plans/README`, `DRIZZLE_TRANSITION_PLAN`, `RAW_SQL_INVENTORY`, `LOG`, `HOST_DEPLOY_README`, `apps/webapp/scripts/README`.
- Verify gates:
  - `rg "migrate:legacy|run-migrations\\.mjs" apps/webapp deploy docs --glob "!docs/archive/**"` — только emergency/manual контексты в docs/scripts/tests.
  - `pnpm --dir apps/webapp run typecheck`
  - `pnpm --dir apps/webapp run lint`
