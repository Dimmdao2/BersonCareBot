# LOG — BOOKING_REWORK_INITIATIVE

## 2026-06-04 — Документация: синхронизация после закрытия этапа 2

- README, ROADMAP §8, STAGE2_DECOMPOSITION (DoD, статус), INVENTORY §5.2–5.3, ACCEPTANCE_STAGE2, `docs/README.md`.
- Plan: `.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md` — todos `completed`.
- Исправлены устаревшие «Не делали / отложено» в записи «Этап 2: реализация» (api.md и INVENTORY обновлены в блоке аудита).

## 2026-06-04 — Этап 2: закрытие (аудит → исправления)

### Доработки по аудиту

- Link route: verify `resolveLegacyBranchServiceId` после save; расширены route tests.
- Dialog: pre-fill legacy Rubitime targets из существующего `branchServiceId`.
- Deprecation log при legacy `branchServiceId` в `resolveInPersonBranchServiceId`.
- Тесты: `BookingRubitimeMappingSection`, `loadBookingAdminOverview`, dual-input slots/create/memberships/products, `legacyProjection` availability fallback.
- Public deep link: canonical `branchId+serviceId` через `resolveInPersonContext`.
- Документация: `api.md`, `INVENTORY_AND_IA.md` §5.3, `ACCEPTANCE_STAGE2.md`, ROADMAP §8 → `done`.

### 2.3b (ops gate — вне кода)

- **`booking_slots_read_source=canonical`:** после smoke и `mapped_ok` на staging/prod (ops).
- **`booking_doctor_appointments_read_source=canonical`:** defer → **этап 4** (календарь).

### Проверки

- Targeted vitest (fast): rubitime-mapping, patient-booking resolve/catalog, booking routes, mapping UI, overview.
- `pnpm run ci` — зелёный (2026-06-04); fix: port-based Deps вместо import buildAppDeps в modules.

## 2026-06-04 — Этап 2: реализация (2.0–2.3a)

### Сделано

- **2.0:** `rubitime-mapping/link` — upsert legacy `booking_branch_services` + SSA + `be_external_entity_mappings` (`legacy_branch_service_id`); route tests.
- **2.1:** `GET rubitime-mapping`, `BookingRubitimeMappingSection`, реорганизация integrations; удалён дубль branch-service из `RubitimeSection`; overview warnings через `rubitimeMapping.listMappings({ problemsOnly: true })`.
- **2.2:** центральный `resolveInPersonBranchServiceId`; fail-closed в memberships/products available при unmapped canonical pair.
- **2.3a:** dual-input slots/create (API); `GET /api/booking/in-person-services`; patient/public wizard — primary `{ branchId, serviceId }`; legacy `branchServiceId` сохранён для reschedule/deep links.

### Проверки

- vitest (fast): rubitime-mapping routes, computeStatus, inPersonBookingResolve, inPersonServicesCatalog, RubitimeSection, ServiceStepClient, SlotStepClient, ConfirmStepClient
- `pnpm exec tsc --noEmit -p apps/webapp`

### Не делали / defer (актуально на закрытие этапа 2)

- **2.3b ops:** `booking_slots_read_source=canonical`, staging smoke create — ops на staging/prod (см. блок «закрытие» выше).
- **`booking_doctor_appointments_read_source=canonical`:** defer → **этап 4**.
- Приёмка владельца по [`ACCEPTANCE_STAGE2.md`](ACCEPTANCE_STAGE2.md) §2.1–2.2 (код + авто OK; ручной smoke staging — ops).

## 2026-06-04 — Этап 2: ревью и уточнение декомпозиции

### Изменения после проверки кода

- Добавлен обязательный блок **2.0 Link service**: `upsertBranchServiceAdmin` не пишет SSA/`be_external_entity_mappings` — runtime-связь только из backfill `0087`; UI save должен идти через `POST .../rubitime-mapping/link`.
- Трёхслойная модель маппинга (entity + SSA + availability metadata) задокументирована.
- Статусы расширены: `ssa_missing`, `branch_unmapped`, `specialist_unmapped`, `service_unmapped`, приоритет primary status.
- 2.1: убрать дубль branch-service matrix из `RubitimeSection`; overview warnings ↔ один read API.
- 2.2: явно разделено «уже в этапе 1» vs «patient wizard ещё cityCode + legacy catalog».
- 2.3: split 2.3a (API + patient catalog по branchId) / 2.3b (cutover; appointments defer → этап 4).
- Исправлены команды vitest (`pnpm --dir apps/webapp`).

### Сделано ранее (2026-06-04)

- Первая версия декомпозиции 2.1–2.3, ACCEPTANCE_STAGE2, ссылки в ROADMAP/README.

## 2026-06-04 — Этап 1: замечания аудита (финал)

### Сделано

- Reverse-resolve `branchId + serviceId → branchServiceId`: `resolveLegacyBranchServiceId` (port + pg), API `GET /api/admin/booking-engine/resolve-branch-service`.
- Публичный виджет: выбор локации + услуги; city code и `branchServiceId` резолвятся на сервере; UUID не показывается в UI.
- Probe слотов: `GET /api/admin/booking-engine/slots-probe` через `patientBooking.getSlots` (тот же путь, что у пациента).
- UX: «Показывать пациентам» / «Доступна пациентам», «Отключить» для интервалов; ACCEPTANCE обновлён.

### Проверки

- vitest (fast): `resolve-branch-service/route.test.ts`, `slots-probe/route.test.ts`, `bookingSoloAdminApi.test.ts`, `bookingAdminTabs.test.ts`
- `pnpm exec tsc --noEmit -p apps/webapp`

### Не делали (на момент записи)

- Приёмка владельцем (`ACCEPTANCE_STAGE1.md`). Этап 2 (patient API `{ branchId, serviceId }`) — **выполнен позже**, см. записи «Этап 2» ниже.

## 2026-06-04 — Этап 0: Инвентаризация и IA

### Сделано

- Составлена карта текущих 10 вкладок `/app/doctor/admin/booking` (маршруты, компоненты, API).
- Для каждой вкладки зафиксировано: что остаётся, переносится в integration/advanced, переименовывается, скрывается из UX.
- Описаны источники данных: `be_*`, `booking_*`, `patient_bookings`, `appointment_records`, `be_external_entity_mappings`, `system_settings`.
- Задокументирована зависимость in_person от `branchServiceId` и двухфазный plan (скрыть в UX → canonical `{ branchId, serviceId }` на этапе 2).
- Проверены grep-зависимости `branchServiceId`, `roomId`/`be_rooms`, read-source switches.
- Создан [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) — целевая IA на 12 вкладок.

### Решения

- Solo-specialist: специалист и кабинет не показываются в основном UX; Rubitime-дубли — только integration tab.
- `roomId` скрывается с default/null strategy; таблицы не удаляются.
- Read-source switches остаются на вкладке интеграции; конфликт — предупреждение в обзоре.
- Онлайн-ветка записи вне scope инициативы.

### Проверки

- `rg branchServiceId apps/webapp/src` — inventory в INVENTORY_AND_IA §5.2
- `rg "roomId|be_rooms|specialist-rooms" apps/webapp/src apps/webapp/db` — §6
- `rg "booking_slots_read_source|booking_doctor_appointments_read_source" apps/webapp/src` — §7

### Не делали (этап 0)

- Изменения API create/slots.
- Migrations / DDL.

## 2026-06-04 — Этап 1: исправления по аудиту

### Сделано

- Доступность: `branchId` в `specialist_service` при toggle матрицы.
- Обзор: подсчёт услуг без доступности через обе таблицы; расписание на ближайшие 7 дней; расширенные предупреждения Rubitime-маппинга.
- Локации: `sortOrder`; услуги: `onlinePaymentApplicable`.
- Форма: последовательный reorder, обработка ошибок через `apiJson`.
- Расписание: убрана двойная загрузка часов; исключения — `pickDefaultSpecialist`.
- Probe: пояснение при `booking_slots_read_source=rubitime`.
- Тексты без «Канон»; вкладка «Интеграция Rubitime».

### Проверки

- vitest fast: `bookingAdminTabs`, `bookingSoloAdminApi`, `doctorScreenTitles` — OK
- `tsc` webapp — OK

## 2026-06-04 — Этап 1: Solo UX (реализация завершена, ожидает приёмки)

### Сделано

- Навигация: 12 вкладок; `/catalog` → redirect `/locations`; «Абонементы и продукты».
- Solo-секции: `BookingSoloLocationsSection`, `BookingSoloServicesSection`, `BookingSoloAvailabilitySection`, `BookingSoloScheduleSection`, `BookingSoloFormFieldsSection`, `bookingSoloAdminApi.ts`.
- Обзор: рабочие метрики, предупреждения (доступность, fallback, read-source, неполный Rubitime-маппинг).
- Услуги: рубли, описание, абонементы, предоплата, «Доступна пациентам».
- Расписание: интервалы по локации, копирование дня, буфер, min notice (`booking_min_notice_hours`), исключения solo UX, probe слотов.
- Форма: конструктор вопросов без технических ключей.
- API: `scheduling-settings` (buffer + min notice), фильтр слотов по min notice.

### Не делали (этап 1)

- Приёмка UI владельцем — чек-лист [`ACCEPTANCE_STAGE1.md`](ACCEPTANCE_STAGE1.md).
- Этап 2+: полный Rubitime adapter UI — **выполнено** (см. LOG «Этап 2»).

### Проверки

- vitest (fast): `bookingAdminTabs.test.ts`, `bookingSoloAdminApi.test.ts`, `doctorScreenTitles.test.ts`

## 2026-06-04 — Этап 1: Solo UX (часть 1)

### Сделано

- Навигация: 12 вкладок; `/catalog` → redirect `/locations`.
- `BookingSoloLocationsSection`, `BookingSoloServicesSection`, `BookingSoloAvailabilitySection`, `bookingSoloAdminApi.ts`.
- Обзор: рабочие метрики, без jargon Канон/Rubitime.
- Цена в рублях; доступность услуга × локация; вкладка «Абонементы».
- Расписание: solo-режим, «Исключения», probe с локацией.

### Осталось в этапе 1

- Редактор рабочих часов (интервалы, копирование, буфер, min notice).
- Конструктор формы.
- Приёмка UI владельцем.

### Проверки

- vitest: `bookingAdminTabs.test.ts`, `bookingSoloAdminApi.test.ts`, `doctorScreenTitles.test.ts` — OK
