# Фаза 2 — remediation (исправления по AUDIT_PHASE_2)

Источник находок: [`AUDIT_PHASE_2.md`](./AUDIT_PHASE_2.md). Шаблон задач: [`DECOMPOSITION_MODEL.md`](./DECOMPOSITION_MODEL.md).

## Блоки F.1–F.7 (реализовано)

| ID | Описание |
|----|-----------|
| **F.1** | `041_patient_bookings_no_overlap.sql` — `btree_gist` + `EXCLUDE` для `confirmed`/`rescheduled`; in-memory overlap; сервис: `23P01` / `slot_overlap` → `markCancelled` + 409 |
| **F.2** | `042_patient_bookings_cancelling_status.sql`; статусы `cancelling`, `cancel_failed`; `markCancelling`; порядок cancel: local → external → final; UI labels |
| **F.3** | Раздельный catch: ошибка Rubitime → `failed_sync` + `booking_sync_failed`; ошибка `markConfirmed` (не overlap) → `console.error` + `booking_confirm_failed` |
| **F.4** | `booking_display_timezone` в `system_settings` + админ UI; integrator `getBookingDisplayTimezone` (TTL 60s) + `bookingNotificationFormat.ts` + тесты |
| **F.5** | Zod `BookingLifecycleEventSchema` + `parseBookingLifecycleEvent`; строгий payload в `/booking-event` |
| **F.6** | Тесты `recordM2mRoute.test.ts`: 400, UUID, dedup, doctor telegram, missing headers |
| **F.7** | `buildLinksFromBody`: `bookingUrl` = `webappCabinetUrl` при наличии; fallback `BOOKING_URL`; `webhook.links.test.ts` |

## Коммиты (рекомендуемый формат)

```
[fix-2.F1] …
[fix-2.F2] …
…
```

## Критерий завершения

- `pnpm run ci` зелёный
- Запись в [`AGENT_LOG.md`](./AGENT_LOG.md) для блока remediation
