# Разбор синхронизации записей: создание / отмена / перенос / удаление (2026-06-14)

Контекст: owner-запрос «очень внимательно разобрать, как происходят записи, отмены и переносы в обе стороны (наша БД ↔ Rubitime), воспроизвести все варианты, понять cancel vs delete и направление синка». Анализ по коду + архитектуре ([RUBITIME_BOOKING_PIPELINE.md](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md), [booking-appointment-sync/README](../../apps/webapp/src/modules/booking-appointment-sync/README.md), контракт [BOOKING_MIRROR_INTEGRITY_CONTRACT](../BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md)).

## 0. Две настройки и два хранилища

| Настройка (system_settings, admin) | Значения | Управляет |
|---|---|---|
| `booking_slots_read_source` | `rubitime` (дефолт) · `canonical` | пациентские/публичные **слоты и create** |
| `booking_doctor_appointments_read_source` | `rubitime_legacy` (дефолт) · `canonical` | список врача, KPI, **календарь** |

Хранилища: **legacy** `appointment_records` (зеркало Rubitime) и **canonical** `be_appointments`. Мост — `booking_rubitime_bridge_enabled` (обязателен для staff outbound). Связь — `be_external_entity_mappings` (rubitime↔canonical).

## 1. 🎯 КОРНЕВАЯ ПРИЧИНА overlap-бага (двойная запись на занятый слот)

Проверка занятости слота: `assertSlotAvailable` ([booking-scheduling/service.ts:174](../../apps/webapp/src/modules/booking-scheduling/service.ts:174)) → `port.listBusyIntervals` → читает **только `be_appointments`** (active статусы) ([pgBookingScheduling.ts](../../apps/webapp/src/infra/repos/pgBookingScheduling.ts)). DB-constraint `be_appointments_specialist_no_overlap` — тоже только canonical, и только `specialist_id IS NOT NULL` + active статусы.

**Следствие:** запись, которая есть только в legacy `appointment_records` (не спроецирована в canonical), **невидима** для проверки слота → слот считается свободным → создаётся вторая запись (double-booking). Ровно это случилось с Груздевой (canonical) поверх Менялкиной (legacy-only). → **Backfill canonical (полнота) закрывает overlap-дыру.** Постоянный фикс — cutover на canonical как единый источник (нет legacy-«слепой зоны»).

**Доп. риск (проверить):** если запись создаётся с `specialist_id = NULL`, она вообще вне DB-constraint (`WHERE specialist_id IS NOT NULL`) → может встать на любой слот. Убедиться, что create всегда резолвит специалиста.

## 2. Матрица поведения (по коду)

### Создание
| Origin | Поведение |
|---|---|
| Пациент, `slots=rubitime` | Rubitime-first: `createRecord` → adopt projection mapping (`waitForRubitimeProjectionMapping`); **нет** native fallback; **`assertSlotAvailable` НЕ вызывается** (полагается на Rubitime). Rollback при провале — `deleteRecord`. |
| Пациент, `slots=canonical` | canon primary `createAppointment`; Rubitime — best-effort при включённом мосте. `assertSlotAvailable` вызывается. |
| Staff/Doctor (кабинет) | `manual/route.ts`: **вызывает `assertSlotAvailable`** (но против canonical!) → `createAppointment(source=admin_manual)` → при мосте `syncStaffManualAppointmentToRubitime` + mapping. Ловит `slot_overlap`/23P01 → 409. ⚠️ Слепо к legacy-only (см. §1). |
| Rubitime (сайт/iframe) | webhook → integrator (`rubitime_records`, `projection_outbox`) → webapp `appointment.record.upserted` → `appointment_records` (+ canonical через mirror, если mapping/мост). GCal — из сырого вебхука. |

### Отмена (cancel) — статус, НЕ удаление
| Origin | Поведение |
|---|---|
| Пациент | lifecycle `patientCancel` → `patient_bookings=cancelled` → best-effort Rubitime `cancelRecord` (**update-record status 4**, не remove). `booking.cancelled`. GCal: **❌** в заголовке (событие остаётся). `rubitime_manage_url=NULL`. |
| Staff/admin | канон `staffCancel` → Rubitime `cancelRecord` (status 4) → `syncLinkedPatientBookingCancelled`. Идемпотентно (повтор — silent). |
| Rubitime → нам (inbound) | webhook status 4 → canonical/legacy статус `cancelled`; revive-guard не оживляет terminal. |

### Перенос (reschedule)
| Origin | Поведение |
|---|---|
| Staff (календарь) | **Rubitime ДО канона** (`manual-reschedule`): проверка занятости → rollback при `slot_overlap`. |
| Пациент | `slots=rubitime` → **без** `assertSlotAvailable` (симметрия с create); иначе проверка слота → lifecycle → best-effort Rubitime `update-record`. `booking.rescheduled`. |
| «Изменили время в настройках» (не статусом) | Идёт тем же `update-record` (время/длительность/scope) через mirror outbound patch (`buildRubitimeOutboundPatch`); inbound — fan-out `datetime_end` и пр. ⚠️ Проверить отдельно (см. матрицу воспроизведения). |
| Rubitime → нам (inbound) | webhook с новым временем → mirror inbound → canonical+legacy snapshot; echo-guard ~8с. |

### Удаление (delete) — тихое, без уведомлений
| Origin | Поведение |
|---|---|
| Staff (кабинет) | **только для уже отменённых** (whitelist): `…/appointments/[id]/delete` → local purge (`appointment_records.deleted_at` + DELETE `patient_bookings`) → best-effort Rubitime **`remove-record`** → событие **`booking.deleted`** (не cancelled). GCal: **удаление** события. Inbound на purged → `skipped_purged`. |
| Rubitime → нам (inbound) | `remove-record`/webhook delete → **soft-delete** у нас (`deleted_at`) + удаление из GCal. |

**Cancel vs Delete (подтверждено):** cancel = status 4 (запись остаётся, ❌ в GCal, уведомления); delete = remove-record (soft-delete у нас, удаление из GCal, **тихо**, `booking.deleted`). Staff-delete разрешён только после отмены.

## 3. Открытые вопросы / риски (owner-тезисы)

1. 🐞 **«Удаление в Rubitime помечается у нас отменой» — ПОДТВЕРЖДЕНО (баг).** `connector.ts:122-124`: `event-delete-record`/`event-remove-record` → action `'canceled'`; затем (`:236`) `canceled → canonical 'cancelled'`. В `events.ts` **нет** ветки soft-delete на delete-событие (только `skipped_purged` для уже-удалённых, :905). Итог: inbound Rubitime-delete → запись `cancelled`, НЕ soft-delete. (GCal-удаление делает интегратор отдельно по типу события — асимметрия: из GCal удалена, у нас осталась как cancelled.) **Фикс:** в inbound ветка на `event-delete-record`/`event-remove-record` → silent soft-delete (`deleted_at`), без уведомлений; зона integrator+webapp events / BOOKING_REWORK. Мягко для overlap (cancelled не блокирует), но семантически неверно.
2. ⚠️ **null-specialist — латентная дыра overlap.** `createAppointment` (pgBookingEngine.ts:713) вставляет `specialist_id ?? null`; DB-constraint `be_appointments_specialist_no_overlap` только `WHERE specialist_id IS NOT NULL` → запись без специалиста встаёт на любой слот. UI нового календаря специалиста требует (DoctorCalendarEventPanel.tsx:222), но сервер — нет. **Фикс:** сервер должен отклонять null-specialist на create (или constraint/`assertSlotAvailable` покрыть null).
2. **Стале-активные записи (есть у нас, нет в Rubitime).** Owner прав: «нет в Rubitime → почти всегда некорректно». Причины: (а) перенос/удаление в Rubitime не доехало (наш `created` остался); (б) create в кабинете при неотлаженном механизме, не ушёл в Rubitime. Правило реконсиляции: **legacy-запись, отсутствующая в текущей выгрузке Rubitime → устаревшая** (гасить). Это и есть авто-детект по CSV (предложен в backfill-скрипт).
3. **overlap (§1)** — закрыть бэкфиллом + cutover; проверить null-specialist путь.
4. **`assertSlotAvailable` против canonical при `slots=rubitime`** — на create пациента она вообще не зовётся (полагается на Rubitime); для staff зовётся, но против canonical. После cutover на canonical как единый источник — консистентно.

## 4. Матрица воспроизведения (что прогнать; ожидаемый результат)

> Полное воспроизведение требует среды с Rubitime (dev Rubitime-creds вычищены — см. [[dev-env-hardening-real-creds]]). Варианты исполнения: e2e с моком Rubitime (webhook inbound + M2M outbound) **или** ручной прогон на staging. Существующее покрытие: [ACCEPTANCE_MIRROR_SYNC.md](../BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md) — сверить, что покрыто.

| # | Действие | Где сделал | Где проверяем | Ожидание |
|---|---|---|---|---|
| C1 | Создать | кабинет | canon+Rubitime+GCal+календарь врача | везде появилась; слот занят |
| C2 | Создать | Rubitime | наша БД (canon+legacy)+GCal+календарь | приехала через webhook |
| C3 | Создать на занятый слот | кабинет | — | **отказ 409 slot_overlap** (после фикса §1) |
| X1 | Отмена | кабинет | Rubitime status 4, GCal ❌, уведомление | отменено везде, событие осталось |
| X2 | Отмена | Rubitime | наша БД статус cancelled, GCal ❌ | отменено у нас |
| R1 | Перенос (статус/время) | кабинет | Rubitime update-record, GCal сдвинут | перенос везде |
| R2 | Перенос | Rubitime | наша БД новое время | синхронизировано |
| R3 | Изменить только время в настройках | кабинет | Rubitime + GCal | время обновилось, без дубля |
| R4 | Создал тут — изменил там / создал там — изменил тут | обе | обе | финальное состояние одинаково, без дублей |
| D1 | Удаление (после отмены) | кабинет | Rubitime remove-record, GCal удалён, тихо | удалено везде, без уведомления |
| D2 | Удаление | Rubitime | наша БД `deleted_at` (НЕ cancelled), GCal удалён | тихое удаление у нас |

## 4a. Карта покрытия тестами (свод субагента, 2026-06-14)

Покрыто (есть тесты): C1, C2, X1, X2, R1, R2, D1. Дыры (ранжировано):
1. **D2 (critical)** — inbound Rubitime-delete → canonical soft-delete (НЕ cancel): не покрыто **и** по коду это баг (см. §3.1). `connector.ts` мапит delete→`canceled`; нет pipeline-теста на `be_appointments.deleted_at`. `softDeleteByIntegratorId` протестирован только изолированно.
2. **C3 (high)** — staff-create на занятый слот: оба route-теста мокают `assertSlotAvailable` в pass; путь `409 slot_overlap` и legacy-«слепая зона» (§1) не покрыты вообще.
3. **C1 happy-path e2e (medium)** — только rollback-пути; полный успех (canon+Rubitime+mapping+GCal+`booking.created`) не покрыт.
4. **R4 (medium)** — cross-direction create/edit без дубля: echo-guard юнит-тестирован, компаунд-сценарий — нет.
5. **R3 (low-med)** — time-only → ровно один `updateRecord`, без `createRecord`: инвариант только в доке.
6. **X1 (low)** — явное «cancel = update-record status 4, НЕ remove-record»: замокано, не утверждается.

## 4b. Приоритизированный план фиксов (для «правильного результата»)

| # | Фикс | Тип | Зона | Риск |
|---|------|-----|------|------|
| F1 | **inbound delete→soft-delete** (не cancel): провести delete-сигнал `event-delete-record`/`event-remove-record` до `events.ts` → `softDeleteByIntegratorId` (тихо, без уведомлений), вместо upsert `cancelled` | bug-fix + тест (D2) | integrator `connector.ts`/webhook + webapp `events.ts` (BOOKING_REWORK) | средний (кросс-апп, sync-семантика) |
| F2 | **null-specialist guard**: сервер отклоняет create без специалиста (или `assertSlotAvailable`/constraint покрывают null) | bug-fix + тест | webapp create-пути / pgBookingEngine | низкий |
| F3 | **overlap permanent**: backfill canonical (полнота) → cutover read-source canonical; тест C3 на legacy-«слепую зону» + 409 | parity + тест | DB-трек + BOOKING_REWORK | средний (cutover) |
| F4 | **бэкфилл авто-детект стале по CSV** (без ручных id) | tooling | backfill-скрипт | низкий |
| F5 | e2e на дыры R4/R3/C1-happy/X1-no-remove | тесты | webapp/integrator | низкий |

Рекомендуемый порядок: **F4 → F2 → F1 → F3(cutover на тебе) → F5**. F1 (delete-семантика) и F3(cutover) — кросс-апп/прод, делать аккуратно с тестами; кандидаты на отдельную ветку booking-sync.

## 5. Связи
- Бэкфилл/паритет: [APPOINTMENTS_PARITY_S0.md](APPOINTMENTS_PARITY_S0.md) — overlap-баг закрывается полнотой canonical.
- Overlap-баг: [[booking-overlap-allowed-bug-2026-06]].
- Зона: пересекается с `BOOKING_REWORK_INITIATIVE` (mirror/cutover) + интегратор (Rubitime sync, GCal).
