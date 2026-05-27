# PWA-чат пациента как inbox уведомлений

Канонический маршрут: **`/app/patient/messages`**. Отдельного «центра уведомлений» и списка прошлых рассылок в меню **нет** — история в одном thread `webapp:platform:{platformUserId}`.

Связанные документы: [`DOCTOR_BROADCASTS.md`](DOCTOR_BROADCASTS.md) (рассылки врача), [`RUBITIME_BOOKING_PIPELINE.md`](RUBITIME_BOOKING_PIPELINE.md) (запись), [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) §patient Web Push.

## Что попадает в чат

| Событие | Текст в чате | Web Push `openUrl` | Telegram / MAX / SMS |
|--------|--------------|-------------------|----------------------|
| Массовая рассылка врача | Полный `title` + `body` (`buildBroadcastMessageText`) | `/app/patient/messages` | Полный HTML/plain в боте/SMS — **без изменений** |
| Запись: создана / отменена (`appointment_lifecycle`) | Copy из `buildAppointmentLifecyclePushCopy` | `/app/patient/messages` | Как раньше (`sendLinkedChannelMessage` в integrator) |
| Ответ врача в чате (1:1) | Текст ответа | `/app/patient/messages` (`notifyPatientDoctorReply`) | Preview + ссылка на чат |

Идемпотентность входящих: стабильный `integrator_message_id` + `ON CONFLICT DO NOTHING` в `appendWebappMessage`.

Ключи:

- рассылка: `broadcast:{auditId}:{platformUserId}`
- запись: `booking-{created|cancelled|rescheduled}:{bookingId}`

## Что не попадает в чат

- Напоминания о приёме (`appointment_reminder`, 24ч/2ч) — push ведёт на booking, в чат **не** дублируется.
- Напоминания о разминке / занятии / rehab — deep link на занятие **без изменений**.
- Дублирование рассылки через `notifyPatientDoctorReply` — **запрещено** (второе сообщение в TG/MAX).

## Legacy deep link

- **`/app/patient/broadcasts/[auditId]`** — `redirect` → `/app/patient/messages` (старые push на страницу рассылки).
- Текст в чате только для рассылок **после выката**; backfill старых `broadcast_audit` **не** выполняется.

## Непрочитанные (бейдж «Сегодня»)

Входящие = `support_conversation_messages` с `sender_role <> 'user'` и `read_at IS NULL` по **всем** диалогам `platform_user_id`.

| UI | Источник |
|----|----------|
| Красная точка на вкладке «Сегодня» (mobile nav) | `usePatientSupportUnreadCount()` → `GET /api/patient/messages/unread-count` |
| Подсказка на главной | SSR `deps.messaging.patient.unreadCount` (тот же подсчёт после merge legacy) |
| Desktop: иконка «Сообщения» | тот же hook |

**Сброс прочитанного:** `POST /api/patient/messages/read` помечает входящие во **всех** диалогах пользователя (не только в текущем `conversationId`). Перед подсчётом — `mergeLegacySupportConversationsForPlatformUser`.

**Мгновенное обновление UI:** после успешного read в [`PatientMessagesClient.tsx`](../../apps/webapp/src/app/app/patient/messages/PatientMessagesClient.tsx) (bootstrap и poll) — `notifyPatientSupportUnreadCountChanged()`; hook слушает событие `bersoncare:patient-support-unread-refresh`.

## Код (webapp)

| Область | Путь |
|--------|------|
| Запись в чат | [`appendPatientInboundAdminMessage.ts`](../../apps/webapp/src/modules/messaging/appendPatientInboundAdminMessage.ts), порт [`messaging/ports.ts`](../../apps/webapp/src/modules/messaging/ports.ts) (`PatientInboundChatPort`) |
| Рассылка | [`doctor-broadcasts/service.ts`](../../apps/webapp/src/modules/doctor-broadcasts/service.ts) после `commitAuditAndDeliveryQueue` |
| Push рассылки | [`fanOutBroadcastWebPush.ts`](../../apps/webapp/src/modules/doctor-broadcasts/fanOutBroadcastWebPush.ts) |
| Lifecycle запись | [`patientWebPushNotify.ts`](../../apps/webapp/src/modules/patient-notifications/patientWebPushNotify.ts) при `intentType === appointment_lifecycle` |
| Unread API | [`patientMessagingService.ts`](../../apps/webapp/src/modules/messaging/patientMessagingService.ts), [`pgSupportCommunication.ts`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) |

## Код (integrator)

- [`recordM2mRoute.ts`](../../apps/integrator/src/integrations/rubitime/recordM2mRoute.ts) — `sendBookingWebPush`: для `appointment_lifecycle` `openUrl` = `{appBase}/app/patient/messages`.

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
