# Фаза 2: атомарные задачи (native booking — city+service rework)

> **Обновлено:** 2026-04-01. Декомпозиция синхронизирована с booking rework city+service.  
> Источник правды: `BOOKING_MODULE_SPEC.md` (раздел 11), `BOOKING_REWORK_CITY_SERVICE/STAGE_*.md`, `API_CONTRACT_V2.md`, `MIGRATION_CONTRACT_V2.md`.  
> **Scope:** только `booking_type = 'in_person'`. Online-запись не затронута.

Структура блоков:

| Блок | Тема |
|---|---|
| **2.A** | DB-миграции и репозитории каталога |
| **2.B** | Admin UI/API для управления каталогом |
| **2.C** | Пользовательский flow очной записи v2 |
| **2.D** | Integrator bridge + cutover legacy |
| **2.E** | Тесты, аудит и релиз |

---

## Целевая структура модулей для Фазы 2

### Backend (по текущим конвенциям)

1. **Integrator (технический мост к Rubitime):**
   - `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — принимает **явные** Rubitime IDs, не резолвит category/city
   - `apps/integrator/src/integrations/rubitime/internalContract.ts` — v2-контракт slots/create
   - `apps/integrator/src/integrations/rubitime/schema.ts` — Zod-схемы v1/v2
   - `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts` — **legacy only**, помечен deprecated

2. **Webapp (владелец каталога и booking-доменов):**
   - `apps/webapp/src/modules/booking-catalog/` — types/ports/service каталога (города/филиалы/услуги/специалисты)
   - `apps/webapp/src/modules/patient-booking/` — types/ports/service пациентской записи
   - `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — SQL-репо каталога
   - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — SQL-репо записей
   - `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — M2M клиент, отправляет explicit IDs
   - `apps/webapp/src/app/api/booking/*` — public API (slots/create/cancel/my)
   - `apps/webapp/src/app/api/admin/booking-catalog/*` — admin API каталога

### Frontend (по текущим конвенциям)

1. **Кабинет пациента:**
   - `apps/webapp/src/app/app/patient/cabinet/page.tsx` — flow: город → услуга → слот
   - `apps/webapp/src/app/app/patient/cabinet/useBookingSelection.ts` — state city/branchService

2. **Admin Settings:**
   - `apps/webapp/src/app/app/settings/RubitimeSection.tsx` — управление каталогом

---

## 2.A — DB-миграции и репозитории каталога

### Задача 2.A1: Миграция каталога booking v2

**Цель:** добавить таблицы каталога очной записи в webapp DB.

**Предусловия:**
- Stage 1 завершён (`MIGRATION_CONTRACT_V2.md` утверждён)
- Миграционный pipeline webapp работает

**Файлы для создания:**
1. `apps/webapp/migrations/<timestamp>_booking_catalog_v2.sql` — таблицы `booking_cities`, `booking_branches`, `booking_specialists`, `booking_services`, `booking_branch_services`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Создать все пять таблиц каталога по DDL из `MIGRATION_CONTRACT_V2.md`.
- Проставить FK/UNIQUE/INDEX согласно контракту.
- Добавить `created_at`, `updated_at`, `is_active` в каждую таблицу.
- Для `booking_branch_services` — уникальный составной ключ `(branch_id, service_id)`.
- Написать rollback (DOWN) секцию.

**Тесты:**
- [ ] Migration smoke: up/down без ошибок
- [ ] Проверка FK-ограничений при удалении родительской записи

**Критерии готовности:**
- [ ] Миграция применяется без ручных правок
- [ ] Схема полностью соответствует `MIGRATION_CONTRACT_V2.md`
- [ ] `pnpm run ci` зелёный

---

### Задача 2.A2: Расширить patient_bookings для модели v2

**Цель:** добавить явные ссылки на каталог и Rubitime snapshot-поля.

**Предусловия:**
- Задача 2.A1 выполнена

**Файлы для создания:**
1. `apps/webapp/migrations/<timestamp>_patient_bookings_v2_refs.sql` — nullable FK-колонки и snapshot-поля

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Добавить nullable FK: `branch_id`, `service_id`, `branch_service_id`.
- Добавить snapshot-колонки: `city_code_snapshot`, `branch_title_snapshot`, `service_title_snapshot`, `duration_minutes_snapshot`, `price_minor_snapshot`.
- Добавить rubitime snapshot: `rubitime_branch_id_snapshot`, `rubitime_cooperator_id_snapshot`, `rubitime_service_id_snapshot`.
- Добавить индексы на `branch_id`, `service_id`, `branch_service_id`.
- Все новые колонки nullable — legacy-записи не ломаются.

**Тесты:**
- [ ] Migration smoke: up/down
- [ ] Существующие записи читаются корректно после миграции (nullable поля = NULL)

**Критерии готовности:**
- [ ] Старая логика не ломается (все новые колонки nullable)
- [ ] Схема готова к dual-write
- [ ] `pnpm run ci` зелёный

---

### Задача 2.A3: Репозитории каталога в webapp

**Цель:** дать webapp доменные read/write-порты каталога без зависимости от integrator DB.

**Предусловия:**
- Задача 2.A1 выполнена

**Файлы для создания:**
1. `apps/webapp/src/modules/booking-catalog/types.ts` — доменные типы City/Branch/Service/Specialist/BranchService
2. `apps/webapp/src/modules/booking-catalog/ports.ts` — интерфейсы `BookingCatalogReadPort`, `BookingCatalogWritePort`
3. `apps/webapp/src/modules/booking-catalog/service.ts` — `listCitiesForPatient()`, `listServicesByCity(cityCode)`, `resolveBranchService(id)`
4. `apps/webapp/src/infra/repos/pgBookingCatalog.ts` — SQL-реализация портов

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/di/buildAppDeps.ts` — подключить `bookingCatalog` сервис в DI

**Файлы для удаления:**
- Нет

**Детальное описание:**
- `resolveBranchService` бросает ошибку при `is_active = false` (не молчит).
- Методы для пациентского flow читают только `is_active = true` записи.
- Admin write-порт (upsert/deactivate) реализован в задаче 2.B.

**Тесты:**
- [ ] Repo tests: listCitiesForPatient, listServicesByCity
- [ ] Service test: resolveBranchService возвращает ошибку при inactive

**Критерии готовности:**
- [ ] `deps.bookingCatalog` доступен в DI
- [ ] Patient flow читает каталог из webapp DB без вызовов integrator
- [ ] `pnpm run ci` зелёный

---

### Задача 2.A4: Seed script для Точки Здоровья

**Цель:** загрузить стартовые города/филиалы/услуги/специалистов и связи.

**Предусловия:**
- Задача 2.A1 выполнена
- `SEED_MAPPING_TOCHKA_ZDOROVYA.md` утверждён

**Файлы для создания:**
1. `apps/webapp/scripts/seed-booking-catalog-tochka-zdorovya.ts` — idempotent seed script

**Файлы для изменения:**
1. `apps/webapp/package.json` — добавить script entry `seed:booking-catalog`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Использовать upsert (идемпотентный повторный запуск).
- Добавить флаг `--check-only` для dry-run без записи.
- Fail-fast при отсутствии обязательных rubitime IDs (не пропускать молча).
- Логировать результат: created/updated/skipped/errors.

**Тесты:**
- [ ] Integration test: повторный запуск seed не создаёт дубли
- [ ] Test: `--check-only` не пишет в БД

**Критерии готовности:**
- [ ] Повторный запуск seed не создаёт дубли
- [ ] Нет silent skip при отсутствующих/невалидных данных
- [ ] `pnpm run ci` зелёный

---

### Задача 2.A5: Backfill patient_bookings из legacy полей

**Цель:** частично заполнить новые поля для существующих записей, где возможен однозначный match.

**Предусловия:**
- Задачи 2.A2, 2.A4 выполнены

**Файлы для создания:**
1. `apps/webapp/scripts/backfill-patient-bookings-v2.ts` — backfill с dry-run режимом

**Файлы для изменения:**
1. `apps/webapp/package.json` — добавить script entry `backfill:patient-bookings-v2`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Маппить `city/category` → `branch_service_id` по правилам seed-каталога.
- Где матч невозможен — писать в отчёт и пропускать (не ломать скрипт).
- Заполнять snapshot-поля только при уверенном соответствии.
- Сохранять статистику: updated/skipped/conflicts.

**Тесты:**
- [ ] Backfill dry-run test (нет записи в БД)
- [ ] Backfill conflict case test (неоднозначный match → skipped)

**Критерии готовности:**
- [ ] Backfill генерирует детальный отчёт
- [ ] Скрипт поддерживает dry-run режим
- [ ] `pnpm run ci` зелёный

---

### Задача 2.A6: Документировать cutover-стратегию БД

**Цель:** зафиксировать порядок переключения read/write на новые поля.

**Предусловия:**
- Задачи 2.A1–2.A5 выполнены

**Файлы для создания:**
1. `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_DB_PLAN.md`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Описать фазу dual-write (старые + новые поля заполняются параллельно).
- Описать dual-read и критерий полного переключения на v2.
- Описать rollback-процедуру без потери данных.

**Тесты:** не требуются (документация).

**Критерии готовности:**
- [ ] Есть пошаговый runbook для прод-катовера БД
- [ ] Rollback описан без потери данных

---

## 2.B — Admin UI/API для управления каталогом

### Задача 2.B1: Admin API для городов (cities)

**Цель:** дать администратору API для CRUD городов.

**Предусловия:**
- Задача 2.A3 выполнена
- Существует `requireAdmin()` middleware

**Файлы для создания:**
1. `apps/webapp/src/app/api/admin/booking-catalog/cities/route.ts` — GET/POST
2. `apps/webapp/src/app/api/admin/booking-catalog/cities/[id]/route.ts` — GET/PATCH/DELETE (soft deactivate)

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Использовать `requireAdmin()` и `adminMode` на всех маршрутах.
- Валидировать payload Zod-схемой.
- Soft delete: деактивация через `is_active = false`, не физическое удаление.

**Тесты:**
- [ ] Route tests: auth guard (403 без admin)
- [ ] Route tests: Zod-валидация обязательных полей

**Критерии готовности:**
- [ ] CRUD городов доступен только admin
- [ ] `pnpm run ci` зелёный

---

### Задача 2.B2a: Admin API для branches

**Цель:** дать администратору CRUD для филиалов.

**Предусловия:**
- Задача 2.B1 выполнена

**Файлы для создания:**
1. `apps/webapp/src/app/api/admin/booking-catalog/branches/route.ts` — GET/POST
2. `apps/webapp/src/app/api/admin/booking-catalog/branches/[id]/route.ts` — GET/PATCH/DELETE (soft deactivate)

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Branch хранит `city_id` (FK) и `rubitime_branch_id`.
- `requireAdmin()`, Zod-валидация, soft deactivate (`is_active = false`).

**Тесты:**
- [ ] Route tests: auth guard (403 без admin)
- [ ] Route tests: Zod-валидация `rubitime_branch_id` обязателен

**Критерии готовности:**
- [ ] CRUD филиалов доступен только admin
- [ ] `pnpm run ci` зелёный

---

### Задача 2.B2b: Admin API для services

**Цель:** дать администратору CRUD для услуг (глобальный справочник).

**Предусловия:**
- Задача 2.B1 выполнена

**Файлы для создания:**
1. `apps/webapp/src/app/api/admin/booking-catalog/services/route.ts` — GET/POST
2. `apps/webapp/src/app/api/admin/booking-catalog/services/[id]/route.ts` — GET/PATCH/DELETE (soft deactivate)

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Service хранит `duration_minutes` и `price_minor`.
- `requireAdmin()`, Zod-валидация, soft deactivate.

**Тесты:**
- [ ] Route tests: auth guard
- [ ] Route tests: валидация `duration_minutes` и `price_minor` обязательны

**Критерии готовности:**
- [ ] CRUD услуг доступен только admin
- [ ] `pnpm run ci` зелёный

---

### Задача 2.B2c: Admin API для specialists

**Цель:** дать администратору CRUD для специалистов.

**Предусловия:**
- Задача 2.B2a выполнена

**Файлы для создания:**
1. `apps/webapp/src/app/api/admin/booking-catalog/specialists/route.ts` — GET/POST
2. `apps/webapp/src/app/api/admin/booking-catalog/specialists/[id]/route.ts` — GET/PATCH/DELETE (soft deactivate)

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Specialist хранит `branch_id` (FK) и `rubitime_cooperator_id`.
- `requireAdmin()`, Zod-валидация, soft deactivate.

**Тесты:**
- [ ] Route tests: auth guard
- [ ] Route tests: валидация `rubitime_cooperator_id` обязателен

**Критерии готовности:**
- [ ] CRUD специалистов доступен только admin
- [ ] `pnpm run ci` зелёный

---

### Задача 2.B3: Admin API для branch-service связок

**Цель:** дать администратору управление связками «какая услуга доступна в каком филиале у какого специалиста».

**Предусловия:**
- Задачи 2.B2a, 2.B2b, 2.B2c выполнены

**Файлы для создания:**
1. `apps/webapp/src/app/api/admin/booking-catalog/branch-services/route.ts`
2. `apps/webapp/src/app/api/admin/booking-catalog/branch-services/[id]/route.ts`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Upsert связи `branch_id + service_id + specialist_id`.
- Хранить `rubitime_service_id` на уровне связки.
- Добавить флаг `is_active` и поле `sort_order`.
- Уникальный constraint `(branch_id, service_id)` проверяется на уровне API.

**Тесты:**
- [ ] Route test: unique conflict (409)
- [ ] Route test: deactivated branch-service не возвращается в patient endpoints

**Критерии готовности:**
- [ ] Для каждого филиала можно настроить набор услуг с Rubitime IDs
- [ ] `pnpm run ci` зелёный

---

### Задача 2.B4: Переработать RubitimeSection под каталог v2

**Цель:** заменить legacy-секции booking profiles на UI управления каталогом.

**Предусловия:**
- Задачи 2.B1–2.B3 выполнены

**Файлы для изменения:**
1. `apps/webapp/src/app/app/settings/RubitimeSection.tsx` — заменить legacy секции на новые формы каталога

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Добавить формы: города / филиалы / услуги / специалисты / branch-service связи.
- Отображать Rubitime IDs для операторской проверки.
- Убрать формы `bookingType/category/city → rubitime profile`.

**Тесты:**
- [ ] Smoke test: admin UI рендерит формы каталога без ошибок

**Критерии готовности:**
- [ ] В UI нет legacy `bookingType/category/city → profile`
- [ ] `pnpm run ci` зелёный

---

### Задача 2.B5: Операторский help-блок в Settings

**Цель:** дать администратору инструкцию по порядку настройки каталога.

**Предусловия:**
- Задача 2.B4 выполнена

**Файлы для создания:**
1. `apps/webapp/src/app/app/settings/BookingCatalogHelp.tsx` — информационный блок

**Файлы для изменения:**
1. `apps/webapp/src/app/app/settings/page.tsx` — подключить `BookingCatalogHelp`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Краткий runbook: сначала города → филиалы/специалисты/услуги → branch-service связи.
- Предупреждение о необходимости валидных Rubitime IDs.

**Тесты:** не требуются (информационный блок).

**Критерии готовности:**
- [ ] Оператор видит порядок настройки внутри Admin Settings
- [ ] `pnpm run ci` зелёный

---

## 2.C — Пользовательский flow очной записи v2

### Задача 2.C1: Обновить доменные типы patient-booking

**Цель:** убрать зависимость очного v2 от поля `category`.

**Предусловия:**
- Задача 2.A3 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/modules/patient-booking/types.ts` — добавить `cityCode`, `branchServiceId`; `category` → deprecated для in-person v2
2. `apps/webapp/src/modules/patient-booking/ports.ts` — обновить типы ответа слотов под branch-service контекст

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Для `booking_type = 'in_person'` v2 обязательны `cityCode` + `branchServiceId`.
- `category` остаётся для legacy online-path, для очного v2 помечается deprecated.
- Типы слотов включают `branchServiceId`, `serviceTitle`, `durationMinutes`.

**Тесты:**
- [ ] Type-level checks
- [ ] Unit tests: валидация input с cityCode/branchServiceId

**Критерии готовности:**
- [ ] Контракт очного v2 не зависит от `category`
- [ ] `pnpm run ci` зелёный

---

### Задача 2.C2: Обновить booking service на branch-service резолв

**Цель:** patient-booking service работает от branch-service связки, не от category/city логики.

**Предусловия:**
- Задачи 2.A3, 2.C1 выполнены

**Файлы для изменения:**
1. `apps/webapp/src/modules/patient-booking/service.ts` — резолв через `bookingCatalog`, сборка Rubitime IDs, snapshot в patient_bookings

**Файлы для удаления:**
- Нет

**Детальное описание:**
- `getSlots`: резолвить branch-service из каталога, передавать explicit IDs в integrator.
- `createBooking`: записывать snapshot rubitime IDs и service/branch fields в `patient_bookings`.
- Rollback при slot overlap.
- Integrator не получает `category` для очного v2.

**Тесты:**
- [ ] Service tests: getSlots/createBooking с валидным branchService
- [ ] Service tests: inactive branchService → контролируемая ошибка

**Критерии готовности:**
- [ ] Сервис работает от branch-service связки
- [ ] Integrator не получает `category` для in-person v2
- [ ] `pnpm run ci` зелёный

---

### Задача 2.C3: Обновить M2M adapter webapp → integrator

**Цель:** M2M payload содержит explicit Rubitime IDs вместо category/city.

**Предусловия:**
- Задача 2.C2 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — v2 payload для slots/create

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Payload slots/create: `rubitimeBranchId`, `rubitimeCooperatorId`, `rubitimeServiceId`, `slotStart`.
- HMAC-signing без изменений.
- Добавить обработку новых кодов ошибок integrator v2.

**Тесты:**
- [ ] Adapter tests: payload mapping explicit IDs
- [ ] Adapter tests: ошибки integrator маппятся в доменные коды

**Критерии готовности:**
- [ ] Webapp не отправляет `category` для in-person v2
- [ ] `pnpm run ci` зелёный

---

### Задача 2.C4: Переработать UI выбора в кабинете пациента

**Цель:** flow «город → услуга → время» вместо «тип → категория → время».

**Предусловия:**
- Задача 2.C2 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/useBookingSelection.ts` — state city/branchService вместо type/category
2. `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — шаги: город → услуга → дата/время

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Шаг 1: выбор города из каталога.
- Шаг 2: услуги, доступные выбранному городу (из каталога).
- Шаг 3: дата/время.
- Выбор сотрудника в UI не показывать (определяется branch-service связкой автоматически).
- Online-кнопку не трогать (вне scope).

**Тесты:**
- [ ] UI tests/RTL: city → services filtering
- [ ] UI tests: нельзя запросить слоты до выбора услуги

**Критерии готовности:**
- [ ] Пациент проходит очную запись без выбора сотрудника
- [ ] Онлайн-поток не изменён
- [ ] `pnpm run ci` зелёный

---

### Задача 2.C5: Обновить public API routes booking в webapp

**Цель:** API принимает и валидирует v2 payload с branchServiceId.

**Предусловия:**
- Задача 2.C3 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/api/booking/slots/route.ts` — принять `cityCode`, `branchServiceId`
2. `apps/webapp/src/app/api/booking/create/route.ts` — обязательный `branchServiceId` для in-person v2
3. `apps/webapp/src/app/api/booking/slots/route.test.ts` — обновить тесты
4. `apps/webapp/src/app/api/booking/create/route.test.ts` — обновить тесты

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Валидация Zod: `branchServiceId` обязателен для `type = 'in_person'`.
- Возвращать типизированные ошибки для UI (например `branch_service_not_found`, `slot_not_available`).
- Старый path (category) остаётся совместимым через deprecated warn.

**Тесты:**
- [ ] API tests: success/error matrix для v2 payload
- [ ] API tests: 400 при отсутствии branchServiceId для in-person

**Критерии готовности:**
- [ ] API покрывает v2, legacy path совместим или явно deprecated
- [ ] `pnpm run ci` зелёный

---

### Задача 2.C6: Dual-read для legacy записей в кабинете

**Цель:** кабинет корректно показывает старые и новые записи.

**Предусловия:**
- Задачи 2.A2, 2.C5 выполнены

**Файлы для изменения:**
1. `apps/webapp/src/infra/repos/pgPatientBookings.ts` — read old+new rows
2. Компоненты истории/списка записей в кабинете

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Для старых записей без `branch_service_id` показывать fallback-метки.
- Для новых записей показывать city/service snapshots.
- Не ломать текущую историю записей.

**Тесты:**
- [ ] Repo tests: read old+new rows смешанно
- [ ] UI test: кабинет рендерит карточки обоих типов без ошибок

**Критерии готовности:**
- [ ] Кабинет корректно рендерит mixed data
- [ ] `pnpm run ci` зелёный

---

## 2.D — Integrator bridge + cutover legacy

### Задача 2.D1: Обновить integrator M2M contracts на explicit IDs

**Цель:** integrator формально поддерживает v2-контракт с явными Rubitime IDs.

**Предусловия:**
- `API_CONTRACT_V2.md` утверждён

**Файлы для изменения:**
1. `apps/integrator/src/integrations/rubitime/internalContract.ts` — v2 поля `rubitimeBranchId`, `rubitimeCooperatorId`, `rubitimeServiceId`
2. `apps/integrator/src/integrations/rubitime/schema.ts` — Zod v1/v2 схемы

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Для in-person v2 поля rubitime IDs обязательны.
- Старый `category/city` оставить как deprecated (временно, для v1 compat).

**Тесты:**
- [ ] Schema parsing tests v1/v2
- [ ] Test: v2 payload без explicit IDs → validation error

**Критерии готовности:**
- [ ] Integrator формально поддерживает v2 контракт
- [ ] `pnpm run ci` зелёный

---

### Задача 2.D2: Упростить recordM2mRoute для slots/create

**Цель:** для in-person v2 integrator использует IDs из webapp, не вызывает `resolveScheduleParams()`.

**Предусловия:**
- Задача 2.D1 выполнена

**Файлы для изменения:**
1. `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — v2 branch не вызывает legacy resolve

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Для in-person v2 использовать `rubitimeBranchId`, `rubitimeCooperatorId`, `rubitimeServiceId` напрямую.
- `resolveScheduleParams()` вызывается только для legacy v1.
- Сохранить guard/signature/window поведение без изменений.
- Стандартизированный error mapping без изменений.

**Тесты:**
- [ ] Route tests: accepts explicit IDs, не вызывает resolve
- [ ] Route tests: отклоняет отсутствующие IDs для in-person v2

**Критерии готовности:**
- [ ] Integrator не зависит от catalog данных для v2 runtime
- [ ] `pnpm run ci` зелёный

---

### Задача 2.D3: Изолировать legacy bookingProfilesRepo от runtime path

**Цель:** legacy resolve доступен только как явный fallback, не выполняется по умолчанию.

**Предусловия:**
- Задача 2.D2 выполнена

**Файлы для изменения:**
1. `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts` — оставить только legacy path
2. `apps/integrator/src/integrations/rubitime/db/bookingProfilesRepo.ts` — добавить явный `@deprecated` comment
3. Документация integrator (при наличии)

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Legacy path используется только при явном `version: 'v1'` или отсутствии v2 полей.
- Добавить feature switch для полного отключения legacy.
- Добавить `// @deprecated` и описание плана удаления.

**Тесты:**
- [ ] Fallback compatibility tests: v1 запрос работает через legacy path
- [ ] Feature switch test: при отключении legacy v2 всё ещё работает

**Критерии готовности:**
- [ ] Есть контролируемый путь полного отключения legacy
- [ ] `pnpm run ci` зелёный

---

### Задача 2.D4: Обновить webhook update logic под v2 snapshots

**Цель:** синхронизация webhook не зависит от legacy mapping.

**Предусловия:**
- Задача 2.D2 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/modules/patient-booking/service.ts` — update по `rubitime_id`, не по category/city
2. Обработчики booking lifecycle в webapp/integrator (при наличии)

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Апдейт записи ищет по `rubitime_id_snapshot`.
- Не перетирать snapshots для исторических записей без необходимости.
- Проверить cancel/update цепочку end-to-end.

**Тесты:**
- [ ] Lifecycle tests: booking.created/booking.cancelled с v2 data

**Критерии готовности:**
- [ ] Синхронизация не зависит от legacy mapping
- [ ] `pnpm run ci` зелёный

---

### Задача 2.D5: Подготовить cutover runbook (операционный)

**Цель:** операционный пошаговый план переключения в продакшн.

**Предусловия:**
- Все задачи 2.A–2.D выполнены

**Файлы для создания:**
1. `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_RUNBOOK.md`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Порядок: migration → seed → backfill → dual-write → switch → disable legacy.
- Команды проверки консистентности на каждом шаге.
- Plan отката с конкретными командами.

**Тесты:** не требуются (runbook).

**Критерии готовности:**
- [ ] Любой оператор может выполнить cutover по шагам
- [ ] Rollback описан с конкретными командами

---

## 2.E — Тесты, аудит и релиз

### Задача 2.E1: Тест-матрица e2e сценариев очной записи

**Цель:** задокументировать и покрыть тестами все критические e2e сценарии.

**Предусловия:**
- Задачи 2.C и 2.D выполнены

**Файлы для создания:**
1. `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/TEST_MATRIX_E2E.md` — матрица сценариев

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Покрыть сценарии: happy path / inactive service / slot conflict / webhook cancel / legacy record display.
- Для каждого сценария: preconditions / steps / expected result.

**Тесты:** не требуются (документация матрицы).

**Критерии готовности:**
- [ ] Матрица покрывает все критические пути in-person v2
- [ ] Каждый сценарий имеет проверяемый expected result

---

### Задача 2.E2: Unit/integration тесты webapp v2

**Цель:** покрыть ключевые модули webapp автотестами.

**Предусловия:**
- Задача 2.C выполнена

**Файлы для изменения:**
1. Тесты в `apps/webapp/src/modules/booking-catalog/`
2. Тесты в `apps/webapp/src/modules/patient-booking/`
3. Тесты в `apps/webapp/src/app/api/booking/`
4. Тесты в `apps/webapp/src/app/api/admin/booking-catalog/`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Repo tests: CRUD каталога + patient_bookings.
- Service tests: resolveBranchService, getSlots, createBooking.
- API tests: auth, validation, error codes.

**Тесты:**
- [ ] Минимум 80% coverage новых модулей

**Критерии готовности:**
- [ ] Все автотесты зелёные
- [ ] `pnpm run ci` зелёный

---

### Задача 2.E3: Unit/integration тесты integrator v2

**Цель:** покрыть integrator-path для v2 контракта.

**Предусловия:**
- Задача 2.D выполнена

**Файлы для изменения:**
1. Тесты в `apps/integrator/src/integrations/rubitime/`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Schema parsing v1/v2.
- Route guard/signature tests.
- Legacy fallback compatibility.

**Тесты:**
- [ ] Все новые integrator пути покрыты тестами

**Критерии готовности:**
- [ ] `pnpm run ci` зелёный

---

### Задача 2.E4: Аудит этапов и закрытие замечаний

**Цель:** пройтись по всем задачам 2.A–2.E и проверить соответствие критериям готовности.

**Предусловия:**
- Задачи 2.E1–2.E3 выполнены

**Файлы для изменения:**
1. `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md` — финальные статусы

**Файлы для удаления:**
- Нет

**Тесты:** не требуются (аудит).

**Критерии готовности:**
- [ ] Все задачи имеют статус done или явно обоснованный skipped
- [ ] Нет открытых TODO в критических путях

---

### Задача 2.E5: Финальный pre-release check

**Цель:** убедиться, что in-person v2 готов к продакшн-деплою.

**Предусловия:**
- Задача 2.E4 выполнена

**Файлы для изменения:**
1. `EXECUTION_LOG.md` — финальная запись

**Файлы для удаления:**
- Нет

**Детальное описание:**
- `pnpm run ci` зелёный на main/feature branch.
- Cutover runbook проверен.
- Seed применён на staging.
- Backfill протестирован на staging.

**Тесты:**
- [ ] `pnpm run ci` зелёный

**Критерии готовности:**
- [ ] Все блоки 2.A–2.E выполнены
- [ ] Команда подтвердила готовность к деплою

---

## Общие критерии готовности Фазы 2 (агрегировано)

- [ ] Пациент записывается на очный приём через flow: город → услуга → слот
- [ ] Integrator получает explicit Rubitime IDs, не резолвит category/city самостоятельно
- [ ] Каталог (города/филиалы/услуги/специалисты) управляется из Admin Settings
- [ ] Старые записи (legacy) корректно отображаются в кабинете
- [ ] Online-поток не затронут
- [ ] `pnpm run ci` зелёный
