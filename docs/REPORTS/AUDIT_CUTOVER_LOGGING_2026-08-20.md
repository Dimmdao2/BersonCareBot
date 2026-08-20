# Аудит `6fbf39cb2`: cutover logging и dry run

## Вердикт

**FAIL**

Диапазон аудита: `6fbf39cb2^..6fbf39cb2` (`958008bdf5361d5e5ac21850ac90b6d58dbde021..6fbf39cb223be12692d46659e31cc7366bae4c6a`).
Метод: **ВЗГЛЯД** по `AGENTS.md` §10, §10a и §24.4; постоянные тесты текста SQL не создавались, БД не запускалась.

## Findings

### 1. `deploy/postgres/prod-to-target-cutover.sql:6-9` — отсутствующий mode принимается как `commit`

Что ломается: запуск canonical SQL-entrypoint без `-v cutover_mode=...` не попадает в refusal с SQLSTATE
`22023`. Строки 6-9 подставляют `commit`, строки 15-26 принимают его, после чего достижим `COMMIT` в
`deploy/postgres/prod-to-target-cutover-finish.sql:469`. Это нарушает заданное требование: typo, пустое и
**неустановленное** значение должны отказываться до cutover; неизвестный/отсутствующий mode не должен иметь
commit-default.

Как установлено:

```text
deploy/postgres/prod-to-target-cutover.sql:6-9
\if :{?cutover_mode}
\else
  \set cutover_mode commit
\endif

deploy/postgres/prod-to-target-cutover.sql:17
IF current_setting('bcb.cutover.requested_mode') NOT IN ('commit', 'dryrun') THEN

deploy/postgres/prod-to-target-cutover-finish.sql:465-470
\if :cutover_is_dryrun
ROLLBACK;
...
\else
COMMIT;
```

Разбор трёх входов:

- typo: строковый literal не входит в allowlist, поэтому `22023` до `BEGIN` — PASS;
- пустое значение: `''` не входит в allowlist, поэтому `22023` до `BEGIN` — PASS;
- переменная отсутствует: заменяется на `commit`, проходит allowlist и достигает commit-ветки — **FAIL**.

### 2. `deploy/postgres/prod-to-target-cutover-start.sql:7-14` — центральное утверждение о неизменном поведении неверно

Что меняется: в parent `958008bdf` `prod-to-target-carry-legacy-appointments.sql` исполнялся **до** основного
`BEGIN` и самостоятельно делал `BEGIN/COMMIT`. Теперь основной `BEGIN` находится перед include, а
`deploy/postgres/prod-to-target-carry-legacy-appointments.sql:11-14,281-284` подавляет свой `BEGIN/COMMIT` при
наличии `cutover_parent_transaction`.

Достижимое отличие: при прямом запуске cutover, если carry записал отсутствующие appointments, а любой более
поздний шаг упал, в parent carry-строки уже оставались committed; после `6fbf39cb2` они откатываются вместе со
всем cutover. При успешном commit итоговые строки те же, и изменение соответствует цели одной атомарной
транзакции, но утверждение «изменение ничего не меняет в поведении с данными» всё равно ложно: изменена
персистентность carry на error path.

Как установлено:

```text
git diff --unified=0 6fbf39cb2^ 6fbf39cb2 -- deploy/postgres | \
  rg '^[+-]\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|BEGIN;|COMMIT;|ROLLBACK;|\\ir)' || true

-COMMIT;
+ROLLBACK;
+COMMIT;
-\ir prod-to-target-carry-legacy-appointments.sql
+\ir prod-to-target-carry-legacy-appointments.sql
```

Полный hunk показывает смену порядка `include → BEGIN` на `BEGIN → include` и условные transaction boundaries
в carry-файле. Таким образом, изменённых строк `INSERT/UPDATE/DELETE/...` действительно нет, но это не доказывает
неизменность поведения транзакции.

## Проверка остальных требований

### 1. Dry run действительно dry — PASS

- `BEGIN` выполняется в `prod-to-target-cutover-start.sql:7` до первого mutating statement canonical cutover.
- `dryrun` выбирает только `ROLLBACK` (`prod-to-target-cutover-finish.sql:465-470`); другой достижимый `COMMIT`
  внутри include-closure отсутствует, потому что carry видит `cutover_parent_transaction`.
- На любой SQL/client error после `BEGIN` действует `ON_ERROR_STOP`; `psql` завершается, соединение закрывается,
  незавершённая транзакция откатывается.
- По include-closure не найдены `\connect`, `\copy`, `\!`, `\gexec`, `\quit`, `NOTIFY`, `dblink`, file I/O,
  `CREATE/DROP DATABASE`, `ALTER SYSTEM`, `CREATE INDEX CONCURRENTLY` или advisory-lock side effects.
- `setval` есть в `prod-to-target-cutover-data.sql:1492-1494` и generated ledger. Он относится только к target
  sequences в заново созданных после `BEGIN` схемах; например sequence создаётся в
  `generated/prod-to-target/schema-pre.sql:22203`, а затем получает value в
  `generated/prod-to-target/ledgers-and-baseline.sql:146`. При rollback сами новые target sequences исчезают;
  переименованные source sequences не reseed-ятся.
- `set_config('bcb.cutover.requested_mode', ..., false)` выполняется до `BEGIN`, но это session-local GUC без
  сохранения в БД; соединение завершается после psql.

Ранний отказ mode-validation происходит до data/DDL. Ранний отказ любого следующего шага происходит внутри
транзакции. Dry-run `ROLLBACK` исполняется до wrapper-выхода.

### 2. Unknown mode — FAIL только для unset

Typo и empty отказываются с `22023`; unset становится `commit`. Это finding 1.

### 3. Error path всё ещё abort — PASS

Команда:

```text
rg -n '^\\set\s+ON_ERROR_STOP\s+' deploy/postgres/prod-to-target-cutover.sql \
  deploy/postgres/prod-to-target-cutover-start.sql \
  deploy/postgres/prod-to-target-cutover-data.sql \
  deploy/postgres/prod-to-target-cutover-finish.sql \
  deploy/postgres/prod-to-target-carry-legacy-appointments.sql \
  deploy/postgres/prod-to-target-cutover-known-missing-media.sql \
  deploy/postgres/prod-to-target-patient-membership-manifest.sql \
  deploy/postgres/generated/prod-to-target/*.sql
```

Вывод:

```text
deploy/postgres/prod-to-target-cutover-data.sql:1:\set ON_ERROR_STOP on
deploy/postgres/prod-to-target-cutover-start.sql:1:\set ON_ERROR_STOP on
deploy/postgres/prod-to-target-cutover.sql:1:\set ON_ERROR_STOP on
deploy/postgres/prod-to-target-patient-membership-manifest.sql:1:\set ON_ERROR_STOP on
deploy/postgres/prod-to-target-cutover-finish.sql:1:\set ON_ERROR_STOP on
deploy/postgres/prod-to-target-carry-legacy-appointments.sql:1:\set ON_ERROR_STOP on
```

Ни один include не переключает `ON_ERROR_STOP` в `off`. Добавленные `SELECT ... \gset`, `DO` и отчётные
запросы не содержат exception handlers, которые могли бы проглотить ошибку. Wrapper имеет
`set -euo pipefail` (`deploy/host/deploy-test-saas.sh:22`), поэтому ненулевой psql не переходит к success-ветке.

### 4. Персональные данные не печатаются — PASS

Все новые summary-поля просмотрены. Они выводят counts, булевы инварианты, имена классов/шагов, canonical
organization UUID, timestamps и закрытые category/status values. D18 и D19 выводят только количества contacts,
handles и blocked bindings; D20 не выводит recipient/message/address/body, только фиксированный
`appointment_reminder`, count и границы `next_retry_at`. Ни name, phone, email, handle, message body, raw payload
или credential-bearing URL в новых reports не выводятся.

### 5. Reports переживают пустой input — PASS

Каждый step-summary остаётся одно-row `SELECT json_build_object(...)`: `count(*)` даёт `0`; `min/max` в D20
дают JSON `null`; суммарные поля используют `coalesce(..., 0)` там, где aggregate иначе nullable. Деления нет.
PL/pgSQL counters D01/D07/D15 и `rowsWritten` инициализируются нулём и записываются даже при нулевом числе
итераций/вставок. `\gset` поэтому получает одну строку и не падает на legitimately empty relations.

### 6. Wrapper flag — PASS

- `deploy/host/deploy-test-saas.sh:2328` только выбирает `CUTOVER_MODE=dryrun`;
- destructiveness не скрыта: `deploy-test-full-reset.sh:25-32` и повторно
  `deploy-test-saas.sh:2350-2353` требуют отдельный `--confirm-full-reset`;
- usage прямо говорит, что preceding reset/data-preparation stages unchanged;
- commit path остаётся отдельным default `CUTOVER_MODE=commit` и явно передаётся psql на строке 2649;
- dryrun выходит только после успешного psql/ROLLBACK на строках 2652-2654; при psql error `set -e` не позволяет
  напечатать success и выйти нулём.

Статический shell parse:

```text
bash -n deploy/host/deploy-test-saas.sh deploy/host/deploy-test-full-reset.sh
```

Вывод: отсутствует, exit `0`.

## Классификация всех hunks

| Файл | Классификация | Итог по data behavior |
| --- | --- | --- |
| `deploy/postgres/prod-to-target-cutover.sql` | mode validation + reporting | DML нет; unset→commit — finding 1 |
| `deploy/postgres/prod-to-target-cutover-start.sql` | reporting + mode/transaction switch | include перенесён внутрь transaction — finding 2 |
| `deploy/postgres/prod-to-target-carry-legacy-appointments.sql` | reporting + conditional parent transaction | predicates/columns DML прежние; commit boundary изменена |
| `deploy/postgres/prod-to-target-cutover-data.sql` | reporting | добавлены counters, `GET DIAGNOSTICS`, read-only CTE D20 и summaries; DML/predicates/joins/ordering/column lists не изменены |
| `deploy/postgres/prod-to-target-cutover-finish.sql` | reporting + mode switch | прежний unconditional `COMMIT` заменён `ROLLBACK/COMMIT`; mutating F01-F04 неизменны |
| `deploy/host/deploy-test-saas.sh` | wrapper mode switch | dryrun flag и explicit psql variable; destructive confirmation сохранён |
| `docs/REPORTS/CUTOVER_STEP_LOGGING_2026-08-20.md` | самоотчёт автора | executable behavior отсутствует; его claims не использовались как доказательство |

Проверка removed predicate/join/DML lines:

```text
git diff --unified=0 6fbf39cb2^ 6fbf39cb2 -- deploy/postgres | \
  rg '^-[^-].*\b(WHERE|JOIN|ON\s+CONFLICT|ORDER\s+BY|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b' || true
```

Вывод состоит только из прежних полей финального read-only summary, перенесённых внутрь `endState`:

```text
-  'activeEnrollments', (SELECT count(*) FROM public.org_enrollments WHERE status = 'active'),
-    SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NOT NULL
-    SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NULL
-    CROSS JOIN LATERAL jsonb_array_elements(conversation.pending_message_drafts) draft_payload
-    WHERE draft_payload->>'cutoverSource' = 'integrator.message_drafts'
-    WHERE status IN ('pending', 'processing', 'failed_retryable')
```

Для mutating statements не найдено изменённых predicates, joins, `WHERE`, `ON CONFLICT`, ordering или column
lists. Новые temp tables отсутствуют; добавленный D20 CTE живёт только в одном отчётном `SELECT` и не виден
следующим шагам.

## Основные команды и вывод

```text
git status --short --branch
## wt/cutoverlog-20260820

git show --no-patch --format='commit=%H%nparent=%P%ndate=%aI%nsubject=%s' 6fbf39cb2
commit=6fbf39cb223be12692d46659e31cc7366bae4c6a
parent=958008bdf5361d5e5ac21850ac90b6d58dbde021
date=2026-08-20T14:47:49+03:00
subject=feat(cutover): report every migration step and add dry run

git diff --stat 6fbf39cb2^ 6fbf39cb2
 deploy/host/deploy-test-saas.sh                    |  11 +
 .../prod-to-target-carry-legacy-appointments.sql   |  26 +-
 deploy/postgres/prod-to-target-cutover-data.sql    | 483 ++++++++++++++++++++-
 deploy/postgres/prod-to-target-cutover-finish.sql  | 205 +++++++--
 deploy/postgres/prod-to-target-cutover-start.sql   | 146 ++++++-
 deploy/postgres/prod-to-target-cutover.sql         | 106 +++++
 docs/REPORTS/CUTOVER_STEP_LOGGING_2026-08-20.md    | 250 +++++++++++
 7 files changed, 1189 insertions(+), 38 deletions(-)

git diff --check 6fbf39cb2^ 6fbf39cb2
(вывода нет, exit 0)
```

Каждый SQL-файл просматривался отдельной командой
`git diff --no-ext-diff --unified=<N> 6fbf39cb2^ 6fbf39cb2 -- <path>`; все hunks перечисленных файлов и
добавленный самоотчёт прочитаны. Include-closure получен через `rg -n '^\\ir '`; незаявленных include не
обнаружено.

БД, deploy, PROD/TEST, существующие тесты и full CI не запускались: brief назначил проверку «ВЗГЛЯД», а
`AGENTS.md` §10a запрещает выдавать постоянный тест текста SQL за доказательство этой разовой правки.

## ВНЕ ДИФФА

Findings вне диапазона `6fbf39cb2^..6fbf39cb2` не обнаружены.
