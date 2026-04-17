# Тест-матрица: очная запись (in-person v2)

**Назначение:** ручная и автоматическая проверка сценариев city → service → slot → create для Москвы и Санкт-Петербурга, негативные кейсы, смешанные legacy/v2 данные после backfill.

**Связанные документы:** `API_CONTRACT_V2.md`, `MIGRATION_CONTRACT_V2.md`, `CUTOVER_RUNBOOK.md`, `CUTOVER_DB_PLAN.md`.

---

## 1. Happy path по городам

| ID | Город | Шаги (UI) | API (webapp) | Integrator M2M | Данные / sync |
|----|-------|-----------|--------------|----------------|---------------|
| H-MOW-01 | Москва | Кабинет → «Очный приём» → город Москва → услуга из каталога → дата → слот → форма → подтверждение | `GET /api/booking/catalog/cities` — город активен; `GET /api/booking/catalog/services?cityCode=moscow` — список услуг | `POST .../slots` body `version: v2`, `rubitimeBranchId`/`CooperatorId`/`ServiceId` из каталога, `slotDurationMinutes`, `dateFrom` | `POST .../create-record` v2 с `patient`, без `category`; в БД `patient_bookings` с FK + snapshot |
| H-SPB-01 | СПб | То же с `cityCode=spb` и услугой, привязанной к СПб-филиалу | То же, `cityCode` согласован с резолвом `branch_service` | То же explicit IDs для СПб | Snapshot с городом/филиалом СПб |

**Критерий:** запись создаётся в Rubitime, локальная строка `confirmed`, событие `booking.created` с v2 полями.

---

## 2. Негативные кейсы

| ID | Сценарий | Ожидание |
|----|----------|----------|
| N-SVC-01 | Услуга не привязана к выбранному филиалу (нет строки `booking_branch_services`) | `branch_service_not_found` / 404 на уровне сервиса; слоты не запрашиваются |
| N-LINK-01 | Связка branch-service деактивирована (`is_active = false`) | Резолв не находит активную связь — та же ветка, что N-SVC-01 |
| N-CITY-01 | `cityCode` в create не совпадает с городом филиала у `branchServiceId` | `city_mismatch` → 400 |
| N-RT-502 | Rubitime HTTP 5xx / сеть при slots или create | 502/503 на границе webapp↔integrator; пользователь видит ошибку загрузки слотов / создания |
| N-RT-MAL | Невалидный ответ расписания (malformed) | integrator `rubitime_schedule_malformed` → 502 при slots |
| N-OVERLAP | Конфликт слота с уже подтверждённой записью (локальное исключение / `slot_overlap`) | После успешного `createRecord` в Rubitime откат: `cancelRecord` + локальная отмена pending с `reason: slot_overlap`; API **409** `slot_overlap` |

---

## 3. Смешанные данные old / new (после backfill)

| ID | Состояние БД | UI / API |
|----|--------------|----------|
| M-MIX-01 | Часть `patient_bookings` с заполненным `branch_service_id` + snapshot (v2), часть только legacy (`city` + `category`, без v2 колонок) | Активные/история: подписи для legacy через fallback по `city`; для v2 — город + услуга из snapshot |
| M-MIX-02 | Новая запись после cutover рядом со старой legacy в том же списке | Сортировка по `slot_start` без дубликатов; merge с проекцией Rubitime по `rubitime_id` без двойных строк |

---

## 4. Покрытие слоёв (матрица ↔ слой)

| Слой | Покрытие в матрице |
|------|---------------------|
| **Public API** | §1–2: `/api/booking/catalog/*`, `/api/booking/slots`, `/api/booking/create` |
| **UI** | §1 happy path по шагам кабинета |
| **Integrator sync** | §1–2: v2 slots/create, ошибки Rubitime |
| **Data migration** | §3: backfill, dual-read, смешанная история |

---

## 5. Автотесты (traceability)

| Область | Файлы тестов |
|---------|----------------|
| patient-booking v2 | `service.test.ts`, `createInputValidation.test.ts` |
| API routes | `api/booking/create/route.test.ts`, `slots/route.test.ts`, `catalog/*` |
| M2M webapp | `bookingM2mApi.test.ts` |
| Integrator | `recordM2mRoute.test.ts`, `schema.test.ts` |
| Репозиторий БД | `pgPatientBookings.test.ts`, `pgBookingCatalog.test.ts` |
| История / merge | `cabinetPastBookingsMerge.test.ts`, подписи `patientBookingLabels.test.ts`; списки активных/прошлых в кабинете — см. `EXECUTION_LOG.md` CABINET.T01 (ручной smoke при смене UX) |

---

## 6. Matrix ID → автотесты (traceability)

| ID | Автотесты / примечание |
|----|-------------------------|
| H-MOW-01 | `service.test.ts` (in_person create v2), `bookingM2mApi.test.ts` (v2 slots/create), `CabinetBookingEntry.test.tsx` (порядок шагов); **полный UI-путь** — ручной smoke |
| H-SPB-01 | `pgBookingCatalog.test.ts` (`listServicesByCity("spb")`), `backfillMapping.test.ts` (spb), `patientBookingLabels.test.ts` (СПб); **полный happy-path СПб** — ручной smoke |
| N-SVC-01 | `service.test.ts` (`branch_service_not_found`), `booking-catalog/service.test.ts`, `api/booking/slots/route.test.ts` (404) |
| N-LINK-01 | Та же ветка резолва, что N-SVC-01 (`branch_service_not_found`); отдельного теста только на `is_active = false` нет |
| N-CITY-01 | `service.test.ts` (`city_mismatch`), `create/route.test.ts` (400) |
| N-RT-502 | `bookingM2mApi.test.ts` (502), интегратор `recordM2mRoute.test.ts` (502), `create-route` через цепочку ошибок |
| N-RT-MAL | `recordM2mRoute.test.ts` (`rubitime_schedule_malformed`) |
| N-OVERLAP | `service.test.ts` (online + in_person overlap), `create/route.test.ts` (409), `inMemoryPatientBookings.test.ts` |
| M-MIX-01 | `pgPatientBookings.test.ts` (legacy vs v2 map), `patientBookingLabels.test.ts` |
| M-MIX-02 | `cabinetPastBookingsMerge.test.ts` (дедуп + смешанный список) |
