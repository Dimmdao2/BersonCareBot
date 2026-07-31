# D21a — закрытие находок аудита: отчёт worker-d21a-fix

Дата: 2026-07-31. Authority: `D21A_FIX_BRIEF.md`, аудит `D21A_AUDIT.md` (вердикт SHIP-WITH-FIXES,
проверял `951bc1d0e`). Логику удаления причин пропуска не пересматривал — работа только про тесты,
константу маршрутизации и доки, как требует бриф.

## Что сделано

Расширен существующий файл `apps/integrator/src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts`
(без новых файлов — тот же файл, та же зона ответственности):

1. Новый параметризованный тест (telegram + max) **сквозного пути кнопки**: `callback_data` берётся с
   **реального** `buildReminderDispatchInlineKeyboard`, прогоняется через **реальный** `mapIn`
   (`incomingCallbackUpdateFromTelegramCallbackQuery` / `fromMax`), затем через **реальный** `buildPlan`
   с реальным `createContentPort()` над файловыми `scripts.json`, затем через **реальный** `executeAction`
   с реестром `REMINDER_TYPES` → `handleReminders`. Проверяет: план не содержит `user.state.set`, содержит
   ровно `reminders.skip.applyPreset` без `reasonCode`, исполнение даёт `success`, единственную запись
   `markSkippedLocal` и `postOccurrenceSkip({ reason: null })`. Закрывает F1 и F2 одним тестом — литерал
   кнопки берётся из продакшен-кода, а не печатается в тесте руками, поэтому расхождение кнопка↔разбор
   ловится тем же тестом, что и слой контента/реестра.
2. Новый тест **владения занятием**: `reminders.occurrence.ownerUserId` возвращает чужого пользователя →
   `handleReminders` обязан вернуть `status: 'failed'`, без записи и без вызова `postOccurrenceSkip`.
3. Правка существующего теста «съеденное сообщение»: убрано вечнозелёное утверждение
   `expect(result.error).not.toBe('CONVERSATION_USER_BLOCKED_SKIP_REASON')` (константа нигде в исходниках
   не существует — сравнение не может покраснеть). Оставлено поведенческое `expect(result.status).toBe('success')`.

Плюс правки вне тестового файла: `apps/webapp/src/modules/reminders/reminders.md`,
`docs/ARCHITECTURE/MAX_SETUP.md` (F4), `D21A_SKIP_REASONS_REPORT.md` (F6/F7).

## Таблица F1–F7

| # | Статус | Файл | Поломка (по нумерации аудита) | Вывод прогона (внесена → красное → откат → зелёное) |
|---|---|---|---|---|
| **F1** | ✅ закрыто | `reminders.skip.d21a.test.ts` (новый describe «survives the routing layer») | I4 (удалить `telegram.reminder.skip.open`), I5 (удалить `max.reminder.skip.open`), I6 (сломать разбор `rem_skip:` в `mapIn.ts`), I7 (убрать `reminders.skip.applyPreset` из `REMINDER_TYPES`), I3b (вернуть `user.state.set → waiting_skip_reason:…` первым шагом в `telegram.reminder.skip.open`) | Все пять внесены по отдельности и по одной странице ниже — каждая дала красное, каждая откатана `git checkout --`, после отката полный `pnpm run test` → `154 passed, 0 failed` |
| **F2** | ✅ закрыто | `reminders.skip.d21a.test.ts` (тот же тест — `callback_data` из `buildReminderDispatchInlineKeyboard`, не хардкод) | I8 (в `reminderInlineKeyboard.ts` заменён литерал `rem_skip:${id}` на `rem_skip_r:${id}:none`) | Внесено → `plan never reached reminders.skip.applyPreset` (2 failed, telegram+max) → откат `git checkout --` → `154 passed`. Это ровно та поломка, которую не поймал даже зонд аудитора (он строил payload руками) |
| **F3** | ✅ закрыто | `reminders.skip.d21a.test.ts`, тест «no dead skip-reason state…» | I11 (снос строки `status === 'success'` рядом с decorативным утверждением) — decorативное утверждение убрано, поведенческое оставлено | Убранная строка (`.not.toBe('CONVERSATION_USER_BLOCKED_SKIP_REASON')`) была вечнозелёной — `grep` по `apps/` + `packages/` подтверждает: константа встречается только в самом тесте (было так и до правки, и после). Осталась только строка, которая реально краснеет при поломке handler'а |
| **F4** | ✅ закрыто | `apps/webapp/src/modules/reminders/reminders.md:29`, `docs/ARCHITECTURE/MAX_SETUP.md:58` | — (доки, не тест) | Обе строки описывали удалённое (`reasonCode: none`, «выбор причины остаётся для старых клавиатур», `reminders.skip.applyFreeText` как текущее поведение MAX) как текущий факт. Переписаны на факт: причины убраны целиком (D21a), `applyFreeText` вычеркнут с пометкой удаления и датой |
| **F5** | ✅ закрыто | `reminders.skip.d21a.test.ts` (новый describe «guards occurrence ownership») | I9 (`handlers/reminders.ts:1069` — условие проверки владения заменено на `if (false)`) | Внесено → `expected 'success' to be 'failed'` (1 failed) → откат `git checkout --` → `154 passed` |
| **F6** | ✅ закрыто | `D21A_SKIP_REASONS_REPORT.md` (добавлен раздел «Уточнение») | — (честность отчёта, не тест) | Дописана оговорка: фактически `git show --stat 951bc1d0e` → 14 файлов, +301/-467 (не «12 файлов, +2/-467» из исходного отчёта); разница — новый тест и сам отчёт. Исходный текст не переписан, только дополнен |
| **F7** | ✅ закрыто | `D21A_SKIP_REASONS_REPORT.md` (тот же раздел) | — (честность отчёта, не тест) | Дописано: `git stash`-арбитраж исходного отчёта восстанавливал только файлы-обработчики, контент-сценарии и `mapIn.ts` в нём не участвовали; тест №1 исходного отчёта краснел на старом коде из-за требования параметра `reasonCode`, а не из-за отсутствия перехода в ожидание — привязка к сигнатуре, не к поведению |

### Поимённый список семи поломок аудитора и их красное/зелёное состояние

Каждая внесена в чистое дерево, прогнана, откатана `git checkout --` перед следующей (последовательно, не
параллельно — см. `git status --short` ниже подтверждает, что после каждого отката дерево возвращалось к
десяти исходным `.env.example`).

| Поломка | Файл | Красное (эту правку) | После отката |
|---|---|---|---|
| I3b — контент возвращает `user.state.set` первым шагом | `content/telegram/user/scripts.json` | `1 failed` (telegram) — `expected true to be false` на `plan.some(kind === 'user.state.set')` | `154 passed` |
| I4 — удалить `telegram.reminder.skip.open` | `content/telegram/user/scripts.json` | `1 failed` (telegram) — `plan never reached reminders.skip.applyPreset` | `154 passed` |
| I5 — удалить `max.reminder.skip.open` | `content/max/user/scripts.json` | `1 failed` (max) — та же ошибка | `154 passed` |
| I6 — сломать префикс `rem_skip:` в `normalizeChannelCallbackPayload` | `integrations/telegram/mapIn.ts` | `2 failed` (telegram + max — общий парсер) — та же ошибка | `154 passed` |
| I7 — убрать `reminders.skip.applyPreset` из `REMINDER_TYPES` | `kernel/domain/executor/executeAction.ts` | `2 failed` (telegram + max) — `expected 'skipped' to be 'success'` | `154 passed` |
| I8 — сменить литерал кнопки на `rem_skip_r:${id}:none` | `kernel/domain/reminders/reminderInlineKeyboard.ts` | `2 failed` (telegram + max) — `plan never reached reminders.skip.applyPreset` | `154 passed` |
| I9 — снять проверку владения (`if (false)`) | `kernel/domain/executor/handlers/reminders.ts:1069` | `1 failed` — `expected 'success' to be 'failed'` | `154 passed` |

Все семь — красные при внесении, все семь — зелёные после отката. Итоговый набор ловит все семь поломок,
которые аудит показал как проходящие незамеченными.

## Числа тестов до и после

- **До этой работы** (после D21A_AUDIT.md, зонд аудитора удалён): `pnpm run test` →
  `Test Files 23 passed | 3 skipped (26)`, `Tests 151 passed | 9 skipped (160)`.
- **После этой работы**: `pnpm run test` → `Test Files 23 passed | 3 skipped (26)`,
  `Tests 154 passed | 9 skipped (163)`. Разница — ровно +3 теста (2 параметризованных сквозных теста
  telegram/max + 1 тест владения), файл тот же (расширен, не создан новый).
- `pnpm run typecheck` — PASS (до и после).
- `pnpm run lint` — PASS (до и после).

`git status --short` в конце работы (те же десять `.env.example`, что были до начала задачи, плюс
изменённый тестовый файл, два живых дока и отчёт):

```
 M .env.example
 M apps/integrator/src/integrations/max/.env.example
 M apps/integrator/src/integrations/smsc/.env.example
 M apps/integrator/src/integrations/telegram/.env.example
 M apps/integrator/src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts
 M apps/webapp/.env.example
 M apps/webapp/src/modules/reminders/reminders.md
 M deploy/env/.env.webapp.dev.example
 M deploy/env/.env.webapp.prod.example
 M deploy/env/empty.local-migration.env
 M deploy/env/webapp/.env.dev.example
 M deploy/env/webapp/.env.prod.example
 M docs/ARCHITECTURE/MAX_SETUP.md
 M docs/_TODO/runs/integrator-cleanup/D21A_SKIP_REASONS_REPORT.md
?? docs/_TODO/runs/integrator-cleanup/D21A_FIX_REPORT.md
```

Push/merge не выполнялись.

## Развилки (владельцу)

Нет. Всё, что требовал бриф (F1–F7), реализовано буквально в границах, которые он очертил.

## Чего не смог

Нет открытых пунктов из брифа. Вне области (как и было указано брифом — не трогал):

- Снуз-путь, веб-пуш, перенос владения правилами.
- `replyToMessageId`, который MAX/Telegram по-прежнему кладут в нормализованный payload, но у которого с
  удалением `reminders.skip.applyFreeText` не осталось ни одного потребителя в коде — это предсуществующий
  мёртвый параметр, не находка этого прогона; зафиксировано как факт в правке F4, но не удалялось (не
  входит в scope брифа: "снуз, веб-пуш, перенос владения правилами — не трогать" плюс явное requirement
  "логику удаления не пересматривать").
