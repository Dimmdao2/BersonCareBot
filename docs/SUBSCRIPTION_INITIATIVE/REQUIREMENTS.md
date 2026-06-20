# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — REQUIREMENTS

> Planner (Opus), §3 канона `docs/AGENT_AUTORUN_SCHEME.md`. Фаза планирования.
> Этот файл — боли владельца **ДОСЛОВНО** + подтверждённые код-факты (что есть / чего нет).
> ⚠️ Читать вместе с `ROADMAP.md` и `OPEN_QUESTIONS.md`. Спорное НЕ угадывать — см. OPEN_QUESTIONS.

---

## 0. Боли владельца — ДОСЛОВНО (без упрощения)

Фича: **АБОНЕМЕНТ** (предоплаченный пакет сеансов) у пациента.

1. **Финансы-вкладка карточки пациента:** завести абонемент **с указанием ДАТЫ** (дата покупки/начала).
2. **Задним числом + авто-пересчёт:** если абонемент заведён ПОЗДНИМ числом (раньше сегодня), то по **кнопке «Пересчитать»** автоматически пересчитывается и **СПИСЫВАЕТСЯ уже на прошедшие после покупки сеансы** — т.е. визиты пациента, случившиеся между датой абонемента и сегодня, должны быть списаны с абонемента (уменьшить остаток).
3. **Календарь:** везде отображать/помечать, если запись идёт **по абонементу** (владелец: «пока как-нибудь, потом поправим» — достаточно грубой видимой пометки).
4. **Карточка пациента, ВИЗИТ:** на визите видеть, что он по абонементу.
5. **Страница ОБЗОР:** показать ОСНОВНОЕ про абонемент (краткая сводка — что за абонемент, остаток сеансов и т.п.).

---

## 1. ГЛАВНЫЙ КОД-ФАКТ: абонементы УЖЕ существуют как зрелая подсистема «memberships»

**В репозитории УЖЕ есть полноценная система абонементов** (booking-engine «Stage 6 memberships»), которой ~80% болей покрываются — но НЕ во вкладке «Финансы» и БЕЗ кнопки «Пересчитать». Это меняет суть инициативы: это **не «построить с нуля»**, а **«перенести/связать существующую систему в нужные места UI + добавить недостающий backfill-пересчёт»**.

### 1.1 Модель данных (drizzle, УЖЕ есть)
`apps/webapp/db/schema/bookingMemberships.ts` (миграции `0094`, `0095`, `0105`):
- `be_subscription_packages` — каталожные шаблоны абонементов (org-scoped): `title`, `priceMinor`, `validityDays`, `deductionMode`.
- `be_package_items` — состав шаблона (услуга × количество).
- `be_patient_packages` — **экземпляр абонемента пациента**. Ключевые поля для болей:
  - `soldAt` (timestamptz) — **ДАТА продажи/начала** (боль #1) ✅ уже есть.
  - `validFrom` / `validUntil`, `validityDays`.
  - `status`: `offered | awaiting_payment | active | expired | cancelled`.
  - `deductionMode`: `auto_on_visit_confirmed | manual`.
  - `priceMinor`, `paidAmountMinor`, `paidCurrency`, `title`, `notes`, `assignedByPlatformUserId`.
- `be_patient_package_items` — позиции экземпляра (услуга × `quantityInitial`).
- `be_package_usages` — **append-only ledger списаний** (`reserve | consume | release | penalty | manual_adjust | refund`), с `appointmentId`, `quantity`, `occurredAt`.
- `be_package_history_events` — журнал событий абонемента.

**Баланс НЕ хранится** — выводится из ledger в `apps/webapp/src/modules/memberships/balanceCalculator.ts` (`remaining` / `displayRemaining`).

### 1.2 Сервис/модуль (УЖЕ есть)
`apps/webapp/src/modules/memberships/` — `service.ts`, `ports.ts`, `balanceCalculator.ts`, `fefoPicker.ts`, `packageValidity.ts`, `types.ts`, `memberships.md`. Реализовано:
- Создание абонемента (manual / из каталога) **с `soldAt`** и `activateImmediately`.
- `reserveForAppointment` / `consumeForAppointment` / `releaseReserveForAppointment` / `refundConsumedAppointmentPackage` / `manualConsume` — **списание ПО ОДНОЙ записи**.
- `listPatientPackageSessions(..., { includePast })` — выводит ВСЕ записи (appointments) по услугам абонемента, с флагом `isPast`, `linkage` (`none|reserved|consumed|penalty`), и доступными действиями (`canManualConsume`, `canRefundConsumed`, ...).
- `onVisitConfirmed` hook (`wrapBookingEngineMembershipHooks`) — авто-списание при переходе записи в `visit_confirmed`/`completed`, если `deductionMode=auto_on_visit_confirmed`.
- FEFO авто-подбор активного абонемента при создании записи.

### 1.3 API (УЖЕ есть) — `apps/webapp/src/app/api/doctor/booking-engine/patient-packages/`
- `GET/POST /api/doctor/booking-engine/patient-packages` — список / создать (manual+catalog, принимает `soldAt`, `paidAmountMinor`, `items`).
- `PATCH .../[id]` — заметки.
- `GET .../[id]/sessions?includePast=` — записи абонемента + серверные `actions`.
- `POST .../[id]/consume` — ручное списание (1 позиция, опц. `appointmentId`).
- Зеркало под `/api/admin/booking-engine/...`.
- Гейт: `requireDoctorBookingEngine()` (роль-гейт; **проверка владения пациентом — см. OPEN_QUESTIONS / IDOR-память**).

### 1.4 UI (УЖЕ есть, но НЕ в «Финансы»)
- **Вкладка «Записи»** (`PatientTabRecords.tsx`): смонтирована панель **`DoctorClientMembershipsPanel`** (`apps/webapp/src/app/app/doctor/clients/`). В ней: создание индивидуального/каталожного абонемента **с полем «Дата продажи» (`DoctorDatePicker`)**, ценой, позициями; ручное списание сеанса; карточки активных абонементов (`PatientPackageCard`, `PatientPackageSessionsList`).
- **Вкладка «Обзор»** (`PatientTabOverview.tsx`): УЖЕ есть KPI-виджет «Package» (`activePackage`, `packageStatus`), тянет `/api/doctor/booking-engine/patient-packages` (**боль #5 частично закрыта**).
- **Календарь** (`ScheduleCalendarTab.tsx`): УЖЕ помечает запись по абонементу — префикс `✅` в заголовке события + фильтр **«По абонементу»** (`bySubscriptionInPeriod` = `packageUsageRef || packageTitle`). Поля `packageUsageRef`/`packageTitle` идут через `booking-calendar/types.ts` + `mapLegacyRecordToCalendarEvent.ts` (**боль #3 частично закрыта**).

### 1.5 ОТДЕЛЬНАЯ система платежей (НЕ путать с абонементами)
Вкладка **«Финансы»** (`PatientTabFinances.tsx`) сегодня работает с ДРУГОЙ таблицей — `patient_payment` (`apps/webapp/db/schema/patientPayments.ts`): ledger наличных (`cash`) и эквайринга (`acquiring`), timeline `/api/doctor/patients/{userId}/payment-timeline`. **Понятия «абонемент» в этой вкладке СЕЙЧАС НЕТ.** Это две разные подсистемы; боль #1 требует свести управление абонементом во вкладку «Финансы».

---

## 2. Что есть / чего нет — по каждой боли (карта покрытия)

| # | Боль | Статус в коде | Что НЕ хватает (net-new) |
|---|------|----------------|---------------------------|
| **1** | Завести абонемент во вкладке **Финансы** с **датой** | Создание с `soldAt` есть, но в панели на вкладке **«Записи»**, не «Финансы» | Перенести/встроить заведение абонемента (или его сводку+форму) во вкладку «Финансы». Не дублировать панель — переиспользовать `DoctorClientMembershipsPanel`/сервис. |
| **2** | Задним числом + **кнопка «Пересчитать»** → авто-списание уже **прошедших** сеансов между датой и сегодня | **НЕТ единой операции.** Есть `listPatientPackageSessions(includePast)` (находит прошедшие записи) + `manualConsume` (списывает ПО ОДНОЙ). | **Net-new bulk-операция «Пересчитать»**: найти все прошедшие записи (по услугам абонемента) с датой ≥ `soldAt` и ≤ сегодня, ещё НЕ списанные, списать их с абонемента (идемпотентно). + Кнопка в UI + API. |
| **3** | Календарь: пометка «по абонементу» | **ЕСТЬ** (✅-префикс + фильтр «По абонементу»). | Подтвердить визуально, что после bulk-пересчёта прошедшие записи тоже получают `packageUsageRef`/`packageTitle` → пометку. Возможна доработка видимости пометки (owner: «грубо, потом поправим»). |
| **4** | На **визите** в карточке видеть, что он по абонементу | **НЕТ.** Проекция визита (`patient-clinical/ports.ts` `Visit`, `listVisits`) несёт `appointmentRecordId`, но НЕ несёт признак абонемента. `NewVisitPanel`/`PatientTabKarta` не показывают абонемент. | Net-new: протянуть признак «по абонементу» (через `appointmentRecordId` → `package_usage_ref`/`package_title`) в проекцию визита + показать бейдж в карточке визита. |
| **5** | **Обзор**: основное про абонемент (что за абонемент, остаток) | **ЧАСТИЧНО ЕСТЬ** (KPI-виджет Package). | Проверить, что виджет показывает «остаток сеансов» и обновляется после «Пересчитать». При нехватке — расширить сводку. |

---

## 3. Подтверждённые технические факты (для исполнителей)

- **Связь визит ↔ запись ↔ абонемент:** `clinical_visit.appointmentRecordId` → `appointmentRecords.id`; запись (appointment) несёт `package_usage_ref` (ссылка на `be_package_usages`) и в календарном слое — `packageTitle`. Это цепочка для болей #3/#4.
- **«Прошедший сеанс» для списания:** в `listPackageAppointmentSessionSources` уже есть выборка appointments по услугам абонемента c `isPast` (start < now). Это основа для bulk-пересчёта (#2) — НЕ изобретать заново.
- **Баланс derived из ledger** — bulk-пересчёт обязан писать `consume` в `be_package_usages` (append-only), НЕ мутировать остаток напрямую.
- **Суммы — в копейках** (integer), never float (`priceMinor`, `amountMinor`).
- **Деньги/каналы в dev — мок.** Заведение абонемента — учётная запись в БД; НЕ требует живой оплаты для статуса (manual `priceMinor=0` активируется без оплаты). Реальные отправки в dev запрещены (§1b AGENTS.md).

## 4. §6 ALWAYS-критерии (обязательны во всех этапах)
1. ⛔ Нет сырому SQL — только drizzle.
2. Чистота слоёв: `modules/*` не лезут в `@/infra/db|repos`; только через `ports.ts` + DI (`buildAppDeps`). Сервис абонементов уже так построен — **переиспользовать `deps.memberships`**, не плодить новый модуль.
3. ⛔ Нет дублированию: переиспользовать существующие `DoctorClientMembershipsPanel`, `PatientPackageCard`, `memberships` service. Эталон UI — страница упражнений + `shared/ui/doctor/*`.
4. Нет серверному поиску, если можно в UI. Нет избыточной fetch-подгрузке (предпочесть SSR/initial props по образцу соседних табов).
5. Таб = смысловой блок в общий контейнер; общий верхний шаблон страниц.
6. Тесты — только по своему коду; полный CI — контролёром перед пушем; всё через `run-tests.sh` (flock).
7. Ведение `LOG.md` в `docs/SUBSCRIPTION_INITIATIVE/` + синхронизация `memberships.md`.

## 5. Прочитать правила репо (обязательно перед кодом)
`AGENTS.md` + `.cursor/rules/*.mdc` (особенно `clean-architecture-module-isolation`, `doctor-ui-shared-primitives`, `dev-prod-isolation-no-real-creds`, `test-execution-policy`). Канон оркестрации — `docs/AGENT_AUTORUN_SCHEME.md`. Модульный док — `apps/webapp/src/modules/memberships/memberships.md`.
