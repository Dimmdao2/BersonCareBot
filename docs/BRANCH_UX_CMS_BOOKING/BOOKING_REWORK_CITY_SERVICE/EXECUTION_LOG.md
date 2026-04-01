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
- Status: pending

### S5.T02 - Упростить recordM2mRoute для slots/create
- Status: pending

### S5.T03 - Изолировать legacy bookingProfilesRepo от runtime path
- Status: pending

### S5.T04 - Обновить webhook update logic под v2 snapshots
- Status: pending

### S5.T05 - Подготовить cutover runbook
- Status: pending

---

## Stage 6

### S6.T01 - Добавить тест-матрицу e2e сценариев очной записи
- Status: pending

### S6.T02 - Реализовать unit/integration тесты webapp v2
- Status: pending

### S6.T03 - Реализовать unit/integration тесты integrator v2
- Status: pending

### S6.T04 - Провести аудит этапов и закрыть замечания
- Status: pending

### S6.T05 - Финальный pre-release check
- Status: pending
