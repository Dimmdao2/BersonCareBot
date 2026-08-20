# Независимый адверсарный аудит: контракт владения TEST + сброс, 2026-08-20

**Аудитор:** Opus 4.8 (независимый). **Подсудимый:** codex gpt-5.6-sol. Самопроверки нет.
**Проверенные коммиты (sha):**

- HEAD ветки `wt/ownership-20260820` = `d358062b903ca58358f6afaad447d94f71a75912`
  (`d358062b9` docs, `cb14039b7` merge feat, `4a352a6a8` fix — единственный функциональный)
- база `feat/doctor-ui-rebuild` = `a9d11d63034ce778485bf8251423b948c0fcdb56`
- диапазон аудита: `git diff feat/doctor-ui-rebuild..HEAD` = 3 файла
  (`deploy/host/deploy-test-saas.sh`, `deploy/host/restore-test-db-from-dump.sh`,
  `docs/REPORTS/TEST_RESET_OWNERSHIP_2026-08-20.md`)

Выбранный контракт владения: **владелец базы `bersoncarebot_test` = `postgres`**; восстановление
`--no-owner` под `postgres`; передача владения объектами на `app_object_owner` + точные seam-владельцы
делается ПОЗЖЕ декларативным privilege-checkpoint'ом (до которого прогон не дошёл, встав fail-closed
на гейте ФИО).

## Таблица: утверждение | команда | вывод | вердикт

| # | Утверждение | Команда | Вывод | Вердикт |
|---|---|---|---|---|
| 1 | Право НЕ выдано вместо решения (нет GRANT/REVOKE/CREATE·ALTER ROLE/BYPASSRLS/GRANT CREATE ON DATABASE) | `git diff feat..HEAD \| grep '^+' \| grep -iE 'GRANT\|REVOKE\|CREATE ROLE\|ALTER ROLE\|BYPASSRLS'` | 9 совпадений — ВСЕ комментарии, текст отчёта, read-only `SELECT rolbypassrls`/`rolname` (проверки), либо `rg`-команда в отчёте. Ни одного исполняемого DDL. Ветка НАОБОРОТ удалила всю BYPASSRLS/membership-машинерию (`run_..._bypass`, `grant_migrator_owner_membership`, `revoke_bypass`) | **PASS** |
| 1b | Ролевого DDL нет в миграциях | `git diff --name-only feat..HEAD \| grep -i migrat` | пусто — ни один файл `apps/webapp/db/drizzle-migrations/**` не тронут | **PASS** |
| 2 | Контракт владения стал ОДНИМ | см. ниже (три места) | все три говорят `postgres` | **PASS** |
| 3 | Передача владения на `app_object_owner` не потерялась | `grep -cE 'OWNER TO "app_object_owner"' privileges.bersoncarebot_test.sql` + runtime-overlay | 237 объектов → `app_object_owner`; 411 → точные seam/saas-владельцы; 4 → `postgres`; `ALTER DATABASE … OWNER TO "postgres"`; `runtime-overlay-app-owner-handoff.sql` переносит защищённые функции на `app_owner`. Механизм присутствует и подключён (652 `OWNER TO` всего) | **PASS (механизм)**; живьём не проверяемо — прогон встал до checkpoint (см. #5) |
| 4 | reconcile/--check зелёные на ЖИВОЙ базе; артефакты байт-в-байт; рантайм-роли не расширены | `git status --porcelain privileges.bersoncarebot_test.sql`; см. #1 | reconcile на живой базе **НЕ ДОСТИГНУТ** (стоп на ФИО) — воркер это и НЕ заявлял. Артефакт, перегенерённый в прогоне (mtime 07:13), байт-в-байт совпал с HEAD (tree чист) → детерминизм. Рантайм-роли не расширены (следствие #1) | **NOT REACHED** (ожидаемо; не заявлено ложно) |
| 5a | Остановка честная, после ФИО НИЧЕГО не применялось | `tail /tmp/bcb-test-reset-ownership-20260820.log`; `SELECT count(*) FROM drizzle.__drizzle_migrations`; `systemctl is-active` | лог 869 строк, обрывается на `{"ok":false,"error":"fio_owner_review_operation_failed"}`; leдджер drizzle = **136** (это дамп-источник, НЕ целевые 59); службы: webapp=failed, остальные inactive | **PASS** |
| 5b | Воркер не «дорешал» за владельца | `git diff --name-only feat..HEAD \| grep -iE 'fio\|manifest\|preserve'`; `git status` | НИ одного FIO/manifest/preserveCurrent-файла не тронуто; изменены только 2 скрипта + отчёт; tree чист | **PASS** |
| 5c | Предыдущие стадии реально прошли | лог строки 812/814/855 + живая база | restore PASS (`platform_users=299 integrator_schema_migrations=68 public_tables=187`); consolidation → «одна staff-запись»; data-fix → 1 doctor + 1 admin. Живьём: `platform_users=296` (299−3 consolidation), `live_doctors=1`, `live_admins=1` | **PASS** |
| 5d | Числа воркера перепроверены | `SELECT count(*)` на живой TEST | `integrator.schema_migrations=68` ✓, `public_tables=187` ✓, `platform_users` 299@restore→296 после data-fix ✓. Целевые 59 строк леджера и старт служб НЕ достигнуты ✓ | **PASS** |
| 5e | Диагноз дрейфа ФИО верен | `SELECT … WHERE source.id='4ff57819-…'` | строка `4ff57819` слита в `36f11d6b` `2026-08-16 13:28`, target.merged_into_id=NULL, обновлён `2026-08-16 13:31` — ПОСЛЕ обзора 18.07. Гейт `enforceFailClosedPlan` отработал по проекту | **PASS** |
| 6 | Данные владельца целы и НЕ обезличены | `SELECT * FROM be_organizations`; anonymization-scan | клиника `Точка Здоровья` (`a0000000-…-0001`) present, `is_active=t`; маркеров `anonymi/redacted/удал` в email и именах = 0; 138 реальных имён | **PASS** |
| 7 | Границы: ПРОД только read-only pg_dump; нет ручного DML по леджеру; A0/greenfield не восстановлены | `grep pg_dump/PROD deploy-test-saas.sh`; `grep DML __drizzle_migrations` | контакт с прод = `ssh bcb-clone "sudo -u postgres pg_dump -Fc --no-owner --no-acl bersoncarebot_test"` (read-only, файл на проде не остаётся); ручного DML по `drizzle.__drizzle_migrations` нет (единственный хит — `awk`-подсчёт INSERT'ов в артефакте); восстановлено только schema-A + data-fix состояние дампа | **PASS** |
| 8a | `bash -n` чист на тронутых скриптах | `bash -n restore-…sh deploy-test-saas.sh deploy-test.sh deploy-test-full-reset.sh` | все 4 — OK | **PASS** |
| 8b | Нет висячих ссылок на удалённые функции | `grep` 12 удалённых имён в скриптах | 0 ссылок — рефактор согласован | **PASS** |
| 8c | Сломай контракт владения → тест краснеет и называет расхождение | инъекция + `node --test deploy/host/*.test.mjs` | **тест НЕ краснеет.** Ни одного авто/CI-теста на контракт владения нет (см. блокер B1). Контракт держат ТОЛЬКО рантайм fail-closed-ассерты в скриптах | **FAIL** |

### Пункт 2 — детализация «один контракт»

| Место | Раньше (противоречие) | Теперь | Команда/доказательство |
|---|---|---|---|
| `deploy/host/deploy-test.sh:162` | владелец `postgres` | владелец `postgres` (без изменений) | `SELECT current_database()\|\|'\|'\|\|pg_get_userbyid(datdba)` == `$DB\|postgres`, fail-closed |
| `deploy-test-saas.sh` `assert_test_db_owner_ready` | владелец `$DBROLE`=`bersoncarebot_test` (несуществующая роль) | функция удалена → `assert_test_db_restore_owner_ready`: `[ "$db_owner" = postgres ]` и `platform_users`=`postgres`, оба `\|\| exit 1`, вызов на строке 3328 сразу после restore | `sed -n '/assert_test_db_restore_owner_ready/,/}/p'` |
| `restore-test-db-from-dump.sh` | `RESTORE_ROLE=app_object_owner` (упирался в B5: нет CREATE ON DATABASE) | `RESTORE_ROLE=postgres`, `pg_restore --role=postgres` | строка 11 |

Это НЕ «мёртвая ветка»: противоречивая функция `assert_test_db_owner_ready` и вся BYPASSRLS-машинерия
физически удалены (−157 строк), а не оставлены неисполняемыми.

## Инъекция для пункта 8 (доказательство отсутствия теста)

```bash
# baseline
node --test deploy/host/deploy-test-full-reset.test.mjs \
  deploy/host/prod-to-target-cutover-path-resolvable.test.mjs      # → pass 6 fail 0

# ломаем контракт владения (возвращаем B5-состояние)
sed -i 's/^RESTORE_ROLE=postgres/RESTORE_ROLE=app_object_owner/' deploy/host/restore-test-db-from-dump.sh
sed -i 's/\[ "$db_owner" = postgres \]/[ "$db_owner" = bersoncarebot_test ]/' deploy/host/deploy-test-saas.sh
node --test deploy/host/deploy-test-full-reset.test.mjs \
  deploy/host/prod-to-target-cutover-path-resolvable.test.mjs \
  deploy/host/migrate-dev.test.mjs                                 # → pass 16 fail 0  (НЕ покраснело)

git checkout -- deploy/host/restore-test-db-from-dump.sh deploy/host/deploy-test-saas.sh
git status --porcelain                                            # → пусто (инъекция откачена)
```

С намеренно сломанным контрактом (RESTORE_ROLE обратно на `app_object_owner` — возврат блокера B5 —
и ассерт владельца обратно на `bersoncarebot_test`) **весь набор deploy-тестов остаётся зелёным
(16/16)**. Регрессия по `RESTORE_ROLE`/владельцу пройдёт зелёный CI и всплывёт только на следующем
живом (разрушительном) сбросе — ровно тот разрыв, который требование «постоянный тест на контракт
владения» призвано закрыть. Инъекция откачена, `git status` чист.

## Живое состояние `bersoncarebot_test` после стопа (взгляд командой)

```
datname=bersoncarebot_test | owner=postgres | datconnlimit=-1
роли: app_object_owner(f/f/f/f/f); bersoncarebot_test — НЕ существует (второй строки нет)
has_database_privilege('app_object_owner', … ,'CREATE') = f
platform_users owner=postgres, count=296, merged_rows=45
integrator.schema_migrations=68 | drizzle.__drizzle_migrations=136 | public tables=187
владельцы: ВСЕ 187 public-таблиц + 228 функций + схемы drizzle/integrator = postgres;
           объектов под app_owner/app_object_owner = 0 (handoff ещё не выполнялся)
клиника: «Точка Здоровья» is_active=t; анонимизации нет; live_doctors=1 live_admins=1
службы: api/worker/scheduler/media-worker=inactive; webapp=failed
```

Все объекты под `postgres` — это ожидаемое ПРЕ-handoff состояние: прогон встал на ФИО до
privilege-checkpoint, который и переносит владение на `app_object_owner`/seam-роли. Заявленные
воркером `platform_users=299 integrator_schema_migrations=68 public_tables=187` — это числа НА МОМЕНТ
restore; после consolidation+data-fix `platform_users` осел на 296. Число 68 — ledджер интегратора
(`integrator.schema_migrations`), НЕ webapp-леджер; 136 — webapp-леджер дампа-источника, НЕ целевые 59.
Всё сходится.

## ВЕРДИКТ: FAIL — один блокер

Инженерная суть развязки корректна и безопасна: пункты **1, 1b, 2, 3, 5(a–e), 6, 7, 8(a–b) — PASS**.
Право не выдано, контракт сведён к одному (`postgres`), handoff на `app_object_owner` цел, стоп на ФИО
честный и ничего за владельца не дорешано, данные целы, прод тронут только read-only. Пункт **4 —
NOT REACHED** (живой reconcile за гейтом ФИО; воркер это честно не заявлял).

Единственный несущий блокер — пункт **8c**:

- **B1 (блокер, пункт 8):** нет постоянного теста на контракт владения. Доказано инъекцией: возврат
  `RESTORE_ROLE`/ассерта владельца в B5-состояние оставляет 16/16 deploy-тестов зелёными. Требование
  брифа «поведение „права ложатся как в декларации“ обязано держаться завтра → постоянный тест на
  контракт владения» НЕ выполнено. Контракт держат только рантайм fail-closed-ассерты, срабатывающие
  лишь во время разрушительного живого сброса.
  **Не чиню (по ограничению брифа) — это ВОПРОС владельцу/лиду:** добавить сейчас статический тест
  (по образцу `prod-to-target-cutover-path-resolvable.test.mjs`), утверждающий `RESTORE_ROLE=postgres`
  в `restore-test-db-from-dump.sh` и наличие/поведение `assert_test_db_restore_owner_ready` в
  `deploy-test-saas.sh` — или сознательно отложить.

Прочие незакрытые поведения — «сброс доходит до конца» и «reconcile зелёный на живой базе» —
заблокированы за owner-gated стопом ФИО и НЕ являются дефектами данной работы.
