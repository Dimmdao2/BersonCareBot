# Независимый адверсарный аудит — путь полного сброса TEST (2026-08-20)

**Аудитор:** независимый, Opus 4.8, только чтение дерева + git-сверки + read-only postgres. Работу делал
другой агент на другой модели (codex gpt-5.6-terra); его отчёт
[`TEST_RESET_PATH_EXECUTABLE_2026-08-20.md`](TEST_RESET_PATH_EXECUTABLE_2026-08-20.md) принят как заявка, не
доказательство.

**Проверенные коммиты (клон `wt/restore-ab-20260820` поверх feat-базы `230a2494f`):**

- `4862645dc` — remove retired legacy appointment reset step + derive ledger floor
- `8983a8cb8` — drop retired disposable smoke preflight
- `7bd99dcce` — allow retry from restored schema A
- `e6d7808b3` — docs(test-reset): record live blocker (только отчёт)

Клон трогает ровно **два** файла: `deploy/host/deploy-test-saas.sh` и отчёт. Ни миграции, ни ролевые/грант-файлы,
ни `restore-test-db-from-dump.sh` не тронуты (`git diff --name-only 230a2494f..HEAD`).

## Таблица «утверждение · команда · вывод · вердикт»

| # | Утверждение | Команда | Вывод | Вердикт |
| --- | --- | --- | --- | --- |
| 1 | Выведенное владельцем (0123b1133) не вернулось | `ls apps/webapp/scripts/cutover-legacy-appointments.ts`; `git diff --name-only 230a2494f..HEAD` | файла нет; клон меняет только `deploy-test-saas.sh`+отчёт, из скрипта rubitime **удалён**, ничего не добавлено | **PASS** |
| 1a | Остаточные rubitime-ссылки в дереве — не воскрешение клоном | `git grep be_external_entity_mappings / external_system='rubitime'` + `git log -1 -- <файл>` | все живут в файлах, которых клон не касался: миграция `0042` = сам DROP таблицы; `pre-cutover-*/cutover-data/cutover-start.sql` = read из ПРОД-источника; `runtime-settings.sql` перегенерён БАЗОВЫМ `230a2494f`, не клоном | **PASS** (см. вопрос ВЛ-1) |
| 2 | Убрана ВСЯ CSV-обвязка, не только вызов | `grep -niE 'rubitime\|csv\|POSTGRES_RUBITIME_CSV\|cutover:legacy-appointments' deploy/host/*.sh` | 0 совпадений `csv`; удалены `--rubitime-csv[-sha256]`, их валидация, `POSTGRES_RUBITIME_CSV` (объявление/staging/`sudo install`/SHA-проверка), usage-строки, `[ -r $LEGACY_APPOINTMENT_CUTOVER ]`, сам вызов `cutover:legacy-appointments` | **PASS** |
| 2a | Оставшиеся rubitime-строки в скрипте обоснованы | `sed -n '3532,3545p' deploy-test-saas.sh` | это end-state ассерты «ретайрд-отношения ОТСУТСТВУЮТ» (`to_regclass(...) IS NULL`) и «нет `rubitime_projection`» — гейты удаления, не потребители CSV | **PASS** |
| 3 | Счётчик леджера выводится из артефакта, не вписан | `awk '/^INSERT INTO drizzle\.__drizzle_migrations /{c++}END{print c+0}' .../ledgers-and-baseline.sql` = 59; код читает эту же величину в `expected_ledger_rows` | `[ CNT -ge $expected_ledger_rows ]` вместо `-ge 178`; урезал артефакт на 1 строку → derived floor 59→58 (деривация доказана) | **PASS** (см. ниже 3a) |
| 3a | «Молчаливое выпадение» краснеет И называет расхождение | инъекция: CNT=58 при floor 59 → `RED: got 58, target artifact requires at least 59`; пустой артефакт → guard `-gt 0` краснеет | краснеет и называет числа. **Важно:** буквальная инъекция брифа («урежь артефакт → красно») НЕ краснит — floor есть нижняя граница (`-ge`), урезание артефакта её ослабляет; краснит обратное направление (живой леджер < floor). Утверждение о поведении держится, формулировка инъекции неточна | **PASS с уточнением** |
| 3b | Старое 178 было бы ложным для схемы B | `[ 59 -ge 178 ]` | RED — хардкод 178 отверг бы корректную базу B (59 строк); фикс снял ложное срабатывание | **PASS** |
| 4 | ⚠️ Дыра resolvable-теста (находка ведущего) закрыта? | `grep -nE '^\[ -[rx] "\$SRC_REPO/\$[A-Z_]+" \]' deploy-test-saas.sh` (≈30 гардов) vs покрытие теста | тест обходит только `\ir`-корни `PRE_CUTOVER_DATA_ASSERTIONS`+`CUTOVER_MIGRATION` + генерённые дампы + port-context-артефакты; ~25 shell-гардов (`OVERRIDE`, `OWNER_IDENTITY_CONSOLIDATION`, `SAAS_SMOKE_PASSWORD_CONVERGER`, `DATAFIX`, `PRIVILEGE_GENERATOR`, все RLS-файлы…) проверяются ТОЛЬКО в рантайме. Клон убрал сломанный `LEGACY_APPOINTMENT_CUTOVER`-гард, но общую дыру НЕ закрыл | **ОТКРЫТО** (находка, не чинил) |
| 5 | Остановка на B5 честная; TEST в понятном состоянии | `sudo -u postgres psql -d bersoncarebot_test …` (см. «Живое состояние») | только пустой `public` (0 таблиц), нет `drizzle`, нет `system_settings`, owner=postgres, `datacl` пуст, `connlimit=0` (fail-closed), 7.9 MB. Restore упал на первом объекте (`CREATE SCHEMA drizzle` как `app_object_owner`); ни гранта, ни `CREATE ROLE`, ни обхода. Данных нет → обезличивания тривиально нет | **PASS** |
| 6 | Права не расширены; в миграциях нет CREATE ROLE | `git diff 230a2494f..HEAD \| grep -inE 'grant\|revoke\|create role\|bypassrls\|alter role'`; `git diff --name-only … -- 'deploy/postgres/**' 'apps/webapp/db/drizzle-migrations/**'` | 0 добавленных GRANT/REVOKE/CREATE ROLE/ALTER ROLE/BYPASSRLS; миграции не тронуты. `reconcile --check` на пустой TEST-базе не запустить (честное blocked-состояние), но клон и не вносит прав, которые надо сверять | **PASS** (в рамках скоупа) |
| 7 | Границы: ПРОД не тронут, нет DML/обезличивания/greenfield | `git diff 230a2494f..HEAD \| grep -inE '135\.106\.162\.170\|pg_dump\|ssh\|anonym\|greenfield\|A0\|A1\|insert into drizzle\|delete from\|update drizzle'` | пусто; единственные обращения к `__drizzle_migrations` — `awk` по файлу и `SELECT count(*)` (чтение). Единственный контакт с ПРОД на пути — read-only `pg_dump` (не менялся) | **PASS** |
| 8 | Тесты бьют в поведение; `bash -n` чист | `bash -n` ×2; `node --test` (6/6); инъекция: `mv ledgers-and-baseline.sql .bak` → тест красный | `bash -n` OK ×2; 6/6 зелёные; инъекция даёт `not ok … unresolved \ir include: …ledgers-and-baseline.sql`, откат → снова 6/6, `git status` чист | **PASS (частично)** — см. 8a |
| 8a | Покрытие поведения самих правок клона | чтение тестов | арифметика ledger-floor и SMTP-ретрай схемы A живут в shell `deploy-test-saas.sh` и НЕ покрыты ни одним тестом; resolvable-тест проверяет только резолв файлов. Вместе с п.4 гарантия «немое выпадение краснеет завтра» — частичная | **ЧАСТИЧНО** |

## Живое состояние `bersoncarebot_test` (взгляд, read-only)

```
pg_database:  owner=postgres  datconnlimit=0  datacl=(пусто)  size=7927 kB
schemas:      только public
public:       0 таблиц/вью/секвенций
drizzle.__drizzle_migrations:  ERROR relation does not exist  (леджер отсутствует)
public.system_settings:        (пусто) — отсутствует
```

База создана `createdb --owner=postgres --template=template0` и оставлена под `CONNECTION LIMIT 0`
(`restore-test-db-from-dump.sh:24` ставит 0 на входе, `:79` вернул бы `-1` только после успеха — успеха не
было). `RESTORE_ROLE=app_object_owner` не имеет CREATE на базе → `pg_restore` упал на самом первом объекте
`CREATE SCHEMA drizzle`. Никакого гранта/`CREATE ROLE`/повышения роли в обход не выполнено. Состояние —
чистое, fail-closed, понятное; не «полусломанное молча». Леджер сравнивать не с чем: restore не начинал
наполнение (ожидаемо для честной остановки до миграции).

## Вердикт: PASS по скоупу воркера, с ОДНОЙ открытой находкой (п.4) и уточнениями

Три код-коммита корректны, в границах скоупа, ничего выведенного не воскрешают, прав не расширяют, ПРОД не
трогают; остановка на B5 доказанно честная, TEST оставлен в понятном fail-closed состоянии. Воркер честно НЕ
заявлял путь исполнимым.

**НЕ СДЕЛАНО / открыто (находки, чинить не мой скоуп — по брифу):**

- **Находка Ф-1 (п.4, поднял ведущий — ОТКРЫТА):** `prod-to-target-cutover-path-resolvable.test.mjs` не
  проверяет ~25 файлов, которые `deploy-test-saas.sh` требует shell-гардами `[ -r ]/[ -x ]` (`OVERRIDE`,
  `OWNER_IDENTITY_CONSOLIDATION`, `SAAS_SMOKE_PASSWORD_CONVERGER`, `DATAFIX`, `PRIVILEGE_GENERATOR`, все
  RLS-файлы и т.д.). Молчаливое удаление любого из них оставит `node --test` зелёным и упадёт лишь в живом
  прогоне — тот самый класс FAIL-B. Headline-поведение «немое выпадение шага краснеет завтра» покрыто для
  `\ir`/ledger/port-context, но НЕ для плоского списка shell-preflight. **Это находка, не блокер против уже
  сделанного; расширение теста — решение владельца/ведущего.**

**Вопросы владельцу (находка без пункта в его порядке — ВОПРОС, не задача):**

- **ВЛ-1:** `deploy/postgres/generated/prod-to-target/runtime-settings.sql` (перегенерён базовым `230a2494f`,
  не клоном) всё ещё INSERT-ит шесть выведенных 0123b1133 «рычагов» (`booking_slots_read_source` и др.) — это
  снимок ЖИВОГО прод-состояния, не код-воскрешение. Надо ли prod-to-target-снимок тоже чистить от них, или они
  штатно снимаются при миграции прод-дампа? Вне скоупа этого клона.
- **ВЛ-2 (уточнение к п.3):** буквальная инъекция брифа «урежь артефакт → красно» неверна по конструкции —
  floor есть нижняя граница; корректная адверсарная инъекция (живой леджер < floor) краснеет и называет
  расхождение. Поведение верное, формулировку теста инъекции стоит переписать.

Полный `pnpm run ci` не запускал; ПРОД не трогал; все инъекции сняты, `git status` чист.
