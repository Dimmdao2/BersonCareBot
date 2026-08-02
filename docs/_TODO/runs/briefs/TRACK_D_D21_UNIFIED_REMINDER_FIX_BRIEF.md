# Track D D21 — fixer по сохранённому независимому oracle

Роль: worker/fixer. Канон исполнения — `AGENTS.md` §5, §7, §10a/§10b и §24. Authority —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D21/D21, product brief
`docs/_TODO/runs/briefs/TRACK_D_D21_UNIFIED_REMINDER_OCCURRENCE_BRIEF.md` и единственный независимый аудит
`docs/_TODO/runs/integrator-cleanup/D21_UNIFIED_OCCURRENCE_INDEPENDENT_AUDIT_2026-08-03.md`.

## Источник оракула: `WORK_ORDER.md` Р-D21 — «Тихих часов нет. Человек сам ставит удобное ему время»

Накопленные расписания
переносятся как есть, все каналы используют одну canonical occurrence, а действия пациента меняют её каноническое
состояние. Сохранённые acceptance-тесты аудита являются единственным fix-gate; новый blind audit не запускать.

## Исправить ровно четыре finding

1. В `0322_unified_reminder_occurrence_local.sql` дать owner SECURITY DEFINER capabilities минимальный `INSERT` на
   `public.reminder_occurrence_history`, чтобы done/skip/snooze не падали; прямые grants пациенту не расширять.
2. Исправить перенос legacy pending occurrence при конфликте `occurrence_key`: актуальный pending state и planned_at
   не теряются даже если unified row уже terminal. Parity должна проверять именно сохранённый actionable state.
3. Убрать quiet-hours suppression из живого planner. Старые quiet-hours поля могут остаться как неиспользуемые
   compatibility data только если они нигде не меняют планирование; UI/write-path не должен обещать человеку
   несуществующее поведение.
4. Удалить executable DELETE/UPDATE `webapp_reminder_occurrences` из общего `platform-merge`; после 0322 merge
   личности не обращается к удалённой таблице.

## Scope и запреты

Разрешены: `0322`, reminder policy/tests/UI/write-path, `packages/platform-merge` и его тесты, audit report/evidence.
Не менять journal idx/when/tag, другие миграции, scheduler/worker архитектуру, тарифы/CMS/billing, DEV/TEST/PROD.
Не удалять сохранённые audit-тесты. Product fix коммитить явно выбранными путями, без `git add -A`, не push.

## Готовность

- Оба сохранённых PostgreSQL набора зелёные: callback capabilities и 0322 pending-conflict migration.
- `reminders.dispatch.d21.test.ts` зелёный, включая выбранное время внутри прежних quiet hours.
- Exact `rg` вне migrations/tests/docs не находит executable `webapp_reminder_occurrences`.
- Relevant platform-merge tests, оба typecheck, scoped lint, journal sync/freeze, raw-SQL gate и diff-check зелёные.
- Все временные/тестовые файлы убраны, дерево чистое, один или несколько осмысленных fix-коммитов; отчёт с hash.
