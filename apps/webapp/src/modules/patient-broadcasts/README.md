# patient-broadcasts

Чтение полного текста **массовой рассылки врача** в кабинете пациента.

## Маршрут

`/app/patient/broadcasts/[auditId]` — RSC [`page.tsx`](../../app/app/patient/broadcasts/[auditId]/page.tsx).

## Доступ

- Строка в `broadcast_audit_recipients` для `(audit_id, platform_user_id)`.
- `broadcast_audit.preview_only = false`.
- Иначе страница → `notFound()`.

## Push

`buildPatientBroadcastOpenPath(auditId)` → same-origin путь для Web Push (`fanOutBroadcastWebPush`).

## Текст

`extractBroadcastBodyContent` убирает из `message_body` префикс `message_title\n\n`, если он совпадает с сохранённым combined-текстом при отправке.

См. [`docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`](../../../../docs/ARCHITECTURE/DOCTOR_BROADCASTS.md).
