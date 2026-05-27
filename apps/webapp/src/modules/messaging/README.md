# messaging (webapp)

Чат поддержки пациента и врача: thread `webapp:platform:{userId}` в `support_conversations` / `support_conversation_messages`.

## Inbox (рассылки, запись)

Входящие от клиники без дублирования в `notifyPatientDoctorReply`:

- [`appendPatientInboundAdminMessage.ts`](appendPatientInboundAdminMessage.ts) — запись admin-сообщения в чат
- [`ports.ts`](ports.ts) — `PatientInboundChatPort` для DI

Канон: [`docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md`](../../../../docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md).

## Unread

- [`patientMessagingService.ts`](patientMessagingService.ts) — `unreadCount` (merge legacy перед подсчётом)
- [`hooks/useSupportUnreadPolling.ts`](hooks/useSupportUnreadPolling.ts) — polling + `notifyPatientSupportUnreadCountChanged`

## UI

- [`components/ChatView.tsx`](components/ChatView.tsx)
- Страница: [`app/app/patient/messages/PatientMessagesClient.tsx`](../../app/app/patient/messages/PatientMessagesClient.tsx)
