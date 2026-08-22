# D17 — форма gate входящего получателя, проход 2

Дата: 2026-08-22

Ветка: `wt/recipient-door-gate-fix-20260822`

План: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D17

Оракул: `deploy/postgres/privileges/generate.mjs` — `runtime definer body is not context gated: %`

## Итог

Отказ генератора снят без ослабления гейта. У
`app.integrator_read_channel_binding_identity(text,text,text)` первым оператором после `BEGIN` теперь стоит
`PERFORM app.require_accepted_context(...)`; выбор `integrator` / `tenant_service` находится только в `CASE`
аргумента класса.

Добавлена узкая внутренняя проба `app.integrator_context_installed()`:

- owner: `app_seam_context_owner`;
- `invocation: 'internal'`;
- EXECUTE: только `app_seam_identity_lookup_owner`;
- возвращает только boolean класса и не возвращает `integrator_user_id`;
- runtime capability для неё нет, то есть третьей двери нет.

Единственным аксессором личности как значения остаётся `app.current_integrator_user_id()`.

## Почему проба узкая, а не обобщённая

Существующий `app.require_attested_target_role(name,name[])` возвращает точную роль и fail-closed поднимает
ошибку при отсутствии принятого контекста. Нужная здесь проба имеет другой контракт: ничего не принимает, не
возвращает роль или личность и не поднимает отказ при tenant-ветке; она только выбирает класс для следующего
обязательного `require_accepted_context`. Обобщение смешало бы проверку с неавторитетной boolean-пробой и
потребовало бы общего селектора атрибутов контекста. Поэтому оставлена узкая функция на этот смысл, а не функция
на каждый класс и не размывание существующего helper.

## Изменения

1. Миграция создаёт boolean-пробу отдельным statement с owner-метаданными
   `app_seam_context_owner`, затем отдельным statement заменяет тело корня от
   `app_seam_identity_lookup_owner`.
2. Декларация описывает пробу как `SECURITY DEFINER`, `VOLATILE`, `PARALLEL UNSAFE`, internal и выдаёт EXECUTE
   поимённо одному спрашивающему шву.
3. Каталог-тест фиксирует owner, internal invocation, boolean return, точный execute-list и отсутствие runtime
   capability.
4. Перегенерированы только privilege-артефакты DEV и TEST. Port-context capability-артефакты не изменились:
   проба не является дверью.
5. `generate.mjs` не менялся.

## DEV: обе двери и обе ошибочные ветки

Команда выполнялась только на именованной DEV через Unix socket:

```bash
sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -p 5432 -d bcb_webapp_dev <<'SQL'
BEGIN;
-- Внутри транзакции: применить изменённую миграцию; выставить owner/EXECUTE пробе ровно как в generated SQL;
-- материализовать две declared capability одного корня с ролью app_integrator_request и классами
-- tenant_service/integrator; по очереди установить accepted context с совпадающими typed args.
-- Контроль: штатная проба. Инъекция 1: CREATE OR REPLACE probe AS SELECT true под tenant context.
-- Контроль: штатная проба. Инъекция 2: CREATE OR REPLACE probe AS SELECT false под integrator context.
-- Затем восстановить тело миграцией и выполнить точный предикат generate.mjs.
ROLLBACK;
SQL
```

Вызовы были сделаны под `SET LOCAL ROLE app_integrator_request`; временный `USAGE` языка `plpgsql` нужен был
только анонимным блокам, ловящим SQLSTATE, и также откачен. Результат:

```text
NOTICE:  TENANT_CORRECT_BRANCH sqlstate=22023
NOTICE:  INJECT_TENANT_TO_INTEGRATOR sqlstate=42501
NOTICE:  INTEGRATOR_CORRECT_BRANCH sqlstate=22023
NOTICE:  INJECT_INTEGRATOR_TO_TENANT sqlstate=42501
```

`22023` здесь — ожидаемая следующая проверка тела для двух пустых ключей: она доказывает, что правильная дверь
принята и выполнение прошло дальше gate. Обе подмены boolean-ответа выбрали не установленный портом класс и были
независимо отвергнуты `require_accepted_context` с `42501`: проба выбирает, но не решает.

Вся материальная часть доказательства находилась между `BEGIN` и `ROLLBACK`; DEV после прогона не изменён.

## Тот же предикат генератора

В той же rollback-only DEV-транзакции выполнен предикат из `generate.mjs` около строки 1530:

```sql
SELECT p.oid::regprocedure AS root,
       substring(p.prosrc FROM position('BEGIN' IN upper(p.prosrc)))
         !~* '^BEGIN[[:space:]]+PERFORM[[:space:]]+app[.](require_accepted_context|require_attested_context_for_roles)[[:space:]]*[(]' AS is_bad
  FROM pg_proc AS p
 WHERE p.oid = 'app.integrator_read_channel_binding_identity(text,text,text)'::regprocedure;
```

```text
root                                                          | is_bad
app.integrator_read_channel_binding_identity(text,text,text)   | f
```

Граница пробы измерена в той же транзакции запросом
`SELECT pg_get_userbyid(p.proowner), has_function_privilege('app_seam_identity_lookup_owner',p.oid,'EXECUTE'), has_function_privilege('app_integrator_request',p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid='app.integrator_context_installed()'::regprocedure;`:

```text
helper_owner             | identity_seam_execute | runtime_role_execute
app_seam_context_owner   | t                     | f
```

## Стена арендатора

Предикат стены и всё тело от `v_org := app.current_org_id();` до конца миграции не менялись относительно входного
коммита. Точная команда сравнения:

```bash
sha256sum \
  <(sed -n '/^  v_org := app.current_org_id();/,$p' apps/webapp/db/drizzle-migrations/20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal.sql) \
  <(git show HEAD:apps/webapp/db/drizzle-migrations/20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal.sql | sed -n '/^  v_org := app.current_org_id();/,$p')
```

Оба потока: `ff6b2cc4a17d623e180a516b18b71da2ffc284e2ee62b74cad24854e6e8ab2b9`.

Поэтому повторно не подменялось байт-в-байт то же тело: уже выполненная слепая инъекция B в
`INCOMING_EVENT_RECIPIENT_DOOR_2026-08-22.md`, §4, вырезала именно этот неизменившийся предикат. Она меняет
результат под новой integrator-дверью с `0` строк на `1` строку чужой клиники (`00000000-…-0001`). Это
доказательство остаётся применимо к текущему телу; gate-only правка его не затронула.

## Проверки

Каждая цифра ниже получена названной рядом командой.

- `/home/dev/brain/host-orch/run-tests.sh "pnpm test:db-privileges > /tmp/recipient-door-db-privileges.log 2>&1"`
  — EXIT 0; `tail -n 16 /tmp/recipient-door-db-privileges.log`: tests 241, pass 146, fail 0, skipped 95.
- `pnpm typecheck` — EXIT 0; все workspace typecheck, включая integrator и webapp, завершены `Done`.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm test > /tmp/recipient-door-integrator-tests.log 2>&1"`
  — EXIT 0; `tail -n 20 /tmp/recipient-door-integrator-tests.log`: 109 passed / 1 skipped test files;
  565 passed / 2 expected fail / 1 skipped tests.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` — EXIT 0; privilege и allowlist артефакты
  DEV/TEST совпадают побайтно.
- `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check` — EXIT 0; capability
  артефакты DEV/TEST совпадают побайтно.
- `git diff --check` — EXIT 0.

Первый integrator-прогон до `pnpm typecheck` не был поведенческим прогоном: свежий worktree не имел собранного
entry point пакета `@bersoncare/db-principal`, поэтому 79 файлов не импортировались. Корневой `pnpm typecheck`
собрал workspace-пакеты; после этого полный повторный integrator-прогон дал приведённый выше зелёный результат.

## Не выполнялось

`--execute`, `--preflight`, перенос секретов/`.env`, TEST runtime, PROD, deploy, push и full CI не запускались.
Это ровно границы брифа; preflight остаётся ведущему.
