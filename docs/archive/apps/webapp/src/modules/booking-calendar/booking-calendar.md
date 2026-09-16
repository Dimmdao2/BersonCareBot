# booking-calendar

Модуль календаря врача/админа для `/app/doctor/calendar` и `GET /api/*/booking-engine/calendar`.

## Канон этапа 4 (BOOKING_REWORK)

- Источник записей в календаре: только canonical `be_appointments`.
- `readSource` в ответе calendar API: всегда `canonical`.
- `includeFreeSlots` в doctor/admin calendar route принимается для compat, но игнорируется.

## События календаря

- `appointment` — запись из canonical appointment feed.
- `block` — `be_schedule_blocks`.
- `working` — интервалы рабочего времени из `be_working_hours`.
- `break` — перерывы (gaps между рабочими интервалами).

Фоновые слои `working`/`break` рисуются заливкой без подписи внутри сетки: перерыв визуально совпадает с
нерабочим временем до и после смены (`doctor-calendar-nonworking`). Правка перерывов из календаря идёт через
per-date контракт `PUT /api/doctor/booking-engine/working-days`, а не через отдельный механизм.

Фоновые слои (`working`, `break`) управляются ключом `system_settings`:

- `booking_calendar_show_working_hours` (`scope=admin`, default `true`).
- При `false` слои `working`/`break` не строятся и не возвращаются, `appointment`/`block` остаются.

## Refresh policy (UI)

- Poll `GET calendar` каждые 30 секунд, только при `document.visibilityState === "visible"`.
- Refetch на `visibilitychange` при возврате во вкладку.
- Immediate `load()` после успешного create/reschedule/cancel.
- Immediate `load()` после `409 external_slot_taken`.

## Staff actions

- `POST .../appointments/manual`: canonical create.
- `POST .../appointments/[id]/manual-reschedule`: canonical `staffReschedule`.
- `POST .../appointments/[id]/manual-cancel`: canonical `staffCancel`.
- `POST .../appointments/[id]/delete`: только уже отменённые (`cancelled_by_*`, `late_cancellation`); local purge → `booking.deleted` (без второго уведомления).

Контракт конфликтов:

- HTTP `409`
- `{ ok: false, error: "external_slot_taken", hint: "refresh_calendar" }`
