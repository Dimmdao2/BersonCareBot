# patient-broadcasts

Legacy ACL/read для массовых рассылок врача. **Основной UX:** полный текст в PWA-чат (`/app/patient/messages`), см. `appendPatientInboundAdminMessage` и [`DOCTOR_BROADCASTS.md`](../../../../docs/ARCHITECTURE/DOCTOR_BROADCASTS.md).

## Маршрут

`/app/patient/broadcasts/[auditId]` — редирект в чат (старые deep link из push).

## Доступ (API / port)

- Строка в `broadcast_audit_recipients` для `(audit_id, platform_user_id)`.
- `broadcast_audit.preview_only = false`.

## Push

`fanOutBroadcastWebPush` → `openUrl` = `/app/patient/messages`.
