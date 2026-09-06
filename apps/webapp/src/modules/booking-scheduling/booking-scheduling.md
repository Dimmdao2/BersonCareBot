# booking-scheduling

Расчёт доступных слотов и проверка занятости для собственного движка записи (этап 2).

## Ответственность

- `computeSlots.ts` — чистая логика: рабочие интервалы, busy-интервалы, генерация слотов, цепочки (`slotCount`).
- `service.ts` — `getInPersonSlots`, `getOnlineSlots`, `assertSlotAvailable`, CRUD `schedule_block` (через порт). Единственный `defaultDateRange` ограничивает как полную выдачу, так и запрос конкретной даты клиническим `booking_availability_horizon_days`; дата за границей возвращает пустую выдачу.
- `ports.ts` — `BookingSchedulingPort`; реализация `infra/repos/pgBookingScheduling.ts`.

## Входные данные

Рабочие часы (`be_working_hours`), буфер (`be_availability_rules`), клинический горизонт доступности (`system_settings.booking_availability_horizon_days`, 1–92 дня), блокировки и записи (`be_schedule_blocks`, `be_appointments`), контекст услуги по канонической паре `branchId + serviceId`. Устаревший ключ филиал-услуга не участвует в scheduling runtime и отклоняется fail-closed.

## Тесты

`computeSlots.test.ts`.
