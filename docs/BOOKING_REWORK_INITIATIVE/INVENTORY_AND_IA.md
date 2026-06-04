# INVENTORY_AND_IA — инвентаризация и информационная архитектура

**Статус:** согласован для этапа 0 (2026-06-04)  
**Связанный roadmap:** [`ROADMAP.md`](ROADMAP.md) · этап 0

Документ фиксирует текущее состояние кабинета записи, источники данных, контракты переходного периода и целевую карту вкладок **до** крупных UI-правок этапа 1.

---

## 1. Текущая навигация

Базовый путь: `/app/doctor/admin/booking`  
Константы: `apps/webapp/src/app/app/doctor/admin/booking/bookingAdminTabs.ts`

| # | Вкладка | Маршрут | Страница / клиент | Основные компоненты |
|---|---------|---------|-------------------|---------------------|
| 1 | Обзор | `/app/doctor/admin/booking` | `page.tsx` | `BookingOverviewPanel`, `BookingCatalogHelp` |
| 2 | Каталог | `…/catalog` | `catalog/page.tsx` | `BookingEngineSection mode="catalog"` |
| 3 | Доступность | `…/availability` | `availability/page.tsx` | `BookingEngineSection mode="availability"` |
| 4 | Расписание | `…/schedule` | `schedule/page.tsx` | `BookingWorkingHoursSection`, `BookingScheduleBlocksSection`, `BookingScheduleSlotsProbeSection` |
| 5 | Форма | `…/form` | `form/page.tsx` | `BookingFormFieldsSection layout="table"` |
| 6 | Правила | `…/rules` | `BookingRulesPageClient` | `BookingPoliciesSection`, `BookingEventNotificationsSection` |
| 7 | Оплата | `…/payments` | `payments/page.tsx` | `BookingPaymentsSection`, `BookingPrepaymentSection`, каталоги packages/products |
| 8 | Публичная | `…/public` | `public/page.tsx` | `BookingPublicWidgetSection`, `BookingPublicAttributionSection` |
| 9 | Операции | `…/operations` | `BookingOperationsPageClient` | patient packages/products, manual lifecycle, merge candidates |
| 10 | Интеграции | `…/integrations` | `integrations/page.tsx` | `BookingEngineSection mode="integrations"`, `RubitimeSection` |

API админки записи: `/api/admin/booking-engine/*` (канон), `/api/admin/booking-catalog/*` (legacy Rubitime-каталог), `/api/admin/settings` (read-source switches).

---

## 2. Карта «текущее → целевое» по вкладкам

Целевая навигация этапа 1 — см. [`ROADMAP.md` §7](ROADMAP.md).

### 2.1. Обзор

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Содержание | Readiness-чеклист (организация, филиалы, **специалисты**, услуги, доступность, часы, форма, оплата, публичная ссылка); блок «Текущий режим» (`Канон`/`Rubitime`, mapping counts); предупреждения | **Переработать** (этап 1): рабочее состояние записи, не технический чеклист |
| Источник данных | `loadBookingAdminOverview.ts` → `be_*` + `system_settings` + bridge summary | Сохранить канон как primary; скрыть jargon |
| Специалисты в readiness | Обязательный пункт «Специалисты» | **Скрыть из UX** — solo-specialist: один default specialist, не выбирается |
| Кабинеты | Не в readiness, но в каталоге | Не показывать как обязательный пункт |
| Read-source | «Записи врача / Слоты / Календарь: Канон или Rubitime» | В основном блоке **не показывать**; конфликт read-source — предупреждение с понятным текстом |
| Mapping counts | «маппинг: филиалы N, специалисты N…» | **Integration-only** — ссылка «Открыть Rubitime-маппинг» |
| Быстрые ссылки | Каталог, Доступность, Публичная, Интеграции | Обновить на: Локации, Услуги, Расписание, Rubitime-маппинг |

### 2.2. Каталог → Локации + Услуги

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Структура | Одна вкладка: Организация, **Филиал**, **Кабинет**, **Специалист**, Услуга | **Разделить** на две вкладки: `Локации`, `Услуги` |
| Филиал | `be_branches` + поле `cityCode` «Город» | **Переименовать** в «Локация»; `cityCode` — advanced/integration |
| Кабинет | CRUD `be_rooms`, привязка к филиалу | **Скрыть из основного UX**; default internal room при необходимости runtime |
| Специалист | CRUD `be_specialists`, выбор филиала | **Скрыть из основного UX** — один default specialist |
| Организация | Редактирование title | Оставить в advanced или в Обзоре одной строкой |
| Услуга | `priceMinor` вводится как число копеек; «Публичная запись»; «Только вручную» | **Переименовать** флаги; **исправить** ввод/отображение цены в рублях |
| Источник | `be_*` через `/api/admin/booking-engine/*` | Без изменения БД на этапе 1 |

### 2.3. Доступность

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| UI | Три формы связей + матрица: «Специалист × кабинет», «Услуга × филиал», «Специалист × услуга × филиал × город × кабинет» | **Упростить** до матрицы «услуга × локация» (toggle) |
| Таблица | Колонки Тип / Специалист / Услуга / Филиал; прочерки «—» | Заменить на понятную таблицу локаций × услуг |
| Специалист / город / кабинет | Явные поля формы | **Скрыть** — подставлять default specialist и branch из локации |
| Технические таблицы | `be_specialist_service_availability`, `be_service_location_availability`, `be_specialist_rooms` | Писать через адаптер solo UX; `be_specialist_rooms` не показывать |

### 2.4. Расписание

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Рабочие часы | `BookingWorkingHoursSection` — список с деактивацией, без нормального редактирования интервалов | **Переработать**: редактор дня, несколько интервалов, перерывы как разрыв |
| Блокировки | `BookingScheduleBlocksSection` — технические записи без контекста | **Переименовать/пояснить** в UI: отпуск, личное, закрытие локации |
| Probe слотов | `BookingScheduleSlotsProbeSection` | Оставить как инструмент проверки; привязать к локации + услуге |
| Scope | `specialistId`, `branchId`, `roomId` в API | В solo UX — выбор **локации**; specialist/room — internal |
| Fallback | `usesWorkingHoursFallback` → 09:00–18:00 | Предупреждение в Обзоре до настройки |
| Источник | `be_working_hours`, `be_schedule_blocks` | Канон |

### 2.5. Форма

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| UI | `BookingFormFieldsSection layout="table"` — сырые ключи полей | **Переработать** в конструктор вопросов (этап 1) |
| Источник | `be_booking_form_fields` | Канон |
| Публичный контракт | `GET /api/booking/form-fields`, валидация при create | **Не ломать** |

### 2.6. Правила

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Содержание | Отмена, перенос, уведомления | **Оставить** структуру вкладок; улучшить copy при необходимости |
| Источник | `be_cancellation_policies`, `be_reschedule_policies`, `booking_lifecycle_notifications` | Канон + system_settings |

### 2.7. Оплата

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Содержание | Провайдеры, предоплата, каталоги packages/products | **Частично вынести** packages/products → новая вкладка «Абонементы и продукты» (этап 1 roadmap) |
| Оплата записи | `booking_payment_enabled`, prepayment policies | **Оставить** на вкладке «Оплата» |
| Источник | `be_prepayment_policies`, `be_packages`, `be_products`, payments module | Канон |

### 2.8. Публичная

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Виджет | `BookingPublicWidgetSection` — выбор услуги через **`branchServiceId`** | **Переработать** на `{ branchId, serviceId }` или скрытый резолв; до этапа 2 — минимум скрыть UUID |
| Attribution | UTM / deep links | **Оставить** |
| Публичные API | `/book/new`, `/api/booking/public/*` | Контракт `branchServiceId` сохранять до этапа 2 |

### 2.9. Операции

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Содержание | Поиск пациента, назначение packages/products, manual lifecycle, merge | **Оставить** вкладку; packages/products дублируются с Оплатой — вынести каталоги на отдельную вкладку |
| Manual booking | `BookingManualLifecycleSection` | **Оставить**; упростить поля (локация/услуга вместо branchService) — этап 1–2 |
| Merge | `BookingMergeCandidatesSection` | **Оставить** (операционный инструмент) |

### 2.10. Интеграции → Интеграция Rubitime

| Аспект | Сейчас | Решение |
|--------|--------|---------|
| Канон-блок | Read-source switches, bridge toggle, «Проецировать записи», mapping counts | **Оставить** как advanced; переименовать вкладку |
| RubitimeSection | Полный CRUD legacy `booking_*`: cities, branches, services, specialists, **branch_services** | **Оставить** здесь; это единственное место для Rubitime-дублей |
| Специалисты Rubitime | Per-branch specialists с `rubitimeCooperatorId` | **Integration-only** — не показывать в основном каталоге |
| Bridge | `booking_rubitime_bridge_enabled`, POST bridge projection | **Сохранить контракт** |

---

## 3. Целевая карта вкладок (IA)

**Базовая (этап 1, реализовано):** 12 вкладок — см. ниже.

**Принято владельцем (этап 5, 2026-06-04):** см. [`LOG.md`](LOG.md) §«Принято владельцем». Код ещё на 12 вкладках — целевая IA ниже.

**Настройки** — `/app/doctor/admin/booking` (только конфигурация):

```text
/app/doctor/admin/booking
├── Обзор и настройка              ← runbook (ссылки в шагах), метрики, локации, услуги, доступность, правила
├── Форма и публичная запись
├── Оплата
└── Интеграция Rubitime
```

**Работа врача** — не в admin booking:

```text
/app/doctor/calendar (и/или единая рабочая «Запись»)
├── Календарь / сетка + рабочее время
├── Список актуальных записей (слева) + панель действий (справа)
└── Клик по записи → детали + перенос / отмена / …

/app/doctor/clients/[id]  (и смежные зоны кабинета)
└── Абонементы и продукты пациента (продажа, списание, отвязка) — не admin «Операции»
```

**Убрать из продукта:** вкладка «Операции» в настройках; термин «операции» как название вкладки. Manual lifecycle → рабочая «Запись»; merge → существующий пункт «Объединение пациентов».

```text
/app/doctor/admin/booking
├── Обзор                          ← переработать содержание
├── Локации                        ← из «Каталог» (be_branches)
├── Услуги                         ← из «Каталог» (be_clinic_services)
├── Доступность                    ← услуга × локация
├── Расписание                     ← по локации
├── Форма                          ← конструктор
├── Правила                        ← без смены маршрута
├── Оплата                         ← провайдеры + предоплата
├── Абонементы и продукты          ← NEW: из payments/operations
├── Публичная запись               ← rename «Публичная»
├── Операции                       ← manual lifecycle, merge
└── Интеграция Rubitime            ← integrations + mapping UI
```

**Вне кабинета записи (не менять в этапе 0–1 scope):**

- `/app/doctor/calendar` — календарь (этап 4 инициативы)
- `/app/patient/booking/new/*` — patient flow (очная запись через `branchServiceId` до этапа 2)
- `/book/new/*` — public widget
- Онлайн-ветка (нутрициология / реабилитация) — **вне scope**

---

## 4. Источники данных

### 4.1. Canonical `be_*`

| Область | Таблицы / сущности | Где в UI |
|---------|-------------------|----------|
| Каталог | `be_organizations`, `be_branches`, `be_rooms`, `be_specialists`, `be_clinic_services` | Каталог |
| Доступность | `be_specialist_service_availability`, `be_service_location_availability`, `be_specialist_rooms` | Доступность |
| Расписание | `be_working_hours`, `be_schedule_blocks`, `be_availability_rules` | Расписание |
| Записи | `be_appointments`, lifecycle/history tables | Календарь, операции, patient create |
| Форма | `be_booking_form_fields` | Форма |
| Абонементы | `be_packages`, `be_patient_packages`, `be_package_usages`, products | Оплата, Операции |
| Маппинг | `be_external_entity_mappings` | Bridge, резолв branchServiceId → canonical |

### 4.2. Legacy `booking_*` (Rubitime-каталог)

| Таблицы | Назначение | Где в UI |
|---------|------------|----------|
| `booking_cities`, `booking_branches`, `booking_services`, `booking_specialists`, `booking_branch_services` | Rubitime-facing каталог; **`booking_branch_services.id` = `branchServiceId`** | `RubitimeSection` только |
| API | `/api/admin/booking-catalog/*` | Интеграции |

Patient/public UI выбирает услугу через legacy join → получает `branchServiceId` для слотов и create.

### 4.3. `patient_bookings`

- Совместимость и уведомления; связь `canonical_appointment_id` с `be_appointments`.
- Create/cancel/reschedule пишут и в канон, и в `patient_bookings`.
- **Контракт:** статусы, `branchServiceId`, `cityCodeSnapshot` для in_person — сохранять до cutover.

### 4.4. `appointment_records`

- Legacy-проекция Rubitime для кабинета врача при `booking_doctor_appointments_read_source=rubitime_legacy`.
- После этапа 4 календарь врача **не читает** `appointment_records` и работает только от canonical (`be_appointments`); `appointment_records` остаётся для legacy-list/KPI до полного cutover.
- При canonical cutover — проекция из `be_appointments` (`integrator_record_id = be:{id}`).
- **Контракт:** не удалять таблицу в переходный период; soft-delete API сохраняется.

### 4.5. `be_external_entity_mappings`

- Связь external (Rubitime / legacy) ↔ canonical IDs.
- Критично для: bridge projection, `resolveCanonicalFromBranchService`, abonnement service resolution (**этап 3 `done`** — sessions UI + mapping badge).
- Metadata `legacy_branch_service_id` на entity type `availability`.
- **Контракт:** все новые маппинги — через bridge/admin, не ручной SQL в одной схеме.

### 4.6. `system_settings` (scope `admin`)

| Ключ | Значения | Влияние |
|------|----------|---------|
| `booking_doctor_appointments_read_source` | `rubitime_legacy` \| `canonical` | Список записей врача, KPI (календарь с этапа 4 — canonical-only) |
| `booking_slots_read_source` | `rubitime` \| `canonical` | Patient/public слоты и логика **create** |
| `booking_rubitime_bridge_enabled` | boolean | Двусторонняя синхронизация Rubitime |
| `booking_calendar_show_working_hours` | boolean | Фон calendar (`working`/`break`) в `/app/doctor/calendar` |
| `booking_default_organization_id` | uuid | Tenant default |
| `booking_payment_enabled`, `booking_payment_providers` | — | Prepayment flow |
| `booking_lifecycle_notifications` | — | Уведомления при cancel/reschedule |
| `booking_allow_doctor_unlink_past_package_sessions` | boolean | Отвязка прошедших записей от абонемента (этап 3; UI: `/app/doctor/admin/booking/rules`) |

Read-source switches остаются на вкладке интеграции; в основном UX — только предупреждение о конфликте.

---

## 5. Зависимость очной записи от `branchServiceId`

### 5.1. Что такое `branchServiceId`

UUID строки `booking_branch_services` — связка **legacy**: филиал + услуга + Rubitime-специалист + Rubitime service id. Не является продуктовой сущностью solo-specialist UI.

### 5.2. Runtime-зависимости (проверка `rg branchServiceId apps/webapp/src`)

**Patient / public create & slots (контракт после этапа 2):**

- `GET /api/booking/slots`, `GET /api/booking/public/slots` — primary query **`branchId` + `serviceId`**; legacy **`branchServiceId`** (dual-input, deprecated log)
- `POST /api/booking/create`, `POST /api/booking/public/create` — body **`branchId` + `serviceId`** или legacy **`branchServiceId`** для `in_person`
- `GET /api/booking/in-person-services?branchId=` — каталог услуг локации
- UI: `/app/patient/booking/new/*`, `/book/new/*` — primary `{ branchId, serviceId }`; reschedule/deep links — legacy compat
- Memberships/products available: **`?branchId=&serviceId=`** (primary) или legacy **`?branchServiceId=`**; unmapped → `branch_service_mapping_missing`

**Create pipeline:**

- `patient-booking/service.ts` → `canonicalCreate.ts`: для in_person вызывает `bookingCatalog.resolveBranchService` + `bookingScheduling.resolveInPersonContext`
- Резолв канона: `pgBookingScheduling.resolveCanonicalFromBranchService` → `be_external_entity_mappings` (metadata `legacy_branch_service_id`) → `be_specialist_service_availability`

**Staff / integrator:**

- `emitPackageCalendarSync`, `staffBookingIntegratorEvent` — передают `branchServiceId` в события
- `pgPatientBookings` — хранит `branch_service_id`

**Admin (скрыто из UX, internal resolve):**

- `BookingPublicWidgetSection` — ссылка с canonical pair или legacy compat

### 5.3. Решение переходного периода

| Фаза | Действие |
|------|----------|
| **Этап 1 (solo UX)** | Скрыть `branchServiceId`, Rubitime-дубли специалистов, кабинеты из основного кабинета. Публичный виджет — human labels, internal resolve. |
| **Этап 2 (adapter)** — **выполнено 2026-06-04** | Patient/public in_person: primary `{ branchId, serviceId }` (`GET /api/booking/in-person-services`, wizard). Legacy `branchServiceId` — dual-input + server resolve (`resolveInPersonBranchServiceId`). Rubitime mapping UI + `POST /api/admin/booking-engine/rubitime-mapping/link` (legacy row + SSA + availability mapping). |
| **2.3b cutover (ops)** | `booking_slots_read_source=canonical` — после smoke и `mapped_ok` на staging. `booking_doctor_appointments_read_source=canonical` — закрыт в этапе 4 (календарь canonical-only). |

**Online booking** уже не использует `branchServiceId` — не трогаем.

---

## 6. `roomId` / `be_rooms` — где нельзя «просто скрыть»

Проверка: `rg "roomId|be_rooms|specialist-rooms" apps/webapp/src apps/webapp/db` (~40 файлов).

| Зона | Использование | Риск при скрытии UI |
|------|---------------|---------------------|
| `be_specialist_service_availability.roomId` | Опционально в SSA | Solo UX: null или auto default room |
| `be_appointments.roomId` | Nullable | Manual/create может писать null |
| `be_working_hours`, `be_schedule_blocks` | Scope filter optional | API принимает `roomId`; solo — scope по branch |
| Slot calculation | `buildSlotsForContext` | Room влияет только если задан в контексте |
| Calendar filters | `calendarLegacyFilters`, admin calendar query | Internal default |
| `specialist-rooms` API | Link specialist × room | **Не показывать**; при необходимости seed one default link |

**Вывод:** скрытие кабинета из UX **безопасно** при условии default/null `roomId` в write-path solo adapter (этап 1 implementation note).

---

## 7. Read-source переключатели

| Setting | Default (типично) | Читает | Пишет |
|---------|-------------------|--------|-------|
| `booking_doctor_appointments_read_source` | `rubitime_legacy` | `appointment_records` или `be_appointments` (календарь этапа 4 этот switch не использует) | — |
| `booking_slots_read_source` | зависит от cutover | Rubitime API или `booking-scheduling` | Create path в `canonicalCreate` |

**Конфликтные комбинации** (warning в overview):

- appointments = Rubitime, slots = canonical
- appointments = canonical, slots = Rubitime

Календарь (`/app/doctor/calendar`) после этапа 4 работает canonical-only и не следует `booking_doctor_appointments_read_source`.

**Контракт переходного периода:** switches остаются в integration UI; cutover — осознанное действие админа, не side-effect UI-рефактора.

---

## 8. Сущности, скрываемые из основного UX (без удаления из БД)

| Сущность | Таблица / поле | Куда девается |
|----------|----------------|---------------|
| Кабинет | `be_rooms`, `be_specialist_rooms` | Internal / default |
| Специалист (выбор) | `be_specialists` (multi) | Default one; Rubitime duplicates → integration |
| Город (как поле формы) | `be_branches.cityCode`, `booking_cities` | Advanced / Rubitime mapping |
| `branchServiceId` | `booking_branch_services` | Internal resolve; Rubitime tab |
| Rubitime cooperator | `booking_specialists.rubitimeCooperatorId` | Integration only |
| Read-source labels «Канон» | system_settings UI | Integration tab |
| Mapping counts | bridge summary | Integration tab |
| SSA matrix dimensions | specialist × city × room | Collapse to service × location |

---

## 9. Контракты Rubitime, сохраняемые на переходный период

1. **Legacy catalog CRUD** — `RubitimeSection` + `/api/admin/booking-catalog/*` для cities/branches/services/specialists/branch_services.
2. **Rubitime API create/cancel/reschedule** — при `booking_slots_read_source=rubitime` или bridge-enabled best-effort sync.
3. **`be_external_entity_mappings`** — bridge entity types (branch, specialist, service, availability, appointment).
4. **`booking_rubitime_bridge_enabled`** + POST `/api/admin/booking-engine/bridge` projection.
5. **`appointment_records`** — read path для legacy mode и post-projection rows.
6. **`patient_bookings.rubitime_id`** — связь с Rubitime record для отмены/зеркала.
7. **Integrator events** — `booking.created/cancelled/rescheduled` с Rubitime payload где применимо.

Ломать эти контракты можно только в этапе 2 с явным adapter-слоем и регрессионными тестами.

---

## 10. Shared UI-компоненты (точки изменений этапа 1)

Компоненты в `apps/webapp/src/app/app/settings/` переиспользуются кабинетом записи:

| Компонент | Текущие потребители |
|-----------|---------------------|
| `BookingEngineSection` | catalog, availability, integrations |
| `BookingEngine*List` | catalog lists |
| `BookingAvailabilityMatrixTable` | availability |
| `BookingWorkingHoursSection`, `BookingScheduleBlocksSection` | schedule |
| `BookingFormFieldsSection` | form |
| `RubitimeSection` | integrations |
| `BookingPublicWidgetSection` | public |

Рефактор этапа 1: новые секции или modes поверх тех же API, без смены портов без необходимости.

---

## 11. Проверки этапа 0 (выполнено)

| Проверка | Результат |
|----------|-----------|
| `rg branchServiceId apps/webapp/src` | ~90+ совпадений; критический путь: patient/public slots+create, canonicalCreate, memberships/products resolve, patient_bookings storage |
| `rg roomId\|be_rooms\|specialist-rooms` | ~40 файлов; room nullable/opcional — скрытие UX OK с default strategy |
| `rg booking_slots_read_source\|booking_doctor_appointments_read_source` | Keys in system_settings, buildAppDeps, overview, BookingEngineSection integrations mode |
| IA document | Этот файл |

---

## 12. Критерии закрытия этапа 0

- [x] Согласованная карта новых вкладок (§3)
- [x] Список сущностей, скрываемых из основного UX (§8)
- [x] Список контрактов Rubitime на переходный период (§9)
- [x] Описание зависимости `branchServiceId` и фаз перехода (§5)
- [x] Карта текущих вкладок с источниками данных (§1–2, §4)

**Gate для этапа 1:** владелец постановки подтверждает IA (этот документ) перед началом крупных UI-правок.
