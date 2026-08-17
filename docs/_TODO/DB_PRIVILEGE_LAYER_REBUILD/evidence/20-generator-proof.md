# evidence/20 — ГЕНЕРАТОР ПРАВ: доказательство исполнением (Ф2.3, SCHEME §B)

**Дата:** 2026-08-09. **Что доказывается:** генератор `declaration.ts → SQL` из SCHEME §B существует,
исполняется и делает ровно то, что §B предписывает. Доказательство — транскрипты с ОДНОРАЗОВОГО
кластера PostgreSQL 16, а не отчёт о написанном коде.

**Где код:**

| Файл | Что это |
|---|---|
| `deploy/postgres/privileges/generate.mjs` | чистая библиотека: декларация → текст SQL; БД для генерации не нужна |
| `deploy/postgres/privileges/generate-cli.mjs` | CLI: `--db/--out/--stdout/--all`, гейт `--check`, `--gaps`, `--env` |
| `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` | пруф-фикстура: декларация ТОЙ ЖЕ формы, воспроизводящая живой дефект |
| `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` · `proof-setup-db.sql` | состояние ДО генератора (живой дефект) |
| `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` | детерминированный снимок каталога прав (для идемпотентности/атомарности) |
| `deploy/postgres/privileges/fixtures/proof-run.sh` | ВЕСЬ прогон одной командой (создаёт кластер и сносит его) |
| `deploy/postgres/privileges/fixtures/generated/*.sql` | закоммиченные артефакты фикстуры — против них бежит гейт `--check` |

**Воспроизведение целиком:**

```
bash deploy/postgres/privileges/fixtures/proof-run.sh
```

**Изоляция.** Кластер создаётся `initdb` во временный каталог (`mktemp -d`), поднимается с
`-k <свой сокет> -c listen_addresses=''` (TCP нет вообще) и удаляется `trap`-ом на выходе. База
называется `bcb_privproof`. TEST, dev и прод НЕ затрагиваются ни одной командой этого прогона;
деплои заморожены, и прогон в них не лезет.

---

## Что именно воспроизведено (мишень пруфа)

Мишень — реальный дефект из `FINDINGS_TABLES.md` (часть 3, Н2): **`public.phone_challenges`** —
ОТП входа лежит **открытым текстом** в колонке `code`, RLS выключен, политик ноль, а арендная роль
`app_staff` держит ПРЯМОЙ табличный грант `arwd`. То есть терминал персонала ЛЮБОЙ клиники, без
всякого контекста принципала, читает коды входа всех пользователей платформы. Собственный контракт
кода нарушен явно: `pgPublicBookingOtp.ts:6-8` — «вызывающей роли нужен EXECUTE на функцию и НИЧЕГО
на `public.phone_challenges`».

Вторым в фикстуре воспроизведён **`public.be_organization_members`** — org-таблица с
`relrowsecurity=false` (FACTS §1.2-1.3), чтобы доказать эмиссию RLS-флагов как СТАТЕЙ ГЕНЕРАТА
(§B: «без этого поле `rls` — мёртвая запись»). Третьей — `public.integrator_push_outbox`, чтобы
доказать правило последовательностей §A.4.

Форма таблиц взята из схемы репозитория (`apps/webapp/db/schema/schema.ts:24-47`,
`bookingEngine.ts:219-235`, `schema.ts:3197-3217`); гранты «ДО» — из переписи (evidence/13 §2.5,
FINDINGS_TABLES).

---

## 1. КРАСНЫЙ — до генератора

`SET ROLE app_staff`, принципал НЕ установлен → строки выдаются.

```
══════════════════════════════════════════════════════════════════════
2. КРАСНЫЙ — ДО генератора: app_staff без принципала читает чужие коды входа
══════════════════════════════════════════════════════════════════════
         relname         | rls | force |                                                       relacl
-------------------------+-----+-------+---------------------------------------------------------------------------------------------------------------------
 be_organization_members | f   | f     | {bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_staff=arwd/bcb_proof_migrator,app_patient=r/bcb_proof_migrator}
 phone_challenges        | f   | f     | {bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_staff=arwd/bcb_proof_migrator,app_owner=arwd/bcb_proof_migrator}
(2 rows)

SET
   роль    | принципал не установлен
-----------+-------------------------
 app_staff | t
(1 row)

 challenge_id |    phone     | ОТП открытым текстом
--------------+--------------+----------------------
 ch-1         | +79990000001 | 111222
 ch-2         | +79990000002 | 333444
 ch-3         | +79990000003 | 555666
 ch-4         | +79990000004 | 777888
(4 rows)

 строк видно app_staff (phone_challenges)
------------------------------------------
                                        4
(1 row)

 чужих членств видно app_staff
-------------------------------
                             2
(1 row)

RESET
```

Ровно то число строк, что назвала живая перепись («`SET ROLE app_staff` без принципала → **4
строки**»), и ровно те коды, которые в жизни являются паролем на вход.

---

## 2. ЗЕЛЁНЫЙ — после применения генерата

Генерация (БД не нужна) и применение ОДНОЙ транзакцией:

```
══════════════════════════════════════════════════════════════════════
3. ГЕНЕРАЦИЯ АРТЕФАКТА (подключение к БД не требуется)
══════════════════════════════════════════════════════════════════════

=== bcb_privproof: пробелов 0 ===
записано: …/gen/privileges.bcb_privproof.sql (14722 байт)
записано: …/gen/org-allowlist.bcb_privproof.sql (1501 байт)

══════════════════════════════════════════════════════════════════════
4. ПРИМЕНЕНИЕ — ОДНА ТРАНЗАКЦИЯ (psql -1 -v ON_ERROR_STOP=1)
══════════════════════════════════════════════════════════════════════
код выхода psql: 0 (0 = вся транзакция закоммичена)
статей выполнено: 76; хвост:
ALTER FUNCTION
REVOKE
REVOKE
GRANT
DO
```

Login-специфичные статьи (§A.1) применяются ОТДЕЛЬНЫМ рендером и в закоммиченный артефакт не входят;
пароль в тексте не литерал, а psql-переменная:

```
══════════════════════════════════════════════════════════════════════
4b. LOGIN-РЕНДЕР ИЗ ENV-МАППИНГА (§A.1) — применяется ОТДЕЛЬНО, в артефакт не входит
══════════════════════════════════════════════════════════════════════
статей PASSWORD (значение — psql-переменная, литерала в тексте нет): 2
ALTER ROLE "bcb_proof_migrator" PASSWORD :'PGPASSWORD_BCB_PROOF_MIGRATOR';
ALTER ROLE "bcb_proof_staff_login" PASSWORD :'PGPASSWORD_BCB_PROOF_STAFF';
GRANT ROLE
GRANT
ALTER ROLE
код выхода psql: 0
--- РЕАЛЬНОЕ соединение логином (не SET ROLE из суперпользователя) ---
         логин         |     текущая роль
-----------------------+-----------------------
 bcb_proof_staff_login | bcb_proof_staff_login
(1 row)

SET
 текущая роль после SET ROLE
-----------------------------
 app_staff
(1 row)

ERROR:  permission denied for table phone_challenges
 штатный definer-путь
----------------------
 333444
(1 row)
```

Это важнее, чем кажется: стена проверена НАСТОЯЩИМ соединением непривилегированного логина, а не
только `SET ROLE` из суперпользовательской сессии — то есть на том же пути, которым ходит приложение.

Тот же запрос той же ролью в том же положении (принципал не установлен):

```
══════════════════════════════════════════════════════════════════════
5. ЗЕЛЁНЫЙ — ПОСЛЕ генератора: ноль строк И ошибка в журнале
══════════════════════════════════════════════════════════════════════
         relname         | rls | force |                                                       relacl
-------------------------+-----+-------+--------------------------------------------------------------------------------------------------------------------
 be_organization_members | t   | t     | {bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_owner=arw/bcb_proof_migrator,app_staff=arwd/bcb_proof_migrator}
 phone_challenges        | f   | f     | {bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_owner=arwd/bcb_proof_migrator}
(2 rows)

SET
   роль    | принципал не установлен
-----------+-------------------------
 app_staff | t
(1 row)

ERROR:  permission denied for table phone_challenges
 чужих членств видно app_staff
-------------------------------
                             0
(1 row)

 штатный definer-путь жив
--------------------------
 111222
(1 row)

RESET
--- журнал сервера: запись отказа ---
2026-08-09 00:05:15.476 MSK [939699] bcb_proof_staff_login@bcb_privproof ERROR:  permission denied for table phone_challenges
2026-08-09 00:05:15.510 MSK [939701] postgres@bcb_privproof ERROR:  permission denied for table phone_challenges
```

Две строки — два независимых отказа: первый из настоящей сессии логина (раздел 4b), второй из
`SET ROLE`-сессии этого раздела.

**Инвариант приёмки владельца выполнен буквально:** запрос без контекста и без точного совпадения
разрешений выдал **0 строк И написал ошибку в журнал сервера** (последняя строка — из
`postgres.log` кластера, не из вывода клиента). Причём это ГРОМКИЙ `42501`, а не тихий ноль:
табличный грант арендной роли снят, и «ничего не вернулось» отличимо от «нечего возвращать».

Три вещи в том же транскрипте:

- `be_organization_members` — `rls`/`force` перевернулись `f/f → t/t` **статьями генерата**
  (§B: RLS-флаги — статьи, иначе поле `rls` мёртвое), и чужие членства стали невидимы (0 вместо 2);
- **штатный путь ЖИВ**: `app.public_booking_otp_issue('+79990000001')` под той же ролью `app_staff`
  вернул `111222`. Стена закрыла ТАБЛИЦУ, а не работу приложения — это и есть «доступ только через
  definer-шов» (контракт `pgPublicBookingOtp.ts:6-8`);
- `app_patient=r` на `be_organization_members` исчез — лишний грант, которого нет в декларации,
  снесён полным переприменением.

---

## 3. СНОВА КРАСНЫЙ — дефект возвращён и откачен

```
══════════════════════════════════════════════════════════════════════
6. СНОВА КРАСНЫЙ — дефект возвращён внутри транзакции и ОТКАЧЕН
══════════════════════════════════════════════════════════════════════
BEGIN
GRANT
ALTER TABLE
SET
 снова видно (phone_challenges)
--------------------------------
                              4
(1 row)

 снова видно чужих членств
---------------------------
                         2
(1 row)

RESET
ROLLBACK
SET
ERROR:  permission denied for table phone_challenges
RESET
```

Внутри транзакции возвращены обе половины дефекта (`GRANT SELECT … TO app_staff` и
`DISABLE ROW LEVEL SECURITY`) — строки вернулись: 4 кода входа и 2 чужих членства. После `ROLLBACK`
стена на месте: тот же запрос снова даёт `42501`. То есть зелёный держится не случайно и не
«потому что данных нет» — он держится ровно на тех двух статьях, которые ставит генератор.

---

## 4. Свойства самого генератора

### 4.1 Идемпотентность — второе применение без ошибок, каталог байт-в-байт тот же

```
══════════════════════════════════════════════════════════════════════
7. ИДЕМПОТЕНТНОСТЬ — второй прогон без ошибок, каталог побайтно тот же
══════════════════════════════════════════════════════════════════════
код выхода второго применения: 0
ИДЕМПОТЕНТНО: снимок каталога (relacl/флаги/политики/proacl/nspacl/datacl/дефолты) совпал побайтно
строк в снимке: 24, sha256: 2cfd7ef95d2748e7a68041e03c3e1f5462df69685f41f663d0d3f003b23e5f5f  -
--- снимок целиком (он же — ожидаемая сторона §F) ---
datacl|bcb_privproof|{bcb_proof_migrator=CTc/bcb_proof_migrator}|owner=bcb_proof_migrator
defacl|app_owner|T|{app_owner=U/app_owner}
defacl|app_owner|f|{app_owner=X/app_owner}
defacl|bcb_proof_migrator|T|{bcb_proof_migrator=U/bcb_proof_migrator}
defacl|bcb_proof_migrator|f|{bcb_proof_migrator=X/bcb_proof_migrator}
defacl|postgres|T|{postgres=U/postgres}
defacl|postgres|f|{postgres=X/postgres}
member|app_staff|bcb_proof_staff_login|admin=false|inherit=false|set=true
nspacl|app|{app_owner=UC/app_owner,app_patient=U/app_owner,app_staff=U/app_owner}|owner=app_owner
nspacl|public|{pg_database_owner=UC/pg_database_owner,app_owner=U/pg_database_owner,app_patient=U/pg_database_owner,app_staff=U/pg_database_owner}|owner=pg_database_owner
policy|public.be_organization_members|be_organization_members_staff_org|PERMISSIVE|ALL|{app_staff}|(organization_id = app.current_org_id())|(organization_id = app.current_org_id())
proacl|app.current_org_id|{app_owner=X/app_owner,app_patient=X/app_owner,app_staff=X/app_owner}|owner=app_owner|secdef=true|proconfig={search_path=pg_catalog}
proacl|app.public_booking_otp_issue|{app_owner=X/app_owner,app_staff=X/app_owner}|owner=app_owner|secdef=true|proconfig={"search_path=app, pg_catalog"}
relacl|public.be_organization_members|{bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_owner=arw/bcb_proof_migrator,app_staff=arwd/bcb_proof_migrator}|owner=bcb_proof_migrator|rls=true|force=true
relacl|public.integrator_push_outbox_id_seq|{bcb_proof_migrator=rwU/bcb_proof_migrator,app_staff=rU/bcb_proof_migrator}|owner=bcb_proof_migrator|rls=false|force=false
relacl|public.integrator_push_outbox|{bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_owner=r/bcb_proof_migrator,app_staff=arwd/bcb_proof_migrator}|owner=bcb_proof_migrator|rls=false|force=false
relacl|public.phone_challenges|{bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_owner=arwd/bcb_proof_migrator}|owner=bcb_proof_migrator|rls=false|force=false
role|app_migration_phase|login=false|super=false|bypassrls=false|inherit=false|createrole=false|rolconfig=<null>
role|app_owner|login=false|super=false|bypassrls=true|inherit=true|createrole=false|rolconfig=<null>
role|app_patient|login=false|super=false|bypassrls=false|inherit=true|createrole=false|rolconfig=<null>
role|app_staff|login=false|super=false|bypassrls=false|inherit=true|createrole=false|rolconfig=<null>
role|bcb_proof_migrator|login=true|super=false|bypassrls=false|inherit=true|createrole=false|rolconfig=<null>
role|bcb_proof_staff_login|login=true|super=false|bypassrls=false|inherit=false|createrole=false|rolconfig=<null>
role|postgres|login=true|super=true|bypassrls=true|inherit=true|createrole=true|rolconfig=<null>
```

Снимок читается как приёмка §D и §C — каждая строка здесь есть следствие статьи генерата:

- `datacl` — `PUBLIC=Tc` СНЯТ (§D.1: PUBLIC CONNECT/TEMPORARY — неявный дефолт);
- `nspacl|public` — PUBLIC USAGE СНЯТ, остались только объявленные роли (§D.2);
- `defacl` — по каждому из трёх создателей закрыты дефолты `FUNCTIONS` и `TYPES` (там, где PostgreSQL
  раздаёт `PUBLIC EXECUTE/USAGE`); строк по `TABLES/SEQUENCES` нет, потому что там дефолтного
  PUBLIC-права и не было — REVOKE отработал как no-op (§D.3/§B);
- `member|…` — остался ОДИН член: `app_staff → bcb_proof_staff_login`. Подсаженное в фикстуре
  «остаточное членство после упавшего migrate» (`app_owner → bcb_proof_migrator`) **снято**
  генератом (§C: у `app_owner` ноль членов в стационаре);
- `role|app_migration_phase` — маркер-роль §E **создана с нуля** (в базе «до» её не было);
- `proacl|app.public_booking_otp_issue` — `proconfig={"search_path=app, pg_catalog"}` **сохранён
  дословно**: генератор `proconfig` НЕ трогает (§B — его применяет тело функции в миграции);
- `relacl|…integrator_push_outbox_id_seq` — `app_staff=rU` (SELECT+USAGE) выдан ПРАВИЛОМ §A.4
  (роль с INSERT/UPDATE на таблице получает USAGE на её последовательностях), а не отдельной записью.

### 4.2 Атомарность — падающая статья не оставляет следа

```
══════════════════════════════════════════════════════════════════════
8. АТОМАРНОСТЬ — падающая статья внутри транзакции не оставляет следа
══════════════════════════════════════════════════════════════════════
код выхода psql: 3 (ожидается ≠ 0)
psql:…/atomicity-probe.sql:307: ERROR:  relation "public.table_that_does_not_exist" does not exist
АТОМАРНО: ACL/флаги не изменились ни на байт — вся транзакция откатилась
{bcb_proof_migrator=arwdDxt/bcb_proof_migrator,app_owner=arwd/bcb_proof_migrator}
```

В конец артефакта подсажены ДВЕ статьи: видимое изменение (`GRANT SELECT … TO app_staff`) и сразу
за ним заведомо падающая. Прогон `psql -1 -v ON_ERROR_STOP=1` упал (код 3), снимок каталога совпал
с предыдущим побайтно, а `relacl` таблицы-мишени по-прежнему БЕЗ `app_staff` — то есть подсаженный
GRANT не пережил транзакцию. Это и есть требование §B «одна транзакция»: раздельные autocommit-
операторы оставили бы половину применённой и ломали бы открытых читателей (FACTS §4.1).

### 4.3 Детерминизм и гейт `--check`

```
══════════════════════════════════════════════════════════════════════
9. ДЕТЕРМИНИЗМ — тот же вход ⇒ побайтно тот же выход; --check против закоммиченного
══════════════════════════════════════════════════════════════════════
побайтно совпало: privileges.bcb_privproof.sql (e58989692055a262…)
побайтно совпало: org-allowlist.bcb_privproof.sql (63ae5bf7fec9da34…)
ok bcb_privproof/privileges: docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md совпадает побайтно
ok bcb_privproof/allowlist: docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md совпадает побайтно

--check: артефакты соответствуют декларации побайтно.
--- гейт обязан КРАСНЕТЬ на устаревшем артефакте ---
КРАСНЫЙ bcb_privproof/privileges: …/stale/privileges.bcb_privproof.sql разошёлся с декларацией
строка 304:
  закоммичено: "GRANT SELECT ON TABLE public.phone_challenges TO app_staff;"
  сгенерировано: ""
ok bcb_privproof/allowlist: …/stale/org-allowlist.bcb_privproof.sql совпадает побайтно

--check: расхождений 1. Перегенерируйте артефакт и закоммитьте.
код выхода --check на устаревшем артефакте: 1 (1 = красный)
```

Гейт доказан в ОБЕ стороны: зелёный на совпадении и красный на устаревшем артефакте — с указанием
номера строки и обеих версий. Это гейт (а) из §B («побайтная перегенерация артефакта — расхождение
с декларацией = красный»); гейт (б) («тот же вход → побайтно тот же выход») — две независимые
генерации, `cmp` без разницы.

### 4.4 Громкий отказ на пробелах декларации

```
══════════════════════════════════════════════════════════════════════
10. ГРОМКИЙ ОТКАЗ на ПРОИЗВОДСТВЕННОЙ декларации (пробелы переписи)
══════════════════════════════════════════════════════════════════════
код выхода --gaps: 2 (2 = декларация неполна)
мест с пробелами: 18

=== bcb_webapp_dev: пробелов 9 ===
  • databases.bcb_webapp_dev.functionsViews.views: TODO в декларации: TODO(census-gap): views/security_invoker not enumerated for dev
  • databases.bcb_webapp_dev.definerExceptions.ownershipExceptions.intentional.saas_system_health_owner: TODO в декларации: TODO(census-gap G3): 4 имени не перечислены
  • databases.bcb_webapp_dev.definerExceptions.ownershipExceptions.intentional.saas_telemetry_owner: TODO в декларации: TODO(census-gap G3): 7 имён не перечислены read-only переписью
  • databases.bcb_webapp_dev.definerExceptions.ownershipExceptions.drift.app_platform_settings: TODO в декларации: TODO(census-gap G3): имя функции, которой владеет app_platform_settings
```

**Это НЕ дефект генератора — это его контракт.** На производственной декларации (её параллельно
дозаполняет перепись Ф2) генератор ОТКАЗЫВАЕТСЯ выпускать артефакт и перечисляет каждое место
поимённо. Пропустить таблицу молча — ровно тот механизм, которым нынешний бардак и вырос, поэтому
поведение по умолчанию — упасть целиком. Замер на момент этого прогона: 9 мест по `bcb_webapp_dev`
и 9 по `bersoncarebot_test` (было 33 в начале работы — перепись их закрывает). Проверить сейчас:
`node deploy/postgres/privileges/generate-cli.mjs --gaps`.

Что генератор считает пробелом (каждое правило — из провала, а не из вкуса):

| Правило | Почему |
|---|---|
| объект `{ todo: '…' }` где угодно в записи | незаполненное место переписи |
| `policies[*].to: []` | «дремлющая» политика §G.4: роли пусты — цель НЕ объявлена |
| `rls:'on'` без `rlsWhy` | §A.4 требует обоснование для RLS без FORCE |
| `rls:'n/a'` вместе с грантами | шаблон `pending-removal` требует НОЛЬ грантов |
| грантополучатель не роль и не логин декларации | опечатка в имени = молча невыданное право |
| `orgTableAllowlist.named` содержит таблицу, которой нет в `tables` | триггер §E получил бы allowlist без прав |
| `fullCountLive` ≠ числу объявленных org-таблиц | перепись насчитала больше, чем объявлено |
| `ownershipExceptions.drift[*].known.length ≠ count` | неназванную функцию нельзя ни привести к владельцу, ни объявить исключением |
| `database.owner ≠ dbSettings.datdba` | два источника истины о владельце базы |
| `'=PUBLIC'` в схеме без `publicDefect: true` | непонятно, цель это или дефект |

---

## 5. Что генератор НЕ эмитит (и это записано в шапке каждого артефакта)

- `proconfig` / `SET search_path` definer-функций — применяет **тело функции в миграции** (§B, одна
  власть; спор двух движков — задокументированный wontfix dbt #6238). Доказано в снимке 4.1:
  `proconfig` пережил применение дословно;
- DDL схемы (`CREATE SCHEMA/TABLE/FUNCTION/VIEW`) — миграции;
- объекты стены (`app_control`, event trigger, §D.5 снятие материализованного `PUBLIC EXECUTE` со
  ВСЕХ функций схем) — шаг `wall-install` (§B шаг 3). Схема с `present: false` в генерате получает
  явный комментарий с именем другой власти, а не молчание;
- login-специфичные статьи (создание логинов, пароли, членства логинов, `CONNECT`,
  `ALTER ROLE … IN DATABASE … SET`) — рендер в момент применения из env-маппинга (§A.1), в
  закоммиченный артефакт не входят. Рендер: `generate-cli.mjs --env <env> --db <база>`; пароль
  подставляется psql-переменной по имени из `passwordEnv`, литерала в тексте нет.

---

## 6. Найдено по ходу — вопросы к форме декларации (НЕ правки, а находки)

1. **EXECUTE-гранты 235 definer-функций объявить сегодня негде.** Блок
   `definerExceptions.defaults` несёт владельца, `searchPath` и `publicExecute: false`, но НЕ несёт
   списка ролей с EXECUTE. Поэтому «кто имеет право звать функцию» декларируемо только для функций,
   поимённо перечисленных в `proconfigExceptions`/`ownershipExceptions`. В пруф-фикстуре пришлось
   перечислить обе definer-функции исключениями именно из-за этого. Без поля ACL в `defaults`
   генератор для основной массы функций может только снять `PUBLIC EXECUTE` и поставить владельца —
   выдать EXECUTE рантайм-ролям он не может, а без EXECUTE не работают и политики org-таблиц
   (`app.current_org_id()` зовётся из USING под вызывающей ролью).
2. **`functionsViews` не описывает не-definer ФУНКЦИИ** — в типе есть только `views`. §A.5 говорит
   про «явные ACL не-definer функций И представлений».
3. **`views[*].execute` для представления неоднозначно**: EXECUTE к представлению неприменим,
   осмысленен только табличный `SELECT`. Генератор на такой записи падает с объяснением, а не
   догадывается.
4. **`GrantSet` в типах ≠ данным**: живая декларация несёт и массив (`['SELECT']`), и запись с
   обоснованием (`{ privs: [...], why: '…' }`). Генератор понимает обе формы; тип стоит привести к
   данным.
5. **`rls: 'n/a'`** (PENDING_REMOVAL) появился в декларации после §A.4 — грамматика §A.4 закрыта
   тремя значениями. Генератор поддерживает и явно печатает в SQL, что RLS-статей для такой таблицы
   нет; в SCHEME §A.4 значение стоит внести.

---

## 7. Границы этого доказательства (что НЕ доказано)

- **Артефакта производственных баз ещё нет** — генератор на них отказывает (раздел 4.4), потому что
  перепись не закончена. Значит и `deploy/postgres/generated/privileges.<db>.sql` не закоммичен;
  гейт `--check` доказан на фикстуре.
- **В конвейер деплоя генератор НЕ включён** (§B шаги 0-7 и `deploy-test-saas.sh`/`migrate-dev.sh`
  не тронуты) — это следующая фаза; деплои заморожены.
- **`generated/expected-state.json`** (второй артефакт под сверку §F) не строится: он принадлежит
  §F, и его форму задаёт сверяльщик, которого ещё нет.
- **Пруф-кластер меньше живого**: 3 таблицы, 2 definer-функции, 6 ролей. Поведение доказано, объём —
  нет; на 239 таблицах гоняется, когда перепись закроет пробелы.
- **`%u` в журнале — session_user**: в строке лога стоит имя ЛОГИНА (`bcb_proof_staff_login`), а не
  терминальной роли (`app_staff`), под которой запрос реально шёл. Для разбора инцидента этого мало —
  вопрос к конфигурации логирования, не к генератору.
- **Пароли логинов** применены с фиктивными значениями (`dummy-not-a-real-secret`): что генератор
  ставит РЕАЛЬНЫЙ секрет из env-хранилища, здесь не доказано — доказано лишь, что литерала в тексте нет.
