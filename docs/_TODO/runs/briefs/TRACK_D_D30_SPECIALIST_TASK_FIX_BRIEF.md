# Track D D30-P1 — saved-oracle fix после независимого аудита

Роль: worker/fixer. Канон: `AGENTS.md` §5, §10, §24; owner authority — Р-D30 в
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`; product brief —
`TRACK_D_D30_SPECIALIST_TASK_SCHEDULING_BRIEF.md`; единственный audit oracle —
`docs/_TODO/runs/integrator-cleanup/D30_SPECIALIST_TASK_INDEPENDENT_AUDIT_2026-08-03.md`
на коммите `3c61983bc`.

Источник оракула: `WORK_ORDER.md` Р-D30 — «планировщик ИСПОЛНЯЕТ, но НЕ РЕШАЕТ: правила, сроки и тексты лежат в таблицах, которые пишет вебапп»; сохранённый kill-set и четыре доказанные поломки — `D30_SPECIALIST_TASK_INDEPENDENT_AUDIT_2026-08-03.md`.

Исправить ровно четыре доказанные находки, не проводить новый blind audit и не расширять scope:

1. В временной D30 migration сохранить канонический D5/D21 join `reminder_dispatch` через
   `public.reminder_rules` и `integrator_rule_id`; не возвращать `integrator.user_reminder_rules`.
2. Довести `schedulerDecisionGuard` и его поведенческие тесты до обязательного kill-set аудита: точный fixture
   `offsetMs: offsetMinutes * 60 * 1000`, let/alias, конкатенация текста, dot/bracket assignment и `.includes()`;
   документированную re-export границу плана не расширять.
3. Закрыть stale-payload race: title/description update без смены `remind_at` не может позволить уже claimed
   `processing` intent отправить старый payload. Решение обязано сохранять идемпотентность producer/tick и не
   создавать вторую очередь.
4. Исправить TypeScript `string | null` в `prepareReminderDeliveries.test.ts`.

Обязательная проверка: повторить команды и kill-set из audit report, включая disposable PostgreSQL для
канонического scope и processing-race, оба typecheck, scoped lint, D30 concurrency gates, queue/raw-SQL gates и
`git diff --check`. Временные audit-файлы удалить. Миграцию оставить `9999` и вне journal: финальный номер,
idx/when и удаление временного journal-sync исключения выполняет root только при land против актуального `feat`.
DEV/TEST/PROD не трогать. Закоммитить fix и evidence в `wt/trackd-d30-specialist`, не push.
