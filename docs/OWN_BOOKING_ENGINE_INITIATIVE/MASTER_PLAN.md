# MASTER_PLAN — собственный движок записи пациентов

Канонический мастер-план инициативы. Источник требований — [`SOURCE_SPEC.md`](SOURCE_SPEC.md). Поэтапные обязательные результаты — [`STAGE_CHECKLISTS.md`](STAGE_CHECKLISTS.md).

## Git-ветка инициативы

Вся реализация (этапы 1–9) ведётся в одной долгоживущей ветке:

**`initiative/own-booking-engine`**

- Коммиты и PR по инициативе — только из этой ветки (не смешивать с несвязанными фичами на `main`).
- Перед стартом этапа: `git fetch` и rebase/merge от актуального `main` в `initiative/own-booking-engine`.
- После закрытия всей инициативы — один merge в `main` (или серия согласованных PR по этапам в ту же ветку, затем merge).

---

## 1. Видение и целевая модель

Собственная система (webapp, схема `public`) — **единственный источник правды** для: записей, услуг, филиалов, кабинетов, специалистов, расписаний, абонементов, продуктов, оплат, переносов, отмен, истории пациента. Rubitime и Google Calendar на переходном этапе — **зеркала/адаптеры**, а не владельцы данных.

Целевые свойства:
- **Канонизация:** запись создаётся и живёт в собственной БД; внешние системы получают проекцию.
- **Гибкая модель доступности:** услуга — общая сущность; доступность задаётся связями `специалист × локация × кабинет × услуга` (без дублей услуг под комбинации).
- **Конфигурируемость без релиза:** обязательные поля, политики отмены/переноса, предоплата, платёжные провайдеры — данные/настройки, а не код.
- **SaaS-готовность:** все доменные сущности несут `organization_id` (tenant) с первого этапа, даже если сейчас один арендатор.
- **Полная событийность (история):** ни одно состояние не хранится «только как текущее» — каждое значимое действие порождает событие в таймлайне (append-only), пригодное для карточки клиента.

## 2. Текущее состояние (после этапов 1–9)

- **Write (этап 2–3, done):** при подключённых `bookingEngine` + `bookingScheduling` в `buildAppDeps` пациентский и публичный `createBooking` создают `be_appointments` и `patient_bookings` с `canonical_appointment_id`; Rubitime — best-effort при `booking_rubitime_bridge_enabled`. Legacy-путь через integrator остаётся только без канонического DI (in-memory/тесты).
- **Слоты (этап 2):** собственный движок `booking-scheduling` (`0089`: working_hours, schedule_blocks, exclusion на пересечения); `slotCount` для цепочек слотов.
- **Поля записи (этап 2):** `be_booking_form_fields` / submissions; admin CRUD; визард отправляет `formAnswers`.
- **Публичный канал (этап 3, done):** `/book/new` без сессии (очный + онлайн), embed `/book/embed.js`, CSP для Tilda/`dmitryberson.ru`, публичные read-API каталога/слотов/полей, `POST /api/booking/public/create` (rate-limit, UTM в `attribution_json`, `patient_merge_candidates`, admin merge UI).
- **Перенос/отмена (этап 4, done):** миграция `0091` — политики и lifecycle; пациент `cancel`/`reschedule` (канон lifecycle **до** best-effort Rubitime `cancelRecord`; сбой моста не блокирует отмену). Admin/doctor: полные политики в UI, `manual-cancel` / `manual-reschedule`, уведомления `booking_lifecycle_notifications`. Детали — [`LOG.md`](LOG.md) prod-hardening 2026-05-30.
- **Read:** кабинет врача — календарь `/app/doctor/calendar` и список `/app/doctor/appointments` читают канон (`be_appointments`; календарь + блокировки и free/busy слоты при фильтрах).
- Идентичность: live-события Rubitime + публичная запись по телефону; кандидаты мерджа при коллизии имён; историч. backfill (PHASE_07) — deferred.
- **Оплаты (этап 5, done):** `modules/payments`; адаптеры `mock` + `yookassa` (`paymentProviderRegistry`); конфиг в `system_settings.booking_payment_providers`; webhook `/api/payments/webhook/[provider]`; mock fallback. UI: `BookingPaymentsSection` (shopId/apiKey для ЮKassa).
- **Абонементы (этап 6, done):** миграция `0094`, `modules/memberships` + `pgMemberships`; баланс из append-only `be_package_usages`; оплата `package_purchase` / `productRef=patient_package:{id}`; reserve до confirm при `POST /api/booking/create` + `patientPackageId`; auto-consume через `wrapBookingEngineMembershipHooks` (`visit_confirmed` / `completed`); отмена — `release` / `penalty` (C6, `chargePackageSessionOnLate` в `policyResolver`); patient API (`memberships`, `available`, `catalog`, `purchase`, `[id]`); staff `packages` / `patient-packages` / `consume`; UI §A11/§B-package/§C-package + wizard `ConfirmStepClient` + `/app/patient/memberships/[id]`. План: [`.cursor/plans/archive/own_booking_stage6_memberships.plan.md`](../../.cursor/plans/archive/own_booking_stage6_memberships.plan.md).
- **Продукты (этап 7, done):** миграция `0095` + journal; `modules/products` + `modules/entitlements`; `be_products` / `be_product_purchases` / `be_product_pay_links` (`product_type`: promo, gift, course, subscription, …); оплата `product_purchase`; fulfillment после capture; связь по телефону; запись с **`productPurchaseId`**; grants на `content/[slug]` и разделы; публично `/book/product/{token}`; staff `BookingPatientProductsSection` + consume API; UI каталог/покупки/confirm wizard. План: [`.cursor/plans/archive/own_booking_stage7_products_courses.plan.md`](../../.cursor/plans/archive/own_booking_stage7_products_courses.plan.md).
- **Календарь (этап 8, done):** `modules/booking-calendar` + `pgBookingCalendar`; API `GET /api/doctor|admin/booking-engine/calendar` (`serviceId`, `includeFreeSlots`); UI `/app/doctor/calendar` (день/неделя/месяц, фильтры, карточка с lifecycle/оплатой/абонементом); free/busy слоты через `booking-scheduling`; список `/app/doctor/appointments` → `pgDoctorCanonicalAppointments` (`be_appointments`); GCal зеркало `syncCanonicalAppointmentToCalendar` (`be:{id}`), integrator hook на `booking.*` и `payment_captured`. Q3: luxon+shadcn grid. План: [`.cursor/plans/archive/own_booking_stage8_calendar.plan.md`](../../.cursor/plans/archive/own_booking_stage8_calendar.plan.md).
- **Карточка клиента / история (этап 9, done):** миграция `0096`; `modules/client-history` (`clientHistoryUtils`, `labels`) + `pgClientHistory` — read-агрегатор: `be_patient_timeline_events`, `be_payment_history_events`, `be_package_history_events` / fallback `be_package_usages`, `be_product_history_events` / `be_product_purchases` (phone-fallback), reschedule/cancel, `doctor_notes`, staff comments; dedupe/enrichment оплат; `be_patient_booking_profiles` + `be_appointment_staff_comments`; API doctor `clients/[userId]/history`, `booking-profile`, `appointments/[id]/comments`; patient `GET /api/booking/history`; guard `booking_blocked` на patient/public create; UI `ClientBookingHistoryPanel`, `AppointmentStaffCommentsSection` (карточка визитов + календарь), `PatientBookingHistorySection` (profile + purchases). Q6: ручной режим репутации. Модуль: `apps/webapp/src/modules/client-history/client-history.md`. План: [`.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md`](../../.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md).

**Следующий gate:** инициатива закрыта по этапам 1–9; merge в `main` / отключение Rubitime — отдельное решение ([`ROADMAP.md`](ROADMAP.md)).

## 3. Архитектурные принципы (обязательны на всех этапах)

1. **Clean Architecture / module isolation.** Доменная логика — в `apps/webapp/src/modules/<domain>/` (service + ports.ts). Инфраструктура — в `infra/repos/pg*.ts` реализует порт. Сборка зависимостей — только в `buildAppDeps`. Route-хендлеры тонкие. (`.cursor/rules/clean-architecture-module-isolation.mdc`.)
2. **Новые таблицы — только Drizzle ORM** (`apps/webapp/db/schema/*.ts`), миграции через drizzle-kit. Без raw SQL для новых фич. Полиморфные ссылки (например `linked_object`/`item_ref`) — без FK в БД, валидация в service.
3. **Конфигурация интеграций — в `system_settings` (scope `admin`/`global`), не в ENV.** Ключи добавляются в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`) и синхронизируются в integrator через `updateSetting`. Это абсолютное правило для платёжных провайдеров (`.cursor/rules/000-critical-integration-config-in-db.mdc`).
4. **Multi-tenant с первого дня.** Каждая доменная таблица несёт `organization_id`. Запросы фильтруются по tenant. Сейчас сидируется одна дефолтная организация (текущая клиника Берсона).
5. **Append-only история.** Любое изменение записи/оплаты/абонемента пишет событие (`*_event` / timeline) — для карточки клиента и аудита.
6. **Деньги — целочисленно в минорных единицах** (`amountMinor` + `currency`), как уже сделано у `courses`.
7. **Идемпотентность платежей и вебхуков.** Платёжные интенты и колбэки провайдеров обрабатываются идемпотентно (ключи), как уже принято для integrator push/M2M.
8. **Совместимость с Rubitime — через явный адаптер.** Двусторонний мост изолирован в отдельном модуле; ядро не знает про Rubitime. Можно отключить мост настройкой.
9. **Политики как данные.** `cancellationPolicy` и `reschedulePolicy` — отдельные конфигурируемые политики (не одна общая), привязываемые по уровням (клиника / специалист / услуга / продукт) с разрешением приоритета.
10. **UI-паритет.** Каждая новая настройка/сущность обязана иметь поверхность в соответствующем кабинете (см. [`UI_SURFACES_CHECKLIST.md`](UI_SURFACES_CHECKLIST.md)). Этап не закрывается, если данные есть, а управлять/видеть их в UI нельзя.

## 4. Сквозные (cross-cutting) требования — действуют во всех этапах

Эти требования агенты обязаны проверять в каждом этапе, где они применимы. Их **запрещено** откладывать «на потом» молча — только явным решением в `SCOPE_DECISIONS.md`.

- **C1. Multi-tenant scoping** — `organization_id` на новых таблицах + фильтрация.
- **C2. Статусная модель записи** (§17 ТЗ) — единый enum статусов; переходы валидируются в service; статус влияет на оплату/абонемент/штраф/уведомление/историю.
- **C3. История/таймлайн** (§16 ТЗ) — append-only события для записей, оплат, абонементов, продуктов.
- **C4. Уведомления** (§18 ТЗ) — для каждого значимого события есть уведомление пациенту и/или специалисту/админу; интеграция с существующим reminder/notification пайплайном.
- **C5. Идентификация и мердж пациента** (§4.4, §12.2 ТЗ) — телефон как основной идентификатор для внешней записи; кандидаты на мердж (`PatientMergeCandidate`) + ручной/полуавтоматический мердж.
- **C6. Связь оплаты/абонемента с записью при переносе/отмене** (§8, §9, §10, §11) — сохраняется на всех переходах.
- **C7. Защита от обхода штрафов через перенос** (§8.4, §22.3) — хранить исходную дату и историю переносов; пересчёт права на бесплатную отмену с учётом исходной записи.
- **C8. Rubitime-мост** — на этапах, меняющих запись, поддерживать двустороннюю синхронизацию, пока мост включён.
- **C9. UI-паритет во всех трёх кабинетах** — см. C-чек-лист в `UI_SURFACES_CHECKLIST.md`.
- **C10. Конфигурируемость** — новые правила/ключи кладутся в конфиг (`system_settings` или доменные настроечные таблицы), а не хардкодятся.

## 5. Обзор этапов (детали — в STAGE_CHECKLISTS.md)

| # | Этап | Главный результат |
|---|------|-------------------|
| 1 | Каноническая модель данных | Собственная организационная модель + каноническое хранение записей + статусы + события; Rubitime-совместимость |
| 2 | Базовая запись пациента | Создание записи в собственной БД из приложения и публичного входа; настраиваемые поля; проверка доступности; уведомления |
| 3 | Публичный виджет / страница записи | Публичная страница + JS-виджет/iframe/popup; Tilda; параметры/UTM; гостевая идентификация |
| 4 | Переносы и отмены | Самостоятельный перенос/отмена; политики и лимиты; ручные решения; защита от обхода; история |
| 5 | Предоплата и базовые оплаты | Платёжный слой + провайдеры из БД; предоплата по услуге; связь оплаты с записью; история оплат |
| 6 | Абонементы | Составные абонементы; ручное создание; готовые продукты-абонементы; списание занятий; остатки в кабинетах |
| 7 | Продукты, акции, подписки, курсы | Универсальная модель продукта; акции/подарки; подписки; курсы; доступы после покупки; связь по телефону |
| 8 | Календарь | Календарь специалиста/админа (готовый компонент по возможности); фильтры; ручные действия; GCal как зеркало |
| 9 | Карточка клиента и полная история | Полный таймлайн пациента: записи/оплаты/абонементы/посещения/переносы/отмены/продукты/комментарии |

Порядок преимущественно последовательный; допустимый параллелизм и зависимости — в [`ROADMAP.md`](ROADMAP.md). Запрещено стартовать этап N+1 до прохождения gate этапа N по затронутым контрактам (правило «не смешивать фазы»).

## 6. Definition of Done всей инициативы

- [x] Собственная БД — канонический источник для всех записей; **кабинет врача** (календарь + список записей) и **карточка клиента** читают канон и append-only историю (этапы 8–9 ✓).
- [x] Создание/перенос/отмена записи не зависят от наличия Rubitime-ID; Rubitime-мост можно отключить настройкой без потери функциональности ядра.
- [x] Услуги не дублируются под комбинации; доступность задаётся связями.
- [x] Запись доступна из приложения и с внешнего сайта (виджет/страница), пригодна для Tilda.
- [x] Обязательные поля записи, политики отмены/переноса, предоплата, платёжные провайдеры — настраиваются в UI и хранятся в БД (провайдеры — в `system_settings`; политики — полный round-trip; A13 уведомления).
- [x] Составные абонементы покупаются/назначаются, занятия списываются (авто/вручную), остатки видны пациенту и специалисту.
- [x] Продукты/акции/подписки/курсы продаются через единый платёжный слой; доступы выдаются после оплаты; связь по телефону работает.
- [x] Календарь специалиста/админа покрывает просмотр/создание/перенос/отмену и фильтры; GCal — только зеркало (этап 8).
- [x] Карточка клиента показывает полную историю взаимодействия (append-only события) (этап 9).
- [x] Все сквозные требования C1–C10 закрыты на применимых этапах; multi-tenant заложен.
- [x] Зелёный `pnpm run ci` на ветке `initiative/own-booking-engine` (этапы 1–9, включая закрытие аудита этапа 9 — 2026-05-30).

## 7. Что НЕ делает этот документ

- Не пишет код и финальный DDL (только ориентиры в `DATA_MODEL_REFERENCE.md`).
- Не декомпозирует этапы до уровня отдельных PR/шагов — это делает агент-исполнитель в `.cursor/plans/*.plan.md` по [`AGENT_BRIEF.md`](AGENT_BRIEF.md).
- Не принимает продуктовые сужения молча — любое сужение фиксируется в `SCOPE_DECISIONS.md` с причиной.
