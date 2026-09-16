# Обратная операция в обёртке журнала + видимость правок журнала на DEV

Ветка `wt/migration-timestamp-20260819`. Бриф — владелец 20.08, дословное разрешение: «если это не
сложно и не долго и не построит вокруг кучу машинерии которую все равно обойдут - только тогда можно
делать». Источник: non-blocking finding 1-2,
[`AUDIT_MIGRATION_LEDGER_REAUDIT_2026-08-20.md`](AUDIT_MIGRATION_LEDGER_REAUDIT_2026-08-20.md) — два
разных агента независимо упёрлись в одну стену (нет обратной операции в обёртке) и оба обошли её сырым
`DELETE FROM drizzle.__drizzle_migrations`.

## Задача 1 — `--unapply <tag>` в `migrate-local.mjs`

**Что добавлено.** По образцу уже существующих `--relabel`/`--drop-foreign` (тот же стиль отказов, та
же транзакция, `deploy/postgres/privileges/migrate-local.mjs`): новый повторяемый флаг `--unapply
<tag>`, доступный только с `--drizzle-folder`. Снимает строку журнала по тегу — реверс того самого
`INSERT`, который обёртка пишет при применении миграции. Три гейта, скопированные с логики
`--relabel`/`--drop-foreign`:

1. Тега нет в леджере → отказ «has not applied at all (nothing to unapply)».
2. Тег есть в леджере, но ни один файл папки его не заявляет (строка чужая, foreign) → отказ, называет
   `--drop-foreign <tag>` как правильную операцию для этого случая.
3. **Хеш-гейт.** Тег есть и файл с этим именем есть, но `sha256(файла) ≠ hash` строки — контент
   разошёлся с тем, что реально было применено под этим тегом → отказ, снятие НЕ выполняется (иначе
   стёрли бы единственную запись о том, что реально накатилось).

Только `DELETE FROM drizzle.__drizzle_migrations WHERE tag = …` внутри той же транзакции, что и
остальные операции обёртки. Никакого повторного выполнения SQL миграции — тег остаётся «применённым» в
JS-модели текущего прогона (за счёт этого файл не попадает в `pending` в том же вызове), реальный откат
DDL — отдельно и через `--rollback-only`, если он вообще нужен.

### Тесты

`deploy/postgres/privileges/migrate-local.test.mjs`, 5 новых тестов (по образцу `--relabel`/
`--drop-foreign`):

- успешный путь — снятие строки, чей файл держит тот же хеш (`unapply deletes a ledger row that a file
  in this folder still claims by tag and hash`);
- отказ по хеш-гейту при дрейфе контента;
- отказ на теге, которого нет в леджере;
- отказ на чужой (foreign) строке — с указанием `--drop-foreign`;
- отказ без `--drizzle-folder`.

```
$ node --test deploy/postgres/privileges/migrate-local.test.mjs
# tests 26
# pass 26
# fail 0
```

**Хеш-гейт покраснел от инъекции.** Временно заменил `if (file.hash !== row.hash)` на
`if (false && file.hash !== row.hash)`, прогнал тот же файл:

```
not ok 24 - unapply refuses when the file content has drifted from the ledger row
  error: 'content drift must not be silently unapplied'
```

Откатил инъекцию, `node --test` снова 26/26, `git status --short` — только мои файлы.

### Живая проверка на `bcb_webapp_dev`

Успешный путь через `--rollback-only` (без коммита) на реальном применённом теге
`20260819T210005_a_clinic_is_billed_for_seats_not_for_people`:

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only \
    --unapply 20260819T210005_a_clinic_is_billed_for_seats_not_for_people
BEGIN
DELETE 1
…
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": …unapplied=1
$ sudo -u postgres psql … -Atc "select count(*) from drizzle.__drizzle_migrations where tag='20260819T210005…'"
1   # строка на месте — ROLLBACK реален
```

Хеш-гейт живьём: временно дописал байт в конец файла миграции, повторил ту же команду:

```
--unapply 20260819T210005_a_clinic_is_billed_for_seats_not_for_people refused: …hash (dc3c3327…) does
not match the ledger row's hash (d6b739a9…); the file has changed since this tag was applied …
EXIT=1
```

Файл восстановлен из копии сразу после проверки, `git status --short` подтвердил отсутствие следа
(diff нулевой). Ручной DML нигде не использовался — обе живые проверки шли только через обёртку.

### Документация

Назначение и гарантии — комментарием прямо над объявлением `--unapply` в `migrate-local.mjs`, тем же
стилем, каким описаны `--relabel`/`--drop-foreign` (те тоже не имеют отдельной статьи в `AGENTS.md`,
только код-комментарий рядом с объявлением флага). Отдельного документа не заводил.

## Задача 2 — видимость правок журнала на DEV

**Как включено.** НЕ ручным `ALTER DATABASE ... SET` (это стёрлось бы следующим reconcile — генератор
всегда начинает секцию БД с `ALTER DATABASE … RESET ALL;`), а через уже существующий декларативный
механизм: `deploy/postgres/privileges/declaration.ts`, `dbSettings.databaseLevel` (поле уже было в
`types.ts`, просто ни разу не использовалось). Правка — в `revision10Database(name)`, условно только для
`name === 'bcb_webapp_dev'`:

```ts
...(name === 'bcb_webapp_dev' ? { databaseLevel: { bcb_webapp_dev: ["log_statement='mod'"] } } : {}),
```

`bersoncarebot_test` (TEST) через тот же код не проходит — ветка условия на неё не срабатывает.

**Регенерация + гейт.**

```
$ node deploy/postgres/privileges/generate-cli.mjs --all
записано: deploy/postgres/generated/privileges.bcb_webapp_dev.sql (4339404 байт)
…
$ git diff --stat -- deploy/postgres/generated/
 deploy/postgres/generated/privileges.bcb_webapp_dev.sql | 1 +
```

Единственная новая строка — `ALTER DATABASE "bcb_webapp_dev" SET "log_statement" TO 'mod';`.
`privileges.bersoncarebot_test.sql` и оба `org-allowlist.*.sql` не изменились (`git diff --stat`
пустой). `--check` зелёный на обеих базах:

```
$ node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --check
ok bcb_webapp_dev/privileges: … совпадает побайтно
$ node deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --check
ok bersoncarebot_test/privileges: … совпадает побайтно
```

**Применено живьём** санкционированным входом `migrate-dev.sh --execute` (pending миграций не было —
единственный эффект прогона — reconcile новой БД-настройки):

```
$ bash deploy/host/migrate-dev.sh --execute
…
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=57 …
access reconcile committed: env=dev database=bcb_webapp_dev; local admin socket=/run/postgresql
migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)
```

**Проверено живьём — настройка применилась:**

```
$ sudo -u postgres psql -h /var/run/postgresql -d bcb_webapp_dev -Atc "show log_statement"
mod
$ sudo -u postgres psql … -Atc "select setconfig from pg_db_role_setting drs join pg_database d …"
{log_statement=mod}
```

**Проверено живьём — тестовая правка журнала теперь в логе, а обычный `SELECT` — нет** (лог —
`/var/log/postgresql/postgresql-16-main.log`, `pg_ctlcluster`-логирование; `log_destination=stderr`,
`logging_collector=off`, journald эту БД не пишет — проверено, `journalctl -u postgresql@16-main` пуст
за то же окно):

```
$ node deploy/postgres/privileges/migrate-local.mjs … --rollback-only \
    --unapply 20260819T210005_a_clinic_is_billed_for_seats_not_for_people
$ sudo tail -c 4000 /var/log/postgresql/postgresql-16-main.log | grep "DELETE FROM drizzle"
2026-08-20 04:42:12.521 MSK […] LOG:  statement: DELETE FROM drizzle.__drizzle_migrations WHERE tag = '20260819T210005_a_clinic_is_billed_for_seats_not_for_people';

$ sudo -u postgres psql … -Atc "select 'probe-<ts>'"
$ sudo tail -c 3000 /var/log/postgresql/postgresql-16-main.log | grep -c 'probe-<ts>'
0   # обычный SELECT не логируется — 'mod' логирует только mod-операции
```

## Границы (что НЕ делал)

- Ни разу не выполнил ручной `UPDATE`/`DELETE` по `drizzle.__drizzle_migrations` — обе живые проверки
  (успех + хеш-гейт) шли только через `migrate-local.mjs`.
- Не создавал аудит-триггеров/таблиц/схем, не добавлял новых гейтов CI, не трогал гейты имени/порядка
  миграций.
- TEST/ПРОД не открывал; `databaseLevel` для `bersoncarebot_test` не задан.
- `pnpm run ci` не запускал (сведение веток идёт) — только `node --test` по затронутым файлам.
- Не заводил отдельного документа под `--unapply` — комментарий в коде, тем же стилем, что у соседей.

## Затронутые файлы

- `deploy/postgres/privileges/migrate-local.mjs` — операция `--unapply`.
- `deploy/postgres/privileges/migrate-local.test.mjs` — 5 новых тестов.
- `deploy/postgres/privileges/declaration.ts` — `databaseLevel` для `bcb_webapp_dev`.
- `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` — регенерирован (1 новая строка).
