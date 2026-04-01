# Stage 5: Integrator Bridge And Cutover

Цель этапа: оставить integrator техническим мостом к Rubitime и безопасно отключить legacy runtime-resolve.

## S5.T01 - Обновить integrator M2M contracts на explicit IDs

**Файлы для изменения:**
- `apps/integrator/src/integrations/rubitime/internalContract.ts`
- `apps/integrator/src/integrations/rubitime/schema.ts`

**Шаги:**
1. Добавить v2 поля `rubitimeBranchId`, `rubitimeCooperatorId`, `rubitimeServiceId`.
2. Для in-person v2 сделать их обязательными.
3. Старый `category/city` оставить как deprecated (временно).

**Тесты:**
- [ ] schema parsing tests v1/v2

**Критерии готовности:**
- Контракт integrator формально поддерживает новый формат.

**Лог:** `S5.T01`.

---

## S5.T02 - Упростить recordM2mRoute для slots/create

**Файлы для изменения:**
- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`

**Шаги:**
1. Для in-person v2 не использовать `resolveScheduleParams()`.
2. Использовать IDs, пришедшие из webapp.
3. Сохранить guard/signature/window поведение.
4. Сохранить стандартизированный error mapping.

**Тесты:**
- [ ] route tests: accepts explicit IDs
- [ ] route tests: rejects missing IDs for in-person v2

**Критерии готовности:**
- Integrator не зависит от catalog данных для v2 runtime.

**Лог:** `S5.T02`.

---

## S5.T03 - Изолировать legacy bookingProfilesRepo от runtime path

**Файлы для изменения:**
- `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts`
- `apps/integrator/src/integrations/rubitime/db/bookingProfilesRepo.ts` (минимум: пометка legacy)
- связанный docs в integrator

**Шаги:**
1. Оставить legacy path только для совместимости v1 (временный fallback).
2. Добавить явный комментарий deprecation.
3. Добавить feature switch для отключения legacy-resolve.

**Тесты:**
- [ ] fallback compatibility tests

**Критерии готовности:**
- Есть контролируемый путь полного отключения legacy.

**Лог:** `S5.T03`.

---

## S5.T04 - Обновить webhook update logic под v2 snapshots

**Файлы для изменения:**
- `apps/webapp/src/modules/patient-booking/service.ts`
- возможные обработчики событий booking lifecycle в webapp/integrator

**Шаги:**
1. Апдейт записи по `rubitime_id`, не по category/city логике.
2. Не перетирать snapshots для исторических записей без необходимости.
3. Проверить cancel/update цепочку.

**Тесты:**
- [ ] lifecycle tests booking.created/booking.cancelled with v2 data

**Критерии готовности:**
- Синхронизация не зависит от legacy mapping.

**Лог:** `S5.T04`.

---

## S5.T05 - Подготовить cutover runbook (операционный)

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_RUNBOOK.md`

**Шаги:**
1. Порядок запуска: migration -> seed -> backfill -> dual-write -> switch -> disable legacy.
2. Команды проверки консистентности.
3. План отката.

**Тесты:** не требуются (runbook).

**Критерии готовности:**
- Любой оператор может выполнить cutover по шагам.

**Лог:** `S5.T05`.
