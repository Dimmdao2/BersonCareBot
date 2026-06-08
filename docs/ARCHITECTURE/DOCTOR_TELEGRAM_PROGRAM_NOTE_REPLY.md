# Ответ врача на наблюдение пациента по упражнению (Telegram / MAX)

Канон для потока **«комментарий к пункту программы»** → уведомление врачу в боте → ответ → сообщение в **PWA-чат** пациента (`/app/patient/messages`) и дублирование в Telegram/MAX по настройкам каналов.

Связанные документы: [`PATIENT_SUPPORT_CHAT_INBOX.md`](PATIENT_SUPPORT_CHAT_INBOX.md), [`CONFIGURATION_ENV_VS_DATABASE.md`](CONFIGURATION_ENV_VS_DATABASE.md) (`doctor_telegram_ids`, `admin_telegram_ids`), [`apps/webapp/INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) §Support chat M2M.

## Пациент: наблюдение и thread по пункту программы

- UI (doctor-program, `assignment_source === doctor`): вкладка «Программа» и страница пункта — см. [`apps/webapp/src/app/app/patient/treatment/program-detail/README.md`](../../apps/webapp/src/app/app/patient/treatment/program-detail/README.md).
- Rollout: `patient_program_discussion_ui_enabled` (thread UI), `patient_program_discussion_media_submission_enabled` (камера + upload) — оба scope `admin`, default off. Инициатива: [`docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/README.md`](../archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/README.md).
- **Текстовый комментарий:** `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion` — тело `{ body }`; dual-write в `program_action_log` (`action_type: note`, `payload.source: patient_observation`) и в `program_item_discussion_messages`.
- **Legacy path** (сохранён для совместимости): `POST .../progress/observation-note` — тот же dual-write через `patientAppendObservationNote`.
- **Медиа пациента:** presign/confirm → `POST .../discussion/media` с `{ mediaFileId }`; журнал врача — `payload.source: patient_media`.
- Для **`promo`** / **`course`** — guards как раньше; **`clinical_test`** — отдельный flow (`test-result`).

## Webapp: ответ врача из журнала программы (interim)

Помимо Telegram/MAX (`program_reply`), врач может ответить из webapp:

- UI: страница инстанса программы клиента — «Журнал выполнения» → клик по строке `patient_observation` → модалка → «Отправить».
- API: **`POST /api/doctor/treatment-program-instances/{instanceId}/items/{itemId}/program-note-reply`** — тело `{ text }`.
- Rollout: `patient_program_discussion_doctor_reply_from_log_enabled` (scope `admin`).
- Сервис: [`sendProgramNoteReply`](../../apps/webapp/src/modules/messaging/sendProgramNoteReply.ts) — dual-write в support-чат (префикс) **и** в `program_item_discussion_messages`; idempotent по `support_message_id`.
- Integrator route [`integratorSupportBridge.applyAdminReply`](../../apps/webapp/src/modules/messaging/integratorSupportBridge.ts) делегирует в тот же сервис при `programNoteStageItemId`.

Доставка пациенту — та же, что для Telegram-ответа (PWA-чат + push по каналам).

## Уведомление врачу

После успешной записи (только **`assignment_source: doctor`**):

- [`notifyDoctorPatientProgramNote`](../../apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts) → [`notifyDoctorPatientMessageToStaff`](../../apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts) (topic `doctor_patient_program_notes`).
- **Канон каналов:** **Web Push основной**; по умолчанию **`web_push` → telegram → max** per-staff — см. [`NOTIFICATION_CHANNELS.md`](NOTIFICATION_CHANNELS.md). Матрица `/app/settings`; env `doctor_*_ids` / `admin_*_ids` — **fallback только для telegram/max**, если per-staff мессенджеры не доставили.
- Inline-кнопка **«Ответить»** (telegram/max): callback **`program_reply:{stageItemId}`** (укладывается в лимит Telegram 64 байта для `callback_data`; в отличие от `admin_reply:webapp:platform:{uuid}`, который занимает 64 байта без места под контекст упражнения).

## Integrator: начало ответа (`program_reply`)

Сценарии:

- `telegram.admin.programNote.reply.start` / `max.admin.programNote.reply.start` (callback `program_reply`, priority 15).

Шаги:

1. **`webapp.programNote.replyBegin`** — M2M **`POST /api/integrator/program-note/reply-begin`** с `{ stageItemId }`.
2. **`user.state.set`** — state `admin_reply:webapp:platform:{platformUserId}#pn:{stageItemId}` (см. [`programNoteReplyContext.ts`](../../apps/webapp/src/modules/messaging/programNoteReplyContext.ts), суффикс `#pn:` в [`programNoteReplyState.ts`](../../apps/integrator/src/shared/support/programNoteReplyState.ts)).
3. Prompt «Напишите ответ…».

При ошибке `reply-begin` — сообщение врачу, **`abortPlan`** (дальнейшие шаги сценария не выполняются; пустой `user.state` не пишется).

Парсинг state при входящем сообщении: [`handleIncomingEvent.ts`](../../apps/integrator/src/kernel/domain/handleIncomingEvent.ts) — `replyConversationId` без суффикса `#pn:`, `programNoteStageItemId` в `BaseContext`.

## Integrator: текст ответа

Сценарий **`telegram.admin.reply.message`** / **`max.admin.reply.message`** (`replyMode: true`, priority 10):

- **`conversation.admin.reply`** → для `webapp:platform:*` — **`POST /api/integrator/support/admin-reply`** с опциональным **`programNoteStageItemId`**.
- Webapp: [`integratorSupportBridge.applyAdminReply`](../../apps/webapp/src/modules/messaging/integratorSupportBridge.ts) добавляет префикс  
  `Ответ на ваш комментарий к упражнению «{название из snapshot}»:` + текст врача.
- После успешного ответа по program note **state не сбрасывается в `idle`** — остаётся `admin_reply:…#pn:…` (можно отправить несколько сообщений подряд с тем же префиксом).
- Для обычного чата поддержки (без `#pn`) — state → **`idle`** (как раньше).
- Кнопка **«Дополнить ответ»** при program note: снова **`program_reply:{stageItemId}`** (не `admin_reply_continue`, т.к. не влезает в 64 байта с полным conversation id).

Обычное сообщение пациента в поддержку: кнопка «Ответить» по-прежнему **`admin_reply:webapp:platform:{platformUserId}`** — [`notifyDoctorPatientMessage`](../../apps/webapp/src/modules/messaging/notifyDoctorPatientMessage.ts).

## Доставка пациенту

| Канал | Поведение |
|--------|-----------|
| PWA `/app/patient/messages` | Полный текст с префиксом в `support_conversation_messages` (`sender_role: admin`) |
| Telegram / MAX / email / Web Push | [`notifyPatientDoctorReply`](../../apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts) — preview + ссылка на чат (тот же текст, что в thread) |

Идемпотентность admin-reply: `support-admin:{integratorMessageId}`.

## Админ-бот: команды и подсказки

- **`isAdmin` в integrator** — env-admin (`TELEGRAM_ADMIN_ID` / MAX admin) **∪** `admin_*_ids` **∪** `doctor_*_ids` из `system_settings` (scope `admin`). Врач из `doctor_telegram_ids` / `doctor_max_ids` получает уведомления и может пользоваться admin-сценариями (в т.ч. «Ответить» на комментарий к упражнению).
- Удалён dev catch-all **`admin.test.commandReceived`** («Тест: команда получена»).
- Свободный текст без режима ответа: сценарии **`telegram.admin.message.unmatched`** / **`max.admin.message.unmatched`** (priority 2) — шаблон `admin.reply.hintUnmatched` (команды `/dialogs`, `/admin_bookings`, … и напоминание про «Ответить»).

## M2M API (webapp)

| Endpoint | Назначение |
|----------|------------|
| `POST /api/integrator/program-note/reply-begin` | `{ stageItemId }` → `{ ok, programNoteReplyState, platformUserId, exerciseTitle, integratorConversationId }` |
| `POST /api/integrator/support/admin-reply` | `{ integratorConversationId, integratorMessageId, text, createdAt, programNoteStageItemId? }` |
| `POST /api/integrator/support/sync-user-message` | Входящие от пациента из бота (без изменений) |

Подпись и idempotency — как у других integrator M2M (`x-bersoncare-*`).

## Вне scope (осознанно)

- **`/api/doctor/comments`** (CommentBlock на карточке клиента) — **не** пишет в patient messages; отдельная модель `entity_comments`.
- Ответ врача из **`/app/doctor/messages`** без `programNoteStageItemId` — **без** префикса про упражнение (нет привязки UI к `stageItemId`).
- Ответ врача **без** нажатия «Ответить» под уведомлением в боте — не попадает в program-note flow (сработает подсказка unmatched или тишина для других матчей).
- Полноценная переработка **`/app/doctor/messages`** как inbox по пунктам программы — **вне scope** v1 (interim — журнал программы + Telegram).

## Код (краткая карта)

| Слой | Файлы |
|------|--------|
| Webapp notify / prefix | `notifyDoctorPatientProgramNote.ts`, `programNoteReplyContext.ts`, `integratorSupportBridge.ts`, `sendProgramNoteReply.ts` |
| Webapp patient discussion | `modules/program-item-discussion/**`, `ProgramItemDiscussionDialog.tsx`, patient discussion API routes |
| Webapp doctor reply UI | `TreatmentProgramInstanceDetailClient.tsx`, `POST .../program-note-reply/route.ts` |
| Webapp API | `api/integrator/program-note/reply-begin/route.ts`, `api/integrator/support/admin-reply/route.ts` |
| Integrator scripts | `content/telegram/admin/scripts.json`, `content/max/admin/scripts.json` |
| Integrator executor | `executeAction.ts` (`webapp.programNote.replyBegin`), `handlers/supportRelay.ts` |
| Integrator mapIn | `integrations/telegram/mapIn.ts` — `program_reply:` |
| Staff `isAdmin` | `infra/db/messengerStaffIds.ts`, `app/routes.ts` → `buildAdminFacts` / `buildMaxFacts` |

Инициатива фиксов ботов (2026-05-30): [`docs/BOT_FIXES/README.md`](../BOT_FIXES/README.md).

## Тесты (ориентир)

- `programNoteReplyContext.test.ts`, `notifyDoctorPatientProgramNote.test.ts`, `integratorSupportBridge.test.ts` (webapp)
- `mapIn.test.ts` (`program_reply`), `programNoteReplyState.test.ts` (integrator)
- `executeAction.test.ts` — failed / missing `stageItemId` `reply-begin` + `callback.answer`
- `messengerStaffIds.test.ts`, `integrations/telegram/webhook.test.ts`, `integrations/max/webhook.test.ts`
