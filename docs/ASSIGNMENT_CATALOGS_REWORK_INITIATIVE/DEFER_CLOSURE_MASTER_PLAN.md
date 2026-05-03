# MASTER PLAN — ASSIGNMENT_CATALOGS_REWORK defer closure (D1–D6)

## 1. Цель

Закрыть продуктовые defer после B1–B7: перевести ключевые статические списки в системные справочники БД, согласовать инстансный сценарий `qualitative`, принять решение по `domain -> kind`, и завершить инициативу единым техническим аудитом.

Источник продуктовых решений: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §8.2.

## 2. Scope

### In scope

- Q6: доступ к системному справочнику `measure_kinds`.
- Q1: `assessmentKind` как справочник в БД.
- Q3: типы рекомендаций как справочник в БД.
- Q2: подтверждение и выравнивание инстансного сценария прохождения тестов.
- Q4: этап оценки и (при приемлемом объёме) рефактор `domain -> kind`.
- Обновление документации и PROMPTS для поэтапного EXEC/AUDIT/FIX.

### Out of scope

- `publication_status` для упражнений/клин. тестов/рекомендаций.
- Bulk API массовых операций состава контейнеров.
- Новые фичи outside `apps/webapp` и домена `ASSIGNMENT_CATALOGS_REWORK`.

## 3. Порядок этапов и зависимости

```text
D1 (measure_kinds access)
  └─► D2 (assessmentKind dictionary)
         └─► D3 (recommendation type dictionary)
                ├─► D4 (Q2 instance flow alignment)
                └─► D5 (domain->kind spike + optional implementation)
                         └─► D6 (global defer audit + closure)
```

Пояснения:
- D5 допускает controlled defer, если spike покажет непропорциональный объём.
- D6 закрывается только после D1–D4 и фиксации статуса D5 (`done` или `deferred with evidence`).

## 4. Кодовая карта

| Область | Ключевые пути |
|---|---|
| Справочники | `apps/webapp/src/app/app/doctor/references/**`, `apps/webapp/src/modules/references/**`, `apps/webapp/src/infra/repos/pgReferences.ts`, `apps/webapp/db/schema/schema.ts` (`reference_categories`, `reference_items`) |
| Measure kinds | `apps/webapp/db/schema/clinicalTests.ts`, `apps/webapp/src/modules/tests/measureKinds*.ts`, `apps/webapp/src/app/api/doctor/measure-kinds/route.ts` |
| Clinical tests | `apps/webapp/src/modules/tests/**`, `apps/webapp/src/app/app/doctor/clinical-tests/**`, `apps/webapp/src/infra/repos/pgClinicalTests.ts` |
| Recommendations | `apps/webapp/src/modules/recommendations/**`, `apps/webapp/src/app/app/doctor/recommendations/**`, `apps/webapp/src/infra/repos/pgRecommendations.ts`, `apps/webapp/db/schema/recommendations.ts` |
| Program progress | `apps/webapp/src/modules/treatment-program/progress-service.ts`, `patient-program-actions.ts`, `stage-semantics.ts` |

## 5. Архитектурные правила

- Для `modules/*` сохранять ports/DI и запрет прямых импортов `@/infra/db/*`/`@/infra/repos/*`.
- Route handlers оставлять тонкими (parse/validate/auth/service/response).
- Схема и миграции только через Drizzle.
- Новые integration env не вводить.

## 6. Политика проверок

На каждом D-этапе:
- `rg`-проверка затронутых символов (до/после).
- таргетный `eslint` по изменённым файлам;
- таргетные `vitest` по изменённому модулю;
- `pnpm --dir apps/webapp exec tsc --noEmit`.

Перед push:
```bash
pnpm install --frozen-lockfile
pnpm run ci
```

## 7. Definition of Done (defer closure wave)

- D1–D4 закрыты с PASS-аудитами.
- D5 имеет статус `done` или `deferred with spike evidence`.
- Продуктовый план §5/§7/§8 синхронизирован с фактом кода.
- Подготовлен итоговый аудит defer-wave (`AUDIT_DEFER_CLOSURE_GLOBAL.md`).
