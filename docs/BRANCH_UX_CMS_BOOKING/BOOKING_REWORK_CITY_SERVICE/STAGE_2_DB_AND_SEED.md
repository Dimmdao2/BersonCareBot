# Stage 2: DB And Seed

Цель этапа: внедрить новую схему в webapp DB, добавить backfill и стартовый seed Точки Здоровья.

## S2.T01 - Создать миграцию каталога booking v2

**Цель:** добавить таблицы каталога очной записи.

**Файлы:**
- `apps/webapp/migrations/<new>_booking_catalog_v2.sql`

**Шаги:**
1. Создать таблицы: `booking_cities`, `booking_branches`, `booking_specialists`, `booking_services`, `booking_branch_services`.
2. Проставить FK/UNIQUE/INDEX.
3. Добавить `created_at`, `updated_at`, `is_active`.
4. Для `booking_branch_services` сделать unique `(branch_id, service_id)`.

**Тесты:**
- [ ] migration smoke (up/down)

**Критерии готовности:**
- Миграция применяется без ручных правок.
- Схема соответствует `MIGRATION_CONTRACT_V2.md`.

**Лог:** `S2.T01`.

---

## S2.T02 - Расширить patient_bookings для новой модели

**Цель:** добавить явные ссылки на выбранные сущности и Rubitime snapshot IDs.

**Файлы:**
- `apps/webapp/migrations/<new>_patient_bookings_v2_refs.sql`

**Шаги:**
1. Добавить nullable колонки: `branch_id`, `service_id`, `branch_service_id`.
2. Добавить snapshot колонки: `city_code_snapshot`, `branch_title_snapshot`, `service_title_snapshot`, `duration_minutes_snapshot`, `price_minor_snapshot`.
3. Добавить rubitime snapshot: `rubitime_branch_id_snapshot`, `rubitime_cooperator_id_snapshot`, `rubitime_service_id_snapshot`.
4. Добавить индексы на `branch_id`, `service_id`, `branch_service_id`.

**Тесты:**
- [ ] migration smoke (up/down)

**Критерии готовности:**
- Старая логика не ломается (колонки nullable).
- Новая схема готова к dual-write.

**Лог:** `S2.T02`.

---

## S2.T03 - Реализовать репозитории каталога в webapp

**Цель:** дать webapp доменные read/write-порты каталога.

**Файлы для создания:**
- `apps/webapp/src/modules/booking-catalog/types.ts`
- `apps/webapp/src/modules/booking-catalog/ports.ts`
- `apps/webapp/src/modules/booking-catalog/service.ts`
- `apps/webapp/src/infra/repos/pgBookingCatalog.ts`

**Файлы для изменения:**
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Шаги:**
1. Описать доменные типы city/branch/service/branchService.
2. Реализовать методы:
   - `listCitiesForPatient()`
   - `listServicesByCity(cityCode)`
   - `resolveBranchService(branchServiceId)`
3. Подключить сервис в DI.

**Тесты:**
- [ ] repo tests на выборки по city
- [ ] service tests на resolve и ошибки not found/inactive

**Критерии готовности:**
- Patient flow может читать каталог без integrator DB.

**Лог:** `S2.T03`.

---

## S2.T04 - Подготовить seed script для Точки Здоровья

**Цель:** загрузить стартовые города/филиалы/услуги/специалистов и связи.

**Файлы для создания:**
- `apps/webapp/scripts/seed-booking-catalog-tochka-zdorovya.ts`

**Файлы для изменения:**
- `apps/webapp/package.json` (script entry)

**Шаги:**
1. Использовать `SEED_MAPPING_TOCHKA_ZDOROVYA.md` как source.
2. Сделать upsert seed (идемпотентный запуск).
3. Добавить флаг `--check-only` для dry validation.
4. Добавить fail-fast при отсутствующих обязательных rubitime IDs.

**Тесты:**
- [ ] unit/integration test seed idempotency
- [ ] test check-only mode

**Критерии готовности:**
- Повторный запуск не создает дубли.
- Нет silent skip при невалидных данных.

**Лог:** `S2.T04`.

---

## S2.T05 - Реализовать backfill из legacy полей

**Цель:** частично заполнить новые поля в `patient_bookings` для существующих записей.

**Файлы для создания:**
- `apps/webapp/scripts/backfill-patient-bookings-v2.ts`

**Файлы для изменения:**
- `apps/webapp/package.json`

**Шаги:**
1. Смаппить `city/category` на `branch_service_id` по доступным правилам.
2. Где матч невозможен - писать в отчет и не ломать миграцию.
3. Заполнять snapshot поля только при уверенном соответствии.
4. Сохранить статистику: updated/skipped/conflicts.

**Тесты:**
- [ ] backfill dry-run test
- [ ] backfill conflict case test

**Критерии готовности:**
- Есть детальный отчет backfill.
- Скрипт поддерживает dry-run.

**Лог:** `S2.T05`.

---

## S2.T06 - Документировать cutover-стратегию БД

**Цель:** зафиксировать порядок переключения read/write на новые поля.

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_DB_PLAN.md`

**Шаги:**
1. Описать dual-write фазу.
2. Описать dual-read и критерий полного переключения.
3. Описать rollback-процедуру.

**Тесты:** не требуются (документация).

**Критерии готовности:**
- Есть пошаговый runbook для прод-катовера.

**Лог:** `S2.T06`.
