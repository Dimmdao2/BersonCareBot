# Аудит: «миграции называются таймштампом, а не выбранным руками номером»

Ветка `wt/migration-timestamp-20260819` @ `dc4d046fa`. Роль — аудитор, не исполнитель; ничего в диффе не
правил. Все прогоны — против `bcb_webapp_dev` (единственная разрешённая база) и одноразовых scratch-копий
папки миграций в `/tmp`; каждый прогон против реальной DEV — либо `--rollback-only`, либо явно откачен
вручную сразу после проверки (см. команды ниже). PROD не открывал.

## Вердикт: **FAIL**

Код и тесты этой ветки — рабочие и делают то, что заявлено, для случая ОДНОЙ ветки. Но три конкретных
заявления отчёта/канона неверны при проверке ПРОГОНОМ, а не чтением:

1. «Приземлить миграцию по старой схеме невозможно» — неверно для обоих прогонщиков; верно только для
   `pnpm run lint`.
2. «Список легаси-имён закрыт, вырасти не может» — уже вырос (доказано на реальной соседней ветке), и
   `pnpm run lint` этого не ловит.
3. Порядок приземления трёх веток, уже применивших миграции к DEV под старыми именами, **упирается в
   тупик**: предписанный владельцем путь («просто переименуешь») блокируется собственным же
   предохранителем этой ветки. Работающий путь есть только один, и он противоречит пункту 2.

---

## 1. Столкновение стало невозможным, а не менее вероятным

**Проверено прогоном.** Два скретч-репозитория, оба добавили `mig/20260820T120000_same_instant.sql` с
РАЗНЫМ содержимым (та же секунда UTC, тот же слаг — наихудший случай):

```
$ git merge branch-b
Auto-merging mig/20260820T120000_same_instant.sql
CONFLICT (add/add): Merge conflict in mig/20260820T120000_same_instant.sql
Automatic merge failed; fix conflicts and then commit the result.
EXIT=1
```

Слияние падает громко, до земли ничего не доезжает — воспроизведено независимо от отчёта исполнителя
(не поверил на слово, прогнал сам).

**Случай, где столкновение всё же реально:** два агента должны (а) сгенерировать имя в ОДНУ и ту же
секунду UTC И (б) независимо выбрать побуквенно одинаковый слаг. (а) — редко, но не нулевая вероятность
при параллельных автономных агентах, стартующих по одному триггеру. (б) — крайне маловероятно (слаг —
свободный текст). Итог: коллизия **не исключена математически, но исключена силой git** — она не может
пройти слияние молча (раньше `0050` x2 у РАЗНЫХ слагов проходило молча, потому что имена файлов были
разные — конфликта не было; см. §5, где именно это и произошло 19.08). Заявление отчёта «агент не может
столкнуться сам с собой в ту же секунду» — верно буквально, но не главное: главное — что случайное
совпадение теперь ловится git'ом, а не оставляет два живых файла с одинаковым префиксом-номером.

## 2. Порядок применения — сортировка строкой

**Проверено на реальной папке + синтетических кейсах, не по regex:**

```
$ readdirSync(...).sort()  # 50 реальных файлов + три синтетических: 20260820T235959, 20990101T000000, 21001231T235959
last legacy-like index: 49 0049_a_clinic_had_a_booking_form_but_no_face
first timestamp index: 50 20260820T235959_z_last_of_today
legacy-before-all-timestamps holds: true
```

Держится и на 2099, и на 2100, и дальше: пока имя начинается с цифры `1`–`9`, оно лексикографически идёт
после `0NNN`. Ломается это не «в 2100-м», а при смене ФОРМАТА — и это уже произошло, живьём, на соседней
ветке:

```
$ cp .../20260820T235959_z_last_of_today.sql .../0054_a_clinic_is_billed_for_seats_not_for_people.sql
$ readdirSync(...).sort()  # хвост
[
  '0049_a_clinic_had_a_booking_form_but_no_face',
  '0054_a_clinic_is_billed_for_seats_not_for_people',   # ← новый файл 20.08.2026, но выглядит как легаси
  '20260820T235959_z_last_of_today',                     # ← создан РАНЬШЕ в тот же день
  ...
]
```

`wt/drop-patient-count-20260819` (see §5) переименовала свою миграцию из `0050_…` в `0054_…` — то есть
СОЗДАЛА новый `NNNN`-выглядящий файл 20.08.2026, а не таймштамп. Он физически всегда отсортируется перед
ЛЮБЫМ таймштамп-именем, включая созданные позже в тот же день или раньше — гарантия «хронология = порядок
сортировки» для будущих миграций уже нарушена этой веткой. Формат сломался не из-за календаря, а из-за
того, что «легаси»-форма имени не запрещена физически, только текстом правила (см. §3, п. а).

## 3. Гейт: что краснеет, а что нет

### (а) Новый файл со старым числовым именем — **FAIL, находка**

```
$ node .../migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/audit-mig/mig --sudo-postgres --rollback-only
BEGIN … ALTER TABLE … INSERT 0 1 … ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=51 …
EXIT=0
```

Файл `0051_audit_old_numbered_new_file.sql` (не входит в закрытый список из 50 легаси-имён) прошёл через
`migrate-local.mjs` как обычная pending-работа — ни слова про имя, ни отказа. Он реально дошёл до `BEGIN`
и `INSERT` в леджер (откачен намеренно флагом `--rollback-only`; без флага закоммитился бы).

`run-webapp-drizzle-migrate.mjs` не проверял живьём (у него нет `--rollback-only`, а закоммиченный
пробный файл в DEV — риск, которого не было смысла брать), но это и не нужно: код читается однозначно —

```
$ grep -rn "findMigrationNameViolations" --include="*.mjs" .
apps/webapp/scripts/check-drizzle-migration-order.sh:28:  await import(...)
apps/webapp/scripts/check-drizzle-migration-order.sh:34:  findMigrationNameViolations(...)
deploy/postgres/privileges/migration-order.mjs:78:export function findMigrationNameViolations(...)
deploy/postgres/privileges/migration-order.test.mjs: (тесты)
```

`findMigrationNameViolations` вызывается ровно из ОДНОГО места — `check-drizzle-migration-order.sh`
(часть `pnpm run lint`). Ни `migrate-local.mjs`, ни `run-webapp-drizzle-migrate.mjs` его не импортируют
(проверено `grep` по обоим файлам — списки импортов из `migration-order.mjs` не содержат
`findMigrationNameViolations`, см. вывод выше). Значит **оба прогонщика примут файл со старым числовым
именем как обычную pending-миграцию**, если их запустить в обход `pnpm run lint` — а в реальном рабочем
цикле агент вполне может прогнать `migrate-local.mjs` на DEV раньше, чем `pnpm run lint` (или вообще не
прогнать lint на scratch-копии папки, как делал сам исполнитель этой ветки в своих же пробах).

Формулировка в `AGENTS.md` («приземлить миграцию по старой схеме невозможно») и в отчёте — **неверна
буквально**: невозможно только пройти `pnpm run lint`, но не невозможно применить к базе.

### (б) Переименование уже применённой (известной) миграции — **PASS, подтверждено live**

```
$ mv 0000_b0_baseline.sql 20260820T130000_b0_baseline_renamed.sql   # содержимое не тронуто
$ node .../migrate-local.mjs --db bcb_webapp_dev ... --rollback-only
20260820T130000_b0_baseline_renamed.sql is byte-identical to a migration bcb_webapp_dev already applied
under a name this checkout does not carry (ledger created_at=1800000000000); renaming an applied
migration is forbidden. …
EXIT=1
```

Независимо перепроверено (не поверил отчёту) — отказ до `BEGIN`, честный.

### (в) Файл, побайтно равный «чужой» ledger-строке — **PASS, подтверждено live новым кейсом**

Взял НЕ синтетику из отчёта, а реальную миграцию соседней невлитой ветки `wt/invoice-reissue-20260819`
(`0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql`, её хеш уже сидит в DEV-леджере как «чужая»
строка), положил под новым таймштамп-именем:

```
$ sha256sum invoice-reissue/.../0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql
7f78a9b9... (совпадает с hash в drizzle.__drizzle_migrations, tag=0050_a_seat_invoice_is_not_cancelled_it_is_reissued)

$ node .../migrate-local.mjs --db bcb_webapp_dev ... --drizzle-folder /tmp/audit-mig2/mig --rollback-only
20260820T120000_a_seat_invoice_is_not_cancelled_it_is_reissued.sql is byte-identical to a migration
bcb_webapp_dev already applied under a name this checkout does not carry (ledger created_at=1800000071000);
renaming an applied migration is forbidden. …
EXIT=1
```

Отказ работает и для генуинно чужого (кросс-ветвенного) содержимого, не только для собственного
переименования — это важно, см. §5, где это же самое поведение превращается в тупик.

### `pnpm run lint` — **PASS**, но проверяет только имя, не рост журнала (находка, см. §5)

```
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh   # реальный скрипт, немодифицированный репо
check-drizzle-migration-order: OK
$ pnpm --dir apps/webapp run lint    # полный lint, фоново, дождался
... (все 12 шагов) ... exit 0
```

Инлайн-снятая та же нода-логика на scratch-копии с файлом `0051_…` красит:

```
violations: [ '0051_audit_old_numbered_new_file' ]
```

Так что для (а) верно: **красно в lint, зелено в обоих прогонщиках** — ровно наоборот тому, что требовало
задание («каждый случай должен краснеть в ОБОИХ прогонщиках и в lint»).

## 4. Живой прогон на DEV — новая миграция по новому правилу

```
$ date -u +%Y%m%dT%H%M%S
20260819T212253
$ node .../migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder /tmp/audit-live/mig --sudo-postgres      # БЕЗ --rollback-only, реальный коммит
BEGIN … ALTER TABLE … INSERT 0 1 … COMMIT
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=1 total=51 … EXIT=0

$ psql -Atc "select tag,created_at from drizzle.__drizzle_migrations where tag='20260819T212253_audit_live_probe_new_naming_rule'"
20260819T212253_audit_live_probe_new_naming_rule|1800000073000

$ node .../migrate-local.mjs ... (повтор, тот же drizzle-folder)
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 …
```

Применилась, тег в леджере, повтор отвечает «нечего применять» — работает как заявлено. Откатил вручную
(колонка-проба была на `clinic_public_directory_entries`, безопасный ADD COLUMN):

```
$ psql: ALTER TABLE ... DROP COLUMN IF EXISTS audit_live_probe_column;
        DELETE FROM drizzle.__drizzle_migrations WHERE tag='20260819T212253_audit_live_probe_new_naming_rule';
$ psql -Atc "select count(*), count(tag) from drizzle.__drizzle_migrations"
58|53   # байт-в-байт то же, что ДО всего аудита
$ node .../migrate-local.mjs --db bcb_webapp_dev ... --drizzle-folder $PWD/apps/webapp/db/drizzle-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=50 verified-objects=70 foreign-ledger-rows=8
```

DEV возвращён в точности к базовой линии.

## 5. ГЛАВНОЕ — порядок приземления (замер, не мнение)

Три ветки, названные в задании, действительно существуют как отдельные worktree и действительно уже
применили миграции к `bcb_webapp_dev` под старыми числовыми именами:

```
$ git worktree list | grep -E "media-worker-root|invoice-reissue|drop-patient-count"
.../bcb-wt-media-worker-root-20260819    [wt/media-worker-root-20260819]
.../bcb-wt-invoice-reissue-20260819      [wt/invoice-reissue-20260819]
.../bcb-wt-drop-patient-count-20260819   [wt/drop-patient-count-20260819]
```

Ledger DEV прямо сейчас (замер, не из отчёта):

```
0050_a_clinic_is_billed_for_seats_not_for_people    | 1800000052000   ← старое имя drop-patient-count
(5 строк с tag=NULL)                                                  ← чужие, без тега
0050_a_seat_invoice_is_not_cancelled_it_is_reissued | 1800000071000   ← invoice-reissue
0054_a_clinic_is_billed_for_seats_not_for_people    | 1800000072000   ← drop-patient-count, ПОСЛЕ переименования
```

(`0050_the_transcode_queue_dispatcher_had_no_door`, миграция media-worker-root, в этом снимке DEV не
найдена по тегу — либо ещё не приезжала на эту конкретную базу, либо легла одной из 5 безтеговых строк;
не влияет на вывод ниже, механизм действует одинаково на любую строку с известным hash'ем.)

### Находка: `wt/drop-patient-count-20260819` уже нарушила «журнал заморожен навсегда»

```
$ cd bcb-wt-drop-patient-count-20260819 && git diff feat/doctor-ui-rebuild...HEAD -- .../meta/_journal.json
+    {
+      "idx": 50, "when": 1800000090000,
+      "tag": "0054_a_clinic_is_billed_for_seats_not_for_people",
+      "breakpoints": true
+    }
```

Это НОВАЯ, 51-я запись в файле, который эта же ветка (`wt/migration-timestamp-20260819`) в отчёте и в
`AGENTS.md` называет «закрытым списком, который не может вырасти». Он уже вырос — на соседней ветке,
в тот же день. И это проходит `pnpm run lint` НЕЗАМЕЧЕННЫМ:

```
$ cd bcb-wt-drop-patient-count-20260819
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
check-drizzle-migration-order: OK
```

`check-drizzle-migration-order.sh` проверяет ВНУТРИ журнала (нет дублей tag/when, каждый tag существует
файлом) — но НЕ проверяет, что журнал не вырос сверх исходных 50 записей. Рост списка легаси-имён —
ровно тот способ, которым старая схема с ручными номерами и обходила лимиты, — гейту физически нечем его
поймать.

### Проверка тупика: работает ли предписанный владельцем путь («просто переименуешь»)?

Владелец 19.08: «если надо ты просто переименуешь в нужной последовательности когда будешь сводить».
Смоделировал это буквально: взял реальный файл `wt/invoice-reissue-20260819`
(`0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql`), переименовал в таймштамп-имя (что и требует
новое правило от любой ветки, желающей пройти lint), содержимое не менял:

```
$ node .../migrate-local.mjs --db bcb_webapp_dev ... --drizzle-folder /tmp/audit-mig2/mig --rollback-only
20260820T120000_a_seat_invoice_is_not_cancelled_it_is_reissued.sql is byte-identical to a migration
bcb_webapp_dev already applied under a name this checkout does not carry (ledger created_at=1800000071000);
renaming an applied migration is forbidden. Restore the original file name, or if this is genuinely new
work, change its SQL.
EXIT=1
```

**Предписанный владельцем путь физически заблокирован собственным же предохранителем этой ветки**,
как только миграция УЖЕ применена к целевой базе под старым именем — а все три перечисленные ветки именно
в этом состоянии прямо сейчас. `findRenamedAppliedMigrations` не различает «злонамеренная маскировка
старой миграции» и «легитимное переименование по новому правилу при сведении» — по построению не может:
единственный сигнал у него — совпадение хеша с чужой ledger-строкой, а оба сценария дают одно и то же
совпадение.

Проверил и обратный путь — оставить старое имя как есть (не переименовывать):

```
$ node .../migrate-local.mjs --db bcb_webapp_dev ... --drizzle-folder /tmp/audit-mig3/mig --rollback-only
   # /tmp/audit-mig3/mig = 50 легаси + 0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql (имя не менял)
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 … EXIT=0
   # НИКАКОГО отказа — тег уже в леджере, это не rename, а «уже применено»

$ findMigrationNameViolations(readMigrationFolder(...), journal.entries)  # журнал этой ветки, 50 записей
violations: [ '0050_a_seat_invoice_is_not_cancelled_it_is_reissued' ]   # но ЛИНТ красит
```

Итог: **оставить старое имя работает в обоих прогонщиках и красит только lint**; переименовать — работает
в lint и падает в обоих прогонщиках. Единственный способ пройти И то, И другое — добавить запись в
`meta/_journal.json` (сделать имя «легаси» задним числом), то есть буквально то, что уже сделала
`wt/drop-patient-count-20260819`. Это единственный путь, который РАБОТАЕТ технически, — и он прямо
противоречит формулировке «журнал заморожен навсегда, вырасти не может» из этой же ветки.

### `renderLedgerBootstrapSql` — не тот инструмент

Функция размечает только строки с `tag IS NULL` по `created_at` из исторической карты; она не умеет
переставить `tag` у УЖЕ помеченной «чужой» строки на новое имя. Штатного пути «переразметить» ledger-тег
задним числом НЕТ — только ручной `UPDATE drizzle.__drizzle_migrations SET tag=...`, который сам канон
называет запрещённым обходом wrapper'а (хотя формально это не накат DDL, а правка метаданных, граница
в каноне не проведена).

### Ответ на вопрос владельца: порядок приземления не имеет значения — тупик одинаков в обоих направлениях

- **Эта ветка первой:** каждая из трёх веток при сведении получает `check-drizzle-migration-order.sh`
  FAIL на своём `0050`/`0054` (не таймштамп, не в замороженном списке) и упирается в ту же вилку:
  переименовать → красный ранер; оставить имя → нужно расширить журнал.
- **Эта ветка последней:** `main` уже несёт три файла со старыми именами — при сведении ИМЕННО ЭТОЙ ветки
  `pnpm run lint` падает сразу на них (те же три тега), и решать вилку приходится тому, кто сводит эту
  ветку, а не авторам трёх остальных.

В обоих направлениях: рабочего пути, не противоречащего собственному тексту канона, не существует.
Единственный технически работающий путь — расширение «замороженного» журнала для каждой из трёх миграций
(как уже сделал `drop-patient-count`) — то есть отказ от буквы правила ради его духа. Это решение
владельца, не моё: либо канон меняет формулировку («список легаси закрыт для НОВЫХ post-cutover
миграций, но открыт для миграций, уже применённых до cutover под старым именем»), либо
`findRenamedAppliedMigrations` получает исключение для переименований, согласованных при сведении, либо
три ветки переигрывают свои миграции с нуля под новым содержимым (дорого, но чисто). **Это блокер, а не
работа этой ветки** — сама её область была «имена», а не «сведение трёх веток».

## Что подтвердилось без оговорок

- Тесты: `node --test .../migration-order.test.mjs .../migrate-local.test.mjs .../migrate-local-parse.test.mjs`
  → `# tests 34 · # pass 34 · # fail 0` (прогнал сам).
- `node .../run-webapp-drizzle-migrate.mjs --self-test` → OK (прогнал сам).
- `pnpm --dir apps/webapp run lint` (полный, все 12 шагов) → exit 0 на немодифицированной ветке (прогнал
  сам, фоново, дождался).
- Сортировка `'0' < '2'…'9'` держит порядок «легаси раньше таймштампа» произвольно далеко в будущее, пока
  никто не создаёт новых `NNNN`-имён (см. находку §2/§5 — именно это уже нарушено).
- Уникальный индекс на `tag` и git `add/add`-конфликт при буквальном совпадении имени — оба независимо
  переподтверждены живьём (не только процитированы из отчёта).
- DEV после аудита побайтно в исходном состоянии: `58|53` строк леджера, `pending=0 total=50
  verified-objects=70 foreign-ledger-rows=8` — идентично снимку «до».

## НЕ ПРОВЕРЕНО

- `run-webapp-drizzle-migrate.mjs` (`pnpm run migrate`) не прогонялся живьём для кейса (а) (нет
  `--rollback-only`, реальный коммит без отката — счёл риск неоправданным при уже однозначном коде:
  функция просто не импортирована). Вывод сделан по чтению кода, не по прогону этого конкретного файла.
- Не проверял `check-migration-privileges.mjs` (он в цепочке `pnpm run lint`, посчитал «51 migration
  files» — на 1 больше, чем 50 в `db/drizzle-migrations`; не выяснял источник разницы, не в скоупе
  задания).
- Не проверял `test.bersoncare.ru` (старый бокс 151.x) и `deploy-test.sh` — только локальный DEV.
- Не пробовал реально свести все три ветки (`media-worker-root`, `invoice-reissue`, `drop-patient-count`)
  в одну — только их состояние по отдельности и попарные пробы против общего DEV-леджера.
- Находки A/D предыдущего аудита и обходы №1/№2 (`db:migrate:drizzle`, `db:seed-drizzle-meta`) — не
  проверял, вне скоупа этой миссии (как и у исполнителя).
- Не выяснял, могла ли `wt/media-worker-root-20260819` вообще не долетать до DEV под тегом (её тег не
  найден в текущем леджере) — не в скоупе вопроса про имена/порядок.
