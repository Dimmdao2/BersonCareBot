# Починка по FAIL независимого гейта: живой блокер + разбор `232616725`

Ветка `wt/migration-timestamp-20260819`, роль — исполнитель по брифу, ссылающемуся на
`docs/REPORTS/AUDIT_MIGRATION_LEDGER_2026-08-20.md` (Opus, вердикт **FAIL**). Все живые команды —
против `bcb_webapp_dev` (`sudo -u postgres psql -h /var/run/postgresql` или
`deploy/postgres/privileges/migrate-local.mjs --sudo-postgres`). ПРОД и TEST не открывались.

---

## Задача 1 — живой блокер: переименование + `--relabel` для 0051/0052/0053

**До:** после слияния `wt/public-booking-write-20260819` в `feat` (`3d6180ea1`) и подтяжки в этот
worktree файлы приехали под старыми числовыми именами; гейт имени их отвергал.

```
$ ls apps/webapp/db/drizzle-migrations | grep -E '^005[123]_'
0051_a_public_visitor_becomes_a_client_when_identified.sql
0052_a_failed_public_booking_must_not_leave_a_client.sql
0053_a_visitor_booking_spends_no_tariff_seat.sql
```

Аудит доказал `comm`-сверкой, что все три — НЕ сироты: файл есть, sha256 файла побайтно совпадает
со строкой леджера (применены ровно один раз). Перепроверено заново перед правкой:

```
$ sudo -u postgres psql -h /var/run/postgresql -d bcb_webapp_dev -Atc \
    "select tag,left(hash,12) from drizzle.__drizzle_migrations where tag ilike '0051%' or tag ilike '0052%' or tag ilike '0053%' order by tag"
0051_a_public_visitor_becomes_a_client_when_identified|ba4a69129732
0052_a_failed_public_booking_must_not_leave_a_client|efdb857d09bc
0053_a_visitor_booking_spends_no_tariff_seat|556c698a61df
```

### Переименование

`git mv`, содержимое не менялось. Таймштамп взят из времени последнего коммита, коснувшегося
файла (`git log -1 --format=%cI -- <файл>`), переведён в UTC — тот же метод, каким `f44a13ae1`
переименовал `0048`/`0050`.

| старое имя | `git log -1 --format=%cI` | новое имя |
|---|---|---|
| `0051_a_public_visitor_becomes_a_client_when_identified.sql` | `2026-08-19T20:02:16+03:00` | `20260819T170216_a_public_visitor_becomes_a_client_when_identified.sql` |
| `0052_a_failed_public_booking_must_not_leave_a_client.sql` | `2026-08-19T19:35:36+03:00` | `20260819T163536_a_failed_public_booking_must_not_leave_a_client.sql` |
| `0053_a_visitor_booking_spends_no_tariff_seat.sql` | `2026-08-19T21:20:39+03:00` | `20260819T182039_a_visitor_booking_spends_no_tariff_seat.sql` |

`meta/_journal.json`/`meta/_journal.frozen.json` не тронуты — для этих трёх тегов там не было
записей ни до, ни после (проверено грепом обоих файлов по слагам до правки): это ожидаемо, легаси-
журнал знает только про первые 50 файлов, эти три родились уже после заморозки.

### `--relabel` через санкционированную обёртку (не руками)

Сперва `--rollback-only` (сухой прогон), затем реальный commit, оба — `migrate-local.mjs`
напрямую (тем же путём, каким `f44a13ae1` релейблил `0048`/`0050`; `migrate-dev.sh` не принимает
`--relabel` как recovery-опцию, только `--reapply`/`--apply-out-of-order`):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only \
    --relabel 0051_a_public_visitor_becomes_a_client_when_identified:20260819T170216_a_public_visitor_becomes_a_client_when_identified \
    --relabel 0052_a_failed_public_booking_must_not_leave_a_client:20260819T163536_a_failed_public_booking_must_not_leave_a_client \
    --relabel 0053_a_visitor_booking_spends_no_tariff_seat:20260819T182039_a_visitor_booking_spends_no_tariff_seat
BEGIN … UPDATE 1 · UPDATE 1 · UPDATE 1 … ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=0 total=57 reapplied=0 foreign-ledger-rows=4 relabeled=3 dropped-foreign=0

$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres \
    --relabel … (те же три пары)
BEGIN … UPDATE 1 · UPDATE 1 · UPDATE 1 … COMMIT
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=0 total=57 reapplied=0 foreign-ledger-rows=4 relabeled=3 dropped-foreign=0
```

Ни один statement миграции не выполнился повторно — `--relabel` только переклеивает `tag`
(`UPDATE drizzle.__drizzle_migrations SET tag = … WHERE tag = …`), хеш сверен обёрткой перед
записью. Проверено после:

```
$ sudo -u postgres psql -h /var/run/postgresql -d bcb_webapp_dev -Atc \
    "select tag,left(hash,12) from drizzle.__drizzle_migrations where tag ilike '20260819T17%' or tag ilike '20260819T16%' or tag ilike '20260819T18%' order by tag"
20260819T163536_a_failed_public_booking_must_not_leave_a_client|efdb857d09bc
20260819T170216_a_public_visitor_becomes_a_client_when_identified|ba4a69129732
20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime|228d8d4d652b
20260819T182039_a_visitor_booking_spends_no_tariff_seat|556c698a61df

$ sudo -u postgres psql -h /var/run/postgresql -d bcb_webapp_dev -Atc \
    "select tag from drizzle.__drizzle_migrations where tag ilike '0051%' or tag ilike '0052%' or tag ilike '0053%'"
(пусто)
```

Хеши те же самые (побайтно как до релейбла), старых числовых тегов в леджере больше нет.

### Гейты — стали зелёными

```
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
$ echo $?
0

$ bash deploy/host/migrate-dev.sh --preflight
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=57 verified-objects=89 foreign-ledger-rows=1
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
$ echo $?
0
```

`foreign-ledger-rows` упал с 4 до 1 — ровно та единственная предсуществовавшая `tag IS NULL`-строка
(`c1392710…`, задокументирована раньше `MIGRATION_LEDGER_ORPHANS`, вне скоупа этой миссии), как и
предсказал аудит.

### Гейт имени по-прежнему орёт на плохое имя (живая инъекция, докатана и снята)

```
$ cat > apps/webapp/db/drizzle-migrations/0099zz_fix_probe_BADNAME.sql <<'EOF'
-- BCB-MIGRATION-OWNER: app_probe_owner
SELECT 1;
EOF

$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
check-drizzle-migration-order: 0099zz_fix_probe_BADNAME.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, …
exit=1

$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
0099zz_fix_probe_BADNAME.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, …
exit=1

$ (cd apps/webapp && DATABASE_URL="postgresql://unused:unused@127.0.0.1:5/unused" node scripts/run-webapp-drizzle-migrate.mjs)
[migrate] migration_name_violation 0099zz_fix_probe_BADNAME.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, …
exit=1

$ rm apps/webapp/db/drizzle-migrations/0099zz_fix_probe_BADNAME.sql
$ git status --short apps/webapp/db/drizzle-migrations   # только три R (renamed), инъекция не осталась
```

Все три прогонщика отказывают, ни один statement не дошёл до базы (третий отказал ДО `pg.Pool`).
Инъекция снята, дерево чистое кроме трёх legit-переименований.

### Тесты

```
$ node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs
# tests 47 · # pass 47 · # fail 0
```

---

## Задача 2 — разбор находки по `232616725`

### (а) Журнал СЕЙЧАС корректен — строка↔файл, дублей нет

Полная сверка (метод аудита, `comm` по отсортированным множествам):

```
$ comm -23 <(psql -Atqc "select tag from drizzle.__drizzle_migrations where tag is not null order by tag") \
           <(ls apps/webapp/db/drizzle-migrations/*.sql | xargs -n1 basename | sed 's/\.sql$//' | sort)
(пусто — сирот нет)

$ comm -13 (…те же выборки…)
(пусто — pending нет)

$ psql -Atqc "select tag, count(*) from drizzle.__drizzle_migrations group by tag having count(*) > 1"
(пусто — дублей тегов нет)

$ psql -Atqc "select count(*) from drizzle.__drizzle_migrations"   # 58
$ ls apps/webapp/db/drizzle-migrations/*.sql | wc -l               # 57
# разница = 1: та самая tag IS NULL строка (c1392710…), не в скоупе
```

`migrate-dev.sh --preflight` подтвердил тем же прогоном: `verified-objects=89` — `findMissingObjects`
проверил живьём каждый объект каждой применённой миграции против каталога, не только по леджеру.

**Про «хеши сходятся».** Прямая побайтная сверка хеша каждого `.sql`-файла (по правилам самого
модуля — `sha256(readFileSync(path,'utf8'))`, тем же кодом, `readMigrationFolder`) против хеша его
строки леджера показала **33 расхождения** среди 0000–0049. Это НЕ дефект: канон прямо говорит,
что хеш не является личностью миграции именно по этой причине — «файл миграции здесь штатно
правят на месте после применения, и для уже накатанных баз правка инертна» (`AGENTS.md:396-397`);
исторические файлы правились после применения (например коммит `36a08e341`/`fc87d0af5` снимал
`REVOKE ALL … FROM PUBLIC` из уже применённых файлов). Хеш-гейт (`--relabel`/`--drop-foreign`)
использует эту сверку только для **foreign**-строк (тег, которого нет среди применённых по имени) —
там расхождений нет: единственная foreign-строка (`tag IS NULL`) хеш-файла не имеет вовсе. Для
применённых по тегу строк хеш умышленно не проверяется ни одним гейтом — 33 расхождения выше не
находка, а подтверждение того, что канон описывает верно.

### (б) Возможность повторить — код проверен, ничего вычищать не пришлось

```
$ git grep -niE "(update|delete)[^;]*__drizzle_migrations" -- .
apps/webapp/db/drizzle-migrations/0000_b0_baseline.sql:8:DELETE FROM drizzle.__drizzle_migrations;
deploy/postgres/privileges/migrate-local.mjs:245,262,399   (--relabel/--drop-foreign/bootstrap — сама обёртка)
deploy/postgres/privileges/migrate-local.test.mjs:…        (тесты обёртки)
deploy/postgres/privileges/migration-order.mjs:174          (бэкфилл легаси-тегов, вызывается ИЗ обёртки)
docs/REPORTS/*.md, docs/_TODO/runs/…                        (закрытые исторические отчёты — записи, не runbook)
```

`0000_b0_baseline.sql:8` — не обход: это сама миграция-бутстрап, её `DELETE` выполняется В
транзакции обёртки как обычный statement миграции, не отдельным `sudo psql -f` мимо неё.
`migration-order.mjs:174` — код бэкфилла, импортируемый и вызываемый только из `migrate-local.mjs`.

Живого/актуального SQL-скрипта или раннабл-документа, зовущего сырой `UPDATE`/`DELETE` по леджеру
мимо обёртки, в дереве не найдено — ни отслеживаемого, ни untracked (`git status --short` чист от
посторонних файлов; поиск `*rollback*sql`/`*relabel*sql` вне `drizzle-migrations/` — пусто).
Единственные найденные `psql -f`-упоминания в живом коде — это генератор привилегий
(`deploy/postgres/privileges/generate.mjs`) и SaaS-скрипты применения деклараций, ни один не
адресует `__drizzle_migrations`. Исторические отчёты (`MIGRATION_TIMESTAMP_FIX_2026-08-20.md`,
`MIGRATION_ORDER_AUDIT_2026-08-19.md`, `DEV_LEDGER_REPAIR_AND_WORKER_UNBLOCK_REPORT_2026-08-04.md`)
цитируют сырой DML как рассказ о том, что БЫЛО сделано (два из них — до появления `--relabel` в
обёртке 20.08, третий — вообще 04.08); ни один не написан как «сделай так снова» и никто их не
запускает — по правилу гигиены документации (фиксируется что и почему сделано, история не
переписывается) трогать их не стал. Вывод: код репозитория саму возможность обхода не предлагает —
единственный путь повторить нарушение прежнего воркера был бы буквально написать новый ручной
`sudo psql -f`-скрипт, как и в прошлый раз, а не воспользоваться чем-то, что осталось в дереве.

### (в) Причина необъяснённой мутации леджера — честно, установить не вышло

Прежний воркер зафиксировал (`MIGRATION_TIMESTAMP_FIX_2026-08-20.md:281-301`): во время
`--rollback-only`-прогона две строки леджера мутировали, хотя `--rollback-only` обязан откатывать
всё внутри одной транзакции; причину не установил, подозревал параллельную активность на общем
DEV, логами не подтвердил.

Попытка добавить новую улику из postgres-логов этого бокса:

```
$ sudo -u postgres psql -Atc "SHOW log_statement; SHOW log_min_error_statement;"
none|error
```

`log_statement=none` — успешные `UPDATE`/`DELETE` в принципе не пишутся в лог, только statement
упавших с ошибкой запросов (`log_min_error_statement=error`). Единственная строка про
`__drizzle_migrations` в текущем активном логе за ночь инцидента —

```
2026-08-20 00:05:52.148 MSK […] postgres@bcb_webapp_dev psql 23505 STATEMENT:
  INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
  VALUES (repeat('c',64), 999999999999, '0000_b0_baseline');
```

— упавшая на уникальном констрейнте `INSERT` с синтетическим хешем (`repeat('c',64)`), не найденная
нигде в текущем дереве репозитория (`grep -r "repeat('c'" — пусто`). Похоже на чей-то ручной
адверсарный пробник констрейнта (проверка «уникальность держит»), а не на источник двух мутировавших
строк — она ничего не изменила (откачена по 23505) и не совпадает по механике с описанием инцидента
(там речь о мутации СУЩЕСТВУЮЩИХ строк, а не о неудачной вставке новой). Дальше в логе за это окно
никаких `UPDATE`/`DELETE` по таблице нет — не потому что их не было, а потому что конфигурация
логирования их принципиально не пишет.

**Итог честно: причину мутации установить по-прежнему не вышло** — не из-за недостатка попытки, а
потому что единственный источник, который мог бы её показать (postgres-лог), настроен не писать
успешные DML вовсе. Подтверждаю только то, что подтвердил и прошлый воркер: текущее состояние
леджера согласовано (см. (а)) — рецидива, если он и был, в текущем срезе не осталось.

---

## Коммиты

| коммит | содержание |
|---|---|
| (этот коммит) | `git mv` трёх файлов `0051/0052/0053` → таймштамп-имена + этот отчёт |

`--relabel` — операция над живой БД `bcb_webapp_dev`, не диффом репозитория; в коммите её не видно,
доказательство — команды и их вывод выше.

---

## НЕ СДЕЛАНО / вне скоупа

- Не искал дефектов в самом содержимом `0051/0052/0053.sql` — переименование байт-в-байт, содержимое
  не трогал (то же самое, что нашёл аудит: `0 insertions/0 deletions` в git-рефлоге переименования).
- Причина необъяснённой мутации двух строк леджера (`MIGRATION_TIMESTAMP_FIX:281-301`) НЕ
  установлена — честно зафиксировано в (в) выше, вместе с тем, почему дальше искать нечем
  (`log_statement=none`).
- `pnpm run ci` не гонял (запрещён брифом, полный CI на время сведения веток).
- TEST/PROD не открывались.
- Единственная `tag IS NULL`-строка (`c1392710…`) не трогал — вне скоупа обеих задач, задокументирована
  раньше `MIGRATION_LEDGER_ORPHANS_2026-08-20.md`.
