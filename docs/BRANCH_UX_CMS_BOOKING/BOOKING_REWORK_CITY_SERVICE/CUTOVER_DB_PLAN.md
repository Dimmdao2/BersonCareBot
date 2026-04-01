# Cutover DB Plan: booking v2

**Дата:** 2026-04-01  
**Scope:** переключение read/write на новые поля `patient_bookings` v2.  
**Prerequisite:** миграции 046 + 047 применены, seed заполнен, backfill выполнен.  
**Online-поток:** не затрагивается ни на одном этапе.

---

## Фазы переключения

### Фаза 0 — Подготовка (уже выполнено в Stage 2)

| Шаг | Что | Проверка |
|-----|-----|----------|
| 0.1 | Применить `046_booking_catalog_v2.sql` | `SELECT count(*) FROM booking_branch_services` > 0 |
| 0.2 | Применить `047_patient_bookings_v2_refs.sql` | `\d patient_bookings` — видны новые nullable колонки |
| 0.3 | Запустить `pnpm seed-booking-catalog` | COUNT: 2 cities, 2 branches, 2 specialists, 3 services, 5 branch_services |
| 0.4 | Запустить `pnpm backfill-patient-bookings-v2` (dry-run) | Отчёт без критических ошибок |
| 0.5 | Запустить `pnpm backfill-patient-bookings-v2 --commit` | `updated > 0`, `conflicts` задокументированы |

---

### Фаза 1 — Dual-write

**Цель:** новые записи пишут и legacy-поля, и v2-поля одновременно.  
**Когда включается:** Stage 4 (patient flow v2).  
**Кто меняет:** `apps/webapp/src/modules/patient-booking/service.ts` + API route.

```
Поток создания записи (dual-write):
  1. Webapp резолвит branchServiceId из каталога (по выбору пациента).
  2. Запись в patient_bookings:
     - legacy: city (из branch.city_code), category = 'rehab_lfk'
     - v2: branch_id, service_id, branch_service_id
     - snapshots: заполняются из каталога на момент записи
  3. M2M вызов в integrator: версия v2 (explicit IDs).
```

**Критерий завершения фазы 1:**
```sql
SELECT count(*) FROM patient_bookings
WHERE branch_service_id IS NOT NULL
  AND created_at > now() - interval '1 hour';
-- Должен вернуть > 0 после первого реального бронирования
```

---

### Фаза 2 — Dual-read

**Цель:** кабинет пациента корректно отображает и legacy-, и v2-записи.  
**Когда включается:** Stage 4 (task 2.C6 — dual-read/detect legacy).  
**Признак legacy-записи:** `branch_service_id IS NULL`.

```
Логика отображения (dual-read):
  IF booking.branch_service_id IS NOT NULL:
    → отобразить v2: branch_title_snapshot + service_title_snapshot + duration
  ELSE:
    → отобразить legacy: city + category (существующая логика)
```

**Критерий завершения фазы 2:**
- Тест: mixed data (legacy + v2 записи) рендерится без ошибок.
- `branch_service_id IS NOT NULL` — у всех новых записей (созданных после фазы 1).

---

### Фаза 3 — Full switch (только v2)

**Цель:** отключить legacy resolve в integrator, весь in-person поток работает только через v2.  
**Когда:** Stage 5 (integrator cutover, task 2.D5).  
**Prerequisite:** фаза 1 и 2 работают без ошибок ≥ 2 недели, e2e тесты зелёные.

```
Чеклист перед переключением:
  [ ] backfill --commit прошёл (или conflicts задокументированы + приняты)
  [ ] branch_service_id IS NULL только у confirmed-старых записей (не новых)
  [ ] integrator v2 routes покрыты интеграционными тестами
  [ ] rollback план проверен (см. ниже)
  [ ] staging прошёл e2e прогон
```

**Переключение:**
1. Задеплоить webapp с флагом `BOOKING_V2_ONLY=true` (или убрать v1 fallback).
2. Задеплоить integrator с отключённым legacy `bookingScheduleMapping`.
3. Проверить: новые записи — `branch_service_id IS NOT NULL`.
4. Проверить: нет ошибок `slot_mapping_not_configured` в логах integrator.

---

### Фаза 4 — Cleanup (следующий релиз)

```
Задачи cleanup (не делать в том же деплое что и фаза 3):
  - Помечать bookingScheduleMapping как REMOVED в коде integrator.
  - Удалить legacy city/category resolve логику из integrator.
  - Опционально: добавить DB constraint NOT NULL на branch_service_id
    для записей с booking_type = 'in_person' (только после чистки данных).
```

---

## Rollback-процедура

### Rollback фазы 3 → фаза 2

```bash
# 1. Задеплоить предыдущую версию webapp (с dual-read)
# 2. Задеплоить предыдущую версию integrator (с legacy mapping)
# 3. Проверить, что новые записи снова корректно создаются через legacy path
```

Данные не теряются: v2-поля nullable, legacy-поля сохранены.

### Rollback миграции (крайний случай — до применения seed)

```sql
-- Rollback 047: убрать новые FK/snapshot колонки из patient_bookings
ALTER TABLE patient_bookings
  DROP COLUMN IF EXISTS branch_id,
  DROP COLUMN IF EXISTS service_id,
  DROP COLUMN IF EXISTS branch_service_id,
  DROP COLUMN IF EXISTS city_code_snapshot,
  DROP COLUMN IF EXISTS branch_title_snapshot,
  DROP COLUMN IF EXISTS service_title_snapshot,
  DROP COLUMN IF EXISTS duration_minutes_snapshot,
  DROP COLUMN IF EXISTS price_minor_snapshot,
  DROP COLUMN IF EXISTS rubitime_branch_id_snapshot,
  DROP COLUMN IF EXISTS rubitime_cooperator_id_snapshot,
  DROP COLUMN IF EXISTS rubitime_service_id_snapshot;

-- Rollback 046: удалить таблицы каталога (безопасно — без данных до seed)
DROP TABLE IF EXISTS booking_branch_services;
DROP TABLE IF EXISTS booking_specialists;
DROP TABLE IF EXISTS booking_services;
DROP TABLE IF EXISTS booking_branches;
DROP TABLE IF EXISTS booking_cities;
```

> **Важно:** rollback таблиц каталога возможен **только до шага 0.3** (до seed). После seed и backfill rollback требует экспорта данных каталога.

---

## Health checks (после каждой фазы)

```sql
-- Фаза 0: seed заполнен
SELECT
  (SELECT count(*) FROM booking_cities)          AS cities,
  (SELECT count(*) FROM booking_branches)        AS branches,
  (SELECT count(*) FROM booking_specialists)     AS specialists,
  (SELECT count(*) FROM booking_services)        AS services,
  (SELECT count(*) FROM booking_branch_services) AS branch_services;
-- Ожидаемо: 2, 2, 2, 3, 5

-- Фаза 1: dual-write работает
SELECT count(*) FROM patient_bookings
WHERE branch_service_id IS NOT NULL;

-- Фаза 3: все новые записи — v2
SELECT count(*) FROM patient_bookings
WHERE booking_type = 'in_person'
  AND branch_service_id IS NULL
  AND created_at > '<phase3_deploy_time>';
-- Ожидаемо: 0
```

---

## Критерии полного переключения (Definition of Done)

- [ ] Все новые `in_person` записи имеют `branch_service_id IS NOT NULL`.
- [ ] Кабинет пациента отображает как legacy, так и v2 записи без ошибок.
- [ ] integrator больше не обращается к `bookingScheduleMapping` для новых записей.
- [ ] CI зелёный, e2e тест-матрица прошла.
- [ ] backfill отчёт задокументирован и принят (conflicts review).
