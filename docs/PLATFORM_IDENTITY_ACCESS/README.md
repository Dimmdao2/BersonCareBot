# Platform Identity & Access (tier: guest / onboarding / patient)

Единая платформенная модель идентичности и доступа для **webapp**, **интегратора**, **Telegram**, **Max** и проекций (Rubitime и др.).

## Документы

| Файл | Назначение |
|------|------------|
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Генеральный план инициативы: цели, фазы, DoD, риски, связь с другими доками |
| [`SPECIFICATION.md`](SPECIFICATION.md) | Нормативная спецификация: канон, tier, доверие, legacy, инварианты |
| [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) | Подробные сценарии и привязка к модулям/файлам BersonCareBot |
| [`PHASE_D_DEEP_AUDIT_REPORT.md`](PHASE_D_DEEP_AUDIT_REPORT.md) | Отчёт глубокого поэтапного аудита фазы D (RSC/API/layout/actions); после **D-FIX 2026-04-11** P1 и часть P2 закрыты — см. вердикт в конце отчёта |

## Связь с другими инициативами

- **Канон и merge в БД:** [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md), [`../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md`](../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md) — merge остаётся **подстраховкой**; эта инициатива задаёт **access-tier** и **порядок резолва канона до записи сессии**.
- **AUTH / Mini App / бот:** [`../AUTH_RESTRUCTURE/MASTER_PLAN.md`](../AUTH_RESTRUCTURE/MASTER_PLAN.md) — пересечение по входам и гейтам; детали реализации tier должны согласовываться с этим контуром.

## Статус

Реализация ведётся по фазам **A → B → C → C.02 → D → E** (см. `MASTER_PLAN.md` §5). Фазы **A**, **B**, **C**, **C.02** и **D** (модуль `patientRouteApiPolicy`, API/booking/actions, layout, RSC-gate, **D-FIX** по глубокому аудиту — warmups/purchases/cleanup) отражены в коде и в `AGENT_EXECUTION_LOG.md`. **RSC:** чтение персональных данных из БД по `userId` — **`patientRscPersonalDataGate`**; примеры в §7 `SCENARIOS_AND_CODE_MAP.md` (в т.ч. `sections/warmups`, покупки). Остаётся техдолг **D-SA-1** (см. JSDoc `patientRouteApiPolicy.ts`) и по желанию **D-TST-1**. Полное закрытие DoD (наблюдаемость §9, фаза **E**) — по чек-листу §11.
