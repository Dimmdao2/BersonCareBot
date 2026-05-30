# admin

Сценарии и шаблоны для **админ-чата** в Telegram и MAX: диалоги с пользователями, ответы на вопросы поддержки, списки неотвеченных вопросов, ответ на **наблюдение пациента по упражнению** (program note).

## Кто считается admin в боте

- **`isAdmin`** в facts webhook = env-admin (`TELEGRAM_ADMIN_ID` / MAX admin) **∪** id из `admin_telegram_ids` / `doctor_telegram_ids` (Telegram) или `admin_max_ids` / `doctor_max_ids` (MAX) в `system_settings` (scope `admin`).
- Резолвер: `apps/integrator/src/infra/db/messengerStaffIds.ts` (TTL-кеш списков 60 с; сброс при `POST /api/integrator/settings/sync` для этих ключей).
- Канон: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../../../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md) §«Админ-бот».

## Ответ на сообщение пациента (поддержка)

1. Уведомление с кнопкой **«Ответить»** → callback `admin_reply:webapp:platform:{platformUserId}` (64 байта).
2. Сценарий `telegram.admin.reply.start` → `user.state.set` → prompt.
3. Текст → `telegram.admin.reply.message` → M2M `POST /api/integrator/support/admin-reply` → PWA-чат + `notifyPatientDoctorReply`.

## Ответ на наблюдение по упражнению (program note)

1. Уведомление [`notifyDoctorPatientProgramNote`](../../../../../webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts) → кнопка **«Ответить»** → callback **`program_reply:{stageItemId}`** (укладывается в лимит 64 байта).
2. `telegram.admin.programNote.reply.start` / `max.admin.programNote.reply.start` → `webapp.programNote.replyBegin` → state `admin_reply:webapp:platform:{userId}#pn:{stageItemId}`.
3. Текст → `*.admin.reply.message` → `admin-reply` с **`programNoteStageItemId`** → префикс в чате пациента.
4. После ответа state **не** сбрасывается в `idle` (можно дописать несколько сообщений); **«Дополнить ответ»** снова через `program_reply:{stageItemId}`.

Канон: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../../../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md).

## Прочие команды

- `/dialogs`, `/admin_bookings`, … — см. `scripts.json`, priority выше unmatched.
- Свободный текст **без** режима ответа: `telegram.admin.message.unmatched` / `max.admin.message.unmatched` (priority 2) — шаблон `admin.reply.hintUnmatched`.

**Удалено (dev):** catch-all `admin.test.commandReceived` («Тест: команда получена»).
