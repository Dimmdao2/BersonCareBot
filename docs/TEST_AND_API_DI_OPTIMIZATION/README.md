# TEST_AND_API_DI_OPTIMIZATION

Документированная инициатива на базе **фактического** состояния репозитория (discovery 2026-04-16). **Изменений в runtime-коде, тестах и CI на этом этапе нет** — только документация и замеры baseline.

## Зачем два трека

1. **Оптимизация тестов** — сокращение времени и когнитивной нагрузки suite без потери критичных контрактов; затрагивает только тесты/топологию запуска.
2. **Нормализация import-boundary API** — перенос прямых `@/infra/*` из `route.ts` к слою композиции (`buildAppDeps` / фабрики); затрагивает прод-код и границы модулей.

Смешивать в **одном исполняемом PR/плане** нельзя: иначе улучшение времени прогона невозможно отделить от эффекта рефакторинга маршрутов, выше риск регрессий и споров на review.

## Расположение в документации проекта

| Ожидание в промпте | Факт в репозитории |
|--------------------|--------------------|
| Корень `Docs/` | Используется **`docs/`** (lowercase). Инициатива: `docs/TEST_AND_API_DI_OPTIMIZATION/`. |

Сводный индекс для навигации: [`docs/REPORTS/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md`](../REPORTS/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md).

## Состав папки

| Файл / папка | Назначение |
|--------------|------------|
| `MASTER_PLAN.md` | Цели, порядок фаз, checkpoints, критерии входа/выхода, синхронизация архитектурных документов. |
| `DISCOVERY_REPORT.md` | Факты по репо: пути, конфиги, счётчики, hotspots, расхождения с исходным планом. |
| `EXECUTION_RULES.md` | Жёсткие правила для будущего исполнителя (coverage, метрики, запреты). |
| `PROMPTS_EXEC_AUDIT_FIX.md` | Промпты для агента: EXEC / AUDIT / FIX, pre-deploy, final (как в других инициативах). |
| `test-optimization/` | План, инвентарь, риски, baseline только для **тестового** трека. |
| `api-di-boundary-normalization/` | То же для трека **DI / import-boundary** API. |

## Рекомендуемый порядок чтения / исполнения

1. `DISCOVERY_REPORT.md` → `MASTER_PLAN.md` → `EXECUTION_RULES.md` → при пошаговой работе с агентом: `PROMPTS_EXEC_AUDIT_FIX.md`.
2. Трек A: `test-optimization/BASELINE.md` → `PLAN.md` → `INVENTORY.md` → `CHECKLIST.md` (при работе вести `LOG.md`).
3. Checkpoint между A и B (см. `MASTER_PLAN.md`); полный CI перед **пушем**, не после каждого локального шага.
4. Трек B: `api-di-boundary-normalization/BASELINE.md` → `PLAN.md` → …
5. Финальная синхронизация документов из списка в `MASTER_PLAN.md`.

**GitHub:** workflow CI и deploy не менять в рамках инициативы — см. `MASTER_PLAN.md` и `EXECUTION_RULES.md`.

## Связанные разделы существующей документации

- **`docs/README.md`** — оглавление инициатив и ссылок на архитектуру.
- **`docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`** — composition roots, риски обхода DI (часть формулировок требует сверки с текущим кодом — см. `DISCOVERY_REPORT.md`).
- **`docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md`** — guardrails integrator/Telegram (не про webapp route imports; контекст безопасности).
- **`apps/webapp/src/app/api/api.md`**, **`apps/webapp/src/app-layer/di/di.md`** — локальные описания API и DI (целью трека B будет синхронизация с кодом после рефакторинга).
- **`docs/VIDEO_HLS_DELIVERY/04-test-strategy.md`** — пример отдельной test strategy по фиче (не дублируем содержимое).
