# LOG — журнал исполнения инициативы

Ведётся по мере работы. Каждый агент при закрытии этапа/значимого шага добавляет запись: что сделано, какие проверки выполнены, какие решения приняты, что намеренно не делали.

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
