# Подтверждающий аудит S0б: исправление ведущего `fb046e96e`

**Дата:** 12.09.2026
**Кандидат:** `wt/exercise-store-s0b@372d35479` (слияние `feat/doctor-ui-rebuild`)
**Под аудитом:** `fb046e96e` — исправление двух FAIL предыдущего независимого аудита
(`EXERCISE_STORE_S0B_AUDIT.md`, вердикт FAIL, «убито 6 / непойманных 2»)
**Authority:** `AGENTS.md` (§10a, §10b, §24); `EXERCISE_STORE_PLAN.md` §5, этап S0б
**Роль:** `auditor-live`, провайдер Claude (codex-квота исчерпана — решение ведущего явное, не молчаливый
фолбэк). Независимость по провайдеру отсутствует, поэтому ни одно утверждение коммита не принято на веру:
каждое воспроизведено своей командой на живой `bcb_webapp_dev` и живом HTTP.

## Вердикт

**PASS по исправлению.** Обе находки предыдущего аудита закрыты и проверены живьём:

- **F1 (`INSERT(owner_kind)`)** — закрыта. Создание, правка, чтение и архивация клинического теста и
  рекомендации через реальные HTTP-маршруты врача дали **200** по всем восьми вызовам. Отдельно доказано,
  что грант **несущий**: тот же drizzle-INSERT в rollback-транзакции после `REVOKE INSERT("owner_kind")`
  падает ровно тем `42501`, который ловил предыдущий аудит.
- **F2 (слепота гейта арендной стены)** — закрыта для `public.tests`. Снятие `org: true` красит
  `tenant-predicate-invariant.test.mjs` тест 6 с прямым называнием `public.tests`.

**Стена арендатора исправлением не открыта:** девять rollback-проб — попытки записи платформенной строки,
записи в чужую организацию, правки и удаления чужой и платформенной строки — все закрыты `42501`
(`new row violates row-level security policy`) либо нулём затронутых строк; контрольная запись в свою
организацию проходит.

**Этап S0б при этом НЕ land-complete** по причине, которая исправлением не создана и им не лечится:
собственная строка плана «**Живая проверка:** то же, но для платформенного теста и платформенной
рекомендации» сегодня невыполнима на DEV — четыре `FOR SELECT`-политики платформенного чтения объявлены в
артефакте, но на живой базе их нет (замер ниже). Это тот же чужой дрейф, из-за которого не идёт
`reconcile-access.mjs`; предыдущий аудит держал его как `S0б-5 → BLOCKED`.

## Классификация «тест или взгляд» (§24.4) — по поверхностям, не одна на этап

| Поверхность | Класс | Почему | Чем доказано |
|---|---|---|---|
| Стена прав (кто пишет/читает какую колонку четырёх отношений) | **повторяемое поведение → тест + живой прогон** | у требования есть устойчивый oracle (роль, колонка, SQLSTATE), молчаливая поломка дорогая — живой HTTP 500 | live-proof `devDbProof` 6/6 + 4 инъекции политик + 9 rollback-проб + живой HTTP |
| Два новых статических гейта | **утверждение о том, что покраснеет → инъекция, не чтение** | сам гейт — это обещание; читать его текст = проверять текст, а не поведение | 2 инъекции, показана точная падающая строка |
| Артефакты и объявление | **качество разового действия → чтение итогового состояния** | одноразовая генерация, поведения нет | `check:db-privileges-generated` exit 0, grep по миграции |
| Экраны врача | **не проверялось автоматизированно** (§10a) | автоматизированных UI-тестов в репозитории нет | HTTP-маршруты живьём; про экраны в отчёте ничего не утверждается |

## 1. F1 закрыта живьём — свой сервер, свой вход, свои коды ответа

Сервер поднят из этого клона на своём порту, **общий DEV `:5200` не тронут** (скрипт `dev` запускать нельзя —
он жёстко зашит на 5200 и убивает соседа):

```bash
cd apps/webapp && PORT=5277 nohup setsid npx next dev --disable-source-maps -H 127.0.0.1 -p 5277 &
# ✓ Ready in 337ms; ss: LISTEN 127.0.0.1:5277
```

`:5200` до и после аудита держит один и тот же процесс `pid=3930698` — сосед не задет.

Вход настоящим маршрутом (`/api/auth/dev-bypass` больше не существует):

```bash
curl -X POST http://127.0.0.1:5277/api/auth/email-password/login \
  -H 'Origin: http://127.0.0.1:5277' -H 'Referer: http://127.0.0.1:5277/login' \
  -d '{"email":"dimmdao@yandex.ru","password":"…","roleLoginPortal":"doctor"}'
# HTTP/1.1 200 OK; {"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
```

Полный живой цикл каталога:

| Вызов | Код |
|---|---|
| `POST /api/doctor/clinical-tests` | **200** `{"ok":true,"item":{…,"ownerKind":"organization"}}` |
| `POST /api/doctor/recommendations` | **200** `{"ok":true,"item":{…,"ownerKind":"organization"}}` |
| `PATCH /api/doctor/clinical-tests/{id}` | **200** |
| `GET /api/doctor/clinical-tests/{id}` | **200** |
| `GET /api/doctor/recommendations/{id}` | **200** |
| `DELETE /api/doctor/clinical-tests/{id}` (архивация) | **200** `{"ok":true}` |
| `DELETE /api/doctor/recommendations/{id}` (архивация) | **200** `{"ok":true}` |
| `GET …?includeArchived=true&q=AUDIT-S0B-CONFIRM` (чтение назад) | **200**, обе строки с `isArchived:true` |

Путь записи в **`recommendation_regions`** отдельно пройден живьём: `POST` с `bodyRegionId` → **200**,
`PATCH` со сменой региона (регионы переписываются delete+insert) → **200**, архивация → **200**.
Путь записи в `clinical_test_regions` HTTP-маршрутом не открыт (регионы теста ставит server action формы
врача) — он доказан не HTTP, а гейтом покрытия и rollback-пробами ниже; см. «НЕ ПРОВЕРЕНО».

**Причина 42501 воспроизведена независимо.** Форма INSERT снята с самого drizzle, не процитирована:

```
insert into "tests" ("id","owner_kind","organization_id","title",…) values (default, default, $1, $2, …)
insert into "clinical_test_regions" ("owner_kind","organization_id","clinical_test_id","body_region_id") …
insert into "recommendations" ("id","owner_kind","organization_id","title","body_md",…) …
insert into "recommendation_regions" ("owner_kind","organization_id","recommendation_id","body_region_id") …
```

Все четыре НАЗЫВАЮТ `owner_kind`. Тезис ведущего из `13ef014bd` («drizzle не называет default-колонку»)
подтверждённо неверен, предыдущий аудитор был прав.

**Грант несущий, а не декоративный** (`/tmp/audit-grant-loadbearing.mjs`, всё в `BEGIN … ROLLBACK`):

```
WITH grant (candidate state):    failed=false  inserted id=214495bc-…
WITHOUT grant (injected revoke): failed=true   42501: permission denied for table tests
LIVE_GRANT|1     PROBE_RESIDUE|0
```

**Живые гранты на месте** (`information_schema.column_privileges`, `grantee='app_staff'`,
`column_name='owner_kind'`): `INSERT`+`SELECT` по всем четырём отношениям. То есть случай из брифа
«грантов нет в живой БД — это среда» не наступил: они есть, и запись работает.

**Уточнение к тексту коммита `fb046e96e` и к брифу.** Коммит пишет, что добавил ещё и колоночный
`SELECT(owner_kind)` на `clinical_test_regions`. Замер по декларации на `36fff528e` (до исправления) и на
`fb046e96e` показывает другое: `SELECT` уже нёс `owner_kind` до этого коммита (пришёл с продуктом
`c04f748df`), а `fb046e96e` расширил именно **`INSERT` 3 → 4 колонки**. На результат это не влияет —
итоговое состояние верное, — но как описание своей же правки утверждение неточно.

## 2. Стена арендатора исправлением не открыта

`/tmp/audit-tenant-wall.mjs`, каждая проба — отдельная `BEGIN … ROLLBACK`, роль `app_staff` с
port-context организации живого DEV-врача, форма запроса — drizzle-INSERT (с названным `owner_kind`):

```
BLOCKED 42501 (new row violates RLS for "tests")                 <- INSERT tests as platform
BLOCKED 42501 (new row violates RLS for "tests")                 <- INSERT tests into FOREIGN organization
BLOCKED 42501 (new row violates RLS for "clinical_test_regions") <- INSERT ct_regions into FOREIGN organization
BLOCKED 42501 (new row violates RLS for "recommendations")       <- INSERT recommendations into FOREIGN organization
BLOCKED (0 rows)  <- UPDATE a FOREIGN organization row
BLOCKED (0 rows)  <- UPDATE a PLATFORM row
BLOCKED (0 rows)  <- DELETE a FOREIGN organization row
BLOCKED (0 rows)  <- SELECT a FOREIGN organization row
ALLOWED           <- CONTROL: INSERT into OWN organization
RESIDUE|0
```

Контроль обязателен: без него «всё запрещено» не отличить от «контекст не встал».

**Тариф остаётся одним рубильником.** Перепись всех производителей `includePlatformBase` для тестов и
рекомендаций: **19 из 19** берут его из `requireEntitlementForReadAction(workspace, 'exercise_catalog')`,
второго источника нет. Ветка `false` в портах (`pgClinicalTests.ts:356-367`, `pgRecommendations.ts:319`,
`:368`, `:400`, `:420`) — прежний строгий предикат `eq(organizationId, currentPrincipalOrganizationId())`;
сравнение строгое (`=== true`), поэтому `undefined` уходит в узкую ветку. `material-ratings/summary/route.ts`
жёстко передаёт `includePlatformBase: false` — в сторону сужения, не расширения.

**Живьём тарифный рубильник не проверялся и проверен быть не может** — см. §5.

## 3. Оба новых статических гейта кусают — доказано инъекцией, а не чтением

Базовые прогоны до инъекций: `tenant-predicate-invariant` **6/6 PASS**,
`staff-drizzle-insert-grant-coverage` **1/1 PASS**.

**Инъекция A — снять `org: true` у `public.tests`** (`declaration.ts:23877`):

```
not ok 6 - org-флаг стены сверяется с переписью колонок, а не с доброй волей автора
  location: 'deploy/postgres/privileges/tenant-predicate-invariant.test.mjs:216:1' (assert :226)
  bersoncarebot_test: таблица несёт organization_id, но не объявлена org: true —
  инвариант арендной стены её пропускает: public.tests
```

**Инъекция B — убрать `owner_kind` из обеих записей INSERT-гранта `public.tests`** (строки 21139 и 21190;
удалять надо обе, потому что права роли складываются объединением, и на этом объединении гейт и построен):

```
not ok 1 - every column a staff Drizzle INSERT names is granted to app_staff
  location: 'deploy/postgres/privileges/staff-drizzle-insert-grant-coverage.test.mjs:126:1'
  pgClinicalTests.create names public.tests column(s) app_staff may not insert: owner_kind
```

Обе инъекции откатаны: `git checkout HEAD -- declaration.ts`, `git status` пуст, `declaration.ts`
побайтно совпал с резервной копией, снятой до первой инъекции, оба гейта снова зелёные.

**Заморозка `ORG_FLAG_CENSUS_BASELINE` проверена на честность, а не принята на слово.** Своя перепись
(216 drizzle-таблиц против ACTIVE-таблиц декларации) даёт **ровно 30** расхождений; в списке заморозки
**30** записей; «лишних» (внесённых в заморозку, но не являющихся расхождением) — **0**, «пропущенных» — **0**.
Список не раздут и не занижен.

**Качество новых и изменённых тестов по §10a.** Oracle независим: колонки берутся у самого drizzle
(`.values({})` → список НАЗВАННЫХ колонок) и у переписи `getTableConfig`, а не переписаны руками из
исходника; молчаливая поломка дорогая и названа (живой HTTP 500 / молча снятая арендная стена); конечное
наблюдаемое последствие названо. Послабление `matches.length === 1` → `>= 1` в
`staffInsertGrantColumns` — не ослабление: эффективное право роли есть ОБЪЕДИНЕНИЕ гранта, а у
`public.tests` записей INSERT две; требование «грант обязан быть колоночным» сохранено для КАЖДОЙ записи.

## 4. Объявление — единственный источник правды

- `pnpm run check:db-privileges-generated` → **exit 0**, побайтное совпадение всех трёх баз:
  `privileges` + `org-allowlist` (`bcb_webapp_dev`, `bersoncarebot_test`, `therapysto_prod`) и
  `port-context-capabilities` тех же трёх.
- `GRANT` живёт только в `deploy/postgres/privileges/declaration.ts`: миграция кандидата
  `apps/webapp/db/drizzle-migrations/20260911T211321_tests_recommendations_platform_ownership.sql`
  не содержит ни `GRANT`, ни `REVOKE` (`grep -niE 'grant|revoke'` пуст); по всему
  `apps/webapp/db/migrations/` совпадений нет.

## 5. Live-proof честен, но живая проверка ПЛАНА сегодня невыполнима

`RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB=1 node --test …devDbProof.test.mjs` → **6/6 PASS**.

Своя матрица инъекций политик — **убито 4 из 4**, счёт мой, не ведущего:

| `S0B_PLATFORM_POLICY_FAULT` | Результат | Что именно покраснело |
|---|---|---|
| `using_true` | 3 FAIL | чужая строка стала видна; corrupt-платформенная строка стала видна; унаследованная роль получила доступ |
| `for_all` | 1 FAIL | врач получил запись в платформенный слой |
| `omit_org_null` | 1 FAIL | `organization_id IS NULL` ушёл из границы |
| `omit_current_user` | 1 FAIL | доступ утёк за пределы рантайм-роли `app_staff` |

**ОДНАКО.** Тест воссоздаёт четыре политики внутри своих транзакций именно потому, что на живой базе их
нет. Замер:

```sql
SELECT c.relname, p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE p.polname LIKE 'rev10_platform_lfk_read%';
-- lfk_exercise_load_types|…_98   lfk_exercise_media|…_99
-- lfk_exercise_regions|…_100     lfk_exercises|…_101
```

Живы четыре политики **S0а**. Четыре политики **S0б** (`…_76` на `clinical_test_regions`, `…_163` на
`recommendation_regions`, `…_164` на `recommendations`, `…_205` на `tests`) в артефакте
`privileges.bcb_webapp_dev.sql` объявлены, а в `pg_policy` их **нет**.

Следствие, которое нельзя обойти молчанием: **врач на DEV сегодня не увидит ни одного платформенного теста
и ни одной платформенной рекомендации ни при каком тарифе**, потому что читать их нечем. Строка плана
«Живая проверка: то же, но для платформенного теста и платформенной рекомендации» невыполнима до
применения этих политик. Ведущий применил точечными командами только ГРАНТЫ; политики — нет.
Это не дефект `fb046e96e` (тот чинил запись, а не чтение) и не новый скоуп — это тот же
`S0б-5 → BLOCKED` предыдущего аудита, но теперь он блокирует уже саму приёмку этапа, а не только
`reconcile`. **Галочки S0б ставить нельзя, пока политики не легли на DEV и владелец не прошёл каталог
глазами.**

## 6. Красное, что пришло не от кандидата

`node --test deploy/postgres/privileges/relation-access.test.mjs` → **41 pass / 3 fail**:

```
not ok 9  - ON CONFLICT seams grant SELECT only on their exact arbiter columns
            → TypeError: Cannot read properties of undefined (reading 'relationSurfaces')
not ok 24 - clinic-owner mutation grants include every default column emitted by Drizzle inserts
            → отсутствует 'locations_json' (карточки специалиста)
not ok 26 - billing relations use the clinic, platform, and webhook worker roles …
```

Проверено подменой: после `git checkout feat/doctor-ui-rebuild -- declaration.ts clinicalTests.ts
recommendations.ts relation-access.test.mjs` те же **3 fail** — значит красное живёт на `feat` и без
кандидата. Файлы восстановлены (`git status` пуст). Ни одна из трёх не касается четырёх отношений S0б;
пин `public.tests` с `owner_kind`, добавленный кандидатом, проходит. Это **не FAIL S0б**, но это красный
merge-gate на интеграционной ветке — вопрос владельцу/ведущему, не работа этого этапа.

Точечный vitest на коррекцию ведущего `36af599dc`:
`vitest run src/app/api/doctor/clinicalTestsBuiltInProgram.route.test.ts` → **5/5 PASS**.

## Вопросы владельцу (не FAIL)

1. **Новый храповик слеп ровно к тому же классу, что чинил — на один стол левее.** Перепись берёт колонки
   из drizzle-схемы webapp, поэтому таблицы, которых в ней нет, гейт не видит вообще: `if (!columns)
   continue`. Таких ACTIVE-таблиц **6**; из них **4** реально несут `organization_id` в живой базе
   (`broadcast_drafts`, `clinic_dedicated_bot_bindings`, `patient_comorbidity`, `system_settings_audit`), а
   у `public.system_settings_audit` при этом **нет `org: true`** — то есть инвариант арендной стены её
   молча пропускает прямо сейчас, и ни один гейт не красный. Доказано инъекцией: снятие `org: true` у
   `public.broadcast_drafts` оставляет весь файл **6/6 PASS**. Строки плана под это нет — работой не делаю.
2. **Заморозка снимается дописыванием в неё.** Храповик запрещает НОВОЕ расхождение, но не мешает автору
   внести новую таблицу прямо в `ORG_FLAG_CENSUS_BASELINE` и получить зелёный. Защищены явным списком
   только пять каталожных отношений. Нужен ли запрет на рост самой заморозки — решение владельца.
3. **30 таблиц с `organization_id` без `org: true`** уже вынесены ведущим в `EXERCISE_STORE_PLAN.md` §7 —
   подтверждаю замером, что их ровно 30 и список точен. Это не работа магазина упражнений.
4. **Красный `relation-access.test.mjs` на `feat`** (§6) — чужой дрейф, но он стоит на пути любого merge.
5. **Применение четырёх политик S0б на DEV** (§5) — без него приёмку этапа владельцем провести нельзя.

## Уборка — счётом, не словом

Фикстуры, созданные живым HTTP, удалены; счёт до и после:

```
BEFORE_tests|1   BEFORE_recs|2   BEFORE_ct_regions|0   BEFORE_rec_regions|1
AFTER_tests|0    AFTER_recs|0    AFTER_ct_regions|0    AFTER_rec_regions|0
AUDIT_PROBE_RESIDUE|0        (строки rollback-проб и временная «чужая» клиника)
PLATFORM_ROWS_LEFT|0         (платформенных строк в tests/recommendations не оставлено)
audit_roles|0                (временных ролей нет)
platform_s0b_policies_live|0 (аудит политик НЕ применял — состояние базы не изменено)
owner_checks|4               (четыре owner-CHECK на месте)
```

Инъекции в `declaration.ts` откатаны: `git status --short` пуст, `git diff` — 0 байт, файл побайтно
совпадает с копией до первой инъекции. Свой dev-сервер остановлен, `:5277` не слушает; общий DEV `:5200`
держит тот же `pid=3930698`, что и до аудита. Все команды к БД шли одним адресом:
`-h /var/run/postgresql -p 5432 -d bcb_webapp_dev`. К `bersoncarebot_test`, `therapysto_prod` и удалённым
хостам обращений не было.

## Tally

**Убито 7 / непойманных 1.**

Убито: четыре инъекции политик (`using_true`, `for_all`, `omit_org_null`, `omit_current_user`); снятие
`org: true` у `public.tests`; снятие `owner_kind` из обоих INSERT-грантов `public.tests`; живой
`REVOKE INSERT(owner_kind)` — положительный контроль, доказавший, что грант несущий, а не украшение.

Непойманное (1): снятие `org: true` у таблицы, которой нет в drizzle-схеме webapp
(`public.broadcast_drafts`) — весь `tenant-predicate-invariant.test.mjs` остаётся **6/6 PASS**. Строки
плана под это нет, поэтому это вопрос владельцу №1, а не FAIL кандидата.

## НЕ ПРОВЕРЕНО

- **Живая проверка плана S0б не выполнялась и сегодня невыполнима:** четырёх `FOR SELECT`-политик
  платформенного чтения на DEV нет (§5), платформенных строк в `tests`/`recommendations` — ноль.
  Ни платформенного теста, ни платформенной рекомендации врач в живом интерфейсе увидеть не мог.
- **Тарифный рубильник `exercise_catalog` живьём не переключался** — по той же причине: обе стороны
  переключателя дали бы пустой результат, наблюдаемой разницы нет. Доказан переписью 19 вызовов и
  предикатом портов, не живым кликом.
- **Экраны врача не смотрел.** Автоматизированных UI-тестов в репозитории нет (§10a), а браузерного
  прохода я не делал: проверялись HTTP-маршруты. Про внешний вид каталога ничего не утверждаю.
- **Путь записи `clinical_test_regions` живым HTTP не пройден** — регионы клинического теста ставит
  server action формы врача, отдельного маршрута нет. Доказан гейтом покрытия, rollback-пробами и
  живым `SELECT` регионов при чтении и архивации теста (200).
- **`reconcile-access.mjs` не запускался** — чужой дрейф `app.read_booking_payment_check(uuid)` из
  неприземлённой `bcb-wt-cold-source`, реконсиляция откатывается целиком.
- **Полный `pnpm run ci` не гонялся.** Продуктовое дерево аудитом не менялось; прогнаны точечные гейты,
  перечисленные выше. Три красных теста `relation-access.test.mjs` — состояние `feat` до кандидата (§6).
- **TEST и PROD не читались и не менялись.**
