# STAGE_PLAN — WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE

## Порядок этапов (обязательный)

`A -> B -> C -> D`

Следующий этап стартует только после закрытия предыдущего по чеклисту и записи в `LOG.md`.

## Scope boundaries

Разрешено:

- `apps/webapp/db/**`
- `apps/webapp/migrations/**`
- `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`
- `apps/webapp/scripts/run-migrations.mjs`
- `apps/webapp/package.json`
- `deploy/host/deploy-prod.sh`
- `deploy/host/deploy-webapp-prod.sh`
- `deploy/HOST_DEPLOY_README.md`
- `docs/ARCHITECTURE/DB_STRUCTURE.md` (только если нужны factual updates)
- текущая папка инициативы в `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/**`

Для discovery можно читать и искать по всему репозиторию. Для edits Composer ограничен документацией и явно разрешенными файлами этапа; все найденные code/script refs вне scope записывать в `LOG.md` и передавать Codex.

Вне scope (не менять без отдельного согласования):

- бизнес-логику reminder/service/repo (кроме миграционной совместимости);
- API контрактов и UI-экранов;
- интеграторные миграции, если не требуется зеркальная техническая правка под webapp flow.

## Audit format

Аудиты Stage A/B/C/D пишутся в `LOG.md` отдельным блоком. Отдельные `AUDIT_STAGE_*.md` не обязательны, если пользователь явно не запросит.

Формат findings:

- `critical` — блокирует следующий этап;
- `major` — нужно закрыть до final audit;
- `minor` — можно исправить сразу или оставить как documented residual risk;
- `unknown` — не хватает фактов, требуется Codex/user decision.

Если Composer на аудите находит проблему, он не чинит code/deploy scripts. Допустимы только docs-правки в scope; остальное фиксируется как mandatory fix для Codex.

## Agent role decisions

- Composer: инвентаризация, docs cleanup, черновики audit, residual risk tracking.
- Codex: SQL/Drizzle решения, deploy scripts, package/test scripts, ledger strategy, финальное закрытие.
- Любое удаление/переписывание legacy runner выполняет Codex, не Composer.

## Этапы и распределение по агентам

## A — Inventory & Risk Map (Composer)

- собрать таблицу `legacy SQL -> drizzle equivalent / missing`;
- выделить DDL, который еще реально нужен рантайму;
- отметить риски повторного применения и риски падения на старых БД.

Чеклист:

- `rg` по `apps/webapp/migrations` и `apps/webapp/db/drizzle-migrations`;
- список "must-keep now" / "can deprecate";
- запись в `LOG.md`.

## B — Drizzle Consolidation (Codex)

- перенести/добавить недостающие schema-изменения в Drizzle (в закрытой инициативе — приоритетно guardrail/deploy-критичные пробелы канонического пути; полный перенос всего слоя legacy не является обязательным результатом одного этапа — см. `LOG.md` Stage B);
- обеспечить безопасный путь для уже накатанных БД (без destructive rollback);
- зафиксировать clear policy, что webapp schema evolves через Drizzle.

Чеклист:

- целевые миграционные smoke-checks;
- явная фиксация bootstrap/greenfield: полная схема `public` одним только Drizzle без legacy может оставаться **вне** узкого объёма этапа (см. residual в `LOG.md`);
- проверка, что существующая база не ломается на повторном прогоне.

## C — Deploy Guardrails (Codex)

- обновить deploy scripts так, чтобы автодеплой не пропускал критичные schema-изменения;
- добавить post-migrate checks на критичные таблицы/колонки;
- выровнять runbook.

Чеклист:

- dry-run сценарий команд без push;
- проверка, что guardrail падает при отсутствии критичной колонки;
- запись в `LOG.md`.

## D — Legacy Cleanup + Global Audit (Composer + Codex)

- убрать/ограничить legacy migration path до явно аварийного сценария;
- обновить docs, чтобы оператор не использовал устаревший путь;
- сделать global audit инвариантов и финальный список residual risks.

Чеклист:

- `rg` на устаревшие инструкции `migrate:legacy`;
- сверка docs с фактическими скриптами;
- финальная запись в `LOG.md`.

## Definition of Done

- webapp-миграции идут через один канонический путь (Drizzle) в обычном deploy-flow;
- критичные для рантайма колонки проверяются post-migrate guardrail;
- legacy path не используется как обязательный шаг production deploy;
- документация и runbook синхронизированы;
- в `LOG.md` зафиксированы этапы, проверки и решения.
