# Track D D7→D21 — каноническое действие должно менять исполняемое напоминание

## Authority и граница

Прочитать `AGENTS.md`, особенно §1, §4a, §5, §7–§10 и §24. Канонический план:
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D7 и D21.

Источник оракула: D7 — «Живая проверка выполняет реальные подписанные `done/snooze/skip/mute`, подтверждает изменение канонического состояния и сохранение истории»; D21 — «уезжают собственное планирование, расчёты “отложить”/“выключить до”, своя таксономия причин пропуска и русские тексты в `handlers/reminders.ts`».

Достижимый дефект на текущем `feat`: `reminders.snooze.callback` успешно вызывает
`postOccurrenceSnooze`, получает канонический `snoozedUntil` и отвечает человеку «напомню позже», но
`integrator.user_reminder_occurrences` остаётся со старым временем/состоянием. Due-reader читает эту строку,
поэтому обещанный повтор не планируется. Старый локальный mutation был снят вместе с небезопасным локальным
`Date.now()`; возвращать его как второй источник решения нельзя.

## Задача worker

1. Сначала добавить поведенческий acceptance-тест, который красный на исходном SHA: успешный signed snooze
   обязан атомарно сохранить public history/journal и перенести ровно тот же exact-org operational occurrence
   на `snoozed_until`, вернув его в `planned`; чужая организация/пользователь ничего не меняет; повтор не плодит
   журнал и не уводит время ещё раз.
2. Исправить продукт через один DB-owned validated boundary. Каноническое решение времени остаётся в webapp-owned
   `app.*` capability; integrator handler не вычисляет срок и не выполняет вторую самостоятельную бизнес-запись.
   Если нужен forward-only SQL, использовать заранее забронированную `0321`; `0314` уже применена на DEV и не
   меняется. Не расширять app_patient прямым UPDATE на таблицы и не давать общих grants.
3. Проверить `done`, `skip`, `mute` тем же принципом. Чинить только достижимый разрыв: due occurrence после
   skip/done не должна снова отправляться; mute должна блокировать due-reader до срока. Если текущее поведение уже
   корректно, закрепить тестом без лишнего production diff.
4. Сохранить D5: scheduler читает `public.reminder_rules`; не возвращать `integrator.user_reminder_rules`, HTTP
   projection routes или raw SQL вне существующих DB-портов.
5. Обновить этот brief коротким evidence-блоком и сделать один task-related commit в `wt/trackd-reminder-actions`.
   Staging только явных путей, без push, без DEV/TEST/PROD mutations и без полного CI.

## Минимальные проверки

- targeted integrator reminder handler/adapter tests;
- PostgreSQL capability acceptance на disposable DB, включая exact-org denial, replay и due-reader semantics;
- `pnpm --dir apps/integrator typecheck`;
- `pnpm --dir apps/webapp typecheck`, если менялся webapp TypeScript;
- `node scripts/check-no-new-raw-sql.mjs`;
- migration journal/freeze check, если создана `0321`.

## Запрещено

Не трогать CMS, тарифы, billing, booking, clinic channels, общий `feat`, общий dev-server, внешние каналы,
TEST/PROD и deploy. Не закрывать D7/D21 и не менять taskdb — это делает оркестратор после аудита и live evidence.
