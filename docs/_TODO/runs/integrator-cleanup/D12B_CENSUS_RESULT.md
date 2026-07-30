## КОРОТКО

Канон классификации — [apps/webapp/ARCHITECTURE.md](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/ARCHITECTURE.md:53), объём — [WORK_ORDER.md](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:249).

- Достижимых типов действий: **30** = **5 КАНАЛ + 23 ПРОДУКТ + 2 спорных**.
- Загруженных сценариев: **131**; достижимых: **105** = **9 КАНАЛ + 73 ПРОДУКТ + 23 спорных**.
- Недостижимых веток старого `switch`, которые сносит D12: **10**.
- Дополнительно недостижимых сценариев контента: **26**.
- `domainActionRegistry` не является живым диспетчером: `executeStep()` не имеет runtime-вызывателя; его три регистрации отдельно не считаются.
- Дневник/ЛФК из коммита `249878ef9` не включены.

Подсчёты:

```bash
jq -s 'map(length) | add' \
  apps/integrator/src/content/{telegram,max}/{user,admin}/scripts.json \
  [redacted-token].json
# 131

jq -r '.[].steps[].action' \
  apps/integrator/src/content/{telegram,max}/{user,admin}/scripts.json \
  [redacted-token].json |
  sort -u | wc -l
# 33 raw action types; после исключения 26 недостижимых сценариев — 30

rg -n "case ['\"]" \
  [redacted-token].ts
# 38 case labels; трассировкой ранних handler sets подтверждены 10 перекрытых веток
```

## 1. Достижимые действия

Пути ниже относительны `apps/integrator/src/`.

| Действие → файл:строка | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `callback.answer` → `[redacted-token].ts:327` | КАНАЛ | Подтверждение provider callback | — |
| `message.send` → `[redacted-token].ts:152` | КАНАЛ | Рендер и отправка в выбранный канал | — |
| `message.edit` → `kernel/domain/executor/executeAction.ts:1226` | КАНАЛ | Provider-specific редактирование сообщения | — |
| `message.inlineKeyboard.show` → `kernel/domain/executor/executeAction.ts:1171` | КАНАЛ | Рендер inline-клавиатуры провайдера | — |
| `message.replyKeyboard.show` → `kernel/domain/executor/executeAction.ts:1170` | КАНАЛ | Рендер reply-клавиатуры провайдера | — |
| `conversation.admin.reply` → `executeAction.ts:1896`, `handlers/supportRelay.ts:347` | ПРОДУКТ | Решает состояние обращения, получателя и продуктовый текст | webapp support/messaging |
| `conversation.close` → `executeAction.ts:1900` | ПРОДУКТ | Меняет состояние обращения | webapp support |
| `conversation.listOpen` → `executeAction.ts:1938` | ПРОДУКТ | Выбирает и представляет открытые обращения | webapp support |
| `conversation.show` → `executeAction.ts:2152` | ПРОДУКТ | Формирует продуктовый экран обращения и доступные действия | webapp support |
| `draft.cancel` → `executeAction.ts:1572` | ПРОДУКТ | Управляет черновиком обращения | webapp support |
| `draft.replaceFromMessage` → `executeAction.ts:1531` | ПРОДУКТ | Меняет содержимое черновика обращения | webapp support |
| `draft.send` → `executeAction.ts:1606` | ПРОДУКТ | Создаёт/дополняет обращение и вопрос | webapp support |
| `draft.upsertFromMessage` → `executeAction.ts:1531` | ПРОДУКТ | Создаёт продуктовый черновик из сообщения | webapp support |
| `question.listUnanswered` → `executeAction.ts:2009` | ПРОДУКТ | Определяет набор неотвеченных вопросов | webapp support |
| `question.markAllUnansweredAnswered` → `executeAction.ts:2119` | ПРОДУКТ | Массово меняет состояние вопросов | webapp support |
| `reminders.planDue` → `handlers/reminders.ts:431` | ПРОДУКТ | Решает, какие occurrence запланировать | webapp reminders scheduler |
| `reminders.dispatchDue` → `handlers/reminders.ts:469` | ПРОДУКТ | Решает, какие напоминания пора поставить в доставку | webapp reminders |
| `reminders.snooze.callback` → `handlers/reminders.ts:961` | ПРОДУКТ | Перепланирует occurrence по выбору пациента | webapp reminders |
| `reminders.done.callback` → `handlers/reminders.ts:1375` | ПРОДУКТ | Меняет предметное состояние occurrence на выполненное | webapp reminders |
| `reminders.mute.callback` → `handlers/reminders.ts:1469` | ПРОДУКТ | Меняет продуктовую настройку напоминаний | webapp reminders |
| `reminders.skip.applyPreset` → `handlers/reminders.ts:1137` | ПРОДУКТ | Выбирает и сохраняет предметную причину пропуска | webapp reminders |
| `reminders.skip.applyFreeText` → `handlers/reminders.ts:1281` | ПРОДУКТ | Сохраняет продуктовую причину пропуска | webapp reminders |
| `reminders.snoozeMenu.callback` → `handlers/reminders.ts:1687` | ПРОДУКТ | Выбирает продуктовые варианты переноса | webapp reminders |
| `reminders.notifSettings.open.callback` → `handlers/reminders.ts:1756` | ПРОДУКТ | Читает и показывает настройки уведомлений пациента | webapp reminders/settings |
| `reminders.notifSettings.toggle.callback` → `handlers/reminders.ts:1840` | ПРОДУКТ | Меняет настройку уведомлений пациента | webapp reminders/settings |
| `user.phone.link` → `executeAction.ts:1435` | ПРОДУКТ | Связывает телефон, создаёт/сливает canonical identity и затрагивает trust | webapp auth/identity |
| `user.state.set` → `executeAction.ts:1409` | ПРОДУКТ | Хранит состояние продуктового сценария, а не состояние провайдера | webapp-команда соответствующего домена |
| `webapp.programNote.replyBegin` → `executeAction.ts:725` | ПРОДУКТ | Начинает ответ врача на элемент лечебной программы | webapp treatment-program/messaging |
| `webapp.channelLink.complete` → `executeAction.ts:822` | СПОРНО | Смешаны допустимая channel-link операция и синхронизация телефона/state | вопрос №1 ниже |
| `webapp.phoneMessengerBind.complete` → `executeAction.ts:465` | СПОРНО | Смешаны доставка login challenge и canonical account/phone decisions | вопрос №2 ниже |

Три raw-типа, исключённые из достижимых: `reminders.rules.get`, `reminders.rule.toggle`, `reminders.rule.cyclePreset`. Они встречаются только в недостижимой старой Telegram-панели напоминаний.

## 2. Достижимые сценарии

### Telegram user

| Сценарий → файл:строка | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `telegram.start.link` → `content/telegram/user/scripts.json:3` | СПОРНО | Signed link и identity sync смешаны | вопрос №1 |
| `telegram.start.phoneauth` → `:25` | СПОРНО | Запускает messenger-auth state и provider UI | вопрос №2 |
| `telegram.contact.phoneauth` → `:64` | СПОРНО | Завершает login/bind и синхронизирует identity | вопрос №2 |
| `telegram.phoneauth.cancel.linked` → `:90` | СПОРНО | Отменяет channel-auth state и возвращает меню | граница auth/channel |
| `telegram.phoneauth.cancel.unlinked` → `:133` | СПОРНО | Отменяет channel-auth state без canonical link | граница auth/channel |
| `telegram.phoneauth.cancel.text.linked` → `:174` | СПОРНО | Текстовая версия отмены auth-state | граница auth/channel |
| `telegram.phoneauth.cancel.text.unlinked` → `:217` | СПОРНО | Текстовая версия отмены auth-state | граница auth/channel |
| `telegram.start.setphone` → `:258` | СПОРНО | Deep link приводит к canonical phone link | вопрос №2 |
| `telegram.start.noticeme` → `:303` | ПРОДУКТ | Выбирает notification onboarding state и текст | webapp onboarding/settings |
| `telegram.start.onboarding` → `:341` | ПРОДУКТ | Решает onboarding для непривязанного пользователя | webapp onboarding |
| `telegram.start` → `:392` | ПРОДУКТ | Выбирает продуктовый стартовый экран/меню | webapp onboarding/navigation |
| `telegram.debug.show_my_id` → `:440` | КАНАЛ | Техническая channel-level команда | — |
| `telegram.ask.question` → `:556` | ПРОДУКТ | Создаёт черновик обращения | webapp support |
| `telegram.draft.replace` → `:619` | ПРОДУКТ | Меняет черновик обращения | webapp support |
| `telegram.draft.send` → `:685` | ПРОДУКТ | Отправляет черновик в обращение | webapp support |
| `telegram.q_confirm.no` → `:738` | ПРОДУКТ | Отменяет продуктовый черновик | webapp support |
| `telegram.reminder.snooze` → `:791` | ПРОДУКТ | Переносит occurrence | webapp reminders |
| `telegram.reminder.done` → `:816` | ПРОДУКТ | Отмечает occurrence выполненным | webapp reminders |
| `telegram.reminder.mute` → `:840` | ПРОДУКТ | Меняет настройки напоминаний | webapp reminders |
| `telegram.reminder.botOff` → `:865` | ПРОДУКТ | Открывает продуктовые настройки уведомлений | webapp reminders/settings |
| `telegram.reminder.skip.open` → `:889` | ПРОДУКТ | Выбирает причину пропуска | webapp reminders |
| `telegram.reminder.skip.preset` → `:914` | ПРОДУКТ | Применяет предметную причину пропуска | webapp reminders |
| `telegram.reminder.skip.freeText` → `:939` | ПРОДУКТ | Сохраняет свободную причину пропуска | webapp reminders |
| `telegram.reminder.snoozeMenu` → `:990` | ПРОДУКТ | Показывает варианты переноса | webapp reminders |
| `telegram.reminder.notifSettings.open` → `:1014` | ПРОДУКТ | Показывает настройки пациента | webapp reminders/settings |
| `telegram.reminder.notifSettings.toggle` → `:1038` | ПРОДУКТ | Меняет настройки пациента | webapp reminders/settings |
| `telegram.booking.open` → `:1062` | ПРОДУКТ | Выбирает booking UI и продуктовый текст | webapp booking |
| `telegram.booking.menu` → `:1171` | ПРОДУКТ | Формирует меню записи и его состояние | webapp booking |
| `telegram.contact.link.confirm` → `:1447` | СПОРНО | Provider contact превращается в canonical phone link | вопрос №2 |
| `telegram.contact.link.cancel` → `:1494` | СПОРНО | Сбрасывает identity-link state | граница auth/channel |
| `telegram.contact.link.remind` → `:1535` | СПОРНО | Продолжает identity-link handshake | граница auth/channel |
| `telegram.more.menu` → `:1701` | КАНАЛ | Отдаёт уже готовую ссылку входа в webapp | — |
| `telegram.cabinet.open` → `:1762` | КАНАЛ | Отдаёт ссылку входа в кабинет | — |
| `telegram.cabinet.open.callback` → `:1428` | КАНАЛ | Достижим Telegram callback с `input.action=cabinet.open` при `linkedPhone=true`; переведён из ошибочно помеченных недостижимых в живые | — |
| `telegram.bookings.show` → `:2275` | ПРОДУКТ | Показывает продуктовые данные записей | webapp booking |
| `telegram.info.prepare` → `:2380` | ПРОДУКТ | Показывает продуктовые инструкции к записи | webapp booking |
| `telegram.info.address` → `:2417` | ПРОДУКТ | Показывает адрес/данные записи | webapp booking |
| `telegram.menu.default` → `:2483` | ПРОДУКТ | Любой unmatched текст превращает в support draft | webapp support |

### Telegram admin

| Сценарий → файл:строка | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `telegram.admin.start` → `content/telegram/admin/scripts.json:3` | ПРОДУКТ | Выбирает admin help/menu copy | webapp doctor/admin |
| `telegram.admin.debug.show_my_id` → `:24` | КАНАЛ | Техническая channel-level команда | — |
| `telegram.admin.stats.bookings` → `:48` | ПРОДУКТ | Показывает продуктовую booking-статистику | webapp doctor analytics |
| `telegram.admin.stats.users` → `:79` | ПРОДУКТ | Показывает продуктовую user-статистику | webapp doctor analytics |
| `telegram.admin.questions.unanswered` → `:111` | ПРОДУКТ | Выбирает неотвеченные обращения | webapp support |
| `telegram.admin.questions.mark_all_answered` → `:130` | ПРОДУКТ | Массово меняет состояние вопросов | webapp support |
| `telegram.admin.dialogs.open` → `:165` | ПРОДУКТ | Показывает открытые обращения | webapp support |
| `telegram.admin.dialogs.view` → `:185` | ПРОДУКТ | Показывает состояние обращения | webapp support |
| `telegram.admin.reply.start` → `:211` | ПРОДУКТ | Начинает продуктовый reply-mode | webapp support |
| `telegram.admin.reply.continue` → `:247` | ПРОДУКТ | Продолжает reply-mode | webapp support |
| `telegram.admin.reply.message` → `:283` | ПРОДУКТ | Добавляет ответ и меняет состояние обращения | webapp support |
| `telegram.admin.dialog.close` → `:313` | ПРОДУКТ | Закрывает обращение | webapp support |
| `telegram.admin.start.link` → `:347` | СПОРНО | Signed link и canonical identity sync смешаны | вопрос №1 |
| `telegram.admin.programNote.reply.start` → `:368` | ПРОДУКТ | Начинает ответ на комментарий программы | webapp treatment-program/messaging |
| `telegram.admin.message.unmatched` → `:403` | ПРОДУКТ | Выбирает fallback product copy | webapp doctor/admin |

### MAX user

| Сценарий → файл:строка | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `max.contact.phone.link` → `content/max/user/scripts.json:3` | СПОРНО | Provider contact становится canonical phone link | вопрос №2 |
| `max.start.link` → `:42` | СПОРНО | Signed link и identity sync смешаны | вопрос №1 |
| `max.start.phoneauth` → `:64` | СПОРНО | Запускает messenger-auth state | вопрос №2 |
| `max.contact.phoneauth` → `:107` | СПОРНО | Завершает login/bind и identity sync | вопрос №2 |
| `max.contact.link.confirm` → `:133` | СПОРНО | Подтверждает canonical phone link | вопрос №2 |
| `max.contact.link.cancel` → `:178` | СПОРНО | Сбрасывает identity-link state | граница auth/channel |
| `max.contact.link.remind` → `:224` | СПОРНО | Продолжает identity-link handshake | граница auth/channel |
| `max.phoneauth.cancel.linked` → `:262` | СПОРНО | Отменяет auth-state связанного пользователя | граница auth/channel |
| `max.phoneauth.cancel.unlinked` → `:302` | СПОРНО | Отменяет auth-state несвязанного пользователя | граница auth/channel |
| `max.phoneauth.cancel.text.linked` → `:343` | СПОРНО | Текстовая отмена auth-state | граница auth/channel |
| `max.phoneauth.cancel.text.unlinked` → `:383` | СПОРНО | Текстовая отмена auth-state | граница auth/channel |
| `max.start.onboarding` → `:424` | ПРОДУКТ | Выбирает onboarding для непривязанного пользователя | webapp onboarding |
| `max.start` → `:479` | ПРОДУКТ | Выбирает продуктовый стартовый экран | webapp onboarding/navigation |
| `max.nav.webapp.menu` → `:524` | КАНАЛ | Отдаёт готовую ссылку входа | — |
| `max.nav.webapp.menu.need_phone` → `:562` | ПРОДУКТ | Решает, что для входа требуется phone-link | webapp auth/onboarding |
| `max.booking.open` → `:608` | ПРОДУКТ | Выбирает booking UI и текст | webapp booking |
| `max.booking.menu` → `:762` | ПРОДУКТ | Формирует меню записи | webapp booking |
| `max.booking.open.callback` → `:874` | ПРОДУКТ | Callback открывает продуктовый booking flow | webapp booking |
| `max.bookings.show` → `:1039` | ПРОДУКТ | Показывает продуктовые данные записей | webapp booking |
| `max.info.prepare` → `:1205` | ПРОДУКТ | Показывает инструкции к записи | webapp booking |
| `max.info.address` → `:1246` | ПРОДУКТ | Показывает адрес/данные записи | webapp booking |
| `max.debug.show_my_id` → `:1287` | КАНАЛ | Техническая channel-level команда | — |
| `max.more.menu` → `:1363` | КАНАЛ | Отдаёт готовую ссылку входа | — |
| `max.draft.replace` → `:1457` | ПРОДУКТ | Меняет support draft | webapp support |
| `max.draft.send` → `:1523` | ПРОДУКТ | Отправляет draft в обращение | webapp support |
| `max.q_confirm.no` → `:1576` | ПРОДУКТ | Отменяет support draft | webapp support |
| `max.reminder.snooze` → `:1629` | ПРОДУКТ | Переносит occurrence | webapp reminders |
| `max.reminder.done` → `:1654` | ПРОДУКТ | Отмечает occurrence выполненным | webapp reminders |
| `max.reminder.mute` → `:1678` | ПРОДУКТ | Меняет настройки напоминаний | webapp reminders |
| `max.reminder.botOff` → `:1703` | ПРОДУКТ | Открывает настройки уведомлений | webapp reminders/settings |
| `max.reminder.skip.open` → `:1727` | ПРОДУКТ | Выбирает причину пропуска | webapp reminders |
| `max.reminder.skip.preset` → `:1752` | ПРОДУКТ | Применяет причину пропуска | webapp reminders |
| `max.reminder.skip.freeText` → `:1777` | ПРОДУКТ | Сохраняет свободную причину пропуска | webapp reminders |
| `max.reminder.snoozeMenu` → `:1820` | ПРОДУКТ | Показывает варианты переноса | webapp reminders |
| `max.reminder.notifSettings.open` → `:1844` | ПРОДУКТ | Показывает настройки пациента | webapp reminders/settings |
| `max.reminder.notifSettings.toggle` → `:1868` | ПРОДУКТ | Меняет настройки пациента | webapp reminders/settings |
| `max.default` → `:1892` | ПРОДУКТ | Unmatched текст превращает в support draft | webapp support |

### MAX admin и scheduler

| Сценарий → файл:строка | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `max.admin.start` → `content/max/admin/scripts.json:3` | ПРОДУКТ | Выбирает admin help/menu copy | webapp doctor/admin |
| `max.admin.debug.show_my_id` → `:24` | КАНАЛ | Техническая channel-level команда | — |
| `max.admin.stats.bookings` → `:48` | ПРОДУКТ | Booking-статистика | webapp doctor analytics |
| `max.admin.stats.users` → `:79` | ПРОДУКТ | User-статистика | webapp doctor analytics |
| `max.admin.questions.unanswered` → `:111` | ПРОДУКТ | Выбирает неотвеченные обращения | webapp support |
| `max.admin.questions.mark_all_answered` → `:130` | ПРОДУКТ | Меняет состояние вопросов | webapp support |
| `max.admin.dialogs.open` → `:165` | ПРОДУКТ | Показывает открытые обращения | webapp support |
| `max.admin.dialogs.view` → `:185` | ПРОДУКТ | Показывает состояние обращения | webapp support |
| `max.admin.reply.start` → `:211` | ПРОДУКТ | Начинает reply-mode | webapp support |
| `max.admin.reply.continue` → `:247` | ПРОДУКТ | Продолжает reply-mode | webapp support |
| `max.admin.reply.message` → `:283` | ПРОДУКТ | Добавляет ответ в обращение | webapp support |
| `max.admin.dialog.close` → `:313` | ПРОДУКТ | Закрывает обращение | webapp support |
| `max.admin.programNote.reply.start` → `:347` | ПРОДУКТ | Начинает ответ на комментарий программы | webapp treatment-program/messaging |
| `max.admin.message.unmatched` → `:382` | ПРОДУКТ | Выбирает fallback product copy | webapp doctor/admin |
| `scheduler.tick.reminders` → `content/scheduler/scripts.json:3` | ПРОДУКТ | Сам решает, что планировать и отправлять сейчас | webapp reminders scheduler |

## 3. Недостижимые

### 3.1. Ровно десять веток старого `switch`, которые сносит D12

Ранние диспетчеры находятся в `executeAction.ts:387-390`.

| Старая ветка | Перехватчик |
|---|---|
| `booking.event.insert` → `executeAction.ts:1099` | `BOOKING_TYPES` `:79` → `handleBooking` `:387`; реализация `handlers/booking.ts:10` |
| `notifications.get` → `executeAction.ts:2220` | `NOTIFICATION_TYPES` `:80` → `handleNotifications` `:388`; реализация `handlers/notifications.ts:15` |
| `notifications.toggle` → `executeAction.ts:2237` | тот же перехватчик; реализация `handlers/notifications.ts:34` |
| `reminders.rules.get` → `executeAction.ts:2292` | `REMINDER_TYPES` `:81-97` → `handleReminders` `:389`; реализация `handlers/reminders.ts:245` |
| `reminders.rule.toggle` → `executeAction.ts:2327` | тот же перехватчик; реализация `handlers/reminders.ts:275` |
| `reminders.rule.cyclePreset` → `executeAction.ts:2396` | тот же перехватчик; реализация `handlers/reminders.ts:352` |
| `callback.answer` → `executeAction.ts:1287` | `DELIVERY_TYPES` `:99-105` → `handleDelivery` `:390`; реализация `handlers/delivery.ts:327` |
| `message.deliver` → `executeAction.ts:1301` | тот же перехватчик; реализация `handlers/delivery.ts:348` |
| `message.retry.enqueue` → `executeAction.ts:1351` | тот же перехватчик; реализация `handlers/delivery.ts:395` |
| `intent.enqueueDelivery` → `executeAction.ts:1388` | тот же перехватчик; реализация `handlers/delivery.ts:436` |

### 3.2. Дополнительно 26 недостижимых сценариев контента

Глобальные ворота выполняются до content matching: message gate — `orchestrator/resolver.ts:291,462-463`, callback gate — `:378,465-466`.

- `telegram.booking.open.fallback` → `telegram/user/scripts.json:1275` — unlinked перехватывает message gate; linked проигрывает более специфичному `telegram.booking.open`.
- `telegram.contact.link.request.booking` → `:1313` — unlinked `booking.open` перехватывает message gate.
- `telegram.menu.more.need_phone` → `:1568` — unlinked `menu.more` перехватывает message gate.
- `telegram.cabinet.open.need_phone` → `:1610` — unlinked `cabinet.open` перехватывает message gate.
- `max.booking.open.need_phone` → `max/user/scripts.json:717` — перехватывает message gate.
- `max.menu.more.need_phone` → `:1317` — перехватывает message gate.
- `telegram.contact.link.request.bookings` → `telegram/user/scripts.json:1354` — любой unlinked callback перехватывает callback gate.
- `telegram.contact.link.request.bookings.fallback` → `:1402` — unlinked перехватывает gate; linked проигрывает `telegram.bookings.show`.
- `telegram.cabinet.open.callback.need_phone` → `:1652` — перехватывает callback gate.
- `max.booking.open.callback.need_phone` → `max/user/scripts.json:986` — перехватывает callback gate.
- `max.bookings.show.need_phone` → `:1152` — перехватывает callback gate.
- `telegram.ask.need_phone` → `telegram/user/scripts.json:470` — текущего производителя `question.ask` нет.
- `telegram.ask` → `:515` — текущего производителя `question.ask` нет.
- `telegram.reminders.dashboard` → `:1831` — текущего меню/callback с `reminders.dashboard` нет.
- `telegram.reminders.toggle.exercise` → `:1925` — кнопка существует только внутри недостижимого dashboard.
- `telegram.reminders.toggle.warmup` → `:1960` — то же.
- `telegram.reminders.toggle.water` → `:1995` — то же.
- `telegram.reminders.toggle.breathing` → `:2030` — то же.
- `telegram.reminders.toggle.supplements_medication` → `:2065` — то же.
- `telegram.reminders.cycle.exercise` → `:2100` — то же.
- `telegram.reminders.cycle.warmup` → `:2135` — то же.
- `telegram.reminders.cycle.water` → `:2170` — то же.
- `telegram.reminders.cycle.breathing` → `:2205` — то же.
- `telegram.reminders.cycle.supplements_medication` → `:2240` — то же.
- `telegram.menu.back` → `:2454` — единственный текущий producer находится внутри недостижимого dashboard.
- `max.menu.back` → `max/user/scripts.json:1424` — текущего producer `menu.back` нет.

Дополнительные handler-only типы без сценарного диспетчера: `reminders.skip.reasonPrompt` (`handlers/reminders.ts:1054`) и `reminders.messengerTopic.disable.callback` (`:1565`).

Реестр `kernel/domain/actions/index.ts:83-87` регистрирует `event.log`, `message.retry.enqueue`, `message.send`, но его единственная точка исполнения `kernel/domain/index.ts:46` не импортируется runtime-кодом. Живой `message.send` идёт через `executeAction`, не через этот registry.

## 4. Спорные — вопросы

1. `webapp.channelLink.complete`: разрешённое целевой схемой «опознание по внешнему ID + signed entry link» включает только проверку/погашение token и техническую channel binding, или также текущие `user.phone.link`/`user.state.set` записи из `executeAction.ts:893-919`?

2. `webapp.phoneMessengerBind.complete`: должна ли в интеграторе остаться только доставка login challenge/provider UX, а `accountCreated`, phone trust и синхронизация identity из `executeAction.ts:552-720` считаться webapp-продуктом?

Эти два вопроса порождают 23 спорных сценария identity/auth, перечисленных в таблицах выше.

## 5. Чего не смог установить

- Наличие у пользователей старых Telegram/MAX-сообщений с уже выданными кнопками. Поэтому 26 сценариев недостижимы из текущего source-generated маршрута, но историческая кнопка у провайдера теоретически может вызвать часть старых callback.
- Реальную частоту использования сценариев и состояние очередей/БД: DEV/TEST/PROD и базы не читались.
- Включён ли Telegram webhook или long polling в конкретном runtime. Оба приходят в тот же pipeline, поэтому статическую классификацию это не меняет.
- Гарантированно ли заполнены все `facts.links.*` в каждом runtime-контексте; код содержит условные ветки link/fallback.
- Границу двух спорных identity-действий — по коду она смешанная, а самостоятельно решать её mission запрещает.

Read-only соблюдён: тесты, CI, миграции, deploy и БД не запускались; файлы не менялись. В рабочем дереве до начала уже были изменения только в env-example файлах, их я не трогал.
