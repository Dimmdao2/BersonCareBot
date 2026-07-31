# D21a — аудит удаления причин пропуска: отчёт auditor-live-d21a

Дата: 2026-07-31. Проверяемое: коммит `951bc1d0e` в клоне `/home/dev/dev-projects/bcb-wt-testsuite-g0`.
Authority: `D21A_AUDIT_BRIEF.md`, `D21A_SKIP_REASONS_REMOVAL_BRIEF.md`, решение владельца 31.07
(«Причины пропуска убрать. Без обсуждений»). Решение не оспаривается — проверялось исполнение.

## Вердикт: **SHIP-WITH-FIXES**

Само удаление сделано верно и полностью. Пропуск работает целиком в обоих каналах — доказано прогоном
через реальные сценарии контента, а не чтением. Главный риск (съеденное сообщение) **не реализовался** —
тоже доказано прогоном. Область не расширена и не сужена, колонка в БД не тронута, остатков мёртвых
веток нет.

Чинить надо не удаление, а **гейт приёмки**. Бриф требовал теста, который «обязан краснеть, если вернуть
переход в состояние ожидания». Тест исполнителя проверяет только слой handler'а. Слой, который коммит
фактически и правил — контент-сценарии, `mapIn`, реестр типов действий — не покрыт ничем: **семь моих
поломок из семи проходят с полностью зелёным набором и зелёным typecheck**, включая буквальное требование
брифа. То есть арбитр, который исполнитель предъявил как доказательство, не арбитрирует ту правку,
которую он сделал.

---

## Что проверено прогонами

Базовый прогон до вмешательств: `pnpm --dir apps/integrator run test` →
`Test Files 23 passed | 3 skipped (26)`, `Tests 151 passed | 9 skipped (160)`.
Числа исполнителя в отчёте сошлись.

### Пропуск работает целиком, до записи (пункт 1 брифа) — ДА

Написал временный зонд `zz.audit.d21a.probe.test.ts`, который гоняет **реальные** `scripts.json` через
реальный `buildPlan` + реальный `executeAction` (не мок сценария). Удалён после прогона.

`rem_skip:<occurrenceId>` → `normalizeChannelCallbackPayload` → сценарий → реестр → handler:

```
[PROBE A telegram] kind=reminders.skip.applyPreset  payload={occurrenceId, channelUserId, resource:"telegram",
                   chatId, messageId, callbackQueryId}   ← reasonCode отсутствует, user.state.set отсутствует
[PROBE A max]      kind=reminders.skip.applyPreset  payload={... resource:"max" ...}
[PROBE C] status=success
          writes=["reminders.occurrence.markSkippedLocal"]
          webappSkip=[{"integratorUserId":"…","occurrenceId":"…","reason":null}]
          intents=["callback.answer","message.edit"]
```

Занятие помечено пропущенным, человек получил подтверждение (`message.edit`), диалог в ожидание не ушёл,
и всё это — одним действием. В обоих каналах.

### Съеденное сообщение (пункт 2 брифа) — риск НЕ реализовался

Произвольный текст от человека с застрявшим в базе `waiting_skip_reason:<id>`, прогон через реальный
резолвер:

```
[PROBE B telegram] stale-state plan = ["draft.upsertFromMessage","message.inlineKeyboard.show"]
[PROBE B telegram] idle-state plan  = ["draft.upsertFromMessage","message.inlineKeyboard.show"]
[PROBE B max]      stale-state plan = ["draft.upsertFromMessage","message.inlineKeyboard.show"]
[PROBE B max]      idle-state plan  = ["draft.upsertFromMessage","message.inlineKeyboard.show"]
```

План **побайтово тот же**, что у человека с чистым состоянием. Сообщение уходит обычным путём к врачу.
Причина, по которой это работает: матчеры `telegram.menu.default` (`$notIn: []`) и `telegram.draft.replace`
(`$notIn: ["waiting_for_question"]`) устаревшее состояние не исключают, а перехватывавший его сценарий
`*.reminder.skip.freeText` (priority 50) удалён. Матчеры коммит не менял — сверено с `951bc1d0e^`.

Отдельно — снятый в `resolver.ts` гейт. Единственный случай, где он вообще срабатывал (человек без
привязанного телефона жмёт «Кабинет»/«Запись»/«Ещё»):

```
[PROBE B gate] stale = ["user.state.set","message.replyKeyboard.show"]
               idle  = ["user.state.set","message.replyKeyboard.show"]
```

Расхождения нет: человек с устаревшим состоянием ведёт себя ровно как обычный. Побочно гейт ставит
`await_contact:subscription`, то есть устаревшее состояние им же и затирается. Регрессии нет.

### Остатки (пункт 3) — чисто

`rem_skip_r`, `skipReasonCode`, `waiting_skip_reason`, `SKIP_PRESET_REASON`,
`buildReminderSkipReasonInlineKeyboard`, `reminder.skip.promptTitle/askOther` — **ноль** вхождений в
`apps/` и `packages/`, кроме намеренной legacy-фикстуры в новом тесте. Прогнал сверку всех `steps[].action`
из всех пяти `scripts.json` (telegram user/admin, max user/admin, scheduler) против реестра
`REMINDER_TYPES` — ни один сценарий не ссылается на удалённый тип, ни один удалённый тип не остался в
реестре. Кнопки, шлющей несуществующее действие, нет.

Старая клавиатура пресетов в живых чатах людей **не висит**: проверил на `951bc1d0e^` — действие
`reminders.skip.reasonPrompt` не диспатчил **ни один** сценарий контента (ноль вхождений в
`apps/integrator/src/content/*`), только реестр и сам handler. Значит `buildReminderSkipReasonInlineKeyboard`
никогда не рендерился, `rem_skip_r` никогда не отправлялся, и состояние `waiting_skip_reason` этим путём
никогда не выставлялось. Проверка на всякий случай: `rem_skip_r:<id>:pain` сегодня даёт пустой план (`[]`),
то есть висящий спиннер, — но производителя у него нет.

### Колонка в базе (пункт 4) — не тронута

Коммит не открывал ни одного файла вне `apps/integrator/src` (+ свой отчёт): 14 файлов, миграций ноль,
webapp ноль. Определение живо — `apps/webapp/migrations/050_…sql:97`, `051_…sql:9`,
`db/schema/schema.ts:3019,3178`. Чтение старых значений живо и не менялось —
`apps/webapp/src/infra/repos/pgReminderJournal.ts:65` (`SELECT … rj.skip_reason`), порт
`reminderJournalPort.ts:9`, отрисовка `app/app/patient/reminders/journal/[ruleId]/page.tsx:69-71`
(`Причина: {e.skipReason}`). Интегратор просто всегда шлёт `reason: null`.

### Область (пункт 5) — не расширена и не сужена

Снуз: `reminders.snooze.callback` / `reminders.snoozeMenu.callback` (`executeAction.ts:77,82`),
`buildReminderSnoozeMenuInlineKeyboard` (`reminderInlineKeyboard.ts:73-93`), сценарии `*.reminder.snoozeMenu`
и `app.patient_snooze_reminder_occurrence` / `rescheduleReminderOccurrencePlanned` — в диффе только как
контекст либо вне списка файлов. Веб-пуш `apps/webapp/public/sw.js` — не в коммите (последняя правка
`68bfcbeda`, до этой работы). Перенос владения правилами — не тронут. Оба снятых блока
(`resolver.ts`, `supportRelay.ts`) были заскоуплены строго по префиксу `waiting_skip_reason:` — над-удаления нет.

---

## Находки

| # | Находка | Файл и строка | Вывод прогона | Что чинить |
|---|---|---|---|---|
| **F1** | **Слой маршрутизации не покрыт ничем.** Коммит правил контент-сценарии, `mapIn` и реестр действий — ровно там теста нет. Семь поломок из семи проходят зелёными. Среди них — буквальное требование брифа: вернул переход в ожидание причины через **контент-сценарий** (`user.state.set → waiting_skip_reason:{{…}}` первым шагом в `telegram.reminder.skip.open`) — набор зелёный. Кнопка «Пропущу» молча умирает при любой из этих правок. | `content/telegram/user/scripts.json`, `content/max/user/scripts.json`, `integrations/telegram/mapIn.ts:178`, `executor/executeAction.ts:80` | I4 удалить сценарий tg → `151 passed, 0 failed`. I5 удалить сценарий max → `151 passed`. I6 сломать разбор `rem_skip:` → `151 passed`. I7 убрать тип из `REMINDER_TYPES` → `151 passed`. I3b вернуть ожидание через контент → `151 passed`, typecheck OK | Тест уровня резолвера. Мой зонд ловит **5 из 6** (I4→2 failed, I5→1, I6→3, I7→1, I3b→2). Достаточно ~60 строк: `buildPlan` с реальным `createContentPort()` + `executeAction` |
| **F2** | **`callback_data` кнопки ничем не связан с разбором.** `buildReminderDispatchInlineKeyboard` пишет литерал `rem_skip:`, `normalizeChannelCallbackPayload` читает литерал `rem_skip:` — две независимые строки. Правка любой убивает пропуск в обоих каналах беззвучно. | `reminders/reminderInlineKeyboard.ts:52` ↔ `integrations/telegram/mapIn.ts:178` | I8 заменил `skipData` на `rem_skip_r:${id}:none` → `151 passed`, typecheck OK. **И мой зонд это тоже не ловит** (строит payload руками) | Тест round-trip: взять `callback_data` из `buildReminderDispatchInlineKeyboard` и прогнать через `normalizeChannelCallbackPayload` → `action === 'rem_skip'` |
| **F3** | **Заглавное утверждение теста №2 вечно зелёное.** Проверяется отсутствие строки `CONVERSATION_USER_BLOCKED_SKIP_REASON`, которой в исходниках больше нет нигде — компиляторной связи нет, утверждение не может покраснеть никогда. | `handlers/reminders.skip.d21a.test.ts:151` | `grep` по `apps/` + `packages/`: константа встречается только в самом тесте. Вес несёт соседняя строка `status === 'success'` — она реально краснеет (I11 → 3 failed) | Убрать декоративное утверждение либо заменить на проверку факта пересылки (интент/вызов `syncSupportUserMessage`) |
| **F4** | **Живые доки описывают удалённое как текущее.** «Выбор причины (`rem_skip_r:*`) остаётся для старых клавиатур» и «`reasonCode: none`» — оба утверждения теперь ложны. Второй файл документирует удалённый handler как поведение MAX. | `apps/webapp/src/modules/reminders/reminders.md:29`, `docs/ARCHITECTURE/MAX_SETUP.md:58` | `grep` по дереву: код этих сущностей не содержит | Поправить обе строки. Это не архив, а живые доки рядом с кодом |
| **F5** | **Проверка владения занятием не покрыта.** Коммит переписал строку с этой проверкой (убрал из условия `!reasonCode`). Снос `assertOccurrenceOwnedByUser` проходит зелёным — любой мог бы пометить пропущенным чужое занятие. Дефект предсуществующий, но строка тронута этим коммитом. | `handlers/reminders.ts:1064` | I9 заменил условие на `if (false)` → `151 passed, 0 failed` | Тест: чужой `occurrenceId` → `status: 'failed'`, `postOccurrenceSkip` не вызван |
| **F6** | **Отчёт занижает размер коммита без оговорки.** Написано «12 файлов, +2/-467, ни одного нового файла продакшен-кода». Фактически `git show --stat` → **14 файлов, +301/-467**. Разница — новый тест и сам отчёт; формулировка защитима, но оговорки в отчёте нет. | `D21A_SKIP_REASONS_REPORT.md:53-54` | `git show --stat 951bc1d0e` → `14 files changed, 301 insertions(+), 467 deletions(-)` | Дописать оговорку |
| **F7** | **Инъекция в отчёте не покрывает то, что правилось.** `git stash` вернул только handler-файлы (`reminders.ts`, `supportRelay.ts`, `executeAction.ts`, `reminderInlineKeyboard.ts`); контент-сценарии и `mapIn` в арбитраже не участвовали. Плюс тест №1 краснел на старом коде потому, что старый `applyPreset` **требовал `reasonCode`** — то есть привязан к сигнатуре параметра, а не к поведению «нет перехода в ожидание». | `D21A_SKIP_REASONS_REPORT.md:83-117` | Прямое следствие F1: после исправления через контент старый арбитр остаётся зелёным | Переделать инъекцию после закрытия F1 |

### Гипотеза (без прогона, помечаю честно)

Бриф утверждает: «люди с этим состоянием в базе есть прямо сейчас». По коду этого пути возникнуть не
могло — `reminders.skip.reasonPrompt` не диспатчил ни один сценарий (проверено на `951bc1d0e^`), значит
`waiting_skip_reason` этой веткой никогда не выставлялся. Если такие строки в базе есть, они от более
ранней ревизии. Проверить не мог: прод на `135.x` (запрещено), dev-база показательной не является.
**На вывод это не влияет** — поведение при устаревшем состоянии проверено прогоном (PROBE B), оно верное
независимо от того, есть такие строки или нет.

### Вне области

- Интегратор всегда шлёт `reason: null`, а веб-пуш пишет `'web_push'` — и журнал пациента печатает
  `Причина: web_push` сырым литералом (`journal/[ruleId]/page.tsx:69-71`). Предсуществует, к D21a
  отношения не имеет.
- `postOccurrenceSkip(reason: string | null)` (`contracts/ports.ts:604`) со стороны интегратора теперь
  всегда `null`. Сужать нельзя — тот же эндпойнт использует веб-пуш с реальным значением.
- Устройство напоминаний вообще, тихие часы, автоповтор — решением владельца закрыты, не трогал.

---

## Итог по требованиям брифа

| Требование | Статус |
|---|---|
| Пропуск работает целиком, до записи, оба канала | ✅ доказано PROBE A + PROBE C |
| Пропуск покрыт тестом | ✅ на уровне handler'а (I1, I2 краснеют) · ❌ на уровне маршрутизации (F1) |
| Произвольный текст после пропуска не съедается | ✅ доказано PROBE B, оба канала |
| Устаревшее состояние в базе не топит сообщение врачу | ✅ доказано PROBE B |
| Остатков и мёртвых веток нет | ✅ |
| Кнопки без действия нет | ✅ |
| Колонка в БД не тронута, чтение старых значений цело | ✅ |
| Снуз / веб-пуш / перенос владения не тронуты | ✅ |
| Тест краснеет при возврате ожидания причины | ❌ **не выполнено** — через контент-сценарий возврат проходит зелёным (F1/I3b) |

Всё сломанное восстановлено, временный зонд удалён. Финальная проверка на восстановленном дереве:
`Test Files 23 passed | 3 skipped (26)`, `Tests 151 passed | 9 skipped (160)`; `typecheck` — чисто;
`lint` — чисто.

`git status --short` в конце:

```
 M .env.example
 M apps/integrator/src/integrations/max/.env.example
 M apps/integrator/src/integrations/smsc/.env.example
 M apps/integrator/src/integrations/telegram/.env.example
 M apps/webapp/.env.example
 M deploy/env/.env.webapp.dev.example
 M deploy/env/.env.webapp.prod.example
 M deploy/env/empty.local-migration.env
 M deploy/env/webapp/.env.dev.example
 M deploy/env/webapp/.env.prod.example
```

Это ровно те десять файлов, что были изменены до начала аудита; аудит их не касался. Push/merge не выполнялись.
