# Track D D30-P1 — независимый аудит specialist-task scheduled delivery

Канон: `AGENTS.md` §5, §10, §24; `WORK_ORDER.md` Р-D30; worker brief
`TRACK_D_D30_SPECIALIST_TASK_SCHEDULING_BRIEF.md`. Продуктовый коммит: `2e30f3b90`.

Провести один независимый live-аудит полного diff. Отчёт воркера не считать доказательством.

Проверить достижимыми тестами/fault injection:

- create/update задачи атомарно сохраняют task и готовые per-channel queue intents; отказ queue-write откатывает task;
- complete/delete/reschedule терминализируют старые ещё не отправленные intents, старый payload не уходит;
- write producer и legacy enqueue-only tick используют один deterministic event id и не создают дубль;
- worker не принимает продуктовых решений: исполняет готовый generic intent, сохраняет retry/dead semantics;
- `organization_id` fail-closed участвует в tenant scope и claim; существующие producers не сломаны;
- `schedulerDecisionGuard` ловит прямой, alias, dynamic и re-export обходы;
- не создана вторая очередь/дублирующий продуктовый repository вместо единого queue port;
- временная `9999` не внесена в journal; изменение journal-sync gate не оставляет постоянной лазейки и допустимо только
  для временной ветки — к land root заменит номер и journal entry;
- D21 reminder delivery, CMS/tariffs/billing не затронуты.

Запустить targeted unit/postgres tests (throwaway PostgreSQL, не DEV), оба typecheck, scoped lint, concurrency gates,
raw-SQL gate и `git diff --check`. Все audit-only поломки удалить. Закоммитить только audit report с `PASS` или
`MUST FIX`, точными командами и killed/not-killed counts. DEV/TEST/PROD не трогать.
