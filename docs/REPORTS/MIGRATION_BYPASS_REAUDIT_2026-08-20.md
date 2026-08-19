# Реаудит: «недоказуемая миграция отказывает в прогонщике» — вердикт FAIL

Вход: бриф `audit-migration-bypass` (устная миссия), оракул —
[`OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`](../_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md) и
[`MIGRATION_BYPASS_FIX_2026-08-19.md`](MIGRATION_BYPASS_FIX_2026-08-19.md) (коммит `cd0d8fc00`, ветка та же —
`wt/migration-bypass-20260819`, HEAD `9f5d8ebad`). Проверка живая, не по отчёту.

## Вердикт

**Заявленный узкий тезис — PASS.** «Недоказуемая миграция отказывает в самом прогонщике, а не только на
линте» — подтверждено тремя независимыми живыми прогонами (свой фикстур, не тесты автора), отказ наступает
ДО обращения к БД, ничего не пишется в леджер, ни один env/аргумент отказ не снимает.

**Общий вердикт по ветке — FAIL.** Адверсарная проверка нашла живой, воспроизводимый обход соседнего гейта
из того же коммита (находка A, `--reapply`) и живой краш штатного lint-гейта на текущем HEAD. Оба
воспроизведены прогоном реального кода, не домыслены.

---

## 1. Подтверждено: недоказуемая миграция отказывает в обоих прогонщиках, не только в линте

Собственная фикстура (не из `migrate-local.test.mjs` автора), `/tmp/audit-migbypass/migrations/0002_no_proof_adversarial.sql` — чистый backfill без объекта и без `VERIFY`:

```
$ PATH=/tmp/audit-migbypass/bin:$PATH node deploy/postgres/privileges/migrate-local.mjs \
    --db bersoncarebot_test --migrator bcb_test_migrator --drizzle-folder /tmp/audit-migbypass/migrations
0002_no_proof_adversarial leave no object this checkout can probe and carry no `-- BCB-MIGRATION-VERIFY: SELECT …` …
EXIT=1
```

Лог поддельного `psql` показывает: единственный вызов — идемпотентный bootstrap леджера (`DO $bcb_ledger$`,
создание таблицы, если её нет); ни `INSERT INTO drizzle.__drizzle_migrations`, ни файл транзакции — не
созданы. Отказ до похода в БД за содержимым миграции.

Второй прогонщик (`run-webapp-drizzle-migrate.mjs`) проверен на РЕАЛЬНОЙ папке
`apps/webapp/db/drizzle-migrations` (путь захардкожен, env/CLI его не переопределяют — это тоже плюс):
временно (в рабочем дереве, не закоммичено, откачено сразу) поставлен рабочий пин + добавлен файл
`9999_audit_probe_temp_no_proof.sql` того же вида, `DATABASE_URL` указан на заведомо недоступный адрес
(`127.0.0.1:1`) — если бы проверка происходила после подключения к БД, мы увидели бы ошибку соединения:

```
$ DATABASE_URL=postgresql://nouser:nopass@127.0.0.1:1/nonexistent_db_audit node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs
[migrate] migrations_without_a_proof 9999_audit_probe_temp_no_proof
EXIT=1
```

Ошибки соединения нет — значит отказ действительно до `pg.Pool`. Рабочее дерево восстановлено сразу же
(`git status --short` — чисто после каждого шага).

**Обход env/аргументом не найден** для этой конкретной проверки: перепробованы `--force`, `--skip-proof`,
`--no-verify`, `--unsafe`, `--i-know-what-im-doing` (молча игнорируются, неизвестные флаги парсер не видит),
`WEBAPP_MIGRATIONS_BEFORE_TAG` (не тот, потому что список для проверки берётся ДО фильтра по тегу — читал
код и подтвердил прогоном), `BCB_SKIP_PROOF=1`, `NODE_ENV=test`, `CI=true` — отказ во всех случаях
идентичен.

---

## 2. FAIL: `--reapply` разоружает definer-функцию даже БЕЗ настоящего entrypoint — маркер не проверяется, только его наличие

Отчёт `MIGRATION_BYPASS_FIX_2026-08-19.md`, находка A, заявляет: «`--reapply` доступен только с
entrypoint'ов, которые гонят reconcile». Код (`deploy/postgres/privileges/migrate-local.mjs:184`):

```js
if (reapplyTags.length > 0 && !process.env.BCB_MIGRATION_ENTRYPOINT) { fail(...) }
```

Проверяется **истинность переменной, а не её значение.** `migrate-dev.sh`/`deploy-test.sh` выставляют
`BCB_MIGRATION_ENTRYPOINT=migrate-dev.sh`/`=deploy-test.sh` — но код принимает ЛЮБУЮ непустую строку.
Собственный тест-сьют это не ловит: `migrate-local.test.mjs` использует константу
`FROM_ENTRYPOINT = { BCB_MIGRATION_ENTRYPOINT: 'migrate-dev.sh' }` только как «правильное» значение и никогда
не проверяет, что ПОДДЕЛЬНОЕ значение отвергается.

**Живое доказательство — реальная DEV-база, реальный DDL, не подмена psql:**

```
$ BCB_MIGRATION_ENTRYPOINT=i_just_made_this_up node deploy/postgres/privileges/migrate-local.mjs \
    --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations \
    --reapply 0001_patient_booking_runtime_capability --sudo-postgres
BEGIN
GRANT ROLE
GRANT
GRANT
SET
SET
   session_user   |          current_user          | can_create_public
------------------+--------------------------------+-------------------
 bcb_dev_migrator | app_seam_patient_booking_owner | f
(1 row)

CREATE FUNCTION
CREATE FUNCTION
ERROR:  unexpected read_current_patient_booking_rows B0 definition
REAL_EXIT=3
```

Гейт по `--reapply` не сработал вообще — команда прошла до реального `BEGIN`/`GRANT`/`CREATE FUNCTION`
против `bcb_webapp_dev`, никакого настоящего entrypoint (`migrate-dev.sh`/`deploy-test.sh`) не запускалось,
`reconcile` после — тоже. Прогон упал по независимой причине (несовпадение B0-определения функции — эффект
пере-применения без reconcile, ровно то, от чего находка A должна защищать), но это уже ПОСЛЕ реального
DDL, а не отказ гейта.

**Проверено, что база не пострадала** (транзакция откатилась по `ERROR` до `COMMIT`, `ON_ERROR_STOP`
прерывает сессию):

```
$ sudo -n -u postgres psql -d bcb_webapp_dev -c "SELECT count(*) FROM pg_prepared_xacts;"
 count
-------
     0
$ sudo -n -u postgres psql -d bcb_webapp_dev -c "SELECT proowner::regrole, proacl FROM pg_proc WHERE proname='read_current_patient_booking_rows';"
             proowner            |                                    proacl
----------------------------------+-------------------------------------------------------------------------------
 app_seam_patient_booking_owner   | {app_seam_patient_booking_owner=X/app_seam_patient_booking_owner,app_patient=X/…}
```

Владелец/ACL функции — прежние, ноль зависших транзакций. Но это везение конкретного прогона (ошибка внутри
той же транзакции), а не свойство гейта — гейта просто нет.

**Смысл:** маркер `BCB_MIGRATION_ENTRYPOINT` — это чекбокс на честность, а не проверка происхождения
вызова. Любой, кто наберёт переменную окружения с любым непустым значением (в том числе случайно,
скопировав её из соседнего контекста), обходит именно ту защиту, которую находка A объявила закрытой — без
`migrate-dev.sh`, без `deploy-test.sh`, без последующего reconcile. Исправление — сравнивать с конкретным
известным множеством значений (`{'migrate-dev.sh', 'deploy-test.sh'}`), не с истинностью.

---

## 3. FAIL (на текущем HEAD): гейт `--check-migration-proofs` кидает необработанное исключение вместо сообщения — и прямо сейчас валит `pnpm run lint`

Отчёт заявляет: «Отказ по расхождению замороженного журнала стал сообщением оператору вместо stack trace».
Это верно только для ОДНОГО из трёх мест, где `run-webapp-drizzle-migrate.mjs` читает журнал:

| строка | ветка | try/catch |
|---|---|---|
| `run-webapp-drizzle-migrate.mjs:266` | `--check-migration-proofs` (её вызывает `check-drizzle-migration-order.sh`, то есть штатный `pnpm run lint`) | **нет** |
| `run-webapp-drizzle-migrate.mjs:300` | основной прогон (`pnpm run migrate`) | есть |
| `run-webapp-drizzle-migrate.mjs:320` | bootstrap леджера (недостижимо, если 300 уже прошла) | не нужен |

На этом самом HEAD (`9f5d8ebad`) `meta/_journal.json` (51 запись, дайджест `50c21ab…`, версия из
`feat/doctor-ui-rebuild`, где пина `_journal.frozen` вообще нет — там ветка `wt/migration-bypass-20260819`
ещё не влита) разошёлся с `meta/_journal.frozen` (пин `13f6f50…`, 50 записей, из `cd0d8fc00`). Это ОЖИДАЕМЫЙ
и задокументированный сценарий («если слияние ветвей обязано расширить карту — пин двигается тем же
коммитом»), рабочее дерево при этом чистое (`git diff --stat HEAD` — пусто, расхождение — часть коммита, не
моё). Именно на этом реальном расхождении гейт `--check-migration-proofs` кидает СЫРОЕ исключение:

```
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
file:///…/deploy/postgres/privileges/migration-order.mjs:155
    throw new Error(
          ^
Error: the historical migration map …/_journal.json is not the frozen one: it digests to 50c21ab…, …
    at readLegacyJournalEntries (…/migration-order.mjs:155:11)
    at file:///…/run-webapp-drizzle-migrate.mjs:266:3
Node.js v22.22.3
EXIT=1
```

И, как следствие, штатный `pnpm --dir apps/webapp run lint` — тот самый гейт, который отчёт числит зелёным
— **падает целиком** с тем же трейсом и `ELIFECYCLE Command failed with exit code 1`, а не с читаемым
сообщением. Проверено полным прогоном `pnpm --dir apps/webapp run lint` (все прочие проверки в пайплайне
до этого шага — зелёные).

**Смысл:** отказ безопасный (fail-closed, ничего не проезжает), но ломает именно то, что отчёт называет
своей заслугой («не stack trace, а сообщение»), и делает это в самом частом сценарии — обычном слиянии
веток, а не в экзотическом. Нужен тот же `try { … } catch { console.error(...); process.exit(1); }`, что
уже есть на строке 300, но на ветке 265–267.

**Отдельно, не смешивать с багом:** расхождение `_journal.json`/`_journal.frozen` само по себе — не
дефект кода, это ожидаемое поведение незавершённого слияния `wt/migration-bypass-20260819` ↔
`feat/doctor-ui-rebuild` (последняя ветка ещё не содержит пин вообще). Пока кто-то не переставит пин
отдельным просмотренным коммитом, `pnpm run lint` и `pnpm run migrate` на этой ветке недоступны в принципе
— это не находка аудита, а операционный блокер, о котором стоит знать до следующего шага.

---

## 4. Проверено и подтверждено (числа отчёта)

| заявление отчёта | перепроверено | результат |
|---|---|---|
| `node --test .../{migration-order,migrate-local,migrate-local-parse}.test.mjs` → 44/44 | прогнан заново | **44 tests, 44 pass, 0 fail** — совпадает |
| `function-census.test.mjs` → 19/19 | прогнан заново | **19/19** — совпадает |
| `pnpm --dir apps/webapp exec tsc --noEmit` → EXIT=0 | прогнан заново | **EXIT=0** — совпадает |
| `check-migration-privileges.mjs` → OK | прогнан заново | **OK (52 migration files)** — совпадает (было 50 файлов на момент отчёта + 2 позже слитых) |
| `drizzle-kit migrate`/`push` отказывают из `drizzle.config.ts` | grep + живой запуск | подтверждено, `RETIRED_APPLY_SUBCOMMANDS = ['migrate', 'push']`, живой `drizzle-kit migrate` печатает отказ |
| `db:migrate:drizzle`/`db:seed-drizzle-meta` отказывают | живой запуск обоих | подтверждено, оба EXIT=1 с названным маршрутом |
| `pnpm --dir apps/webapp run lint` → OK | прогнан заново | **НЕ подтверждено на текущем HEAD** — см. §3 (падает на `check-drizzle-migration-order.sh`) |
| 50 миграций / 78 точек доказательства, 0 недоказанных | пересчитано через `collectMigrationProofs`/`findUnprovedMigrations` на текущем HEAD | текущий HEAD: **51 миграция / 81 точка / 0 недоказанных** — рост на +1/+3 объясняется одной миграцией, влитой из `feat/doctor-ui-rebuild` уже после `cd0d8fc00`; согласуется, не расхождение |

---

## 5. Обходы вне охвата отчёта (не заявлены отчётом ложно, но стоит знать)

1. **Легаси-режим `--step`/`--owner`/`--migration`/`--backfill`/`--post` в `migrate-local.mjs`** — отдельная
   ветка кода (`if (drizzleFolder) {…} else {…legacy…}`), `findUnprovedMigrations` там не вызывается вовсе.
   Ни `migrate-dev.sh`, ни `deploy-test.sh` этот режим не используют (оба зовут только `--drizzle-folder`) —
   подтверждено grep'ом обоих entrypoint'ов. Совпадает с уже признанным остатком отчёта (п. 8 «НЕ
   СДЕЛАНО»: «обход через собственно psql остаётся для того, у кого есть суперпользователь») — уточняет
   его, не открывает новый.
2. **Интегратор — отдельная система миграций, без доказательства применения.** `migrate-integrator-local.mjs`
   (DEV/TEST) и `apps/integrator/src/infra/db/migrate.ts` (легаси-прод, `deploy/host/deploy.sh`, сам себя
   называет «legacy deploy») — независимые прогонщики со своим леджером
   (`integrator.schema_migrations`), без пробы/объекта-доказательства. Исходный аудит
   (`MIGRATION_ORDER_AUDIT_2026-08-19.md`) и этот фикс были явно про `apps/webapp/db/drizzle-migrations` —
   отчёт нигде не заявляет, что интегратор охвачен, так что это не расхождение с заявленным, а нужная
   владельцу граница охвата.
3. **`check-migration-privileges.mjs` (GRANT/REVOKE-бан) не сканирует
   `apps/integrator/src/integrations/*/db/migrations`** — список `MIGRATION_FOLDERS` содержит
   `apps/integrator/src/infra/db/migrations`, но не построчный путь на интеграцию. Сегодня там 0 `.sql`
   файлов (проверено `find`), то есть дыра латентная, не эксплуатируемая прямо сейчас — но `migrate-integrator-local.mjs`
   ЧИТАЕТ именно эту папку (`src/integrations/<name>/db/migrations`), так что появившийся там файл с `GRANT`
   применится, не будучи просканирован тем же гейтом, что защищает две другие папки.

---

## Прогнанный gate (scoped, без full CI)

```
node --test deploy/postgres/privileges/migration-order.test.mjs \
  deploy/postgres/privileges/migrate-local.test.mjs \
  deploy/postgres/privileges/migrate-local-parse.test.mjs        # 44/44, 0 fail
node --test deploy/postgres/privileges/function-census.test.mjs  # 19/19, 0 fail
node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test   # OK
node scripts/check-migration-privileges.mjs                      # OK (52 migration files)
pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json         # EXIT=0
pnpm --dir apps/webapp run lint                                   # FAIL — см. §3 (ELIFECYCLE, exit 1)
```

Full CI не гонялся (вне охвата брифа).

## НЕ СДЕЛАНО

- Пин `meta/_journal.frozen` не переставлен — не моя роль (аудит, не правка); операционно блокирует
  `lint`/`migrate` на этой ветке до отдельного просмотренного коммита.
- Не проверен `--reapply` через настоящий `migrate-dev.sh`/`deploy-test.sh` с последующим reconcile
  (полный цикл) — вне охвата, найденный обход достаточен сам по себе.
- ПРОД не трогался. TEST (`test.bersoncare.ru`) не трогался.
