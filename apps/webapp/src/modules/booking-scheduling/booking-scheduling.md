# booking-scheduling

Расчёт доступных слотов и проверка занятости для собственного движка записи (этап 2).

## Ответственность

- `computeSlots.ts` — чистая логика: рабочие интервалы, busy-интервалы, генерация слотов, цепочки (`slotCount`).
- `service.ts` — `getInPersonSlots`, `getOnlineSlots`, `assertSlotAvailable`, CRUD `schedule_block` (через порт).
- `ports.ts` — `BookingSchedulingPort`; реализация `infra/repos/pgBookingScheduling.ts`.

## Входные данные

Рабочие часы (`be_working_hours`), буфер (`be_availability_rules`), блокировки и записи (`be_schedule_blocks`, `be_appointments`), контекст услуги через `resolveCanonicalFromBranchService`.

## Тесты

`computeSlots.test.ts`.
