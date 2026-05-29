---
name: "Own Booking Engine — Stage 2: Patient booking on canonical engine"
overview: "Этап 2: создание записи в собственной БД (без зависимости от Rubitime-ID), настраиваемые поля записи, слот-движок (доступность + несколько слотов подряд + защита от двойного бронирования), рабочее расписание, уведомления пациенту/врачу. Источник — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 2."
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: "s2-write"
    content: "createBooking создаёт канонический appointment без зависимости от rubitimeId; Rubitime — побочный синк через адаптер"
    status: pending
  - id: "s2-fields"
    content: "Модель настраиваемых полей записи (booking_form_field + submission) + серверная валидация обязательных"
    status: pending
  - id: "s2-slots"
    content: "Слот-движок: доступность по специалист/филиал/кабинет/услуга/расписание; фильтр город→услуги"
    status: pending
  - id: "s2-multi"
    content: "Несколько последовательных слотов подряд + защита от двойного бронирования (констрейнт/транзакция)"
    status: pending
  - id: "s2-schedule"
    content: "Рабочее расписание/блокировки: working_hours/availability_rule/schedule_block + ручное создание брони админом"
    status: pending
  - id: "s2-notify"
    content: "Уведомления: пациенту (создана/подтверждена), врачу/админу (новая запись) через reminders/notify пайплайн"
    status: pending
  - id: "s2-ui"
    content: "UI: пациентский визард на каноне; admin-конструктор полей записи; запись видна врачу/админу (UI §C-book, §A6, §B-list)"
    status: pending
  - id: "s2-public-base"
    content: "Базовый публичный create-контракт (без полного виджета): API/валидация/идентификация по телефону как фундамент этапа 3"
    status: pending
  - id: "s2-verify"
    content: "Тесты слот-движка/валидации; typecheck/lint; обновить api.md, модульные README, LOG.md, ROADMAP.md"
    status: pending
---

# Этап 2 — Базовая запись пациента

> ТЗ: `STAGE_CHECKLISTS.md` §Этап 2 (ТЗ §4,5,6,7,18). Зависит от этапа 1 (канон + статусы + события).

## Контекст существующего кода

- Текущий create: `apps/webapp/src/modules/patient-booking/service.ts` `createPatientBookingService.createBooking` → `BookingSyncPort.createRecord` (integrator M2M Rubitime), ждёт `rubitimeId` (`rubitime_id_missing`). Порты: `apps/webapp/src/modules/patient-booking/ports.ts`. Инфра: `apps/webapp/src/infra/repos/pgPatientBookings.ts`. M2M: `apps/webapp/src/modules/integrator/bookingM2mApi.ts`.
- API: `apps/webapp/src/app/api/booking/create/route.ts`, `cancel`, `slots`, `my`, `catalog/*` (гард `requirePatientBookingTrustedPhoneAccess`/`requirePatientApiBusinessAccess`).
- Пациентский визард (4 шага): `apps/webapp/src/app/app/patient/booking/new/**` (`FormatStepClient`/`ServiceStepClient`/`SlotStepClient`/`ConfirmStepClient`), хуки `cabinet/useBookingSlots.ts`/`useCreateBooking.ts`, каталог `booking/bookingCatalogRsc.ts`.
- Слоты сейчас: `bookingM2mApi.fetchSlots` → integrator `/rubitime/slots`. На этапе 2 расчёт слотов переносится в собственный слот-движок (Rubitime — только зеркало).
- Уведомления: `apps/webapp/src/modules/reminders/*`, integrator delivery (`outgoing_delivery_queue`), broadcasts `modules/doctor-broadcasts/*`.

## Scope boundaries

- **Можно трогать:** `modules/patient-booking/*`, новый `modules/booking-scheduling/*` (слот-движок), `modules/booking-engine/*` (из этапа 1), `infra/repos/pg*`, `app/api/booking/*`, пациентский визард `app/app/patient/booking/new/**`, admin-конструктор полей, `buildAppDeps.ts`, docs.
- **Вне scope:** полный публичный UX/встраивание (JS-виджет/iframe/popup, CSP, Tilda — этап 3), оплаты/предоплата (5), абонементы (6), переносы/отмены-политики (4 — здесь только базовая отмена как сейчас). Не удалять Rubitime-синк (мост из этапа 1 остаётся).

## Декомпозиция

### Шаг 2.1 — Канонический write-путь (todo s2-write)
- Переписать `createBooking`: создаёт `appointment` в каноне (этап 1) и ставит статус «создана»/«подтверждена» по правилам; Rubitime-создание выносится в **идемпотентный** побочный синк через адаптер-мост (не блокирует ядро; при выключенном мосте запись всё равно создаётся).
- Сохранить обратную совместимость чтения `my`/кабинета на переходный период (читать канон, при необходимости проецировать).
- Чек: запись создаётся без `rubitimeId`; при включённом мосте Rubitime-зеркало обновляется; юнит-тест на оба режима.

### Шаг 2.2 — Настраиваемые поля (todo s2-fields) — ТЗ §5
- Drizzle: `booking_form_field` (тип, обязательность, видимость пациенту/админу, порядок, placeholder), `booking_form_submission` (ответы по записи).
- Поддержать типы: имя/фамилия/телефон/email/комментарий/описание проблемы/жалобы/произвольный текст/кастомные. Комментарий — настраиваемый (вкл/обязательность) (§5.2).
- Серверная валидация обязательных (не только в UI).
- Чек: невалидный сабмит отклоняется на сервере; ответы сохраняются и доступны для карточки (этап 9).

### Шаг 2.3 — Слот-движок (todo s2-slots) — ТЗ §7, §3.3
- Новый доменный сервис `modules/booking-scheduling/` (ports + чистая логика, юнит-тестируемая без БД): расчёт слотов по специалист/филиал/кабинет/услуга/длительность/расписание/существующие записи/блокировки/отсутствия; тех. зазоры (если заведены).
- Фильтр «город → доступные услуги» по `service_location_availability`/`specialist_service_availability` (этап 1).
- Заменить источник слотов в `slots/route.ts` и `useBookingSlots.ts` на собственный движок.
- Чек: пациент видит только реально доступные варианты; сценарий разных услуг по городам.

### Шаг 2.4 — Несколько слотов подряд + анти-double-booking (todo s2-multi) — ТЗ §6
- Показ непрерывных интервалов; проверка свободы цепочки; блокировка непрерывного периода с учётом длительности/кабинета/специалиста/филиала.
- Защита от конкурентного двойного бронирования на уровне БД (exclusion constraint/транзакция; ср. существующий `slotOverlap.ts`).
- Чек: параллельные брони на пересекающийся слот — одна успешна; тест на цепочку слотов.

### Шаг 2.5 — Расписание/блокировки (todo s2-schedule) — ТЗ §7.1
- Drizzle: `working_hours`, `availability_rule`, `schedule_block` (рабочее время/блокировки/отсутствия по специалисту×филиалу/кабинету).
- Ручное создание брони/блока админом (заготовка под календарь этапа 8).
- Чек: слот-движок учитывает рабочие часы/блокировки.

### Шаг 2.6 — Уведомления (todo s2-notify) — ТЗ §18, C4
- Пациенту: «запись создана»/«подтверждена»; врачу/админу: «новая запись».
- Интегрировать с существующим пайплайном (`modules/reminders/*` / integrator delivery), без нового канала.
- Чек: события записи порождают уведомления (тест на вызов notify).

### Шаг 2.7 — UI (todo s2-ui) — [`UI_SURFACES_CHECKLIST.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) §C-book, §A6, §B-list
- Пациентский визард работает на каноне (автоподстановка профиля, запрос только недостающих полей, выбор города/филиала/специалиста/услуги/слота, несколько слотов подряд).
- Admin-конструктор полей записи (новый раздел в `app/app/settings/` + ключ/route, либо доменная таблица с CRUD API).
- Кабинет врача/админа показывает новую запись (на переходе — из канона; полный перевод чтения врача с `appointment_records` фиксируется здесь или планируется к этапу 8).
- Соблюдать `patient-ui-shared-primitives`, `ui-copy-no-excess-labels`.
- Чек: e2e/smoke по визарду; админ настраивает поля; врач видит запись.

### Шаг 2.8 — Базовый публичный контракт (todo s2-public-base) — ТЗ §4.1, §4.3
- Подготовить минимальный публичный create-путь как контракт для этапа 3: серверная операция создания записи без сессии, идентификация по телефону, та же доменная валидация обязательных полей/слотов.
- Без финального виджета и без embedding-политик (это этап 3), но API/модель должны уже поддерживать публичный канал записи.
- Чек: интеграционный тест «create without session by phone» проходит; запись попадает в канон.

### Шаг 2.9 — Верификация (todo s2-verify)
- Юнит-тесты слот-движка/валидации/FSM; целевые e2e визарда (lean, см. `webapp-tests-lean-no-bloat`); `typecheck`/`lint`.
- Обновить `apps/webapp/src/app/api/api.md`, `modules/patient-booking/patient-booking.md`, `LOG.md`, `ROADMAP.md`.

## Definition of Done (этап 2)
- [ ] Запись создаётся в каноне без зависимости от Rubitime-ID; мост — побочный синк (C8).
- [ ] Базовый публичный create-контракт без сессии готов (как фундамент этапа 3), идентификация по телефону работает (C5).
- [ ] Все новые сущности этапа (`booking_form_*`, `working_hours`/`availability_rule`/`schedule_block`) tenant-aware: `organization_id` + фильтрация в query (C1).
- [ ] Обязательные поля настраиваются и валидируются на сервере (§5).
- [ ] Слот-движок собственный; фильтр город→услуги; несколько слотов подряд; анти-double-booking (§6,§7).
- [ ] Расписание/блокировки учитываются; ручная бронь админом возможна.
- [ ] Уведомления пациенту и врачу (§18, C4).
- [ ] UI §C-book/§A6/§B-list; тесты/typecheck/lint зелёные; docs/статусы обновлены.

## Gate
Этапы 3 и 4 стартуют после закрытия DoD этапа 2 (общее ядро записи). Сужения — в `SCOPE_DECISIONS.md`.
