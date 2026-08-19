# Аудит: порядок миграций по имени файла, «применено» по леджеру

Ветка `wt/migration-order-20260819` (клон `bcb-wt-migration-order-20260819`), два коммита поверх
`feat/doctor-ui-rebuild`: `c2d966607`, `c63367456`. Аудитор не чинил ничего; все инъекции откатаны,
DEV возвращён в исходное состояние (доказательство ниже).

## Вердикт

**PASS по вопросам 1–3. FAIL по вопросу 4.**

- Класс дефекта («строка в леджере есть, объекта нет, мигратор вечно печатает pending=0») **закрыт**:
  оба прогонщика останавливаются и называют пропавший объект. Доказано инъекцией на живой DEV-базе.
- Два файла `0047` на реальном состоянии ведут себя корректно: ни одна применённая запись не
  переставляется и не переприменяется.
- DEV и TEST (50 применённых) переходят на новое правило без единого переприменения.
- **FAIL:** канон этой же ветки заявляет «Ручной `psql`-накат мимо wrapper'а не пишет леджер и
  запрещён» и «Мигратор Drizzle ORM здесь не используется». В том же `apps/webapp/package.json`
  живут две команды, которые делают ровно это, и ничто их не гасит. Плюс ещё два способа провести
  миграцию мимо правила — ниже.

---

## 1. Класс закрыт или переехал? — ЗАКРЫТ

### Инъекция на живой DEV

Дыра смоделирована переименованием функции (`RENAME` сохраняет oid, владельца, тело и ACL — точный
откат без дрейфа прав). Цель — `app.open_or_touch_operator_probe_incident` из миграции
`0047_the_opening_door_did_not_learn_the_new_alarm_words`, той самой, что кусала 19.08.

```
$ sudo -u postgres psql -X -d bcb_webapp_dev -c \
  "ALTER FUNCTION app.open_or_touch_operator_probe_incident(text,text,text) RENAME TO _audit_missing_20260819;"
ALTER FUNCTION
```

**Прогонщик №1, wrapper DEV/TEST** (`deploy/postgres/privileges/migrate-local.mjs` — тот, что зовут
`deploy/host/migrate-dev.sh` и `deploy/host/deploy-test.sh`):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
    --migrator bcb_dev_migrator --drizzle-folder $PWD/apps/webapp/db/drizzle-migrations --sudo-postgres
bcb_webapp_dev records 1 migration(s) as applied whose objects are not in the catalog, so the ledger is answering for a schema it does not have:
  absent: function app.open_or_touch_operator_probe_incident (from 0047_the_opening_door_did_not_learn_the_new_alarm_words)
Re-run with --reapply 0047_the_opening_door_did_not_learn_the_new_alarm_words to send them through this same wrapper again, after confirming each is safe to execute twice.
EXIT=1
```

**Прогонщик №2, `pnpm run migrate`** (`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`), та же
живая база:

```
$ sudo -u postgres env DATABASE_URL="postgresql:///bcb_webapp_dev?host=/var/run/postgresql" \
    /usr/bin/node <staged copy>/apps/webapp/scripts/run-webapp-drizzle-migrate.mjs
[migrate] migration_ledger_answers_for_absent_objects function app.open_or_touch_operator_probe_incident (from 0047_the_opening_door_did_not_learn_the_new_alarm_words)
[migrate] Drizzle migration failed; raw SQL and parameters suppressed
EXIT=1
```

Оба останавливают прогон, оба называют объект и его миграцию, ни один не печатает «already current».
Прогон повторяется при каждом запуске — это не разовая проверка, а гейт перед применением.

### Preflight и восстановление

```
$ … --rollback-only                                   → тот же отказ, EXIT=1
$ … --rollback-only --reapply 0047_the_opening_door_…  → ROLLBACK; pending=1 total=50 reapplied=1; функция по-прежнему отсутствует (count=0)
$ … --reapply 0047_the_opening_door_…                  → COMMIT; pending=1 total=50 reapplied=1 foreign-ledger-rows=5
```

Строка леджера после `--reapply` одна, не две (частичный уникальный индекс `drizzle_migrations_tag_key`
физически не даёт записать второй строке тот же tag; индекс проверен на DEV и на TEST).

Охранники `--reapply` работают:

```
$ … --reapply 0099_not_a_file
--reapply names 0099_not_a_file, which is not a migration file in …/db/drizzle-migrations   EXIT=1
```

### 🔴 Находка A (важная): `--reapply` в одиночку разоружает definer-функцию

`--reapply` ставит **тело из файла миграции**, а живое тело функции на DEV содержит ещё и шов
аттестации, который приезжает декларацией прав, а не миграцией. Замер:

```
$ diff <(prosrc до) <(prosrc после --reapply)
5d4
<   PERFORM app.require_attested_context_for_roles('app_seam_telemetry_operator_owner'::name, ARRAY['app_operational_scheduler'::name]::name[]);
```

Источник шва: `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:2200` — функция объявлена
`attested` с этим самым телом-обёрткой. Вместе с телом `--reapply` теряет и грант:

```
до:    app_seam_telemetry_operator_owner=X/… | app_operational_scheduler=X/…
после: app_seam_telemetry_operator_owner=X/…            ← грант app_operational_scheduler пропал
```

В штатном пути это безопасно: и `migrate-dev.sh --execute`, и `deploy-test.sh` обязательно гонят
reconcile последним шагом. Опасна ровно фраза канона (`AGENTS.md` §1, «Восстановление — тем же
wrapper'ом, `--reapply <tag>`») — прочитанная как самостоятельная команда, она оставляет
definer-функцию без шва аттестации и без EXECUTE у рабочей роли. **Это вопрос ведущему, не задача
аудитора:** в решении владельца пункта про текст восстановления нет.

### Откат инъекции

```
BEGIN;
DROP FUNCTION app.open_or_touch_operator_probe_incident(text,text,text);   -- тело, поставленное --reapply
ALTER FUNCTION app._audit_missing_20260819(text,text,text) RENAME TO open_or_touch_operator_probe_incident;
UPDATE drizzle.__drizzle_migrations SET created_at = 1800000051000, hash = '38625073a056…4e0c' WHERE tag = '0047_the_opening_door_…';
COMMIT;
```

Сверка после отката — состояние совпадает с доинъекционным побайтно:

| | до | после |
|---|---|---|
| oid функции | 1991727 | 1991727 |
| md5(prosrc) | bb5f4f9f1da486fe7a0fd6d8daa4ccf5 | bb5f4f9f1da486fe7a0fd6d8daa4ccf5 |
| ACL | owner=X · app_operational_scheduler=X | owner=X · app_operational_scheduler=X |
| строка леджера | 1800000051000 / 38625073a056… | 1800000051000 / 38625073a056… |
| строк в леджере | 55 (50 с tag) | 55 (50 с tag) |

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev …
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=50 verified-objects=70 foreign-ledger-rows=5
```
— тот же вывод, что был снят до инъекции.

### Находка B: гейт видит не всё, что делает миграция

Замер на реальной папке: 50 миграций дают **70** проверяемых объектов — 58 функций, 9 колонок,
3 ограничения. Индексов, таблиц, типов, представлений и триггеров в post-B0 миграциях просто нет.
**Восемь миграций не дают гейту ни одного объекта:**

```
0000_b0_baseline, 0002_…slot_snapshot_settings, 0010_…staff_notification_profiles,
0014_…rating_capabilities, 0028_port_context_rows_die_with_their_transaction,
0034_a_new_clinic_needs_a_reference_catalog_to_copy,
0036_the_content_argument_cannot_survive_the_wire_as_jsonb, 0044_a_link_to_a_video_host_is_a_kind_of_media
```

Причины разные и обе законные: `B0` намеренно не создаёт объектов; часть миграций только заменяет
функцию, созданную более ранней (объект засчитан последней миграции, которая его трогала); часть —
чистый data-backfill. Следствие одно: **для этих миграций «применено» по-прежнему проверяется только
строкой леджера** — см. вопрос 4, тест T2b. Гейт также проверяет ТОЛЬКО существование объекта по
имени, не его тело: разошедшееся тело функции (как в находке A) он не увидит.

---

## 2. Два файла с одним номером — на реальном состоянии

Реальное состояние подтверждено (Q2 брифа верен):

- в папке лежат `0047_the_opening_door_did_not_learn_the_new_alarm_words` и
  `0047_the_public_funnel_had_no_door_of_its_own`, всего 50 файлов;
- в журнале первый стоит ПОСЛЕ `0049` (`when=1800000051000` против `1800000050000`);
- номер `0048` занят невлитой веткой `wt/clinic-public-page-20260819`
  (`0048_a_lifetime_allowance_counted_by_join_is_not_lifetime`, `when=1800000060000`).

**Что делает новый порядок.** Множества файлов и журнала совпадают; расхождение порядка ровно одно —
переезжает одна миграция:

```
pos 47: имя=0047_the_opening_door_…       журнал=0047_the_public_funnel_…
pos 48: имя=0047_the_public_funnel_…      журнал=0049_a_clinic_had_a_booking_form_…
pos 49: имя=0049_a_clinic_had_a_booking_form_…  журнал=0047_the_opening_door_…
```

**Переименование НЕ меняет уже применённые записи.** Порядок управляет только последовательностью
применения pending-миграций; на DEV и TEST обе `0047` имеют строку в леджере, значит ни одна не
pending, и последовательность к ним не применяется вовсе. `created_at` существующих строк новый код
не трогает (единственная запись `created_at` — `MAX+1000` при вставке НОВОЙ строки).

Единственный сценарий, где переезд был бы виден, — накат всех 50 с нуля. Он и не поддерживается:
`AGENTS.md` §1b.3a прямо запрещает собирать схему проигрыванием исторической цепочки, новая изолированная
БД делается снимком принятой структуры и леджера. Для полноты — даже там переезд инертен: единственная
переезжающая миграция ссылается только на `app.open_or_touch_operator_incident`,
`app.open_or_touch_operator_probe_incident`, `app.resolve_operator_probe_incidents` (соседи из `0041`/`0046`)
и ничего не берёт ни у `0047_the_public_funnel_…`, ни у `0049`.

### 🔴 Находка C: переходный конфликт `when` у пяти невлитых веток

На DEV в леджере 55 строк: 50 с tag и **5 без tag** — `created_at` 1800000052000, …53000, …55000,
…56000, …60000. Это миграции соседних веток, накаченные на DEV старым wrapper'ом (он писал
`created_at = when` и не знал колонки `tag`). Сопоставление по журналам веток:

| created_at | ветка | миграция |
|---|---|---|
| 1800000052000 | `wt/invoice-reissue-20260819` **и** `wt/drop-patient-count-20260819` | `0050_a_seat_invoice_is_not_cancelled_it_is_reissued` **и** `0050_a_clinic_is_billed_for_seats_not_for_people` |
| 1800000053000 | `wt/public-booking-write-20260819` | `0051_a_public_visitor_becomes_a_client_when_identified` |
| 1800000055000 | `wt/public-booking-write-20260819` | `0052_a_failed_public_booking_must_not_leave_a_client` |
| 1800000056000 | `wt/public-booking-write-20260819` | `0053_a_visitor_booking_spends_no_tariff_seat` |
| 1800000060000 | `wt/clinic-public-page-20260819` | `0048_a_lifetime_allowance_counted_by_join_is_not_lifetime` |

Две ветки заняли ОДИН номер `0050` и ОДИН `when=1800000052000`, а строка на DEV одна. Обе миграции —
`CREATE OR REPLACE` существующих функций, поэтому по каталогу не различить, чья именно легла.

Механика новой схемы даёт этим строкам имя единственным способом — через backfill из журнала по
`created_at`. Значит при сведении каждая такая ветка обязана принести журнальную запись со СВОИМ
`when` и СВОИМ именем файла. Отсюда переходное противоречие с решением владельца
(«просто переименуешь в нужной последовательности когда будешь сводить»):

- переименовал файл, журнал не тронул → `check-drizzle-migration-order.sh` падает
  («the historical map names …, which has no .sql file») — проверено, см. T1a;
- поправил tag в журнальной записи → это и есть та самая правка «замороженной карты» руками, которую
  канон запрещает («Журнал больше НЕ задаёт порядок и руками не правится»);
- не тронул ничего и слил обе ветки с `0050` → лязгает гейт «two entries claim when=1800000052000».

Это касается ровно тех миграций, что уже легли на DEV старым wrapper'ом (сегодня — пять строк),
и исчезает само, как только все они сведены. **Вопрос ведущему:** какой порядок сведения этих пяти
веток считается правильным. В решении владельца этого пункта нет — задачу из находки не завожу.

---

## 3. Уже применённые базы — переприменения нет

| | `bcb_webapp_dev` | `bersoncarebot_test` |
|---|---|---|
| строк в леджере | 55 | 50 |
| строк с `tag` | 50 | 50 |
| колонка `tag` + `drizzle_migrations_tag_key` | есть | есть |
| объектов ожидается / найдено | 70 / 70 | 70 / 70 |
| прогон wrapper'а | `pending=0 total=50 verified-objects=70 foreign-ledger-rows=5` | (гоняется своим deploy-путём) |

Проба присутствия объектов на обеих базах — read-only, ни одного `f`:

```
$ node -e "…renderObjectPresenceSql(collectExpectedObjects(readMigrationFolder(…)))" > probe.sql
$ sudo -u postgres psql -X -d bcb_webapp_dev  -Atc "$(cat probe.sql)" | awk -F'|' '{n++; if($2=="t") ok++} END{print n, ok}'   → 70 70
$ sudo -u postgres psql -X -d bersoncarebot_test -Atc "$(cat probe.sql)" | awk -F'|' '{n++; if($2=="t") ok++} END{print n, ok}' → 70 70
```

Обе базы называют все 50 файлов по имени, значит `selectPendingMigrations` вернёт пусто, и wrapper
выходит **до** любого DDL (`process.exit(0)` в ветке `pending.length === 0`). Ничего не
переприменяется. Порядок применённых записей не переставляется: `created_at` существующих строк не
переписывается нигде, кроме явного `--reapply` (и там только для названного tag).

Отдельный замер, который подтверждает исходную посылку решения владельца: **28 из 50 файлов сегодня
имеют хеш, отличный от записанного при применении** (файл штатно правят на месте после наката —
например, `85c01b980` вычистил `REVOKE` из девяти применённых миграций). Хеш личностью быть не может;
имя файла — может.

---

## 4. Обход — FAIL, четыре живых способа

### 4.1 🔴 `pnpm --dir apps/webapp db:migrate:drizzle` — тот самый watermark-мигратор

`apps/webapp/package.json:59`:
```json
"db:migrate:drizzle": "drizzle-kit migrate",
```
Канон ветки (`AGENTS.md` §1): «Мигратор Drizzle ORM здесь не используется: он применяет
`when > max(created_at)` по журналу, то есть несёт ровно ту болезнь, которую этот модуль лечит».
Команда осталась в том же `package.json`, одной строкой запускает выкинутое правило, а строки, которые
она напишет, не будут нести `tag` — то есть станут «чужими» навсегда, и их миграции останутся pending
для нового wrapper'а. Ничего не гасит эту команду: ни lint, ни гейт порядка.

### 4.2 🔴 `pnpm --dir apps/webapp db:seed-drizzle-meta` — «дописать строку леджера» готовым скриптом

`apps/webapp/package.json:60` → `apps/webapp/scripts/seed-drizzle-migrations-meta.mjs`. Собственная
докстрока: «Does not execute migration SQL». Скрипт вставляет строку «применено» для каждой записи
журнала, дедуп — по хешу файла, `tag` не пишет вовсе. Канон ветки: «Ручной `psql`-накат мимо
wrapper'а не пишет леджер и запрещён» — этот скрипт делает хуже: пишет леджер, ничего не накатывая.

Дополнительно: раз 28 из 50 хешей уже разошлись (см. §3), запуск сегодня вставит **28 дублирующих
строк**, после чего backfill попытается присвоить дубликату уже занятый tag и упрётся в
`drizzle_migrations_tag_key` — мигратор перестанет стартовать до ручной чистки.

### 4.3 Дописать строку леджера руками — ловится только для «видимых» миграций

Проверено на живой DEV в отдельной копии папки миграций (файлы репозитория не трогались).

**T2a — миграция объявляет функцию:**
```
$ psql -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
           VALUES (repeat('a',64), 1800000070000, '0060_audit_probe_visible')"
$ node …/migrate-local.mjs --drizzle-folder /tmp/audit-folder …
bcb_webapp_dev records 1 migration(s) as applied whose objects are not in the catalog…
  absent: function app.audit_probe_fn_20260819 (from 0060_audit_probe_visible)
EXIT=1
```
Подделка поймана. ✅

**T2b — миграция без объектов, которые классификатор умеет назвать** (чистый data-backfill, как
восемь реальных миграций из находки B):
```
$ psql -c "INSERT INTO … VALUES (repeat('b',64), 1800000071000, '0061_audit_probe_invisible')"
$ node …/migrate-local.mjs --drizzle-folder /tmp/audit-folder …
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 verified-objects=70 foreign-ledger-rows=5
EXIT=0
```
Подделка НЕ поймана — миграция навсегда «применена», не выполнившись ни разу. ❌

### 4.4 Поднять `when` в «замороженном» журнале — работает

`when` больше не задаёт порядок, но всё ещё задаёт **личность** для строк без `tag`. Одна дописанная
строка в `meta/_journal.json` присваивает имя чужой строке леджера:

```
до:  pending=1 total=51 … (миграция 0061 не применена)
+ в meta/_journal.json: {"idx":50,"when":1800000060000,"tag":"0061_audit_probe_invisible"}
после: already current … pending=0 total=51 verified-objects=70 foreign-ledger-rows=4
$ psql -Atc "select created_at, tag from … where created_at=1800000060000"
1800000060000|0061_audit_probe_invisible
```

Никем не выполненная миграция объявлена применённой, `check-drizzle-migration-order.sh` этого не
видит (запись указывает на реальный файл, дублей `when`/`tag` нет). Единственный след — счётчик
`foreign-ledger-rows` упал с 5 до 4, и смотреть на него никто не обязан. Строка `1800000060000` на
DEV принадлежит `0048` из `wt/clinic-public-page-20260819` — то есть подделка не гипотетическая: она
угоняет личность конкретной чужой миграции.

Откат: `UPDATE drizzle.__drizzle_migrations SET tag = NULL WHERE tag = '0061_audit_probe_invisible'`
— выполнено, обе поддельные строки удалены, DEV сверен (55 строк / 50 с tag, те же `created_at`).

### 4.5 Переименовать применённый файл — защита есть, но она временная

```
T1a: git mv 0046_a_dead_row_… → 0046a_renamed_by_audit; bash scripts/check-drizzle-migration-order.sh
     check-drizzle-migration-order: the historical map names 0046_a_dead_row_…, which has no .sql file  EXIT=1   ✅
T1b: новый файл 0060_audit_probe_not_in_journal.sql (в журнале его нет)
     check-drizzle-migration-order: OK   EXIT=0
     mv → 0061_audit_probe_renamed.sql
     check-drizzle-migration-order: OK   EXIT=0   ❌
```

Защита от переименования держится на журнале, а журнал заморожен: у каждой миграции, созданной ПОСЛЕ
этой ветки, журнальной записи не будет. Переименование такой миграции после применения проходит lint
молча, а wrapper увидит новое имя как pending и накатит её второй раз (гейт присутствия не сработает —
объекты-то на месте). Смягчает только содержимое: `ADD COLUMN` во всех миграциях идёт с
`IF NOT EXISTS` (файлов без него — ноль), верхнеуровневые `INSERT` несут `ON CONFLICT`. То есть
повторный накат сегодня скорее всего безвреден, но безвредность ничем не проверяется — канон честно
кладёт её на оператора («after confirming each is safe to execute twice»).

### Находка D: второй прогонщик закрыт слабее первого и не защищён тестом

`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs:265-273` читает ответ пробы **позиционно**:
```js
const present = (await pool.query(presenceSql)).rows;
const missing = expected.filter((_, index) => present[index]?.present === false);
```
Колонка `at`, которую сам же `renderObjectPresenceSql` кладёт в каждую строку, игнорируется, а
`UNION ALL` без `ORDER BY` порядок строк не гарантирует. Wrapper в этом месте строит `Map` по `at` и
отдельно проверяет `present.size !== objects.length` — второй прогонщик такой проверки не имеет:
недосчитанная строка даёт `undefined?.present === false` → `false`, то есть **отсутствующий объект
будет молча зачтён как присутствующий**. Практически строки приходят по порядку, поэтому живой прогон
выше и сработал; это хрупкость, не наблюдаемый отказ.

Отдельно: ни один тест не ссылается на `run-webapp-drizzle-migrate.mjs`
(`grep -rln "run-webapp-drizzle-migrate" --include=*.test.* .` → пусто). Его `--self-test` покрывает
выбор pending и диагностику, но ветку `migration_ledger_answers_for_absent_objects` не покрывает
никто. У wrapper'а такая ветка закреплена настоящим поведенческим тестом
(`migrate-local.test.mjs:289` гоняет реальный скрипт через подменный `psql`).

---

## Зелёные гейты (проверено самостоятельно, не по отчёту исполнителя)

```
$ node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs
# tests 20 · # pass 20 · # fail 0
$ node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
run-webapp-drizzle-migrate diagnostic self-test: OK
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
```

Тесты в `migrate-local.test.mjs` проверяют ПОВЕДЕНИЕ (§10a): запускают реальный скрипт с подменным
`psql`, который отвечает на три разных вопроса, и смотрят на собранную транзакцию и на код возврата, —
а не на текст исходника.

Мёртвых ссылок на снятый `check-drizzle-journal-sync.sh` в исполняемых путях не осталось
(`grep` по `*.sh`/`*.mjs`/`*.json` — только исторические `docs/`).

---

## НЕ ПРОВЕРЕНО

1. **Настоящий TEST-хост.** Проверен локальный `bersoncarebot_test` на этом боксе (50 строк, все с
   tag, 70/70 объектов). Живой `test.bersoncare.ru` (старый бокс 151.x) и `deploy-test.sh` на нём не
   запускались и не трогались.
2. **ПРОД** — не трогался ни в каком виде: ни чтения, ни подключения.
3. **Накат с нуля на пустой базе** — запрещён `AGENTS.md` §1b.3a, не выполнялся. Вывод по порядку в
   этом сценарии сделан статически (единственная переезжающая миграция и её ссылки), не исполнением.
4. **Реальное сведение пяти невлитых веток** (находка C) — не пробовалось; предсказание поведения
   сделано по механике backfill и по гейту `check-drizzle-migration-order.sh`, ни одна ветка не
   сливалась.
5. **`--reapply` на миграции с побочными эффектами** — проверен только на одной чисто идемпотентной
   (`CREATE OR REPLACE FUNCTION`, один statement). Утверждение «повторный накат безвреден» для
   остальных 49 сделано чтением (нет `ADD COLUMN` без `IF NOT EXISTS`, верхнеуровневые `INSERT` с
   `ON CONFLICT`), а не исполнением.
6. **Находка D, гонка порядка `UNION ALL`** — воспроизвести отказ не удалось и не пытался: порядок
   строк в PostgreSQL для такого запроса на практике совпадает с текстовым. Находка — о гарантии,
   которой в коде нет, и об отсутствующей проверке числа строк, а не о наблюдённом сбое.
7. **Полный CI** (`pnpm ci`) не гонялся: аудит целился в поведение мигратора. Гоняли `node --test`
   двух файлов, `--self-test` и гейт порядка.
8. **Права после инъекции** восстановлены переименованием обратно (ACL сохраняется при `RENAME`) и
   сверены по `proacl`; полный срез прав базы (reconcile-verify) не гонялся.

## Состояние DEV на момент сдачи отчёта

```
$ sudo -u postgres psql -X -d bcb_webapp_dev -Atc "select count(*), count(tag) from drizzle.__drizzle_migrations"
55|50
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder $PWD/apps/webapp/db/drizzle-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=50 verified-objects=70 foreign-ledger-rows=5
```
Совпадает с состоянием до аудита. Временные файлы (`/tmp/audit-folder`, `/tmp/audit-mig`) удалены,
рабочее дерево репозитория без изменений, кроме этого отчёта.
