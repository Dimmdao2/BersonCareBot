# Аудит Фазы 2: нативный модуль записи

Дата: 2026-03-31  
Аудитор: GPT-5.3 Codex  
Область: реализация задач `2.A` / `2.B` / `2.C` по `BOOKING_MODULE_SPEC.md` и `PHASE_2_TASKS.md` (коммиты `[2.1]..[2.13]`).

---

## Итог

Статус: **changes required** до прод-ввода.

Ключевые риски:
- отсутствует защита от пересечения слотов на уровне БД (`EXCLUDE`) и конкурирующих create-запросов;
- create/cancel flow не транзакционный между локальным состоянием и внешней синхронизацией;
- время в интеграционных уведомлениях/напоминаниях форматируется в timezone сервера, а не бизнес-таймзоне.

---

## Findings (по приоритету)

### High

1. **Нет `EXCLUDE`-ограничения на пересечение подтвержденных слотов**
- Спецификация требует `EXCLUDE USING gist (tstzrange(...) WITH &&) WHERE (status='confirmed')`.
- В миграции `apps/webapp/migrations/040_patient_bookings.sql` есть только `CHECK (slot_end > slot_start)` и обычные индексы.
- Последствие: возможно двойное бронирование одного и того же времени при конкурентных запросах.

2. **Create booking не атомарен (локальная запись + Rubitime sync)**
- `apps/webapp/src/modules/patient-booking/service.ts`: `createPending` -> внешний вызов `createRecord` -> `markConfirmed` выполняются как независимые шаги без транзакционного контура.
- При частичных сбоях (например, Rubitime уже создал запись, а локальный `markConfirmed` не применился) возникает рассинхрон (`creating`/`failed_sync` при фактически созданной внешней записи).
- Это не соответствует критерию задачи `2.A6` про “одну транзакционную логику”.

3. **Cancel flow нарушает требуемый порядок и повышает риск рассинхрона**
- В `apps/webapp/src/modules/patient-booking/service.ts` сначала вызывается `syncPort.cancelRecord`, и только потом `markCancelled`.
- В `PHASE_2_TASKS.md` (2.A7) указан порядок `update local status -> M2M remove/update -> reconcile`.
- При таймауте/ошибке после успешной внешней отмены локальная запись остается активной.

4. **Timezone-bug в интеграционных сообщениях/напоминаниях**
- В `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` используется `toLocaleString("ru-RU")` без `timeZone`.
- Форматирование идет в timezone хоста, а не в бизнес-таймзоне слота/клиники.
- Последствие: пациент/врач могут получать неверное локальное время в `booking.created`, `booking.cancelled`, 24h/2h reminders.

### Medium

5. **Слабая валидация payload для `/api/bersoncare/rubitime/booking-event`**
- Endpoint в `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` проверяет только `eventType` и `bookingId` по факту использования.
- Нет строгей схемы (например, Zod) для обязательных полей (`slotStart`, `contactPhone`, `bookingType`, и т.д.).
- Риск: тихие деградации reminders/notifications при частично битом payload.

6. **Не реализовано обновление deep-link “Записаться” в боте на явный cabinet entrypoint**
- В `apps/webapp/src/app/app/patient/booking/page.tsx` добавлен redirect в cabinet (плюс по обратной совместимости).
- Но в `PHASE_2_TASKS.md` (2.C6) явно требуется обновление bot deep-link на новый native path.
- Сейчас поведение корректно через redirect, но это обходной вариант, не явный целевой.

### Low / test gaps

7. **Недостаточное покрытие новых интеграционных сценариев 2.C**
- Нет целевых тестов на:
  - идемпотентность `booking-event` dedup ключей;
  - постановку reminder jobs (24h/2h) и их отмену при cancel;
  - формат/маршрутизацию doctor notifications.
- Регресс защищен общим CI, но риск hidden regressions в интеграционном контуре остается.

---

## Проверка по requested focus

### 1) Безопасность: auth на booking endpoints
- `apps/webapp/src/app/api/booking/{slots,create,cancel,my}/route.ts`:
  - есть проверка `getCurrentSession()`;
  - есть проверка роли через `canAccessPatient(...)` (только `client`).
- Итог: **OK**.

### 2) Целостность данных: транзакции create/cancel
- На уровне сервиса (`apps/webapp/src/modules/patient-booking/service.ts`) нет атомарной транзакции бизнес-операции create/cancel.
- Итог: **Not OK** (см. High #2, #3).

### 3) Синхронизация: Rubitime ошибки не ломают локальную запись
- Create: при ошибке внешнего sync перевод в `failed_sync` есть (`markFailedSync`).
- Cancel: при внешней ошибке локальный статус не меняется (остается активным), что защищает от ложной локальной отмены, но при частичном сбое после успешной внешней отмены возможен рассинхрон.
- Итог: **Partially OK**, требуется унификация и явный reconcile-path.

### 4) `EXCLUDE` constraint
- В `apps/webapp/migrations/040_patient_bookings.sql` отсутствует.
- Итог: **Not OK**.

### 5) Временные зоны UTC vs local
- Хранение: `TIMESTAMPTZ` и `toISOString()` — корректно.
- Отображение в интеграционных уведомлениях: без фиксированного `timeZone` — риск смещения.
- Итог: **Partially OK** (см. High #4).

### 6) Ошибки Google Calendar не блокируют запись
- В `apps/integrator/src/integrations/rubitime/webhook.ts` вызов sync обернут в `try/catch`, pipeline продолжается.
- В `apps/integrator/src/integrations/google-calendar/sync.ts` при `!isGoogleCalendarConfigured` — soft skip.
- Итог: **OK**.

---

## Рекомендации

1. Добавить `EXCLUDE`-constraint для confirmed/rescheduled слотов (`btree_gist` + `tstzrange`), и отдельно продумать политику для `creating`.
2. Перевести create/cancel в явный orchestration-сценарий с фиксированными state transitions и reconcile-компенсациями.
3. Зафиксировать business timezone для форматирования интеграционных сообщений/reminders (например, `Europe/Moscow` или per-branch timezone).
4. Ввести strict schema validation для `booking-event` payload.
5. Добавить targeted tests для 2.C (idempotency, reminders lifecycle, doctor notifications).
