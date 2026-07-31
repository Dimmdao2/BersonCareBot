# MISSION: независимый аудит трёх коммитов Track D — RLS/гранты вычистки mailing-таблиц (D8)

Read-only, тесты запускать можно. Дерево клона должно остаться чистым.

## Authority

- **План:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, «Track D-полный», пункт **D8**
  (mailing/subscriptions) — отмечен `[x] DONE 2026-07-30` со ссылкой на коммит `60caf998`.
- **Очередь ночной волны:** `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, последняя строка (клон
  `987-d8`) — статус «ОЖИДАЕТ АУДИТА», ты закрываешь именно её.
- **Коммиты на аудит (все три, в клоне `bcb-wt-987-d8`, уже в HEAD `feat/doctor-ui-rebuild`):**
  - `61e644c6d` fix(track-d): retire mailing security targets #987 — трогает
    `deploy/postgres/p0-5-role-split.sql`, `p0-5b-grants.sql`, `phase4-force-rls-cutover.sql`,
    `phase4-locked-helper-rls-policies.sql` (RLS/гранты), плюс скрипты гейта
    `check-d8-mailing-retirement.mjs`, `check-new-table-rls-coverage.mjs`, `check-p0-4-batches.mjs`,
    `actual-schema-tables.mjs`.
  - `0d1d8dd47` fix(track-d): preserve combined projection retirements #987 — правка слияния,
    `apps/integrator/src/kernel/contracts/{index.ts,projectionEventTypes.ts}`.
  - `1cf06cb7f` fix(track-d): keep D8 mailing events retired #987 — та же пара файлов, откат
    случайно вернувшихся mailing-констант после мержа.
- **Правило, почему это не самооценка:** `docs/ORCHESTRATION_BINDINGS.md` — правки RLS/грантов не
  засчитываются самопроверкой исполнителя или лида, обязателен независимый auditor через порт.

## Вопросы

1. **RLS/гранты реально сняты с удалённых mailing-таблиц, не более и не менее.** По каждому из четырёх
   файлов `deploy/postgres/{p0-5-role-split,p0-5b-grants,phase4-force-rls-cutover,
   phase4-locked-helper-rls-policies}.sql` — какие именно строки/политики/гранты убраны, и что это ровно
   таблицы, которых уже нет в схеме (сверь по факту, не по заявлению коммита). Если осталась политика или
   грант на несуществующую таблицу — назови. Если убрано что-то живое — это блокер.
2. **Гейт `check-d8-mailing-retirement.mjs` реально ловит регресс.** Прогони сам. Затем инъекцией (верни
   вручную одну mailing-политику или один mailing-грант в `.sql`, не коммитя) проверь, что гейт краснеет;
   верни файл обратно. Приведи вывод обоих прогонов.
3. **`check-new-table-rls-coverage.mjs` / `check-p0-4-batches.mjs` / `actual-schema-tables.mjs` не потеряли
   покрытие для живых таблиц** — замена «хрупких ручных счётчиков» на «проверку по множеству источников»
   (формулировка коммита) не должна давать false-negative на реальной новой таблице без RLS. Проверь
   выборочно на одной существующей таблице с ожидаемым RLS: гейт её видит.
4. **`scope-derivation/{needs-orgid-FINAL.txt,p0-4-batches.tsv,tiers-218.tsv}` правки согласованы со
   схемой** — удалённые записи там относятся ровно к тем же retired mailing-таблицам, не к чему-то ещё.
5. **Слияние `0d1d8dd47`/`1cf06cb7f` не вернуло и не потеряло контракты.** В
   `apps/integrator/src/kernel/contracts/{index.ts,projectionEventTypes.ts}` после всех трёх коммитов:
   mailing-события отсутствуют (retired), appointment-projection контракт **присутствует** (его коммит
   `0d1d8dd47` explicitly restores/preserves) — оба факта проверь чтением файла в его текущем состоянии,
   не по diff отдельного коммита.
6. **Ничего лишнего.** `git diff --stat` по всем трём коммитам вместе: только перечисленные выше файлы;
   миграции, вебапп, продуктовый код домена не тронуты.
7. **Гейт D8 в плане (`WORK_ORDER.md`, строка `[x] D8`) соответствует реальности** — ссылается на
   `60caf998`, а фактическая работа лежит в трёх более поздних коммитах слияния; отметь явно, считаешь ли
   ты формулировку плана всё ещё верной или расходящейся, но саму строку плана не трогай (это работа лида).

## Прогоны

`check-d8-mailing-retirement.mjs` + self-test, `check-new-table-rls-coverage.mjs`, `check-p0-4-batches.mjs`,
интегратор `typecheck`/`lint`/его тесты, корневой `lint`. Полный CI не гонять. Приведи числа/вывод команд.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, ответы по семи вопросам с доказательствами (команда → вывод),
нумерованный MUST FIX (пустой — допустимый ответ), и подтверждение, что дерево клона чистое.
