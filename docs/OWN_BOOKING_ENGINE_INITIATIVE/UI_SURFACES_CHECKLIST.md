# UI_SURFACES_CHECKLIST — поверхности кабинетов (админ / врач / пациент / публичный вход)

Требование владельца: **все настройки и вся информация должны быть доступны в UI** соответствующих кабинетов. Этот файл — обязательный чек-лист поверхностей. Этап не закрывается (`done`), если данные/правила существуют в БД, но ими нельзя управлять или их нельзя увидеть в нужном кабинете.

Маркировка ролей: **A** = админ (настройки клиники/SaaS), **B** = врач/специалист (рабочее место, может пересекаться с админом в текущей моноклинике), **C** = пациент (личный кабинет), **P** = публичный вход (вне `/app`).

Соблюдать UI-правила проекта: `patient-ui-shared-primitives.mdc`, `ui-copy-no-excess-labels.mdc`, `ui-select-trigger-display-label.mdc`, `cms-unified-media-picker-layout.mdc` (где есть медиа). Платёжные ключи редактируются в admin Settings и хранятся в `system_settings`.

---

## A. Админ / настройки клиники (этап ввода в скобках)

- [x] **A1. Организация/клиника** — CRUD клиники, реквизиты, дефолтный tenant (этап 1). UI: `BookingEngineSection`, API `/api/admin/booking-engine/organizations`.
- [x] **A2. Филиалы/локации** — CRUD филиалов (город/адрес/точка) (этап 1). API `branches`, `branches/[id]`.
- [x] **A3. Кабинеты** — CRUD кабинетов внутри филиала (этап 1). API `rooms`, `rooms/[id]`.
- [x] **A4. Специалисты** — CRUD специалистов; привязка к клинике/филиалам/кабинетам (SpecialistLocation/SpecialistRoom) (этап 1). API `specialists`, `specialist-rooms`.
- [x] **A5. Услуги и доступность** — CRUD услуг (название, длительность, цена, описание, активность, флаги: предоплата/абонементы/онлайн-оплата/публичный виджет); матрица доступности `специалист × филиал × кабинет × город × услуга`; флаг «публичная запись vs только ручное назначение» (этап 1; флаги предоплаты заполняются на 5). API `services`, `availability`.
- [x] **A6. Настройки полей записи** — конструктор BookingFormField: тип, обязательность, видимость пациенту/админу, порядок, placeholder; вкл/обязательность комментария; кастомные вопросы (этап 2).
- [x] **A7. Публичный виджет** — генерация кода вставки (JS/iframe/popup/ссылка), конструктор UTM/город/`branchServiceId`; мердж кандидатов; просмотр `attribution_json` (этап 3). `/app/doctor/admin/booking`.
- [x] **A8. Политики отмены и переноса** — раздельные CancellationPolicy/ReschedulePolicy; уровни (клиника/специалист/услуга/продукт); сроки, лимиты, разрешения (другой филиал/город/специалист/услуга), поведение при превышении, требование подтверждения, уведомления (этап 4).
- [x] **A9. Платёжные провайдеры** — `BookingPaymentsSection`: вкл/откл оплаты, список провайдеров, default, webhook secret (mock/yookassa); `system_settings`.
- [x] **A10. Предоплата** — `BookingPrepaymentSection`: политика по услуге и по онлайн-категории.
- [x] **A11. Абонементы-продукты** — конструктор готовых абонементов (состав, цена; `BookingCatalogPackagesSection`, API `packages`) (этап 6).
- [x] **A12. Продукты/акции/подписки/курсы** — `BookingCatalogProductsSection` (создание/редактирование, pay-link); типы через `product_type`; срок, услуги, slug материалов (этап 7).
- [x] **A13. Уведомления** — `BookingEventNotificationsSection` + `system_settings.booking_lifecycle_notifications` (события created/cancelled/rescheduled/payment_captured; пациент/персонал).
- [x] **A14. Rubitime-мост** — переключатель вкл/откл; статус/маппинг; read-bridge проекция (этап 1). API `bridge`, `system_settings.booking_rubitime_bridge_enabled`. Двусторонняя синхронизация — этапы 2–4. Селекторы read sources: `booking_doctor_appointments_read_source`, `booking_slots_read_source` (`BookingEngineSection`).
- [x] **A15. Рабочие часы** — `BookingWorkingHoursSection` + API `GET|POST|PATCH|DELETE /api/admin/booking-engine/working-hours` (scope specialist/branch/room, weekday 1=Пн, fallback indicator). `/app/doctor/admin/booking`.
- [x] **A16. Блокировки расписания** — scoped `BookingScheduleBlocksSection` + API `schedule-blocks` (GET filters `specialistId`/`branchId`/`roomId`, POST scope). `/app/doctor/admin/booking`.

## B. Врач / специалист (рабочее место)

- [x] **B-list. Список записей** — read switch (`appointment_records` по умолчанию / `be_appointments` при cutover), фильтры дашборда, действия через booking-engine lifecycle API (этап 8).
- [x] **B-calendar. Календарь** — luxon+shadcn grid: записи/free slots/статусы/филиалы/кабинеты/специалисты/услуги; фильтры; создание/перенос/отмена (canonical mode); legacy events read-only; `freeSlotsEnabled` из API; lifecycle/оплата/абонемент; `AppointmentStaffCommentsSection` (этап 8 + 9).
- [x] **B-actions. Ручные решения** — отмена с выбором типа (бесплатная/штраф/списать/не списывать/удержать/вернуть предоплату/индивидуально); ручной перенос; override автоматики (этап 4).
- [x] **B-pay. Оплаты записи** — `BookingStaffPaymentPanel` в ручном lifecycle (admin/doctor); API `GET .../appointments/[id]/payment`.
- [x] **B-package. Абонементы пациента** — назначение каталога/индивидуального, список по `platformUserId`, consume API, ссылка на оплату (`BookingPatientPackagesSection`, этап 6; полная карточка — этап 9).
- [x] **B-products. Продукты пациента** — `BookingPatientProductsSection`: список по `platformUserId`, ручное списание визита; при записи — выбор покупки в wizard пациента (этап 7).
- [x] **B-merge. Мердж пациентов** — `/app/doctor/booking-merge` + `AdminMergeAccountsPanel` в списке booking-кандидатов (этап 3).
- [x] **B-card. Карточка клиента** — `ClientBookingHistoryPanel`: таймлайн/оплаты/визиты; booking-репутация; `AppointmentStaffCommentsSection` на вкладке визитов; `DoctorNotesPanel` (этап 9).

## C. Пациент (личный кабинет, `/app/patient/**`)

- [x] **C-book. Запись** — выбор города/филиала/специалиста/услуги/слота; автоподстановка профиля; запрос только недостающих полей; несколько слотов подряд; опциональный абонемент или покупка (promo/gift/single_visit) на шаге подтверждения (`ConfirmStepClient`, этап 2 + 6 + 7).
- [x] **C-actions. Перенос/отмена** — кнопки в своей записи; перенос как изменение существующей; применение политик/лимитов; понятные сообщения о штрафе/невозможности (этап 4).
- [x] **C-pay. Оплата/предоплата** — `/app/patient/booking/pay`, «Оплатить» в предстоящих, `PatientBookingPaymentHistorySection`.
- [x] **C-package. Абонементы** — список, остаток по позициям (с названиями услуг), оплата `/app/patient/memberships/pay`, деталь `/app/patient/memberships/[id]`; покупка каталога через API `catalog` + `purchase` (этап 6; расширенная история — этап 9).
- [x] **C-products. Продукты/покупки** — `/app/patient/purchases`, каталог API, оплата `/app/patient/purchases/pay`; доступ к материалам по grants (этап 7).
- [x] **C-history. История** — `PatientBookingHistorySection` в профиле и оплаты на `/app/patient/purchases`; API `GET /api/booking/history` (этап 9).

## P. Публичный вход (вне `/app`, для Tilda)

- [x] **P-page. Публичная страница записи** — `/book/new` без сессии; очный + онлайн флоу (этап 3).
- [x] **P-widget. Встраивание** — `/book/embed.js`; CSP; параметры/UTM (этап 3).
- [x] **P-pay. Оплата из публичного входа** — `/book/pay` (запись), `/book/product/{token}` + pay (продукт), API `public/products/*`, `public/payment-status`, `public/payments/mock-complete`.

---

## Кросс-роль чек (для каждой настройки/сущности)

Для любой новой настройки или сущности агент обязан подтвердить:
- [x] Кто **создаёт/редактирует** (роль A или B) — поверхность есть.
- [x] Кто **видит результат** (B и/или C и/или P) — поверхность есть.
- [x] Тексты соответствуют `ui-copy-no-excess-labels.mdc` (без лишних пояснений) и patient-терминологии (`patient-lfk-means-rehab-program.mdc`, где применимо).
- [x] Селекты с opaque-value используют `displayLabel`/`items` (`ui-select-trigger-display-label.mdc`).
- [x] Patient-страницы используют shared-примитивы (`patient-ui-shared-primitives.mdc`); медиа-превью — статичная картинка по правилу.
