# Track D D18c — независимый live-аудит финального raw SQL boundary коммита

Аудитор `auditor-live`, независимый от исполнителя. Канон — `AGENTS.md` §5, §10a/§10b, §24. Authority —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D18/D18c,
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` §«Порядок работ» п.1, worker brief
`docs/_TODO/runs/briefs/TRACK_D_D18C_RAW_SQL_FINAL_BRIEF.md`.

Продукт под аудитом: коммит `034f79100` «refactor(db): remove projection health raw SQL debt»
(ветка `wt/trackd-d18c`, поверх `feat/doctor-ui-rebuild`). Отчёт исполнителя и зелёные тесты
доказательством не считались — каждый пункт проверен независимо: живой прогон на disposable
PostgreSQL 16 (throwaway `initdb`, `/tmp`, unix-socket-only — не DEV/TEST/PROD), временная
поломка продуктового кода с прогоном тестов, реальная (не только синтетическая) инъекция bypass
в новые production-файлы, точный diff-скоуп коммита. Дерево на момент сдачи чистое — все временные
файлы/поломки удалены и отменены, подтверждено `git status --porcelain` (пусто) и `git diff --check`.

## 1. Census и self-test (взгляд)

`node scripts/check-no-new-raw-sql.mjs --self-test` — OK, 12/12 синтетических фикстур (comment,
line break, template interpolation, foreign object, alias/bind, string concat, destructuring alias,
constant/optional/dynamic computed member, relative-helper-export, Drizzle execute allowed).

`node scripts/check-no-new-raw-sql.mjs --census` / без флага:

```
check-no-new-raw-sql: OK (integrator low-level DB port: 4; integrator test-only PostgreSQL harness: 1;
integrator migration/deploy SQL executor: 1; media-worker low-level DB port: 3;
webapp test-only PostgreSQL harness: 20; webapp low-level DB port: 5; production debt: 0)
```

**Production debt manifest удалён** (frozen `rawSqlQueryManifest`/`staleDebtEntries` вычищены из
скрипта — `git show 034f79100 -- scripts/check-no-new-raw-sql.mjs`), классификация теперь
структурная (`classifyFile`): migration/deploy SQL executor, low-level DB port, test-only PostgreSQL
harness, production debt. `projectionHealthCore.ts` полностью выпал из census — он больше не вызывает
`.query()`, только `db.execute(Drizzle SQL fragment)`.

Проверены вручную все 20 webapp «test-only PostgreSQL harness» и 1 integrator RLS-файл в census —
все являются реальными `*.test.ts` (`.devDb.integration.test.ts` / `.rls.integration.test.ts`),
opt-in через `USE_REAL_DATABASE=1`, не production-код под видом теста.

## 2. Поведенческая эквивалентность projection-health (живой disposable PostgreSQL)

Замена `query(text, params)` → `execute(Drizzle SQL fragment)` в `projectionHealthCore.ts` проверена
не по мокам (существующие unit-тесты мокают `execute`), а живым прогоном на throwaway PostgreSQL 16
(`apps/integrator/src/infra/scripts/d30DisposablePostgres.ts` — тот же механизм, что уже используют
продуктовые D30 concurrency-proofs; отдельный `initdb`, unix-socket, `/tmp`, ни разу не касается
настроенного `DATABASE_URL`).

Реконструирована ДОСЛОВНАЯ до-D18c реализация (`db.query(text, params)`, пять исходных SQL-текстов из
`git show 034f79100` diff) и прогнана на ТОЙ ЖЕ БД с ТЕМИ ЖЕ данными против текущей
`readProjectionHealthSnapshot` (Drizzle-фрагменты) для 5 значений `retryThreshold` (0, 1, 3, 4, 100) —
охватывает границу (`attempts_done >= threshold`) с обеих сторон. Итог: **snapshot побайтово идентичен
old/new на всех 5 порогах**, включая `pendingCount/deadCount/cancelledCount/processingCount`,
`oldestPendingAt`, `retryDistribution`, `lastSuccessAt`, `retriesOverThreshold`.

CLI exit-semantics проверены живым `runProjectionHealthCli` на той же БД: degraded (dead=1) → exit 1,
после `DELETE ... WHERE status='dead'` и обнуления `attempts_done` → exit 0. Оба совпадают со
спецификацией `isProjectionHealthDegraded`.

Скретч-скрипт (`__d18c_audit_scratch.ts`) создавался только для этой проверки, прогонялся из
`apps/integrator`, удалён после использования — в финальном дереве отсутствует.

## 3. Kill-set — все 6 классов, живая инъекция и откат

| # | Класс | Метод | Результат |
|---|---|---|---|
| 1 | projection-health теряет метрику (`cancelledCount`) | Удалена ветка `else if (row.status === 'cancelled')` в `projectionHealthCore.ts`, прогнаны `projectionHealthCore.test.ts` + `projection-health.test.ts` | **Убито 2/2** — оба существующих теста упали (`cancelledCount: 0` vs `3`) |
| 2 | Параметр порога не биндится | `attempts_done >= ${threshold}` → `attempts_done >= ${DEFAULT_PROJECTION_HEALTH_RETRY_THRESHOLD}` (хардкод) | Существующие unit/CLI тесты **НЕ поймали** (оба фикстура используют `retryThreshold: 3` — совпадает с дефолтом). **Поймано только живым многопороговым harness §2** (mismatch на threshold=0/1/4/100). См. находку ниже. |
| 3 | DB error/threshold меняет exit code | `isProjectionHealthDegraded`: `deadCount > allowDead` → `deadCount >= allowDead` | **Убито 2/2** — оба существующих теста упали |
| 4 | Новый production `.query()` bypass (прямой) | Новый файл `apps/webapp/src/infra/repos/__d18c_audit_fault_direct.ts` с `pool.query(...)` | **Поймано** гейтом, exit 1 |
| 4a | bypass через destructuring alias | `__d18c_audit_fault_alias.ts`: `const { query } = pool; query(...)` | **Поймано** |
| 4b | bypass через dynamic computed member + optional chaining | `__d18c_audit_fault_dynamic.ts`: `pool?.[method]?.(...)` | **Поймано** |
| 4c | bypass через re-exported helper | `__d18c_audit_fault_helper.ts` (прямой `.query()`) + `__d18c_audit_fault_consumer.ts` (импортирует и вызывает) | **Поймано** — сам helper-файл флагован |
| 5 | Обычный production repo ошибочно классифицирован как low-level DB boundary | Новый файл `apps/webapp/src/infra/db/__d18c_audit_fault_boundary_repo.ts` с бизнес-запросом `pool.query('SELECT * FROM patients WHERE id = $1', ...)` | **НЕ поймано** — файл молча прошёл как `low-level DB port`. См. находку ниже. |
| 6 | Легитимный `execute(sql\`...\`)` / migrator / test-only harness блокируется | Baseline census: `migrate.ts` → `migration/deploy SQL executor`, все `*.devDb/.rls.integration.test.ts` → `test-only PostgreSQL harness`, self-test `Drizzle execute: allowed` | **Не блокируется** — классификация верна |

Каждая инъекция откатывалась немедленно после прогона (`rm`/`cp` бэкапа), после каждого шага
`git status --porcelain` пуст. Итог: **убито 4/6 классов чисто гейтом/существующими тестами, 1/6
(класс 2) поймано только дополнительным live-harness'ом аудитора, 1/6 (класс 5) не поймано никем**.

## 4. Находки

### MUST FIX — класс 5 (kill-set), webapp-граница осталась directory-wide, а не поимённой

Собственный пункт задачи брифа №4 требует: «Gate должен структурно разрешать только поимённые
минимальные boundary-категории … и падать … в новом production-файле». Для integrator и media-worker
это выполнено этим же коммитом — `portFiles` для обоих теперь явный список конкретных путей (плюс
отдельный `migrationExecutors`). Для **webapp это не выполнено**: `portDirs = ['apps/webapp/src/infra/db/']`
остался директорией целиком (строка не менялась этим коммитом — тот же список до и после,
`git show 034f79100 -- scripts/check-no-new-raw-sql.mjs`), и проверка `isInsidePort` — это
`fileName.startsWith(dir)`. Живая инъекция подтвердила: новый файл с обычным бизнес-запросом
(`SELECT * FROM patients WHERE id = $1`), помещённый прямо в `apps/webapp/src/infra/db/`, гейтом
**не флагуется вообще** — ни в списке offenders, ни как debt в census, он молча попадает в
классификацию `low-level DB port`.

Каталог сейчас содержит 15 файлов (`client.ts`, `withClient.ts`, `webappPoolProvider.ts`,
`bootProbe.ts`, `pgAdvisoryLock.ts`, `drizzleMutationTx.ts` и т.д.) — все прочитанные вручную
являются настоящими низкоуровневыми примитивами (advisory lock, boot-проба, pool provider), не
бизнес-репозиториями; **новой production debt этот коммит не внёс** (риск не нов — `portDirs` не
менялся). Но заявленная этим же коммитом цель («только поимённые минимальные boundary-категории»)
для webapp не достигнута, и ровно этот пробел явно входит в kill-set задания (`п.5`). Формально
именно этот файл (`scripts/check-no-new-raw-sql.mjs`) — предмет коммита; несделанная половина его
собственной задачи №4 — не «до этого коммита было хуже», а «этот коммит не закрыл то, что сам
заявил закрыть для одного из трёх приложений».

Рекомендация product fix (не выполнялась аудитором): заменить `portDirs` для webapp на явный
`portFiles`-список текущих 15 файлов, аналогично `integrator`/`media-worker`.

### Дополнительно к отчёту, не блокирует PASS — класс 2 не покрыт существующими unit/CLI тестами

`projectionHealthCore.test.ts` и `projection-health.test.ts` оба фиксируют `retryThreshold: 3`
(совпадает с `DEFAULT_PROJECTION_HEALTH_RETRY_THRESHOLD = 3`) — хардкод дефолта вместо байндинга
параметра прошёл бы оба теста незамеченным. Пойман только добавленным аудитором live multi-threshold
harness (§2). Это пробел покрытия, а не дефект самого продукта (SQL fragment на живой БД доказанно
биндит `${threshold}` корректно, §2) — тесты просто не варьируют порог. Acceptance-тест на это
аудитор не пишет (canon: «Недостающие acceptance-тесты можно оставить»).

## 5. Typecheck / lint / diff-check / диапазон изменений

- `pnpm --dir apps/integrator run typecheck` — OK.
- `pnpm --dir apps/webapp run typecheck` — OK.
- `npx eslint` по всем 6 изменённым файлам коммита — 0 замечаний.
- `git diff --check` — exit 0.
- `npx vitest run src/infra/db/repos/ src/infra/scripts/projection-health.test.ts` (integrator) —
  39 passed, 6 skipped (opt-in `USE_REAL_DATABASE`), 0 failed.
- Полный diff коммита `034f79100^..034f79100` — ровно 6 файлов:
  `apps/integrator/src/infra/db/repos/{projectionHealth.ts,projectionHealthCore.ts,projectionHealthCore.test.ts}`,
  `apps/integrator/src/infra/scripts/{projection-health.test.ts,projectionHealthPoolProvider.ts}`,
  `scripts/check-no-new-raw-sql.mjs`. D21/reminders (migration `0322`, policy/scheduler/worker/actions/UI,
  delivery target), `packages/platform-merge`, CMS/tariff/billing — **не затронуты**.
- DB/DEV/TEST/PROD не запускались; вся живая проверка — на throwaway PostgreSQL в `/tmp`.

## Вердикт

**MUST FIX** — к land не готов.

Killed: 4/6 kill-set классов чисто гейтом/существующими тестами, ещё 1/6 (класс 2, порог) закрыт
дополнительной live-проверкой аудитора и является риском только для будущих регрессий, а не для
текущего SQL (доказанно эквивалентен §2). **Непойманных: 1/6** — класс 5, webapp-граница
`check-no-new-raw-sql.mjs` осталась directory-wide вместо поимённой, что прямо противоречит
собственному пункту задачи коммита №4 и оставляет структурную дыру для будущего production debt
внутри `apps/webapp/src/infra/db/`.

Сам предмет коммита — перевод `projectionHealthCore` runtime/CLI с `query(text, params)` на
параметризованные Drizzle-фрагменты — поведенчески доказан эквивалентным живым прогоном и готов;
единственный блокер — незакрытая половина задачи №4 (webapp `portDirs` → `portFiles`) в том же файле,
который этот коммит и редактирует.
