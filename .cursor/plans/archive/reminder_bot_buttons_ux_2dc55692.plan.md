---
name: Reminder bot buttons UX
overview: "Закрыто (2026-05). Канон по боту — репозиторий: см. приложение webapp reminders.md §«Бот (Telegram / MAX)»; этот файл — архивный указатель статуса."
status: completed
todos:
  - id: keyboard
    content: "reminderInlineKeyboard — пять рядов; optional replyMarkup в buildReminderCallbackAckIntents"
    status: completed
  - id: skip-one-tap
    content: "scripts telegram/max skip.open → applyPreset none; reminder.skip.saved + fallback"
    status: completed
  - id: webapp-api
    content: "POST …/reminders/messenger-topic/disable + disableReminderMessengerTopic; route tests"
    status: completed
  - id: integrator-callback
    content: "mapIn rem_bot_off, executeAction, handler, ports, integrations"
    status: completed
  - id: docs-tests
    content: "reminders.md; parity topicCode; reminderInlineKeyboard/mapIn/executeAction/route tests"
    status: completed
isProject: false
---

# Reminder bot buttons UX (архив, закрыт)

**Единственный канон описания после выката** — раздел **«Бот (Telegram / MAX)»** в [`apps/webapp/src/modules/reminders/reminders.md`](../../../apps/webapp/src/modules/reminders/reminders.md) (политика текста `/app`-пути, без дубля тела здесь).

**Черновики вне репозитория** не являются источником истины — актуально только содержимое монорепозитория (`git`).

## Краткая зафиксированная выжимка

- Inline-клавиатура диспатча: [`reminderInlineKeyboard.ts`](../../../apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts) — основной CTA, снooze 20 + `rem_skip` (одним тапом через `applyPreset` + `reasonCode: none`), тишина до завтра + расписание, `rem_bot_off`, строка установки PWA/web_app; строки «Выполнить», snooze 15/30 и нижнюю строку только «Расписание» как в старой клавиатуре — сняты (см. канон §Бот и legacy-сценарии).
- Отключение в боте по темам: **`reminders.messengerTopic.disable.callback`** → signed **`POST /api/integrator/reminders/messenger-topic/disable`** ([`disable/route.ts`](../../../apps/webapp/src/app/api/integrator/reminders/messenger-topic/disable/route.ts), сервис [`disableReminderMessengerTopic.ts`](../../../apps/webapp/src/modules/reminders/disableReminderMessengerTopic.ts)); при ответе integrator экранирует абзацы в HTML и при необходимости не делает побочный `getAppBaseUrl`/БД если уже есть signed web_app URL из `buildExerciseReminderWebAppUrls` (fallback на `getAppBaseUrl` только когда URL не собрались).
- Паритет вычисления темы **`reminderOccurrenceTopicCode`**: webapp [`reminderOccurrenceTopicCode.ts`](../../../apps/webapp/src/modules/reminders/reminderOccurrenceTopicCode.ts) × integrator [`reminderNotificationTopicCode.ts`](../../../apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts) — см. два файла **`reminderOccurrenceTopicCode.parity.test.ts`** / **`reminderNotificationTopicCode.parity.test.ts`** (одинаковые фикстуры, править синхронно).
- Интеграционный охват автотестов: [`reminderInlineKeyboard.test.ts`](../../../apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.test.ts), [`mapIn.test.ts`](../../../apps/integrator/src/integrations/telegram/mapIn.test.ts), [`executeAction.test.ts`](../../../apps/integrator/src/kernel/domain/executor/executeAction.test.ts) (**в т. ч.** сценарий `reminders.messengerTopic.disable.callback` и регресс **`message.send` → `handleDelivery`** для rubitime fan-out), [`route.test.ts`](../../../apps/webapp/src/app/api/integrator/reminders/messenger-topic/disable/route.test.ts).

## Смежные архивные планы

- Колбэки Telegram напоминаний (предыдущий контур): [`telegram_reminder_callback_fix_cf461c6a.plan.md`](telegram_reminder_callback_fix_cf461c6a.plan.md).

## Контекст инициативы

Относится к пациентским напоминаниям (**Инициатива PATIENT_REMINDER UX**, закрыта; журнал см. ниже по ссылке).

- [`docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../../../docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md)
- [`docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/LOG.md`](../../../docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/LOG.md)
