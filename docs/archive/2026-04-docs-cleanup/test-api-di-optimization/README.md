# TEST_AND_API_DI_OPTIMIZATION

Инициатива по **оптимизации тестов** (трек A) и **нормализации import-boundary в API** (трек B). Discovery и закрытый пакет аудита 2026-04 перенесены в **`docs/archive/2026-04-docs-cleanup/test-api-di-optimization/`**.

## Зачем два трека

1. **Оптимизация тестов** — сокращение времени и когнитивной нагрузки suite без потери критичных контрактов; затрагивает только тесты/топологию запуска.
2. **Нормализация import-boundary API** — перенос прямых `@/infra/*` из `route.ts` к слою композиции (`buildAppDeps` / фабрики); затрагивает прод-код и границы модулей.

Смешивать в **одном исполняемом PR/плане** нельзя: иначе улучшение времени прогона невозможно отделить от эффекта рефакторинга маршрутов, выше риск регрессий и споров на review.

## Расположение в документации проекта

| Ожидание в промпте | Факт в репозитории |
|--------------------|--------------------|
| Корень `Docs/` | Используется **`docs/`** (lowercase). Инициатива: `docs/TEST_AND_API_DI_OPTIMIZATION/`. |

Исторический индекс навигации (2026-04): [`docs/archive/2026-04-docs-cleanup/reports/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md`](../archive/2026-04-docs-cleanup/reports/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md).

## Состав папки

| Файл / папка | Назначение |
|--------------|------------|
| `MASTER_PLAN.md` | Цели, порядок фаз, checkpoints, критерии входа/выхода, синхронизация архитектурных документов. |
| `EXECUTION_RULES.md` | Жёсткие правила для исполнителя (coverage, метрики, запреты). |
| `PROMPTS_EXEC_AUDIT_FIX.md` | Промпты для агента: EXEC / AUDIT / FIX (пути к архивным AUDIT_* см. внутри файла). |
| `test-optimization/` | План, инвентарь, риски, baseline, LOG — **трек A**. |
| `api-di-boundary-normalization/` | То же для **трека B** (DI / import-boundary API). |

## Рекомендуемый порядок чтения / исполнения

1. При необходимости контекста по снимку репо на 2026-04: `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/DISCOVERY_REPORT.md`. Далее `MASTER_PLAN.md` → `EXECUTION_RULES.md` → при работе с агентом: `PROMPTS_EXEC_AUDIT_FIX.md`.
2. Трек A: `test-optimization/BASELINE.md` → `PLAN.md` → `INVENTORY.md` → `CHECKLIST.md` (при работе вести `LOG.md`).
3. Checkpoint между A и B (см. `MASTER_PLAN.md`); полный CI перед **пушем**, не после каждого локального шага.
4. Трек B: `api-di-boundary-normalization/BASELINE.md` → `PLAN.md` → …
5. Финальная синхронизация документов из списка в `MASTER_PLAN.md`.

**Прогоны и пуш:** между коммитами — `.cursor/rules/test-execution-policy.md`; перед пушем — `.cursor/rules/pre-push-ci.mdc`.

**GitHub:** workflow CI и deploy не менять в рамках инициативы — см. `MASTER_PLAN.md` и `EXECUTION_RULES.md`.

## Связанные разделы существующей документации

- **`docs/README.md`** — оглавление инициатив и ссылок на архитектуру.
- **`docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`** — composition roots, риски обхода DI (сверка со снимком: `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/DISCOVERY_REPORT.md`).
- **`docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md`** — guardrails integrator/Telegram (не про webapp route imports; контекст безопасности).
- **`apps/webapp/src/app/api/api.md`**, **`apps/webapp/src/app-layer/di/di.md`** — локальные описания API и DI (целью трека B будет синхронизация с кодом после рефакторинга).
- **`docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/04-test-strategy.md`** — пример отдельной test strategy по фиче (не дублируем содержимое).
