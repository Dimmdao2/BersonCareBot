# D13b — построчная перепись (run: worker-d13b-cut) — РЕЗ НЕ СДЕЛАН, объясняю почему

**План (authority):** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D13b**.

**Вердикт: константы 24ч/2ч в `scheduleBookingReminders` (`bookingLifecycleRoute.ts`, `legacyReminders`,
строки ~422-433) резать НЕЛЬЗЯ прямо сейчас.** Предпосылка плана «только после D13a и D14» не выполнена для
этой конкретной ветки: ни D13a, ни D14 не довели `reminderPlan` до всех отправителей `booking.created` /
`booking.rescheduled`. Три живых пути записи до сих пор шлют событие БЕЗ поля `reminderPlan` — резать сейчас
означает ровно тот сценарий, которым план пугает дословно: «следующая созданная запись не поставит ни одной
задачи, пациент не получит ни напоминания за 24 часа, ни за 2, ошибок в логах не будет, деплой останется
зелёным — и это обнаружится по неявкам».

## Почему D14 не закрывает эту ветку (уточнение к записи «D14 ЗАКРЫТО 31.07»)

D14 перенесла ШЕСТЬ решений: `cancelPendingReminders`, `patientPushVariant`, `patientMessageText`,
`doctorNotify`, `doctorMessageText`, `calendarAction`/`calendarTitleMarker`. **`reminderPlan` в этот список не
входил** — он появился раньше, в D13a (`3822e349c`), и D13a довела его только до трёх мест: двух
пациентских self-service путей и обработчика оплаты. Отправитель для staff/admin/doctor-путей
(`emitStaffCanonicalBookingEvent` и три ручных create-роута) при переносе D14 получил пять из шести полей
(`cancelPendingReminders`, `patientPushVariant`, `patientMessageText`, `doctorNotify`, `doctorMessageText`,
`calendarAction`) — но не `reminderPlan`, потому что это поле не было в скоупе D14. Это не регресс D14, а
никогда не закрытый пробел D13a.

## Построчная перепись: событие → отправитель → `reminderPlan`? → вывод

| Событие (кто рождает) | Файл:строка | `reminderPlan` в payload? | Вывод |
| --- | --- | --- | --- |
| `booking.created`, пациент сам через приложение | `apps/webapp/src/modules/patient-booking/canonicalCreate.ts:569,593` | Да — `getAppointmentReminderPlan` подключён без условия в DI (`buildAppDeps.ts:1200-1203`), функция `loadAppointmentReminderPlanFromSystemSettings` (`booking-notifications/settings.ts:81-100`) всегда возвращает объект `{enabled, offsetsMinutes}`, никогда `undefined`. Спред `...(reminderPlan ? {...} : {})` защитный, в реальной сборке срабатывает всегда. | Отправитель доказан — ветка НЕ нужна для этого пути |
| `booking.rescheduled`, пациент сам через приложение | `apps/webapp/src/modules/patient-booking/service.ts:530,550` | Да — тот же паттерн, тот же DI (`getAppointmentReminderPlan` в `createPatientBookingService`, тот же `buildAppDeps.ts`). | Отправитель доказан |
| `booking.payment_captured` | `apps/webapp/src/app-layer/booking/appointmentPaymentConfirmedHandler.ts:47,68` | Да — `loadReminderPlan` обязательный (не optional) параметр зависимостей, поле кладётся без спред-охраны. | Отправитель доказан |
| `booking.created`, админ создаёт запись вручную | `apps/webapp/src/app/api/admin/booking-engine/appointments/manual/route.ts:96-116` | **НЕТ.** Payload вообще не содержит ключа `reminderPlan`. | **НЕ резать** — живой путь без потребителя |
| `booking.created`, врач создаёт запись вручную | `apps/webapp/src/app/api/doctor/booking-engine/appointments/manual/route.ts:127-147` | **НЕТ** — то же самое, ключа нет. | **НЕ резать** |
| `booking.created`, врач планирует визит пациента вручную | `apps/webapp/src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.ts:154-178` | **НЕТ** | **НЕ резать** |
| `booking.rescheduled`, персонал переносит запись | `apps/webapp/src/app-layer/booking/staffAppointmentLifecycleEffects.ts:176-196` → `emitStaffCanonicalBookingEvent` (`apps/webapp/src/app-layer/booking/staffBookingIntegratorEvent.ts:45-122`) | **НЕТ** — тип параметров `emitStaffCanonicalBookingEvent` вообще не знает про `reminderPlan` (есть `cancelPendingReminders`, `patientPushVariant`, `doctorNotify`, но не `reminderPlan`); payload на строках 86-117 этого поля не формирует. | **НЕ резать** |
| `booking.cancelled` (любой источник) | — | Не участвует | Интегратор для этого события не вызывает `scheduleBookingReminders` вовсе (`bookingLifecycleRoute.ts:645-679` только гасит ожидающие напоминания) — ветка нерелевантна |

## Другие вызывающие эндпоинта

Единственный вызывающий `/api/bersoncare/booking/lifecycle-event` — вебапп, через
`createBookingSyncPort()` (`apps/webapp/src/modules/integrator/bookingM2mApi.ts`). Других сервисов/раннеров,
шлющих на этот эндпоинт напрямую, в репозитории нет.

## Что сделано / что НЕ сделано

- Резать `legacyReminders` (24ч/2ч офсеты и тексты) — **не сделано**, ветка остаётся, причина построчно выше.
- Никакие тесты, lint, typecheck не менялись — правок кода в этой итерации нет.
- Галочка плана по D13b НЕ ставится (и не должна: пункт не закрыт).

## Что нужно, прежде чем D13b станет возможной

Отдельная работа (условно «D13b-prep», сейчас не в скоупе этого прогона): довести `reminderPlan` до
- `emitStaffCanonicalBookingEvent` (добавить параметр, аналогично `cancelPendingReminders`/`doctorNotify`,
  и прокинуть его из `staffAppointmentLifecycleEffects.ts` для `booking.created`* и `booking.rescheduled`);
- трёх ручных create-роутов (`admin/.../manual/route.ts`, `doctor/.../manual/route.ts`,
  `doctor/.../manual-patient-visit/route.ts`).

(*Заметка: `emitStaffCanonicalBookingEvent` сегодня поддерживает `eventType` только
`'booking.created' | 'booking.cancelled' | 'booking.rescheduled'`, но реально из ручных create-роутов
не вызывается — они шлют `syncPort.emitBookingEvent` напрямую; сам `emitStaffCanonicalBookingEvent`
для `booking.created` в репозитории вызывающих не найдено при этой перепись. Уточнить при доведении
`reminderPlan`, чтобы не завести мёртвый параметр.)

Только после того как все живые пути будут доказанно слать `reminderPlan`, `legacyReminders` в
`bookingLifecycleRoute.ts` можно резать по правилам D13b (перепись → рез → тест, красный без ветки → зелёные
D13a/D14 тесты → lint/typecheck).
