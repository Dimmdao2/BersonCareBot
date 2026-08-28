# Независимый аудит rollback-only DB-proof полного удаления учётки — 28.08.2026

Кандидат: `d0a296db0` (`wt/account-purge-proof-20260828`). Authority: `AGENTS.md` §1b, §10a,
§10b, §24 и этап 3
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`.

## Классификация «тест или взгляд» до чтения теста

1. Состав candidate, fail-closed permanent-delete, отсутствие route/CLI и чистота дерева — разовое
   состояние, проверяется diff/интроспекцией.
2. Реальная одна транзакция на именованной TEST-БД, безусловный rollback и обнаружение потери классов
   user-scoped данных — повторяемое поведение, проверяется живой пробой и blind fault injection.
3. Происхождение ожиданий из живого FK-графа и lifecycle registry — разовое состояние конструкции
   oracle, проверяется чтением и DB-интроспекцией.
4. Explicit-delete, cascade, anonymised survival, via-parent, phone-keyed, final delete, сбор артефактов
   до потери ключей и rollback restoration — повторяемое поведение, проверяется живой пробой и blind
   fault injection при наличии живого факта.
5. Граница transactional DB-core против post-commit S3/media/audit policy — разовое состояние,
   проверяется чтением; непроверенное не закрывается.

## Pre-read kill-set

Список составлен **до открытия**
`apps/webapp/src/infra/platformUserFullPurge.devDbProof.test.ts`. Источники: authority, production
`platformUserFullPurge.ts`, `strictPlatformUserPurge.ts` и `journal-lifecycle-registry.ts`. Отчёт автора
и его инъекции доказательством не считались.

| ID  | Независимая правдоподобная поломка                                                                | Обязательный oracle                                                                 |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| K01 | Запуск без opt-in либо разрешение БД не с exact именем `bersoncarebot_test`                       | Default skip; любое другое имя отклоняется до DML                                   |
| K02 | `BEGIN`, advisory lock, core или `ROLLBACK` идут через разные соединения; ошибка обходит rollback | Одна сессия несёт lock и всю транзакцию; error path всегда откатывает               |
| K03 | Тест переписывает delete-order вместо production entry point                                      | Вызываются настоящие `collectPurgeArtifactKeys` и `runWebappPurgeCoreInTransaction` |
| K04 | Oracle становится второй ручной delete-list либо пропускает новый FK/registry drift               | Поверхности выводятся из live `pg_constraint`, explicit production roots и registry |
| K05 | Из roots исчезает FK-less `reminder_occurrence_history`                                           | Непустой факт после core исчезает                                                   |
| K06 | Из roots исчезает `ON DELETE SET NULL` relation, например `be_appointments`                       | Непустой факт удаляется явно, а не переживает purge с `NULL`                        |
| K07 | Финальный platform-user delete не выполняется                                                     | Target и живые cascade branches исчезают                                            |
| K08 | Anonymised relation удаляется вместо survival                                                     | User reference исчезает, relation total сохраняется                                 |
| K09 | Отключено phone-keyed удаление                                                                    | Непустой факт исчезает по цифрам исходного телефона                                 |
| K10 | Via-parent child не исчезает вместе с parent                                                      | Непустой via-parent факт после core отсутствует                                     |
| K11 | Artifact collection идёт после потери ключей либо теряет media/intake/patient-file root           | Collection до core; proof только на непустом live факте                             |
| K12 | Rollback oracle сверяет subset либо не возвращает изменённые строки                               | Before/after/rollback для direct, phone-keyed и via-parent совпадает после rollback |
| K13 | Public permanent-delete/CLI становится достижимым ради пробы                                      | Route остаётся `account_purge_disabled`, CLI не добавлен, production diff пуст      |
| K14 | Vitest не выбирает файл или default делает DB action                                              | Точный run выбирает файл; default целиком skipped; opt-in исполняет assertions      |

## Точные команды и результаты

**E1 — состав candidate:**

```bash
git diff-tree --no-commit-id --name-status -r d0a296db0
```

Результат: только `A apps/webapp/src/infra/platformUserFullPurge.devDbProof.test.ts` и
`M docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`.

**E2 — default selection без DB action:**

```bash
pnpm --dir apps/webapp exec vitest run src/infra/platformUserFullPurge.devDbProof.test.ts
```

Результат финального прогона: exit `0`; `Test Files 1 skipped (1)`, `Tests 9 skipped (9)`.

**E3 — исходный живой candidate и общий fault-run:**

```bash
RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run \
  src/infra/platformUserFullPurge.devDbProof.test.ts
```

Результат до audit-добавлений: exit `0`; `Test Files 1 passed (1)`, `Tests 9 passed (9)`.
Тот же результат получен после error-path fault и его отката, поэтому временная DML не пережила rollback.

**E4 — запрет другой именованной БД:**

```bash
RUN_PLATFORM_USER_PURGE_DB=1 PLATFORM_USER_PURGE_DB=bcb_webapp_dev \
  pnpm --dir apps/webapp exec vitest run src/infra/platformUserFullPurge.devDbProof.test.ts
```

Результат: exit `1`, suite остановлен до тестов с `only 'bersoncarebot_test' is allowed`.

**E5 — фактическое отсутствие registry relation на TEST:**

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -At \
  -c "BEGIN READ ONLY; SELECT concat(n.nspname, '.', c.relname), c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='be_appointment_events'; COMMIT;"
```

Результат: между `BEGIN` и `COMMIT` relation row отсутствует.

**E6 — финальный acceptance run:**

```bash
RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run \
  src/infra/platformUserFullPurge.devDbProof.test.ts
```

Результат: exit `1`; `Test Files 1 failed (1)`, `Tests 1 failed | 8 passed (9)`. Красный assertion:
`keeps the written lifecycle registry in step with the live constraint graph`; лишняя divergence:
`public.be_appointment_events ... live cascading path absent`.

**E7 — точечная validation:**

```bash
pnpm --dir apps/webapp exec eslint src/infra/platformUserFullPurge.devDbProof.test.ts
pnpm --dir apps/webapp typecheck
```

Результат обеих команд: exit `0`. Full CI по brief не запускался.

**E8 — отсутствие временных production-правок:**

```bash
git diff -- apps/webapp/src/infra/platformUserFullPurge.ts \
  apps/webapp/src/infra/db/pgAdvisoryLock.ts \
  apps/webapp/src/infra/strictPlatformUserPurge.ts \
  'apps/webapp/src/app/api/doctor/clients/[userId]/permanent-delete/route.ts'
```

Результат: пустой diff.

## Матрица требований

| Требование                                                                  | Verdict                            | Точное evidence                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Candidate меняет только тест и план                                         | PASS                               | E1, E8                                                                                                                    |
| Opt-in и exact TEST database                                                | PASS                               | E2, E4; `current_database()` повторно сверяется после открытия сессии                                                     |
| Существующий живой client, без fixture/disposable DB                        | PASS                               | E3; selection берёт существующий `role='client'` и fail-closed требует живые named classes                                |
| Одна PostgreSQL-сессия, transaction, advisory lock и unconditional rollback | PASS после добавленного acceptance | Один `AdminSocketClient`; live `pg_locks.pid = pg_backend_pid()`; FI02, FI03                                              |
| Настоящий production DB-core, без копии delete-order                        | PASS                               | Тест вызывает production collection и core; DML delete-order остаётся в production                                        |
| Live FK + production roots + registry действительно согласованы             | **FAIL**                           | E5, E6: registry-declared `via-parent` relation/cascade отсутствует на TEST                                               |
| Каждый заявленный DB-core класс имеет живой факт                            | PASS                               | Selection и assertions требуют FK-less explicit, `SET NULL` explicit, cascade, anonymised, phone-keyed и via-parent facts |
| После core нет FK на user; explicit/cascade/final delete работают           | PASS                               | FI04–FI07                                                                                                                 |
| Anonymised survival, via-parent и phone-keyed работают                      | PASS                               | FI07–FI09                                                                                                                 |
| Полный before/after/rollback oracle                                         | PASS после добавленного acceptance | Candidate не повторял phone/via measurements; добавленный oracle пойман FI10                                              |
| Artifact keys собраны до потери ключей и доказаны на живом факте            | **BLOCKED**                        | Вызов стоит до core, но у выбранного client нет media/intake/patient-file факта; пустое равенство proof не считается      |
| Public route/CLI disabled, product не изменён                               | PASS                               | Route возвращает `account_purge_disabled`; E1, E8                                                                         |
| Vitest выбирает файл, default не открывает DB                               | PASS                               | E2, E3                                                                                                                    |
| План не завышает proof и не сохраняет лишние identifiers                    | **FAIL**                           | План сохраняет raw UUID и `integrator_user_id`, а также не фиксирует E5/E6; post-commit/artifact boundary описана честно  |

## Fault injection

FI02–FI10 выполнялись точной командой E3 после названной временной мутации; FI01 — точной командой E4.

| ID      | Что сломано                                                                            | Какое утверждение покраснело                                                                           |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| FI01    | Разрешена нецелевая `bcb_webapp_dev` через override                                    | Suite до DML: exact TEST database                                                                      |
| FI02    | Production `pgAdvisoryXactLock` превращён в no-op                                      | `the production advisory lock is not held by this transaction`                                         |
| FI03    | Production core бросает ошибку после phone-keyed delete                                | `ran the purge core...` / `setupError`; E3 после отката снова зелёный                                  |
| FI04    | Из production roots удалён FK-less `reminder_occurrence_history`                       | `deletes the rows of every relation...` и registry assertion                                           |
| FI05    | `deleteContentTablesForUser` пропускает `be_appointments` — инъекция вне списка автора | `deletes the rows...` на `public.be_appointments.platform_user_id`                                     |
| FI06    | `be_appointments` целиком удалён из `CONTENT_TABLES`                                   | Candidate был зелёным; добавленный parent oracle красит registry assertion: parent `is not purge-gone` |
| FI07    | Финальный platform-user `DELETE` заменён на `SELECT`                                   | No-FK-left, delete/cascade, anonymised-reference и via-parent assertions                               |
| FI08    | `product_analytics_events_recent` удаляется вместо anonymisation                       | `keeps ON DELETE SET NULL rows alive...`                                                               |
| FI09    | Production phone-keyed call превращён в no-op                                          | `clears the phone-keyed stores...` на `public.phone_challenges`                                        |
| FI10    | Rollback snapshot phone-keyed намеренно искажён                                        | `restores every measured count after the rollback`                                                     |
| REAL-01 | Исходный registry проверен добавленным `via-parent` acceptance oracle                  | E6: `public.be_appointment_events ... live cascading path absent`                                      |

**Подсчёт:**

```bash
rg -c '^\| FI[0-9]{2} ' docs/_TODO/runs/ACCOUNT_PURGE_CORE_DB_PROOF_AUDIT_2026-08-28.md
rg '^\| FI[0-9]{2} .*НЕПОЙМАН' docs/_TODO/runs/ACCOUNT_PURGE_CORE_DB_PROOF_AUDIT_2026-08-28.md | wc -l
rg -c '\*\*BLOCKED\*\*' docs/_TODO/runs/ACCOUNT_PURGE_CORE_DB_PROOF_AUDIT_2026-08-28.md
```

Результаты команд по порядку: `10`, `0`, `1`. То есть все выполненные fault injections пойманы;
непойманных среди них нет; один класс имеет `BLOCKED` evidence. Artifact collection для
media/intake/patient-file остаётся непроверенным живым фактом, а не объявляется зелёным.

## Граница доказательства

Доказано только transactional DB-core: DB delete/anonymise/cascade, phone-keyed/via-parent поведение,
production advisory xact lock и rollback. Не доказаны: post-commit удаление `media_files`, S3/provider cleanup,
audit write (включая политику raw identifiers), artifact capture на непустом live факте и весь включённый
account-delete flow. Public destructive route остаётся fail-closed.

## Итог

**FAIL.** Candidate DB-core выполняется и rollback восстанавливает проверенные живые данные, но proof пропустил
реальное расхождение registry↔live TEST и имел неполный rollback oracle для phone-keyed/via-parent. Недостающий
acceptance-test оставлен; он падает на исходном registry state. План дополнительно нарушает brief, сохраняя
ненужные raw runtime identifiers. Product-код не исправлялся.
