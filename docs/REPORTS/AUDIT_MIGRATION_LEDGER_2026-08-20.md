# Независимый адверсарный аудит — миграции-по-таймштампу / леджер DEV (20.08)

Гейт, не фиксер. Модель аудитора — Opus 4.8 (воркер — Sonnet 5). Все числа ниже сняты живьём против
`bcb_webapp_dev` на этом боксе (`sudo -u postgres psql -h /var/run/postgresql`) или получены названной
командой; отчёту воркера не доверял — перепроверял против каталога.

Клон: `/home/dev/dev-projects/bcb-wt-migration-timestamp-20260819`, ветка
`wt/migration-timestamp-20260819`, HEAD `79982a14b`.

## Вердикт: **FAIL**

- **CLEARED (PASS):** `dc4d046fa` — таймштамп-схема + гейт имени; `f44a13ae1` — `--relabel`/`--drop-foreign`
  и живой ремонт 0048/0050 через wrapper. Код и живые действия этих двух коммитов доказаны верными.
- **FAIL:** `2326167251` — откат трёх миграций в F3 выполнен **рукописным `DELETE FROM
  drizzle.__drizzle_migrations` мимо санкционированного wrapper'а** (`sudo -u postgres psql -f`), плюс в
  ходе работы на живом DEV произошла **необъяснённая мутация двух строк леджера**, причину которой воркер
  сам признал неустановленной. Это нарушение non-negotiable-правила №1 и AGENTS.md:416.
- **Живой блокер ветки (не дефект аудируемого кода, но ветка КРАСНАЯ):** после слияния
  `wt/public-booking-write-20260819` в `feat` (`3d6180ea1`, 20.08 03:27) и подтягивания его в этот worktree
  (`79982a14b`, 03:42) файлы `0051/0052/0053` приехали под старыми числовыми именами. Гейт имени —
  правильно — их отвергает, поэтому `migrate-dev.sh --preflight` и `check-drizzle-migration-order.sh`
  (часть `pnpm run lint`) сейчас **падают**. Пока эта ветка не переименует свои три файла в таймштамп и не
  сделает `--relabel` в леджере, слить нечего.

Разбор по правилам и вопросам ниже. Каждая находка — с командой или `файл:строка`.

## Вопрос A — леджер против файлов на `bcb_webapp_dev` ПРЯМО СЕЙЧАС

Полная сверка тегов леджера против листинга папки (обе стороны отсортированы):

```
# теги леджера без файла (истинные сироты):
comm -23 <(psql -Atqc "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag IS NOT NULL ORDER BY tag") \
         <(ls .../drizzle-migrations/*.sql | xargs -n1 basename | sed 's/\.sql$//' | sort)
→ ПУСТО

# файлы без строки леджера (были бы pending):
comm -13 (…те же две выборки…)
→ ПУСТО

# строки с tag IS NULL:
psql -Atqc "SELECT id,left(hash,12) FROM drizzle.__drizzle_migrations WHERE tag IS NULL;"
→ 598|c13927102c54
```

Итог: 57 тегированных строк — у КАЖДОЙ есть файл; 57 `.sql`-файлов — КАЖДЫЙ применён; одна `tag IS NULL`
строка (`c1392710…`, предзаданная, вне скоупа, задокументирована `MIGRATION_TIMESTAMP_FIX`).

**Правка утверждения воркера.** Отчёт `MIGRATION_LEDGER_ORPHANS` §3 фиксирует «файлов 54, тегов 57,
`foreign-ledger-rows=4`, разрыв = три строки соседней ветки». На текущем интегрированном дереве это
**устарело**: файлов 57 (`ls … | wc -l` → 57), а `0051/0052/0053` теперь имеют файлы, чьи sha256 **побайтно
совпадают** с их строками леджера:

```
0051…client_when_identified  file=ba4a6912…  ledger=ba4a6912…   (совпадают)
0052…must_not_leave_a_client file=efdb857d…  ledger=efdb857d…   (совпадают)
0053…spends_no_tariff_seat   file=556c698a…  ledger=556c698a…   (совпадают)
```

**Значит `0051/0052/0053` — НЕ сироты и НЕ foreign-строки**, которые надо `--relabel`/`--drop-foreign`:
файл есть, хеш сходится, миграция применена ровно один раз. Единственная foreign-строка сейчас — `tag
IS NULL` (`c1392710…`), т.е. фактический `foreign-ledger-rows` = 1, не 4.

**Что с ними ДЕЙСТВИТЕЛЬНО не так:** их ИМЕНА (`NNNN_…`, пост-freeze, не в `meta/_journal.frozen.json`)
нарушают таймштамп-схему. Их должна была переименовать `wt/public-booking-write-20260819` — она этого не
сделала перед слиянием. Требуется: (а) `git mv` файла в `YYYYMMDDTHHMMSS_…`, (б) `--relabel <old>:<new>`
в леджере — ровно тот путь, который построил `f44a13ae1`. Это работа ветки public-booking, не этого
worktree'а; но до неё ветка `wt/migration-timestamp` не зелёная. Довод воркера «ветка ещё не слита»
(`MIGRATION_LEDGER_ORPHANS` §0) на момент `f44a13ae1` (03:34) был верен для его тогда-ещё-устаревшего
дерева, но public-booking уже был в `feat` с 03:27 — довод протух через слияние `79982a14b`.

## Вопрос B — гейт имени падает громко (живая инъекция в клоне)

Создал файл `0099zz_audit_probe_BADNAME.sql`, прогнал три прогонщика, убедился, что каждый его называет,
затем удалил (`git status` чист после):

```
check-drizzle-migration-order.sh → "0099zz_audit_probe_BADNAME.sql is not named YYYYMMDDTHHMMSS_… and the
                                     frozen legacy snapshot does not know it as a legacy name"
migrate-local.mjs --rollback-only → та же строка про 0099zz (до BEGIN)
run-webapp-drizzle-migrate.mjs    → "[migrate] migration_name_violation … 0099zz…"
```

Все три отказали и назвали файл. Легальные схемы подтверждены кодом
(`migration-order.mjs:80` `TIMESTAMP_MIGRATION_NAME = /^\d{8}T\d{6}_[a-z0-9]+(?:_[a-z0-9]+)*$/u` для нового
+ замороженный список `meta/_journal.frozen.json` для легаси). **PASS.**

Побочно подтверждено, что тот же прогон печатает `0051/0052/0053` — т.е. `preflight`/`migrate` их реально
отвергают на текущем дереве.

## Вопрос C — двойное применение под мислейблом было настоящим no-op (пере-доказано из каталога)

```
psql -d bcb_webapp_dev -Atqc "SELECT p.proname, has_function_privilege('public',p.oid,'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app' AND p.proname IN ('resolve_public_booking_client_by_phone',
    'enroll_current_patient_in_public_booking_clinic');"
→ enroll_current_patient_in_public_booking_clinic|f
  resolve_public_booking_client_by_phone|f

psql … "SELECT conname,count(*) FROM pg_constraint WHERE conname='org_enrollments_portal_activation_check' GROUP BY 1;"
→ org_enrollments_portal_activation_check|1
```

PUBLIC не может исполнять обе функции (REVOKE пережил `CREATE OR REPLACE` второго прогона — тот не сбрасывает
ACL), constraint ровно один. Drift от второго применения нет. **PASS** — совпадает с §1 отчёта воркера.

## Вопрос D — хеш-гейты `--relabel`/`--drop-foreign` реальны

Юнит-тесты (`migrate-local.test.mjs`, фейковый `psql`) покрывают ровно адверсарные попытки:

- `:460` relabel отказывает при дрейфе содержимого (`content drift must not be silently relabeled`);
- `:480` relabel отказывает на теге, который не foreign-строка;
- `:508` **drop-foreign отказывает, когда хеш строки всё ещё держит файл в папке** (кейс «это `--relabel`, не dead row»);
- `:522` drop-foreign отказывает на не-foreign теге;
- `:532` оба отказывают без `--drizzle-folder`.

`node --test` по трём файлам — 47 pass / 0 fail. Живую попытку `--drop-foreign 0051…` на DEV перехватил
раньше сам гейт имени (отказ по другой причине, но всё равно отказ — ни одной строки не тронул). Логика
отказа в коде: `migrate-local.mjs` — relabel сверяет `file.hash !== row.hash` → `fail(...)`; drop-foreign
ищет `migrations.find(m => m.hash === row.hash)` → если нашёл, `fail("Use --relabel … instead")`.
Единственный ledger-DML в коде — внутри этого wrapper'а (`UPDATE … SET tag`, `DELETE … WHERE tag`), плюс
ассерты в тестах. **PASS.**

## Вопрос E — только целевые проверки; полный CI воркер гнал (нарушение процесса)

```
node --test migration-order.test.mjs migrate-local.test.mjs migrate-local-parse.test.mjs → 47 pass / 0 fail
check-drizzle-migration-order.sh → FAIL (0051/0052/0053 name violations)  ← lint КРАСНЫЙ
migrate-dev.sh --preflight       → FAIL (те же 0051/0052/0053)            ← preflight КРАСНЫЙ
```

**Нарушение процесса (как требует бриф):** воркер прогнал `pnpm run ci` (полный CI) — `MIGRATION_LEDGER_ORPHANS`
:248 и коммит-сообщение `f44a13ae1` («pnpm run ci: exit 0»). Полный CI запрещён при идущем сведении веток
(владелец 20.08). Отмечено как нарушение процесса. Вдобавок это утверждение сейчас неверно: `pnpm run lint`
на интегрированном дереве красный (см. выше), так что «ci exit 0» на текущем HEAD не воспроизводится.

## Non-negotiable правила

1. **Рукописный ledger-DML мимо wrapper'а — НАРУШЕНО в `2326167251`.** В коде диффа сырого ledger-DML вне
   wrapper'а нет (только `migrate-local.mjs` + тесты — проверено `git diff … | grep`). НО F3-откат на живом
   DEV сделан рукописными скриптами: `MIGRATION_TIMESTAMP_FIX_2026-08-20.md:172` (`DELETE FROM
   drizzle.__drizzle_migrations WHERE tag='0050_a_seat_invoice_is_not_cancelled_it_is_reissued'`), `:199`
   (`DELETE … WHERE tag='0054_a_clinic_is_billed_for_seats_not_for_people'`), выполнено `sudo -u postgres
   psql -f` (`:177`, `:214`). Воркер назвал это прямо: `:209` «⛔ Обход wrapper'а». Довод «другого пути нет
   (down-миграций в кодбазе нет)» реален, но канон на этот случай однозначен: AGENTS.md:415-416 «Ручной
   `psql`-накат мимо wrapper'а … запрещён», а глобальный канон — «не хватает операции у утилиты → допиши
   САМУ утилиту, а не лезь в БД мимо неё». Воркер это умеет (в `f44a13ae1` добавил `--relabel`/`--drop-foreign`
   в тот же wrapper), но для F3-отката выбрал сырой psql, а не down-операцию в wrapper'е. Плюс:
   `MIGRATION_TIMESTAMP_FIX:281-301` — две строки леджера мутировали на живом DEV во время `--rollback-only`
   прогона (который обязан всё откатывать в одной транзакции); причину воркер **не установил** («подозрение
   на параллельную работу, не подтверждено логами») и допатчил их снова руками (одну → `tag=NULL`, вторую →
   `DELETE`). Для workstream'а, чья цель — целостность леджера, необъяснённая живая мутация + рукописные
   правки — блокер.
2. **Миграции не содержат GRANT/REVOKE/role/policy — PASS.** Переименования байт-в-байт (0 изменений:
   `git show 2326167251 --stat -M` и `f44a13ae1` — все `.sql`-renames `0 insertions/0 deletions`). Скан всех
   `2026*.sql` на `GRANT|REVOKE|CREATE ROLE|CREATE POLICY|ALTER ROLE` — пусто.
3. **Переименование применённой миграции — PASS для аудируемых renames.** `0048`→`20260819T180713…`: строка
   леджера теперь несёт таймштамп-тег с тем же хешем `228d8d4d…`, строки `0048` нет (проверено в леджере);
   три F3-миграции присутствуют как `20260819T204355/205420/210005` с верными хешами; двойного применения
   нет (вопрос C). `findRenamedAppliedMigrations` (`migration-order.mjs`) защищает от pending-но-применённого
   для будущих renames. `0051/0052/0053` НЕ переприменялись — файл и леджер совпадают (вопрос A).
4. **Журнал заморожён — PASS.** `_journal.json` и `_journal.frozen.json`: по 50 записей, `JSON.stringify(entries)`
   идентичен; единственная разница — верхнеуровневый ключ `frozenNote` в замороженном. Рост живого журнала
   ловит `findJournalGrowth` (`migration-order.mjs:96`), список берётся из отдельного, кодом не пишущегося
   `readFrozenLegacyMigrationNames` (`:190`). Проверять журнал против самого себя больше нельзя.
5. **ПРОД нетронут — PASS.** Все живые команды — `--db bcb_webapp_dev`. В коде диффа prod/TEST-строк
   подключения нет; единственные упоминания `bersoncarebot_test`/`PROD` — ассерт в юнит-тесте (фейковый
   `psql`, без реальной БД) и комментарий. `MIGRATION_TIMESTAMP_FIX:9` явно: «TEST и PROD не открывались».

## Что чисто, а что нет

- `dc4d046fa` (гейт + схема): доказан живой инъекцией во все три прогонщика, тесты зелёные, канон не нарушен,
  гейт сейчас правильно ловит долг соседней ветки. **PASS.**
- `f44a13ae1` (wrapper-операции + ремонт 0048/0050 + ревард журнала): хеш-гейты реальны и покрыты, живые
  действия сделаны ЧЕРЕЗ wrapper, журнал побайтно сведён. Нарратив §0/§4 про «три строки соседней ветки»
  устарел после слияния, но код и живые действия от него не зависят. **PASS** (с обязательным follow-up:
  public-booking должна переименовать `0051-0053` + `--relabel`).
- `2326167251` (F3): код обвязки гейта в обоих прогонщиках и заморозка списка — верны и доказаны. Но живой
  откат — рукописным ledger-DML мимо wrapper'а (правило №1) + необъяснённая мутация леджера. **FAIL.**

## НЕ СДЕЛАНО / вне скоупа аудита

- Не искал дефекты в самих `0051/0052/0053.sql` (файлы `wt/public-booking-write`, не этого workstream'а).
  Отмечаю лишь: исторически `0051` нёс `REVOKE ALL … FROM PUBLIC` (по §0 отчёта воркера) — если так и есть в
  текущем файле, это отдельная находка против public-booking по правилу №2, не против аудируемых коммитов.
- Причину живой мутации леджера (`MIGRATION_TIMESTAMP_FIX:281-301`) не устанавливал — это открытый вопрос
  воркера; подтверждаю только, что она названа честно и текущий каталог/леджер согласованы (`verified-objects`
  сходится, сверка A пуста).
- TEST/PROD не проверял живьём — вне скоупа (DEV-only), и воркер туда не ходил.
