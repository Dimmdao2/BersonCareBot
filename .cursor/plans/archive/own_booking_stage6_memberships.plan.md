---
name: "Own Booking Engine — Stage 6: Memberships / packages"
overview: "Этап 6 закрыт (2026-05-29): составные абонементы, каталог и patient package, оплата (этап 5), reserve/consume/release/penalty, запись с patientPackageId, интеграция с политиками отмены (этап 4), UI admin/doctor/patient. Источник — STAGE_CHECKLISTS.md §Этап 6, ТЗ §11."
todos:
  - id: s6-model
    content: "Drizzle 0094 + schema bookingMemberships; balanceCalculator (производный баланс)"
    status: completed
  - id: s6-manual
    content: "Ручной абонемент + оплата (этап 5); активация при priceMinor=0"
    status: completed
  - id: s6-ready
    content: "Каталог be_subscription_packages; offer/purchase; capture → activate"
    status: completed
  - id: s6-usage
    content: "auto_on_visit_confirmed (wrap transition); manual consume; cancel penalty/release"
    status: completed
  - id: s6-booking
    content: "available + create patientPackageId; резерв до confirm; wizard ConfirmStepClient"
    status: completed
  - id: s6-ui
    content: "§A11/B-package/C-package; деталь /app/patient/memberships/[id]"
    status: completed
  - id: s6-verify
    content: "vitest memberships/policy/routes/hooks; typecheck; api.md, LOG, DB_STRUCTURE"
    status: completed
  - id: s6-audit
    content: "Ревью хвостов: policyResolver chargePackageSessionOnLate; FSM penalty; валидация create"
    status: completed
isProject: false
---

# Этап 6 — Абонементы

> ТЗ: `docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md` §Этап 6 (ТЗ §11, §13.5). Зависит от этапов 1, 2, 4, 5.

## Definition of Done (этап 6)

- [x] Составной абонемент (ручной и готовый) создаётся, оплачивается (этап 5), активируется (§11.1–11.3).
- [x] Абонементные сущности tenant-aware (`organization_id`) (C1).
- [x] Списание авто/вручную; отмена корректно влияет на баланс (§11.4, C6); `chargePackageSessionOnLate` в resolver.
- [x] При записи: `available` (`serviceId` / `branchServiceId`), `create` + `patientPackageId`, резерв до confirm, wizard.
- [x] Остатки и подписи услуг — пациент и staff; базовая история на `/app/patient/memberships/[id]`.
- [x] UI §A11 / §B-package / §C-package; миграция `0094`; модуль `modules/memberships`; docs синхронизированы.

## Gate

Готовый абонемент-продукт обобщается в универсальную модель **Product** на этапе 7.

## Реализация (канон)

| Область | Пути |
|--------|------|
| Schema / migration | `apps/webapp/db/schema/bookingMemberships.ts`, `db/drizzle-migrations/0094_*` |
| Domain | `apps/webapp/src/modules/memberships/` (`service`, `ports`, `balanceCalculator`, `packageValidity`) |
| Infra | `apps/webapp/src/infra/repos/pgMemberships.ts` |
| DI / hooks | `buildAppDeps.ts`, `app-layer/booking/wrapBookingEngineMembershipHooks.ts` |
| Booking create | `modules/patient-booking/canonicalCreate.ts` (+ `patientPackageId`) |
| Cancel | `patient-booking/service.ts`, `booking-appointment-lifecycle`, `policyResolver` |
| Patient API | `app/api/booking/memberships/**` |
| Staff API | `app/api/admin|doctor/booking-engine/packages`, `patient-packages`, `consume` |
| UI | `BookingCatalogPackagesSection`, `BookingPatientPackagesSection`, `PatientMembershipsSection`, `ConfirmStepClient`, `/app/patient/memberships/pay`, `/app/patient/memberships/[id]` |

## API (пациент)

- `GET /api/booking/memberships` — список абонементов с балансом.
- `GET /api/booking/memberships/[id]` — деталь, usages, history.
- `GET /api/booking/memberships/available?serviceId=` \| `?branchServiceId=`.
- `GET /api/booking/memberships/catalog` — каталог для покупки.
- `POST /api/booking/memberships/purchase` — offer catalog → payment / activate.
- `GET /api/booking/memberships/payment-status`, `POST .../payments/mock-complete`.
- `POST /api/booking/create` — опционально `patientPackageId` (in_person).

## Поведение списания

- **Reserve** при create (до `markConfirmed`); сбой → откат appointment + `package_*` ошибки.
- **Consume** при `visit_confirmed` / `completed` если `deductionMode=auto_on_visit_confirmed` (hook на `transitionAppointmentStatus`).
- **Penalty / release** при отмене через `applyCancelPackageOutcome`; штраф **не** переводит запись в `charged_to_package`.
- **Staff** `package_charged` на manual-cancel; ошибки списания → HTTP 409.

## Проверки (закрытие)

- `pnpm --filter webapp exec vitest run src/modules/memberships src/modules/booking-policies/policyResolver.test.ts src/app/api/booking/membership-routes.test.ts src/app-layer/booking/wrapBookingEngineMembershipHooks.test.ts`
- `pnpm --filter webapp typecheck`
- Документация: `LOG.md` §2026-05-29 (этап 6 + ревью), `STAGE_CHECKLISTS.md`, `MASTER_PLAN.md` §2, `api.md`, `DB_STRUCTURE.md`, `memberships.md`

## Вне scope (явно)

- Публичный виджет `/book/new` — выбор абонемента при create (только patient app wizard).
- Integrator-события `booking.package_*` (backlog).
- Полный таймлайн посещений и карточка клиента — этап 9.
- Универсальная модель Product — этап 7.
