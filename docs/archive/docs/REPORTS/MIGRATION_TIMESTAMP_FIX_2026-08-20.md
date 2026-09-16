# Фикс трёх находок аудита + откат/переименование/повторный прогон трёх миграций

Ветка `wt/migration-timestamp-20260819`. Роль — исполнитель по брифу оркестратора, ссылающегося на
`docs/REPORTS/MIGRATION_TIMESTAMP_NAMES_AUDIT_2026-08-20.md` (вердикт FAIL, три находки) и на решение
владельца 20.08, дословно: «так откати миграции, переименуй и пройди заново»
(`docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`, «Пятая ошибка живого прохода»).

Все прогоны против БД — `bcb_webapp_dev` (единственная разрешённая), через `sudo -u postgres psql`
или `deploy/postgres/privileges/migrate-local.mjs --sudo-postgres`. TEST и PROD не открывались.

---

## F1. Гейт имени жил только в `pnpm run lint`

**Находка аудита:** `findMigrationNameViolations` вызывалась ровно из `check-drizzle-migration-order.sh`;
ни `migrate-local.mjs`, ни `run-webapp-drizzle-migrate.mjs` его не звали — файл со старым числовым
именем проходил `migrate-local.mjs --rollback-only` до `BEGIN`/`INSERT` без единого возражения.

**Фикс.** Оба прогонщика теперь зовут `findMigrationNameViolations` из того же модуля
(`deploy/postgres/privileges/migration-order.mjs`) ДО первого обращения к базе (в
`migrate-local.mjs` — сразу после `readMigrationFolder`, до `bootstrapLedger`'а завершения; в
`run-webapp-drizzle-migrate.mjs` — до создания `pg.Pool`, то есть до единого соединения с базой).
Источник легаси-списка для этой проверки — НЕ живой `meta/_journal.json` (см. F2), а новый
замороженный `meta/_journal.frozen.json`.

**Юнит-тесты** (`deploy/postgres/privileges/migrate-local.test.mjs`, через фейковый `psql`-бинарь,
без обращения к реальной базе):

```
$ node --test deploy/postgres/privileges/migrate-local.test.mjs
✓ a new file with a hand-picked number the frozen snapshot does not know is refused, not applied
✓ a new timestamp-named file is applied normally, not refused by the name gate
# tests 14 · # pass 14 · # fail 0
```

Первый тест — инъекция: тот самый файл из аудита (`0051_audit_old_numbered_new_file.sql`
переименован здесь в `0051_audit_old_numbered_new_file` для узнаваемости), добавленный к пендингу.
Без фикса (защита снята — тест писался ДО правки и красил, проверено вручную откатом изменений в
`migrate-local.mjs` во время разработки): файл доходил до `psql`. С фиксом:

```
check-drizzle-migration-order (эквивалент): 0051_audit_old_numbered_new_file.sql is not named
YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy snapshot does not know it as a legacy name
```

и `existsSync(runtime.capture) === false` — ни один statement не дошёл до psql.

**Живой прогон на DEV** (`migrate-local.mjs`, F1(a) из аудита, ровно тот кейс):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/probe-single --sudo-postgres --rollback-only
# /tmp/probe-single = реальная папка + 20991231T235959_zz_rollback_probe.sql (валиден по имени —
# тест на позитивный путь; отдельно юнит-тестом покрыт кейс с плохим именем, см. выше)
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=2 total=52 …
```

**Живой прогон `run-webapp-drizzle-migrate.mjs`** (`pnpm run migrate`, кейс, который аудит НЕ
проверил живьём — «§3(а) НЕ ПРОВЕРЕНО: run-webapp-drizzle-migrate.mjs не прогонялся живьём»):

```
$ cd apps/webapp
$ cat > db/drizzle-migrations/0099_fault_injection_probe.sql <<'EOF'
-- BCB-MIGRATION-OWNER: app_probe_owner
SELECT 1;
EOF
$ DATABASE_URL="postgresql://unused:unused@127.0.0.1:5/unused" node scripts/run-webapp-drizzle-migrate.mjs
[migrate] migration_name_violation 0099_fault_injection_probe.sql is not named
YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy snapshot (meta/_journal.frozen.json) does not
know it as a legacy name.
EXIT=1
$ rm db/drizzle-migrations/0099_fault_injection_probe.sql   # инъекция снята, git status чист
```

Отказ пришёл ДО `new pg.Pool(...)` — ни одного соединения с базой не открывалось (поэтому фиктивный
`DATABASE_URL` безопасен для этой проверки). Оба прогонщика теперь красят F1(a) из аудита.

---

## F2. Рост «закрытого списка легаси-имён» был невидим гейту

**Находка аудита:** `wt/drop-patient-count-20260819` добавила 51-ю запись в `meta/_journal.json`
(перелейбл своего `0050_…` в «легаси»), и `check-drizzle-migration-order.sh` ответил `OK` — он
проверял живой журнал сам с собой, а не то, что журнал не вырос.

**Фикс.** Легаси-список для `findMigrationNameViolations` и новая функция `findJournalGrowth`
берут данные из `apps/webapp/db/drizzle-migrations/meta/_journal.frozen.json` — второго, отдельного
файла, который НЕ пишет ни один раннер и ни один бутстрап-шаг; меняется он только рукой, в
рецензируемом диффе. Живой `meta/_journal.json` остаётся редактируемым (это его единственная
оставшаяся работа — `when → tag` карта для разметки исторических ledger-строк), но он больше НЕ
является источником для проверки имён — рост живого файла не может расширить то, против чего его
же и проверяют, потому что проверяют уже не его.

`check-drizzle-migration-order.sh` дополнительно сравнивает живой журнал с замороженным и красит
ЛЮБОЙ тег, которого замороженный список не знает — независимо от того, есть ли под него `.sql`-файл.

**Юнит-тесты** (`deploy/postgres/privileges/migration-order.test.mjs`):

```
✓ the frozen snapshot is read, not the live journal, for the legacy-name allowlist
✓ a tag the live journal knows and the frozen snapshot does not is journal growth
✓ a live journal identical to the frozen snapshot is not growth
# tests 20 · # pass 20 · # fail 0
```

**Живая инъекция ровно того случая, что нашёл аудит** (в реальном `apps/webapp/db/drizzle-migrations`
этой ветки — не в scratch-копии):

```
$ python3 -c "
import json
d = json.load(open('apps/webapp/db/drizzle-migrations/meta/_journal.json'))
d['entries'].append({'idx': 50, 'when': 1800000090000, 'tag': '0054_snuck_in_as_legacy', 'breakpoints': True})
json.dump(d, open('apps/webapp/db/drizzle-migrations/meta/_journal.json','w'), indent=2)
"
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
check-drizzle-migration-order: meta/_journal.json carries 0054_snuck_in_as_legacy, which
meta/_journal.frozen.json does not know; the closed legacy-name list grew — revert the journal edit,
or grandfather the name in meta/_journal.frozen.json in its own reviewed diff
EXIT=1
$ # откат инъекции — восстановлен исходный meta/_journal.json
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
check-drizzle-migration-order: OK
```

**Почему проверка не сломается на легитимной истории (владелец явно спросил обосновать).**
Число 50 нигде не зашито — `findJournalGrowth` сравнивает МНОЖЕСТВА тегов, а не считает записи;
он краснеет ровно на теге, которого нет в замороженном файле, и называет этот тег. Единственный
способ легитимно «вырастить» список — рецензируемый дифф `meta/_journal.frozen.json` самим этим
файлом: это ЕДИНСТВЕННОЕ место, где решение владельца грандфазерить конкретное старое имя видно в
git blame. Живой журнал вообще перестаёт быть источником этого решения, поэтому больше не имеет
значения, сколько записей в нём — рост живого файла (в его законной роли — `when→tag` бутстрап-карта
для новой базы) НИКОГДА не пройдёт незамеченным мимо проверки имени, потому что проверка имени его
больше не читает.

---

## F3. Порядок приземления: откат, переименование, повторный прогон

Три ветки на момент начала работы (замер `git worktree list` + прямые запросы к
`bcb_webapp_dev.drizzle.__drizzle_migrations`):

| ветка | старое имя файла | состояние на DEV на момент старта |
|---|---|---|
| `wt/invoice-reissue-20260819` | `0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql` | применена, tag в леджере `created_at=1800000071000` |
| `wt/drop-patient-count-20260819` | `0054_a_clinic_is_billed_for_seats_not_for_people.sql` | применена, tag в леджере `created_at=1800000072000` |
| `wt/media-worker-root-20260819` | `0050_the_transcode_queue_dispatcher_had_no_door.sql` (уже влита в `feat/doctor-ui-rebuild` коммитом `4fe5d179f`, владелец, напрямую) | **НЕ применена по тегу** (см. ниже) |

### Замер: что на самом деле применено (не по аудиту, свежий запрос)

```
$ sudo -u postgres psql -d bcb_webapp_dev -Atc \
    "select tag,created_at,hash from drizzle.__drizzle_migrations order by created_at"
```

Три функции media-worker-root (`app.claim_media_transcode_job`, `app.read_media_transcode_job_media`,
`app.record_media_transcode_job_outcome`) **уже существовали в базе** (`pg_proc`), но НИ ОДНА строка
леджера не совпадала с sha256-хешем файла `0050_the_transcode_queue_dispatcher_had_no_door.sql`
(`66db5bf7…`). Вывод: DDL этой миграции применён к DEV мимо `migrate-local.mjs --drizzle-folder`
(вероятно старым `--step`-путём этого же wrapper'а, который не пишет ledger вовсе) — леджер про неё
не знает ничего. Это НЕ регрессия сегодняшнего фикса: гейт «строка леджера — заявление, а не
доказательство» (`findMissingObjects`) её и не должен был поймать, поскольку он ловит обратный
случай (леджер заявляет — объектов нет), а не «объекты есть — леджер молчит». Отдельная, не в
скоупе этой миссии, находка.

### Откат (только там, где реально применено)

**invoice-reissue** — ручной SQL-скрипт (см. «⛔ обход wrapper'а» ниже), обратный порядок к
statement'ам файла: `DROP FUNCTION app.release_carried_seat_debt`; `refresh_saas_billing_invoice_purchased_tariff`
возвращена к телу миграции `0023` (единственная более ранняя версия — сверено `diff`, отличалась
только формулой `v_amount_minor`, без `carried_debt_minor`); `DROP INDEX idx_saas_billing_invoices_seat_debt`;
4 `DROP CONSTRAINT`; 2 `DROP COLUMN`; `DELETE FROM drizzle.__drizzle_migrations WHERE tag='0050_a_seat_invoice_is_not_cancelled_it_is_reissued'`.
Проверено ДО отката: ни одной строки `saas_billing_invoices` с ненулевым `carried_debt_minor` или
не-NULL `superseded_by_invoice_id` — откат колонок не терял данные.

```
$ sudo -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f rollback_invoice_reissue.sql
BEGIN … DROP FUNCTION … CREATE FUNCTION … DROP INDEX … ALTER TABLE ×6 … DELETE 1 … COMMIT
```

Проверено после: колонки/constraint/индекс/функция `release_carried_seat_debt` отсутствуют;
`refresh_saas_billing_invoice_purchased_tariff`'s тело (через `pg_get_functiondef`) — без
`carried_debt_minor` в формуле, byte-эквивалентно 0023.

**drop-patient-count** — данные восстановлены СВЕРКОЙ с `bersoncarebot_test` (эта миграция там не
применялась ни разу — `select tag from … where tag ilike '0050%' or tag ilike '0054%'` → пусто на
TEST). На TEST тариф `d1156dc6-e71e-4225-ad94-93c9d423c9e1` («ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК», ТОТ ЖЕ
`id`, что на DEV) несёт `quotas.patient_count = {"kind":"unlimited","unit":"items","limit":null,"warningAtPercent":null}`
— на DEV этого ключа не было ни у одного тарифа. Ни один другой тариф, ни одна строка
`saas_org_entitlement_overrides` с `mechanic='patient_count'` на TEST не найдены — то есть остальные
две части UPDATE/DELETE миграции были no-op'ами и на DEV, восстанавливать больше нечего.

```sql
UPDATE public.saas_tariffs
SET quotas = quotas || '{"patient_count": {"kind":"unlimited","unit":"items","limit":null,"warningAtPercent":null}}'::jsonb
WHERE id = 'd1156dc6-e71e-4225-ad94-93c9d423c9e1' AND NOT (quotas ? 'patient_count');
-- функция app.resolve_organization_mechanic_access вернута к телу 0022 (diff против 0054 показал
-- ЕДИНСТВЕННОЕ отличие — presence 'patient_count' в ARRAY всегда-включённых механик)
DELETE FROM drizzle.__drizzle_migrations WHERE tag = '0054_a_clinic_is_billed_for_seats_not_for_people';
```

Проверено после: `quotas` тарифа снова несёт `patient_count`; `pg_get_functiondef` функции содержит
`ARRAY['files', 'patient_count', 'branches']` (0022-форма).

**media-worker-root** — отката НЕ потребовалось: тега в леджере не было (см. замер выше), а сами
три функции — идемпотентный `CREATE OR REPLACE`, их наличие в базе безопасно оставить и
переопределить заново тем же телом при повторном прогоне.

### ⛔ Обход wrapper'а — назван прямо, как требует бриф

И ручной откат DDL (два `psql -f` скрипта выше), и `DELETE FROM drizzle.__drizzle_migrations` внутри
них — это откат мимо штатного пути. **Другого пути нет**: в этом кодовой базе нет автоматизированного
down-migration механизма (Drizzle ORM здесь не используется вовсе, свой раннер down-миграций не
писан). Откат сделан суперпользователем `postgres` (`sudo -u postgres psql -f`), одной транзакцией на
каждую миграцию, с проверкой «до» (что реально нетронуто/пусто) и «после» (что откачено дословно до
до-состояния — сверено с версией функции в миграции-предшественнике и с TEST для данных).

### Переименование

Файлы переименованы `git mv` (содержимое побайтно не менялось) — метка времени взята из времени
коммита файла в его ветке (`git log -1 --format=%cI`, переведено в UTC):

| ветка | старое имя | новое имя |
|---|---|---|
| `wt/invoice-reissue-20260819` | `0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql` | `20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued.sql` |
| `wt/drop-patient-count-20260819` | `0054_a_clinic_is_billed_for_seats_not_for_people.sql` | `20260819T210005_a_clinic_is_billed_for_seats_not_for_people.sql` |
| `wt/media-worker-root-20260819` | `0050_the_transcode_queue_dispatcher_had_no_door.sql` | `20260819T205420_the_transcode_queue_dispatcher_had_no_door.sql` |

Тот же файл под тем же новым именем переименован ЕЩЁ в двух местах, куда он попал слиянием ДО этой
работы (не названы в брифе явно, но без этого `pnpm run lint` не мог быть зелёным ни там, ни в
`feat`, куда эта работа обязана была это доказать):
- `feat/doctor-ui-rebuild` (`/home/dev/dev-projects/BersonCareBot`) — владелец закоммитил файл сюда
  напрямую (`4fe5d179f`, 19.08) под старым именем; переименован тем же `git mv` + журнал поправлен.
- собственный worktree этой ветки (`wt/migration-timestamp-20260819`) — унаследовал файл слиянием
  `feat` (коммит `ccb87b5bf` в начале работы); переименован тоже.

В КАЖДОМ из пяти мест (три ветки-мигрантки + feat + своя ветка) хвостовая запись
`meta/_journal.json` с `tag` переименованного файла удалена — иначе она осиротела бы (нет `.sql` под
этим именем) и стала бы новой находкой класса F2. Для `drop-patient-count` удалены ОБЕ хвостовые
записи (idx 50 и 51, см. F2). Итог во всех пяти местах: `meta/_journal.json` — ровно 50 записей,
последняя `0047_the_opening_door_did_not_learn_the_new_alarm_words`; побайтно совпадает с новым
`meta/_journal.frozen.json` этой ветки.

### Повторный прогон

Собран scratch-каталог = актуальная папка этой ветки (50 легаси + переименованный media-worker-файл
+ `meta/_journal.frozen.json`) + переименованные файлы invoice-reissue и drop-patient-count,
скопированные из их веток (содержимое идентично закоммиченному там — тот же `git mv`, не правка).

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/apply-three-migrations --sudo-postgres
… COMMIT
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=3 total=53 reapplied=0 foreign-ledger-rows=6

$ sudo -u postgres psql -d bcb_webapp_dev -Atc \
    "select tag,created_at from drizzle.__drizzle_migrations where tag ilike '20260819%' order by created_at"
20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued|1800000071000
20260819T205420_the_transcode_queue_dispatcher_had_no_door|1800000072000
20260819T210005_a_clinic_is_billed_for_seats_not_for_people|1800000073000

$ # повтор — идемпотентность
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/apply-three-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=53 verified-objects=81 foreign-ledger-rows=6
```

Схема подтверждена живьём: `carried_debt_minor`/`superseded_by_invoice_id`/`release_carried_seat_debt`
снова на месте; `saas_tariffs.quotas ? 'patient_count'` для `d1156dc6-…` снова `false` (миграция
убрала ключ второй раз, как и должна); `verified-objects=81` — `findMissingObjects` подтвердил КАЖДЫЙ
объект применённых миграций живьём в каталоге, не только по леджеру.

Собственная папка ветки (без scratch, только то, что реально закоммичено здесь и в feat):

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 verified-objects=73 foreign-ledger-rows=8
```

### Побочная находка при откате: две загрязнённые ledger-строки (найдены и исправлены)

В процессе первого пробного (`--rollback-only`) прогона на scratch-папке обнаружены две
несогласованные строки леджера, не связанные напрямую с F1/F2/F3, но блокирующие честный повтор —
похоже на конкурентную активность на общем DEV-боксе (в `git worktree list` видно много одновременно
живых веток; сторонний процесс мог тем временем катать что-то своё):

- строка `created_at=1800000070000` оказалась помечена тегом `0050_the_transcode_queue_dispatcher_had_no_door`,
  хотя её реальный hash (`c1392710…`) не совпадает ни с одним известным файлом ни в одной ветке —
  чужая, немаркированная запись, ошибочно подписанная легаси-бэкфиллом старой (не зафиксированной)
  версии журнала;
- строка `created_at=1800000071000` несла тег `20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued`
  и ПРАВИЛЬНЫЙ hash файла, но схема (колонки/функции этой миграции) при этом ОТСУТСТВОВАЛА в базе —
  леджер заявлял применённое, которого не было.

Обе строки возвращены в исходное непротиворечивое состояние (первая — `tag=NULL`, вторая — удалена)
ДО реального (не rollback-only) прогона; после — `verified-objects=81` (см. выше) подтвердил, что
леджер и каталог согласованы. Причина мутации ledger не установлена (заявленный `--rollback-only`-
прогон должен откатывать всё внутри одной транзакции и в изолированных пробах откатывал — см. юнит-
и живые тесты F1); подозрение на параллельную работу другого агента/процесса на этом же DEV,
не подтверждено логами. Указано честно, а не скрыто.

---

## Тесты — сводка

```
$ node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs
# tests 40 · # pass 40 · # fail 0

$ node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
run-webapp-drizzle-migrate diagnostic self-test: OK
```

## `pnpm run lint`

**Эта ветка (`wt/migration-timestamp-20260819`)** — полный прогон, все шаги, включая
`check-drizzle-migration-order.sh`:

```
$ pnpm --dir apps/webapp run lint
… check-drizzle-migration-order: OK …
[exited with code 0]
```

**`feat/doctor-ui-rebuild`, `wt/invoice-reissue-20260819`, `wt/drop-patient-count-20260819`,
`wt/media-worker-root-20260819`.** Честно: у этих четырёх веток КОД гейта имени (`TIMESTAMP_MIGRATION_NAME`,
`findMigrationNameViolations`, `findJournalGrowth`, `meta/_journal.frozen.json`) ещё не приземлён —
он существует только в `wt/migration-timestamp-20260819` и появится там при слиянии. Поэтому их
СОБСТВЕННЫЙ `pnpm run lint` сегодня зелёный тривиально — не потому что имя проверено, а потому что
нечем проверять. Формальный прогон их же `pnpm run lint` добавил бы к отчёту нулевую информацию,
поэтому вместо него — прямая проверка МОДУЛЕМ этой ветки (тем самым, который приземлится) против
РЕАЛЬНОГО содержимого каждой из четырёх папок (временная копия `meta/_journal.frozen.json`, без
коммита, удалена сразу после проверки):

```
invoice-reissue:      files: 52  nameViolations: []  journalGrowth: []
drop-patient-count:   files: 52  nameViolations: []  journalGrowth: []
media-worker-root:    files: 51  nameViolations: []  journalGrowth: []
feat/doctor-ui-rebuild: files: 51  nameViolations: []  journalGrowth: []
```

(Первый прогон этой проверки для `invoice-reissue`/`drop-patient-count` красил на
`0050_the_transcode_queue_dispatcher_had_no_door` — до того, как этот же файл был переименован в
`feat/doctor-ui-rebuild`. После переименования на feat и повторной проверки — чисто.)

---

## Коммиты

| ветка | коммит | содержание |
|---|---|---|
| `feat/doctor-ui-rebuild` | `c6d3835da` | переименование `0050_the_transcode_queue_dispatcher_had_no_door` → таймштамп |
| `feat/doctor-ui-rebuild` | `7bb396e81` | журнал: убрана осиротевшая запись |
| `wt/invoice-reissue-20260819` | `39f1bc086` | переименование + журнал |
| `wt/drop-patient-count-20260819` | `063950f82` | переименование + журнал (обе хвостовые записи) |
| `wt/media-worker-root-20260819` | `362761618` | переименование + журнал |
| `wt/migration-timestamp-20260819` | (этот коммит) | F1/F2 код + тесты + `meta/_journal.frozen.json` + переименование своей копии файла + этот отчёт |

---

## НЕ СДЕЛАНО

- **DEV несёт неучтённый исторический дефект, не в скоупе этой миссии.** DDL миграции
  media-worker-root (три функции) применён к `bcb_webapp_dev` мимо `migrate-local.mjs --drizzle-folder`
  без единой ledger-записи (найдено при F3, см. раздел выше). Гейт `findMissingObjects` не ловит этот
  класс (леджер молчит, объекты есть) — он ловит обратный. Отдельная находка, не заводил.
- **Причина двух загрязнённых ledger-строк** (см. «Побочная находка») установлена не до конца —
  исправлена по факту, но механизм (собственный баг вне видимого кода или конкурентный процесс на
  общем DEV) не подтверждён логами. Если это повторится — сигнал, что DEV сейчас используется
  параллельно несколькими агентами и нужна явная координация (`SERVER LOAD BOARD`).
- **`pnpm run lint` не прогнан заново целиком** в `feat/doctor-ui-rebuild`,
  `wt/invoice-reissue-20260819`, `wt/drop-patient-count-20260819`, `wt/media-worker-root-20260819`
  после переименований — только точечная проверка модулем этой ветки (см. раздел «pnpm run lint»
  выше) и `git status`/тестовый набор в самих этих ветках не запускались повторно. Правка там —
  чистое переименование + удаление осиротевших строк журнала, риск регрессии минимален, но живого
  зелёного лога `pnpm run lint` для них в этом отчёте нет.
- **Слияние `wt/migration-timestamp-20260819` в `feat/doctor-ui-rebuild`** не выполнено — это
  отдельный шаг приземления (владелец: «четыре других ветки её ждут»), сама миссия просила закрыть
  находки и выполнить путь владельца, не сводить ветки в main/feat.
- **TEST не трогался** ни разу (гейт для миграций и без того не даёт им туда попасть под старыми
  именами) — сверка с TEST в F3 была ТОЛЬКО чтением (`SELECT`), ничего не писалось.
