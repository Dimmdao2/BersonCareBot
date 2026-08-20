# Починка FAIL-B независимого гейта — путь A→B0 снова исполним

**Дата:** 2026-08-20 · **Ветка:** `wt/restore-ab-20260820` · **По итогам:** `docs/REPORTS/AUDIT_RESTORE_AB_2026-08-20.md`
(независимый гейт Opus, вердикт FAIL, единственная несущая находка — пункт B: путь full-reset TEST
детерминированно не доходит до конца).

## Итог

Все файлы, которых не хватало на исполняемом пути full-reset TEST, восстановлены или заменены сегодняшним
механизмом. Плюс к 9 файлам, названным в отчёте гейта, найдено (не гейтом — собственной проверкой каждого
`\ir`/внешнего вызова на глубину) ещё 3, без которых путь снова падал бы чуть дальше:

- 2 файла — вложенные `\ir`-включения внутри уже названных гейтом файлов (`prod-to-target-cutover-data.sql`
  и `pre-cutover-data-stage-assertions.sql` сами `\ir`-подключают ещё две сущности гейт не проверял, потому
  что сами файлы-включатели на момент аудита отсутствовали).
- 1 файл (`cutover-postgres-port-context.sh`) оказался исполним по имени, но структурно несовместим внутри:
  его единственный субпримитив (`initial-cutover.mjs`) не просто отсутствует — его собственные зависимости
  (`post-zero-roots.sql`, `generated/zero-state.*.sql`, флаги `--zero-state*`/`--target-login-cleanup`
  генератора) не существуют в сегодняшнем дереве вообще, ни под старым, ни под новым именем. Восстановление
  файла один-в-один не сделало бы путь исполнимым — команда внутри упала бы на «неизвестный флаг».

## 12 восстановленных/изменённых файлов

### 10 восстановлены байт-в-байт из истории, без изменений (проверено: ни в одном нет GRANT/REVOKE/CREATE ROLE/ALTER ROLE/OWNER TO/обезличивания)

Достаты из `bfe6b48f0^` (коммит, который их снёс, минус один):

| файл | строк | \ir-родитель |
|---|---:|---|
| `deploy/postgres/pre-cutover-data-stage-assertions.sql` | 175 | вызывается `deploy-test-saas.sh:3492` |
| `deploy/postgres/prod-to-target-cutover-start.sql` | 334 | `prod-to-target-cutover.sql` |
| `deploy/postgres/prod-to-target-cutover-data.sql` | 1155 | `prod-to-target-cutover.sql` |
| `deploy/postgres/prod-to-target-cutover-finish.sql` | 321 | `prod-to-target-cutover.sql` |
| `deploy/postgres/prod-to-target-cutover-known-missing-media.sql` | 148 | **новое**: `prod-to-target-cutover-data.sql:246` |
| `deploy/postgres/prod-to-target-patient-membership-manifest.sql` | 134 | **новое**: `prod-to-target-cutover-data.sql:926` и `pre-cutover-data-stage-assertions.sql:11` |
| `deploy/postgres/generated/prod-to-target/schema-pre.sql` | 19319 | `prod-to-target-cutover.sql` |
| `deploy/postgres/generated/prod-to-target/schema-post.sql` | 21254 | `prod-to-target-cutover.sql` |
| `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` | 640 | `prod-to-target-cutover.sql` |
| `deploy/postgres/generated/prod-to-target/runtime-settings.sql` | 123 | `prod-to-target-cutover.sql` |

Классификация из `B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md` уже называла первые 8 (включая два
«новых» выше) как «нужны, не восстановлены, вне именованного скоупа»; я лишь исполнил то, что она уже
пометила как требуемое.

**Риск, названный, не устранённый:** 4 файла `generated/prod-to-target/*.sql` — не статические файлы, а
снимок живой `bcb_webapp_dev`, который берёт `scripts/refresh-prod-to-target-cutover.mjs`. Я вернул версию
на момент удаления (17.08); с тех пор DEV мог уйти вперёд (новые пост-B0 миграции). Проверка `pnpm run
check:prod-to-target-cutover` (`refresh-prod-to-target-cutover.mjs --check`) обязана заново пройти на живом
DEV перед реальным прогоном шагов 4–5 владельца — это именно то место в его порядке, где «шаг 2 идёт после
шага 1»: свежий снимок берётся ПОСЛЕ того, как миграции легли на DEV. Я это не запускал (бы дало живой
контакт с DEV-кластером; бриф разрешает только дерево и `bash -n`). Это не файл-провал, а ожидаемое
состояние до следующего живого шага.

### 1 файл восстановлен из `9ebea6963^`, изменена ОДНА функция

`deploy/host/cutover-postgres-port-context.sh` (224 строки) — восстановлен целиком (mTLS material,
резервная копия env-файлов, mTLS HBA, окно готовности, восстановление лимита подключений — вся эта
инфраструктурная хореография сегодня ничем не заменена и не устарела: `deploy-test.sh` её не делает, потому
что делает только для УЖЕ провизионированного хоста, а не с нуля).

Единственная изменённая функция — `port_context_cutover_install_target()`. Было: вызов
`deploy/postgres/privileges/initial-cutover.mjs` (сам удалён тем же коммитом `9ebea6963`, что и вызывающий
скрипт). Не восстановлен, потому что его собственные зависимости больше не существуют:

- `deploy/postgres/privileges/post-zero-roots.sql` — файла нет вообще (0 упоминаний в дереве).
- `deploy/postgres/generated/zero-state.${db}.sql` — такого класса артефактов в `generated/` больше нет.
- Флаги генератора `--zero-state`, `--zero-state-verify`, `--target-login-cleanup` — их нет в
  `generate-cli.mjs`'s `knownFlags`/`knownValues` (проверено чтением файла целиком); вызов упал бы на
  «неизвестный флаг».

**Найдена (не выдумана) живая замена.** `deploy/host/deploy-test.sh` (сегодняшний рабочий деплой, живой
вход) решает ровно ту же задачу — довести уже обнулённую по правам базу до состояния «права
declaration-owned установлены» — своей собственной живой парой вызовов (`deploy-test.sh:226-229,278-287`):

```
node generate-cli.mjs --shared-role-baseline | psql -d postgres     # кластерные роли, идемпотентно
node reconcile-access.mjs --env <env> --db <db> --admin-socket ... --admin-port ...
```

`reconcile-access.mjs` сам документирует себя как преемника: «Repeatable access reconcile for one database
that has already completed initial cutover. It never runs legacy cleanup, zero-state, target-login cleanup,
or database restore.» — то есть «zero-state» ему сознательно не нужен, потому что база к его вызову уже
обнулена ИНАЧЕ: `restore-test-db-from-dump.sh` (файл, который уже стоит на этом самом пути, шагом раньше)
делает `dropdb`+`createdb`+`pg_restore --no-acl` — это и есть обнуление прав, только средствами восстановления
базы, а не отдельным SQL-файлом. Полный дамп цели, который `initial-cutover.mjs` снимал перед установкой
(`createVerifiedBackup()`), сохранён — теперь инлайн в той же функции (`pg_dump -Fc` + `pg_restore --list`
проверка архива), тот же контракт `--backup-file`, тот же вызывающий (`run_port_context_test_release` в
`deploy-test-saas.sh:3269`) передаёт его без изменений.

Новая функция:
```bash
port_context_cutover_install_target() {
  runuser -u postgres -- pg_dump -Fc -h /var/run/postgresql -p 5432 -U postgres -d "$database" \
      -f "$backup_file" &&
    chmod 0600 "$backup_file" &&
    runuser -u postgres -- pg_restore --list "$backup_file" >/dev/null &&
    [[ "$(head -c5 -- "$backup_file")" == PGDMP ]] &&
    node --experimental-strip-types "$generator" --shared-role-baseline |
      runuser -u postgres -- psql -X -1 -h /var/run/postgresql -p 5432 -U postgres -d postgres \
        -v ON_ERROR_STOP=1 &&
    node --experimental-strip-types "$reconcile" \
      --env "$environment" --db "$database" \
      --admin-socket /var/run/postgresql --admin-port 5432
}
```
(`$generator`/`$reconcile` — новые переменные вверху файла, заменяют удалённую `$cutover`; существование
проверяется тем же циклом `for path in ... ; do [[ -f "$path" ...`.)

**Не восстановлено намеренно, назвать риском:** `initial-cutover.mjs`, `post-zero-roots.sql`,
`generated/zero-state.*.sql` НЕ возвращены — они противоречили бы «не дублировать декларативный шов»
(та же причина, по которой прошлый проход не вернул 191 строку в `deploy-test-saas.sh`). Это решение
основано на чтении `reconcile-access.mjs`/`deploy-test.sh`/`restore-test-db-from-dump.sh`, а не на догадке.

## Проверка исполнимости — все внешние вызовы/`\ir` на пути B, все существуют

```
$ for f in <27 путей: восстановленные 11 файлов + все их внешние зависимости
    (generate-cli.mjs, reconcile-access.mjs, provision-dev-test-postgres-mtls-material.sh,
    bootstrap-c4-test-env.mjs, apply-postgres-mtls.sh, probe-dev-test-postgres-mtls.mjs,
    port-context-cutover-sequence.sh, port-context/contract.sql, generated/org-allowlist.bersoncarebot_test.sql,
    refresh-prod-to-target-cutover.mjs, prod-to-target-baseline-policy.mjs,
    consolidate-owner-identity.sql, converge-saas-smoke-login-passwords.mjs,
    p0-data-fix-doctor-admin-split.sql, test-settings-override.sql,
    test-saas-isolation-telemetry-fixtures.sql, restore-test-db-from-dump.sh, prod-to-target-cutover.sql)>；
  do [[ -f "$f" ]] && echo OK || echo MISS; done
→ 27/27 OK, 0 MISS
```

`bash -n` на всех тронутых/задействованных на пути shell-скриптах:
```
deploy/host/cutover-postgres-port-context.sh    → OK
deploy/host/restore-test-db-from-dump.sh        → OK (не менялся, для полноты)
deploy/host/deploy-test-full-reset.sh           → OK (не менялся)
deploy/host/deploy-test-saas.sh                 → OK (не менялся)
deploy/host/port-context-cutover-sequence.sh    → OK (не менялся)
```

`node --test deploy/host/deploy-test-full-reset.test.mjs` → 4/4 pass (без изменений от прошлого прохода —
эта правка не касалась обёртки full-reset, только внутренности cutover-скрипта).

## Запреты — соблюдены

- Семейство A0/A1/greenfield и историческая цепочка миграций не тронуты (не читал, не восстанавливал).
- Ни один из 12 файлов не содержит `GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER ROLE ...` кроме уже разрешённых
  ранее эфемерных элевации `deploy-test-saas.sh` (не менялся мной) — grep по всем 12 файлам чист.
- ПРОД не трогался: ни разу не подключался ни к TEST, ни к DEV, ни к прод-серверу; только чтение git-истории
  и `bash -n`/`node --test` в изолированном клоне.
- `pnpm run ci` не запускался.
- Скоуп не расширен за пределы пункта B: не трогал `saas-test-mode.sh` (вопрос владельцу остаётся открытым,
  как и был), не трогал `run_strict_post_migration_closure()`/осиротевший флаг `--post-migration-closure`,
  не трогал 3 отсутствующих smoke/retire-скрипта (`fb44002ce`, несвязанная причина) — все три темы вне
  названного пункта B, повторно называю их здесь, не чиню.

## Осталось непроверенным (честно, не пряталось)

- **Функциональная семантика после реального прогона не доказана** — гейт-B был про «путь не падает по
  имени файла/флага», не про «TEST после сброса работоспособен». Живой прогон нужен для этого, а его никто
  не запускал (запрет брифа). В частности: установит ли `install_port_context_capability_catalog()`-эквивалент
  строки `app_ext.port_context_capabilities` под TEST-логинами — эта функция сама по себе мертва
  (`run_strict_post_migration_closure`, недостижима), и путь, который я чиню, её не вызывает; таблица
  `app_ext.port_context_capabilities`, если она есть в прод-дампе, будет содержать ПРОД-строки, не TEST —
  это тот же класс риска, что уже был назван предыдущим проходом про `deploy-test.sh` не звать
  `deploy-test-saas.sh`, я его не увеличиваю и не уменьшаю, только фиксирую как всё ещё открытый.
- 4 `generated/prod-to-target/*.sql` — стале снимок, см. риск выше.
- 3 файла проверки (`prod-to-target-baseline-policy.test.mjs`, `prod-to-target-cutover-executable-gate.mjs`,
  `prod-to-target-cutover-contract.test.mjs`) — не восстановлены, тот же пробел, что назвала классификация
  предыдущего прохода; `check:prod-to-target-cutover` в `package.json` остаётся более слабой проверкой, чем
  историческая.

## Команды, которыми проверял (воспроизводимость)

```bash
git show bfe6b48f0^:<path> > <path>                     # 10 файлов, побайтная реставрация
git show 9ebea6963^:deploy/host/cutover-postgres-port-context.sh > deploy/host/cutover-postgres-port-context.sh
grep -n '\\ir' deploy/postgres/prod-to-target-cutover-data.sql deploy/postgres/pre-cutover-data-stage-assertions.sql
grep -niE '^\s*(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER .* OWNER)' deploy/postgres/generated/prod-to-target/*.sql
grep -rniE "anonymiz|anonymis|обезлич|маскир|\bmask\b|pseudonym|scrub|redact|\bfaker\b" <12 файлов>
bash -n <5 скриптов>
node --test deploy/host/deploy-test-full-reset.test.mjs
```
