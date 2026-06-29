# PWA-чат пациента и inbox уведомлений

Канонический маршрут 1:1 чата: **`/app/patient/messages`**. Массовые рассылки и lifecycle-уведомления записи не показываются в чате пациента и врача; они читаются через колокольчик в верхнем меню пациента.

Связанные документы: [`DOCTOR_BROADCASTS.md`](DOCTOR_BROADCASTS.md) (рассылки врача), [`RUBITIME_BOOKING_PIPELINE.md`](RUBITIME_BOOKING_PIPELINE.md) (запись), [`NOTIFICATION_CHANNELS.md`](NOTIFICATION_CHANNELS.md) (**Web Push — основной канал**), [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) §patient Web Push.

## Что попадает в чат

| Событие | Текст в чате | Web Push `openUrl` | Telegram / MAX / SMS |
|--------|--------------|-------------------|----------------------|
| Ответ врача в чате (1:1) | Текст ответа | `/app/patient/messages` (`notifyPatientDoctorReply`) | Preview + ссылка на чат |
| Ответ врача на **наблюдение по упражнению** (program note) | `Ответ на ваш комментарий к упражнению «…»:` + текст | `/app/patient/messages` | То же (`notifyPatientDoctorReply`); кнопка в боте — `program_reply:{stageItemId}` |

## Что попадает в колокольчик уведомлений

| Событие | Хранение | Patient UI | Web Push `openUrl` |
|--------|----------|------------|--------------------|
| Массовая рассылка врача | `support_conversation_messages`, `source='doctor_broadcast'`, id `broadcast:{auditId}:{userId}` | Колокольчик в верхнем меню; Sheet без поля ответа | `/app/patient?notifications=1` |
| Запись: создана / отменена / перенесена (`appointment_lifecycle`) | `support_conversation_messages`, `source='appointment_lifecycle'`, id `booking-{created|cancelled|rescheduled}:{bookingId}` | Колокольчик в верхнем меню; Sheet без поля ответа | `/app/patient?notifications=1` |

Классификация работает по `source` и legacy-префиксам `integrator_message_id`, чтобы старые строки тоже не попадали в 1:1 чат.

## Уведомление врача (пациент → staff)

Сообщение в support-чат или комментарий к упражнению запускает staff-notify (`notifyDoctorPatientMessage` / `notifyDoctorPatientProgramNote` → `notifyDoctorPatientMessageToStaff`).

| Событие | Staff topic | Каналы по умолчанию |
|---------|-------------|---------------------|
| Сообщение пациента (webapp / бот) | `doctor_patient_messages` | **web_push** → telegram → max |
| Комментарий к пункту программы | `doctor_patient_program_notes` | **web_push** → telegram → max |

Канон: [`NOTIFICATION_CHANNELS.md`](NOTIFICATION_CHANNELS.md). Настройки: `/app/settings` (Staff PWA). Логи: `doctor_staff_notify.channels`, `web_push_provider_response`.

Идемпотентность входящих: стабильный `integrator_message_id` + `ON CONFLICT DO NOTHING` в `appendWebappMessage`.

Ключи:

- рассылка: `broadcast:{auditId}:{platformUserId}`
- запись: `booking-{created|cancelled|rescheduled}:{bookingId}`

## Что не попадает в чат

- Массовые рассылки врача (`doctor_broadcast`) — только notification inbox.
- Lifecycle записи (`appointment_lifecycle`) — только notification inbox.
- Напоминания о приёме (`appointment_reminder`, 24ч/2ч) — push ведёт на booking, в чат **не** дублируется.
- Напоминания о разминке / занятии / rehab — deep link на занятие **без изменений**.
- Дублирование рассылки через `notifyPatientDoctorReply` — **запрещено** (второе сообщение в TG/MAX).
- Комментарии врача через **`/api/doctor/comments`** (карточка клиента, `entity_comments`) — **не** этот inbox; см. [`DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md).

## Legacy deep link

- **`/app/patient/broadcasts/[auditId]`** — `redirect` → `/app/patient/messages` (старые push на страницу рассылки).
- Текст в чате только для рассылок **после выката**; backfill старых `broadcast_audit` **не** выполняется.

## Непрочитанные

Чатовые входящие = `support_conversation_messages` с `sender_role <> 'user'`, `read_at IS NULL` и **не** `doctor_broadcast` / `appointment_lifecycle` по **всем** диалогам `platform_user_id`.

| UI | Источник |
|----|----------|
| Красная точка на вкладке «Сегодня» (mobile nav) | `usePatientSupportUnreadCount()` → `GET /api/patient/messages/unread-count` |
| Подсказка на главной | SSR `deps.messaging.patient.unreadCount` (тот же подсчёт после merge legacy) |
| Desktop: иконка «Сообщения» | тот же hook |
| Desktop/header: колокольчик «Уведомления» | `usePatientNotificationUnreadCount()` → `GET /api/patient/notifications/inbox` |

**Сброс прочитанного:** `POST /api/patient/messages/read` помечает входящие во **всех** диалогах пользователя (не только в текущем `conversationId`). Перед подсчётом — `mergeLegacySupportConversationsForPlatformUser`.

**Мгновенное обновление UI:** после успешного read в [`PatientMessagesClient.tsx`](../../apps/webapp/src/app/app/patient/messages/PatientMessagesClient.tsx) (bootstrap и poll) — `notifyPatientSupportUnreadCountChanged()`; hook слушает событие `bersoncare:patient-support-unread-refresh`.

**Сброс уведомлений:** `POST /api/patient/notifications/inbox/read` помечает непрочитанные notification-сообщения пользователя; hook слушает `bersoncare:patient-notification-unread-refresh`.

## Статусы доставки (✓ / ✓✓)

На исходящих сообщениях в support-чате: одна галочка — записано в БД; две — прочитано собеседником (`read_at` на `support_conversation_messages`). Polling refetch обновляет галочки без перезагрузки страницы.

Канон: [`CHAT_READ_RECEIPTS.md`](CHAT_READ_RECEIPTS.md).

## Код (webapp)

| Область | Путь |
|--------|------|
| Запись в чат | [`appendPatientInboundAdminMessage.ts`](../../apps/webapp/src/modules/messaging/appendPatientInboundAdminMessage.ts), порт [`messaging/ports.ts`](../../apps/webapp/src/modules/messaging/ports.ts) (`PatientInboundChatPort`) |
| Рассылка | [`doctor-broadcasts/service.ts`](../../apps/webapp/src/modules/doctor-broadcasts/service.ts) после `commitAuditAndDeliveryQueue` |
| Push рассылки | [`fanOutBroadcastWebPush.ts`](../../apps/webapp/src/modules/doctor-broadcasts/fanOutBroadcastWebPush.ts) |
| Lifecycle запись | [`patientWebPushNotify.ts`](../../apps/webapp/src/modules/patient-notifications/patientWebPushNotify.ts) при `intentType === appointment_lifecycle` |
| Unread API | [`patientMessagingService.ts`](../../apps/webapp/src/modules/messaging/patientMessagingService.ts), [`pgSupportCommunication.ts`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) |
| Notification inbox | [`patientNotificationInboxService.ts`](../../apps/webapp/src/modules/messaging/patientNotificationInboxService.ts), [`PatientNotificationInboxButton.tsx`](../../apps/webapp/src/shared/ui/patient/shell/PatientNotificationInboxButton.tsx) |
| Program note → ответ врача | [`notifyDoctorPatientProgramNote.ts`](../../apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts), [`programNoteReplyContext.ts`](../../apps/webapp/src/modules/messaging/programNoteReplyContext.ts), [`integratorSupportBridge.ts`](../../apps/webapp/src/modules/messaging/integratorSupportBridge.ts) |

## Код (integrator)

- [`recordM2mRoute.ts`](../../apps/integrator/src/integrations/rubitime/recordM2mRoute.ts) — webapp `runPatientWebPushNotify`: для `appointment_lifecycle` итоговый `openUrl` = `{appBase}/app/patient?notifications=1`.
- Program note reply: `content/*/admin/scripts.json` (`program_reply`, `reply.message`), `handlers/supportRelay.ts`, `webapp.programNote.replyBegin` — см. [`DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md).

## Тесты (ориентир)

- `appendPatientInboundAdminMessage.test.ts`
- `doctor-broadcasts/service.test.ts`, `fanOutBroadcastWebPush.test.ts`
- `patientWebPushNotify.test.ts`
- `useSupportUnreadPolling.test.ts`, `PatientTopNav.test.tsx`
- `pgSupportCommunication.test.ts` (mark read, legacy + canonical)
- integrator: `recordM2mRoute.test.ts` — `booking.created patient web push uses messages openUrl`

## Ограничения

- **`booking.rescheduled`:** тип и id сообщения в чате готовы; событие в integrator пока не подключено ([`docs/TODO.md`](../TODO.md) §Web Push / перенос записи).
- **`broadcast_audit_recipients`:** журнал врача и ACL; чтение пациентом через отдельную страницу снято с UX.
