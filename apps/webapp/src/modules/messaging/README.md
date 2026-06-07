# messaging (webapp)

Чат поддержки пациента и врача: thread `webapp:platform:{userId}` в `support_conversations` / `support_conversation_messages`.

## Inbox (рассылки, запись)

Входящие от клиники без дублирования в `notifyPatientDoctorReply`:

- [`appendPatientInboundAdminMessage.ts`](appendPatientInboundAdminMessage.ts) — запись admin-сообщения в чат
- [`ports.ts`](ports.ts) — `PatientInboundChatPort` для DI

Канон: [`docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md`](../../../../docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md).

## Program note (наблюдение по упражнению)

- [`notifyDoctorPatientProgramNote.ts`](notifyDoctorPatientProgramNote.ts) — уведомление врачу в TG/MAX, кнопка «Ответить» → callback `program_reply:{stageItemId}`.
- [`programNoteReplyContext.ts`](programNoteReplyContext.ts) — resolve по `stageItemId`, префикс `Ответ на ваш комментарий к упражнению «…»:`.
- [`integratorSupportBridge.ts`](integratorSupportBridge.ts) — `applyAdminReply` с опциональным `programNoteStageItemId`.
- Integrator: `webapp.programNote.replyBegin`, state `admin_reply:webapp:platform:{userId}#pn:{stageItemId}`.

Канон потока: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md).

## Unread

- [`patientMessagingService.ts`](patientMessagingService.ts) — `unreadCount` (merge legacy перед подсчётом)
- [`hooks/useSupportUnreadPolling.ts`](hooks/useSupportUnreadPolling.ts) — polling + `notifyPatientSupportUnreadCountChanged`

## UI

- [`components/ChatView.tsx`](components/ChatView.tsx) — support-чат; ✓ / ✓✓ на исходящих ([`CHAT_READ_RECEIPTS.md`](../../../../docs/ARCHITECTURE/CHAT_READ_RECEIPTS.md))
- [`chatMessageDeliveryStatus.ts`](chatMessageDeliveryStatus.ts), [`shared/ui/chat/ChatMessageDeliveryTicks.tsx`](../../shared/ui/chat/ChatMessageDeliveryTicks.tsx)
- Страница: [`app/app/patient/messages/PatientMessagesClient.tsx`](../../app/app/patient/messages/PatientMessagesClient.tsx)
- Комментарии к упражнению: [`ProgramItemDiscussionDialog.tsx`](../../app/app/patient/treatment/ProgramItemDiscussionDialog.tsx), [`DoctorProgramDiscussionMessagesPanel.tsx`](../../app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramDiscussionMessagesPanel.tsx)
