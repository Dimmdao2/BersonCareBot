# Index: TEST_AND_API_DI_OPTIMIZATION (2026-04-16)

Краткий указатель на инициативу **оптимизации тестов** и **нормализации import-boundary API** (webapp), подготовленную по фактическому коду репозитория.

## Где основной комплект документов

- **Папка инициативы:** [`docs/TEST_AND_API_DI_OPTIMIZATION/`](../TEST_AND_API_DI_OPTIMIZATION/README.md)
- **Master plan:** [`docs/TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md`](../TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md)
- **Discovery (факты по репо):** [`docs/archive/2026-04-docs-cleanup/test-api-di-optimization/DISCOVERY_REPORT.md`](../test-api-di-optimization/DISCOVERY_REPORT.md)

## Два трека (раздельное исполнение)

| Трек | Папка |
|------|--------|
| Test optimization | [`docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/`](../TEST_AND_API_DI_OPTIMIZATION/test-optimization/PLAN.md) |
| API DI / import-boundary | [`docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/`](../TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/PLAN.md) |

## Промпты для агента (копипаста)

- [`docs/TEST_AND_API_DI_OPTIMIZATION/PROMPTS_EXEC_AUDIT_FIX.md`](../TEST_AND_API_DI_OPTIMIZATION/PROMPTS_EXEC_AUDIT_FIX.md)

## Final closure

- **Финальный сквозной аудит:** [`docs/archive/2026-04-docs-cleanup/test-api-di-optimization/AUDIT_FINAL.md`](../test-api-di-optimization/AUDIT_FINAL.md)
- **Статус closure:** `PASS` (critical/major closure completed; allowlist formalized, docs sync/defer matrix fixed, unified CI evidence fixed)

## Baseline (кратко, детали в треке)

- `pnpm test` (integrator): см. [`test-optimization/BASELINE.md`](../TEST_AND_API_DI_OPTIMIZATION/test-optimization/BASELINE.md)
- `pnpm test:webapp`: см. тот же файл
- **Полный `pnpm run ci` в discovery не замерялся** — исполнитель должен дописать.

## Связанные архитектурные материалы

- [`docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`](../ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md)
- [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md)
- [`apps/webapp/src/app-layer/di/di.md`](../../apps/webapp/src/app-layer/di/di.md)

## Примечание о пути `Docs/`

В промпте фигурировал корень `Docs/`; в репозитории каноничен **`docs/`** (lowercase). Инициатива размещена в `docs/` для соответствия существующей структуре.
