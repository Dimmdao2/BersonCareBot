# Статусы доставки и прочтения в чатах (✓ / ✓✓)

Telegram-style галочки на **исходящих** сообщениях во всех чатах webapp:

| Галочка | Значение |
|---------|----------|
| ✓ (одна) | Сообщение записано в БД и отображается в thread (ушло с клиента на сервер). |
| ✓✓ (две) | Собеседник просмотрел thread (курсор прочтения ≥ время сообщения). |

Входящие сообщения галочек **не** показывают.

## UI

| Компонент | Путь |
|-----------|------|
| Логика статуса | [`chatMessageDeliveryStatus.ts`](../../apps/webapp/src/modules/messaging/chatMessageDeliveryStatus.ts) |
| Иконки ✓ / ✓✓ | [`ChatMessageDeliveryTicks.tsx`](../../apps/webapp/src/shared/ui/chat/ChatMessageDeliveryTicks.tsx) |
| Время + галочки в пузыре | [`ChatBubbleOutgoingMeta.tsx`](../../apps/webapp/src/shared/ui/chat/ChatBubbleOutgoingMeta.tsx) |
| Support-чат (пациент / врач) | [`ChatView.tsx`](../../apps/webapp/src/modules/messaging/components/ChatView.tsx) |
| Комментарии к упражнению (пациент) | [`ProgramItemDiscussionDialog.tsx`](../../apps/webapp/src/app/app/patient/treatment/ProgramItemDiscussionDialog.tsx) |
| Комментарии (врач) | [`DoctorProgramDiscussionMessagesPanel.tsx`](../../apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramDiscussionMessagesPanel.tsx) |

Время и галочки — **внутри** исходящего пузыря справа внизу (как в Telegram 1:1).

## Support-чат (`support_conversation_messages`)

Поле `read_at` на строке сообщения:

| Отправитель | ✓✓ когда |
|-------------|----------|
| Пациент (`sender_role = user`) | Врач открыл диалог → `POST /api/doctor/messages/{conversationId}/read` → `markUserMessagesReadByAdmin` |
| Врач (`sender_role = admin`) | Пациент открыл чат → `POST /api/patient/messages/read` → `markInboundReadForUser` |

**Live-обновление UI:** polling (~18 с) делает **полный** refetch списка сообщений (не только `since`), чтобы обновлять `read_at` на уже показанных исходящих без перезагрузки страницы.

- Пациент: [`PatientMessagesClient.tsx`](../../apps/webapp/src/app/app/patient/messages/PatientMessagesClient.tsx)
- Врач: [`DoctorChatPanel.tsx`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx)

Канон inbox: [`PATIENT_SUPPORT_CHAT_INBOX.md`](PATIENT_SUPPORT_CHAT_INBOX.md).

## Комментарии к упражнению (`program_item_discussion_*`)

Per-message `read_at` **нет**. Курсор прочтения — `program_item_discussion_reads.last_read_at` по паре `(viewer_user_id, instance_stage_item_id)`.

| Сторона | Исходящие | ✓✓ по курсору |
|---------|-----------|---------------|
| Пациент | `sender_role = patient` | `peerLastReadAt` = max `last_read_at` среди active staff (`getMaxLastReadAtForViewers`) |
| Врач | `sender_role = admin` | `peerLastReadAt` / `peerLastReadAtByStageItemId` = `last_read_at` пациента по пункту |

**Mark read врача (staff cursor):**

- Per-item dialog: `POST .../items/{stageItemId}/discussion/read` при открытии — [`DoctorProgramItemDiscussionDialog.tsx`](../../apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog.tsx)
- Instance dialog (все пункты): mark read для каждого `instanceStageItemId` на загруженной странице + при «Показать предыдущие» — [`DoctorProgramInstanceDiscussionDialog.tsx`](../../apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramInstanceDiscussionDialog.tsx)
- «Сегодня» / attention: [`DoctorTodayAttentionDialog.tsx`](../../apps/webapp/src/app/app/doctor/DoctorTodayAttentionDialog.tsx)

**Mark read пациента:** `POST .../discussion/read` при открытии комментариев — [`ProgramItemDiscussionDialog.tsx`](../../apps/webapp/src/app/app/patient/treatment/ProgramItemDiscussionDialog.tsx).

**Live-обновление ✓→✓✓:** GET discussion с полем `peerLastReadAt` / `peerLastReadAtByStageItemId` polling каждые **15 с** пока диалог открыт (пациент и врач).

## API (discussion GET)

| Route | Поле |
|-------|------|
| `GET /api/patient/.../items/{itemId}/discussion` | `peerLastReadAt` |
| `GET /api/doctor/.../items/{stageItemId}/discussion` | `peerLastReadAt` |
| `GET /api/doctor/.../discussion` (instance) | `peerLastReadAtByStageItemId` |

## Тесты

- `chatMessageDeliveryStatus.test.ts`
- `ChatView.test.tsx` — рендер ✓ / ✓✓
- `DoctorProgramDiscussionMessagesPanel.test.tsx` — ✓✓ на исходящем врача

## Ограничения

- Галочка ✓ появляется **после** успешного POST (запись в БД), не во время «Отправка…» на кнопке.
- Instance-диалог mark read только для пунктов, **представленных в загруженных сообщениях** (или одного выбранного фильтра), не для всей программы целиком.
