# Execution Log: Booking Rework City Service

Заполняется авто-агентом в ходе выполнения задач.

Статусы: `pending | in_progress | done | blocked | skipped`.

## Формат записи

```markdown
### Sx.Tyy - Task title
- Status:
- Agent/model:
- Started at:
- Finished at:
- Files changed:
  - `path` - short note
- Tests:
- CI:
- Notes:
```

---

## Stage 1

### S1.T01 - Обновить booking-спеку под city+service
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_MODULE_SPEC.md` — добавлен раздел «11. In-person v2» с flow city→service→slot, non-goals (online out of scope), обязательным payload integrator (rubitimeBranchId/rubitimeCooperatorId/rubitimeServiceId/slotStart), описанием каталога и изменений patient_bookings
- Tests: не требуются (документация)
- CI: не применимо
- Notes: поле `category` для очного v2 явно исключено; integrator больше не резолвит city/category самостоятельно
- Audit fixes (2026-04-01):
  - [M-1] BOOKING_MODULE_SPEC.md §11.4 — `specialist_id UUID` заменён на `branch_service_id UUID` (FK → booking_branch_services.id); добавлен NOTE о том, что specialist определяется через branch_service_id JOIN
  - [m-2] BOOKING_MODULE_SPEC.md §9 — устаревшие ссылки «блок 2.A/2.B» обновлены на актуальную структуру 2.A-2.D с отсылкой к PHASE_2_TASKS.md

### S1.T02 - Переписать декомпозицию Фазы 2
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md` — полностью переписан: старые блоки 2.A(7 задач)/2.B(7 задач)/2.C(6 задач) заменены на 2.A(6 задач) / 2.B(7 задач) / 2.C(6 задач) / 2.D(5 задач) / 2.E(5 задач)
- Tests: не требуются (документация)
- CI: не применимо
- Notes: удалены все задачи, где integrator резолвит category/city самостоятельно; добавлены явные блоки migration/cutover/compat; каждая задача содержит files+tests+done criteria
- Audit fixes (2026-04-01):
  - [M-2] Задача 2.B2 (6 файлов, нарушение атомарности 1-4) разбита на три атомарные задачи: 2.B2a (Admin API branches, 2 файла), 2.B2b (Admin API services, 2 файла), 2.B2c (Admin API specialists, 2 файла); блок 2.B теперь содержит 7 задач (2.B1, 2.B2a, 2.B2b, 2.B2c, 2.B3, 2.B4, 2.B5)
  - [m-1] Задача 2.A2 — исправлена опечатка `rubitimeCooperatorId_snapshot` → `rubitime_cooperator_id_snapshot`

### S1.T03 - Зафиксировать API contract v2
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_V2.md` — создан (новый файл): контракты POST /slots v2 и POST /create-record v2, success/error cases, backward compat policy, HMAC-механизм
- Tests: не требуются (документация)
- CI: не применимо
- Notes: `slots_mapping_not_configured` явно упразднён для v2; добавлен idempotency ключ `localBookingId`; ссылки на `category`/`city` в v2 body отсутствуют
- Audit fixes (2026-04-01):
  - [m-3] Добавлено явное NOTE о вычислении `slotEnd`: webapp не передаёт slotEnd, integrator вычисляет из длительности услуги по rubitimeServiceId; зафиксирована ссылка на задачу 2.D2

### S1.T04 - Зафиксировать migration contract v2
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/MIGRATION_CONTRACT_V2.md` — создан (новый файл): полный DDL-план с nullable/non-null для 5 таблиц каталога + расширение patient_bookings, индексы/constraints, cutover-safe sequence (8 шагов UP + rollback DOWN), health check queries
- Tests: не требуются (документация)
- CI: не применимо
- Notes: раздел «cutover-safe sequence» есть; все новые колонки patient_bookings nullable для backward compat; rollback безопасен
- Audit fixes (2026-04-01):
  - [m-4] В §1.5 (booking_branch_services) добавлен NOTE об архитектурном допущении UNIQUE (branch_id, service_id): один специалист на услугу в рамках филиала; задокументирован путь изменения constraint при масштабировании

### S1.T05 - Зафиксировать seed mapping для Точки Здоровья
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/SEED_MAPPING_TOCHKA_ZDOROVYA.md` — создан (новый файл): 2 города, 2 филиала, 2 специалиста, 3 услуги, 5 branch-service связок; fallback policy (FAIL при отсутствии обязательных ID); idempotency keys; неподтверждённые поля зафиксированы явно
- Tests: не требуются (документация)
- CI: не применимо
- Notes: зафиксировано отсутствие Сеанса 40 мин в СПб — не добавлять без подтверждения; все Rubitime IDs из FUTURE_SETTINGS_TOCHKA_ZDOROVYA.md присутствуют
- Audit fixes: замечаний по S1.T05 не было

---

## Stage 2

### S2.T01 - Создать миграцию каталога booking v2
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/migrations/046_booking_catalog_v2.sql` — создан: CREATE TABLE booking_cities, booking_branches, booking_specialists, booking_services, booking_branch_services; все FK, UNIQUE и INDEX по контракту MIGRATION_CONTRACT_V2.md
- Tests: smoke up/down — не применимо без live DB; SQL валиден синтаксически
- CI: pnpm run ci — passed ✓
- Notes: порядок CREATE TABLE соответствует FK-зависимостям (cities → branches → specialists → services → branch_services); все таблицы idempotent через IF NOT EXISTS
- Audit fixes (2026-04-01):
  - [m-1] В MIGRATION_CONTRACT_V2.md §1.4 добавлен UNIQUE (title, duration_minutes) c именем uq_booking_services_title_duration; обновлена сводная таблица §3

### S2.T02 - Расширить patient_bookings для новой модели
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/migrations/047_patient_bookings_v2_refs.sql` — создан: ADD COLUMN IF NOT EXISTS для branch_id/service_id/branch_service_id (nullable FK), snapshot-поля, rubitime snapshot-поля; CREATE INDEX на новые FK-колонки
- Tests: smoke up/down — не применимо без live DB; SQL валиден синтаксически
- CI: pnpm run ci — passed ✓
- Notes: все колонки nullable (legacy path не ломается); IF NOT EXISTS для идемпотентности; применяется после 046

### S2.T03 - Реализовать репозитории каталога в webapp
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/booking-catalog/types.ts` — создан: BookingCity, BookingBranch, BookingSpecialist, BookingService, BookingBranchService, ResolvedBranchService
  - `apps/webapp/src/modules/booking-catalog/ports.ts` — создан: BookingCatalogReadPort, BookingCatalogWritePort, BookingCatalogPort
  - `apps/webapp/src/modules/booking-catalog/service.ts` — создан: createBookingCatalogService (listCitiesForPatient, listServicesByCity с нормализацией, resolveBranchService)
  - `apps/webapp/src/modules/booking-catalog/service.test.ts` — создан: 5 тестов сервиса (passed)
  - `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — создан: createPgBookingCatalogPort с полными JOIN-запросами и upsert-методами
  - `apps/webapp/src/infra/repos/pgBookingCatalog.test.ts` — создан: 4 теста репо (passed)
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — добавлен import и wire bookingCatalogPort/bookingCatalogService (null без DB)
- Tests: 9 тестов — все passed; линтер — ошибок нет
- CI: pnpm run ci — passed ✓
- Notes: bookingCatalogService = null в in-memory режиме (без DB); write port используется seed скриптом (S2.T04)

### S2.T04 - Подготовить seed script для Точки Здоровья
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/scripts/seed-booking-catalog-tochka-zdorovya.ts` — создан: идемпотентный upsert городов/филиалов/специалистов/услуг/branch-service; --check-only mode; fail-fast при пустых Rubitime IDs; транзакция + rollback; post-seed верификация
  - `apps/webapp/src/modules/booking-catalog/seedValidation.test.ts` — создан: 7 тестов (fail-fast policy, idempotency, no silent SPb 40min add) — все passed
  - `apps/webapp/package.json` — добавлена запись seed-booking-catalog (tsx runner)
- Tests: 7 тестов — все passed
- CI: pnpm run ci — passed ✓
- Notes: Сеанс 40 мин в СПб явно исключён; данные соответствуют SEED_MAPPING_TOCHKA_ZDOROVYA.md; транзакция полностью атомарна

### S2.T05 - Реализовать backfill из legacy полей
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/scripts/backfill-patient-bookings-v2.ts` — создан: dry-run по умолчанию, --commit для записи, --limit=N; LEGACY_MAP (moscow/spb → rehab_lfk → 60 мин); детальный отчёт (updated/skipped/conflicts); no silent skip — conflict rows логируются
  - `apps/webapp/src/modules/booking-catalog/backfillMapping.test.ts` — создан: 7 тестов (dry-run, idempotency, conflict case, null city, unknown category) — все passed
  - `apps/webapp/package.json` — добавлена запись backfill-patient-bookings-v2
- Tests: 7 тестов — все passed
- CI: pnpm run ci — passed ✓
- Notes: маппинг частичный — только rehab_lfk с известным городом; session длительность по умолчанию = 60 мин (невозможно восстановить из legacy); conflict rows не ломают backfill
- Audit fixes (2026-04-01):
  - [m-2] alreadyFilled: добавлен отдельный COUNT-запрос для строк с branch_service_id IS NOT NULL перед основным SELECT; счётчик теперь реально заполняется
  - [m-3] updatedWithDefaultDuration: добавлен счётчик и строка в отчёт "↳ with default 60-min duration" с пояснением что точная длительность из legacy неизвестна

### S2.T06 - Документировать cutover-стратегию БД
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_DB_PLAN.md` — создан: 4 фазы (dual-write, dual-read, full switch, cleanup); rollback-процедура (фаза и полный), health checks после каждой фазы; Definition of Done checklist
- Tests: не требуются (документация)
- CI: pnpm run ci — passed ✓ (повторно после всех audit fixes)
- Notes: план явно привязан к Stage 4 (dual-write) и Stage 5 (cutover); rollback до seed отдельно помечен как безопасный, после seed — требует экспорта
- Audit fixes (2026-04-01):
  - [m-4] CI поля S2.T01-T05 обновлены с "будет проверено" → "pnpm run ci — passed ✓"

---

## Stage 3

### S3.T01 - Создать admin API для cities
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/booking-catalog/ports.ts` — тип `BookingCatalogAdminPort`, расширен `BookingCatalogPort`
  - `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — `listCitiesAdmin`, `getCityById`, `updateCityById`, `deactivateCity`
  - `apps/webapp/src/app/api/admin/booking-catalog/_requireAdminBookingCatalog.ts` — guard `admin` + `adminMode`, `bookingCatalogPort` или 503
  - `apps/webapp/src/app/api/admin/booking-catalog/cities/route.ts` — GET/POST (Zod)
  - `apps/webapp/src/app/api/admin/booking-catalog/cities/[id]/route.ts` — GET/PATCH/DELETE soft
  - `apps/webapp/src/app/api/admin/booking-catalog/cities/route.test.ts`, `cities/[id]/route.test.ts`, `_requireAdminBookingCatalog.test.ts`
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — экспорт `bookingCatalogPort`
- Tests: route tests (403 без adminMode, 200 список, 400 validation, DELETE); guard 503 без БД
- CI: pnpm run ci — passed ✓
- Notes: DELETE только `is_active = false`

### S3.T02 - Создать admin API для branches/services/specialists
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — admin CRUD для branches, services, specialists
  - `apps/webapp/src/app/api/admin/booking-catalog/branches/route.ts`, `branches/[id]/route.ts`
  - `apps/webapp/src/app/api/admin/booking-catalog/services/route.ts`, `services/[id]/route.ts`
  - `apps/webapp/src/app/api/admin/booking-catalog/specialists/route.ts`, `specialists/[id]/route.ts`
  - `apps/webapp/src/app/api/admin/booking-catalog/branches/route.test.ts`
- Tests: branches GET 403/200, POST validation + `city_not_found` → 400
- CI: pnpm run ci — passed ✓
- Notes: `rubitime_branch_id` / `rubitime_cooperator_id` — строки; POST branches/services/specialists после upsert возвращает полную сущность через `get*ById`

### S3.T03 - Создать admin API для branch-service связок
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — `listBranchServicesAdmin`, `getBranchServiceById`, `upsertBranchServiceAdmin` (ON CONFLICT `uq_booking_branch_services`), `deactivateBranchService`, проверка `specialist_branch_mismatch`
  - `apps/webapp/src/app/api/admin/booking-catalog/branch-services/route.ts`, `branch-services/[id]/route.ts`
  - `apps/webapp/src/app/api/admin/booking-catalog/branch-services/route.test.ts`
  - `apps/webapp/src/infra/repos/pgBookingCatalog.test.ts` — mismatch + deactivate inactive SQL
- Tests: POST `specialist_branch_mismatch` → 400; PG тесты upsert/deactivate
- CI: pnpm run ci — passed ✓
- Notes: PATCH [id] повторно вызывает upsert для той же пары branch+service

### S3.T04 - Переработать RubitimeSection под каталог v2
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/settings/RubitimeSection.tsx` — UI только `/api/admin/booking-catalog/*`; формы город/филиал/услуга/специалист/branch-service; отображение Rubitime ID; legacy booking profiles убраны
  - `apps/webapp/src/app/app/settings/RubitimeSection.test.tsx` — smoke (jsdom): заголовки v2, нет bookingType/category/profile
- Tests: RubitimeSection.test.tsx
- CI: pnpm run ci — passed ✓
- Notes: при `catalog_unavailable` показывается сообщение про DATABASE_URL/миграции

### S3.T05 - Добавить операторский help-блок в Settings
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/settings/BookingCatalogHelp.tsx` — runbook порядка настройки + предупреждение про Rubitime ID
  - `apps/webapp/src/app/app/settings/page.tsx` — блок над `RubitimeSection` при admin+adminMode
- Tests: не требовались (информ. блок)
- CI: pnpm run ci — passed ✓
- Notes: —

### Stage 3 — audit remediation (post–Stage 3 review)
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/api/admin/booking-catalog/_httpErrors.ts` — `jsonIfInvalidCatalogId`, `httpFromDatabaseError` (PG 23503/23505)
  - `apps/webapp/src/app/api/admin/booking-catalog/_httpErrors.test.ts` — unit-тесты маппинга
  - `apps/webapp/src/app/api/admin/booking-catalog/_requireAdminBookingCatalog.ts` — 401 без сессии (как `/api/admin/settings`)
  - Все `booking-catalog/**/[id]/route.ts` — проверка UUID в params; PATCH branches/services/specialists/branch-services — 4xx из PG через `httpFromDatabaseError`
  - `apps/webapp/src/app/app/settings/RubitimeSection.tsx` — порядок секций как в `BookingCatalogHelp`; DELETE с проверкой ответа и `actionError`
  - `services/route.test.ts`, `specialists/route.test.ts`, `branches/[id]/route.test.ts` — route tests
  - Расширены: `cities/route.test.ts`, `cities/[id]/route.test.ts`, `_requireAdminBookingCatalog.test.ts`, `branch-services/route.test.ts`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_3_ADMIN_CATALOG.md` — чекбоксы тестов [x]
- Tests: vitest booking-catalog + полный `pnpm run ci`
- CI: pnpm run ci — passed ✓
- Notes: закрыты замечания аудита (401, FK/unique → 4xx, тестовая матрица, UI/help порядок, ошибки DELETE)

---

## Stage 4

### S4.T01 - Обновить доменные типы patient-booking
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/patient-booking/types.ts` — `PatientBookingRecord` расширен v2 snapshot/FK полями; `CreatePatientBookingInput` union online / in_person (`branchServiceId` + `cityCode`); очный v2 не требует `category` в типе
  - `apps/webapp/src/modules/patient-booking/ports.ts` — `BookingSlotsQuery` (online | in_person+branchServiceId); `BookingSlotsIntegratorQuery` / `CreateBookingSyncInput` для v1 online и v2 Rubitime IDs; `CreatePendingPatientBookingInput` для записи в БД
  - `apps/webapp/src/modules/patient-booking/createInputValidation.ts` + `.test.ts` — валидация create (UUID branchServiceId, cityCode, ISO слоты)
- Tests: vitest `createInputValidation.test.ts`
- CI: pnpm run ci — passed ✓ (в конце Stage 4)
- Notes: `category` в типах остаётся для online и колонки БД; in-person контракт API опирается на `branchServiceId`, не на `category`

### S4.T02 - Обновить booking service на branch-service резолв
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/patient-booking/service.ts` — `bookingCatalog` в фабрике; `getSlots` для `in_person` резолвит `resolveBranchService` и вызывает integrator v2; `createBooking` маппит v2 snapshots в `CreatePendingPatientBookingInput`, createRecord v2 с `localBookingId`; rollback при overlap без изменений
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — порядок: `bookingCatalogService` до `patientBookingService`, передача в `createPatientBookingService`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts`, `inMemoryPatientBookings.ts` — `createPending` на плоский `CreatePendingPatientBookingInput` + INSERT snapshot/FK колонок
  - `apps/webapp/src/modules/patient-booking/service.test.ts` — сценарии getSlots/create in_person, catalog_unavailable, branch_service_not_found
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.test.ts` — фикстура `CreatePendingPatientBookingInput`
- Tests: vitest patient-booking service + inMemoryPatientBookings
- CI: pnpm run ci — passed ✓
- Notes: ошибка sync create пробрасывается сообщением integrator (не единый `booking_sync_failed`)

### S4.T03 - Обновить M2M adapter webapp -> integrator
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — `BookingSlotsIntegratorQuery` / `CreateBookingSyncInput`: v2 body для slots/create; разбор `error.code`; `rubitimeRecordId` | `recordId`; нормализация v2 `times[]` → `BookingSlot` (TZ +03:00, длительность из запроса)
  - `apps/webapp/src/modules/integrator/bookingM2mApi.test.ts` — v2 fetchSlots/createRecord + structured error
- Tests: vitest bookingM2mApi
- CI: pnpm run ci — passed ✓
- Notes: online по-прежнему v1; in-person v2 не шлёт `category`/`city` в integrator

### S4.T04 - Переработать UI выбора в кабинете пациента
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/cabinet/useBookingSelection.ts` — очный поток: `inPersonMode` → город → `branchServiceId` + подписи; онлайн без изменений по смыслу
  - `apps/webapp/src/app/app/patient/cabinet/BookingFormatGrid.tsx` — «Очный приём» + две онлайн-кнопки
  - `apps/webapp/src/app/app/patient/cabinet/useBookingCatalog.ts` — загрузка городов/услуг с `/api/booking/catalog/*`
  - `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — шаги город → услуга → дата/слоты → форма; без выбора сотрудника
  - `apps/webapp/src/app/app/patient/cabinet/useBookingSlots.ts`, `useCreateBooking.ts` — query/body v2
  - `BookingCalendar.tsx`, `BookingSlotList.tsx`, `BookingConfirmationForm.tsx` — нумерация шагов 4–5
  - Удалён `BookingCategoryGrid.tsx`
  - `apps/webapp/src/app/app/patient/cabinet/patientBookingLabels.ts` + `.test.ts` — подписи карточек
- Tests: vitest `patientBookingLabels.test.ts`; фильтрация «слоты только после услуги» обеспечивается тем, что `useBookingSlots` вызывается только при полном `selection`
- CI: pnpm run ci — passed ✓
- Notes: онлайн-кнопки и поток не перерабатывались

### S4.T05 - Обновить public API routes booking в webapp
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/api/booking/slots/route.ts` — discriminated union: `in_person` + обязательный `branchServiceId` (UUID)
  - `apps/webapp/src/app/api/booking/create/route.ts` — body: online | in_person + `branchServiceId` + `cityCode`; маппинг ошибок (404/409/422/503)
  - `apps/webapp/src/app/api/booking/catalog/cities/route.ts`, `catalog/services/route.ts` — patient + catalog для UI
  - `apps/webapp/src/app/api/booking/slots/route.test.ts`, `create/route.test.ts`, `catalog/cities/route.test.ts`, `catalog/services/route.test.ts`
- Tests: см. route tests
- CI: pnpm run ci — passed ✓
- Notes: online остаётся на `category`

### S4.T06 - Dual-read/detect для legacy записей в cabinet
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — `mapRow` с `?? null` для v2 колонок (legacy строки без колонок в старых БД)
  - `apps/webapp/src/infra/repos/pgPatientBookings.test.ts` — legacy vs v2 SELECT
  - `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx`, `CabinetPastBookings.tsx` — `nativeBookingSubtitle`
  - `apps/webapp/src/app/app/patient/cabinet/cabinetPastBookingsMerge.test.ts` — поля v2 в `makeNative`
- Tests: pgPatientBookings.test + patientBookingLabels + merge test
- CI: pnpm run ci — passed ✓
- Notes: старые строки без `branch_service_id` показывают fallback по `city`; новые — город + услуга из snapshot

### Stage 4 — закрытие замечаний аудита (post-audit)
- Status: done
- Finished at: 2026-04-01
- Изменения:
  - **`patient-booking/service.ts`** — после `resolveBranchService` для `in_person` сравнение `cityCode` с `resolved.city.code` (нормализация trim + lower); при расхождении `city_mismatch`; в pending-строке `city` всегда из каталога (`city.code`), не из произвольного ввода клиента.
  - **`api/booking/create/route.ts`** — ответ 400 с `error: city_mismatch`.
  - **`pgBookingCatalog.ts`** — в `resolveBranchService` добавлено `AND c.is_active = TRUE` (согласованность с `listServicesByCity`).
- Тесты:
  - `service.test.ts` — сценарий `city_mismatch`, без `createPending` / `createRecord`.
  - `create/route.test.ts` — 400 при `city_mismatch` от сервиса.
  - `pgBookingCatalog.test.ts` — SQL содержит `c.is_active = TRUE` в resolve.
  - **`CabinetBookingEntry.test.tsx` (RTL/jsdom)** — после выбора города запрос услуг каталога есть, `/api/booking/slots` не вызывается до выбора услуги; после выбора услуги слоты запрашиваются с `branchServiceId`.
- CI: `pnpm run ci` — passed ✓

---

## Stage 5

### S5.T01 - Обновить integrator M2M contracts на explicit IDs
- Status: done
- Agent/model: claude (sonnet)
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/integrator/src/integrations/rubitime/internalContract.ts` — v1/v2 типы, `ERR_LEGACY_RESOLVE_DISABLED`
  - `apps/integrator/src/integrations/rubitime/schema.ts` — union v1/v2 для slots/create, lifecycle payload + snapshot поля
  - `apps/integrator/src/integrations/rubitime/schema.test.ts` — парсинг v1/v2
- Tests: vitest `schema.test.ts`
- CI: `pnpm run ci` — passed ✓

### S5.T02 - Упростить recordM2mRoute для slots/create
- Status: done
- Agent/model: claude (sonnet)
- Finished at: 2026-04-01
- Files changed:
  - `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — v2 без `resolveScheduleParams`; v1 под флагом legacy; подпись/ошибки
  - `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — `slotDurationMinutes` в body v2 slots; v2 ответ без `times[]` → v1 contract
  - `apps/webapp/src/modules/integrator/bookingM2mApi.test.ts` — slotDurationMinutes + нормализованный ответ
- Tests: vitest integrator `recordM2mRoute.test.ts`, webapp `bookingM2mApi.test.ts`
- CI: `pnpm run ci` — passed ✓

### S5.T03 - Изолировать legacy bookingProfilesRepo от runtime path
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/integrator/src/integrations/rubitime/legacyResolveFlag.ts` — `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED`
  - `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts` — комментарии deprecation / v2
  - `apps/integrator/src/integrations/rubitime/db/bookingProfilesRepo.ts` — пометка legacy
  - `apps/integrator/src/integrations/rubitime/LEGACY_BOOKING_PROFILES.md` — краткая операторская заметка
  - `apps/integrator/src/integrations/rubitime/recordM2mRoute.test.ts` — legacy off + v2
- Tests: vitest `recordM2mRoute.test.ts` (legacy)
- CI: `pnpm run ci` — passed ✓

### S5.T04 - Обновить webhook update logic под v2 snapshots
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — `patientCreatedText` использует `cityCodeSnapshot`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — комментарий к `upsertFromRubitime` (match по `rubitime_id`, snapshots не трогаем)
  - `apps/webapp/src/modules/patient-booking/service.test.ts` — emit `booking.created` / `booking.cancelled` с v2 snapshot полями
- Tests: vitest `service.test.ts`
- CI: `pnpm run ci` — passed ✓

### S5.T05 - Подготовить cutover runbook
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_RUNBOOK.md` — создан
- Tests: не требуются
- CI: `pnpm run ci` — passed ✓ (после завершения Stage 5)

### Stage 5 — audit remediation (post–Stage 5 review)
- Status: done
- Finished at: 2026-04-01
- Изменения:
  - `API_CONTRACT_V2.md` — NOTE про дискриминант `version: "v2"` без `type` в M2M; поля `slotDurationMinutes`, фактический ответ слотов; корректировка HMAC (base64url, ±300s, timestamp в секундах); NOTE про `slotEnd` в v2 с отсылкой к коду
  - `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md` — чекбоксы тестов [x]
  - `CUTOVER_RUNBOOK.md` — явная команда `pnpm --filter webapp run migrate`; примечание про env vs `system_settings` для флага legacy
  - `internalContract.ts` — ссылка на `API_CONTRACT_V2.md`
- Tests / CI: `pnpm run ci` — passed ✓

---

## Stage 6

### S6.T01 - Добавить тест-матрицу e2e сценариев очной записи
- Status: done
- Agent/model: claude (sonnet)
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/TEST_MATRIX.md` — happy-path Москва/СПб, негативы (нет связки, city_mismatch, Rubitime 5xx/malformed, slot_overlap), смешанные legacy/v2 после backfill; таблица покрытия API/UI/sync/migration; **§6 Matrix ID → автотесты** (post–audit)
- Tests: не требуются (документ-матрица)
- CI: см. S6.T05
- Notes: traceability §5–§6

### S6.T02 - Реализовать unit/integration тесты webapp v2
- Status: done
- Agent/model: claude (sonnet)
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/patient-booking/service.test.ts` — регрессия `slot_overlap` для `in_person` (откат Rubitime + cancel pending)
  - `apps/webapp/src/app/api/booking/create/route.test.ts` — 409 `slot_overlap` для in_person
  - `apps/webapp/src/infra/repos/pgPatientBookings.test.ts` — `listHistoryByUser` mixed legacy + v2
  - `apps/webapp/src/app/app/patient/cabinet/cabinetPastBookingsMerge.test.ts` — смешанная история в merge
- Tests: vitest перечисленных файлов; полный CI
- CI: см. S6.T05
- Notes: онлайн overlap уже был; добавлено зеркало для v2

### S6.T03 - Реализовать unit/integration тесты integrator v2
- Status: done
- Agent/model: claude (sonnet)
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/integrator/src/integrations/rubitime/schema.test.ts` — `localBookingId` optional UUID / отказ при невалидном UUID
  - `apps/integrator/src/integrations/rubitime/recordM2mRoute.test.ts` — v2 slots: `invalid_rubitime_ids`, 502 при падении fetch (явные ID без legacy resolve)
- Tests: vitest integrator
- CI: см. S6.T05
- Notes: существующие v2 create/slots + legacy flag сохранены

### S6.T04 - Провести аудит этапов и закрыть замечания
- Status: done
- Agent/model: claude (sonnet)
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/AUDIT_STAGE_2_6.md` — сверка с MIGRATION/API контрактами, severity, финальный статус **approve**; **§2 реестр этапов 1–5** и закрытие minor m-1/m-2 (post–audit remediation)
- Tests: не требуются
- CI: см. S6.T05 и Stage 6 audit remediation
- Notes: critical открытых нет

### S6.T05 - Финальный pre-release check
- Status: done
- Agent/model: claude (sonnet)
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md` — этот лог
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md` — release checklist
- Tests: `pnpm run ci` (полный)
- CI: `pnpm run ci` — passed ✓
- Notes:
  - **Release readiness: ready** (код + доки + CI green; production cutover — по операторскому runbook)
  - **Blockers:** нет

### Stage 6 — audit remediation (внешнее ревью test/audit/release)
- Status: done
- Finished at: 2026-04-01
- Цель: закрыть оставшиеся замечания по матрице (ID→тесты), реестру аудита 1–5, воспроизводимости CI.
- Files changed:
  - `AUDIT_STAGE_2_6.md` — §2 реестр этапов 1–5; §4 minor закрыты; §4.1 пост-ремедиация Stage 6
  - `TEST_MATRIX.md` — §6 Matrix ID → автотесты
  - `EXECUTION_LOG.md`, `CHECKLISTS.md` — CI+SHA, уточнения чеклиста
- CI: `pnpm run ci` — passed ✓ **дважды** (2026-04-01): до и после правок документации remediation
- **Commit (`git rev-parse HEAD` на момент зелёного CI):** `0a1f20e36c00d41d2af9f86d85de3d4bd1838067` — после `git commit` этих файлов обновить SHA в логе и при необходимости перезапустить CI

---

## Stage 7 — Booking wizard (URL-страницы)

### S7.T01 — Маршруты и redirect
- Status: done
- Agent/model: Cursor agent
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app-layer/routes/paths.ts` — `bookingNew`, `bookingNewCity`, `bookingNewService`, `bookingNewSlot`, `bookingNewConfirm`
  - `apps/webapp/src/app/app/patient/booking/page.tsx` — redirect на `bookingNew` (не в `patientPathsRequiringPhone`)
- Tests: навигация smoke через роуты
- CI: см. S7.T09
- Notes: `patientBooking` сохранён для обратной совместимости; `/app/patient/booking` → `/app/patient/booking/new`

### S7.T02 — BookingWizardShell
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/BookingWizardShell.tsx` — AppShell patient, «Шаг N из M», children
- CI: см. S7.T09

### S7.T03 — Шаг 1 (формат)
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/page.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/FormatStepClient.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/FormatStepClient.test.tsx`
- CI: см. S7.T09

### S7.T04 — Шаг 2 (город)
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/city/page.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/city/CityStepClient.tsx` — `useBookingCatalogCities(true)`
  - `apps/webapp/src/app/app/patient/booking/new/city/CityStepClient.test.tsx` — см. Stage 7 audit remediation
- CI: см. S7.T09

### S7.T05 — Шаг 3 (услуга)
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/service/page.tsx` — guard `cityCode`
  - `apps/webapp/src/app/app/patient/booking/new/service/ServiceStepClient.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/service/ServiceStepClient.test.tsx` — см. Stage 7 audit remediation
- CI: см. S7.T09

### S7.T06 — Шаг 4 (слот)
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/slot/page.tsx` — guards type / in_person / online
  - `apps/webapp/src/app/app/patient/booking/new/slot/SlotStepClient.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/slot/SlotStepClient.test.tsx`
- Notes: в query на confirm добавлен `slotEnd` (обязателен для API: `slotEnd` > `slotStart`)

### S7.T07 — Шаг 5 (подтверждение)
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/confirm/page.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx`
  - `apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx`

### S7.T08 — CabinetBookingEntry
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — Link + `buttonVariants`, без Dialog/Sheet
  - `apps/webapp/src/app/app/patient/cabinet/page.tsx` — без props у entry
  - `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.test.tsx`

### S7.T09 — Тесты и CI
- Status: done
- Finished at: 2026-04-01
- Files changed: см. тесты выше
- Tests: vitest (wizard + cabinet entry); полный монорепо
- CI: `pnpm run ci` — passed ✓

### Stage 7 — audit remediation (post–Stage 7 review, verdict rework)
- Status: done
- Agent/model: Cursor agent
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Цель: закрыть замечания аудита Stage 7 — схема query (`date`/`slot`/`slotEnd`, ISO), паттерн Server/Client без обязательного `useSearchParams`, шаги 1–2 без query, unit-тесты City/Service, S7.T08 и эквивалент `Button asChild` для Base UI.
- Files changed:
  - `STAGE_7_BOOKING_WIZARD_PAGES.md` — актуализированы § Search params, § Паттерн Server/Client, S7.T06–S7.T09, S7.T08 (Link + `buttonVariants`)
  - `apps/webapp/src/app/app/patient/booking/new/city/CityStepClient.test.tsx` — loading + navigation
  - `apps/webapp/src/app/app/patient/booking/new/service/ServiceStepClient.test.tsx` — navigation + empty state
- Tests: vitest новых файлов + полный `pnpm run ci`
- CI: `pnpm run ci` — passed ✓ (2026-04-01, после remediation)
- Notes: `CabinetBookingEntry.tsx` без изменений относительно рабочей версии (Link + `buttonVariants`); соответствие этапу зафиксировано в `STAGE_7_BOOKING_WIZARD_PAGES.md` (Base UI без `asChild`).

---

## Итог ветки (Stages 1–7, in-person rework)

- **Статус:** `ready`
- **Blockers:** нет
- **SHA:** `0a1f20e36c00d41d2af9f86d85de3d4bd1838067`
- **Последний полный CI:** `pnpm run ci` — green (2026-04-01)

---

## Stage 8

### S8.T01 — Зафиксировать policy legacy-off
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md` — добавлен раздел POLICY с условиями безопасного отключения legacy-resolve
  - `CUTOVER_RUNBOOK.md §6` — добавлен explicit online-safe gate с чек-листом перед глобальным legacy-off
- Notes: legacy-off не делается глобально до закрытия Stage 12 (online intake); online v1 остаётся активным до тех пор

### S8.T02 — Синхронизировать Stage 7 в индексах
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `README.md` — добавлены Stage 7 и Stages 8–15 в порядок этапов
  - `CHECKLISTS.md §6` — обновлён release-block с Stage 1-7; добавлен §7 (Stages 8–15 online intake + compat-sync)

### S8.T03 — Устранить CI/SHA двусмысленность
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `EXECUTION_LOG.md` — итоговый раздел Stages 1–7 обновлён с явным SHA `0a1f20e36c00d41d2af9f86d85de3d4bd1838067`
- Notes: шаблон фиксации — в конце каждого Stage CI-запуска добавлять строку `SHA: <git rev-parse HEAD>`

### S8.T04 — Добавить Stage 8 в промпты
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `PROMPTS_EXEC_AUDIT_FIX.md` — добавлены STAGE 8–15 EXEC/AUDIT/FIX шаблоны

### S8.T05 — Создать COMPATIBILITY_RUBITIME_WEBAPP.md
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `COMPATIBILITY_RUBITIME_WEBAPP.md` — создан (новый файл): definition of done совместимости, обязательные/optional поля, правила compat-sync

### S8.T06 — Лог этапа
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Notes: все задачи S8.T01–S8.T05 зафиксированы выше

---

## Stage 9

### S9.T01 — Спека online-потоков
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Started at: 2026-04-01
- Finished at: 2026-04-01
- Files changed:
  - `STAGE_9_ONLINE_INTAKE.md` — создан: спека LFK (description + attachments/urls) и Nutrition (пошаговая анкета q1-q5)

### S9.T02–S9.T03 — API и migration контракты
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `API_CONTRACT_ONLINE_INTAKE_V1.md` — создан: все patient + doctor/admin эндпоинты
  - `MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md` — создан: DDL для 4 таблиц

### S9.T04–S9.T06 — Privacy, notifications, тест-матрица
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `STAGE_9_ONLINE_INTAKE.md` §S9.T04–S9.T06 — описаны права, notification routing, TEST_MATRIX happy/negative/security

---

## Stage 10

### S10.T01–S10.T04 — Миграция БД
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/migrations/048_online_intake.sql` — 4 таблицы + индексы + constraints

### S10.T05–S10.T06 — Репозитории и service layer
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/online-intake/types.ts` — типы IntakeRequest, IntakeAnswer, IntakeAttachment, constants
  - `apps/webapp/src/modules/online-intake/ports.ts` — OnlineIntakePort, OnlineIntakeService, IntakeNotificationPort
  - `apps/webapp/src/modules/online-intake/service.ts` — createOnlineIntakeService с validation + rate limit + notifications
  - `apps/webapp/src/infra/repos/inMemoryOnlineIntake.ts` — in-memory реализация для тестов
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts` — pg реализация с транзакциями
  - `apps/webapp/src/app-layer/di/onlineIntakeDeps.ts` — DI getter

### S10.T07–S10.T08 — API patient и doctor/admin
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/api/patient/online-intake/route.ts` — GET list own
  - `apps/webapp/src/app/api/patient/online-intake/lfk/route.ts` — POST submit LFK
  - `apps/webapp/src/app/api/patient/online-intake/nutrition/route.ts` — POST submit nutrition
  - `apps/webapp/src/app/api/doctor/online-intake/route.ts` — GET list all (doctor/admin)
  - `apps/webapp/src/app/api/doctor/online-intake/[id]/route.ts` — GET details
  - `apps/webapp/src/app/api/doctor/online-intake/[id]/status/route.ts` — PATCH status

### S10.T09 — Тесты
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Tests: vitest 10/10 passed (service.test.ts — submitLfk, submitNutrition, changeStatus, listMyRequests)

---

## Stage 11

### S11.T01 — Спека правил синхронизации
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `COMPATIBILITY_RUBITIME_WEBAPP.md` — создан в Stage 8, покрывает DoD совместимости

### S11.T02–S11.T03 — Payload extraction и projection enrich
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `apps/integrator/src/integrations/rubitime/connector.ts` — добавлены serviceId, serviceName, dateTimeEnd в RubitimeIncomingPayload и toRubitimeIncoming()
  - `apps/integrator/src/infra/db/writePort.ts` — BookingUpsertParams расширен serviceId/serviceName/dateTimeEnd; projection payload обогащён этими полями

### S11.T04 — Webapp ingest mapping
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/integrator/events.ts` — APPOINTMENT_RECORD_UPSERTED handler расширен: читает serviceTitle/slotEnd/serviceId из top-level + payloadJson fallback; передаёт в applyRubitimeUpdate

### S11.T05–S11.T09 — Compat upsert/create + dedup + lifecycle
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/patient-booking/ports.ts` — расширены upsertFromRubitime + applyRubitimeUpdate с новыми optional полями
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — upsertFromRubitime: UPDATE path + CREATE compat-row path + computeCompatQuality + computeFallbackSlotEnd
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — аналогично in-memory

### S11.T10 — Миграция
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/migrations/049_patient_bookings_compat_source.sql` — source + compat_quality поля + индексы

### S11.T11 — Tests
- Status: done
- Finished at: 2026-04-01
- Tests: vitest 5/5 passed (inMemoryPatientBookings.test.ts — compat-create, no-slot, dedup, cancel, fallback-duration)

---

## Stage 12

### S12.T01 — FormatStepClient обновлён
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/booking/new/FormatStepClient.tsx` — кнопки онлайн ведут в /intake/lfk и /intake/nutrition
  - `apps/webapp/src/app-layer/routes/paths.ts` — добавлены intakeLfk, intakeNutrition, doctorOnlineIntake

### S12.T02 — LFK intake page
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/intake/lfk/page.tsx`
  - `apps/webapp/src/app/app/patient/intake/lfk/LfkIntakeClient.tsx` — форма с description + url attachment, submit -> API

### S12.T03 — Nutrition questionnaire engine
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/intake/nutrition/page.tsx`
  - `apps/webapp/src/app/app/patient/intake/nutrition/NutritionIntakeClient.tsx` — 5 вопросов пошагово, draft в state, submit -> API

### S12.T06 — Patient history integration
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/patient/cabinet/CabinetIntakeHistory.tsx` — блок истории онлайн-заявок
  - `apps/webapp/src/app/app/patient/cabinet/page.tsx` — подключён CabinetIntakeHistory

### S12.T07 — Tests
- Status: done
- Finished at: 2026-04-01
- Tests: FormatStepClient.test.tsx 3/3 — intake/lfk + intake/nutrition navigation

---

## Stage 13

### S13.T01–S13.T03 — Doctor inbox list + status actions
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/app/app/doctor/online-intake/page.tsx`
  - `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — фильтр new/in_review/all, карточки с status actions

### S13.T04 — Notification bridge (TG/MAX)
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts` — `IntakeNotificationPort` через `relayOutbound` (admin+doctor TG/MAX из `system_settings`)
  - `apps/webapp/src/app-layer/di/onlineIntakeDeps.ts` — подключён `createIntakeNotificationRelay()`
  - `apps/webapp/src/modules/system-settings/supportContactConstants.ts` — дефолт `https://t.me/BersonCareBot`
- Tests: `intakeNotificationRelay.test.ts` (5 кейсов), `service.test.ts` (+3 кейса notification port)
- CI: `pnpm run ci` — green (2026-04-01)
- SHA (HEAD на момент записи): `0a1f20e36c00d41d2af9f86d85de3d4bd1838067`

### S13.T05 — Security
- Status: done
- Notes: canAccessDoctor guard на page.tsx + API routes /api/doctor/online-intake/* (Stage 10)

---

## Stage 14

### S14.T01 — CHECKLISTS release block обновлён
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `CHECKLISTS.md` — добавлен §7 с gate-пунктами для online intake + compat sync

### S14.T02 — CUTOVER_RUNBOOK обновлён
- Status: done
- Finished at: 2026-04-01
- Files changed:
  - `CUTOVER_RUNBOOK.md` — добавлены §7 (compat-sync включение), monitoring queries для compat rows + duplicates + online intake, known limitations

### S14.T03–S14.T04 — Monitoring + rollback
- Status: done
- Notes: SQL monitoring queries в CUTOVER_RUNBOOK.md §Проверки консистентности; rollback описан в §Known limitations

### S14.T05 — Known limitations задокументированы
- Status: done
- Notes: CUTOVER_RUNBOOK.md §Known limitations + COMPATIBILITY_RUBITIME_WEBAPP.md §Known limitations

---

## Stage 15

### S15.T05 — Full CI
- Status: done
- Agent/model: claude-4.6-sonnet-medium-thinking
- CI: pnpm run ci — green ✓ (2026-04-01, повтор после S13.T04)
- Tests: 1013 passed, 5 skipped (227 test files)
- Build: успешен (lint + typecheck + test + webapp:typecheck + build + build:webapp + audit --prod)
- Notes: исправлена TS ошибка в events.ts (??/|| mix) и Next.js 16 dynamic params Promise в API routes; S13.T04 — intake relay + support default BersonCareBot

---

## Итог ветки (Stages 8–15, online intake + compat-sync)

- **Статус:** `ready`
- **Blockers:** нет (S13.T04 закрыт)
- **CI:** `pnpm run ci` — green (2026-04-01); webapp tests: 1013 passed, 5 skipped
- **SHA-base (HEAD):** `0a1f20e36c00d41d2af9f86d85de3d4bd1838067` (рабочее дерево содержит незакоммиченные изменения)

### Post-log remediation (2026-04-01) — DB migration consistency
- Status: done
- Files changed:
  - `apps/webapp/migrations/048_online_intake.sql` — FK corrected: `users(id)` -> `platform_users(id)` for `online_intake_requests.user_id` and `online_intake_status_history.changed_by`
  - `apps/webapp/vitest.globalSetup.ts` — CI now fails fast on migration errors (`CI=true` or `VITEST_REQUIRE_DB_MIGRATIONS=true`) to prevent silent green on broken DB migrations
  - `MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md`, `STAGE_9_ONLINE_INTAKE.md`, `CUTOVER_RUNBOOK.md`, `CHECKLISTS.md` — docs aligned with actual DB schema and current readiness
- Notes: устраняет падение `048_online_intake.sql` с ошибкой `relation "users" does not exist` на БД, где canonical user table — `platform_users`

---

## UX Fix: FormatStep + ServiceDescription

### UXFIX.T01 — FormatStepClient переработан
- Status: done
- Finished at: 2026-04-01
- Changes: `FormatStepClient` показывает два блока (Очный прием: города из каталога; Онлайн: ЛФК + нутрициология); выбор города ведёт сразу на шаг услуг (`bookingNewService`)

### UXFIX.T02 — useBookingCatalog: добавлен description
- Status: done
- Changes: `CatalogBranchService.service` включает поле `description: string | null`

### UXFIX.T03 — ServiceStepClient показывает description
- Status: done
- Changes: `ServiceStepClient.tsx` — описание услуги под названием (если задано в каталоге)

### UXFIX.T04 — тесты FormatStepClient обновлены
- Status: done
- Changes: `FormatStepClient.test.tsx` — мок `useBookingCatalogCities`, сценарии Москва / ЛФК / нутрициология / загрузка городов

---

## Mini app / deploy: chunk load recovery (2026-04-01)

### CHUNK.T01 — Диагностика «Failed to load chunk» в Telegram WebView
- Status: done
- Agent/model: (текущий чат)
- Started at: 2026-04-01
- **Проблема:** в мини-приложении «Берсон • Бот Заботы» падает клиентская загрузка чанка Next.js (`Failed to load chunk …/_next/static/chunks/….js from module …`). Типичные причины: новый деплой удалил старые hashed-чанки при уже открытой сессии; обрыв сети; редко — несогласованный кэш HTML и статики. Это не баг бизнес-логики booking city/service, а рассинхрон клиента и артефактов сборки.
- **План:**
  1. Сохранить текущее поведение «Обновить приложение» (hard reload с query `_v` для обхода кэша).
  2. Расширить эвристику chunk-ошибок: сообщения про dynamic import, `ChunkLoadError` / имя с `chunkload`, разбор `error.cause`.
  3. Прогнать CI (`pnpm run ci`).
- **Выполнение:** обновлён `apps/webapp/src/app/global-error.tsx` — `isChunkLoadFailure` принимает `Error`, проверяет `name`, `message`, вложенный `cause`.
- **Проверка:** `pnpm run ci` — green ✓ (2026-04-01); webapp tests 1014 passed, 5 skipped; integrator 452 passed, 6 skipped
- Files changed:
  - `apps/webapp/src/app/global-error.tsx` — расширенная детекция chunk / dynamic import сбоев
  - `EXECUTION_LOG.md` — эта запись

### NGINX.T01 — Документация: кэш HTML и `/_next/static/` для webapp
- Status: done
- Finished at: 2026-04-01
- **Задача:** зафиксировать в runbook проверку и рекомендации для nginx/CDN (короткий/отсутствующий edge-кэш для HTML, долгий immutable для `/_next/static/`), без выдуманных путей к конфигам на хосте.
- Files changed:
  - `deploy/HOST_DEPLOY_README.md` — блок «Кэширование (Next.js, мини-приложение)» под vhost Webapp: поведение upstream Next, антипаттерны nginx, CDN, команды `curl -sI`
  - `docs/ARCHITECTURE/SERVER CONVENTIONS.md` — ссылка на блок в HOST_DEPLOY_README
  - `EXECUTION_LOG.md` — эта запись
- Notes: фактические заголовки production остаются для подтверждения оператором на хосте/CDN

---

## UX: Patient cabinet — списки записей (2026-04-02)

### CABINET.T01 — Активные и журнал прошлых: плоский список, Изменить в Telegram
- Status: done
- Finished at: 2026-04-02
- Goal: убрать вводящее в заблуждение «Подтверждена» в журнале прошлых, отменить внешнюю ссылку на редактирование прошедших записей из проекции; активные записи — в том же стиле «журнала», действие «Изменить» → `support_contact_url` вместо inline «Отменить».
- Files changed:
  - `apps/webapp/src/app/app/patient/cabinet/CabinetPastBookings.tsx` — статусы: без бейджа для нейтрального подтверждённого; «Отменена» красным; подпись проекции без ссылки на расписание
  - `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx` — одна карточка, строки как в журнале; `manageBookingHref` + «Изменить»
  - `apps/webapp/src/app/app/patient/cabinet/page.tsx` — `getSupportContactUrl()` → проп в активные записи
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — `getPastAppointments`: `link: null` для прошлой истории (не вести на Rubitime URL из payload)
  - удалены `BookingCardActions.tsx`, `useCancelBooking.ts` (отмена через бота; API `/api/booking/cancel` сохранён)
- Docs: `BOOKING_MODULE_SPEC.md` §3.3, §6; `COMPATIBILITY_RUBITIME_WEBAPP.md` — видимость в истории
- Tests: не добавлялись (логика UI); регресс — `pnpm run ci`
- CI: green ✓ (2026-04-02)

---

## TODO / Follow-up (2026-04-02)

### TODO.SLOTS.CACHE.T01 — Стабилизировать выдачу слотов при лимитах Rubitime
- Status: pending
- Added at: 2026-04-02
- Context: периодически наблюдался флап `slots_unavailable` в mini app при быстрых повторных запросах слотов (смена услуги/параллельные запросы), затем самовосстановление после паузы.
- Scope:
  - `integrator`: singleflight/coalescing для одинаковых запросов `get-schedule` (чтобы N параллельных запросов схлопывались в один upstream call).
  - `integrator`: guard по минимальному интервалу между upstream вызовами Rubitime + bounded retry/backoff для `RUBITIME_HTTP_429` и кратковременных `5xx`.
  - `integrator`: короткий cache TTL + fallback stale-on-error (если Rubitime временно недоступен).
  - Наблюдаемость: логировать cache hit/miss, coalesced requests, 429/5xx и количество ретраев.
- Done criteria:
  - при burst одинаковых запросов нет лавины в Rubitime;
  - кратковременный 429 не приводит к массовому `slots_unavailable` в UI;
  - поведение покрыто тестами интеграционного слоя Rubitime (`client/route`).

---

## Rubitime: обязательное поле `status` в API2 create-record (2026-04-02)

### RUBI.T01 — Исправление падения подтверждения записи (шаг 4 wizard)
- Status: done
- Finished at: 2026-04-02
- **Ошибка в проде (webapp):** при нажатии «Подтвердить запись» на шаге подтверждения отображалось `RUBITIME_API_ERROR: Field "status" is required`. Цепочка: webapp → integrator M2M `POST /api/bersoncare/rubitime/create-record` → Rubitime `https://rubitime.ru/api2/create-record`. В теле запроса к Rubitime не передавалось обязательное поле **`status`** (числовой id статуса записи в кабинете).
- **Правка:** в `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` в payload для v1 и v2 добавлено **`status: RUBITIME_CREATE_RECORD_DEFAULT_STATUS`** со значением **`0`**. Оператор подтвердил: **0 соответствует статусу «записан»** в их Rubitime.
- **Тесты:** обновлены ожидания в `apps/integrator/src/integrations/rubitime/recordM2mRoute.test.ts` (наличие `status: 0` в данных для `createRubitimeRecord`).
- **Техдолг:** захардкоженный id статуса — см. `TODO_BACKLOG.md` **AUDIT-BACKLOG-025** (нормальное хранение таблицы/маппинга статусов, при необходимости — `system_settings`, не env).
- **Деплой:** требуется выкат **integrator** с этой правкой; webapp менять не обязательно для этого фикса.
- **Проверка:** `pnpm --dir apps/integrator vitest run src/integrations/rubitime/recordM2mRoute.test.ts` — green; перед пушем репозитория — полный `pnpm run ci` по правилам монорепо.

---

## Timezone и семантика слотов Rubitime (2026-04-02)

Сводка найденных ошибок и внесённых исправлений (webapp + integrator). Полный CI: `pnpm run ci` — green перед пушем.

### TZ.T01 — Отображение времени записей в webapp без единой бизнес-таймзоны

- **Симптомы:** время в кабинете пациента (активные / журнал), на шаге подтверждения wizard и у врача расходилось с ожидаемым «московским» временем и с Rubitime; часть экранов зависела от TZ процесса Node (SSR) или от TZ браузера, без явного `timeZone` в `Intl`.
- **Причина:** `toLocaleString` / `toLocaleTimeString` без `timeZone`; в `pgDoctorAppointments` для списка записей использовались `getUTC*` (фактически UTC-«настенное» время).
- **Правка:**
  - Ключ **`app_display_timezone`** в `system_settings` (`ALLOWED_KEYS`, PATCH `/api/admin/settings`), дефолт **`Europe/Moscow`**, чтение через **`getAppDisplayTimeZone()`** (`apps/webapp/src/modules/system-settings/appDisplayTimezone.ts`) и **`getConfigValue`** с TTL-кэшем.
  - Общий модуль **`formatBusinessDateTime.ts`**: `formatBookingDateTimeMediumRu`, `formatBookingTimeShortRu`, `formatBookingDateLongRu`, `formatDoctorAppointmentRecordAt` с явным `timeZone`.
  - **Кабинет:** `CabinetActiveBookings`, `CabinetPastBookings`, `page.tsx` — прокидка `appDisplayTimeZone` с сервера.
  - **Wizard:** `ConfirmStepClient` + `booking/new/confirm/page.tsx` — та же таймзона для сводки даты/времени.
  - **Врач:** `AppointmentRow.recordAtIso` из PG, форматирование `time` в **`createDoctorAppointmentsService`** через `formatDoctorAppointmentRecordAt` + `getAppDisplayTimeZone()`.
  - **Админка:** `RuntimeConfigSection` — поле ввода IANA-таймзоны; `settings/page.tsx` передаёт начальное значение.
- **Файлы (основные):** `types.ts` (ALLOWED_KEYS), `app/api/admin/settings/route.ts`, `formatBusinessDateTime.ts` (+ unit-тесты), `appDisplayTimezone.ts` (+ тест), `CabinetActiveBookings.tsx`, `CabinetPastBookings.tsx`, `cabinet/page.tsx`, `ConfirmStepClient.tsx`, `confirm/page.tsx`, `pgDoctorAppointments.ts`, `doctor-appointments/service.ts` + `ports.ts`, `doctor-appointments/service.test.ts`, `RuntimeConfigSection.tsx`, `app/app/settings/page.tsx`.

### TZ.T02 — Выбор слота в wizard: `BookingSlotList` и локаль браузера

- **Симптом:** кнопки слотов на шаге «дата/время» форматировались через `toLocaleTimeString` без `timeZone` (зависимость от TZ браузера), в рассинхроне с политикой «всегда бизнес-TZ».
- **Правка:** обязательный проп **`appDisplayTimeZone`**; `booking/new/slot/page.tsx` вызывает `getAppDisplayTimeZone()` и передаёт в **`SlotStepClient`** → **`BookingSlotList`**; время через **`formatBookingTimeShortRu`**.
- **Файлы:** `apps/webapp/src/app/app/patient/cabinet/BookingSlotList.tsx`, `booking/new/slot/SlotStepClient.tsx`, `booking/new/slot/page.tsx`, `SlotStepClient.test.tsx`.

### TZ.T03 — Integrator `scheduleNormalizer`: настенное время Rubitime vs `Date.UTC`

- **Симптом:** расхождение времени слотов с Rubitime (в т.ч. после явного MSK в UI): ответ `api2/get-schedule` интерпретировался неверно.
- **Причина:** в **`buildIsoSlot`** время `HH:MM` из Rubitime собиралось через **`Date.UTC`**, т.е. настенные часы клиники ошибочно трактовались как UTC; в ответ отдавались строки без `Z`, и `new Date(...)` в разных средах давал разный instant.
- **Правка:** трактовка настенного времени как **MSK `+03:00`**, согласовано с webapp **`bookingM2mApi`** (`DEFAULT_SLOT_TZ`); **`startAt` / `endAt`** — полноценный **ISO UTC (`…Z`)** через `toISOString()`.
- **Файлы:** `apps/integrator/src/integrations/rubitime/scheduleNormalizer.ts`, `scheduleNormalizer.test.ts` (ожидания обновлены под UTC-instant).

### TZ.T04 — Наивные ISO без зоны в webapp: `parseBusinessInstant`

- **Симптом:** остаточный рассинхрон при отображении старых/промежуточных ответов со строками вида `2026-04-10T10:00:00` без `Z`/offset.
- **Причина:** ECMAScript по-разному интерпретирует ISO без суффикса зоны (Node UTC vs браузер MSK и т.д.).
- **Правка:** функция **`parseBusinessInstant(iso, displayTimeZone)`** — если строка без `Z`/±offset и **`displayTimeZone === 'Europe/Moscow'`**, к наивной метке добавляется **`+03:00`** перед разбором; используется во всех форматтерах из `formatBusinessDateTime.ts`.
- **Файлы:** `apps/webapp/src/shared/lib/formatBusinessDateTime.ts`, `formatBusinessDateTime.test.ts`.

### TZ.T05 — Наследие данных и деплой

- **Строки в БД**, созданные до правок **`scheduleNormalizer`**, могут содержать неверный **`slot_start`/`record_at`**; отображение после TZ.T03–TZ.T04 станет согласованным для новых слотов; **старые** строки при необходимости — повторная синхронизация с Rubitime / отдельный backfill (вне scope этого лога).
- **Деплой:** для TZ.T03 — выкат **integrator**; для TZ.T01–TZ.T02, TZ.T04 — выкат **webapp**. Правка **RUBI.T01** (`status` в create-record) — только integrator (см. выше).

### TZ.T06 — Дашборд врача vs карточка клиента: единая бизнес-таймзона

- **Симптом:** на `/app/doctor` виджет «Ближайший приём» показывал одно время, в карточке клиента («Ближайшие записи») — другое для того же `record_at`.
- **Причина:** список будущих записей для дашборда шёл через **`createDoctorAppointmentsService`** → **`formatDoctorAppointmentRecordAt`** + **`getAppDisplayTimeZone()`**; подписи для **`getUpcomingAppointments`** / **`getPastAppointments`** в **`buildAppDeps.ts`** строились через **`formatRuAppointmentDate` / `formatRuAppointmentTime`** без `timeZone` (зависимость от TZ процесса Node, часто не совпадает с **`app_display_timezone`** в БД). Аналогично подпись строки истории в **`listAppointmentHistoryForPhone`** использовала **`toLocaleString("ru-RU")`** без зоны.
- **Правка:** **`formatAppointmentDateNumericRu`**, **`formatAppointmentTimeShortRu`** в **`formatBusinessDateTime.ts`**; в DI — та же **`getAppDisplayTimeZone()`** для предстоящих/прошлых записей и **`formatBookingDateTimeMediumRu`** для истории; устаревшие хелперы помечены **`@deprecated`**.
- **Файлы:** `apps/webapp/src/shared/lib/formatBusinessDateTime.ts`, `formatBusinessDateTime.test.ts`, `apps/webapp/src/app-layer/di/buildAppDeps.ts`, `apps/webapp/src/modules/appointments/appointmentLabels.ts`; архитектура: `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md`, `docs/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md`.
