# Stage 3: Admin Catalog

Цель этапа: дать администратору webapp-интерфейс и API для управления каталогом `город/филиал/услуга/специалист/связка`.

## S3.T01 - Создать admin API для cities

**Файлы для создания:**
- `apps/webapp/src/app/api/admin/booking-catalog/cities/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/cities/[id]/route.ts`

**Шаги:**
1. Реализовать GET/POST/DELETE (soft deactivate).
2. Использовать `requireAdmin()` и `adminMode`.
3. Валидировать payload Zod-схемой.

**Тесты:**
- [x] route tests auth + validation

**Критерии готовности:**
- CRUD городов доступен только admin.

**Лог:** `S3.T01`.

---

## S3.T02 - Создать admin API для branches/services/specialists

**Файлы для создания:**
- `apps/webapp/src/app/api/admin/booking-catalog/branches/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/branches/[id]/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/services/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/services/[id]/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/specialists/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/specialists/[id]/route.ts`

**Шаги:**
1. Добавить CRUD для каждой сущности.
2. Для branch хранить `rubitime_branch_id`.
3. Для specialist хранить `rubitime_cooperator_id`.
4. Для service хранить `duration` и `price`.

**Тесты:**
- [x] route tests для всех сущностей

**Критерии готовности:**
- Все сущности каталога редактируются из webapp API.

**Лог:** `S3.T02`.

---

## S3.T03 - Создать admin API для branch-service связок

**Файлы для создания:**
- `apps/webapp/src/app/api/admin/booking-catalog/branch-services/route.ts`
- `apps/webapp/src/app/api/admin/booking-catalog/branch-services/[id]/route.ts`

**Шаги:**
1. Реализовать upsert связи `branch_id + service_id + specialist_id`.
2. Хранить `rubitime_service_id`.
3. Добавить флаг активности и сортировку.

**Тесты:**
- [x] unique conflict test
- [x] inactive behavior test

**Критерии готовности:**
- Для каждого филиала можно настроить собственный набор услуг.

**Лог:** `S3.T03`.

---

## S3.T04 - Переработать RubitimeSection под каталог v2

**Файлы для изменения:**
- `apps/webapp/src/app/app/settings/RubitimeSection.tsx`

**Шаги:**
1. Заменить старые секции booking profiles на новые секции каталога.
2. Добавить формы:
   - города
   - филиалы
   - услуги
   - специалисты
   - branch-service связи
3. Отображать Rubitime IDs для операторской проверки.

**Тесты:**
- [x] smoke test admin UI rendering

**Критерии готовности:**
- В UI нет legacy `bookingType/category/city -> profile`.

**Лог:** `S3.T04`.

---

## S3.T05 - Добавить страницу/блок в Settings c документацией оператора

**Файлы для создания:**
- `apps/webapp/src/app/app/settings/BookingCatalogHelp.tsx`

**Файлы для изменения:**
- `apps/webapp/src/app/app/settings/page.tsx`

**Шаги:**
1. Добавить краткий операторский runbook:
   - сначала города
   - затем филиалы/специалисты/услуги
   - затем branch-service связи
2. Добавить предупреждение о необходимости Rubitime IDs.

**Тесты:** не требуются (информ. блок).

**Критерии готовности:**
- Оператор видит порядок настройки внутри админки.

**Лог:** `S3.T05`.
