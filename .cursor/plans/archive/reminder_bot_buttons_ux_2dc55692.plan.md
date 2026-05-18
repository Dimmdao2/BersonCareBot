---
name: Reminder bot buttons UX
overview: Пересобрать inline-клавиатуру напоминаний Telegram/MAX, один тап «Пропущу» с новым текстом, «Не напоминать в боте» через signed webapp API и ответ со списком оставшихся каналов + двумя ссылками (профиль / PWA).
status: pending
todos:
  - id: keyboard
    content: "reminderInlineKeyboard: новые ряды + install URL; buildReminderCallbackAckIntents — опциональный replyMarkup"
    status: pending
  - id: skip-one-tap
    content: "scripts telegram/max skip.open → applyPreset none; templates reminder.skip.saved + fallback handlers"
    status: pending
  - id: webapp-api
    content: "POST /api/integrator/reminders/messenger-topic/disable + сервис списка каналов + тесты ownership/topic/идемпотентность"
    status: pending
  - id: integrator-callback
    content: "mapIn rem_bot_off, executeAction, handler, RemindersWebappWritesPort, шаблоны ack + 2 кнопки"
    status: pending
  - id: docs-tests
    content: "reminders.md, reminderInlineKeyboard/mapIn/executeAction/route tests"
    status: pending
isProject: false
---

# План: кнопки и ответы бота для напоминаний (улучшенная версия)

## Контекст

- Клавиатура: [`apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts`](apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts) — сейчас primary, snooze 15/30, «Выполнить»/«Пропущу сейчас», «Тишина до 8ч»/«Тишина до завтра», отдельная строка «Расписание».
- Скип: [`telegram.reminder.skip.open`](apps/integrator/src/content/telegram/user/scripts.json) / [`max.reminder.skip.open`](apps/integrator/src/content/max/user/scripts.json) → `reminders.skip.reasonPrompt` → `reminder.skip.saved` в [`templates.json`](apps/integrator/src/content/telegram/user/templates.json) (и max) + fallback в [`handlers/reminders.ts`](apps/integrator/src/kernel/domain/executor/handlers/reminders.ts).
- Тема для фильтра мессенджеров: [`reminderOccurrenceTopicCode`](apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts) + [`getDeliveryTargetsForUser`](apps/webapp/src/modules/channel-preferences/deliveryTargets.ts).
- M2M signed POST: паттерн [`apps/webapp/src/app/api/integrator/reminders/occurrences/skip/route.ts`](apps/webapp/src/app/api/integrator/reminders/occurrences/skip/route.ts) и аналоги.

## Целевая клавиатура (без таблицы)

1. **Первая строка:** «Начать разминку» или «Начать занятие» — как сейчас: [`reminderIntentPrimaryLabel`](apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts) + существующие `web_app`/`url` из [`handlers/reminders.ts`](apps/integrator/src/kernel/domain/executor/handlers/reminders.ts) (`buildExerciseReminderWebAppUrls`).
2. **Вторая строка:** «Через 20 минут» — `rem_snooze:{occurrenceId}:20`; «Пропущу» — `rem_skip:{occurrenceId}` (уже укладывается в лимит 64 байта UTF-8 для Telegram).
3. **Третья строка:** «Тишина до завтра» — `rem_mute:tomorrow`; «Расписание» — тот же `schedule` spec, что сейчас для расписания (не отдельным полноширинным рядом ниже).
4. **Четвёртая строка:** «Не напоминать в боте» — новый callback **`rem_bot_off:{occurrenceId}`** (длина с UUID в пределах лимита).
5. **Пятая строка:** «Установить мобильное приложение» — `web_app` или `url` на signed entry с `next=` на стабильный путь PWA (например `/app/patient`), **без новых env** и без выдуманных store URL — только существующие [`buildWebappEntryUrl`](apps/integrator/src/integrations/webappEntryToken.js) / `getAppBaseUrl`.

**Убрать:** «Выполнить» (`rem_done`), snooze 15/30, «Тишина до 8ч», отдельную нижнюю строку только «Расписание».

### Последствие снятия «Выполнить»

- Отметка **done** для occurrence остаётся только через основной CTA (mini-app / открытие цели). Это сознательное сужение поверхности; в [`reminders.md`](apps/webapp/src/modules/reminders/reminders.md) явно зафиксировать.

## «Пропущу»: текст и один тап

- **Текст** (`reminder.skip.saved` + fallback в handler): согласовать с продуктом формулировку вида: «Все ок, один пропуск — не проблема. Сделаешь, когда сможешь 👌» (типографика: тире, запятые по желанию).
- **Сценарий:** в `telegram.reminder.skip.open` и `max.reminder.skip.open` заменить шаг на **`reminders.skip.applyPreset`** с **`reasonCode: "none"`** (как [`telegram.reminder.skip.preset`](apps/integrator/src/content/telegram/user/scripts.json)). Сценарии `skip.preset` / `skip.freeText` **оставить** для старых сообщений с клавиатурой причин.

## «Не напоминать в боте»

### Зафиксированная продуктовая логика (узкая и безопасная)

- **Канал:** `telegram` | `max` из контекста колбэка (`resource` / actor), как у snooze/mute.
- **Если `topicCode = reminderOccurrenceTopicCode(rule, category)` определён (не `undefined`):**
  - Выполнить `TopicChannelPrefsPort.upsert(platformUserId, topicCode, 'telegram' | 'max', false)` в [`pgTopicChannelPrefs`](apps/webapp/src/infra/repos/pgTopicChannelPrefs.ts).
  - Текст ответа: «Хорошо, отключаю напоминания в боте» + подстановка **Telegram** или **MAX**; затем блок про оставшиеся каналы для **этой же темы** (см. ниже).
- **Если `topicCode === undefined`** (например, вода без явного `notificationTopicCode` в правиле — см. [`reminderNotificationTopicCode.ts`](apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts)):
  - **Не** выполнять широкий silent-mute (`channel_preferences` для всего мессенджера) без отдельного продуктового решения — иначе пострадают не только напоминания.
  - **MVP:** вернуть `ok: true`, флаг `persisted: false`, поля для текста: коротко объяснить, что этот тип напоминаний не привязан к теме каналов, и направить в профиль теми же кнопками («Настроить каналы…» / «Установить…»). Опционально метрика `reminder_bot_off_no_topic` для последующего заведения темы в БД.

### Список «остаются активными…»

- Для **заданной темы** собрать каналы в человекочитаемом виде (логика согласована с доставкой: [`allowedChannelsForTopic`](apps/webapp/src/modules/patient-notifications/topicChannelRules.ts) + [`channel_preferences`](apps/webapp/src/modules/channel-preferences/deliveryTargets.ts) + строки `user_notification_topic_channels` с дефолтом «включено», если строки нет).
- Подписи в тексте: например **Push**, **Telegram**, **MAX**, **Email** — только если канал разрешён темой и после `upsert` остаётся включённым для пользователя; если список пуст — фраза «Сейчас не осталось активных каналов для напоминаний» (или эквивалент по смыслу согласованному с копирайтом).
- Рекомендация про мобильное приложение — отдельным предложением в том же сообщении (как в постановке).
- **Экранирование HTML:** если webapp отдаёт готовые строки для Telegram HTML, либо отдавать plain-поля и собирать/экранировать в integrator ([`escapeReminderHtml`](apps/integrator/src/kernel/domain/executor/handlers/reminders.ts)), чтобы не сломать разметку.

### Паритет `topicCode` integrator ↔ webapp

- Одна реализация правила вычисления темы в общем месте **или** два модуля с **одним** golden-тестом на паритет (вход: rule + category → topic). Не оставлять расхождение без теста.

### Новый signed endpoint (webapp)

- Путь (имя на усмотрение): `POST /api/integrator/reminders/messenger-topic/disable` по образцу skip/snooze: подпись `X-Bersoncare-Timestamp` / `X-Bersoncare-Signature`.
- Тело: `{ integratorUserId, occurrenceId, channel: 'telegram' | 'max' }`.
- Проверки: тот же паттерн владения occurrence, что в [`occurrences/skip`](apps/webapp/src/app/api/integrator/reminders/occurrences/skip/route.ts) (через projection / journal — переиспользовать существующие хелперы поиска пользователя и occurrence).
- **Идемпотентность:** повторный POST с теми же параметрами → `200`, `ok: true`, без ошибки (канал уже выключен).

### Integrator

- [`mapIn.ts`](apps/integrator/src/integrations/telegram/mapIn.ts): `rem_bot_off:` → `{ action: 'rem_bot_off', reminderOccurrenceId }` (MAX тот же нормализатор).
- [`executeAction.ts`](apps/integrator/src/kernel/domain/executor/executeAction.ts): тип **`reminders.messengerTopic.disable.callback`** (или близкое имя).
- [`handlers/reminders.ts`](apps/integrator/src/kernel/domain/executor/handlers/reminders.ts): владелец occurrence → `RemindersWebappWritesPort.postMessengerTopicDisable(...)` в [`remindersWritesPort.ts`](apps/integrator/src/infra/adapters/remindersWritesPort.ts) + [`ports.ts`](apps/integrator/src/kernel/contracts/ports.ts).
- Ответ: `message.edit` с шаблоном (`reminder.botOff.*`) или сборка из полей JSON + **replyMarkup** с двумя кнопками:
  - **Настроить каналы уведомлений** — `web_app`/`url` на `/app/patient/profile#patient-profile-notifications` (см. [`ProfileNotificationsSection`](apps/webapp/src/app/app/patient/profile/ProfileNotificationsSection.tsx)).
  - **Установить мобильное приложение** — второй signed URL с другим `next=`.
- Расширить [`buildReminderCallbackAckIntents`](apps/integrator/src/kernel/domain/executor/handlers/reminders.ts): опционально передать **непустой** `replyMarkup` вместо принудительного `inline_keyboard: []`.

## Тесты и документация

- Integrator: [`reminderInlineKeyboard.test.ts`](apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.test.ts), [`mapIn.test.ts`](apps/integrator/src/integrations/telegram/mapIn.test.ts), [`executeAction.test.ts`](apps/integrator/src/kernel/domain/executor/executeAction.test.ts) — сценарии snooze 20, skip one-tap, `rem_bot_off` с моком webapp.
- Webapp: route test рядом с [`occurrences/skip/route.test.ts`](apps/webapp/src/app/api/integrator/reminders/occurrences/skip/route.test.ts) — кейсы с темой / без темы, идемпотентность, список каналов.
- [`apps/webapp/src/modules/reminders/reminders.md`](apps/webapp/src/modules/reminders/reminders.md): раздел «Бот» — новая клавиатура, отказ от `rem_done` на клавиатуре, `rem_bot_off`, поведение без `topicCode`.

## Definition of Done

- Диспатч напоминания показывает только согласованные пять рядов кнопок; лимит `callback_data` соблюдён.
- «Пропущу» одним нажатием; текст `reminder.skip.saved` обновлён (RU) в telegram и max templates + fallback.
- «Не напоминать в боте» при известной теме выключает только пару тема×мессенджер; при `topicCode === undefined` — безопасный MVP без широкого mute.
- Ответ бота содержит перечисление оставшихся каналов (или «не осталось»), рекомендацию про приложение и две кнопки deeplink.
- Документация и автотесты обновлены; затронутые пакеты проходят целевые тесты.

## Риски

- **64 байта** для всех новых `callback_data` — проверить байтами (`telegramCallbackDataUtf8Bytes`), не только длиной строки.
- Снятие **«Выполнить»** снижает способ быстро закрыть occurrence из бота — зафиксировано в доке.
- Сообщения со **старой** клавиатурой: `rem_done` / `rem_skip` с причинами должны продолжать обрабатываться существующими сценариями.

## Ссылка на смежный архив плана

- При необходимости сверки колбэков: [`.cursor/plans/archive/telegram_reminder_callback_fix_cf461c6a.plan.md`](.cursor/plans/archive/telegram_reminder_callback_fix_cf461c6a.plan.md).

## Примечание про копию плана в Cursor

Исходный черновик мог остаться в `~/.cursor/plans/`; **канон для репозитория** — этот файл: [`.cursor/plans/archive/reminder_bot_buttons_ux_2dc55692.plan.md`](.cursor/plans/archive/reminder_bot_buttons_ux_2dc55692.plan.md). После выполнения работ — обновить `todos` / `status` по [plan-authoring rule](.cursor/rules/plan-authoring-execution-standard.mdc).
