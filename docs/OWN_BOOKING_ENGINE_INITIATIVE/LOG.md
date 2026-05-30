# LOG — журнал исполнения инициативы

Ведётся по мере работы. Каждый агент при закрытии этапа/значимого шага добавляет запись: что сделано, какие проверки выполнены, какие решения приняты, что намеренно не делали.

---

## 2026-05-30 — Rubitime transitional read + idempotent projection (incident recovery)

**Инцидент:** после деплоя собственного движка кабинет врача перестал показывать будущие записи; кнопка «Проецировать записи» падала с `be_appointments_specialist_no_overlap` (дубль `rubitime_projection` без `be_external_entity_mappings`).

**Root cause:**
- `buildAppDeps` автоматически переключал `doctorAppointmentsPort` на `pgDoctorCanonicalAppointments` при наличии booking engine.
- `pgBookingRubitimeBridge` проверял только mapping по external id и пытался повторно insert в `be_appointments`.

**Сделано:**
- `doctorAppointmentsReadSwitch`: default read = `appointment_records`; cutover через `system_settings.booking_doctor_appointments_read_source` (`rubitime_legacy` | `canonical`).
- `pgBookingRubitimeBridge`: recovery существующей `rubitime_projection` → upsert mapping + history `rubitime_projection_mapping_recovered`, без duplicate insert.
- Ops SQL: `apps/webapp/scripts/rubitime-appointment-mapping-audit.sql`, `backfill-rubitime-appointment-mappings.sql`.
- Ключ `booking_doctor_appointments_read_source` в `ALLOWED_KEYS` и admin settings route.
- Тесты: `doctorAppointmentsReadSwitch.test.ts`, `pgBookingRubitimeBridge.test.ts`.

**Двусторонняя синхронизация (без изменений кода):** `patient-booking/service` по-прежнему вызывает `syncPort.createRecord` / `cancelRecord` / `updateRecord` в legacy- и canonical-путях; integrator продолжает писать `appointment_records` / `rubitime_records`.

**Проверки (локально):** vitest по новым/затронутым файлам; `buildAppDeps.test.ts`.

**Production (оператор):**
1. Задеплоить webapp.
2. Убедиться, что `booking_doctor_appointments_read_source` не установлен в `canonical` (или явно `rubitime_legacy`).
3. `rubitime-appointment-mapping-audit.sql` → при необходимости `backfill-rubitime-appointment-mappings.sql`.
4. Повторить «Проецировать записи» только после backfill.

**Намеренно не делали:** массовое удаление дублей в `be_appointments`; принудительный cutover read на канон.

---

## 2026-05-30 — Prod-hardening: закрытие оставшихся хвостов

**Сделано:**
- Payments: для YooKassa включена реальная проверка webhook (`authorization` и fallback `x-yookassa-signature` + `webhookSecret`), `providerConfig` прокинут в `verifyWebhook`.
- Notifications: `booking_lifecycle_notifications` применяется не только в staff lifecycle, но и в emit-path `booking.created` и `booking.payment_captured`.
- Тесты покрытия: добавлены route tests для `doctor|admin calendar`, `manual-cancel`, `manual-reschedule`, `booking-engine/policies`; UI round-trip test для `BookingPoliciesSection`; доп. кейсы `patient-booking/service` (lifecycle error + idempotent повторная отмена); `admin/settings` для `booking_lifecycle_notifications`; smoke inprocess для `patient/booking/new`.
- UX-polish: `BookingPatientPackagesSection`, `BookingPatientProductsSection`, `BookingStaffPaymentPanel` — человекочитаемые статусы/ошибки без сырых кодов.
- Документация синхронизирована: `MASTER_PLAN`, `ROADMAP`, `STAGE_CHECKLISTS`, `UI_SURFACES_CHECKLIST`.

**Проверки:**
- `pnpm --filter @bersoncare/webapp exec vitest run src/infra/payments/yookassaPaymentProvider.test.ts src/app/api/doctor/booking-engine/appointments/[id]/manual-reschedule/route.test.ts src/app/api/admin/booking-engine/calendar/route.test.ts src/app/api/admin/booking-engine/appointments/[id]/manual-cancel/route.test.ts src/app/api/admin/booking-engine/appointments/[id]/manual-reschedule/route.test.ts src/app/api/admin/booking-engine/policies/route.test.ts src/app/app/settings/BookingPoliciesSection.test.tsx src/modules/patient-booking/service.test.ts src/app/api/admin/settings/route.test.ts` ✅
- `pnpm --filter @bersoncare/webapp exec vitest run e2e/smoke-app-router-rsc-pages-inprocess.test.ts` ✅

---

## 2026-05-30 — Этап 8: календарь специалиста/админа (закрыт)

**Сделано:**
- `modules/booking-calendar` + `pgBookingCalendar`: read `be_appointments` + `be_schedule_blocks`, dedupe payment intents, package title, prepayment flag.
- API: `GET /api/doctor|admin/booking-engine/calendar` (`serviceId`, `includeFreeSlots`); manual appointments с `assertSlotAvailable`.
- UI: `/app/doctor/calendar` (luxon+shadcn, day/week/month, фильтры, lifecycle/оплата/абонемент в карточке); free/busy слоты (SSA duration/room).
- Список `/app/doctor/appointments` → `pgDoctorCanonicalAppointments`; `DoctorAppointmentActions` через booking-engine API.
- GCal: `syncCanonicalAppointmentToCalendar` (`be:{id}`); integrator `booking.*` + `payment_captured` (action `updated`); `canonicalAppointmentId` на emit.
- Q3 закрыт в `SCOPE_DECISIONS.md`.

**Проверки:** vitest `booking-calendar`, `parseCalendarQuery`, `pgBookingCalendar`; integrator `recordM2mRoute`, `sync.test`; webapp `tsc`.

**Доки:** `MASTER_PLAN`, `README`, `ROADMAP`, `STAGE_CHECKLISTS`, `UI_SURFACES`, `DOCTOR_CABINET_NAVIGATION`, `DOCTOR_DASHBOARD_METRICS`, `api.md`; план `.cursor/plans/archive/own_booking_stage8_calendar.plan.md` — `status: completed`.

---

## 2026-05-29 — Создана инфраструктура инициативы (этап 0)

**Сделано:**
- Заведена папка `docs/OWN_BOOKING_ENGINE_INITIATIVE/` с документами:
  - `SOURCE_SPEC.md` — дословное ТЗ владельца (24 раздела), первоисточник (anti-loss).
  - `README.md` — точка входа, связи, обязательные правила.
  - `MASTER_PLAN.md` — видение, архитектурные принципы, сквозные C1–C10, обзор этапов, DoD инициативы.
  - `ROADMAP.md` — таблица 9 этапов, статусы, зависимости, общий gate.
  - `STAGE_CHECKLISTS.md` — ядро: обязательные результаты, способ реализации, приёмка по каждому этапу + матрица покрытия ТЗ.
  - `UI_SURFACES_CHECKLIST.md` — поверхности кабинетов админ/врач/пациент/публичный вход.
  - `DATA_MODEL_REFERENCE.md` — справочник канонических сущностей (ориентир).
  - `AGENT_BRIEF.md` — ТЗ для агента-исполнителя этапа (как строить декомпозированные планы).
  - `SCOPE_DECISIONS.md` — границы, связь с Rubitime/смежными инициативами, открытые `[need-decision]`.
- В `docs/README.md` добавлена ссылка на инициативу (раздел активных инициатив).

**Решения:**
- Источник правды — собственная БД; Rubitime — отключаемый двусторонний мост.
- Multi-tenant (`organization_id`) закладывается с этапа 1 (SaaS-задел), стартует один tenant.
- Платёжные провайдеры — строго `system_settings`, не ENV.
- Смежная инициатива онлайн-консультаций поглощается (после согласования) — реализуется на каноне.

**Проверки:** документация; код не менялся.

**Намеренно не делали:** код, финальный DDL, детальную декомпозицию этапов (по запросу владельца — это задача агентов-исполнителей по `AGENT_BRIEF.md`).

**Открытые вопросы к владельцу:** Q1–Q6 в `SCOPE_DECISIONS.md` §3 (провайдеры, баланс, календарный компонент, домены/CSP виджета, глубина SaaS, пороги «проблемный клиент»).

---

## 2026-05-29 — Этап 1: каноническая модель данных

**Сделано:**
- Drizzle-схема `apps/webapp/db/schema/bookingEngine.ts` (`be_*` таблицы, enum статусов записи, append-only события, таймлайн).
- Миграции `0086_booking_engine_canonical.sql`, `0087_booking_engine_backfill_legacy.sql` (seed организации, перенос `booking_*` → канон).
- Модуль `apps/webapp/src/modules/booking-engine/` (FSM статусов, service, ports), репозитории `pgBookingEngine.ts`, `pgBookingRubitimeBridge.ts` (read-bridge).
- Admin API `/api/admin/booking-engine/*`, UI `BookingEngineSection` на `/app/doctor/admin/booking`.
- Ключи `system_settings`: `booking_default_organization_id`, `booking_rubitime_bridge_enabled`.
- Документ модели: `CANONICAL_MODEL.md`; обновлены `DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md`, `ROADMAP.md` (этап 1 → done).

**Проверки:** `pnpm --filter webapp typecheck`; `vitest run src/modules/booking-engine --project fast` (7 тестов).

**Доработка (закрытие хвостов этапа 1):**
- Модуль `booking-rubitime-bridge` (legacyProjection + тесты); `pgBookingRubitimeBridge` — проекция с разбором payload, привязкой branch/specialist/service через mappings.
- API PATCH/DELETE: `rooms/[id]`, `specialists/[id]`, `services/[id]`; `specialist-rooms`.
- UI: флаги услуг, матрица city/room, specialist×room, service×branch; дефолт моста `false`.
- Миграция `0088_booking_engine_settings_and_mapping_repair.sql` (seed settings, repair specialist/service mappings).
- Тесты: `legacyProjection.test.ts`, `pgBookingEngine.createAppointment.test.ts` (атомарность событий).

**Проверки:** `pnpm --filter webapp typecheck`; vitest `booking-engine`, `booking-rubitime-bridge`, `pgBookingEngine.createAppointment`; полный `pnpm run ci`.

**Миграции 0087/0088 (идемпотентность):** backfill специалистов — join по `created_at`, не по одному `full_name`; `ON CONFLICT` для mappings; литералы org — `::uuid`. Если meta в `drizzle.__drizzle_migrations` записана без фактического SQL — повторно выполнить файлы `0087`/`0088` или `db:seed-drizzle-meta` только после ручного apply.

**Намеренно не делали:** write-путь пациента на канон (этап 2); удаление legacy таблиц; двусторонний Rubitime-sync.

**Rollback:** `DROP` таблиц `be_*` (обратный порядок FK); legacy не трогаются. Backfill idempotent.

**Git:** вся инициатива — ветка `initiative/own-booking-engine` (зафиксировано в `MASTER_PLAN.md` §Git-ветка). Этап 1 — первый коммит в ветке.

---

## 2026-05-29 — Этап 2: базовая запись пациента

**Сделано:**
- Миграция `0089_booking_stage2_scheduling_and_forms.sql`: `be_booking_form_*`, `be_working_hours`, `be_availability_rules`, `be_schedule_blocks`, exclusion на `be_appointments`, `patient_bookings.canonical_appointment_id`.
- Модули `booking-scheduling` (слот-движок), `booking-form` (валидация/CRUD полей).
- Канонический `createBooking` (`canonicalCreate.ts`): запись без обязательного `rubitimeId`; мост — best-effort.
- API: `GET /api/booking/form-fields`, `POST /api/booking/public/create`, admin `form-fields`, `appointments/manual`.
- UI: `BookingFormFieldsSection` на `/app/doctor/admin/booking`.
- `resolveOrCreateUserByPhone` + `TrustedPatientPhoneSource.PublicBookingByPhone`.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `booking-scheduling`, `booking-form`, `patient-booking/service`.

**Намеренно не делали:** полный публичный виджет/Tilda (этап 3); полный перевод календаря врача на канон (этап 8); двусторонний Rubitime write-sync beyond create mirror.

**Доработка миграций (идемпотентность):** `0087` — маппинг специалистов по `created_at`, `ON CONFLICT` для mappings; `0088` — seed settings (`booking_*` keys), repair mappings; литералы org — `::uuid` в SQL, значение org в JSON — строка (для `readSettingString`).

---

## 2026-05-29 — Этап 2: доведение до полной реализации (после аудита)

**Сделано:**
- Пациентский визард: `slotCount` на шаге слота, `durationMinutes` в URL, динамические поля на подтверждении (`formAnswers` → API).
- Admin: полный CRUD полей (`BookingFormFieldsSection`); блокировки расписания (`schedule-blocks` API + `BookingScheduleBlocksSection`).
- Тесты: `canonicalCreate.test.ts`, канонический путь в `service.test.ts`; `canonicalAppointmentId` в типах и мапперах.
- Исправления: `0089` в drizzle journal; `AppointmentProjectionPort` в `patient-booking/ports`; mapping Rubitime после sync; ESLint-изоляция модулей.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `patient-booking`, `booking-scheduling`, `booking-form`, `SlotStepClient`.

**Намеренно не делали:** публичный виджет/Tilda (этап 3); полный календарь врача на каноне (этап 8).

---

## 2026-05-29 — Этап 3: публичный виджет / страница записи

**Сделано:**
- Миграция `0090_booking_stage3_public_widget.sql`: `be_appointments.attribution_json`, `patient_merge_candidates`.
- Публичная воронка `/book/new` (без сессии), скрипт `/book/embed.js` (iframe/popup/ссылка), CSP `frame-ancestors` для Tilda и `dmitryberson.ru`.
- API без auth: `GET /api/booking/public/catalog/*`, `slots`, `form-fields`; `POST /api/booking/public/create` (rate-limit, UTM/атрибуция, `bookingChannel: public_widget`).
- Кандидаты мерджа при коллизии «телефон + аккаунт без телефона с тем же именем»; admin: `BookingMergeCandidatesSection`, код вставки `BookingPublicWidgetSection`.
- Исправлен `source` канонической записи: `public_widget` по `bookingChannel`, не по наличию `userId`.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `parseBookingAttribution`, `booking/public/create/route`.

**Намеренно не делали:** публичная оплата (этап 5).

---

## 2026-05-29 — Этап 5: предоплата и платёжный слой

**Сделано:**
- Миграция `0092_booking_stage5_payments.sql`: `be_prepayment_policies`, `be_payment_intents`, `be_payments`, `be_refunds`, `be_payment_provider_events`, `be_payment_history_events`; `patient_bookings.status` + `awaiting_payment`.
- Модуль `modules/payments` (порт, сервис, mock-провайдер, калькулятор предоплаты); `infra/repos/pgPayments.ts`.
- `system_settings`: `booking_payment_enabled`, `booking_payment_providers` (merge/redaction секретов).
- Интеграция: каноническое создание → `awaiting_payment` + intent; capture → `paid` → `confirmed`; отмена staff/patient → refund/retain.
- API: вебхук `/api/payments/webhook/[provider]`, `POST /api/booking/payments/mock-complete`, `GET /api/booking/payment-status`, admin prepayment policies + appointment payment summary.
- UI: `BookingPaymentsSection`, `BookingPrepaymentSection` (admin booking); пациент `/app/patient/booking/pay`.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `prepaymentCalculator`, `payments/service`, `canonicalCreate`.

**Намеренно не делали:** YooKassa/реальный эквайринг (Q1); баланс пациента (Q2); §A13 расширенные уведомления об оплате.

---

## 2026-05-29 — Этап 5: закрытие хвостов после аудита

**Сделано:**
- `0093`: предоплата по `online_category`; `payment_ref` на capture; carry-over при staff/patient reschedule.
- API: doctor `GET .../payment`; public `payment-status`, `mock-complete`; `GET /api/booking/payment-history`.
- UI: A9 (список провайдеров), A10 (очно + онлайн), B-pay panel, C-pay (история + upcoming), P-pay `/book/pay`.
- Integrator: `booking.payment_captured` (schema + handler).
- Тесты: `payment-routes.test.ts`; правки `service.test`, `prepaymentCalculator.test`.
- Документы: `STAGE_CHECKLISTS` §5, `UI_SURFACES` A9/A10/B-pay/C-pay/P-pay, `DATA_MODEL_REFERENCE` §оплаты.

**Проверки:** `pnpm --filter webapp typecheck`; vitest payment + payments module.

---

## 2026-05-29 — Этап 5: ревью качества (post-audit)

**Исправлено:**
- Drizzle `patient_bookings_status_check`: добавлен `awaiting_payment` (синхрон с миграцией `0092`).
- `getAppointmentPaymentSummary`: котировка предоплаты для **онлайн** через `prepaymentContextFromBooking`; staff API подтягивает `patient_bookings` по `canonical_appointment_id`.
- `getByCanonicalAppointmentId` на порте бронирований; `loadStaffAppointmentPaymentSummary` для admin/doctor.
- UI: переключение scope в `BookingPrepaymentSection`; стабильные ключи истории в B-pay.

**Проверки:** typecheck; vitest `payments/*`, `canonicalCreate`, `payment-routes` (15 тестов).

---

## 2026-05-29 — Этап 5: синхронизация документации и плана

**Сделано:**
- План: `.cursor/plans/archive/own_booking_stage5_prepayment_payments.plan.md` — `status: completed`, todos (включая 0093, audit, notify), DoD и карта кода.
- `README.md` (ссылка на archive), `api.md`, `patient-booking.md`, `modules/payments/payments.md`, `DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md`.

---

## 2026-05-29 — Этап 3: закрытие хвостов после аудита

**Сделано:**
- `0090` в `drizzle-migrations/meta/_journal.json`; ESLint: admin merge API через `buildAppDeps().patientMergeCandidate`, rate-limit в allowlist.
- Онлайн-ветка в `/book/new` (rehab_lfk, nutrition); deep-link `branchServiceId`, preset city/online `type`+`category`.
- Admin: `BookingPublicAttributionSection`, конструктор UTM/ссылок в `BookingPublicWidgetSection`; `GET .../public-appointments`.
- Мердж: `patient-merge-candidate` service, `markResolvedForUserPair` после `POST /api/doctor/clients/merge`; `/app/doctor/booking-merge` + пункт меню; `AdminMergeAccountsPanel` в списке кандидатов.
- Тесты: `recordPublicBookingMergeCandidates.test.ts`; smoke `/book` в `smoke-app-router-rsc-pages-inprocess.test.ts`.
- Документы: `STAGE_CHECKLISTS.md` §3, `UI_SURFACES_CHECKLIST.md` (A7, B-merge, P-page, P-widget).

**Проверки:** `pnpm --filter webapp lint`, `typecheck`, `bash scripts/check-drizzle-journal-sync.sh`; vitest merge + public create + smoke.

---

## 2026-05-29 — Этап 3: ревью качества (после аудита)

**Исправлено:**
- `AdminMergeAccountsPanel`: проп `initialSecondUserId`, сброс при смене строки; `key={row.id}` в списке кандидатов.
- Раскрытие кандидата по `row.id` (не по `anchorUserId` при нескольких кандидатах на один якорь).
- Валидация онлайн-категории на confirm/slot (`isPublicOnlineBookingCategory`).
- `/app/doctor/booking-merge`: `requireAdminDoctorPage`; пункт меню только для `role=admin`.
- Сообщение 403 при загрузке кандидатов без admin mode.

**Проверки:** `tsc --noEmit`, eslint на критичных файлах, vitest merge + smoke.

**Документация и план:** план перенесён в `.cursor/plans/archive/own_booking_stage3_public_widget.plan.md` (`status: completed`); обновлены `README.md`, `ROADMAP.md`, `DB_STRUCTURE.md`, `docs/README.md`.

---

## 2026-05-29 — Документация и закрытие плана этапа 2

**Сделано:**
- План перенесён в `.cursor/plans/archive/own_booking_stage2_patient_booking.plan.md` (`status: completed`).
- Обновлены `README.md`, `ROADMAP.md`, `MASTER_PLAN.md` §2, `DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md`.
- Модульные README: `patient-booking.md`, `booking-scheduling.md`, `booking-form.md`; `api.md` (ранее).

**Проверки:** `pnpm --filter webapp typecheck`, `lint` (перед коммитом в `initiative/own-booking-engine`).

---

## 2026-05-29 — Этап 4: переносы и отмены

**Сделано:**
- Миграция `0091_booking_stage4_policies_lifecycle.sql`: `be_cancellation_policies`, `be_reschedule_policies`, `be_appointment_reschedules`, `be_appointment_cancellations`; seed org-политик.
- Модули `booking-policies` (резолвер приоритета, §8.4 anti-bypass), `booking-appointment-lifecycle` (patient/staff cancel & reschedule).
- API: `GET /api/booking/actions`, `POST /api/booking/reschedule`, `POST /api/booking/cancel` (канон); admin `.../policies`, `.../manual-cancel|manual-reschedule`, `GET .../lifecycle`; doctor `/api/doctor/booking-engine/...` (те же ручные действия + lifecycle).
- Пациент: кнопки переноса/отмены в кабинете; визард в режиме переноса (`rescheduleBookingId`); политики и ручные действия в `/app/doctor/admin/booking`.
- Интегратор: `updateRecord` для Rubitime; событие `booking.rescheduled`.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `booking-policies/policyResolver`, `patient-booking/service`.

**Намеренно не делали:** фактические возвраты/списания абонемента (этапы 5/6); политики на уровне specialist/service/product в admin UI (только org-default + API).

### 2026-05-29 — Аудит этапа 4 (доработки)

**Сделано:**
- Integrator: `booking.rescheduled` в Zod + `handleBookingLifecycleEvent` (напоминания, patient/doctor, web push); тест.
- Порядок отмены: Rubitime до канона; `notifications_sent` + `patchLatest*Notifications` после emit.
- Проекция врача при переносе/отмене (`projectCanonicalAppointmentRescheduled` / `Cancelled`).
- Staff side effects на admin/doctor manual routes; doctor API `/api/doctor/booking-engine/...`.
- `GET /api/admin/booking-engine/appointments/[id]/lifecycle`; route-тесты `reschedule`/`actions`; `booking-appointment-lifecycle/service.test.ts`.
- `DB_STRUCTURE.md`, `patient-booking.md`.

**Проверки:** `pnpm --filter webapp typecheck`; vitest (lifecycle, routes, integrator booking-event).

**Доработка (верификация):** при сбое канона после успешного Rubitime — `patient_bookings` → `cancel_failed` (`lifecycle_failed`), не зависание в `cancelling`; `GET /api/doctor/booking-engine/appointments/[id]/lifecycle`; policy flags в `notifications_sent` при insert; `api.md` обновлён.

---

## 2026-05-29 — Этап 6: абонементы

**Сделано:**
- Миграция `0094_booking_stage6_memberships.sql`: `be_subscription_packages`, `be_package_items`, `be_patient_packages`, `be_patient_package_items`, `be_package_usages`, `be_package_history_events`.
- Модуль `modules/memberships` (balanceCalculator, service, `pgMemberships`); оплата через `payments` (`package_purchase`, `productRef=patient_package:{id}`).
- API: admin/doctor `packages`, `patient-packages` (+ consume); patient `GET /api/booking/memberships`, `available`, payment-status, mock-complete; `POST /api/booking/create` + `patientPackageId`.
- Интеграция записи: reserve при create; cancel → release/penalty; `charged_to_package` при consume; `onVisitConfirmed` для auto deduction.
- UI: `BookingCatalogPackagesSection`, `BookingPatientPackagesSection`, `PatientMembershipsSection`, `/app/patient/memberships/pay`.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `memberships/balanceCalculator`, `memberships/service`.

## 2026-05-29 — Этап 6: закрытие хвостов (аудит)

**Сделано:**
- `wrapBookingEngineMembershipHooks`: `onVisitConfirmed` при переходе в `visit_confirmed` / `completed`.
- Штраф при отмене без резерва (`penaltyDeductForAppointment`); patient cancel учитывает `package_charged` и `chargePackageSessionOnLate`.
- Резерв **до** `markConfirmed`; ошибка резерва → откат записи + `package_reserve_failed`.
- Срок действия: `packageValidity`, авто-`expired`, фильтр в booking/available.
- Бесплатный manual (price 0) активируется без payment offer.
- Wizard: `ConfirmStepClient` + `patientPackageId`; `available?branchServiceId=`.
- Patient: `GET catalog`, `POST purchase`, `GET memberships/[id]`, страница `/app/patient/memberships/[id]`.
- Staff: список абонементов пациента в `BookingPatientPackagesSection`.
- Подписи услуг в балансе (`resolveServiceTitle`); тесты routes/validity/hooks.

**Проверки:** vitest memberships + booking membership routes; `pnpm --filter webapp typecheck`.

## 2026-05-29 — Этап 6: ревью качества

**Исправлено:**
- `chargePackageSessionOnLate` учитывается в `policyResolver` (раньше флаг в БД не влиял на `decisionType`).
- Штраф при отмене (`asPenalty`) больше не переводит запись в `charged_to_package` (недопустимый FSM после `late_cancellation`).
- Ранняя валидация `patientPackageId` до создания `Appointment`.
- Штраф без резерва: приоритет пакета из usages записи, не «первый попавшийся».
- `packageSessionCharged` в lifecycle при patient cancel; ошибки `applyCancelPackageOutcome` → **409** на staff manual-cancel.
- UI: отдельный transition для загрузки абонементов; страница детали — состояние «не найден».

## 2026-05-29 — Документация этапа 6 (синхронизация)

**Сделано:** `MASTER_PLAN` §2, `STAGE_CHECKLISTS` §6, `UI_SURFACES_CHECKLIST`, `ROADMAP` (ссылка на plan в `archive/`), `README` инициативы и `docs/README.md`, `SCOPE_DECISIONS`, `memberships.md`, frontmatter и тело [`.cursor/plans/archive/own_booking_stage6_memberships.plan.md`](../../.cursor/plans/archive/own_booking_stage6_memberships.plan.md) (`todos` + DoD + API/проверки/вне scope).

## 2026-05-30 — Этап 7: продукты, акции, подписки, курсы

**Сделано:**
- Миграция `0095_booking_stage7_products.sql`: `be_products`, `be_product_purchases`, `be_product_pay_links`, `be_product_history_events`.
- Модули `modules/products`, `modules/entitlements`; `pgProducts`, `pgEntitlements` (grants в `content_access_grants_webapp`).
- Платежи: `product_purchase`, `productRef=product_purchase:{id}`, `createProductPaymentIntent`, `onProductPaymentCaptured` → `activatePurchase`.
- Fulfillment: курс — `courses.enrollPatient`; абонемент — `memberships.grantPrepaidCatalogPackage`; контент/подписка — grants.
- Связь по телефону: `buyer_phone_normalized`, `linkPurchasesByPhone` при API пациента.
- API: admin/doctor `products`, `patient-products`, pay-link; patient `booking/products/*`; public `booking/public/products/*`.
- UI: `BookingCatalogProductsSection`, `/app/patient/purchases` + pay, doctor booking admin.

**Проверки:** `pnpm --filter webapp typecheck`; vitest `modules/products/service.test.ts`.

**Намеренно не делали:** отдельная страница `/book/product/[token]` (резолв через public API); полное списание визитов promo при записи (остаток в `fulfillment_json` + API врача).

## 2026-05-30 — Этап 7: закрытие хвостов по аудиту

**Сделано:**
- `_journal.json`: запись `0095_booking_stage7_products`.
- Запись с продуктом: `productPurchaseId` в create, `GET /api/booking/products/available`, списание/возврат визита (`consumeVisitForAppointment`, `applyCancelVisitOutcome`), UI подтверждения записи.
- Доступ к материалам: `resolvePatientCanViewContent` + grants на `content/[slug]`.
- Публичная покупка: `/book/product/{token}` (+ pay), гость через `resolveOrCreateUserByPhone`, public payment-status/mock-complete.
- Staff: `BookingPatientProductsSection`, consume API; каталог продуктов — редактирование, срок, slug услуг/материалов.
- Исправлен grant `validUntil` при активации; fulfillment `single_visit` / `individual_offer`.

**Проверки:** `pnpm --filter webapp typecheck`, `lint`, vitest products/platform-access/products-available/canonicalCreate.

## 2026-05-30 — Этап 7: ревизия правок по аудиту

**Исправлено после проверки:**
- Бесплатная покупка по ссылке/телефону: `ensurePurchasePlatformUser` перед `activatePurchase` (fulfillment без сессии).
- `GET /api/booking/public/products/payment-status` — без побочного создания пользователя; только сверка телефона.
- `BookingPatientProductsSection` — корректное обновление списка после списания визита.
- Разделы контента: доступ и список страниц с учётом product-grants (`canViewPatientAuthOnlySection`, `filterPatientSectionPages`).
- Редактирование продукта в каталоге — подгрузка validity, serviceIds, contentIds при «Изменить».

**Проверки:** vitest (products, platform-access, sections slug, canonicalCreate); `typecheck`.

## 2026-05-30 — Этап 9: карточка клиента и полная история

**Сделано:**
- Миграция `0096`: `be_patient_booking_profiles`, `be_appointment_staff_comments`.
- Модуль `client-history` (`types`, `ports`, `service`, `labels`); репо `pgClientHistory` — read-агрегатор timeline/payments/visits из событий этапов 1–8.
- API: `GET /api/doctor/clients/[userId]/history`, `GET|PATCH .../booking-profile`, `GET|POST /api/doctor/booking-engine/appointments/[id]/comments`, `GET /api/booking/history`.
- Guard `booking_blocked` на patient/public `createBooking` (`canonicalCreate.assertSelfServiceBookingAllowed`).
- UI: `ClientBookingHistoryPanel` в карточке клиента; `PatientBookingHistorySection` в профиле пациента.
- Q6: ручной режим «проблемный»/booking-блок (без авто-порогов).

**Проверки:** vitest `client-history/*`, `booking-profile/route.test.ts`, `canonicalCreate.test.ts`; `pnpm run ci`.

## 2026-05-30 — Этап 9: закрытие хвостов по аудиту

**Сделано:**
- `pgClientHistory`: `be_product_history_events`, fallback `be_package_usages`, dedupe timeline (reschedule/cancel/product), enrichment оплат (package/product title, payment method), phone-fallback для покупок и orphan-платежей.
- `clientHistoryUtils`: dedupe, payment classification, enrich helpers + unit-тесты.
- UI: русские подписи оплат; комментарии к записи — `AppointmentStaffCommentsSection` (визиты + календарь); `endAt` в визитах; оплаты в patient profile и `/app/patient/purchases`.
- Тесты: `history/route.test.ts`, расширены `labels.test.ts` / `clientHistoryUtils.test.ts`.
- Документы: `DATA_MODEL_REFERENCE` §история, `MASTER_PLAN` §6 ci.

**Проверки:** vitest (client-history, history route); `pnpm run ci`.

## 2026-05-30 — Этап 9: ревизия после аудита (второй проход)

**Исправлено:**
- `isFinalPaymentEventType`: не путает `prepayment_captured` и refund-события с финальной оплатой.
- `dedupeTimelineItems`: dedupe fallback `package_usage` и зеркал `payment_history_event` из timeline.
- `listTimeline`: phone-fallback orphan-платежей (как в `listPaymentHistory`); в визитах — валюта из события, не hardcoded RUB.
- UI: возвраты в оплатах; «был по абонементу» без summary; e2e smoke для history-компонентов.

**Проверки:** vitest `clientHistoryUtils`; `pnpm --filter webapp typecheck`.

## 2026-05-30 — Prod-hardening (аудит own booking)

**Сделано:**
- Cancel-flow: канонический lifecycle до best-effort Rubitime; `rubitime_mirror` в `notifications_sent`; warn-log при сбое моста.
- Пациент: native Перенести/Отменить на `/app/patient/booking/new` (`CabinetBookingActions`).
- Политики: полный UI round-trip по scope/полям; A13 `booking_lifecycle_notifications`.
- Врач: тип отмены в списке записей; ссылка на карточку клиента в календаре; переход список ↔ календарь.
- Admin booking: секции каталог/политики/публичный канал/операции/мост; help own-engine-first.
- Платежи: `paymentProviderRegistry`, адаптер `yookassa`, UI shopId/apiKey.
- Тесты: `service.test` cancel, `BookingUpcomingSection`, calendar/manual-cancel routes, yookassa webhook parse.

**Проверки:** targeted vitest по затронутым модулям; `pnpm --filter @bersoncare/webapp typecheck`.

## 2026-05-30 — Merge+Contacts wave: supplementary contacts + booking upsert

**Сделано:**
- Таблица `platform_user_contacts` + модуль `platform-user-contacts` (этап 2).
- Merge fallback: непобеждающие phone/email → `platform_user_contacts` (`source=merge`), audit `mergeContactsSaved` (этап 3).
- Booking create (canonical + legacy): best-effort upsert phone/email из формы (`source=booking`); doctor card показывает supplementary contacts отдельно от identity.
- Post-audit: skip upsert при совпадении с identity; doctor CRUD staff-контактов; shared normalize в `@bersoncare/platform-merge`; merge preview `dependentCounts.platformUserContacts`; identity email в read-only карточке.

**Не менялось:** login/tier/trusted-phone; identity phone/email только в `platform_users`.

**Документация:** `PLATFORM_USER_MERGE.md` (матрица переносов), `DB_STRUCTURE.md`, `DATA_MODEL_REFERENCE.md`; план — `.cursor/plans/archive/merge+contacts_wave1-4.plan.md`.

**Проверки:** vitest (merge/contacts/booking/doctor/panel RTL); `pnpm --filter @bersoncare/platform-merge build`; `pnpm --filter @bersoncare/webapp typecheck`.

## 2026-05-30 — Документация: синхронизация этапа 9

**Обновлено:** `MASTER_PLAN` §2/§6, `README`, `ROADMAP`, `STAGE_CHECKLISTS` §9, `DATA_MODEL_REFERENCE`, `UI_SURFACES_CHECKLIST`; YAML плана (todos audit + `completedAt`); модуль [`client-history.md`](../../apps/webapp/src/modules/client-history/client-history.md).
