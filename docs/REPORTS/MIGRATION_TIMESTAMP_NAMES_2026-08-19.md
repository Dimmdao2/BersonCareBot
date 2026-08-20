# Миграции называются таймштампом, не номером

Ветка `wt/migration-timestamp-20260819`, поверх `feat/doctor-ui-rebuild` @ `982fd2b10` (тот коммит уже
сделал ORDER = имя файла, APPLIED = строка леджера по `tag` — не переделывалось, см. «Что не трогал»).

## Источник

`docs/OWNER_DECISIONS.md`, owner 19.08, дословно: «зачем вообще таймштамп и привязка к нему? для
послежовательности? Так давай просто называть миграци таймштампом - вряд ли два агент создадут в одну
долю секунды одинаково - если надо ты просто переименуешь в нужной последовательности когда будешь
сводить». В тот же вечер две ветки независимо заняли номер `0050`, и оба ночных аудита упали на этом
(`docs/REPORTS/MIGRATION_ORDER_AUDIT_2026-08-19.md`, находка C).

## Правило (внесено в `AGENTS.md`, «Миграции после baseline B0»)

1. **Новая миграция называется `YYYYMMDDTHHMMSS_slug.sql` (UTC, точность до секунды).** Пример:
   `20260820T014233_a_new_reminder_channel.sql`. Номер никто больше не выдаёт и не резервирует; маркер
   `-- TEMPORARY LOCAL MIGRATION NUMBER NNNN` и практика «ведущий назначает свободный номер при
   сведении» — сняты для новых файлов.
2. **Уже применённые 50 файлов сохраняют старые `NNNN[suffix]_slug` имена навсегда.** Список этих
   имён закрыт — это ровно то, что знает `meta/_journal.json` (50 записей = все 50 текущих файлов),
   и вырасти он не может: журнал больше не пишется.
3. **Сортировка строкой** (`readMigrationFolder` → `Array.prototype.sort()`) ставит `'0' < '2'`,
   значит любое легаси-имя `NNNN…` всегда идёт раньше любого таймштампа `YYYYMMDD…`. Проверено тестом
   на РЕАЛЬНОЙ папке репозитория (все 50 текущих файлов + синтетический таймштамп), не чтением
   регулярки.
4. **Переставить ещё не применённую миграцию — обычный `git mv` на другой таймштамп.** Безопасно и
   очевидно: ни один леджер не назовёт её так, пока она не накатана нигде.
5. **Переименовать уже применённую миграцию — запрещено и теперь ловится по содержимому, не по
   имени.** Если pending-файл побайтно совпадает с содержимым ledger-строки, которую эта проверка не
   может назвать («чужой» tag — foreign ledger row), прогонщик отказывает ДО единого DDL-стейтмента,
   называя файл и причину. Работает для ЛЮБОЙ будущей миграции, не только тех, что знает журнал (это
   и была дыра T1b в прошлом аудите: журнал заморожен, новых записей для post-branch миграций больше
   нет).
6. **Коллизия имени не может доехать до земли:**
   - новый файл со старым `NNNN`-именем (не входящим в закрытый список журнала) — красный
     `check-drizzle-migration-order.sh`, часть `pnpm run lint`;
   - буквально одинаковое имя от двух веток — git `add/add` conflict на слиянии, само слияние не
     проходит автоматически (доказано ниже);
   - две ledger-строки с одним `tag` — физически невозможно, частичный уникальный индекс
     `drizzle_migrations_tag_key` (унаследован от `982fd2b10`, переверен живьём ниже).

## Код

Вся логика — в одном модуле, который читают оба прогонщика (правило репозитория: один chokepoint):

- `deploy/postgres/privileges/migration-order.mjs`:
  - `TIMESTAMP_MIGRATION_NAME` — regex формы имени;
  - `findMigrationNameViolations(migrations, legacyEntries)` — тег не из закрытого списка журнала и не
    таймштамп → в список нарушителей;
  - `findRenamedAppliedMigrations(pendingMigrations, foreignLedgerRows)` — pending-файл, чей hash
    совпадает с hash «чужой» ledger-строки → это переименование, а не новая работа.
- `apps/webapp/scripts/check-drizzle-migration-order.sh` — вместо самодельной bash-регулярки теперь
  вызывает `findMigrationNameViolations` из того же модуля (один источник правды, не дублирование).
- `deploy/postgres/privileges/migrate-local.mjs` (DEV/TEST wrapper) и
  `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` (`pnpm run migrate`) — оба вызывают
  `findRenamedAppliedMigrations` и отказывают до построения транзакции.
- `run-webapp-drizzle-migrate.mjs`: `WEBAPP_MIGRATIONS_BEFORE_TAG` теперь принимает и легаси-, и
  таймштамп-имя (раньше регэксп понимал только `NNNN…`).

## Тесты (поведение, не текст исходника — §10a)

- `migration-order.test.mjs`: +6 тестов — таймштамп проходит/легаси-имя из журнала проходит/новый
  `NNNN`-номер не проходит; сортировка реальной папки; рефакторинг для рефакторинга не делал —
  `findRenamedAppliedMigrations` ловит совпадение по hash и не ловит генуинно новый контент.
- `migrate-local.test.mjs`: +3 поведенческих теста через тот же фейковый-`psql` харнесс, что уже был в
  файле — рename отказывается ДО того, как хоть один стейтмент дойдёт до `psql` (`existsSync(capture)
  === false`), обычный pending без совпадения по hash применяется как раньше, `--reapply` не путается
  с rename, даже если «чужая» строка совпадает по hash с самим переприменяемым файлом.
- `run-webapp-drizzle-migrate.mjs --self-test`: +1 сценарий на `findRenamedAppliedMigrations`.

```
$ node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs
# tests 34 · # pass 34 · # fail 0
$ node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
run-webapp-drizzle-migrate diagnostic self-test: OK
$ pnpm --dir apps/webapp run lint   # полный webapp-lint, включает check-drizzle-migration-order.sh
... exit 0
```

## Живой прогон на DEV (`bcb_webapp_dev`, единственная разрешённая база; PROD не трогался)

Через `deploy/postgres/privileges/migrate-local.mjs` — санкционированный wrapper, ни одного ручного
`psql`-наката мимо него. Для проверок ниже использован либо реальный `--drizzle-folder`, либо временная
копия папки в `/tmp` (репозиторий не менялся); каждая проверка либо read-only, либо `--rollback-only`,
либо намеренный отказ до BEGIN.

**Базовая линия** (реальная папка, без инъекций):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder $PWD/apps/webapp/db/drizzle-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=50 verified-objects=70 foreign-ledger-rows=8
```

(`foreign-ledger-rows=8` против `5` в отчёте от 19.08 — за сутки на DEV легли ещё ledger-строки от
других невлитых веток; не последствие этой ветки.)

**Pending считается верно для НОВОГО таймштамп-имени** (временная копия папки + один новый файл
`20260820T090000_audit_probe_timestamp_naming.sql`, `--rollback-only`, ничего не коммитится):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/proof-pending/mig --sudo-postgres --rollback-only
BEGIN … CREATE FUNCTION … ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=51 reapplied=0 foreign-ledger-rows=8
```

**Переименование применённой миграции отказано вслух, до BEGIN** (временная копия папки, файл
`0000_b0_baseline.sql` переименован в `20260820T091500_b0_baseline_renamed.sql`, содержимое не
тронуто — реальный сценарий «взял чужую применённую миграцию под новым именем»):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/proof-rename/mig --sudo-postgres
20260820T091500_b0_baseline_renamed.sql is byte-identical to a migration bcb_webapp_dev already
applied under a name this checkout does not carry (ledger created_at=1800000000000); renaming an
applied migration is forbidden. Restore the original file name, or if this is genuinely new work,
change its SQL.
EXIT=1
```

**Ничего не переприменилось, ледж не тронут** — после обеих проб база возвращена к прогону на реальной
папке и ответ идентичен базовой линии:

```
$ sudo -u postgres psql -d bcb_webapp_dev -Atc "select count(*), count(tag) from drizzle.__drizzle_migrations"
58|53   # то же, что до обеих проб
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder $PWD/apps/webapp/db/drizzle-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=50 verified-objects=70 foreign-ledger-rows=8
```

Байт-в-байт то же, что базовая линия — DEV не изменился ни разу за весь прогон.

**Уникальный индекс на `tag` всё ещё физически отказывает второй строке того же имени** (унаследован от
`982fd2b10`, перепроверен живьём, транзакция откачена вручную):

```
$ sudo -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1
BEGIN;
INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag) VALUES (repeat('c',64), 999999999999, '0000_b0_baseline');
ERROR:  duplicate key value violates unique constraint "drizzle_migrations_tag_key"
ROLLBACK;
```

**Буквально одинаковое имя от двух веток не проходит слияние молча** — git сам отказывает
`add/add`-конфликтом (одноразовый scratch-репозиторий в `/tmp`, не рабочее дерево):

```
$ git merge branch-b   # обе ветки добавили mig/20260820T100000_same_instant.sql с разным содержимым
CONFLICT (add/add): Merge conflict in mig/20260820T100000_same_instant.sql
Automatic merge failed; fix conflicts and then commit the result.
EXIT=1
```

## Что НЕ трогал и почему

- **Порядок = имя файла, применено = ledger-`tag`** — уже сделано `982fd2b10`, не переделывал.
- **Ни один из 50 текущих `.sql`-файлов не переименован и не тронут.** Все они применены и на DEV, и на
  TEST (задание прямо это требует); список легаси-имён берётся из уже существующего
  `meta/_journal.json`, вторую роль (закрытый список разрешённых старых имён) для него не пришлось
  создавать — она читается из тех же 50 записей.
- **5 (сейчас 8) «чужих» ledger-строк от невлитых веток** (`wt/invoice-reissue-20260819`,
  `wt/drop-patient-count-20260819`, `wt/public-booking-write-20260819`, `wt/clinic-public-page-20260819`
  и, видимо, ещё кто-то за сутки) — не мои. Когда авторы этих веток при сведении назовут свои миграции
  по новому правилу (таймштампом), коллизия `0050` x2 из находки C прошлого аудита исчезнет сама:
  разным веткам физически не достанется одна и та же секунда.
- **Находка D прошлого аудита** (второй прогонщик читает пробу присутствия объектов позиционно, без
  проверки числа строк) — не в скоупе этой миссии (это про object-presence probe, не про имена), не
  трогал.
- **`--reapply` разоружает шов аттестации у definer-функций** (находка A прошлого аудита) — тоже не в
  скоупе; вопрос уже отмечен как «ведущему», не задача этой ветки.
- **`db:migrate:drizzle` / `db:seed-drizzle-meta` в `apps/webapp/package.json`** (обход №1 и №2 из
  прошлого FAIL) — команды делают то, что канон запрещает, но живут независимо от схемы имён; не
  трогал, вне скоупа этой миссии.
- **PROD** — не подключался, не читал.

## НЕ СДЕЛАНО

- Реальное сведение пяти (уже больше — судя по `foreign-ledger-rows=8`, возможно уже 8) невлитых
  веток с ledger-строками на DEV — не пробовал, не входило в задание; их авторам придётся называть
  свои новые миграции таймштампом при следующем ребейзе/сведении, но это их работа, не эта миссия.
- Полный `pnpm ci` (весь репозиторий) не гонял — гонял `node --test` трёх файлов
  `deploy/postgres/privileges/*.test.mjs`, `run-webapp-drizzle-migrate.mjs --self-test` и полный
  `pnpm --dir apps/webapp run lint` (включает `check-drizzle-migration-order.sh` и
  `check-migration-privileges.mjs`), все зелёные.
- Находки A/D прошлого аудита (шов аттестации при `--reapply`, слабость второго прогонщика к порядку
  строк пробы) и обходы №1/№2 (`db:migrate:drizzle`, `db:seed-drizzle-meta`) — не мои, оставлены как
  были; список выше называет их явно, чтобы не потерялись.
- Не проверял `test.bersoncare.ru` (старый бокс 151.x) и `deploy-test.sh` на нём — работал только с
  локальным DEV, как требуют Hard rules миссии.
