# Ответ врача на комментарий пациента к упражнению

Врач получает уведомление о новом комментарии, но отвечает только в кабинете. Telegram и MAX не открывают
режим ответа и не хранят состояние диалога врача.

## Действующий путь

- Пациент пишет комментарий в обсуждении пункта программы.
- Webapp сохраняет его в обсуждении и уведомляет сотрудников через настроенные каналы без текста комментария.
- Врач открывает программу пациента в кабинете и отвечает из журнала/обсуждения пункта.
- `POST /api/doctor/treatment-program-instances/{instanceId}/items/{stageItemId}/program-note-reply`
  вызывает `sendProgramNoteReply`.
- Ответ атомарно связывается с обсуждением пункта, появляется в пациентском чате и передаётся в каналы
  уведомлений пациента по его настройкам.

## Границы

- Боты клиники принимают входящие сообщения пациента и передают их в webapp.
- Уведомление врачу в Telegram/MAX не содержит кнопки ответа и не создаёт bot-state для врача.
- Signed M2M `support/admin-reply` обслуживает обычный legacy support-thread и не принимает контекст пункта
  программы.
- Контекст упражнения разрешается только внутри webapp по `stageItemId` и tenant-scoped доступу врача.

## Код

- `apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts` — уведомление сотрудников.
- `apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/program-note-reply/route.ts`
  — дверь ответа врача.
- `apps/webapp/src/modules/messaging/sendProgramNoteReply.ts` — каноническая запись ответа и уведомление пациента.
- `apps/webapp/src/modules/messaging/programNoteReplyContext.ts` — формат сообщения и проверяемый контекст пункта.

См. также [`PATIENT_SUPPORT_CHAT_INBOX.md`](PATIENT_SUPPORT_CHAT_INBOX.md) и
[`NOTIFICATION_CHANNELS.md`](NOTIFICATION_CHANNELS.md).
