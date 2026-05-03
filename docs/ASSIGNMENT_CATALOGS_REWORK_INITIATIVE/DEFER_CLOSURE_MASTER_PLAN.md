# MASTER PLAN — ASSIGNMENT_CATALOGS_REWORK defer closure (D1–D6)

## 1. Цель

Закрыть продуктовые defer после B1–B7: перевести ключевые статические списки в системные справочники БД, согласовать инстансный сценарий `qualitative`, зафиксировать статус эпика `domain -> kind`, и завершить инициативу единым техническим аудитом.

Источник продуктовых решений: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §8.2.

## 2. Scope

### In scope

- Q6: доступ к системному справочнику `measure_kinds`.
- Q1: `assessmentKind` как справочник в БД.
- Q3: типы рекомендаций как справочник в БД.
- Q2: подтверждение и выравнивание инстансного сценария прохождения тестов.
- Q4: этап оценки и (при приемлемом объёме) рефактор `domain -> kind` — **на 2026-05-04 отложен** владельцем (см. [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md)); в D6 фиксируется статус `deferred` без обязательного spike до снятия паузы.
- Обновление документации и PROMPTS для поэтапного EXEC/AUDIT/FIX.

### Out of scope

- `publication_status` для упражнений/клин. тестов/рекомендаций.
- Bulk API массовых операций состава контейнеров.
- Новые фичи outside `apps/webapp` и домена `ASSIGNMENT_CATALOGS_REWORK`.
- Расширение обязательного Playwright/E2E-контура и изменение GitHub CI под новый e2e — **не** входят в defer-wave; приёмка — ручной smoke; точечный автотест только для стабилизированного UI по отдельному решению (см. продуктовый план §8.2).

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
- D5 допускает controlled defer, если spike покажет непропорциональный объём, либо явную **паузу владельца** (`deferred (owner pause)`) без spike до снятия паузы.
- D6 закрывается после D1–D4 и явной фиксации статуса D5: **`done`**, **`deferred with spike evidence`**, или **`deferred (owner pause)`** — см. [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md).

### Текущий статус синхронизации (обновлено 2026-05-04)

- D1 — **done** (`AUDIT_STAGE_D1.md`: PASS).
- D2 — **done** (`AUDIT_STAGE_D2.md`: PASS).
- D3 — **done** (`AUDIT_STAGE_D3.md`: PASS).
- D4 — **pending** (аудит не сформирован; **продуктового решения не требуется** — см. [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md)).
- D5 — **deferred (owner pause, 2026-05-04)** — реализация `domain`→`kind` не в текущем объёме; см. [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7/§8.2.
- D6 — **pending** (нет `AUDIT_DEFER_CLOSURE_GLOBAL.md`).
- **Вне D1–D6, но по той же оси:** `DROP clinical_tests.scoring_config` — **решение владельца:** колонка не нужна; инженерная миграция + чистка кода (см. продуктовый план §7).

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
- D5 имеет статус `done`, `deferred with spike evidence`, или явный **`deferred (owner pause)`** с датой в `LOG.md` / [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md).
- Продуктовый план §5/§7/§8 синхронизирован с фактом кода.
- Подготовлен итоговый аудит defer-wave (`AUDIT_DEFER_CLOSURE_GLOBAL.md`).
