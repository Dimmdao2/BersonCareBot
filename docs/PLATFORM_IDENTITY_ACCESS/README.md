# Platform Identity & Access (tier: guest / onboarding / patient)

Единая платформенная модель идентичности и доступа для **webapp**, **интегратора**, **Telegram**, **Max** и проекций (Rubitime и др.).

## Документы

| Файл | Назначение |
|------|------------|
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Генеральный план инициативы: цели, фазы, DoD, риски, связь с другими доками |
| [`SPECIFICATION.md`](SPECIFICATION.md) | Нормативная спецификация: канон, tier, доверие, legacy, инварианты |
| [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) | Подробные сценарии и привязка к модулям/файлам BersonCareBot |

## Связь с другими инициативами

- **Канон и merge в БД:** [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md), [`../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md`](../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md) — merge остаётся **подстраховкой**; эта инициатива задаёт **access-tier** и **порядок резолва канона до записи сессии**.
- **AUTH / Mini App / бот:** [`../AUTH_RESTRUCTURE/MASTER_PLAN.md`](../AUTH_RESTRUCTURE/MASTER_PLAN.md) — пересечение по входам и гейтам; детали реализации tier должны согласовываться с этим контуром.

## Статус

Инициатива в стадии **планирования и спецификации**; реализация по фазам **A → B** (identity/канал↔канон) **до** **C → D** (session и политика маршрутов/API), затем **E** — см. `MASTER_PLAN.md` §5.
