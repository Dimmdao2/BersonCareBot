# Stage 4: Patient Flow (In-person)

Цель этапа: внедрить пользовательский поток `город -> услуга -> время` для очной записи.

## S4.T01 - Обновить доменные типы patient-booking

**Файлы для изменения:**
- `apps/webapp/src/modules/patient-booking/types.ts`
- `apps/webapp/src/modules/patient-booking/ports.ts`

**Шаги:**
1. Добавить поля выбора `cityCode` и `branchServiceId` для очного v2.
2. Для in-person v2 пометить `category` как deprecated path.
3. Обновить типы ответа слотов под branch-service контекст.

**Тесты:**
- [ ] type-level checks + unit tests input validation

**Критерии готовности:**
- Контракт очного v2 не зависит от `category`.

**Лог:** `S4.T01`.

---

## S4.T02 - Обновить booking service на branch-service резолв

**Файлы для изменения:**
- `apps/webapp/src/modules/patient-booking/service.ts`

**Шаги:**
1. На `getSlots` резолвить branch-service из каталога.
2. Перед вызовом integrator собирать Rubitime IDs из webapp DB.
3. На `createBooking` писать snapshot в `patient_bookings`.
4. Сохранить rollback при slot overlap.

**Тесты:**
- [ ] service tests: getSlots/create with valid branchService
- [ ] service tests: inactive branchService -> controlled error

**Критерии готовности:**
- Сервис работает от branch-service связки.

**Лог:** `S4.T02`.

---

## S4.T03 - Обновить M2M adapter webapp -> integrator

**Файлы для изменения:**
- `apps/webapp/src/modules/integrator/bookingM2mApi.ts`

**Шаги:**
1. Изменить payload slots/create на explicit Rubitime IDs.
2. Сохранить HMAC-signing без изменений.
3. Добавить обработку новых кодов ошибок.

**Тесты:**
- [ ] adapter tests payload mapping

**Критерии готовности:**
- Webapp не отправляет `category` для in-person v2.

**Лог:** `S4.T03`.

---

## S4.T04 - Переработать UI выбора в кабинете пациента

**Файлы для изменения:**
- `apps/webapp/src/app/app/patient/cabinet/useBookingSelection.ts`
- `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx`
- (при необходимости) связанные компоненты `cabinet/*`

**Шаги:**
1. Шаг 1: город (Москва/СПб).
2. Шаг 2: услуги, доступные выбранному городу.
3. Шаг 3: дата/время.
4. Выбор сотрудника в UI не показывать.
5. Онлайн-кнопку оставить как есть (без переработки онлайн потока).

**Тесты:**
- [ ] UI tests/RTL: city -> services filtering
- [ ] UI tests: cannot request slots before service selection

**Критерии готовности:**
- Пользователь проходит очную запись без выбора сотрудника.

**Лог:** `S4.T04`.

---

## S4.T05 - Обновить public API routes booking в webapp

**Файлы для изменения:**
- `apps/webapp/src/app/api/booking/slots/route.ts`
- `apps/webapp/src/app/api/booking/create/route.ts`
- `apps/webapp/src/app/api/booking/slots/route.test.ts`
- `apps/webapp/src/app/api/booking/create/route.test.ts`

**Шаги:**
1. Принять новый in-person v2 payload.
2. Валидация на обязательный `branchServiceId`.
3. Возвращать типизированные ошибки для UI.

**Тесты:**
- [ ] API tests success/error matrix

**Критерии готовности:**
- API покрывает v2, old path либо совместим, либо явно deprecated.

**Лог:** `S4.T05`.

---

## S4.T06 - Dual-read/detect для legacy записей в cabinet

**Файлы для изменения:**
- `apps/webapp/src/infra/repos/pgPatientBookings.ts`
- компоненты истории/списка записей в кабинете

**Шаги:**
1. Для старых записей без `branch_service_id` показывать fallback метки.
2. Для новых записей показывать city/service snapshots.
3. Не ломать текущую историю записей.

**Тесты:**
- [ ] repo tests: read old+new rows

**Критерии готовности:**
- Кабинет корректно рендерит mixed data.

**Лог:** `S4.T06`.
