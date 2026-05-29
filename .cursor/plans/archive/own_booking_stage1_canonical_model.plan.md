---
name: "Own Booking Engine — Stage 1: Canonical data model"
overview: "Этап 1 инициативы собственного движка записи: каноническая организационная модель (clinic/branch/room/specialist/service + связи доступности), каноническая запись Appointment со статусной моделью и append-only событиями, multi-tenant задел, проекция Rubitime в канон без слома текущего пайплайна. Источник требований — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 1 и MASTER_PLAN.md."
status: completed
gitBranch: initiative/own-booking-engine
todos:
  - id: s1-prep
    content: Прочитать docs инициативы и правила; зафиксировать ER-модель + enum статусов как проектный документ внутри плана
    status: completed
  - id: s1-org
    content: "Drizzle: organization/branch/room/specialist + specialist_location/specialist_room (multi-tenant organization_id)"
    status: completed
  - id: s1-service
    content: "Drizzle: service + specialist_service_availability + service_location_availability (запрет дублей; флаги услуги)"
    status: completed
  - id: s1-appointment
    content: "Drizzle: appointment (канон) + enum статусов + appointment_event (append-only) + поля original_start_at/reschedule_count"
    status: completed
  - id: s1-timeline
    content: "Каркас таймлайна: patient_timeline_event + appointment_history_event (единый формат событий)"
    status: completed
  - id: s1-fsm
    content: "Service-слой: машина переходов статусов записи + порты модуля booking-engine; DI wiring"
    status: completed
  - id: s1-bridge
    content: "Rubitime bridge: маппинг сущностей + проекция appointment_records/rubitime_records в канон (read-bridge), переключатель system_settings"
    status: completed
  - id: s1-migrate
    content: Миграции drizzle-kit + сидирование дефолтной организации + перенос текущих booking_* в новую модель (план совместимости/rollback)
    status: completed
  - id: s1-ui
    content: "UI-паритет: admin CRUD организации/филиалов/кабинетов/специалистов/услуг/доступности + переключатель Rubitime-моста (UI §A1–A5, §A14)"
    status: completed
  - id: s1-verify
    content: Тесты + typecheck/lint затронутых пакетов; обновить DB_STRUCTURE.md, RUBITIME_BOOKING_PIPELINE.md, LOG.md, ROADMAP.md
    status: completed
isProject: false
---

# Этап 1 — Каноническая модель данных

> ТЗ: [`docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md) §Этап 1; принципы — [`MASTER_PLAN.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/MASTER_PLAN.md); сущности — [`DATA_MODEL_REFERENCE.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md). Бриф исполнителя — [`AGENT_BRIEF.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/AGENT_BRIEF.md).
>
> Перед стартом обязательно прочитать `.cursor/rules/clean-architecture-module-isolation.mdc`, `plan-authoring-execution-standard.mdc`, `system-settings-integrator-mirror.mdc`.

## Контекст существующего кода (не ломать)

- Текущий каталог записи (in-person v2): таблицы `booking_cities/booking_branches/booking_specialists/booking_services/booking_branch_services` в `apps/webapp/db/schema/schema.ts`; модуль `apps/webapp/src/modules/booking-catalog/*`, инфра `apps/webapp/src/infra/repos/pgBookingCatalog.ts`, admin CRUD `apps/webapp/src/app/api/admin/booking-catalog/**`, UI `apps/webapp/src/app/app/settings/RubitimeSection.tsx` на `/app/doctor/admin/booking`.
- Текущие записи: `patient_bookings` (native + rubitime_projection) и `appointment_records` (проекция Rubitime, читается кабинетом врача и пациента). Drizzle: `patientBookings`, `appointmentRecords`, `branches`.
- Rubitime mirror/legacy: `rubitime_records/rubitime_events/rubitime_booking_profiles/rubitime_services/rubitime_cooperators/rubitime_branches`.
- Сборка зависимостей: `apps/webapp/src/app-layer/di/buildAppDeps.ts`.

**Решение по совместимости:** новая каноническая модель добавляется **рядом**; на этапе 1 — каноника + проекция (read-bridge) поверх существующих данных. Замена write-пути — этап 2. Существующий каталог `booking_*` мигрируется в новую модель доступности (не параллельная модель — см. DATA_MODEL_REFERENCE §«Связь с существующими»).

## Scope boundaries

- **Можно трогать:** `apps/webapp/db/schema/*` (новые таблицы + миграции), новый модуль `apps/webapp/src/modules/booking-engine/*` (service+ports), `apps/webapp/src/infra/repos/pg*` (новые репозитории), `buildAppDeps.ts` (wiring), новый adapter-модуль для Rubitime-моста, admin CRUD/UI для новой модели, docs.
- **Вне scope:** изменение write-пути создания записи (этап 2), оплаты/абонементы (5/6), публичный вход (3), календарь (8). Не удалять `booking_*`/`appointment_records` пока этапы 2/8 не переключат чтение/запись.

## Декомпозиция

### Шаг 1.0 — Проектный документ модели (todo s1-prep)
- Описать ER-диаграмму канонических сущностей и enum статусов записи (ТЗ §17) внутри этого плана/в `docs/OWN_BOOKING_ENGINE_INITIATIVE/`.
- Зафиксировать стратегию `organization_id` (seed-UUID дефолтной клиники в `system_settings` или конфиге).
- Чек: ревью модели против `STAGE_CHECKLISTS.md §1.1–1.5` и `DATA_MODEL_REFERENCE.md`.

### Шаг 1.1 — Организационные таблицы (todo s1-org)
- Drizzle: `organization`, `branch`, `room`, `specialist`, `specialist_location`, `specialist_room`; `organization_id` на всех.
- Чек: `rg` отсутствия FK на полиморфные ссылки; миграция применяется.

### Шаг 1.2 — Услуги и доступность (todo s1-service)
- Drizzle: `service` (флаги: prepayment_applicable, usable_in_packages, online_payment_applicable, public_widget_visible, is_active), `specialist_service_availability` (уровни специалист/+филиал/+кабинет/+город), `service_location_availability`.
- Инвариант: одна услуга — одна строка; доступность только через связи (ТЗ §22.1). Флаг «публичная запись vs только ручное назначение».
- Чек: тест-сценарий «Дмитрий: 40 мин в Москве, 60/90 в СПб» моделируется без дублей услуг.

### Шаг 1.3 — Каноническая запись + статусы + события (todo s1-appointment)
- Drizzle: `appointment` (organization, branch, room, specialist, service, patient(platform_user), start_at, end_at, duration, source, status, original_start_at, reschedule_count, payment_ref?, package_usage_ref?), enum `appointment_status` (все 13 статусов ТЗ §17), `appointment_event` (append-only).
- Чек: вставка записи + событие создаётся атомарно (тест).

### Шаг 1.4 — Каркас таймлайна (todo s1-timeline)
- Drizzle: `patient_timeline_event` (агрегатор) + `appointment_history_event`; единый формат payload (готов под оплаты/абонементы этапов 5/6).
- Чек: правило «нет состояния без истории» зафиксировано в service.

### Шаг 1.5 — Service + FSM + DI (todo s1-fsm)
- Модуль `modules/booking-engine/` с `ports.ts` (BookingEnginePort, OrganizationPort, ServiceAvailabilityPort) и `service.ts` (валидные переходы статусов; запрет невалидных).
- Реализация портов в `infra/repos/pg*`; wiring в `buildAppDeps.ts`.
- Чек: юнит-тесты переходов статусов; ESLint module-isolation проходит (нет прямого `@/infra/db`/`@/infra/repos` из модуля).

### Шаг 1.6 — Rubitime bridge / проекция (todo s1-bridge)
- Adapter-модуль (изолирован от ядра): маппинг канон↔Rubitime (branch/service/specialist/record id) — переиспользовать `rubitime_booking_profiles`, `booking_branch_services.rubitime_*`.
- Read-bridge: проекция `appointment_records`/`rubitime_records` → канонический `appointment` (чтобы данные не потерялись).
- Переключатель моста в `system_settings` (новый ключ, например `booking_rubitime_bridge_enabled`): добавить в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`) + `ADMIN_SCOPE_KEYS` (`app/api/admin/settings/route.ts`).
- **Не ломать** текущий вебхук-пайплайн (`apps/integrator/src/integrations/rubitime/*`, `apps/webapp/src/modules/integrator/events.ts`).
- Чек: проекция существующих записей в канон верифицируется; флаг отключает мост.

### Шаг 1.7 — Миграции, сидирование, перенос (todo s1-migrate)
- drizzle-kit generate + migrate; сид дефолтной организации; маппинг текущих `booking_*` → новая модель.
- План rollback/совместимости в `LOG.md`.
- Чек: миграции применяются и откатываются на тест-БД.

### Шаг 1.8 — UI-паритет (todo s1-ui) — [`UI_SURFACES_CHECKLIST.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) §A1–A5, §A14
- Расширить/заменить admin CRUD на новую модель: организация, филиалы, кабинеты, специалисты, услуги, матрица доступности `специалист×филиал×кабинет×город×услуга`, флаг публичной видимости.
- Переиспользовать паттерн `RubitimeSection.tsx` + `/api/admin/booking-catalog/*`; соблюдать `ui-copy-no-excess-labels`, `ui-select-trigger-display-label`.
- Добавить admin-поверхность переключателя Rubitime bridge (вкл/выкл) и статус синхронизации/маппинга как минимум в read-виде.
- Чек: админ создаёт полную структуру без дублей услуг через UI.

### Шаг 1.9 — Верификация и док〮 (todo s1-verify)
- Целевые тесты (модель, FSM, проекция) + `pnpm --filter webapp typecheck`/`lint`.
- Обновить `docs/ARCHITECTURE/DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md` (раздел про мост/каноника), `LOG.md`, статус этапа 1 в `ROADMAP.md`.

## Definition of Done (этап 1)
- [x] Организационная модель + услуги + доступность без дублей (ТЗ §2,3,22.1).
- [x] Канонический `appointment` со статусами (§17) и append-only событиями; каркас таймлайна.
- [x] `organization_id` на всех новых таблицах (C1); module-isolation соблюдён; новые таблицы — Drizzle.
- [x] Проекция Rubitime в канон работает; мост отключаем флагом; текущий пайплайн не сломан (C8). Двусторонний sync — этапы 2–4.
- [x] Admin UI §A1–A5 и §A14 присутствует.
- [x] Тесты/typecheck/lint зелёные; docs и статусы обновлены.

## Gate
Этап 2 не стартует, пока DoD этапа 1 не закрыт по контрактам модели/портов. Любое сужение — в `SCOPE_DECISIONS.md`.
