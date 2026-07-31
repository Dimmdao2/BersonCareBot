# messaging (webapp)

Чат поддержки пациента и врача хранится в `support_conversations` / `support_conversation_messages`.
При активном organization principal канонический thread принадлежит паре организация+пациент и получает ключ
`webapp:organization:{organizationId}:platform:{userId}`. Legacy/pre-SaaS контекст без организации сохраняет
`webapp:platform:{userId}`. Это не даёт общему пациенту Clinic A и Clinic B разделить одну tenant-owned строку.
Signed M2M `admin-reply` пока не устанавливает доверенный organization principal, поэтому принимает только legacy
`webapp:platform:*` и отклоняет org-scoped ключ с `organization_context_required`, не определяя tenant по пациенту.

Вопросы поддержки и `support_delivery_events` также принадлежат webapp. Integrator передаёт нормализованную
команду через signed `/api/integrator/support/question` или `/api/integrator/support/delivery-attempt`; webapp
разрешает/проверяет организацию, входит под explicit organization principal и пишет через Drizzle-порт
`pgIntegratorSupportQuestionOwnership`. Ответ содержит необязательный `canonicalWrite`: новый integrator после него
не пишет `public` сам, а старый webapp без поля сохраняет прежний совместимый путь. `integrator.message_drafts`
остаётся локальным техническим состоянием integrator.

Patient POST записывает сообщение и обновляет `last_message_at` в одной транзакции. Под locked `app_patient`
обновление выполняет только `app.touch_current_patient_support_conversation_activity(messageId)`: capability
берёт организацию, пациента и время из защищённого DB-контекста, принимает лишь собственное `user/webapp`
сообщение, созданное в текущей транзакции, и не выдаёт пациенту прямой `UPDATE(last_message_at)`.
Закрытый/неактивный диалог (`status != open` или `closed_at IS NOT NULL`) отклоняется в service/repository
до вставки и повторно внутри capability, поэтому сообщение и activity update не могут разойтись.

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
