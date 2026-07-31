# D12b — перепись ДОСТИЖИМЫХ сценариев исполнителя интегратора

Состояние после D12/D13a/D13b/D14. Единственная действующая перепись достижимых сценариев: объём для D3–D8,
D21–D25 берётся отсюда.

## КОРОТКО

- Достижимых сценариев контента: **105** (38 telegram/user + 15 telegram/admin + 37 max/user + 14 max/admin + 1
  scheduler). Совпадает с арифметикой `bf45f5853`: 131 − 26 = 105.
- Достижимых типов действий (используются хотя бы одним живым сценарием): **30**.
- Всего точек диспетчеризации в исполнителе (case-метки `switch` + записи в `BOOKING_TYPES`/`NOTIFICATION_TYPES`/
  `REMINDER_TYPES`/`DELIVERY_TYPES`): **51** (28 case-меток + 23 записи наборов).
- Недостижимых типов действий, обнаруженных заново (51 − 30): **21** — это НЕ то же самое расхождение, что резал
  `bf45f5853` (тот резал ветки, перехваченные более ранним диспетчером внутри одного `switch`); здесь считается
  «нет продюсера действия нигде в репозитории».
- Классификация 105 достижимых сценариев: **30 КАНАЛ, 62 ПРОДУКТ, 13 СПОРНО**, 0 «уже переехавших» на уровне
  сценария (миграция произошла внутри реализации типов действий, не сценариев).
- Классификация 30 достижимых типов действий: **14 КАНАЛ, 8 ПРОДУКТ, 4 УЖЕ ПЕРЕЕХАЛО, 4 СПОРНО/гибрид**.
- `domainActionRegistry`/`executeStep` (`kernel/domain/actions/index.ts:83-87`, `kernel/domain/index.ts:43-53`) —
  подтверждено повторно: мёртвый код, нет runtime-вызывателя.

Команды:

```bash
jq -s 'map(length) | add' \
  apps/integrator/src/content/{telegram,max}/{user,admin}/scripts.json \
  apps/integrator/src/content/scheduler/scripts.json
# 105

jq -r '.[].steps[]?.action // empty' \
  apps/integrator/src/content/{telegram,max}/{user,admin}/scripts.json \
  apps/integrator/src/content/scheduler/scripts.json | sort -u | wc -l
# 30

grep -n "^\s*case '" apps/integrator/src/kernel/domain/executor/executeAction.ts | wc -l
# 28

grep -n "BOOKING_TYPES\|NOTIFICATION_TYPES\|REMINDER_TYPES\|DELIVERY_TYPES" \
  apps/integrator/src/kernel/domain/executor/executeAction.ts
# BOOKING_TYPES=1, NOTIFICATION_TYPES=2, REMINDER_TYPES=15, DELIVERY_TYPES=5 → 23 записи

git show --stat bf45f5853 -1
# -1605 строк: telegram/user/scripts.json -1090, max/user/scripts.json -240, executeAction.ts -388
```

Для каждого недостижимого типа проверялось `rg -n "type:\s*['\"]<тип>['\"]" apps/ --type ts -g '!*.test.ts'` и
`rg`/`jq` по всем 5 JSON контента — совпадал только сам case/набор-определение, ни одного продюсера. Команды по
каждому типу не дублируются построчно ниже — паттерн один и тот же (см. таблицу §3, столбец «причина»).

## Важная поправка к пункту 2 брифа (учёт уже сделанного)

D13a/D13b/D14 переместили решения **не в этом наборе действий**, а в файле вне заявленного объёма census —
`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts` (планирование напоминаний о записи на
приём читает план из события, константы 24ч/2ч вырезаны, коммит `4bb9f240d`; шесть решений жизненного цикла записи
из D14 — коммиты `08bd04767`, `094aebfea`, `0f9561014`, `04082b4a6` и часть 5). Это — отдельная подсистема
«booking lifecycle reminders» (запись на приём), обслуживаемая вебхук-роутом, а НЕ через `executeAction`.

Единственная точка пересечения с объектом этой переписи — `booking.event.insert` (`BOOKING_TYPES` →
`handlers/booking.ts:9-25`): тело хендлера сейчас **не делает ничего, кроме записи `event.log`**. Это прямое
подтверждение, что миграция D14 состоялась (раньше сюда стекались решения о напоминаниях/пуше/тексте/уведомлении
врача/календаре) — тип помечен **УЖЕ ПЕРЕЕХАЛО**. Сам тип действия при этом недостижим (см. §3): реальный путь
жизненного цикла записи теперь идёт вебапп → `bookingM2mApi.ts` напрямую в `bookingLifecycleRoute.ts`, минуя этот
Action.

Подсистема `handlers/reminders.ts` («wellness/self-care» напоминания: `reminders.planDue`, `.dispatchDue`,
`.snooze.callback`, `.done.callback`, `.mute.callback`, `.skip.*`, `.notifSettings.*`) — **другая, отдельная от
booking-lifecycle подсистема**. D13a/D13b/D14 её не касались: собственный код планирования (`policy.ts`) и
собственные вычисления (`plannedUntil`, `mutedUntilIso`, таксономия причин пропуска) остаются в интеграторе. Три
из них частично делегированы отдельным портом `remindersWebappWritesPort` (см. §2, УЖЕ ПЕРЕЕХАЛО/СПОРНО ниже) — это
самостоятельная, более ранняя и более узкая делегация, не относящаяся к D13/D14.

## §1. Достижимые типы действий (30)

Пути относительно `apps/integrator/src/`.

| Действие → файл:строка | Класс | Почему | Куда уезжает / что уже уехало |
|---|---|---|---|
| `callback.answer` → `handlers/delivery.ts:327` | КАНАЛ | Ack provider callback | — |
| `message.send` → `handlers/delivery.ts:152` | КАНАЛ | Резолв получателя (fan-out по phone→channel), рендер, отправка | — |
| `message.edit` → `executeAction.ts:1198` | КАНАЛ | Provider-рендер редактирования сообщения | — |
| `message.replyKeyboard.show` → `executeAction.ts:1142` | КАНАЛ | Рендер reply-клавиатуры | — |
| `message.inlineKeyboard.show` → `executeAction.ts:1143` | КАНАЛ | Рендер inline-клавиатуры | — |
| `user.state.set` → `executeAction.ts:1268` | ПРОДУКТ | Хранит состояние продуктового сценария (диалог/onboarding/auth), не состояние провайдера | webapp-домен соответствующего сценария |
| `user.phone.link` → `executeAction.ts:1294` | ПРОДУКТ | Canonical identity, слияние/конфликт trust | webapp identity |
| `webapp.channelLink.complete` → `executeAction.ts:811` | СПОРНО | Смешаны token-верификация (КАНАЛ) и запись `user.phone.link`/`user.state.set` на success-пути `:882-913` (ПРОДУКТ) | вопрос №1 |
| `webapp.phoneMessengerBind.complete` → `executeAction.ts:454` | СПОРНО | Смешаны доставка login challenge (КАНАЛ) и `accountCreated`/phone-trust/identity-sync `:541-600` (ПРОДУКТ) | вопрос №2 |
| `webapp.programNote.replyBegin` → `executeAction.ts:714` | ПРОДУКТ | Начинает ответ врача на элемент лечебной программы, продуктовое состояние | webapp treatment-program/messaging |
| `draft.upsertFromMessage` → `executeAction.ts:1390` | ПРОДУКТ | Создаёт черновик обращения | webapp support |
| `draft.replaceFromMessage` → `executeAction.ts:1391` | ПРОДУКТ | Меняет содержимое черновика | webapp support |
| `draft.cancel` → `executeAction.ts:1431` | ПРОДУКТ | Отменяет черновик обращения | webapp support |
| `draft.send` → `executeAction.ts:1465` | ПРОДУКТ | Создаёт/дополняет обращение и вопрос, решает состояние | webapp support |
| `conversation.admin.reply` → `executeAction.ts:1755` → `handlers/supportRelay.ts:347` | ПРОДУКТ, частично уже переехало | webapp-platform ветка `:386-492` уже полностью делегирует применение ответа в вебапп; legacy-ветка `:494-670` ещё сама владеет состоянием | webapp support (webapp-платформенная ветка); legacy — **D23** |
| `conversation.close` → `executeAction.ts:1759` | ПРОДУКТ | Меняет состояние обращения | webapp support |
| `conversation.listOpen` → `executeAction.ts:1797` | ПРОДУКТ | Выбирает и представляет открытые обращения | webapp support |
| `conversation.show` → `executeAction.ts:2011` | ПРОДУКТ | Формирует продуктовый экран обращения и доступные действия | webapp support |
| `question.listUnanswered` → `executeAction.ts:1868` | ПРОДУКТ | Определяет набор неотвеченных вопросов | webapp support |
| `question.markAllUnansweredAnswered` → `executeAction.ts:1978` | ПРОДУКТ | Массово меняет состояние вопросов | webapp support |
| `reminders.planDue` → `handlers/reminders.ts:431` | ПРОДУКТ | Считает due-occurrences по локально хранимому wellness-правилу (`policy.ts`) | webapp reminders (см. вопрос №4) |
| `reminders.dispatchDue` → `handlers/reminders.ts:469` | СПОРНО, гибрид | push/email routing уже делегирован `webappEventsPort.notifyPatientReminderChannels`; title-resolution, deep-link target и messenger-канал ещё считает интегратор | вопрос №5 |
| `reminders.snooze.callback` → `handlers/reminders.ts:961` | СПОРНО, частично уже переехало | Локально считает `plannedUntil`, но при наличии `remindersWebappWritesPort` ответ вебаппа перезаписывает локальное значение | вопрос №6 |
| `reminders.done.callback` → `handlers/reminders.ts:1375` | УЖЕ ПЕРЕЕХАЛО | Требует `remindersWebappWritesPort` без fallback; факт «день выполнен» решает вебапп, интегратор только рендерит | webapp reminders |
| `reminders.mute.callback` → `handlers/reminders.ts:1469` | СПОРНО | В отличие от snooze, сам считает авторитетный `mutedUntilIso` (tz-aware), только пушит в вебапп без read-back | вопрос №7 |
| `reminders.skip.applyPreset` → `handlers/reminders.ts:1137` | СПОРНО | Причина постится через `remindersWebappWritesPort.postOccurrenceSkip`, но таксономия причин и русский текст (`SKIP_PRESET_REASON`, `:209-214`) захардкожены в интеграторе | вопрос №8 |
| `reminders.skip.applyFreeText` → `handlers/reminders.ts:1281` | ПРОДУКТ, делегировано | Свободный текст причины постится в вебапп; локальное состояние `waiting_skip_reason` держит интегратор | webapp reminders |
| `reminders.snoozeMenu.callback` → `handlers/reminders.ts:1687` | КАНАЛ | Рендер меню переноса (текст промпта захардкожен — минорная утечка копии, не меняет класс) | — |
| `reminders.notifSettings.open.callback` → `handlers/reminders.ts:1756` | УЖЕ ПЕРЕЕХАЛО | Данные полностью из `remindersWebappWritesPort.getNotificationSettings` | webapp reminders/settings |
| `reminders.notifSettings.toggle.callback` → `handlers/reminders.ts:1840` | УЖЕ ПЕРЕЕХАЛО | `toggleNotificationTopic` полностью на стороне вебаппа | webapp reminders/settings |

Итог: 14 КАНАЛ, 8 ПРОДУКТ (не считая гибридных строк ниже), 4 УЖЕ ПЕРЕЕХАЛО, 4 СПОРНО.

## §2. Достижимые сценарии контента (105)

Классификация сценария наследует класс своего конечного действия (см. §1), кроме случаев, когда сам сценарий
дополнительно принимает решение (выбор текста/меню/состояния) — тогда это ПРОДУКТ независимо от класса действия,
согласно правилу плана («тексты уведомлений как продуктовые данные», «выбор организации»).

### Telegram user (38)

| Сценарий | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `telegram.start.link` | СПОРНО | Signed link + identity sync смешаны | вопрос №1 |
| `telegram.start.phoneauth` | СПОРНО | Запускает messenger-auth state | вопрос №2 |
| `telegram.contact.phoneauth` | СПОРНО | Завершает login/bind + identity sync | вопрос №2 |
| `telegram.phoneauth.cancel.linked` | СПОРНО | Отменяет auth-state связанного пользователя | граница auth/channel |
| `telegram.phoneauth.cancel.unlinked` | СПОРНО | Отменяет auth-state несвязанного | граница auth/channel |
| `telegram.phoneauth.cancel.text.linked` | СПОРНО | Текстовая версия отмены | граница auth/channel |
| `telegram.phoneauth.cancel.text.unlinked` | СПОРНО | Текстовая версия отмены | граница auth/channel |
| `telegram.start.setphone` | СПОРНО | Deep link → canonical phone link | вопрос №2 |
| `telegram.start.noticeme` | ПРОДУКТ | Выбирает notification onboarding текст | webapp onboarding/settings |
| `telegram.start.onboarding` | ПРОДУКТ | Onboarding для непривязанного | webapp onboarding |
| `telegram.start` | ПРОДУКТ | Выбирает стартовый экран/меню | webapp onboarding/navigation |
| `telegram.debug.show_my_id` | КАНАЛ | Техническая channel-команда | — |
| `telegram.ask.question` | ПРОДУКТ | Создаёт черновик обращения | webapp support |
| `telegram.draft.replace` | ПРОДУКТ | Меняет черновик | webapp support |
| `telegram.draft.send` | ПРОДУКТ | Отправляет черновик в обращение | webapp support |
| `telegram.q_confirm.no` | ПРОДУКТ | Отменяет черновик | webapp support |
| `telegram.reminder.snooze` | СПОРНО, частично уже переехало | см. `reminders.snooze.callback` | вопрос №6 |
| `telegram.reminder.done` | УЖЕ ПЕРЕЕХАЛО | см. `reminders.done.callback` | webapp reminders |
| `telegram.reminder.mute` | СПОРНО | см. `reminders.mute.callback` | вопрос №7 |
| `telegram.reminder.botOff` | УЖЕ ПЕРЕЕХАЛО | открывает `reminders.notifSettings.open.callback` | webapp reminders/settings |
| `telegram.reminder.skip.open` | КАНАЛ | Рендер меню (само действие — снузменю) | — |
| `telegram.reminder.skip.preset` | СПОРНО | см. `reminders.skip.applyPreset` | вопрос №8 |
| `telegram.reminder.skip.freeText` | ПРОДУКТ, делегировано | см. `reminders.skip.applyFreeText` | webapp reminders |
| `telegram.reminder.snoozeMenu` | КАНАЛ | см. `reminders.snoozeMenu.callback` | — |
| `telegram.reminder.notifSettings.open` | УЖЕ ПЕРЕЕХАЛО | см. `reminders.notifSettings.open.callback` | webapp reminders/settings |
| `telegram.reminder.notifSettings.toggle` | УЖЕ ПЕРЕЕХАЛО | см. `reminders.notifSettings.toggle.callback` | webapp reminders/settings |
| `telegram.booking.open` | ПРОДУКТ | Booking UI и продуктовый текст | webapp booking |
| `telegram.booking.menu` | ПРОДУКТ | Формирует меню записи и состояние | webapp booking |
| `telegram.contact.link.confirm` | СПОРНО | Provider contact → canonical phone link | вопрос №2 |
| `telegram.contact.link.cancel` | СПОРНО | Сбрасывает identity-link state | граница auth/channel |
| `telegram.contact.link.remind` | СПОРНО | Продолжает identity-link handshake | граница auth/channel |
| `telegram.more.menu` | КАНАЛ | Отдаёт готовую ссылку входа | — |
| `telegram.cabinet.open` | КАНАЛ | Отдаёт ссылку входа в кабинет | — |
| `telegram.cabinet.open.callback` | КАНАЛ | Callback `input.action=cabinet.open` при `linkedPhone=true` | — |
| `telegram.bookings.show` | ПРОДУКТ | Продуктовые данные записей | webapp booking |
| `telegram.info.prepare` | ПРОДУКТ | Продуктовые инструкции к записи | webapp booking |
| `telegram.info.address` | ПРОДУКТ | Адрес/данные записи | webapp booking |
| `telegram.menu.default` | ПРОДУКТ | Unmatched-текст → support draft | webapp support |

### Telegram admin (15)

| Сценарий | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `telegram.admin.start` | ПРОДУКТ | Admin help/menu copy | webapp doctor/admin |
| `telegram.admin.debug.show_my_id` | КАНАЛ | Техническая команда | — |
| `telegram.admin.stats.bookings` | ПРОДУКТ | Booking-статистика | webapp doctor analytics |
| `telegram.admin.stats.users` | ПРОДУКТ | User-статистика | webapp doctor analytics |
| `telegram.admin.questions.unanswered` | ПРОДУКТ | Неотвеченные обращения | webapp support |
| `telegram.admin.questions.mark_all_answered` | ПРОДУКТ | Массовое изменение состояния | webapp support |
| `telegram.admin.dialogs.open` | ПРОДУКТ | Открытые обращения | webapp support |
| `telegram.admin.dialogs.view` | ПРОДУКТ | Состояние обращения | webapp support |
| `telegram.admin.reply.start` | ПРОДУКТ | Начинает reply-mode | webapp support |
| `telegram.admin.reply.continue` | ПРОДУКТ | Продолжает reply-mode | webapp support |
| `telegram.admin.reply.message` | ПРОДУКТ/частично уже переехало | см. `conversation.admin.reply` | webapp support / **D23** |
| `telegram.admin.dialog.close` | ПРОДУКТ | Закрывает обращение | webapp support |
| `telegram.admin.start.link` | СПОРНО | Signed link + identity sync | вопрос №1 |
| `telegram.admin.programNote.reply.start` | ПРОДУКТ | Ответ на комментарий программы | webapp treatment-program/messaging |
| `telegram.admin.message.unmatched` | ПРОДУКТ | Fallback product copy | webapp doctor/admin |

### MAX user (37)

| Сценарий | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `max.contact.phone.link` | СПОРНО | Provider contact → canonical phone link | вопрос №2 |
| `max.start.link` | СПОРНО | Signed link + identity sync | вопрос №1 |
| `max.start.phoneauth` | СПОРНО | Messenger-auth state | вопрос №2 |
| `max.contact.phoneauth` | СПОРНО | Login/bind + identity sync | вопрос №2 |
| `max.contact.link.confirm` | СПОРНО | Подтверждает canonical phone link | вопрос №2 |
| `max.contact.link.cancel` | СПОРНО | Сбрасывает identity-link state | граница auth/channel |
| `max.contact.link.remind` | СПОРНО | Продолжает identity-link handshake | граница auth/channel |
| `max.phoneauth.cancel.linked` | СПОРНО | Отменяет auth-state | граница auth/channel |
| `max.phoneauth.cancel.unlinked` | СПОРНО | Отменяет auth-state | граница auth/channel |
| `max.phoneauth.cancel.text.linked` | СПОРНО | Текстовая отмена | граница auth/channel |
| `max.phoneauth.cancel.text.unlinked` | СПОРНО | Текстовая отмена | граница auth/channel |
| `max.start.onboarding` | ПРОДУКТ | Onboarding для непривязанного | webapp onboarding |
| `max.start` | ПРОДУКТ | Стартовый экран | webapp onboarding/navigation |
| `max.nav.webapp.menu` | КАНАЛ | Готовая ссылка входа | — |
| `max.nav.webapp.menu.need_phone` | ПРОДУКТ | Решает, что нужен phone-link | webapp auth/onboarding |
| `max.booking.open` | ПРОДУКТ | Booking UI и текст | webapp booking |
| `max.booking.menu` | ПРОДУКТ | Формирует меню записи | webapp booking |
| `max.booking.open.callback` | ПРОДУКТ | Callback открывает booking flow | webapp booking |
| `max.bookings.show` | ПРОДУКТ | Продуктовые данные записей | webapp booking |
| `max.info.prepare` | ПРОДУКТ | Инструкции к записи | webapp booking |
| `max.info.address` | ПРОДУКТ | Адрес/данные записи | webapp booking |
| `max.debug.show_my_id` | КАНАЛ | Техническая команда | — |
| `max.more.menu` | КАНАЛ | Готовая ссылка входа | — |
| `max.draft.replace` | ПРОДУКТ | Меняет support draft | webapp support |
| `max.draft.send` | ПРОДУКТ | Отправляет draft в обращение | webapp support |
| `max.q_confirm.no` | ПРОДУКТ | Отменяет draft | webapp support |
| `max.reminder.snooze` | СПОРНО, частично уже переехало | см. `reminders.snooze.callback` | вопрос №6 |
| `max.reminder.done` | УЖЕ ПЕРЕЕХАЛО | см. `reminders.done.callback` | webapp reminders |
| `max.reminder.mute` | СПОРНО | см. `reminders.mute.callback` | вопрос №7 |
| `max.reminder.botOff` | УЖЕ ПЕРЕЕХАЛО | открывает notifSettings | webapp reminders/settings |
| `max.reminder.skip.open` | КАНАЛ | Рендер меню | — |
| `max.reminder.skip.preset` | СПОРНО | см. `reminders.skip.applyPreset` | вопрос №8 |
| `max.reminder.skip.freeText` | ПРОДУКТ, делегировано | см. `reminders.skip.applyFreeText` | webapp reminders |
| `max.reminder.snoozeMenu` | КАНАЛ | см. `reminders.snoozeMenu.callback` | — |
| `max.reminder.notifSettings.open` | УЖЕ ПЕРЕЕХАЛО | см. `reminders.notifSettings.open.callback` | webapp reminders/settings |
| `max.reminder.notifSettings.toggle` | УЖЕ ПЕРЕЕХАЛО | см. `reminders.notifSettings.toggle.callback` | webapp reminders/settings |
| `max.default` | ПРОДУКТ | Unmatched-текст → support draft | webapp support |

### MAX admin + scheduler (15)

| Сценарий | Класс | Почему | Куда уезжает |
|---|---|---|---|
| `max.admin.start` | ПРОДУКТ | Admin help/menu copy | webapp doctor/admin |
| `max.admin.debug.show_my_id` | КАНАЛ | Техническая команда | — |
| `max.admin.stats.bookings` | ПРОДУКТ | Booking-статистика | webapp doctor analytics |
| `max.admin.stats.users` | ПРОДУКТ | User-статистика | webapp doctor analytics |
| `max.admin.questions.unanswered` | ПРОДУКТ | Неотвеченные обращения | webapp support |
| `max.admin.questions.mark_all_answered` | ПРОДУКТ | Массовое изменение состояния | webapp support |
| `max.admin.dialogs.open` | ПРОДУКТ | Открытые обращения | webapp support |
| `max.admin.dialogs.view` | ПРОДУКТ | Состояние обращения | webapp support |
| `max.admin.reply.start` | ПРОДУКТ | Начинает reply-mode | webapp support |
| `max.admin.reply.continue` | ПРОДУКТ | Продолжает reply-mode | webapp support |
| `max.admin.reply.message` | ПРОДУКТ/частично уже переехало | см. `conversation.admin.reply` | webapp support / **D23** |
| `max.admin.dialog.close` | ПРОДУКТ | Закрывает обращение | webapp support |
| `max.admin.programNote.reply.start` | ПРОДУКТ | Ответ на комментарий программы | webapp treatment-program/messaging |
| `max.admin.message.unmatched` | ПРОДУКТ | Fallback product copy | webapp doctor/admin |
| `scheduler.tick.reminders` | ПРОДУКТ | Сам решает, что планировать и отправлять сейчас (wellness-подсистема, не booking-lifecycle) | webapp reminders scheduler |

## §3. Недостижимые типы действий (21) — заново обнаруженные, не пересекаются с уже вырезанными `bf45f5853`

Все проверены `rg -n "type:\s*['\"]<тип>['\"]" apps/ --type ts -g '!*.test.ts'` плюс `rg`/`jq` по 5 JSON контента:
совпадает только собственное определение case/набора, продюсер не найден нигде в репозитории.

| Тип | Файл:строка (определение) | Причина/перехватчик |
|---|---|---|
| `event.log` | `executeAction.ts:382` | Нет продюсера Action-типа (запись `event.log` в БД делается изнутри `log.audit`/`booking.event.insert`, но никто не вызывает `executeAction({type:'event.log'})`) |
| `webapp.event.emit` | `executeAction.ts:388` | Нет продюсера |
| `message.compose` | `executeAction.ts:1088` | Нет продюсера (есть мёртвая копия-дубль в `handlers/delivery.ts:78-150`, тоже недостижима — не входит в `DELIVERY_TYPES`) |
| `admin.forward` | `executeAction.ts:1144` | Нет продюсера |
| `message.replyMarkup.edit` | `executeAction.ts:1236` | Нет продюсера как Action (мёртвая копия `handlers/delivery.ts:275-296`; строка встречается ещё как `OutgoingIntent.type` — другое пространство имён) |
| `user.findByPhone` | `executeAction.ts:1259` | Нет продюсера |
| `conversation.openWithMessage` | `executeAction.ts:1647` | Нет продюсера |
| `conversation.user.message` (switch case) | `executeAction.ts:1751` | Единственная конструкция типа (`:1523`, внутри `draft.send`) вызывает `handleConversationUserMessage(...)` напрямую, минуя этот case — сам case недостижим, функция жива |
| `content.section.open` | `executeAction.ts:2079` | Нет продюсера (внутри — захардкоженные плейсхолдеры `useful_lessons`/`emergency_help`) |
| `log.audit` | `executeAction.ts:2124` | Нет продюсера |
| `booking.event.insert` | `BOOKING_TYPES:68` → `handlers/booking.ts:9` | Нет продюсера; тело хендлера подтверждает миграцию D14 (см. «Важная поправка» выше) |
| `notifications.get` | `NOTIFICATION_TYPES:69` → `handlers/notifications.ts:15` | Нет продюсера |
| `notifications.toggle` | тот же набор → `handlers/notifications.ts:34` | Нет продюсера |
| `reminders.rules.get` | `REMINDER_TYPES:70-86` → `handlers/reminders.ts:245` | Нет продюсера; старая Telegram-панель снесена `bf45f5853` |
| `reminders.rule.toggle` | тот же → `handlers/reminders.ts:275` | Нет продюсера |
| `reminders.rule.cyclePreset` | тот же → `handlers/reminders.ts:352` | Нет продюсера |
| `reminders.skip.reasonPrompt` | тот же → `handlers/reminders.ts:1054` | Нет продюсера, handler-only без сценарного диспетчера |
| `reminders.messengerTopic.disable.callback` | тот же → `handlers/reminders.ts:1565` | Нет продюсера |
| `message.deliver` | `DELIVERY_TYPES:88-94` → `handlers/delivery.ts:348` | Нет продюсера Action-типа; строка живёт как job `kind` в очереди (другое пространство имён), воркер не вызывает `executeAction` повторно |
| `message.retry.enqueue` | тот же → `handlers/delivery.ts:395` | Нет продюсера Action-типа |
| `intent.enqueueDelivery` | тот же → `handlers/delivery.ts:436` | Нет продюсера |

Дополнительно: внутри `handlers/delivery.ts` ветки `message.compose` (78-150), `message.edit` (238-273),
`message.replyMarkup.edit` (275-296), `message.delete` (298-325) — мёртвый дублирующий код: `handleDelivery`
вызывается только при `DELIVERY_TYPES.has(action.type)`, а `DELIVERY_TYPES` этих строк не содержит.

Проверка гейтов резолвера (`kernel/orchestrator/resolver.ts`, не `kernel/domain/orchestrator/` — путь скорректирован):
гейт 1 (`buildLinkedPhoneMessageMenuGatePlan`) закрывает только `booking.open`/`menu.more`/`cabinet.open`, и все
живые сценарии на эти действия уже требуют `linkedPhone:true` в своём `match` — не перехватывает ничего нового.
Гейт 2 (`buildLinkedPhoneCallbackGatePlan`) в теории мог бы закрывать любой callback от непривязанного
пользователя без per-action исключений, но ни один из живых callback-сценариев (`reminder.*`, `booking.menu`,
`cabinet.open.callback`, `bookings.show`, `info.*`) не декларирует `linkedPhone` в своём `match` — подтвердить как
реально мёртвый сценарий по статике невозможно (нужно рантайм-доказательство, что непривязанный пользователь
физически не может получить эти кнопки).

## §4. Девять спорных мест — ответы владельца 31.07

Девять вопросов этой переписи владелец закрыл 31.07 (дословно —
`OWNER_QUOTE_2026-07-31_IDENTITY.md`, раздел «Девять вопросов переноса»). ⛔ Повторно их не задавать.

| # | о чём | ответ владельца | пункт плана |
|---|---|---|---|
| 1–2 | `webapp.channelLink.complete` (`executeAction.ts:811`, записи `user.phone.link`/`user.state.set` на success-пути `:882-913`) и `webapp.phoneMessengerBind.complete` (`:454`, `accountCreated`, доверие к телефону, identity-sync `:541-600`) — что из этого канал, а что продукт. Эти два вопроса определяли СПОРНО-статус 13 сценариев identity/auth | «интегратору остаётся только доставка входа, а создание учётки, доверие к телефону и синхронизация личности — вебаппу» | **D25**, по схеме `IDENTITY_AND_MERGE_SCHEME.md`, шагами D15b |
| 3 | legacy-ветка `handleConversationAdminReply` (`supportRelay.ts:494-670`) владеет состоянием обращения локально, отдельно от уже делегированной webapp-ветки (`:386-492`) | «старое удаляем или переносим в новое. Тех-поддержку делаем так как надо а не чтобы сохранить как было» | **D23** |
| 4 | `reminders.rules.get` / `.rule.toggle` / `.rule.cyclePreset` — недостижимы (§3), удалять или ждать нового UI правил | «если про настройку в боте — то удаляем» | **D24** |
| 5–8 | `reminders.dispatchDue` (`handlers/reminders.ts:469-959`: title-resolution, deep-link/open-target, выбор messenger-канала), `reminders.snooze.callback` (`:961`, локальный расчёт `plannedUntil` как fallback), `reminders.mute.callback` (`:1469`, сам считает авторитетный `mutedUntilIso`), `reminders.skip.applyPreset` (таксономия причин и русский текст `SKIP_PRESET_REASON`, `:209-214`) — где проходит граница | «напоминалки про это из бота — убираем как самостоятельную историю и оставляем как часть общей системы, которая настраивается в одном месте — а отправляется туда куда выбрал пользователь» | **D21** |
| 9 | `notifications.toggle` (`handlers/notifications.ts:34-89`) хардкодит таксономию категорий уведомлений (spb/msk/online/bookings) | «ВРЕД. у нас все настройки локаций и услуг (и даже специалистов) должны быть в настройках клиники в вебапп» | **D22** |

## §5. Чего не смог установить

- **Недостижимость по контенту ≠ недостижимость в рантайме.** Перепись находит только продюсера в текущем
  content/коде; у людей на руках могут оставаться старые сообщения провайдера с уже отправленными inline-кнопками
  для сценариев/типов, которых в content больше нет (как для 26 сценариев, вырезанных `bf45f5853`, так и для 21
  типа §3) — такая кнопка теоретически ещё может прийти нажатием (callback), хотя перепись контента её не видит.
  Не считать вырезанный/недостижимый callback безопасным по одной переписи контента.
- Истинную мёртвость 21 недостижимого типа в реально работающей системе — проверка статическая (`rg`/`jq` по
  литеральной строке типа), не ловит динамическое построение строки типа (переменная/шаблонный литерал/константа
  из внешнего пакета) и не включает выполнение приложения, чтение БД/очередей или трассировку каждого
  webhook/worker-маршрута за пределами `apps/integrator/src` до последней строчки. При таком количестве (21 из 51)
  рекомендую рантайм/лог-подтверждение перед удалением — так же, как это сделал коммит `bf45f5853` для прошлого
  прохода («проверка на висячие ссылки»).
- Реальная (не статическая) достижимость сценариев через гейт 2 резолвера (§3) — зависит от того, может ли
  непривязанный пользователь физически получить reminder/dialog/booking callback-кнопки; не решается по коду.
- Полный список того, что именно физически вырезали D13a/D13b внутри booking-lifecycle подсистемы
  (`bookingLifecycleRoute.ts`) — этот файл вне объявленного объёма census (`executor/`, наборы обработчиков,
  сценарный контент), поэтому его строки не переписывались построчно; только факт и коммит миграции зафиксирован
  в разделе «Важная поправка» выше.
- Частота использования сценариев в проде — БД/логи/очереди не читались (read-only).
- Есть ли уже зафиксированный ответ владельца по вопросам №3, №6, №7 в других документах прогона, за пределами явно
  процитированных в брифе D14/D13 коммитов — не искал исчерпывающе весь `docs/_TODO/runs/`.

## Продуктовые решения, оставшиеся в исполнителе (сводная секция)

Всего продуктовых решений (ПРОДУКТ + гибридные СПОРНО, где явно есть продуктовая часть) в достижимом коде: **23
типа действий** из 30 (все, кроме 5 чисто-КАНАЛ и 2 частично-канальных СПОРНО без решённой продуктовой доли). Что
мешает перенести каждую группу:

| Группа решений | Где физически | Что мешает переносу | Пункт плана |
|---|---|---|---|
| Support/обращения (draft/conversation/question, 10 типов) | `executeAction.ts` `draft.*`/`conversation.*`/`question.*`, `handlers/supportRelay.ts` | Legacy-ветка `handleConversationAdminReply` ещё владеет состоянием локально; владелец 31.07 велел её удалить или перенести | **D23**, затем D3–D8 |
| Идентичность/auth (13 спорных сценариев) | `webapp.channelLink.complete`, `webapp.phoneMessengerBind.complete`, весь `*.phoneauth`/`*.contact.link.*`/`start.link` кластер | Граница задана владельцем 31.07: интегратору остаётся только доставка входа. Перенос идентичности — самый рискованный пункт, поэтому идёт в конце | **D25** по схеме → D15b |
| Wellness-напоминания (8 типов в `handlers/reminders.ts`) | `reminders.planDue/dispatchDue/snooze/mute/skip.*` | Частичная, несогласованная делегация (snooze принимает webapp-ответ, mute — нет; title/deep-link ещё считает интегратор) . Владелец 31.07 закрыл: своя ветка убирается целиком, остаётся доставка выбранным каналом | **D21** |
| Onboarding/навигация (`start`, `start.onboarding`, `noticeme`, `nav.webapp.menu.need_phone`) | сценарный контент telegram/max user | Текст и выбор экрана в JSON-контенте интегратора, а не в вебаппе | D3–D8 |
| Booking-предпоказ (`booking.open/menu/open.callback`, `bookings.show`, `info.prepare/address`) | сценарный контент | UI и данные записи рендерятся интегратором из собственного booking-контента | D3–D8 |
| Doctor/admin статистика и обращения (admin.stats.*, admin.questions.*, admin.dialogs.*, admin.reply.*) | telegram/max admin контент | Тот же support-кластер, что и выше | D3–D8 |
| `webapp.programNote.replyBegin` (лечебная программа) | `executeAction.ts:714` | Отдельный модуль (treatment-program), не входит ни в один текущий пункт явно | D3–D8 |
