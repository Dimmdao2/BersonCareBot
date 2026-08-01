# Исследование: каждый пункт плана — так это делают в мире или мы изобретаем?

> **Заказ владельца, 01.08:** «пройдись по всем пунктам плана и запусти агента на поиск информации — так это
> делается или нет». Причина: «ты же строишь систему безопасности — ты вообще КАЖДЫЙ свой шаг должен
> проектировать по проверенным канонам».
>
> **Что это за документ.** Отчёт об исследовании ВНЕШНЕЙ практики. Ничего не меняет: ни код, ни планы, ни
> гейты. Правку планов делает лид. Задач не заводит, сроков не называет, трудозатрат не оценивает.
>
> **Метод.** Десять независимых агентов с веб-поиском, по одному на приоритетный пункт плюс один сводный.
> Каждому задано: ссылка на каждое утверждение; форумный ответ и статья-пересказ источником не считаются;
> приоритет материалу 2024–2026; расхождение между источниками называть, а не сглаживать. Раздел
> «НЕ СДЕЛАНО» есть в каждой секции — это то, что агент не смог подтвердить первоисточником.
>
> **Прогон:** `research-plan-canon`, клон `bcb-wt-docs3`, ветка `wt/plan-canon-research`, 01.08.2026.
>
> **Планы:** [`TEST_SUITE_AUDIT_2026-07-29.md`](../../TEST_SUITE_AUDIT_2026-07-29.md) (блоки Б, В, И),
> [`SINGLE_ENTRY_CLEANUP_2026-08-01.md`](../../SINGLE_ENTRY_CLEANUP_2026-08-01.md) (Ч1–Ч6).

## Главный вывод

**Ни один открытый пункт плана не является чистым изобретением.** У каждого нашлась внешняя опора с именем.
Это хорошая новость, но не повод расслабиться: изобретения обнаружились не в пунктах, а **в обоснованиях
внутри пунктов** — там, где мы сослались на то, чего нет, или взяли инструмент под проблему, которой у нас нет.

Пять таких мест, по убыванию цены ошибки:

1. **В5 — ссылка на «черновик IETF» больше не действительна.** `draft-ietf-httpapi-idempotency-key-header`
   **истёк 18.04.2026** на ревизии -07, номера RFC нет, в активных документах рабочей группы его нет. Норма
   здесь — де-факто стандарт Stripe, который черновик пытался записать. Механика наша правильная, ссылка — нет.
2. **В5 — transactional outbox у нас, скорее всего, лишний слой.** Outbox решает dual write между **разными**
   системами. Наша очередь лежит в **той же** PostgreSQL, что и бизнес-данные, — значит гарантия «сообщение
   есть ⟺ данные закоммичены» получается бесплатно одним `INSERT` в той же транзакции. Формулировка DBOS:
   «the "outbox" is DBOS's own queue table». Отдельная outbox-таблица с релеем добавила бы ещё одно место,
   где теряются сообщения.
3. **В6 — слово «дедуплицируются» противоречит канону здравоохранения.** HL7 FHIR `$merge`: проигравшая
   запись **не удаляется**, она получает `inactive` + `replaced-by`; ссылки перенаправляются (SHALL), но сами
   клинические записи не сливаются. И отдельно: **обратимость слияния (unmerge) — нормативное SHALL-требование**
   ISO 21089:2018 / HL7 EHR-S FM, которого в нашем пункте нет вообще.
4. **В8 — «канонический UUID пациента один на две клиники» расходится с FHIR.** Там logical id уникален
   *в пределах одного сервера* и межорганизационным идентификатором не является; тождество человека выражается
   business identifier'ом и `Patient.link`. Общий дереференсимый ключ поперёк тенантов — это ровно тот объект,
   против которого написан ASVS 8.4.1.
5. **Б1 — «эталон + миграции поверх» это норма (так делает Rails), но наше ОБОСНОВАНИЕ — не норма.** У Rails
   дамп схемы — *производный* артефакт, генерируемый из миграций, поэтому «эталон» и «миграции с нуля»
   тождественны по построению. У нас эталон несёт то, чего в миграциях нет (`platform_users`). Это не паттерн,
   это зафиксированный дрейф.

И одна находка в обратную сторону — **мы переоткрыли практику, у которой есть имя с 1972 года**: «слепой
список поломок, составленный тем, кто не читал тесты» — это **error seeding / bebugging** (H. D. Mills, IBM,
1972), выполненный в режиме независимости **IV&V** (NASA SWE-141: technical, managerial and financial
independence). Блок М построен верно, но с нуля.

## Сводная таблица по пунктам

Легенда: **совпадает** — делаем как канон; **вариант** — цель канонична, реализация или обоснование
отклоняются; **изобретение** — внешней опоры нет.

| Пункт | Практика (короткое имя) | Вердикт | Ключевой источник |
|---|---|---|---|
| **Б1** одноразовая PostgreSQL | template+clone (PostgreSQL), `pg_tmp`, schema-load вместо replay (Rails) | вариант | [PostgreSQL Template Databases](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html), [Rails Guides](https://guides.rubyonrails.org/testing.html) |
| **Б2** fail-closed генератор эталона | push protection с названной причиной обхода; `atlas migrate lint` | вариант | [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) |
| **Б3** ревизия 22 файлов | test discovery config; «удалять по названному диагнозу» | вариант | [Vitest include](https://vitest.dev/config/include), [Google TotT 2015](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html) |
| **Б4** калибровка стоимости | латентность тестов как проектный параметр; DORA lead time | вариант | [SWE at Google, гл. 11](https://abseil.io/resources/swe-book/html/ch11.html) |
| **В1** стены арендатора | negative-path матрица (WSTG-ATHZ-02), PARC (Cedar), pgTAP, Back Door Verification | вариант | [ASVS 5.0 §8.4.1](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md), [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| **В2** сессии и одноразовые коды | global sign-out; single-use code; consecutive-attempt limit; purpose binding | **совпадает** | [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html), [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) |
| **В3** провижининг и приглашения | одноразовый истекающий токен; транзакционный провижининг | **совпадает** | [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) |
| **В4** деньги и вебхуки | append-only ledger + двойная запись; two-phase transfer; блокировка + идемпотентность | вариант | [Square Books](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/), [TigerBeetle](https://docs.tigerbeetle.com/coding/two-phase-transfers/) |
| **В5** очередь и идемпотентность | `FOR UPDATE SKIP LOCKED`; lease+heartbeat; at-least-once; Stripe-ключи | вариант | [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html), [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys) |
| **В6** удаление и слияние | redaction вместо delete; `Patient.link` + `replaced-by`; unmerge как SHALL | вариант | [FHIR R5 `$merge`](https://www.hl7.org/fhir/R5///patient-operation-merge.html), [NIST SP 800-88r2](https://csrc.nist.gov/pubs/sp/800/88/r2/final) |
| **В7** запись и пакеты | `EXCLUDE USING gist` + `btree_gist`; CHECK на неотрицательный баланс | **совпадает** | [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) |
| **В8** медиа и целостность карточки | BOLA; 404 как «MAY hide existence»; статус вместо NULL | вариант | [RFC 9110 §15.5.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.4), [FHIR Security](https://hl7.org/fhir/security.html) |
| **В9** ветки `requireRole` | RBAC: полномочие только из явного назначения | **совпадает** | [NIST RBAC / INCITS 359](https://csrc.nist.gov/projects/role-based-access-control/faqs) |
| **В9б** стена у данных | **complete mediation** (Saltzer & Schroeder, 1974); FORCE RLS как референс-монитор | вариант *(мы сильнее канона)* | [Saltzer & Schroeder](https://www.cs.virginia.edu/~evans/cs551/saltzer/) |
| **В9в** два предиката в один | CWE-561 Dead Code; parse-don't-validate | **совпадает** | [CWE-561](https://cwe.mitre.org/data/definitions/561.html) |
| **В10** media-worker одним швом | risk-based testing (ISTQB); prefix-per-tenant + versioning | **совпадает** | [ISTQB FL §5.2](https://astqb.org/5-2-risk-management/), [AWS SaaS Factory](https://aws.amazon.com/blogs/apn/partitioning-and-isolating-multi-tenant-saas-data-with-amazon-s3/) |
| **И1** тест по плану, не по коду | specification-based testing; **test oracle problem** | **совпадает** | [ISTQB glossary](https://istqb-glossary.page/specification-based-test-technique/), [Barr et al., IEEE TSE 2015](https://ieeexplore.ieee.org/document/6963470/) |
| **И2** закрытие числом | **error seeding / bebugging** (Mills, 1972) + **IV&V** | **совпадает (переоткрытие)** | [NASA SWE-141](https://swehb.nasa.gov/display/SWEHBVC/SWE-141+-+Software+Independent+Verification+and+Validation), [Google ICSE-SEIP 2018](https://research.google/pubs/state-of-mutation-testing-at-google/) |
| **И3** стоп по целевому состоянию | strangler fig; deprecation с владельцем | вариант | [Fowler, StranglerFig](https://martinfowler.com/bliki/StranglerFigApplication.html), [SWE at Google, гл. 15](https://abseil.io/resources/swe-book/html/ch15.html) |
| **И4** контракт шва | consumer-driven contract testing (Pact) / BDCT; AsyncAPI | вариант | [docs.pact.io](https://docs.pact.io/), [pactflow BDCT](https://pactflow.io/bi-directional-contract-testing/) |
| **Ч1** валидация загрузок | аллоулист + magic bytes + переименование + вне webroot | **совпадает** | [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) |
| **Ч2** выдача медиа | «implement once and reuse»; fitness function, роняющая сборку | **совпадает** | [OWASP Top 10:2025 A01](https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/), [OWASP Authorization CS](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) |
| **Ч3** одна точка постановки работ | «один интерфейс — много бэкендов» (Active Job); транзакционная постановка | **совпадает** | [Rails Active Job](https://guides.rubyonrails.org/active_job_basics.html), [River](https://riverqueue.com/docs/transactional-enqueueing) |
| **Ч4** настройки и квоты | PDP/PEP: одна точка принятия решения | вариант | [NIST glossary: PDP](https://csrc.nist.gov/glossary/term/policy_decision_point), [OPA](https://www.openpolicyagent.org/docs) |
| **Ч5** импорты мимо DI | fitness function + храповик; Node `"exports"` / Go `internal/` как конструкция | вариант | [Node packages](https://nodejs.org/api/packages.html), [ArchUnit FreezingArchRule](https://www.archunit.org/userguide/html/000_Index.html) |
| **Ч6** настройки не декорация | flag debt: code references + рантайм-телеметрия; inversion of decision | вариант | [LaunchDarkly code references](https://launchdarkly.com/docs/home/flags/code-references), [Fowler/Hodgson](https://martinfowler.com/articles/feature-toggles.html) |

### Что из этого — готовое, и строить не надо

Отдельный список, потому что он самый практичный: у семи пунктов уже существует инструмент, реализующий
ровно то, что мы собирались написать сами.

| Наша задумка | Что уже есть |
|---|---|
| храповик замороженных обходов (Ч5) | **ESLint bulk suppressions** (v9.24.0, апр. 2025) с `--prune-suppressions`; **dependency-cruiser** `depcruise-baseline --ignore-known`; семантика «только уменьшаться» — у **ArchUnit `FreezingArchRule`** |
| гейт «обход не компилируется» (Ч2, Ч5, В9б) | **Node `"exports"`** → `ERR_PACKAGE_PATH_NOT_EXPORTED` (прямой TS-аналог Go `internal/`) |
| «две сборки дают одинаковую схему» (Б1) | **`prisma migrate diff --exit-code`**, **Atlas drift detection**, **migra** |
| «настройка без потребителя» (Ч6) | **`ld-find-code-refs`** (скан ключей) + счётчик обращений через единую точку чтения; **knip** для мёртвых экспортов |
| «застрявшая строка восстанавливается» (В5) | lease+sweep у **graphile-worker** (4 ч / подметание 8–10 мин), heartbeat у **Solid Queue** (5 мин) и **Oban Lifeline** |
| «повтор возвращает сохранённый результат» (В5) | схема таблицы и коды ответов из **brandur.org/idempotency-keys** и **Shopify Engineering** |
| «конкурентная запись без наложения» (В7) | **`EXCLUDE USING gist (resource_id WITH =, period WITH &&)`** — движок, а не код |

---

## Б1 — одноразовая PostgreSQL для тестов

### ВОПРОС ВЛАДЕЛЬЦА: шаблон+клон / testcontainers / транзакция-откат / схема на прогон?

**Прямой ответ: это не четыре альтернативы, а два разных вопроса, и в постановке они смешаны.**

- `testcontainers` отвечает на вопрос **«откуда взять работающий сервер PostgreSQL»**;
- «шаблон+клон», «схема на прогон», «транзакция-откат» отвечают на вопрос **«как привести состояние БД к чистому перед каждым тестом»**.

Отраслевой мейнстрим 2024–2026 — это **комбинация**: один контейнер/кластер на прогон + `CREATE DATABASE ... TEMPLATE` клон на тест (или на воркер).

**Ранжирование под наши ограничения** (реальный RLS, несколько соединений, конкурентность/`SKIP LOCKED`, Docker не гарантирован, схема течёт еженедельно):

1. **Шаблон + клон на тест** — единственный вариант, дающий и реальные отдельные соединения, и стоимость подготовки ~10–100 мс. Победитель.
2. **Своя БД на воркер** — то, что Rails и pytest-django делают официально; грубее по изоляции внутри воркера, но проще. Достойный запасной.
3. **Testcontainers** — был бы дефолтом, но **требует Docker-совместимый рантайм**; у нас его нет по условию. Внутри контейнера всё равно применяют пункт 1.
4. **Транзакция с откатом** — **дисквалифицирована документацией** для RLS-через-разные-соединения, конкурентности и `SELECT ... FOR UPDATE`.

#### (a) Template database + `CREATE DATABASE ... TEMPLATE`

Официальная документация PostgreSQL, раздел «Template Databases» — механизм встроенный и штатный: «`CREATE DATABASE` works by copying an existing database… Thus that database is the "template" from which new databases are made». Есть флаги `datistemplate` и `datallowconn` в `pg_database`. https://www.postgresql.org/docs/current/manage-ag-templatedbs.html

**Документированный лимит №1 — соединения к шаблону.** Там же дословно: «The principal limitation is that no other connection exists when it starts; during the copy operation, new connections to the source database are prevented. `CREATE DATABASE` will fail if any other connection exists when it starts.» То есть **пул соединений к шаблону обязан быть закрыт перед каждым клоном** — это главный практический подвох Б1.

**Лимит №2 — стоимость пропорциональна объёму.** Копирование постранично (8 КБ); в PG 15+ появился `STRATEGY` (`WAL_LOG` по умолчанию vs `FILE_COPY`). https://www.postgresql.org/docs/current/sql-createdatabase.html

**Именованные пользователи техники:**
- **pgtestdb** (Peter Downs, Go) — «quickly run tests in their own temporary, isolated, postgres databases»; миграции хешируются и прогоняются один раз на все тесты и даже между прогонами. https://github.com/peterldowns/pgtestdb
- **Brandur Leach** (инженерный блог, замеры 2026): клон из шаблона — **98.4 мс**, «create + migrate schema» — **99.4 мс**, то есть сами по себе сопоставимы; выигрыш 3.5× дал **пул готовых схем** (переиспользование, а не создание с нуля). https://brandur.org/fragments/pgtestdb — важный контрапункт: **сам по себе шаблон не быстрее миграций, если миграций мало; он выигрывает, когда цепочка миграций длинная.**
- **pg_tmp / ephemeralpg** (Eric Radman, v3.4, обновление 11.07.2025) — «a compact shell script designed to make unit testing, integration testing with PostgreSQL easy in any language»: `initdb` + `pg_ctl`, fsync off, предсоздание БД в фоне, асинхронная остановка. **Это прямой прецедент нашего «свой кластер через initdb без Docker и без sudo».** http://eradman.com/ephemeralpg/
- **Django** — `--keepdb`: «preserves the test database between test runs. It skips the create and destroy actions which can greatly decrease the time to run tests». https://docs.djangoproject.com/en/5.2/topics/testing/overview/
- **Neon** — брэнчинг как «шаблон+клон» на уровне SaaS: ветка на каждый CI-прогон/PR, автоудаление. https://neon.com/docs/introduction/branching
- **Prisma** — shadow database: временная БД, «created and deleted automatically each time you run `prisma migrate dev`». https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
- **Atlas (ariga.io)** — «dev database»: «a temporary, isolated database instance that Atlas uses as a sandbox to simulate the real environment». https://atlasgo.io/concepts/dev-database

#### (b) Testcontainers

- Официальный ринг **Adopt** в ThoughtWorks Technology Radar; впервые Assess — ноябрь 2019, переведён в Adopt — **март 2022**: «We've had enough experience with Testcontainers that we think it's a useful default option for creating a reliable environment for running tests». https://www.thoughtworks.com/radar/languages-and-frameworks/testcontainers — **да, это дефолт отрасли с 2022 года.**
- **Жёсткое требование:** «a Docker-API compatible container runtime, such as using Testcontainers Cloud or installing Docker locally». https://testcontainers.com/getting-started/
- Официальный модуль PostgreSQL есть и для Java (https://java.testcontainers.org/modules/databases/postgres/), и для Node/TS — `@testcontainers/postgresql` (https://node.testcontainers.org/modules/postgresql/).
- **Snapshot/Restore для Postgres — подтверждено**, добавлен в testcontainers-go **v0.32.0** и есть в Node-модуле: «individual tests very modular, since they always run on a brand-new database» без пересоздания контейнера. Документированное ограничение: «You should never pass the `'postgres'` system database as the container database name if you want to use snapshots». https://golang.testcontainers.org/modules/postgres/
- **Reusable containers** — официально **экспериментальны**: «Reusable Containers is still an experimental feature and the behavior can change… Reusable containers are not suited for CI usage». https://java.testcontainers.org/features/reuse/

#### (c) Транзакция на тест с откатом — **дисквалифицирована для нас, и это цитируется**

- **Rails** (официальный гайд): «By default, Rails automatically wraps tests in a database transaction that is rolled back once completed». https://guides.rubyonrails.org/testing.html
- **Django** (официальный гайд, 5.2) — прямо объясняет, где откат недостаточен: «A consequence of this, however, is that some database behaviors cannot be tested within a Django `TestCase` class… **you cannot test that a block of code is executing within a transaction, as is required when using `select_for_update()`. In those cases, you should use `TransactionTestCase`**». https://docs.djangoproject.com/en/5.2/topics/testing/tools/

**Прямое приложение к нашему случаю:** `SELECT ... FOR UPDATE SKIP LOCKED` при конкурентном погашении, RLS-проверки с разных соединений под разными ролями и любые сценарии с реальным `COMMIT` — это ровно тот список, который Django официально выносит за пределы транзакционных тестов. Значит **откат-на-тест у нас не кандидат вообще**, а не «менее удобный кандидат».

#### (d) Свежая схема / свежая БД на прогон или на воркер

- **Rails, параллельные тесты (официальный гайд):** Active Record сам создаёт БД и грузит схему **для каждого процесса**; имена получают суффикс номера воркера (`test-database-0`, `test-database-1`). https://guides.rubyonrails.org/testing.html
- **pytest-django:** «By default, each xdist process gets its own database to run tests on. This is needed to have transactional tests that do not interfere with each other»; плюс `--reuse-db`. https://pytest-django.readthedocs.io/en/latest/database.html
- **Vitest** (наш раннер, официальный гайд): `forks` — дефолтный пул, «forks (the default) and vmForks run each file in a separate child process», файлы идут параллельно. https://vitest.dev/guide/parallelism — то есть **у нас параллелизм по файлам включён по умолчанию, и БД-на-файл/БД-на-воркер обязателен**.
- Схема-вместо-БД: схемы **нельзя клонировать**, поэтому миграции приходится гонять каждый раз; зато можно смотреть состояние упавшего теста и тестировать `LISTEN/NOTIFY`. https://brandur.org/fragments/pgtestdb

### Источник схемы: эталон + миграции поверх — норма или запах?

**Ответ раздвоенный: «эталон вместо проигрывания миграций» — это канон; «эталон, потому что цепочка миграций не самодостаточна» — это запах.**

**Канон за эталон (Rails, дословно):**
- «In order to run your tests, your test database needs the current schema. The test helper checks whether your test database has any pending migrations. **It will try to load your `db/schema.rb` or `db/structure.sql` into the test database**». https://guides.rubyonrails.org/testing.html
- «**It tends to be faster and less error prone to create a new instance of your application's database by loading the schema file via `bin/rails db:schema:load` than it is to replay the entire migration history**». Для PostgreSQL `structure.sql` генерируется именно `pg_dump`. https://guides.rubyonrails.org/active_record_migrations.html

**Ключевое отличие от нашего плана.** У Rails `structure.sql` — **производный артефакт**: он получается `pg_dump`-ом БД, построенной миграциями, и регенерируется при каждой миграции; поэтому «эталон» и «миграции с нуля» тождественны по построению. У нас, по формулировке Б1, эталон **несёт то, чего в миграциях нет** (`platform_users`). Это не «Rails-паттерн», это **дрейф, зафиксированный в артефакте**. Rails такой ситуации не допускает — он ещё и падает при pending migrations.

**Канон за «базовую линию» тоже есть, и он легитимный:**
- **Flyway `baseline`**: «baselines an existing database, excluding all migrations up to and including `baselineVersion`». https://documentation.red-gate.com/flyway/reference/commands/baseline
- **Flyway baselines & consolidations** (Phil Factor, Redgate, 23.02.2021): устаревшие скрипты архивируют и заменяют «the build to the earliest version that you still might conceivably need». https://www.red-gate.com/hub/product-learning/flyway/flyway-baselines-and-consolidations
- **Django `squashmigrations`**: «Squashing is the act of reducing an existing set of many migrations down to one (or sometimes a few) migrations which still represent the same changes». https://docs.djangoproject.com/en/5.2/topics/migrations/

То есть **свернуть длинную цепочку в снимок + догоняющие миграции — признанная практика**. Но во всех трёх случаях снимок **эквивалентен** проигрыванию свёрнутых миграций; он не добавляет объектов, которых миграции не создают.

**Есть и противоположная позиция — Fowler/Sadalage, «Evolutionary Database Design»** (Pramod Sadalage, Martin Fowler; оригинал 2003, переписано 05.2016): «All database changes are migrations», каждый разработчик пересобирает свою БД **прогоном всей последовательности миграций**. https://martinfowler.com/articles/evodb.html — **чей контекст ближе нам:** Fowler описывает идеал (самодостаточная цепочка + личная БД), Rails описывает прагматику (грузить дамп). Нам ближе Rails по механике и Fowler по требованию к самодостаточности.

**«Две сборки дают одинаковую схему» — да, это именованная практика, drift detection / schema diff in CI:**
- **Prisma**: `migrate diff --exit-code` — «Change the exit code behavior to signal if the diff is empty or not (Empty: 0, Error: 1, Not empty: 2)»; механика Prisma дословно наша: «Reruns the current, existing migration history in the shadow database → Introspects → Compares → Reports schema drift». https://www.prisma.io/docs/orm/reference/prisma-cli-reference , https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
- **Atlas**: «Database schema drift happens when the target database diverges from the source of truth: the version-controlled schema and migration files your code was written against». https://atlasgo.io/versioned/drift-detection
- **migra** — «compares two PostgreSQL database schemas and generates the SQL migration script» (оригинал deprecated 2024, поддерживается форк). https://github.com/postgresql-tools/migra
- **squawk** — линтер миграций Postgres для CI (опасные блокировки, деструктив). https://squawkhq.com/docs/

**Вывод:** «эталон + миграции поверх» — норма **при условии**, что в CI стоит гейт «миграции с нуля ≡ эталон». Без такого гейта это именно запах, и наш собственный аргумент («`platform_users` не создаётся ни одной миграцией») — это диагноз сломанной цепочки, а не оправдание.

### Защита от заезда в DEV

**Канон предотвращает это КОНСТРУКЦИЕЙ (имя БД генерирует харнесс), а не проверкой. Assert — вторая линия, а не первая.**

- **Django — эталон «по построению»:** «The default test database names are created by prepending `test_` to the value of each `NAME` in `DATABASES`»; «Regardless of whether the tests pass or fail, the test databases are destroyed when all the tests have been executed». Разработчик **физически не может** указать тестам DEV-базу — префикс навязан фреймворком. https://docs.djangoproject.com/en/5.2/topics/testing/overview/
- **Rails — эталон «assert + окружение»:** `ActiveRecord::ProtectedEnvironmentError` и `config.active_record.protected_environments` — «Lets you set an array of names of environments where destructive actions should be prohibited» (https://guides.rubyonrails.org/configuring.html). Окружение хранится в `ar_internal_metadata`, обход — только явным `DISABLE_DATABASE_ENVIRONMENT_CHECK=1`.
- **pgtestdb / pg_tmp** решают то же ещё жёстче: у теста **вообще нет** доступа к DEV-URL, харнесс выдаёт свой DSN.
- **Инцидентная почва.** Официальный постмортем GitLab (10.02.2017): «Trying to restore the replication process, an engineer proceeds to wipe the PostgreSQL database directory, errantly thinking they were doing so on the secondary. Unfortunately this process was executed on the primary instead.» Их вывод о направлении починки: «Our main focus is to improve disaster recovery, and **making it more obvious as to what host you're using**». https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/

**Как это ложится на Б1.** Проверка имени БД перед первым запросом — **признанная, но вторичная** мера. Первичная и дешевле — сделать так, чтобы имя нельзя было выбрать: харнесс сам создаёт БД с обязательным префиксом и сам отдаёт DSN, а чтение `DATABASE_URL` из окружения в тестовом пути **запрещено**.

### Вердикт: **вариант**

Б1 — корректная сборка из четырёх независимо канонических кусков (шаблон+клон из документации PostgreSQL, свой `initdb`-кластер как у `pg_tmp`, эталонная схема вместо проигрывания миграций как у Rails, защита имени БД как у Django/Rails), собранная нестандартно только потому, что у нас нет Docker; изобретение здесь одно — **оправдание эталона тем, что цепочка миграций сломана**, и это не практика, а диагноз.

Что необычно и что обычно:
- **Свой кластер через `initdb` без Docker — необычно, но не изобретение:** ровно это делает `pg_tmp` (v3.4, 2025). Обычное — Testcontainers (ThoughtWorks Adopt, март 2022), и его отсутствие у нас надо признать вынужденным, а не выбранным.
- **Шаблон + клон — прямо документированный механизм PostgreSQL**, не хак.
- **Эталонный дамп для тестов — прямая рекомендация Rails**, но там дамп генерируемый.

### Что практика предлагает вместо (и почему это дешевле/прочнее)

1. **Гейт дрейфа вместо декларации «эталон разрешён».** `prisma migrate diff --exit-code` / `atlas migrate diff` на dev-database / `migra`. Дешевле, потому что превращает «мы верим, что эталон совпадает с миграциями» в бинарный красный CI, и заодно даёт список того, что нужно дописать в миграции, чтобы `a0-greenfield` стал производным артефактом (как `structure.sql` у Rails), а не отдельным источником истины.
2. **Имя по построению вместо проверки имени.** Django-механика (`test_`-префикс навязан) прочнее, потому что не зависит от того, вызвал ли конкретный тест проверку.
3. **Явно закрывать пул перед клоном.** Документация PostgreSQL: «`CREATE DATABASE` will fail if any other connection exists when it starts». Без этого клон будет флакать ровно в тот момент, когда шаблон прогрет.
4. **Пул готовых клонов, а не создание по запросу.** Замер Brandur: клон 98.4 мс ≈ миграции 99.4 мс, но переиспользование готовых баз дало **3.5× по всему сьюту**. Если гнаться за скоростью — оптимизировать надо это, а не сам клон.
5. **БД на воркер как обязательный минимум под Vitest.** Vitest по умолчанию `forks`, файл = отдельный процесс, параллельно. Одна общая тестовая БД под параллельным Vitest — гарантированный флак.
6. **КРИТИЧНО для наших RLS-тестов (в Б1 не упомянуто).** Документация PostgreSQL: «Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system when accessing a table. **Table owners normally bypass row security as well**, though a table owner can choose to be subject to row security with `ALTER TABLE ... FORCE ROW LEVEL SECURITY`». В харнессе, который сам делает `initdb`, коннект по умолчанию — суперпользователь-владелец, то есть **RLS-тесты будут зелёными, ничего не проверяя**. Обязательны: отдельные непривилегированные роли для теста + `FORCE ROW LEVEL SECURITY`. Также: «Referential integrity checks… always bypass row security». https://www.postgresql.org/docs/current/ddl-rowsecurity.html
7. **Если Docker когда-нибудь появится — не переписывать, а обернуть.** Testcontainers + snapshot/restore даёт ту же семантику; заодно снимается «trusted binaries» и версия сервера фиксируется образом.

### НЕ СДЕЛАНО (Б1)

- **Нет рецензируемых данных (IEEE/ACM) по стоимости сьютов с реальной БД.** Найдены только замеры из инженерных блогов. **Количественную часть считать слабой.**
- **Не найдено официального документа, который называет «эталонный дамп + миграции поверх» анти-паттерном по имени.** Вывод «запах» построен на косвенном: Rails требует отсутствия pending migrations и генерирует дамп из миграций; Prisma/Atlas называют расхождение `drift`. Прямой цитаты «так делать нельзя» нет.
- **Java-модуль Testcontainers**: snapshot/restore на его странице не упомянут. Подтверждено только для **Go (v0.32.0)** и **Node**.
- **Страница Supabase «Testing RLS policies» (pgTAP/dbdev) не вычитана дословно.**
- **Официального рецепта «БД на воркер» для Vitest в документации Vitest нет** — есть только механика пулов и `maxWorkers`; перенос практики Rails/pytest-django на Vitest — вывод агента, не цитата.
- **Не искалась** нормативка по медицинским данным (HIPAA/152-ФЗ) в части «дамп живой БД запрещён» — тезис Б1 принят как данность.
- **Не проверялся** `pg_tmp` на пригодность под наши требования (версия PG, поведение без sudo) — только зафиксирован как прецедент.

---

## В1 — стены арендатора

### Как делают в мире

**Уровень СУБД: PostgreSQL сам описывает, чем RLS ломается**

Официальная документация ([PostgreSQL 18, «Row Security Policies», 2025–2026](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)) прямо перечисляет ловушки, которые обязана закрывать проверка:

- «Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system when accessing a table»;
- «Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with `ALTER TABLE ... FORCE ROW LEVEL SECURITY`»;
- «Referential integrity checks… always bypass row security… Care must be taken… to avoid "covert channel" leaks of information through such referential integrity checks»;
- «The only exceptions to this rule are `leakproof` functions… the optimizer may choose to apply such functions ahead of the row-security check».

Канонический **эталон формы теста** — собственный регрессионный тест PostgreSQL [`src/test/regress/sql/rowsecurity.sql`](https://raw.githubusercontent.com/postgres/postgres/master/src/test/regress/sql/rowsecurity.sql): создаются несколько ролей (`regress_rls_alice/bob/carol`), контекст переключается `SET SESSION AUTHORIZATION` / `SET ROLE`, и каждая команда (SELECT/INSERT/UPDATE/DELETE) проверяется отдельно с явной пометкой ожидаемого исхода (`-- fail` / `-- ok`), плюс отдельная «протекающая» функция `f_leak` для проверки утечки через неLEAKPROOF-предикаты. Это буквально матрица «принципал × таблица × операция», написанная разработчиками самой СУБД.

Что политика **не** доказывается ревью, а только исполнением, показывает [CVE-2023-2455 (PostgreSQL, официальная страница безопасности, 2023)](https://www.postgresql.org/support/security/CVE-2023-2455/): «row security policies disregard user ID changes after inlining… a given query is planned under one role and then executed under other roles… Applying an incorrect policy may permit a user to complete otherwise-forbidden reads and modifications». Это ровно наш профиль: один пул соединений, принципал задаётся на запрос, планы переиспользуются.

Академический предел RLS: [Dar, Hershcovitch, Morrison, «RLS Side Channels: Investigating Leakage of Row-Level Security Protected Data Through Query Execution Time», ACM SIGMOD / PACMMoD, 2023](https://dl.acm.org/doi/10.1145/3588943) ([PDF](https://www.cs.tau.ac.il/~mad/publications/sigmod2023-rls.pdf)) — в PostgreSQL и SQL Server атакующий может узнать о существовании чужих строк по времени выполнения index-запросов, включая managed-инстансы в облаке. То есть «строк не видно» ≠ «информации нет».

Практический разбор BYPASSRLS, security-invoker-вью и роли LEAKPROOF — [pganalyze, «5mins of Postgres E28», 2022](https://pganalyze.com/blog/5mins-postgres-row-level-security-bypassrls-security-invoker-views-leakproof-functions).

**Уровень платформ SaaS**

[AWS, «SaaS Tenant Isolation Strategies» (whitepaper, 2020; помечен как historical reference)](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-isolation-mindset.html) формулирует тенеты, из которых растёт наш В1:
- «Authentication and authorization are not equal to isolation… getting beyond the entry points of a login screen or an API does not mean you have achieved isolation»;
- «Isolation enforcement should not be left to service developers… scoping of access to resources should be controlled through some shared mechanism that is responsible for applying isolation rules (outside the view of developers)».
То же в [AWS «SaaS Architecture Fundamentals», tenant isolation, 2022](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html): «a user could be authenticated and authorized, and still access the resources of another tenant».

Именованная категория тестов существует: [AWS APN Blog, Tod Golding, «Testing SaaS Solutions on AWS», 2017](https://aws.amazon.com/blogs/apn/testing-saas-solutions-on-aws) — «Tenant Isolation Testing», реализуемая «through the introduction of test scripts and API calls that attempt to access tenant resources with specific emphasis on simulating attempts to cross-tenant boundaries». Раздел [Tenant Isolation в AWS Well-Architected SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) закрепляет это как обязательный элемент архитектуры.

Прямой аналог нашей схемы на Postgres — [AWS Database Blog, M. Beardsley, «Multi-tenant data isolation with PostgreSQL Row Level Security», 2020](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/): «If your application code connects to the database as the same PostgreSQL role as the table owner… your security policies aren't in effect by default»; «PostgreSQL super users and any role created with the `BYPASSRLS` attribute aren't subject to table policies». Демонстрация там же — это негативная матрица: логин как арендатор 1 → перебором строки арендатора 2 дают **ноль строк**, INSERT падает с нарушением политики, UPDATE/DELETE по чужим строкам возвращают **0 затронутых строк** (не ошибку).

[Azure Architecture Center, «Multitenancy checklist on Azure» (ms.date 2025-04-17)](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/checklist) в разделе Security: «Design for tenant isolation. **Continuously test your isolation model**» и «Ensure that your application code prevents any cross-tenant access or data leakage». При этом Microsoft — **несогласный голос по средству**: [«Architectural approaches for storage and data in multitenant solutions» (ms.date 2025-07-17)](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data) пишет, что RLS «can be complex to design, implement, **test**, and maintain. Many multitenant solutions don't use row-level security because of those complexities».

**Уровень стандартов приложения**

- [OWASP ASVS 5.0 (май 2025), V8 Authorization](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md): **8.4.1 (L2)** «Verify that multi-tenant applications use cross-tenant controls to ensure consumer operations will never affect tenants with which they do not have permissions to interact»; **8.3.1 (L1)** «Verify that the application enforces authorization rules at a trusted service layer»; **8.2.3 (L2)** — field-level (BOPLA).
- [OWASP API Security Top 10 2023, API1: BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/): «**Write tests to evaluate the vulnerability of the authorization mechanism. Do not deploy changes that make the tests fail.**» — прямое требование негативных автотестов в CI.
- [OWASP WSTG, «Testing for Bypassing Authorization Schema» (WSTG-ATHZ-02)](https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/05-Authorization_Testing/02-Testing_for_Bypassing_Authorization_Schema): «For each role: register or generate two users with identical privileges… establish and keep two different sessions active… **for every request**, change the relevant parameters and the session identifier from token one to token two and diagnose the responses» — это и есть матрица «принципал × ресурс × операция», только записанная процедурно. Плюс [WSTG-ATHZ-04 (IDOR)](https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References).
- Матрица как артефакт инструмента: [OWASP ZAP, Access Control Testing add-on](https://www.zaproxy.org/docs/desktop/addons/access-control-testing/) — таблица «контекст × пользователь × URL» со статусами Allowed / Denied / Unknown и алертами 10101/10102 при расхождении.

**Инженерная практика на RLS у названных компаний**

- [Supabase Docs, «Advanced pgTAP Testing»](https://supabase.com/docs/guides/local-development/testing/pgtap-extended) и [«Testing Overview»](https://supabase.com/docs/guides/local-development/testing/overview): смена принципала `tests.authenticate_as()`, привилегированный контекст `tests.authenticate_as_service_role()` для setup, `tests.rls_enabled()` («verify RLS is enabled on **all** tables in the public schema»), позитив `results_eq`/`lives_ok` и негатив `throws_ok('42501', 'new row violates row-level security policy')`. Тесты гоняются и на уровне БД (`supabase test db`), и на уровне приложения (Vitest).
- [pgTAP documentation](https://pgtap.org/documentation.html): `policies_are()`, `policy_roles_are()`, `policy_cmd_is()`, `table_privs_are()`, `column_privs_are()`, `throws_ok()`, `results_eq()`.
- [Nile, «Shipping multi-tenant SaaS using Postgres Row-Level Security», 2022](https://www.thenile.dev/blog/multi-tenant-rls): «We have an extensive suite of integration tests that test **every access pattern** to make sure that nothing ever leaks. The tests spin up a Postgres Testcontainer and call the relevant API endpoints». И там же зафиксирован наш известный отказ: они едва не проглядели, что тесты ходили под пользователем, обходящим RLS — «All we had to do was to make sure our tests were using the newly-created `app_user` that doesn't bypass RLS».
- [Crunchy Data, «Row Level Security for Tenants in Postgres», 2024](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) — образец «сессионная переменная на запрос», но **без** предупреждений про owner/BYPASSRLS/FORCE RLS и без рекомендаций по тестам; принимать как реализацию, не как канон проверки.
- Ловушка пулера: [Citus Data / Microsoft, «PgBouncer now supports more session vars», 2024](https://www.citusdata.com/blog/2024/04/04/pgbouncer-supports-more-session-vars/) — в transaction pooling бэкенд переиспользуется между клиентами, поэтому контекст арендатора ставится только `SET LOCAL` внутри транзакции.
- **Несогласный голос по средству:** [PlanetScale, Josh Brown, «RLS sounds great until it isn't», апрель 2026](https://planetscale.com/blog/rls-sounds-great-until-it-isnt) — против RLS в пользу авторизации в приложении, и прямо называет наш отказ: владельцы таблиц и суперпользователи обходят RLS без `FORCE ROW LEVEL SECURITY`, что создаёт «testing blind spots where production may behave differently than tests».

**Уровень движков авторизации**

- Cedar / [Amazon Verified Permissions «test bench»](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/test-bench.html): запрос строится буквально как **principal + action + resource + context** и «displays the decision to allow or deny the request along with information about the policies satisfied». Модель PARC — это канонизированный AWS тройной ключ, совпадающий с нашим «принципал × организация × операция».
- [Amazon Science, «How we built Cedar with automated reasoning and differential testing», 2023](https://www.amazon.science/blog/how-we-built-cedar-with-automated-reasoning-and-differential-testing) — property-based/differential random testing против модели на Dafny (уровень авторов движка, не прикладной команды).
- [Open Policy Agent, «Policy Testing»](https://www.openpolicyagent.org/docs/policy-testing) — декларативные тесты `test_*` в Rego, `opa test`, включая проверки deny-правил.
- [NIST SP 800-192 «Verification and Test Methods for Access Control Policies/Models», Hu, Kuhn, Yaga, июнь 2017](https://www.nist.gov/publications/verification-and-test-methods-access-control-policiesmodels-0) — государственный канон именно на тему «как верифицировать и тестировать модели доступа» (см. также [анонс CSRC](https://csrc.nist.gov/news/2017/nist-release-sp-800-192)).
- Метаморфное/свойственное тестирование безопасности веб-систем: [«Metamorphic Testing for Web System Security», IEEE TSE, 2023](https://dl.acm.org/doi/abs/10.1109/TSE.2023.3256322) — исследовательская линия, не мейнстрим прикладных команд.

### Признанная форма проверки

Да, форма признана — но она **двухслойная**, и три кандидата не конкурируют, а занимают разные ниши.

**(a) Явная негативная матрица «принципал × ресурс × операция» — это и есть индустриальная форма для прикладной команды.** Она зафиксирована процедурно в [WSTG-ATHZ-02](https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/05-Authorization_Testing/02-Testing_for_Bypassing_Authorization_Schema) («for each role… for every request… swap the session identifier»), материализована как таблица в [ZAP Access Control Testing](https://www.zaproxy.org/docs/desktop/addons/access-control-testing/), названа как отдельная категория в [AWS «Testing SaaS Solutions on AWS»](https://aws.amazon.com/blogs/apn/testing-saas-solutions-on-aws), и в том же виде написана самим PostgreSQL в [`rowsecurity.sql`](https://raw.githubusercontent.com/postgres/postgres/master/src/test/regress/sql/rowsecurity.sql).

**(b) Декларативные тесты политик — форма для слоя политик, и она не заменяет (a).** pgTAP `policies_are()/policy_cmd_is()` доказывает, что политика **существует и такой формы**, а не что она **работает**; поведение всё равно проверяется через смену роли + `results_eq`/`throws_ok` ([Supabase, pgTAP extended](https://supabase.com/docs/guides/local-development/testing/pgtap-extended)). У OPA и Cedar/AVP декларативный тест и есть поведенческий, потому что там политика — вся система решения; у нас политика — только часть пути запроса.

**(c) Property-based / метаморфное тестирование — уровень авторов движка авторизации, не уровень прикладного продукта.** Cedar так проверяют ([Amazon Science, 2023](https://www.amazon.science/blog/how-we-built-cedar-with-automated-reasoning-and-differential-testing)), в академии это [IEEE TSE 2023](https://dl.acm.org/doi/abs/10.1109/TSE.2023.3256322) и [NIST SP 800-192](https://www.nist.gov/publications/verification-and-test-methods-access-control-policiesmodels-0). Разумный дешёвый след этой линии для нас — не «генерировать входы», а **генерировать саму матрицу из схемы** (перебор всех таблиц × всех команд), как это делает `tests.rls_enabled()` для «всех таблиц схемы».

**Негативные тесты («чужой арендатор не получает ничего») — обязательны, это явно написано, а не выведено:** [OWASP API1 2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) («Do not deploy changes that make the tests fail»), [ASVS 5.0 §8.4.1](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md), [Azure multitenancy checklist, 2025](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/checklist) («Continuously test your isolation model»).

**Отдельное соединение для подтверждения финального состояния.** Специального отраслевого термина «verification connection» для мультиарендности не нашлось. Но у практики есть **имя из тестового канона**: это *Back Door Verification* / *Back Door Manipulation* из [Gerard Meszaros, «xUnit Test Patterns: Refactoring Test Code», Addison-Wesley, 2007](https://www.pearson.de/media/muster/toc/toc_9780321504807.pdf) (компаньон-сайт: [State Verification](http://xunitpatterns.com/State%20Verification.html)) — состояние SUT проверяется напрямую в БД, минуя «парадную дверь» самого SUT. Реализации в нашей нише: привилегированный контекст `tests.authenticate_as_service_role()` у [Supabase](https://supabase.com/docs/guides/local-development/testing/pgtap-extended) и возврат к суперпользователю между блоками в регрессионных тестах PostgreSQL. Дополнительное, техническое основание именно для **отдельного соединения** (а не `RESET ROLE` в том же): переиспользование бэкендов пулером и утечка GUC между клиентами ([Citus/PgBouncer, 2024](https://www.citusdata.com/blog/2024/04/04/pgbouncer-supports-more-session-vars/)).

**Где вешать проверку — источники расходятся, и это полезно:**
- «Ниже приложения»: [AWS](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-isolation-mindset.html) — «isolation enforcement should not be left to service developers», значит и проверять надо общий механизм (у нас — RLS), а не вызовы.
- «В доверенном сервисном слое»: [ASVS 8.3.1](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md).
- Оба сразу: [Supabase](https://supabase.com/docs/guides/local-development/testing/overview) (pgTAP + Vitest), [Nile](https://www.thenile.dev/blog/multi-tenant-rls) (Testcontainers + вызов реальных API-эндпоинтов).
- Против RLS вообще: [Azure Architecture Center, 2025](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data) и [PlanetScale, 2026](https://planetscale.com/blog/rls-sounds-great-until-it-isnt).

**Чей контекст ближе к нашему:** Supabase и Nile (общая БД Postgres + FORCE RLS + принципал на запрос) — почти точное совпадение; AWS-канон совпадает по принципу, но его реализация опирается на IAM/DynamoDB, а не на RLS; Azure и PlanetScale спорят не с формой проверки, а с выбором RLS как механизма — их аргумент («сложно тестировать, тест может незаметно идти под привилегированной ролью») работает как усиление В1, а не как возражение против него.

**Известный отказ «тест подключается суперпользователем/владельцем таблицы, и RLS молча не применяется» — подтверждён на всех уровнях:** [документация PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [AWS Database Blog, 2020](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/), реальный near-miss у [Nile, 2022](https://www.thenile.dev/blog/multi-tenant-rls), «testing blind spot» у [PlanetScale, 2026](https://planetscale.com/blog/rls-sounds-great-until-it-isnt). Плюс более коварный вариант — правильная роль, но **неправильно применённая политика** при переиспользовании плана между `SET ROLE` ([CVE-2023-2455](https://www.postgresql.org/support/security/CVE-2023-2455/)).

### Вердикт: **вариант**

Каждый элемент В1 существует в каноне по отдельности — матрица «принципал × ресурс × операция» это Cedar PARC и WSTG-ATHZ-02, обязательность негативных путей это ASVS 8.4.1 и API1:2023, «test your isolation model» это Azure-чеклист и AWS Tenant Isolation Testing, подтверждение из отдельного соединения это Back Door Verification, — но канон дополнительно требует двух вещей, которых в формулировке В1 нет: **мета-проверки самого стенда** (под кем он подключён) и **явного выбора слоя** (SQL-политики и/или HTTP-путь запроса).

### Что практика предлагает вместо / чем прочнее

1. **Сначала утверждение о стенде, потом матрица.** До первого «принципал × организация × операция» проверить: `current_user` ≠ владелец таблиц, `rolsuper = false` и `rolbypassrls = false` у роли теста, `relrowsecurity AND relforcerowsecurity = true` для каждой таблицы схемы. Дешевле любой матрицы (несколько строк на весь набор) и закрывает единственный отказ, при котором **вся зелёная матрица ничего не значит** ([PostgreSQL docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [Nile](https://www.thenile.dev/blog/multi-tenant-rls), [PlanetScale](https://planetscale.com/blog/rls-sounds-great-until-it-isnt)).

2. **Матрицу не писать руками, а порождать из каталога.** Перебор `pg_class`/`pg_policies` × {SELECT, INSERT, UPDATE, DELETE} даёт покрытие, которое само себя доказывает и не отстаёт от новых таблиц; аналог — `tests.rls_enabled()` «на все таблицы схемы» у [Supabase](https://supabase.com/docs/guides/local-development/testing/pgtap-extended). Прочнее ручного списка ровно тем, что новая таблица без политики роняет тест сама, без правки теста.

3. **Ассерт на количество, а не на исключение.** Канонический вывод из [AWS Database Blog](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/): чужой SELECT даёт 0 строк, чужой UPDATE/DELETE даёт **0 затронутых строк без ошибки**, и только INSERT/нарушение WITH CHECK даёт `42501`. Тест, ждущий исключения на UPDATE, будет зелёным при полностью отсутствующей политике.

4. **Две точки крепления, не одна.** pgTAP-набор на слое политик + интеграционные тесты, дергающие реальные HTTP-ручки на поднятой БД (Testcontainers), как у [Nile](https://www.thenile.dev/blog/multi-tenant-rls) и в [Supabase Testing Overview](https://supabase.com/docs/guides/local-development/testing/overview). Первое доказывает стену, второе — что путь запроса действительно ставит принципал (и сбрасывает его: `SET LOCAL`, [Citus/PgBouncer 2024](https://www.citusdata.com/blog/2024/04/04/pgbouncer-supports-more-session-vars/)).

5. **Отдельное соединение оставить и назвать своим именем** — Back Door Verification ([Meszaros, 2007](https://www.pearson.de/media/muster/toc/toc_9780321504807.pdf)). Плюс держать в нём же проверку «работа без принципала закрыта»: пустой/сброшенный GUC должен давать ноль строк, а не «все строки».

6. **Явно отметить остаточный риск, который матрица не ловит:** covert channels через FK/уникальные ограничения ([PostgreSQL docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)), не-LEAKPROOF функции в WHERE ([pganalyze](https://pganalyze.com/blog/5mins-postgres-row-level-security-bypassrls-security-invoker-views-leakproof-functions)) и тайминговый side channel ([SIGMOD 2023](https://dl.acm.org/doi/10.1145/3588943)). Это не повод расширять В1, но это повод не называть зелёную матрицу «доказательством отсутствия утечки» — она доказывает отсутствие утечки **данных по путям чтения/записи**, а не отсутствие утечки **факта существования**.

### НЕ СДЕЛАНО (В1)

- **NIST SP 800-192** — [PDF](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-192.pdf) не поддался извлечению текста (бинарный поток). Подтверждены только метаданные и охват по [странице NIST](https://www.nist.gov/publications/verification-and-test-methods-access-control-policiesmodels-0). Конкретные предписанные методы генерации тестов (комбинаторные покрывающие массивы, model checking) **не процитированы дословно** и в выводах не использованы как доказательство.
- **Zanzibar (USENIX ATC 2019)** — [PDF USENIX](https://www.usenix.org/system/files/atc19-pang.pdf) вернул HTTP 403. Обсуждает ли статья тестирование корректности авторизационных решений — не проверено; Zanzibar в выводах **не используется**.
- **Metamorphic Security Testing (MST-wi)** — [arXiv PDF](https://arxiv.org/pdf/1912.05278) не извлёкся; конкретные метаморфные отношения по контролю доступа не проверены. [IEEE TSE 2023](https://dl.acm.org/doi/abs/10.1109/TSE.2023.3256322) приведён только на уровне аннотации.
- **Именованного отраслевого термина** для «подтверждение финального состояния из отдельного привилегированного соединения» в контексте мультиарендности найти не удалось; ближайшее имя — Back Door Verification. Сайт `xunitpatterns.com` во время исследования не отвечал, определение подтверждено по оглавлению книги, а не дословной цитатой со страницы.
- **AWS-материалы по tenant isolation** (2020 и 2022) помечены «for historical reference only»; равноценной замены 2024–2026 с той же глубиной не найдено. Разделы про тестирование изоляции в [SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) и [Guidance for Multi-Tenant Architectures on AWS](https://docs.aws.amazon.com/solutions/multi-tenant-architectures-on-aws/) не читались.
- **Инженерные блоги GitLab / Figma / Stripe / Shopify** про тестирование мультиарендной изоляции — ничего подходящего не подтверждено; это отсутствие результата, а не отрицательный факт.

---

## В2 — сессии и одноразовые коды

### Как делают в мире

#### 1. «Эпоха сессии», logout и сброс пароля аннулируют украденную куку

**Норматив (что обязаны сделать).**

- **NIST SP 800-63B (Rev. 4, финальная редакция 2025)**, §5.1: «A session **SHALL** be bound to the subscriber by cryptographic means and **SHALL** include a session secret»; «Upon logout, the verifier **SHALL** invalidate the session secret». Там же жёсткие таймауты переаутентификации: AAL1 — «no more than 30 days», AAL2 — «no more than 24 hours» при inactivity timeout «no more than 1 hour» (§2.2.3), AAL3 — «no more than 12 hours» / 15 минут (§2.3.3). Источник: <https://pages.nist.gov/800-63-4/sp800-63b.html> (2025).
- **OWASP ASVS 5.0.0 (май 2025), глава V7 Session Management** (<https://asvs.dev/v5.0.0/V7-Session-Management/>):
  - **7.4.1 (L1)**: «Verify that when session termination is triggered (such as logout or expiration), the application disallows any further use of the session.»
  - **7.4.2 (L1)**: «Verify that the application terminates **all active sessions** when a user account is disabled or deleted».
  - **7.4.3 (L2)**: «Verify that the application **gives the option to terminate all other active sessions** after a successful change or removal of any authentication factor.»
  - **7.2.4 (L1)**: «Verify that the application generates a new session token on user authentication, including re-authentication, and terminates the current session token.» (ротация токена — отдельное от эпохи требование)
  - **7.5.1 (L2)**: полная переаутентификация перед изменением чувствительных атрибутов аккаунта.
- **OWASP Session Management Cheat Sheet** (актуальная версия, <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>): «When a session expires, the web application must take active actions to invalidate the session on **both sides, client and server**», причём серверная сторона «is the most relevant and mandatory from a security perspective»; «Session timeout management and expiration must be enforced server-side»; «The session ID must be renewed or regenerated by the web application after any privilege level change» — с явным примером «password changes».
- **OWASP Forgot Password Cheat Sheet** (<https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html>), раздел «User Resets Password»: «Ask the user if they want to **invalidate all of their existing sessions**, or invalidate the sessions automatically.»
- **Медицинский контекст:** 45 CFR §164.312(a)(2)(iii) HIPAA Security Rule, Automatic logoff (Addressable): «Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity» — <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312>. Конкретный интервал не задан, требуется risk-based обоснование.

**Расхождение источников, важное для нас.** NIST 800-63B-4 **не** содержит явного SHALL «инвалидируй все сессии при смене пароля» — он требует только инвалидации session secret при logout и форс-смены при подозрении на компрометацию (§3.1.1.2). ASVS 7.4.3 — только **L2** и формулировка мягче: «gives the **option** to terminate all other active sessions», а не «терминирует автоматически». Автоматическое глобальное убийство сессий как безусловное поведение — это позиция **фреймворков** (Django, Devise, Laravel, Firebase), а не буквы стандарта. Для медицинской мультитенантной платформы ближе контекст фреймворков и Forgot Password Cheat Sheet (там прямо разрешено «invalidate the sessions automatically»), т.е. наше требование **строже** ASVS L2 — и это в правильную сторону.

#### 2. «Session epoch» — как это называется в индустрии

Единого названия у паттерна нет; есть **три устойчивых имени** для одного и того же механизма.

| Имя | Кто так называет | Механика | Источник |
|---|---|---|---|
| **Session auth hash** | Django | «In the `AbstractBaseUser` case, this is an **HMAC of the password field**. Django verifies that the hash in the session for each request matches the one that's computed during the request. This allows a user to log out all of their sessions by changing their password.» + `update_session_auth_hash()` чтобы не разлогинить себя | <https://docs.djangoproject.com/en/5.2/topics/auth/default/#session-invalidation-on-password-change> (2025) |
| **Authenticatable salt** | Rails / Devise | в сессию кладётся первые 29 символов bcrypt-хеша пароля; смена пароля меняет соль → все прочие сессии не проходят проверку | исходник библиотеки: <https://github.com/heartcombo/devise/blob/main/lib/devise/models/database_authenticatable.rb> |
| **Token revocation time** / `tokensValidAfterTime` | Firebase (Google) | `revokeRefreshTokens()`; проверка `auth.token.auth_time > revokeTime`; авто-ревокация при «password or email address updates», удалении и отключении пользователя | <https://firebase.google.com/docs/auth/admin/manage-sessions> |
| **Global sign-out** | AWS Cognito | `GlobalSignOut` «invalidates the identity, access, and refresh tokens that Amazon Cognito issued to a user» | <https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html> |
| **`logoutOtherDevices` / `AuthenticateSession`** | Laravel | «This feature is typically utilized when a user is changing or updating their password and you would like to invalidate sessions on other devices while keeping the current device authenticated»; middleware `Illuminate\Session\Middleware\AuthenticateSession` детектит смену хеша пароля | <https://laravel.com/docs/13.x/authentication#invalidating-sessions-on-other-devices> |
| **Back-Channel Logout** (федеративный случай) | OpenID Foundation | Logout Token с `sid`/`sub`; RP «locate the session(s) identified by the iss and sub Claims and/or the sid Claim» и чистит состояние | <https://openid.net/specs/openid-connect-backchannel-1_0.html> (Final + errata set 1, 15.12.2023) |

**Вывод по терминологии:** «session epoch» — это наше внутреннее имя для того, что индустрия называет **global sign-out / session invalidation on credential change**, реализуемого через **версионирование/штамп ревокации** (монотонный счётчик или timestamp у пользователя, сверяемый на каждом запросе). Механизм канонический, имя — наше. Все пять цитируемых реализаций — ровно этот паттерн; Django/Devise используют производную от хеша пароля вместо отдельного счётчика, Firebase/Cognito — отдельный timestamp (это ровно «эпоха»).

#### 3. Конкурентное погашение кода: ровно один победитель

**Норма — единичное использование:**

- **RFC 6749 §4.1.2 (2012, до сих пор действующая норма)**: «The client MUST NOT use the authorization code more than once. If an authorization code is used more than once, the authorization server MUST deny the request and **SHOULD revoke (when possible) all tokens previously issued based on that authorization code**»; «A maximum authorization code lifetime of **10 minutes** is RECOMMENDED»; «The authorization code is bound to the client identifier and redirection URI». <https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2>
- **RFC 9700 — OAuth 2.0 Security Best Current Practice, BCP 240 (январь 2025)**, обновляет RFC 6749/6750/6819: подтверждает, что коды MUST инвалидироваться после первого использования, повторяет рекомендацию отзывать все выданные по коду токены, требует обязательной поддержки PKCE и sender-constrained / rotation для refresh-токенов. <https://www.rfc-editor.org/rfc/rfc9700.html>
- **NIST SP 800-63B-4 §3.1.3.2 (2025)**: «Verifiers **SHALL** accept a given authentication secret as valid only once during the validity period»; «the authentication SHALL be considered invalid unless completed within **10 minutes**».
- **ASVS 5.0 6.5.1 (L2)**: «lookup secrets, out-of-band authentication requests or codes, and time-based one-time passwords (TOTPs) are **only successfully usable once**»; **6.5.5 (L2)**: OOB-запросы — максимум 10 минут жизни; **6.4.1 (L1)**: initial passwords / activation codes «expire after a short period of time **or after they are initially used**».
- **OWASP Forgot Password Cheat Sheet**: токены сброса «Single use and expire after an appropriate period», «Invalidated after they have been used», «Linked to an individual user in the database».

**Норма — атомарность (что именно делает «ровно один победитель»):**

- **ASVS 5.0 2.3.3 (L2)**: «Verify that **transactions are being used at the business logic level** such that either a business logic operation succeeds in its entirety or it is rolled back to the previous correct state.» **2.3.4 (L2)**: «Verify that business logic level **locking mechanisms** are used to ensure that limited quantity resources … cannot be double-booked by manipulating the application's logic.» <https://asvs.dev/v5.0.0/V2-Validation-and-Business-Logic/>
- **PortSwigger Research, James Kettle, «Smashing the state machine: the true potential of web race conditions» (Black Hat USA / DEF CON 31, 2023)** — единственный крупный именной источник по этому классу. Классифицирует «limit overrun» (в т.ч. «Reusing a single CAPTCHA solution», «Bypassing an anti-bruteforce rate-limit») и показывает **реальную гонку в Devise на токенах подтверждения email**: «By submitting two requests … I was able to obtain the latter as a validated address». Рекомендация: «Ensure sensitive endpoints make state-changes **atomic by using the datastore's concurrency features**. For example, use a **single database transaction**…». <https://portswigger.net/research/smashing-the-state-machine>, дополнительно <https://portswigger.net/web-security/race-conditions> (там же — «column uniqueness constraints» и запрет смешивать «data from different storage places» в security-критичных операциях).
- **PostgreSQL, официальная документация, §13.2.1 Read Committed** — механика, которая и даёт «ровно одного победителя» для `UPDATE ... WHERE used_at IS NULL`: «the second updater … will attempt to apply its operation to the updated version of the row. **The search condition of the command (the `WHERE` clause) is re-evaluated** to see if the updated version of the row still matches the search condition.» То есть проигравший увидит `used_at IS NOT NULL` и обновит 0 строк. Там же предупреждение: «it is possible for an updating command to see an **inconsistent snapshot**». §13.2.2 / §13.2.3: под Repeatable Read/Serializable вместо этого будет `ERROR: could not serialize access due to concurrent update`, и «Applications using this level **must be prepared to retry** transactions due to serialization failures». <https://www.postgresql.org/docs/current/transaction-iso.html>

**Итог по канону реализации.** Ни один стандарт не диктует конкретный SQL. Канон складывается так: спеки (RFC 6749/9700, NIST, ASVS 6.5.1) требуют **свойства** «ровно один раз»; ASVS 2.3.3/2.3.4 требуют, чтобы это обеспечивалось **транзакциями и блокировками БД**; PostgreSQL-документация описывает **единственный примитив**, который это даёт под Read Committed — условный `UPDATE ... WHERE <ещё не использован> RETURNING` (или уникальный индекс / `SELECT ... FOR UPDATE`). Проверка «прочитали, потом обновили» без условия в `WHERE` — классический lost update и антипаттерн.

#### 4. Счётчик попыток не теряется

- **NIST SP 800-63B-4 §3.2.2 (2025)** — самая жёсткая и конкретная норма: «The verifier **SHALL limit consecutive failed authentication attempts** using a specific authenticator on a single subscriber account **to no more than 100** by disabling that authenticator»; «The limit of 100 attempts is an upper bound, and agencies MAY impose lower limits». Ключевое слово — **consecutive on a single subscriber account**, т.е. счётчик привязан к аккаунту, а не к IP.
- **ASVS 5.0 6.6.3 (L2)**: «a code based out-of-band authentication mechanism is **protected against brute force attacks by using rate limiting**. Consider also using a code with at least 64 bits of entropy.» **6.3.1 (L1)**: контроли против credential stuffing и brute force «according to the application's security documentation». **2.4.1 (L2)**: anti-automation против «rate-limit breaches».
- **OWASP Authentication Cheat Sheet**: «The counter of failed logins **should be associated with the account itself, rather than the source IP address**, in order to prevent an attacker from making login attempts from a large number of different IP addresses.» <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- **Почему счётчик обязан быть конкурентно-корректным:** PortSwigger прямо относит «Bypassing an anti-bruteforce rate-limit» к limit-overrun race conditions — потерянный инкремент счётчика есть обход всей защиты. Это и есть техническое обоснование требования «счётчик не теряется».

**Спор источников:** OWASP описывает счётчик как **счётчик в состоянии аккаунта** (lockout threshold, observation window, exponential lockout), ASVS 6.6.3 говорит нейтрально «rate limiting» (что допускает внешний rate limiter). NIST однозначен: **consecutive failed attempts на аккаунт** — что реализуемо только персистентным счётчиком, переживающим рестарт процесса и конкуренцию; IP-лимитер этому требованию не удовлетворяет. Для нашего контекста (мультитенант, коды по email/SMS) ближе NIST + OWASP Authentication Cheat Sheet: счётчик в БД у кода/аккаунта, инкремент атомарный.

#### 5. Привязка кода к назначению — как называется принцип

Требование стандартное, и у него есть **три разных именованных формулировки**:

- **ASVS 5.0 6.6.2 (L2)** — прямое попадание, дословно наше требование: «Verify that out-of-band authentication requests, codes, or tokens are **bound to the original authentication request for which they were generated and are not usable for a previous or subsequent one**.» <https://asvs.dev/v5.0.0/V6-Authentication/>
- **ASVS 5.0 9.2.2 (глава V9 Self-contained Tokens)**: «Verify that the service receiving a token **validates the token to be the correct type and is meant for the intended purpose** before accepting the token's contents. For example, only access tokens can be accepted for authorization decisions and only ID Tokens can be used for proving user authentication.» **9.2.3**: audience-ограничение через `aud`; **9.2.4**: при общем ключе на разные аудитории — обязательное audience restriction. <https://asvs.dev/v5.0.0/V9-Self-contained-Tokens/>
- **RFC 8725 «JSON Web Token Best Current Practices», BCP 225 (февраль 2020, действующая норма)**: §2.8 **«Cross-JWT Confusion»** — «it becomes increasingly important to prevent cases of **JWT tokens that have been issued for one purpose being subverted and used for another**»; §3.9 «Use and Validate Audience» — «the JWT **MUST** contain an "aud" (audience) claim»; §3.11 **«Use Explicit Typing»** — «If a particular kind of JWT is subject to such confusion, that JWT can include an explicit JWT type value, and the validation rules can specify checking the type». <https://www.rfc-editor.org/rfc/rfc8725.html>
- **Практический пример спеки:** OIDC Back-Channel Logout 1.0 §2.4 — «A `nonce` Claim **MUST NOT** be present. Its use is prohibited to make a Logout Token **syntactically invalid if used in a forged Authentication Response in place of an ID Token**» и «It is RECOMMENDED that Logout Tokens be explicitly typed … with a value of `logout+jwt`». Это ровно «код для одной цели не должен работать для другой», реализованное на уровне спецификации.
- **RFC 6749 §4.1.2**: «The authorization code is bound to the client identifier and redirection URI» — та же идея purpose/context binding для непрозрачного (не-JWT) кода.

**Названия принципа:** *cross-JWT confusion / token type confusion* (RFC 8725), *audience restriction* (RFC 7519 `aud`, RFC 8725 §3.9), *explicit typing* (RFC 8725 §3.11, `typ`), *purpose binding of out-of-band codes* (ASVS 6.6.2). Наши коды непрозрачные, поэтому применимая формулировка — ASVS 6.6.2 + 9.2.2: у кода должен быть **тип/назначение как часть проверяемого состояния**, а не только строка секрета.

#### 6. Тестировать на живой БД, а не на моках — это индустриальная практика?

Да, и по инвариантам конкурентности — практически безальтернативно.

- **PortSwigger Research (2023)**, о методологии поиска гонок: «I recommend using this approach **even if you have source-code access**; in my experience it's **extremely challenging to identify race conditions through pure code analysis**.» Т.е. свойство проверяется прогоном, а не чтением кода и не моком.
- **PostgreSQL docs §13.2.1–13.2.3**: поведение при конкурентном `UPDATE` (re-evaluation `WHERE`, `could not serialize access`, обязанность ретраить) — **свойство конкретного уровня изоляции конкретной СУБД**. Мок его не воспроизводит по определению; значит, инвариант «ровно один победитель» доказуем только против реальной БД на реальном уровне изоляции. <https://www.postgresql.org/docs/current/transaction-iso.html>
- **Elle: «Inferring Isolation Anomalies from Experimental Observations», Proc. VLDB Endow. 14(3), 2020** (Kyle Kingsbury, Peter Alvaro) — академический канон: аномалии изоляции выявляются **чёрным ящиком по наблюдаемым историям реальной системы**, cycle detection в Adya-графе зависимостей. <https://dl.acm.org/doi/10.14778/3430915.3430918>, реализация <https://github.com/jepsen-io/elle>
- **Testcontainers (Docker, официальный блог/доки)**: «the typical use of mocks won't allow you to reliably verify that your system behavior will work in the production environment … it's strongly recommended to write tests using **real dependencies** as much as possible and use mocks only when needed». <https://www.docker.com/blog/testcontainers-testing-with-real-dependencies/>, <https://testcontainers.com/getting-started/>
- **OWASP WSTG, 4.10 Business Logic Testing**: «**Automation of business logic abuse cases is not possible** and remains a manual art relying on the skills of the tester and their knowledge of the complete business process and its rules» — т.е. гонки и обходы бизнес-логики закрываются целевыми сценариями против работающей системы. <https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/README>

### Вердикт: **совпадает**

Все четыре свойства пункта В2 — дословные требования действующих стандартов: аннулирование сессии при logout/смене фактора (NIST 800-63B-4 §5.1, ASVS 7.4.1/7.4.2/7.4.3), однократное погашение кода с ровно одним победителем (RFC 6749 §4.1.2, RFC 9700/BCP 240, NIST §3.1.3.2, ASVS 6.5.1 + 2.3.3/2.3.4), несбиваемый счётчик попыток (NIST §3.2.2 «no more than 100 consecutive failed attempts», ASVS 6.6.3), привязка кода к назначению (ASVS 6.6.2 и 9.2.2, RFC 8725 §2.8 «Cross-JWT Confusion»). Формулировка «эпоха сессии» — наше внутреннее имя канонического *global sign-out / session invalidation on credential change*, реализованного в Django, Devise, Laravel, Firebase и Cognito.

### Что практика предлагает вместо / сверх нашей формулировки

1. **Ротация токена сессии, а не только эпоха.** ASVS 7.2.4 (L1) требует **нового** session token при каждой аутентификации и переаутентификации, а OWASP Session Management Cheat Sheet — регенерации при любом изменении уровня привилегий. Эпоха убивает старые куки, но не заменяет ротацию: это два независимых требования, и ротация — уровень L1, т.е. строже.
2. **Отзыв производных артефактов при повторном погашении.** RFC 6749 §4.1.2 и RFC 9700 требуют не просто отклонить второе использование кода, а **отозвать всё, что было выдано по этому коду** (SHOULD). У нас «ровно один победитель» — это только половина: вторая половина — что происходит с сессией, выданной победителю, при обнаружении реплея. Реплей — сигнал компрометации, а не просто ошибка.
3. **Явные таймауты вместо «эпоха + logout».** NIST задаёт числа: AAL2 — абсолютный лимит 24 ч, idle 1 ч; ASVS 7.3.1/7.3.2 требуют обоих таймаутов с задокументированным risk-анализом. Для медицинской платформы это дополнительно пересекается с HIPAA §164.312(a)(2)(iii) (automatic logoff, addressable — обязателен либо он, либо документированная эквивалентная мера).
4. **Жизненный срок кодов — числом.** ASVS 6.5.5 и NIST §3.1.3.2 дают конкретные 10 минут для out-of-band; RFC 6749 — 10 минут для authorization code. Формулировка В2 срока не содержит вовсе.
5. **Энтропия и хранение кодов.** ASVS 6.5.3 (CSPRNG), 6.5.4 (≥20 бит для 6-значных OTP), 6.6.3 (≥64 бит для ссылок), 6.5.2 (хеширование при <112 бит энтропии). Это не про конкурентность, но это часть того же канона «одноразовый код».
6. **Счётчик — на аккаунт/код, не на IP.** OWASP Authentication Cheat Sheet прямо предупреждает: IP-привязка обходится распределённой атакой. NIST считает **consecutive** попытки на аккаунт.
7. **Уникальный индекс как второй рубеж.** PortSwigger отдельно называет «column uniqueness constraints» — декларативная защита, работающая независимо от корректности прикладного кода; условный `UPDATE` и уникальный индекс дополняют друг друга, а не заменяют.
8. **Про ретраи.** Если тесты (или прод) идут на Repeatable Read/Serializable, PostgreSQL-документация обязывает быть готовым к `could not serialize access` и ретраить — иначе «ровно один победитель» превратится в «ни одного победителя» под нагрузкой. Формулировка В2 этого случая не покрывает.
9. **Федеративный случай.** Если появятся внешние RP/IdP, канон глобального разлогина — OIDC Back-Channel Logout 1.0 (Logout Token с `sid`), а не только собственная эпоха; ASVS 7.4.3 явно требует эффекта «across the application, federated login and any relying parties».

### НЕ СДЕЛАНО (В2)

- **Не проверены дословно** Auth0 и Okta: их документированные механизмы session/refresh-token revocation не открывались, в отчёте они не цитируются.
- **RFC 8628 (Device Authorization Grant) и RFC 6238 (TOTP)** не читались; рекомендации о throttling попыток и `slow_down`/`expires_in` **не подтверждены цитатой** и в отчёте не используются.
- **RFC 7519 §4.1.3 (`aud`)** цитируется опосредованно — через RFC 8725 §3.9 и ASVS 9.2.3; сам текст RFC 7519 не открывался.
- **ASVS V7 прочитана не целиком** — только пункты 7.2.1, 7.2.4, 7.3.1, 7.3.2, 7.4.1–7.4.3, 7.5.1, 7.5.3. Пункты 7.1.x, 7.4.4+, 7.6.x не проверены.
- **Devise/Rails:** прозаической официальной документации по `authenticatable_salt` не нашлось; механизм подтверждён исходником репозитория heartcombo/devise. Это слабейшая цитата раздела.
- **Точная дата финальной публикации NIST SP 800-63B-4** взята со страницы pages.nist.gov (26.08.2025); по PDF в nvlpubs не сверялась.
- **Не искалось** отраслевое руководство именно по медицинским платформам сверх HIPAA §164.312 (HL7/FHIR security, ONC/HTI требования к сессиям EHR).
- **Нет источника**, предписывающего конкретный SQL (`UPDATE ... WHERE ... RETURNING`) как норму: это вывод из связки ASVS 2.3.3/2.3.4 + семантики PostgreSQL §13.2.1, а не прямая цитата.
- **Не искались** опубликованные методики нагрузочного/конкурентного тестирования именно auth-флоу.

---

## В4 — деньги: журнал, повтор вебхука, возврат

### Как делают в мире

#### 1. Вебхуки: подпись, повтор, порядок, «сходи спроси провайдера»

**Stripe** (текущая редакция документации) даёт четыре независимых правила:

- Подпись обязательна: «Всегда проверяйте, что события вебхука пришли именно от Stripe, прежде чем действовать»; без проверки атакующий может «отправить поддельные события, чтобы вызвать действия — исполнение заказов, выдачу доступа, изменение записей». Плюс второй слой — allow-list IP. — <https://docs.stripe.com/webhooks>
- Replay: временная метка входит в подписываемую полезную нагрузку, дефолтный допуск в библиотеках — 5 минут, и прямое предупреждение «не используйте допуск `0`, это полностью отключает проверку свежести». — <https://docs.stripe.com/webhooks/signature>
- Дубли: «эндпоинты могут получать одно и то же событие несколько раз… логируйте ID обработанных событий и игнорируйте уже залогированные»; при генерации двух разных объектов `Event` дедупликация делается по `data.object.id` + `event.type`.
- Порядок: «Stripe не гарантирует доставку событий в порядке их возникновения. Убедитесь, что обработчик не зависит от порядка… Вы можете использовать API, чтобы получить недостающие объекты». Для актуального состояния Stripe прямо предлагает `fetchRelatedObject()` — то есть **дочитать объект из API, а не доверять телу события**.

Отдельно Stripe запрещает исполнять заказ по клиентскому редиректу: «Не пытайтесь обрабатывать fulfillment на стороне клиента… используйте вебхуки; вебхуки — самый надёжный способ подтвердить, что вам заплатили». — <https://docs.stripe.com/checkout/fulfillment>, <https://docs.stripe.com/payments/payment-intents/verifying-status>

**Adyen** (текущая редакция): «Всегда проверяйте HMAC-подпись до обработки полезной нагрузки»; «если сообщение вебхука не защищено, мы не рекомендуем его принимать». Дубли: «в некоторых случаях вы можете получить одно и то же событие дважды» — у дублей совпадают `eventCode` + `pspReference`. Порядок: «чтобы обрабатывать события в правильном хронологическом порядке, всегда проверяйте timestamp», у части вебхуков есть `sequenceNumber`. Транспортное подтверждение отделено от бизнес-логики: ответить 2xx (202) за 10 секунд, «не валидируйте и не обрабатывайте данные на этом шаге», «сохраните сообщение в БД или очередь, чтобы обработать позже». — <https://docs.adyen.com/development-resources/webhooks/handle-webhook-events/>, <https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures>

**PayPal** идёт дальше всех в сторону нашей схемы: помимо локальной проверки CRC32+подписи, официально поддерживается **постбэк-верификация** — отправить полученное сообщение обратно в PayPal на `POST /v1/notifications/verify-webhook-signature` и позволить провайдеру подтвердить подлинность. То есть «вебхук — сигнал, иди спроси провайдера» — это не изобретение, это один из двух документированных путей у PayPal. Важная оговорка из тех же доков: постбэк-верификация **не работает для событий из симулятора вебхуков**. — <https://developer.paypal.com/api/rest/webhooks/rest/>, <https://developer.paypal.com/api/rest/webhooks/simulator/>

**Square**: HMAC-SHA256 в `x-square-hmacsha256-signature`, подпись считается по ключу + **URL нотификации** + сырому телу; дедупликация — по `event_id`, «вебхуки могут быть отправлены более одного раза»; ретраи с экспоненциальным бэкоффом до 24 часов. — <https://developer.squareup.com/docs/webhooks/step3validate>

**GitHub** добавляет деталь, которую чаще всего забывают: «Never use a plain `==` operator. Use `secure_compare` or `crypto.timingSafeEqual`» — сравнение подписи в постоянном времени. — <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries>

**Standard Webhooks** (спека v1.0.0, инициатива 2023, живая в 2025–2026): три заголовка `webhook-id` / `webhook-timestamp` / `webhook-signature`, подписывается конкатенация `msg_id.timestamp.payload`, симметрично (HMAC-SHA256, префикс `v1`) или асимметрично (ed25519, `v1a`), ключ уникален на эндпоинт. Нормативно: «проверьте, что `webhook-timestamp` находится в допустимом окне»; «используйте заголовок `webhook-id` как ключ идемпотентности, чтобы случайно не обработать вебхук дважды». Гарантий порядка спека **не даёт**. — <https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md>

Становится ли это нормой: да, но как норма для **отправителей**, а не как обязательство получателя. Заявленные адоптеры — OpenAI, Anthropic, Google Gemini, Twilio, PagerDuty, Etsy, Supabase, Brex, Kong, Svix. Ни Stripe, ни Adyen, ни наш эквайер на неё не перешли. — <https://www.standardwebhooks.com/>

**PCI DSS 4.0 — что реально применимо** (цитаты из официального PCI DSS v4.0 SAQ D for Merchants, PCI SSC, апрель 2022; в v4.0.1 от июня 2024 новых/удалённых требований нет — <https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1>):

Применимо:
- **6.2.4** — «Приёмы разработки… для предотвращения или смягчения типовых атак на ПО… включая **атаки на бизнес-логику, в том числе попытки злоупотребить функциональностью или обойти её через манипуляцию API, протоколами и каналами связи, клиентской функциональностью**». Это ровно про подмену суммы/клиники и про подделанный вебхук. — <https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-D-Merchant.pdf>
- **10.2.1 / 10.2.1.1** — журналы аудита включены и активны для всех компонентов.
- **10.3.2** — «Файлы журналов аудита защищены от изменения людьми»; **10.3.3** — оперативный бэкап на защищённый центральный лог-сервер «или иной носитель, который трудно изменить»; **10.3.4** — «Мониторинг целостности файлов или механизмы обнаружения изменений применяются к журналам аудита, чтобы существующие данные журнала нельзя было изменить без генерации алерта». Это прямая нормативная опора под «журнал только на дозапись».
- **12.8.1 / 12.8.5** — реестр сторонних поставщиков услуг и матрица ответственности PCI DSS между нами и эквайером.

**Не применимо (частая ошибка):**
- **4.2.1** — про защиту **PAN** при передаче по открытым сетям. В редиректной/хостед-схеме вебхук PAN не несёт — к целостности вебхука 4.2.1 отношения не имеет.
- **6.4.3 и 11.6.1** — инвентарь/авторизация скриптов и обнаружение подмены на **платёжной странице в браузере покупателя**. При полном редиректе — не про нас.
- Отдельного требования PCI «проверяй подпись вебхука» **не существует** — покрывается общим 6.2.4.

**OWASP ASVS 5.0.0** (релиз 30.05.2025), глава V2, раздел Business Logic:
- **V2.3.1** — «приложение обрабатывает бизнес-логические потоки для одного пользователя только в ожидаемом последовательном порядке шагов и без пропуска шагов»;
- **V2.3.3** — «транзакции используются на уровне бизнес-логики так, что бизнес-операция либо выполняется целиком, либо откатывается к предыдущему корректному состоянию» — дословно «успех провайдера не оставляет частичного состояния»;
- **V2.3.4** — «применяются механизмы блокировки на уровне бизнес-логики, чтобы ресурсы ограниченного количества нельзя было забронировать дважды манипуляцией логикой приложения» — дословная опора под сериализацию capture/refund. — <https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md>

#### 2. Журнал денег: append-only + двойная запись + выводимый баланс

Канон — единый и старый, все зрелые системы говорят одно и то же.

- **Square, «Books»** (инженерный блог Square, октябрь 2019): «наборы данных journal entries и book entries фактически append-only и неизменяемы после записи»; «все транзакции должны балансироваться в 0, так что каждый потерянный цент сопоставлен полученному центу»; про неизменяемость: «всегда останется след того, что произошло в системе, даже если это произошло по ошибке — и это не баг, это фича». Баланс материализуется как отдельная «книга», чтобы «расчёт выплаты был одной строкой в БД». — <https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/>
- **Modern Treasury** (январь 2023, обновлено 26.08.2025): «каждое состояние регистра должно быть записано и легко восстанавливаемо»; валидация — «минимум две записи, дебет и кредит; дебеты и кредиты равны, **по каждой валюте**» (иначе конвертации создают деньги из воздуха). — <https://www.moderntreasury.com/journal/how-to-scale-a-ledger-part-v>
  Гарантии их API: **атомарность** («записи транзакции либо все успешны, либо все не записаны»), **неизменяемость** («записи нельзя изменить или удалить после того, как транзакция проведена» — меняются только метаданные), **идемпотентность** («ключи идемпотентности поддерживаются на всех POST-запросах»), **блокировки** («записи могут использовать блокировку, когда создаваемая транзакция зависит от баланса счёта»), версионирование баланса `lock_version`. — <https://docs.moderntreasury.com/docs/ledgers-guarantees>
- **TigerBeetle**: «дебет/кредит минимален и полон: две сущности (счета, переводы) и один инвариант (каждому дебету соответствует равный и противоположный кредит) моделируют любой обмен ценностью». — <https://docs.tigerbeetle.com/concepts/debit-credit/>
  Самое ценное для нас — их **two-phase transfers**, это ровно наша модель «pending → capture/refund/indeterminate»: «двухфазный перевод двигает средства стадиями: 1) резервирование (pending transfer), 2) разрешение (post, void или expire)». Ключевое: «Завершение двухфазного перевода **не связано с изменением pending-перевода. Вместо этого вы создаёте новый перевод**». Частичный capture поддержан. Двойная проводка невозможна на уровне движка: ошибки `pending_transfer_already_posted`, `pending_transfer_already_voided`, `pending_transfer_expired`. Есть таймаут — зависший резерв возвращается автоматически. — <https://docs.tigerbeetle.com/coding/two-phase-transfers/>
- **Uber, LedgerStore** (инженерный блог Uber, 2024): «append-only ledger-style база данных», «проверяемо неизменяемая (можно убедиться криптографическими подписями, что записи не изменялись)»; мигрировали триллион записей. — <https://www.uber.com/en-KE/blog/migrating-from-dynamodb-to-ledgerstore/>

**Ответ на прямой вопрос: да, отраслевой стандарт — журнал событий + выводимый (или материализуемый как проекция) баланс, никогда не мутация денежной строки.** Что это даёт: (а) восстановимость любого прошлого состояния и аудит без отдельной системы; (б) 10.3.2/10.3.4 PCI выполняются конструкцией, а не процедурой; (в) идемпотентность приёма события провайдера сводится к уникальному индексу по id события провайдера — вставка-дубликат отваливается на БД, а не на прикладной проверке.

#### 3. Сериализация capture / refund

Канон — **и то, и другое**, и это не «либо-либо».

- Провайдеры дают клиентский ключ идемпотентности: Stripe — «все POST-запросы принимают ключи идемпотентности», при конфликте с параллельным запросом результат не сохраняется и запрос можно повторить; слой идемпотентности «сравнивает входящие параметры с параметрами исходного запроса и выдаёт ошибку, если они не совпадают»; ключи живут ≥24 ч. — <https://docs.stripe.com/api/idempotent_requests>
- Adyen: `idempotency-key` в заголовке, ≤64 символа, «ключи действительны минимум 7 дней»; при повторе до завершения первого запроса — **HTTP 409/422, код ошибки 704 «request already processed or in progress»**. Плюс серверные бизнес-инварианты: «нельзя захватить сумму больше авторизованной», «суммарный возврат по умолчанию не может превысить захваченную сумму». — <https://docs.adyen.com/development-resources/api-idempotency>
- И параллельно провайдеры **сами блокируют объект**. Stripe: «API Stripe блокирует объекты при некоторых операциях, чтобы избежать вмешательства параллельных нагрузок и несогласованного результата»; ошибка `429 lock_timeout`; прямая рекомендация: «мутации над одним и тем же объектом должны ставиться в очередь и исполняться последовательно». — <https://docs.stripe.com/rate-limits>

**Ответ: канон — «сериализовать мутации по одному денежному объекту» ПЛЮС «сделать каждую операцию идемпотентной»**. Идемпотентность одна не спасает: два одновременных возврата по 50% от разных операторов имеют разные ключи идемпотентности и оба валидны по отдельности — их разводит только блокировка/инвариант суммы.

Со стороны БД, PostgreSQL 18 (официальная документация, 2025):
- `FOR UPDATE` «блокирует строки, выбранные SELECT, как для обновления. Это не даёт другим транзакциям блокировать, изменять или удалять их до конца текущей транзакции». — <https://www.postgresql.org/docs/current/explicit-locking.html>
- Advisory locks — с задокументированной ловушкой: `SELECT pg_advisory_lock(id) … LIMIT 100; -- danger!`, «LIMIT не гарантированно применяется до выполнения функции блокировки».
- SERIALIZABLE «эмулирует последовательное исполнение всех зафиксированных транзакций», но «приложения на этом уровне должны быть готовы повторять транзакции из-за ошибок сериализации»; и там же рекомендация «**устраните явные блокировки, SELECT FOR UPDATE и SELECT FOR SHARE там, где они больше не нужны**». — <https://www.postgresql.org/docs/current/transaction-iso.html>
- Read Committed не защищает от serialization anomaly — классический read-modify-write «прочитал сумму возвратов → решил, что можно ещё» в Read Committed без блокировки некорректен.

#### 4. Подмена суммы и клиники — как это называется

Именованные классы есть, их несколько и они не синонимы:

- **OWASP API3:2023 — Broken Object Property Level Authorization (BOPLA)**, поглотила Mass Assignment. Их пример буквально наш: хост подтверждает бронь и дописывает свойство `"total_stay_price": "$1,000,000"`. — <https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/>
- **OWASP API1:2023 — BOLA** — про подмену клиники: «используйте механизм авторизации, чтобы проверять права **в каждой функции**, которая использует клиентский ввод для доступа к записи в БД»; «сравнение user ID из сессии с уязвимым параметром ID — недостаточное решение». — <https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/>
- **OWASP API6:2023 — Unrestricted Access to Sensitive Business Flows**: злоупотребление самим бизнес-потоком, лечится анти-автоматизацией. Для В4 периферия. — <https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/>
- **CWE-472 «External Control of Assumed-Immutable Web Parameter»** — с исторической россыпью CVE «корзина позволяет изменить цену через скрытое поле формы». — <https://cwe.mitre.org/data/definitions/472.html>
- **CWE-915** — «Improperly Controlled Modification of Dynamically-Determined Object Attributes», альтернативное имя — **Mass Assignment**. — <https://cwe.mitre.org/data/definitions/915.html>
- **PCI DSS 6.2.4** (см. выше). Отдельного «не доверяй клиентской сумме» в PCI DSS нет, оно живёт внутри 6.2.4.

Про «источник истины по сумме — серверный заказ, а ответ провайдера сверяется с ним»: как отдельно поименованного канона нет, но он реализован конструктивно у всех — сумма задаётся сервером при создании намерения (Stripe PaymentIntent / Adyen `/payments`), а провайдер сам держит инварианты «capture ≤ authorised», «сумма возвратов ≤ захваченной». Сверка — самостоятельная дисциплина: у Adyen «делайте тестовые транзакции и скачивайте отчёты в тестовой среде… опробуйте процессы сверки до выхода в прод» (<https://docs.adyen.com/platforms/prepare-reports>), у Stripe — payout/balance reconciliation reports (<https://docs.stripe.com/reports/payout-reconciliation>).

#### 5. Как тестируют денежные пути

- **Stripe**: `stripe listen --forward-to http://localhost:4242/webhook` пробрасывает реальные события песочницы в локальный эндпоинт, `stripe trigger <EVENT>` генерирует событие; «в зависимости от события CLI может сгенерировать несколько связанных событий». — <https://docs.stripe.com/stripe-cli/triggers>, <https://docs.stripe.com/cli/listen>
- **Adyen**: тестовые нотификации из панели — «мы отправляем четыре тестовых уведомления на каждый выбранный event code; они покрывают успешные и неуспешные сценарии». — <https://docs.adyen.com/development-resources/webhooks>
- **PayPal**: симулятор есть, но с честно задокументированной дырой — «постбэк-верификация не поддерживается для mock-событий симулятора». Симулятор не проверяет тот самый путь, который в проде решающий.
- **Контрактные тесты (Pact)** закрывают границу HTTP: «контрактный тест гарантирует, что потребитель и поставщик одинаково понимают запрос и ответ… контрактный тест не проверяет побочные эффекты». — <https://docs.pact.io/consumer/contract_tests_not_functional_tests>
- **Реальная БД вместо моков** — да, для денежного журнала это считается необходимым: «in-memory-сервисы могут не иметь всех возможностей вашего продакшн-сервиса… вы написали SQL-запрос, проверили на H2, он работает, а после деплоя выяснилось, что синтаксис работает на H2, но не на Postgres». — <https://testcontainers.com/guides/replace-h2-with-real-database-for-testing/>
  Для нас это не стилистика: уникальный индекс по id события провайдера, `SELECT … FOR UPDATE`, RLS-политики по клинике и инвариант «сумма возвратов ≤ захваченной» **физически не существуют в моке**. Мок денежного журнала тестирует мок.
- Разделение слоёв тестов у внешнего шлюза — Toby Clemson, martinfowler.com, 2014: <https://martinfowler.com/articles/microservice-testing/>
- Порядок «сначала запись, потом внешний вызов» — это **Transactional Outbox** (Chris Richardson): «запишите сообщение/событие в таблицу OUTBOX как часть той же транзакции, которая обновляет бизнес-объекты». — <https://microservices.io/patterns/data/transactional-outbox.html>

#### Где источники расходятся и чей контекст ближе нам

1. **Adyen: «ответьте 2xx, не валидируя» ↔ «неподписанный вебхук не принимать» / Stripe: «проверьте подпись до действий»**. Формально это не противоречие, а два разных «принять»: Adyen про транспортный ACK (иначе провайдер начнёт ретраи и может отключить эндпоинт), Stripe и сам Adyen — про бизнес-эффект. Наш решённый fail-closed корректен **только если он про бизнес-эффект**; если он выражается в 4xx/5xx на неподписанный колбэк, мы получим у российского эквайера бесконечные ретраи и, возможно, отключение уведомлений. Ближе к нам контекст Adyen.
2. **PostgreSQL: «уберите FOR UPDATE, если у вас SERIALIZABLE» ↔ индустрия (Stripe, Modern Treasury) явно блокирует строку.** Ближе к нам индустрия: SERIALIZABLE требует дисциплины ретраев на **каждой** транзакции приложения, включая некассовые, и в Next.js-приложении с общим пулом это не изолируемо на один модуль.
3. **«Идемпотентность vs сериализация»**: Stripe (`lock_timeout`) и Adyen (код 704) закрывают вопрос — канон это оба механизма.
4. **Pact ↔ Testcontainers** — не спор, а разные границы: контракт на границе HTTP с эквайером, настоящий Postgres на границе журнала.

### Вердикт: **вариант**

Формулировка В4 совпадает с каноном по всем четырём инвариантам, и решения лида — «pending-строка до вызова провайдера» и «вебхук как сигнал, а не источник истины» — это ровно Transactional Outbox и постбэк-верификация PayPal / `fetchRelatedObject` Stripe, не изобретения. Вариантом это делают три расхождения: (а) сказано «событие пишется идемпотентно», но не сказано «журнал только на дозапись, денежная строка не мутируется, состояние выводится» — а именно это канон Square/Modern Treasury/Uber/TigerBeetle и то, что механически закрывает PCI 10.3.2/10.3.4; (б) «сериализованы» не уточняет, что канон — блокировка строки **и** идемпотентный ключ, а не одно из двух; (в) «всегда перезапрашивать провайдера при неподписанном вебхуке» у Stripe/Adyen аналога не имеет, потому что у них подпись обязательна — у нас это вынужденно и требует защиты, которой в каноне нет.

### Что практика предлагает вместо

1. **Не «событие записано идемпотентно», а «журнал append-only с уникальным ключом по id события провайдера и выводимым состоянием»**. Уникальный индекс по (provider, event_id) — дедупликация уезжает в БД. Денежная строка не UPDATE-ится никогда, исправление — новая запись (Square: «след всегда останется — это не баг, это фича»). Дешевле, потому что снимает целый класс задач: не нужно отдельно проектировать аудит, не нужно доказывать аудитору выполнение 10.3.2/10.3.4 процедурами, и любой спор «сколько было списано» решается пересчётом.
2. **Модель состояния — двухфазный перевод TigerBeetle, а не статус-поле.** `pending` → `post` (в т.ч. частичный) / `void` / `expire` по таймауту, причём «завершение не изменяет pending-перевод, вы создаёте новый». Это буквально авторизация→capture→refund и одновременно даёт «indeterminate + таймаут» бесплатно.
3. **Сериализация — и блокировка, и ключ идемпотентности.** Локально: `SELECT … FOR UPDATE` по строке платежа на время capture/refund (ASVS V2.3.4 требует именно блокировку против двойного бронирования). Наружу: собственный ключ идемпотентности, детерминированно выведенный из id операции возврата. Плюс серверный инвариант «сумма возвратов ≤ захваченной», как это делает Adyen у себя — не полагаться на то, что провайдер проверит.
4. **Перезапрос статуса должен быть защищён от усиления.** Неаутентифицированный POST, вызывающий наш исходящий вызов к эквайеру, — это усилитель трафика и способ выжечь лимиты эквайера. Практика переносится так: колбэк только ставит задачу в очередь, дедуплицированную по orderId, с бэкоффом и потолком частоты на заказ. Плюс allow-list IP эквайера как второй слой.
5. **Подпись, когда её можно включить, а не «всегда перезапрашиваем».** Fail-closed + перезапрос — правильный режим по умолчанию, но постоянная жизнь без подписи означает, что мы не выполняем ни Standard Webhooks, ни 6.2.4 в его буквальном смысле. Если у эквайера есть контрольная сумма колбэка — включить её и оставить перезапрос как второй слой (PayPal держит оба пути одновременно). Сравнение подписи — только в постоянном времени (GitHub).
6. **Тестирование — реальный Postgres обязателен, песочница эквайера — для формы событий, а не вместо БД.** Тесты уникального индекса, RLS по клинике, блокировки строки и инварианта суммы — на настоящей БД. Форма и последовательности событий провайдера — записанные фикстуры/контракт. Отдельно — прогон сверки на тестовых транзакциях с выгрузкой отчётов до выхода в прод, как прямо предписывает Adyen.

### НЕ СДЕЛАНО (В4)

- **Первичная документация эквайера не проверена.** `alfa.rbsuat.com`, `pay.alfabank.ru` и `alfabank.ru` недоступны из этого окружения (TLS: `self signed certificate in certificate chain` — российский корневой УЦ не в доверенном хранилище). Поэтому **не подтверждены по первоисточнику**: точная семантика контрольной суммы callback (симметричная/асимметричная, обязательна ли), точный набор статусов и полей `getOrderStatusExtended`, наличие серверной идемпотентности регистрации заказа по уникальности `orderNumber`. Утверждение «у нашего эквайера подпись может отсутствовать» основано на поисковой выдаче официальной страницы FAQ Альфа-Банка, а **не** на прямой цитате из скачанного документа. Проверять надо по PDF «Инструкция по подключению и использованию API» с партнёрского портала.
- **Источник Stripe/Adyen, разрешающий «неподписанный вебхук + перезапрос», не найден и, судя по всему, не существует** — у них подпись обязательна. Ближайший документированный аналог — постбэк-верификация PayPal, но она подразумевает наличие подписи, которую проверяет провайдер.
- **ASVS 5.0 цитировался из markdown ветки master репозитория OWASP/ASVS, а не из релизного PDF v5.0.0** (raw-файл релизной ветки отдал 404). Номера V2.3.1–V2.3.4 стоит сверить с релизным PDF.
- **PCI DSS цитировался по SAQ D for Merchants v4.0 (апрель 2022)**, а не по полному тексту PCI DSS v4.0.1 (июнь 2024). Формулировки требований не менялись, но нумерацию и Applicability Notes стоит сверить.
- **Не исследовались** (вне заданного вопроса): требования 152-ФЗ и медицинского регулирования к хранению финансового журнала пациента, требования ЦБ РФ / НСПК к сверке, специфика RLS-политик для журнала.
- **Не найдено** citable-источника от именованной компании конкретно про «reconciliation testing» как отдельную дисциплину с методикой.

---

## В5 — очередь доставки и идемпотентность

### Как делают в мире

#### 1. Postgres как очередь: `FOR UPDATE ... SKIP LOCKED` — это канон, а не самодеятельность

`SKIP LOCKED` появился в **PostgreSQL 9.5** (автор Thomas Munro), формулировка релиз-ноутов: «Add SELECT option SKIP LOCKED to skip locked rows… This does not throw an error for locked rows like NOWAIT does» — https://www.postgresql.org/docs/release/9.5.0/

Официальная документация (PostgreSQL 18, актуальная ветка) даёт ровно наш use-case и прямо ограничивает применимость:
> «With SKIP LOCKED, any selected rows that cannot be immediately locked are skipped… Skipping locked rows provides an inconsistent view of the data, so this is not suitable for general purpose work, but **can be used to avoid lock contention with multiple consumers accessing a queue-like table**.»
> https://www.postgresql.org/docs/current/sql-select.html

То есть «одна задача не выдаётся двум воркерам» — это ровно то, для чего вендор благословил конструкцию. Именованные реализации, все на этом:

| Система | Язык/стек | Что документирует |
|---|---|---|
| **River** | Go + Postgres | SKIP LOCKED, транзакционная постановка задач — https://riverqueue.com/docs |
| **Oban** | Elixir + Postgres | https://hexdocs.pm/oban/Oban.html |
| **Solid Queue** | Rails 8, 37signals/DHH | «leverages the `FOR UPDATE SKIP LOCKED` clause, if available, to avoid blocking and waiting on locks when polling jobs» — https://github.com/rails/solid_queue/blob/main/README.md |
| **graphile-worker** | Node + Postgres | https://worker.graphile.org/docs |
| **pgmq** | расширение Postgres | «Like AWS SQS and RSMQ but on Postgres» — https://github.com/pgmq/pgmq |

Отдельно про **Solid Queue**: 37signals сделали её именно чтобы уйти с Redis, и в Rails 8 она — бэкенд Active Job по умолчанию в новых приложениях (мотивация в issue rails/rails#50442: «run jobs in production without either additional dependencies (like Redis)…») — https://dev.37signals.com/introducing-solid-queue/ и https://github.com/rails/rails/issues/50442

Вендорные материалы «просто возьмите Postgres»: Crunchy Data «Devious SQL: Message Queuing Using Native PostgreSQL» (2021) — https://www.crunchydata.com/blog/message-queuing-using-native-postgresql ; Neon «Queue System using SKIP LOCKED in Neon Postgres» — https://neon.com/guides/queue-system

**Известные оговорки, которые канон тоже проговаривает.** Crunchy Data предупреждает про раздувание таблицы: «you would need to monitor table bloat… and then tune autovacuum settings appropriately», вплоть до периодической ротации таблицы очереди (2021, ссылка выше). Gunnar Morling (создатель Debezium) в «"You Don't Need Kafka, Just Use Postgres" Considered Harmful» (03.11.2025) — https://www.morling.dev/blog/you-dont-need-kafka-just-use-postgres-considered-harmful/ — говорит, что long-running transactions у консьюмеров дают MVCC bloat и накопление WAL, а у Postgres нет consumer groups и горизонтального масштабирования; но прямо уступает: «if it fits the bill for you, go for it», рекомендуя брать готовое (pgmq), а не писать своё.

**Чей контекст ближе нашему.** Возражения Morling — про streaming-масштаб и замену Kafka. У нас исходящие уведомления пациентам в медицинском SaaS: единицы–десятки сообщений в секунду в пике, очередь в том же Postgres, что и бизнес-данные. Здесь ближе контекст River/Oban/Solid Queue — и они все выбрали Postgres сознательно.

#### 2. Застрявшая строка: канон — аренда с истечением (lease/visibility timeout) + heartbeat

**(а) Visibility timeout.** AWS SQS: таймаут по умолчанию 30 секунд, максимум 12 часов от первого получения, продлевается через `ChangeMessageVisibility`. Официальная best practice дословно: «**Implement a heartbeat mechanism to periodically extend the visibility timeout**, ensuring the message remains invisible until processing is complete». Если сообщение не удалено до истечения — «the message becomes visible again in the queue… This ensures that messages aren't lost even if the initial processing fails». Плюс DLQ для многократно падающих. — https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html

То же в Postgres: **pgmq** реализует VT прямо в БД, `pgmq.read()` делает сообщение невидимым на `vt` секунд, затем `pgmq.delete()`/`pgmq.archive()` — https://pgmq.github.io/pgmq/latest/

**(б) Аренда с подметанием (sweep).** graphile-worker: «Every 8–10 minutes a worker will sweep for jobs that have been locked for more than 4 hours and will make them available to be processed again automatically» (поля `locked_at`/`locked_by`) — https://worker.graphile.org/docs/error-handling

**(в) Heartbeat + реестр процессов.** Самый сильный вариант, потому что не завязан на угадывание длительности работы:
- **Solid Queue**: процессы шлют heartbeat; супервизор считает процесс мёртвым, если heartbeat не приходил (порог по умолчанию 5 минут), и задачи мёртвого процесса помечаются `SolidQueue::Processes::ProcessPrunedError` / `ProcessExitError` для разбора и ретрая — https://github.com/rails/solid_queue/blob/main/README.md
- **Oban Lifeline plugin**: «uses producer records to periodically rescue orphaned jobs — jobs that are stuck in the executing state because the node was shut down before the job could finish», интервал по умолчанию 1 минута, «only a single node will rescue orphans at any given time» — https://hexdocs.pm/oban/Oban.Plugins.Lifeline.html
- **River**: rescuer + stuck-job handler; River Pro добавил active job rescue на queue heartbeats — https://riverqueue.com/docs/reliable-workers

**Вывод по п.2:** канон — «строка арендуется на срок; срок истекает → строка возвращается в очередь», а heartbeat/реестр процессов — усиление, которое сокращает время восстановления с «таймаут» до «секунды после смерти воркера».

#### 3. At-least-once + идемпотентный потребитель — дефолт индустрии, exactly-once — нет

AWS, дословно про standard queues: «due to the **at-least-once delivery model** of Amazon SQS, there's **no absolute guarantee that a message won't be delivered more than once** during the visibility timeout period» (та же страница visibility timeout). И в руководстве по типам очередей: «If you use a standard queue, you must design your applications to be idempotent» — https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html

Google Cloud Pub/Sub — единственный крупный вендор, который вообще продаёт «exactly-once delivery», и сам же перечисляет границы: работает **только для pull-подписок**, **только когда подписчик в том же регионе**, и «a subscription might receive **multiple copies of the same message due to publish side duplicates**, even with exactly-once delivery enabled»; при истечении ack deadline происходит переотправка — https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery

River формулирует это как контракт библиотеки: «Once a job is inserted, it will be worked with **at least once** semantics… Jobs should be written so that they can still succeed even if run multiple times, which is generally accomplished by making every operation in the job idempotent» — https://riverqueue.com/docs/reliable-workers

**Расхождение источников, которое надо назвать.** pgmq в README пишет: «pgmq guarantees **exactly once delivery** of a message **within a visibility timeout**» (https://github.com/pgmq/pgmq) — это прямо противоречит формулировке AWS про тот же механизм. Это не спор по существу, а разная строгость: pgmq говорит про «не выдадим двум консьюмерам одновременно» (в одной БД под MVCC это действительно достижимо), AWS говорит про распределённый сервис и не даёт даже этого. Сквозного exactly-once (БД + внешний канал Telegram/SMS) не даёт ни один из них, и это принципиально: доставка во внешнюю систему — foreign state mutation, ack может потеряться после отправки. **Ближе к нашему контексту формулировка pgmq в части «внутри одной Postgres», и формулировка AWS/River в части «сквозной доставки пациенту».** Практический вывод: at-least-once наружу + дедупликация на стороне отправки (ключ идемпотентности на сообщение), а не попытка построить exactly-once.

#### 4. `Idempotency-Key`: черновик IETF **истёк**, де-факто норма — Stripe

Это самая важная фактическая правка к формулировке В5.

**Статус черновика на август 2026:**
- Текущая (и последняя) ревизия — **draft-ietf-httpapi-idempotency-key-header-07 от 15.10.2025** — https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html
- Datatracker: документ в состоянии **«Expired Internet-Draft… no longer active»**, срок истёк **18.04.2026**, номер RFC **не присвоен**, intended std level **не задан** — https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- Рабочая группа **httpapi** жива и публикует RFC (RFC 9457 Problem Details 2023, RFC 9512 YAML 2024, RFC 9652 Link-Template 2024, RFC 9727 api-catalog 2025, RFC 9745 Deprecation 2025), в активных документах сейчас Byte Range PATCH, RateLimit headers и REST API Media Types — **idempotency-key среди них нет** — https://datatracker.ietf.org/wg/httpapi/documents/

То есть: это не стандарт и на стандарт сейчас не движется. Ссылаться на него как на «IETF-норму» — фактическая ошибка.

**Что черновик -07 всё же нормирует (полезно как чек-лист семантики):**
- поле `Idempotency-Key` — Item Structured Header, значение MUST быть String;
- повтор с тем же ключом: «The resource SHOULD respond with the result of the previously completed operation, success or an error»;
- **409 Conflict** — «the request was retried before the original request completed» (конкурентный запрос);
- **422 Unprocessable Content** — «an attempt to reuse an idempotency key with a different request payload»;
- **400 Bad Request** — ключ обязателен, но не прислан;
- TTL: «The resource MAY require time based idempotency keys… SHOULD define such expiration policy and publish it in the documentation»;
- область уникальности: «Uniqueness of the key MUST be defined by the resource owner» — то есть скоуп (у нас: **на арендатора/тенанта**) определяем мы.

**Кто что реально делает — сводка по официальной документации:**

| Вендор | Имя ключа | Где | Лимит | TTL | Конфликт полезной нагрузки | Конкурентный запрос |
|---|---|---|---|---|---|---|
| **Stripe** | `Idempotency-Key` | HTTP-заголовок | ≤255 симв., рекомендуют UUIDv4 | ключи вычищаются «after they're at least 24 hours old» | **400** `idempotency_error`: «Keys for idempotent requests can only be used with the same parameters they were first used with» | результат не сохраняется, запрос можно ретраить |
| **Adyen** | `idempotency-key` | HTTP-заголовок | **≤64** симв. | «valid for a minimum period of **7 days**» | не документировано | **HTTP 422 или 409**, код ошибки **704** «request already processed or in progress» |
| **Square** | `idempotency_key` | **поле тела запроса**, не заголовок | — | — | ошибка «you used the idempotency key previously» (варьируется по API) | — |
| **PayPal** | **`PayPal-Request-Id`** | HTTP-заголовок | ≤38 симв. (UUID) | «stores for a period of time» | — | — |
| **Twilio** | **`I-Twilio-Idempotency-Token`** | HTTP-заголовок | — | — | — | at-least-once доставка вебхуков, дедуп на стороне клиента |
| **Shopify** | idempotency key | **GraphQL-аргумент или директива `@idempotent`** | — | — | — | — |

Ссылки: https://docs.stripe.com/api/idempotent_requests · https://docs.stripe.com/api/errors · https://docs.adyen.com/development-resources/api-idempotency · https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency · https://developer.paypal.com/api/rest/reference/idempotency/ · https://shopify.dev/docs/api/usage/idempotent-requests · https://shopify.engineering/building-resilient-graphql-apis-using-idempotency

**Что из этого следует.** Универсально согласована **семантика** (ключ от клиента → сохранённый ответ переигрывается → конфликт при том же ключе с другим телом → ключ живёт ограниченное время). **Имя заголовка не согласовано вообще**: Stripe и Adyen — `Idempotency-Key`, PayPal и Twilio — свои имена, Square и Shopify вообще не в заголовке. Черновик IETF — попытка кодифицировать практику Stripe (соавтор — Jayadeba Jena из PayPal, слайды на IETF 111: https://datatracker.ietf.org/meeting/111/materials/slides-111-httpapi-idempotency-header-00), и она не дошла до RFC.

#### 5. «Строка ключа вставляется ПЕРВОЙ под уникальным индексом» — да, документированный именованный паттерн

**Brandur Leach (Stripe), «Implementing Stripe-like Idempotency Keys in Postgres», 2017** — https://brandur.org/idempotency-keys
Дословно из статьи: уникальный индекс **скоупится на владельца**, а не глобально:
```
CREATE UNIQUE INDEX idempotency_keys_user_id_idempotency_key
  ON idempotency_keys (user_id, idempotency_key)
```
— для нас это ровно tenant-scoped ключ, а не глобальный (важно для мультиарендной медицинской платформы: чужой ключ не должен пересекаться с нашим и не должен утекать между арендаторами).
Далее: колонка `locked_at` — если она свежая, второй запрос получает `halt 409, … error_request_in_progress`; сверка `if key.request_params != params` → тоже конфликт; `recovery_point` (`started` → … → `finished`) фиксирует прогресс атомарными фазами между внешними мутациями, чтобы ретрай продолжал с последней точки, а не с нуля; `response_code`/`response_body` хранят ответ для переигрывания.

**Shopify Engineering, «Building Resilient GraphQL APIs Using Idempotency», 27.08.2019** — https://shopify.engineering/building-resilient-graphql-apis-using-idempotency
Модель `IncomingRequest`, уникальная по (клиент, ключ идемпотентности); при одновременных запросах — «a lock around the API call based on the client and idempotency key will allow the server to **reject the request with an HTTP code of 409**»; прогресс разбит на «steps / recovery points» по типу побочного эффекта (без эффектов / локальная запись / вызов внешнего сервиса), у каждого шага есть `run` и опциональный `recover`.

Итог: наш пункт «повтор того же запроса возвращает сохранённый результат, чужая полезная нагрузка конфликтует» — дословно эти две статьи.

### ВОПРОС ВЛАДЕЛЬЦА: «Idempotency-Key + transactional outbox — это норма?»

**Прямой ответ: наполовину. Одна половина — норма, другая половина у нас, скорее всего, лишняя.**

**(1) `Idempotency-Key` — норма, но не потому, что это IETF.** Черновик `draft-ietf-httpapi-idempotency-key-header` **истёк 18.04.2026** на ревизии **-07 (15.10.2025)**, номера RFC нет, в активных документах WG httpapi его нет (https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ , https://datatracker.ietf.org/wg/httpapi/documents/). Норма здесь — **де-факто стандарт Stripe**, который черновик и пытался записать. Практический вывод: брать имя заголовка `Idempotency-Key` и семантику Stripe/Adyen — правильно; писать в документе «по стандарту IETF» — неправильно, это истёкший черновик. Формулировать надо так: «семантика по практике Stripe/Adyen, совместима с draft-ietf-httpapi-idempotency-key-header-07».

**(2) Transactional outbox — норма для проблемы, которой у нас, по описанию, нет.**

Outbox решает **строго одну** проблему: dual write, когда БД и брокер — **разные системы**, и надо, чтобы сообщение ушло тогда и только тогда, когда коммитнулась транзакция.
- Chris Richardson, microservices.io: проблема — «How to atomically update the database and send messages to a message broker?»; выгода — «Messages are guaranteed to be sent if and only if the database transaction commits» — https://microservices.io/patterns/data/transactional-outbox.html
- AWS Prescriptive Guidance: «resolves the dual write operations issue… when an application writes to two different systems» (пример с CDC добавлен 23.02.2024) — https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- Microsoft Azure Architecture Center (Cosmos DB + Service Bus) — https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
- Debezium, «Reliable Microservices Data Exchange With the Outbox Pattern» (19.02.2019) + Outbox Event Router SMT — https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
- Confluent, «Understanding the Dual-Write Problem and Its Solutions» — https://www.confluent.io/blog/dual-write-problem/

**У нас `outgoing_delivery_queue` живёт в ТОМ ЖЕ PostgreSQL, что и бизнес-данные.** Значит вставка строки очереди — часть той же транзакции, и «сообщение уходит тогда и только тогда, когда коммит» получается бесплатно, без релея и второй таблицы. Это утверждение есть у именованных источников дословно:

- **DBOS** (компания, основанная Michael Stonebraker и Matei Zaharia), официальная документация:
  > «the order row and the enqueued workflow commit (or roll back) together: the notification workflow is durably enqueued if and only if the order is created. **This is exactly the guarantee a conventional outbox provides, except the "outbox" is DBOS's own queue table.**»
  > — https://docs.dbos.dev/python/examples/outbox
  Там же честная оговорка про семантику: транзакционный шаг — exactly-once для записи в БД, но «Other operations may execute at-least-once, and so should be idempotent (the same is true in a conventional transactional outbox pattern, where messages are sent from the outbox with at-least-once semantics)».
- **River** (Brandur Leach), официальная документация «Transactional enqueueing»: «When you enqueue a job in River, you can do so in a transaction with any other changes you're making» — https://riverqueue.com/docs/transactional-enqueueing ; развёрнутое обоснование с разбором четырёх режимов отказа — в его статье «River: a Fast, Robust Job Queue for Go + Postgres», 20.11.2023 — https://brandur.org/river
- **Зеркальное подтверждение от Solid Queue**: README рекомендует Active Job `enqueue_after_transaction_commit` **именно тогда, когда очередь лежит в ОТДЕЛЬНОЙ базе** — то есть «стейджинг нужен, только если БД разные» — https://github.com/rails/solid_queue/blob/main/README.md
- Исторический первоисточник самого стейджинга — Brandur, «Transactionally Staged Job Drains in Postgres» (2017) — https://brandur.org/job-drain — и он сам явно про случай, когда очередь в Redis/Sidekiq, а данные в Postgres.

**Честный контраргумент (не замалчивается).** Gunnar Morling, «Revisiting the Outbox Pattern», Decodable, 31.10.2024 — https://www.decodable.co/blog/revisiting-the-outbox-pattern — разбирает критику outbox (нагрузка на БД, сложность, латентность), называет её в основном «theoretical concern rather than… empirically demonstrated problem» и заключает, что паттерн «continues to deserve a very central spot in the toolbox». **Но его контекст — обмен данными МЕЖДУ сервисами через Kafka/CDC.** Наш случай — доставка наружу по каналам из очереди в той же БД. По его же логике outbox нужен там, где есть вторая система записи; у нас её нет между «бизнес-данные» и «строка очереди». Она появляется дальше — между «строкой очереди» и «Telegram/SMS», и **там outbox не помогает вообще**: там работает at-least-once + идемпотентность на стороне отправки.

Альтернативы, которые надо знать, чтобы ответ был честным:
- **Listen to yourself** (Confluent Developer, курс по event-driven микросервисам) — сервис публикует событие и сам его потребляет; описан как альтернатива outbox с оговоркой, что теряется read-your-own-writes — https://developer.confluent.io/courses/microservices/the-listen-to-yourself-pattern/
- **CDC напрямую по таблицам** вместо polling-outbox (Debezium/Morling, ссылки выше) — убирает релей, но требует логической репликации и коннектора; для нас это чистый рост эксплуатационной сложности без выигрыша.
- **Event-carried state transfer** (Martin Fowler, «The Many Meanings of Event-Driven Architecture», GOTO 2017) — про форму событий, не про нашу проблему атомарности.

### Вердикт: **вариант**

Инварианты В5 (одна задача — один воркер; переходы не теряются; застрявшая строка восстанавливается; повтор возвращает сохранённый результат; чужая нагрузка конфликтует) — дословно каноничны и покрываются SKIP LOCKED + аренда/heartbeat + at-least-once + Stripe-подобные ключи идемпотентности. Изобретения здесь нет. Расхождения два, оба в **обосновании**, а не в механике: (1) `Idempotency-Key` подан как норма IETF, тогда как черновик истёк 18.04.2026 и норма здесь де-факто-Stripe; (2) transactional outbox назван частью решения, хотя очередь лежит в той же PostgreSQL — а значит outbox уже встроен в саму вставку строки, и отдельная outbox-таблица с релеем была бы лишним слоем.

### Что практика предлагает вместо

1. **Вместо «outbox + очередь»** — «очередь И ЕСТЬ outbox»: `INSERT INTO outgoing_delivery_queue` в той же транзакции, что и бизнес-изменение. Дешевле: минус таблица, минус процесс-релей, минус лаг релея, минус ещё одно место, где теряются сообщения. Прочнее: гарантия «сообщение существует ⟺ данные закоммичены» даёт сам Postgres, а не наш код. Формулировка DBOS: «the "outbox" is DBOS's own queue table» (https://docs.dbos.dev/python/examples/outbox). Outbox как отдельный слой вернуть придётся ровно в один момент — если очередь переедет в отдельную БД или во внешний брокер; тогда канон — `enqueue_after_transaction_commit`/staged drain (Solid Queue README; brandur.org/job-drain).

2. **Вместо «не потерять переход состояния» через ручную аккуратность** — аренда с истечением как единственный источник истины о владении строкой: `locked_at`/`locked_by`/`visible_at`, дефолт восстановления по таймауту (SQS: 30 c дефолт, 12 ч максимум; graphile-worker: 4 ч, подметание каждые 8–10 мин), плюс heartbeat процесса, чтобы не ждать таймаут при обычном крэше (Solid Queue: порог 5 мин, пометка `ProcessPrunedError`; Oban Lifeline: раз в минуту, «only a single node will rescue orphans at any given time»). Дешевле любого распределённого лока: восстановление — это `UPDATE ... WHERE visible_at < now()`, а не отдельная координационная система.

3. **Вместо попыток exactly-once наружу** — at-least-once + идемпотентный получатель, официальная позиция AWS («you must design your applications to be idempotent») и River («jobs should be written so that they can still succeed even if run multiple times»). Дешевле: не нужен ни 2PC, ни консенсус; дороже становится только один раз — на дедупликацию по ключу сообщения.

4. **Вместо «IETF-совместимости» как цели** — семантика Stripe как цель, черновик как чек-лист: заголовок `Idempotency-Key`; уникальный индекс **(tenant_id, idempotency_key)** — скоуп по арендатору, как у Brandur `(user_id, idempotency_key)`; сохранённый статус+тело для переигрывания (Stripe хранит даже 500); отпечаток тела запроса → ошибка при несовпадении (Stripe 400 `idempotency_error`, черновик 422); конкурентный запрос → 409 (черновик, Brandur, Shopify; Adyen — 422/409 с кодом 704); опубликованный TTL (Stripe ≥24 ч, Adyen ≥7 дней). Прочнее: страховка — уникальный индекс в БД, а не проверка в коде, поэтому гонка проигрывает на уровне Postgres, а не на уровне логики.

5. **Тестирование инвариантов очереди — что реально делают.** Аспирационный верх шкалы: детерминированное симуляционное тестирование — FoundationDB («Determinism is crucial in that it allows perfect repeatability of a simulated run», оценка «roughly one trillion CPU-hours of simulation», https://apple.github.io/foundationdb/testing.html), TigerBeetle VOPR (симулятор с виртуальными часами, детерминированным RNG и инъекцией сетевых/дисковых отказов, https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/internals/vopr.md , https://docs.tigerbeetle.com/concepts/safety/), Antithesis (публичный запуск 2024, https://techcrunch.com/2024/02/13/antithesis-raises-47m-to-launch-an-automated-testing-platform-for-software/), Jepsen (анализ TigerBeetle 0.16.11, https://jepsen.io/analyses/tigerbeetle-0.16.11). Всё это — команды, которые пишут базы данных. Реалистичный уровень для прикладной команды: интеграционные тесты против **настоящего** PostgreSQL (Testcontainers, https://testcontainers.com/modules/postgresql/) — N параллельных воркеров тянут из очереди и проверяют, что каждая строка обработана ровно одним; убийство воркера в середине обработки и проверка, что строка вернулась после истечения аренды; сдвиг времени/аренды вручную для проверки sweep; повторная отправка одного и того же запроса с одним ключом параллельно — ровно одна запись, второй получает конфликт; тот же ключ с другим телом — ошибка. Именно такие проверки делают River/Oban/Solid Queue у себя в CI; DST в нашем классе задач — не норма.

### НЕ СДЕЛАНО (В5)

- **Официальная документация Debezium Outbox Event Router не прочитана напрямую**: страница отдаёт **HTTP 403** на автоматический запрос. Утверждения про Debezium опираются на их блог от 19.02.2019 и на пересказ в поисковой выдаче.
- **Square и Shopify: точные коды ошибок и TTL ключа не документированы публично.** Страница Square объясняет «что» и «зачем», но не даёт ни максимальной длины, ни срока хранения, ни точного кода ответа при несовпадении тела. У Shopify страница «Idempotent requests» не указывает ни TTL, ни коды ошибок. В таблице выше эти клетки пустые честно.
- **Adyen не документирует поведение при том же ключе с ДРУГИМ телом запроса** — только конкурентный случай (704).
- **Не найдено официального заявления Google или AWS вида «exactly-once невозможно»** — это академический тезис, а не вендорная формулировка. Вместо него в отчёте документированные границы, которые проверяемы.
- **Не проверялось**, есть ли специфические требования к очередям доставки в медицинском контексте (HIPAA/152-ФЗ).
- **Репозиторий не читался**; сопоставление сделано по тексту формулировки пункта.

---

## В6 — удаление и слияние пользователя

Источники: официальные спецификации (HL7 FHIR, HL7 EHR-S/PHR-S FM, IHE), регуляторы (EDPB, ICO, HHS/OCR, DPC Ireland, Роскомнадзор, Минздрав РФ), NIST, документация Microsoft/PostgreSQL и инженерные доки названных компаний (Stripe, Shopify, Twilio Segment, GitLab, Medplum).

### Как делают в мире

**Жёсткое удаление медицинского/финансового пользователя — НЕ норма. Норма — редактирование PII с сохранением обезличенного факта.** Это подтверждается и правом, и практикой.

**Право: удаление медкарты почти всегда блокируется исключениями.**
- GDPR ст. 17(3) — право на стирание не абсолютно; исключения включают юридическую обязанность, общественный интерес в сфере здравоохранения (ст. 9(2)(h),(i)), архивацию/исследования (ст. 89(2)) и защиту правовых требований. ([EDPB, отчёт CEF 2025, принят 10.02.2026](https://www.edpb.europa.eu/system/files/2026-02/edpb_cef-report_2025_right-to-erasure_en.pdf)).
- Ирландский регулятор (DPC) прямо про медзаписи: исключения из права на стирание *«will likely apply more often than not to personal data contained in medical records»* — то есть отказ в удалении медкарты является нормой, а не исключением. ([DPC Ireland](https://dataprotection.ie/en/can-i-use-gdpr-have-my-medical-records-amended-or-erased)). Там же: медицинское заключение — «snapshot in time», его не исправляют и не удаляют, к нему **прикладывают supplementary statement**.
- **Важная поправка к формулировке задачи:** HIPAA §164.316(b)(2) — это шесть лет хранения **документации политик и процедур**, а НЕ медкарт. HHS прямо: *«The HIPAA Privacy Rule does not include medical record retention requirements. Rather, State laws generally govern how long medical records are to be retained.»* ([HHS FAQ 580](https://www.hhs.gov/hipaa/for-professionals/faq/580/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html)). Ссылаться на §164.316(b)(2) как на срок хранения медданных — распространённая ошибка.

**Юрисдикция РФ меняет ответ в сторону ужесточения, а не смягчения.**
- 152-ФЗ ст. 21: при достижении целей обработки — уничтожение в течение **30 дней**; при требовании субъекта о прекращении обработки — **10 рабочих дней** (+5 по мотивированному ответу); при отзыве согласия — 30 дней. ([ст. 21 152-ФЗ](https://legalacts.ru/doc/152_FZ-o-personalnyh-dannyh/glava-4/statja-21/)).
- **Приказ Роскомнадзора от 28.10.2022 № 179** (действует 01.03.2023–01.03.2029): факт уничтожения ПДн подтверждается **актом об уничтожении**, а при автоматизированной обработке — актом **И «выгрузкой из журнала регистрации событий в информационной системе персональных данных»**. Акт и выгрузка хранятся **3 года**. ([Контур.Норматив, приказ РКН № 179](https://normativ.kontur.ru/document?moduleId=1&documentId=437010)). Это прямой юридический аналог требования «„удалено“ не должно ложно рапортоваться»: в РФ доказательство удаления — машинный журнал событий, а не ответ API.
- Сроки хранения медицинской документации в РФ заданы **приказом Минздрава России от 03.08.2023 № 408** (медкарта стационарного больного — 25 лет). ([Минздрав России](https://minzdrav.gov.ru/documents/9741-prikaz-ministerstva-zdravoohraneniya-rossiyskoy-federatsii-ot-3-avgusta-2023-g-408-ob-utverzhdenii-perechnya-dokumentov-obrazuyuschihsya-v-deyatelnosti-ministerstva-zdravoohraneniya-rossiyskoy-federatsii-i-podvedomstvennyh-emu-organizatsiy-s-ukazaniem-srokov-hraneniya)). То есть «удалить пациента» в РФ-клинике юридически невозможно почти никогда.

**Что регулятор ЕС говорит про анонимизацию как замену удалению (свежее, 2026).** EDPB CEF 2025 (принят 10.02.2026, опубликован 18.02.2026) назвал **семь** повторяющихся проблем; из них релевантны три:
- *Issue 7 — анонимизация:* «A common practice among responding controllers is relying upon anonymisation as a substitute for a permanent deletion». EDPB **не запрещает** это, но фиксирует провал реализации: *«in some cases, they only apply basic pseudonymisation or partial masking, although such a process would not fulfil the requirements of the GDPR regarding deletion»*. Вывод: анонимизация легитимна как способ исполнения ст. 17 — **только если она необратима**; псевдонимизация/маскирование ею не является.
- *Issue 6 — бэкапы:* половина надзорных органов отметила проблемы; многие операторы не имеют процедур для бэкапов и полагаются на ротацию.
- *Issue 5 — сроки хранения.* ([EDPB CEF 2025 report](https://www.edpb.europa.eu/system/files/2026-02/edpb_cef-report_2025_right-to-erasure_en.pdf); [пресс-релиз EDPB, 18.02.2026](https://www.edpb.europa.eu/news/edpb-identifies-challenges-hindering-the-full-implementation-of-the-right-to-erasure_en)).

**Бэкапы: канон — «put beyond use», а не мгновенное стирание.** ICO: удаление исполняется немедленно на live-системах, данные в бэкапе остаются до перезаписи по расписанию; обязанность — не использовать их ни для чего иного и **явно сообщить субъекту, что произойдёт с его данными, включая бэкапы**. ([ICO, Right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)).

**Crypto-shredding — named и определён, но спецификация сменилась.** ⚠️ **NIST SP 800-88 Rev. 1 отозван 26.09.2025** и полностью заменён на **SP 800-88r2 (сентябрь 2025)**. Ссылаться на Rev. 1 больше нельзя. Определение из r2 дословно:
> «**cryptographic erase (CE)** — A purge sanitization technique in which key sanitization is applied to one or more keys providing confidentiality protections for the encrypted target data, making recovery of the decrypted target data infeasible.»

Там же оговорки: *«the effective use of cryptographic erase depends on the pedigree of cryptographic capabilities and meeting certain pre-conditions»*; стойкость алгоритма ≥128 бит, энтропия ключей, FIPS-140-валидированные модули; и отдельно — ключ мог быть **escrowed / backed up / stored elsewhere**, что нужно закрывать документально. Важное для нас: *«For an ISM that takes the form of logical/virtual storage (e.g., cloud storage), cryptographic erase may be the only viable purge sanitization technique option»*. ([NIST SP 800-88r2](https://csrc.nist.gov/pubs/sp/800/88/r2/final)).

**Что делают названные компании — все четыре редактируют, а не удаляют.**

| Компания | Что делает | Ключевая цитата / URL |
|---|---|---|
| **Stripe** | `redaction_jobs`: объекты остаются, значения заменяются на `[redacted]`; каскад на связанные объекты и на event/request logs. Большинство транзакций редактируются **только через 90 дней** после создания. Необратимо: *«Treat redacted objects as unusable»*. Асинхронно, до 30 дней. | [docs.stripe.com/privacy/redaction](https://docs.stripe.com/privacy/redaction) |
| **Shopify** | «Erase customer personal data» ≠ «delete customer profile»: редактируются имя и адрес, **профиль и история заказов остаются в админке**. Если по закону обязан хранить — не выполнять redaction. | [Shopify Help Center](https://help.shopify.com/en/manual/privacy-and-security/privacy/processing-customer-data-requests) |
| **Twilio Segment** | Асинхронные «regulations»; **suppression отделён от deletion** (`SUPPRESS_ONLY`); SLA 30 дней только для внутренних систем; честно: *«Segment cannot guarantee that deletions in your Amazon S3 instance, your connected data warehouse, or other third-party destinations will be completed during that 30-day period»*. Необратимо: *«you can not Replay the deleted data»*. | [Twilio Segment docs](https://www.twilio.com/docs/segment/privacy/user-deletion-and-suppression) |
| **GitLab** | Два способа: *«Mark for deletion: … This is the preferred approach»* и hard delete. Прямо: *«Direct calls to hard delete classes should be avoided because it can lead to unintended data loss.»* | [docs.gitlab.com/development/deleting_data](https://docs.gitlab.com/development/deleting_data) |

**Итог по удалению: канон = soft delete / suppression + необратимая анонимизация PII + сохранение обезличенного клинического и финансового факта + документальное подтверждение. Hard delete зарезервирован для случаев, когда закон о хранении не применяется.**

### Слияние: канон здравоохранения

Да, это решённая задача с именем. И здесь **наш план расходится с каноном в одном месте и совпадает в другом** — важно не перепутать, в каком.

**1. Проигравшая запись НИКОГДА не удаляется. Она становится надгробием.** FHIR R5 (опубликован 2023), операция `Patient/$merge`:
> «The source Patient resource will be updated to add a new Patient.link reference to the target Patient resource with a link-type of **replaced-by**. The source Patient will also be updated to have a status of **inactive**, unless the source Patient resource was deleted.»
> «The target Patient resource will be updated to add a new Patient.link reference to the source Patient resource with a link-type of **replaces**…»
> «**A server may decide to delete the source record, but this is not defined by the standard merge operation.**»

([HL7 FHIR R5 — Patient $merge](https://www.hl7.org/fhir/R5///patient-operation-merge.html); [FHIR Patient resource, элемент `link`](https://fhir.hl7.org/fhir/patient.html) — `link` помечен как **modifier element**).

**2. А вот ссылки — канон говорит переносить.** Это опровергает соблазн сказать «link, do not move». Норматив прямой:
> «The merge data processing **SHALL update all references** that refer to the source patient to reference the target patient.»

То есть формулировка нашего плана «медзаписи migrated» — **совпадает с FHIR**, а не противоречит ей. Расходимся мы в другом: FHIR переносит *ссылки*, но **не сливает и не дедуплицирует сами клинические записи** и не удаляет источник.

**3. Статус спецификации — честно: это Trial-use Draft, Maturity Level 0** (в Administrative Incubator IG v0.1.0 на FHIR 6.0.0-ballot3). Это канон де-факто, но не Normative. ([HL7 Admin Incubator — Patient-merge](https://build.fhir.org/ig/HL7/admin-incubator/en/OperationDefinition-Patient-merge.html)).

**4. Предшественник, до сих пор operative: HL7 v2 `ADT^A40`** «merge patient — patient identifier list». Сегмент `PID` несёт **выжившие** идентификаторы, сегмент `MRG` (`MRG-1 Prior Patient Identifier List`) — **проигравшие**; сообщение рассылается downstream-системам, чтобы они перенаправили ссылки. ([HL7 v2.5, глава 3](https://www.vico.org/HL7_V2_5/v25/std25/ch03.html); [HL7 v2.4 ch.3](https://www.hl7.eu/HL7v2x/v24/std24/ch03.htm)). То есть «слияние — это событие, которое публикуется», а не локальный UPDATE.

**5. Обратимость (unmerge) — ДА, это нормативное функциональное требование, и это самое важное расхождение с нашим планом.** HL7 EHR-S/PHR-S Functional Model, Record Lifecycle Event **RI.1.1.20 Unmerge**, со ссылкой на **ISO 21089:2018, §15.20**:
> «Occurs when an agent causes the system to reverse a previous record entry merge operation, rendering them separate again.»
> «The system **SHALL** provide the ability to update multiple patient Record Entries that were previously harmonized or integrated by unmerging them according to scope of practice, organizational policy, and/or jurisdictional law.»

([HL7 PHR-S FM R2 — RI.1.1.20 Unmerge](https://build.fhir.org/ig/HL7/phrsfm-ig/en/Requirements-PHRSFMR2-RI.1.1.20.html)).

**6. Но unmerge нигде не описан технически — и это признанная дыра канона.**
- FHIR `$merge` не определяет unmerge; упоминает лишь, что *«Provenance resource MAY be created to link all of the resources … that could then provide information to a potential un-merge operation»* — то есть **журнал слияния и есть механизм обратимости**.
- IHE PIX: *«no UnMerge message is supported by this transaction in the Patient Identity Feed»*. ([IHE ITI TF Vol.1, ch.5 — PIX, ред. 20.0 от 04.08.2023](https://profiles.ihe.net/ITI/TF/Volume1/ch-5.html)).
- EMPI/MPI-практика требует UI стюардства с операциями search/merge/**unmerge**.

**7. Названная инженерная реализация — Medplum (healthcare-платформа), и она формулирует ровно наш trade-off.** Medplum **не перемещает клинические ресурсы физически**, а связывает через `Patient.link`; и явно называет цену переписывания ссылок:
> «Unmerging a single `Patient` might require rewriting references for a large number of clinical resources.»
> Стратегия «Independent Master Record»: *«unmerging simply involves unlinking a source `Patient` from the master and rerunning the merge operation»*; стратегия «Record Promotion»: *«unmerging is more difficult … it requires using the history API to undo updates»*.
> «It is best practice to build a human review process for **any** patient deduplication pipeline, as no pipeline is free from errors.»

([Medplum — Patient deduplication: Merging](https://www.medplum.com/docs/fhir-datastore/patient-deduplication/merging)).

**Итог по слиянию: канон = (a) проигравший становится `inactive` + `replaced-by`, его не удаляют; (b) ссылки перенаправляются (SHALL); (c) слияние публикуется как событие для downstream; (d) unmerge — нормативное требование (ISO 21089 / HL7 FM), реализуемое через Provenance/журнал слияния; (e) обязателен человеческий review перед автоматическим слиянием.**

### Вердикт: **вариант**

Пункт В6 попадает в канон по трём из четырёх осей — «migrated» ссылок соответствует FHIR `SHALL update all references`, «блокеры оставляют всё нетронутым» соответствует двухфазной модели Stripe и правилу Azure о точках невозврата, «„удалено“ не сообщается ложно» соответствует и честности Segment, и приказу РКН № 179. Расходится он в двух местах: (1) слово **«дедуплицируются»** — канон здравоохранения дедупликацию клинических записей не выполняет, он оставляет обе записи и связывает их; (2) **отсутствует обратимость (unmerge)**, которая в HL7 EHR-S FM / ISO 21089-2018 является SHALL-требованием, а не опцией.

### Что практика предлагает вместо

1. **Вместо «merge + deduplicate» — «link + repoint + tombstone».** Проигравший `platform_user` не удаляется: `active=false` + ссылка `replaced-by` на выжившего, у выжившего — `replaces`. Дешевле, потому что убирает целый класс невосстановимых ошибок: неверное слияние двух пациентов в медицине — событие с клиническим риском, и вероятность его ненулевая при любом матчинге (Medplum: «no pipeline is free from errors»).

2. **Вместо «migrated» как разрушительного UPDATE — журнал слияния как первичный артефакт.** FHIR прямо указывает `Provenance` как носитель информации для будущего un-merge. Практически: строка «что, откуда, куда, когда, кем» на каждую перенаправленную ссылку. Это ровно та цена, которую Medplum называет неизбежной, если ссылки всё-таки переписываются. Без журнала unmerge стоит «использовать history API», т.е. дороже.

3. **Вместо «delete» — двухфазный redaction job по модели Stripe.** Фаза `validating` собирает **все** блокеры и возвращает их списком (`GET /v1/privacy/redaction_jobs/{id}/validation_errors`); режим по умолчанию `error` — **падает, если хоть один объект не может быть отредактирован**. Только затем `execute`. Это буквально требование «блокеры оставляют всё нетронутым», реализованное как продуктовая поверхность. Плюс FHIR даёт готовый примитив: параметр `preview=true`, при котором *«the merge will not be actually performed; an OperationOutcome will be returned»*.

4. **Вместо «всё в одной транзакции» — явные точки невозврата.** FHIR честно предупреждает: *«There is also no implication that these changes are happening within a single transaction»*. Microsoft (Compensating Transaction Pattern, обновлён 16.04.2026) даёт правило: *«Define clear points of no return and irreversible steps … Design the workflow so that irreversible steps occur only after all critical validations succeed»*; компенсации сами могут падать, поэтому шаги обязаны быть идемпотентны, а прогресс — записан. ([Microsoft Learn — Compensating Transaction](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction); [Saga pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)). Практический вывод для нас: **всё, что внутри одной PostgreSQL-транзакции, действительно all-or-nothing бесплатно; всё, что за её пределами (файлы, письма, внешние системы), — нет, и это надо признать явно.**

5. **Вместо «удалить пользователя» — суппрессия + необратимая анонимизация PII + сохранение обезличенного факта.** Разделение Segment (`SUPPRESS_ONLY` отдельно от deletion) закрывает срок «10 рабочих дней прекратить обработку» из 152-ФЗ ст. 21, не трогая медданные, хранение которых обязательно по приказу Минздрава № 408. Предупреждение EDPB (Issue 7) применимо напрямую: маскирование и псевдонимизация **не считаются** удалением — если анонимизируем, то необратимо; если нужен реальный unlink — crypto-shredding по NIST SP 800-88r2 с обязательным закрытием вопроса escrow/backup ключей.

6. **Вместо «отрапортовать deleted» — доказательство удаления.** В РФ это не стилистика, а норма: акт об уничтожении **плюс** выгрузка из журнала регистрации событий ИСПДн (приказ РКН № 179), хранение 3 года. Инженерно это означает, что источником истины о факте удаления должен быть аудит-лог, из которого можно сделать выгрузку, а не возвращаемое API значение. Для бэкапов — модель ICO «beyond use» + явное информирование субъекта.

**Про тестирование деструктивных операций — то, что удалось обосновать первоисточниками:**

- **Проверять только после `COMMIT` и из другой сессии.** Механизм ложного «удалено» задокументирован в PostgreSQL: *«SELECT does see the effects of previous updates executed within its own transaction, even though they are not yet committed»*, тогда как для других сессий *«a SELECT query … sees only data committed before the query began; it never sees either uncommitted data…»*. Проверка внутри той же транзакции **гарантированно подтвердит** удаление, которое потом откатится. ([PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)).
- **Orphan-строки: их надо делать невозможными, а не искать.** PostgreSQL: FK-ограничение — *«Now it is impossible to create orders with non-NULL product_no entries that do not appear in the products table»*; выбор `ON DELETE`: *«When the referencing table represents something that is a component of what is represented by the referenced table and cannot exist independently, then CASCADE could be appropriate. If the two tables represent independent objects, then RESTRICT or NO ACTION is more appropriate»*. По умолчанию — `NO ACTION`, то есть удаление ссылаемой строки **упадёт с ошибкой**. Осторожно: FK не защищает при NULL в ссылающейся колонке. ([PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)).
- **Pre-flight как тестируемая поверхность:** `preview=true` (FHIR) и `validation_errors` (Stripe) — оба сделаны именно затем, чтобы деструктив можно было прогнать «вхолостую» и в тесте, и в проде.
- **Human-in-the-loop для слияния** (Medplum; и Microsoft: *«When decisions are high impact or hard to automate reliably, include a human in the decision-making process»*).

### НЕ СДЕЛАНО (В6)

1. **Тестовый канон — самая слабая часть раздела.** Авторитетного первоисточника (не блог-фермы) конкретно про «orphan-row detection после удаления» и «интеграционные тесты деструктивных операций на реальной БД» **не найдено**. Поиск дал только Medium/dev.to — отброшены по правилам задачи. Официальную документацию Testcontainers агент не открывал. Всё, что выше про тестирование, выведено из документации PostgreSQL и из product-поверхностей FHIR/Stripe, а не из отдельного стандарта тестирования.
2. **Не найдено спецификации `$unmerge`.** Требование обратимости нормативно (ISO 21089-2018 §15.20 / HL7 FM RI.1.1.20), но **технического стандарта отмены слияния не существует**: FHIR его не определяет, IHE PIX явно не поддерживает. Вендорские реализации (Aidbox/Health Samurai, Netsmart CareConnect — experimental) не верифицированы и в отчёт как канон не включены.
3. **Не проверен первоисточник по HIPAA §164.316.** eCFR отдал 302-редирект; дословная цитата (b)(1)/(b)(2) не извлечена. Утверждение «§164.316(b)(2) — про документацию, не про медкарты» опирается на HHS FAQ 580, а не на текст регламента.
4. **Приказ РКН № 179 и приказ Минздрава № 408 прочитаны не по официальной публикации** (pravo.gov.ru), а по Контур.Нормативу и карточке на minzdrav.gov.ru. Полный текст № 408 **не открывался** — «25 лет для стационарной медкарты» взято из вторичного изложения и требует проверки по тексту приказа.
5. **Не искалось**: инженерные посты Google/Meta об удалении аккаунта; отдельная позиция EDPB по анонимизации (Guidelines в работе, дело CJEU C-413/23 P *EDPS v. SRB* от 04.09.2025 не читалось); практика удаления в мультиарендных БД с RLS конкретно (пересечение «RLS + удаление» не покрыто ни одним найденным источником).
6. **Применимость к нашей схеме данных не оценивалась** — репозиторий по условию задачи не читался.

---

## В8 + Ч2 (+ В10) — медиа: выдача байтов и целостность карточки

### Как делают в мире

#### 1. Авторизованная выдача приватных файлов из объектного хранилища

**Что говорят вендоры про presigned URL — и что они сами признают его ограничением.**

AWS в пользовательском руководстве S3 формулирует прямо: «*The capabilities of a presigned URL are limited by the permissions of the user who created it. In essence, **presigned URLs are bearer tokens that grant access to those who possess them**. As such, we recommend that you protect them appropriately*» — [docs.aws.amazon.com, S3 User Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) (редакция 2025). Там же: единственный рантайм-контроль — время; «*Anyone with valid security credentials can create a presigned URL*». Per-request проверки владельца объекта в этой модели **нет вообще**.

AWS Prescriptive Guidance «Establishing guardrails and monitoring for presigned URLs» (обновление август 2025) добавляет два документированных класса утечки:
- подпись едет в query-string и **утекает через логи и прокси**: «*the signature is transmitted as the `X-Amz-Signature` query string parameter… Clients should use redaction or masking to remove the signature before logging URIs*» — [logging-interactions.html](https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/logging-interactions.html);
- истечение срока — не защита, а *смягчение*: «*the fact that presigned URLs expire mitigates the risks of log exposure, as long as the exposure is delayed long enough for the signatures to expire*».

Google Cloud формулирует то же ещё жёстче: «***Anyone in possession of the signed URL can use it while it's active, regardless of whether they have a valid account***», максимум 604 800 с — [Google Cloud Storage, «Signed URLs»](https://docs.cloud.google.com/storage/docs/access-control/signed-urls) (2025). Cloudflare R2: «*Anyone with the URL can perform the specified operation until it expires*», «***Treat presigned URLs as bearer tokens***» — [developers.cloudflare.com](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) (2025).

Три независимых вендора говорят одно и то же: **presigned URL — это транспорт, а не авторизация.** Ноль расхождений между источниками.

**CloudFront signed URLs / cookies** — то же семейство bearer-креденшелов, но с архитектурной ремаркой, которая почти дословно совпадает с формулировкой Ч2: AWS рекомендует не просто выдавать подписи, а **запретить обходной путь**: «*Require that your users access your content by using CloudFront URLs, not URLs that access content directly on the origin server… Requiring CloudFront URLs isn't necessary, but **we recommend it to prevent users from bypassing the restrictions** that you specify in signed URLs or signed cookies*» — [docs.aws.amazon.com, «Serve private content with signed URLs and signed cookies»](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html). Это буквально «одна дверь + запрет обхода двери», сформулированное AWS.

**Что рекомендуют именно для PHI/медданных.** Честный ответ: *отдельной вендорской нормы «как отдавать байты PHI» не существует*. Профильный whitepaper AWS «Architecting for HIPAA Security and Compliance on AWS» **заархивирован** — «*Notice: This whitepaper has been archived*». Живая замена — [AWS Well-Architected Healthcare Industry Lens](https://docs.aws.amazon.com/wellarchitected/latest/healthcare-industry-lens/identity-and-access-management.html) (2023–2024), но он говорит про классификацию данных, теги, выделенные аккаунты и least privilege — то есть про **инфраструктурный** периметр, а не про объектную авторизацию на запрос.

Домейн-канон для «кто имеет право видеть этот конкретный документ пациента» лежит не у облаков, а у **HL7 FHIR** и **OWASP** — см. п. 2. Для нашего контекста (мультиарендная медплатформа, RLS в Postgres) ближе именно они.

**Практический синтез:** авторизация выполняется в приложении на каждый запрос (ASVS 8.2.2 / 8.4.1), а presigned URL — если он вообще используется — выпускается **после** успешной проверки, на конкретный ключ, с минимальным TTL, и его подпись редактируется в логах. Альтернатива «стримить байты через приложение» документированно даёт per-request авторизацию ценой трафика/латентности.

#### 2. «Чужой UUID не должен раскрывать ни существование, ни байты»

**Канонический класс уязвимости — назван, и не один раз.**

- **OWASP API Security Top 10 (2023), API1:2023 Broken Object Level Authorization** — первый риск списка. Меры: «*Implement a proper authorization mechanism that relies on the user policies and hierarchy*»; «*use the authorization mechanism to check… **in every function** that uses an input from the client to access a record in the database*»; «*Write tests to evaluate the vulnerability of the authorization mechanism. **Do not deploy changes that make the tests fail***» — [owasp.org/API-Security](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/).
- **OWASP Top 10:2025, A01 Broken Access Control** (релиз 6 ноября 2025, снова №1): «*Except for public resources, deny by default*»; «***Implement access control mechanisms once and reuse them throughout the application***»; «*Model access controls should enforce **record ownership***» — [owasp.org/Top10/2025/A01](https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/).
- **OWASP ASVS 5.0 (2025), V8 Authorization**:
  - **8.2.2 (L1)**: «*Verify that the application ensures that data-specific access is restricted to consumers with explicit permissions to specific data items to mitigate insecure direct object reference (IDOR) and broken object level authorization (BOLA)*»;
  - **8.3.1 (L1)**: «*…enforces authorization rules at a trusted service layer…*»;
  - **8.4.1 (L2)**: «*Verify that **multi-tenant applications use cross-tenant controls** to ensure consumer operations will never affect tenants with which they do not have permissions to interact*» — [ASVS 5.0, V8](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md). 8.4.1 — это ровно «канонический UUID пациента не должен работать поперёк клиник».

**«Неугадываемый UUID как единственная защита» — явно назван недостаточным.** OWASP IDOR Prevention Cheat Sheet: «*In some cases, using more complex identifiers like GUIDs can make it practically impossible for attackers to guess valid values. **However, even with complex identifiers, access control checks are essential.***» И в разделе верификации: «*Verify that the application denies unauthorized access **regardless of whether the object identifier is predictable or unguessable***» — [cheatsheetseries.owasp.org](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html).

**404 vs 403 — авторитетная норма есть, но она диспозитивная.**

RFC 9110 (HTTP Semantics, IETF, 2022), §15.5.4 — дословно: «*An origin server that wishes to "hide" the current existence of a forbidden target resource **MAY** instead respond with a status code of 404 (Not Found).*»; §15.5.5: «*The 404 status code indicates that the origin server did not find a current representation for the target resource **or is not willing to disclose that one exists***» — [rfc-editor.org/rfc/rfc9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.4). Обратите внимание: **MAY, не SHOULD и не MUST.**

**А медицинский канон высказывается прицельно.** HL7 FHIR R5, §6.1 Security, подраздел «Access Denied Response Handling» — единственный найденный отраслевой текст, разбирающий наш случай буквально:

> «*A web-server, especially hosting FHIR, must choose the response carefully when an Access Denied condition exists.*»
> «*Return a Success with Bundle containing zero results — … **When consistently returned on Access Denied, this will not expose which patients exist**, or what data might be blinded.*»
> «*Return a 404 "Not Found" — This also protects from data leakage… **It does however leak that the user authentication is validated.***»
> «*Return a 403 "Forbidden" — … **It should only be used when the client and/or user is well enough known** to be given this information.*»

— [hl7.org/fhir/security.html](https://hl7.org/fhir/security.html) (FHIR R5, 2023). **Для мультиклинической платформы это и есть ответ: 404 (или пустая коллекция) поперёк клиник, 403 — только внутри своей.**

**Отдельно про «канонический UUID пациента — один на две клиники». Здесь канон FHIR расходится с формулировкой В8, и это важно.** FHIR различает два вида идентичности: «*By a "Location" URL that identifies where it can be accessed (based on the "Logical ID")… By some inherent identifier ("Business Identifier"…) that is part of the resource and **remains fixed as it is copied/moved around***»; и про logical id: «*Each resource has an `id` element which contains the "logical id" of the resource **assigned by the server responsible for storing it**… The logical id is **unique within the space of all resources of the same type on the same server***» — [hl7.org/fhir/resource.html](https://hl7.org/fhir/resource.html). То есть **logical id по канону не является межорганизационным идентификатором**; тождество одного и того же человека выражается через business identifier и `Patient.link` ([hl7.org/fhir/patient.html](https://hl7.org/fhir/patient.html)), плюс MPI/EMPI-слой. Наша формулировка «один UUID на две клиники» склеивает то, что канон намеренно держит раздельно (внутренний ключ хранилища vs идентичность человека), и создаёт ровно тот объект, против которого написан ASVS 8.4.1.

#### 3. Дизайн ключей артефактов (для В10 и Ч2)

- **Prefix-per-tenant vs bucket-per-tenant** — канонизировано AWS SaaS Factory: «*Bucket-Per-Tenant: each tenant would be assigned a bucket*» (упирается в квоту 1000 бакетов на аккаунт), «*Prefix-Per-Tenant: each tenant has a unique prefix which identifies the objects that belong to that tenant*». Для обеих моделей: «*define tenant-specific IAM policies that will be used to **prevent cross-tenant access** to resources*» — [AWS APN Blog, 14 июня 2022](https://aws.amazon.com/blogs/apn/partitioning-and-isolating-multi-tenant-saas-data-with-amazon-s3/). Профильный whitepaper, раздел [Run-time, policy-based isolation with IAM](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/run-time-policy-based-isolation-with-iam.html): в pooled-модели изоляция **не наследуется** от compute-ноды, её нужно принудительно вводить в рантайме.
- **Коллизия ключа «необратима и невидима» — это документированное поведение S3, а не гипотеза.** «*If an object with the same key already exists in the bucket as specified in the presigned URL, **Amazon S3 replaces the existing object with the uploaded object***». Документированное лекарство ровно одно: «*Versioning-enabled buckets can help you recover objects from accidental deletion or overwrite… **By default, S3 Versioning is disabled on buckets, and you must explicitly enable it***» — [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html). У В10 есть канонная пара мер: `orgId` в префиксе ключа (первым сегментом, до любого пользовательского ввода) + включённое версионирование.

#### 4. Семантика удаления медиа: «удалить байты, сохранить запись, обнулить ссылку»

**HL7 FHIR, RESTful API, §3.2.0.7 delete** — дословно:
> «*Whether to support delete at all… is **at the discretion of the server based on the policy and business rules** that apply in its context.*»
> «*Many resources have a **status element that overlaps with the idea of deletion**… the deletion interaction should be understood as **deleting the record of the resource**…*»
> «*For servers that maintain a version history, the delete interaction **does not remove a resource's version history**…*»

— [hl7.org/fhir/http.html](https://hl7.org/fhir/http.html). И там же: удалённый ресурс на чтение отдаёт **410 Gone**, а неизвестный — 404.

**Для вложений конкретно** канон — статусная модель: `DocumentReference.status = current | superseded | entered-in-error` и `docStatus = registered | … | cancelled | entered-in-error | deprecated | unknown` — [hl7.org/fhir/documentreference.html](https://hl7.org/fhir/documentreference.html) (R5, 2023).

Расхождение с нашей формулировкой одно, но содержательное: **NULL не несёт информации.** `NULL` не отличает «файла никогда не было» от «файл был и удалён 12.03», а FHIR-статус — отличает, и это то, чего требует аудитная модель медзаписи (HIPAA Security Rule §164.312(b) Audit Controls, [45 CFR §164.312](https://www.ecfr.gov/current/title-45/section-164.312)).

### Одна дверь и механический гейт: признанная практика?

**Да — и на обоих уровнях, и оба уровня названы.**

**Уровень «одна дверь» (единая точка проверки).**
- OWASP Top 10:2025 A01, дословно: «***Implement access control mechanisms once and reuse them throughout the application***».
- OWASP Authorization Cheat Sheet, «Validate the Permissions on Every Request»: «*Permission should be validated correctly on every request… **The technology used to perform such checks should allow for global, application-wide configuration rather than needing to be applied individually to every method or class.** Remember an attacker only needs to find one way in. **Even if just a single access control check is "missed"**, the confidentiality and/or integrity of a resource can be jeopardized. Validating permissions correctly on just the majority of requests is insufficient*» — [cheatsheetseries.owasp.org, Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). Это дословная формулировка задачи Ч2, включая арифметику «4 обхода из 21 потребителя достаточно».
- AWS CloudFront: требовать доступ только через CloudFront, «*to prevent users from bypassing the restrictions*».

**Уровень «механический гейт, роняющий сборку».**
- **Architecture fitness function** — именованная практика, ринг **Trial**, Thoughtworks Technology Radar; в Vol. 31 (окт. 2024) fitness functions снова упоминаются как контрмера против расползания AI-сгенерированного кода — [thoughtworks.com/radar](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function). Первоисточник термина — Neal Ford, Rebecca Parsons, Patrick Kua, «Building Evolutionary Architectures» (O'Reilly).
- **ArchUnit** (Java) — Radar, ринг Trial, ноябрь 2018 — [thoughtworks.com/radar/tools/archunit](https://www.thoughtworks.com/radar/tools/archunit).
- **TypeScript/JS-эквиваленты**: `dependency-cruiser` — «*validates them against (your own) rules*», отчёт «*in an eslint-like format*» для CI — [github.com/sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser); ESLint `no-restricted-imports` — [eslint.org](https://eslint.org/docs/latest/rules/no-restricted-imports).
- **Build-level гейт у Google — Bazel `visibility`**: «*controls who may depend on your target*»; дефолт — `//visibility:private`; назначение прямо архитектурное: «*help enforce structure as your workspace grows*» — [bazel.build/concepts/visibility](https://bazel.build/concepts/visibility).
- **Banned-imports / enforcement депрекации у названной компании — Google Error Prone, `@RestrictedApi`**: аннотация «*restricts a method to callsites with a whitelist annotation*»; неразрешённые вызовы дают «*a configurable compiler diagnostic*», исключения по regex путей (тесты) — [errorprone.info, RestrictedApi](https://errorprone.info/api/latest/com/google/errorprone/annotations/RestrictedApi.html). Механика ровно наша: «разрешить существующие call-site'ы, запретить новые».
- **Почему гейт должен ронять сборку, а не висеть дашбордом** — эмпирика Google, рецензируемая публикация: Sadowski et al., «Lessons from Building Static Analysis Tools at Google», *Communications of the ACM* 61(4), 2018 — трижды провалившаяся попытка выкатить FindBugs как ночной централизованный дашборд провалилась потому, что он был «*outside the developers' usual workflow*» — [cacm.acm.org](https://cacm.acm.org/research/lessons-from-building-static-analysis-tools-at-google/), [dl.acm.org/doi/10.1145/3188720](https://dl.acm.org/doi/10.1145/3188720).

**Формулировка владельца — «не гейт на каждом роуте, а конструкция, в которой роут не может существовать без гейта» — признанная идея? Да, у неё четыре независимых имени.**

1. **Capability-based security / отсутствие ambient authority.** Классика: Norm Hardy, «The Confused Deputy (or why capabilities might have been invented)», *ACM SIGOPS Operating Systems Review* 22(4), октябрь 1988 — [dl.acm.org/doi/10.1145/54289.871709](https://dl.acm.org/doi/10.1145/54289.871709). Тезис: если полномочие «висит в воздухе» (идентичность процесса), deputy к моменту действия **не знает, зачем у него это полномочие**, и его подставляют; лечится тем, что полномочие переносится вместе с запросом как неподделываемый объект. Современная промышленная реализация — Google Fuchsia: «*A component can interact with the system and other components **only through the discoverable capabilities from its namespace***» — [fuchsia.dev, Capabilities](https://fuchsia.dev/fuchsia-src/concepts/components/v2/capabilities).
2. **«Make illegal states unrepresentable»** — Yaron Minsky, Jane Street: [blog.janestreet.com/effective-ml-revisited](https://blog.janestreet.com/effective-ml-revisited/) (2011).
3. **«Parse, don't validate»** — Alexis King, 5 ноября 2019: валидатор говорит «всё нормально, продолжай» и **выбрасывает знание**, парсер возвращает более точный тип и **сохраняет доказательство в типе**; слоган прямо назван продолжением тезиса Минского — [lexi-lambda.github.io](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/).
4. **Typestate + приватный конструктор** — The Embedded Rust Book: typestate — «*the encoding of information about the current state of an object into the type of that object*», и «*there is **no easy way to magically create an instance** of `Foo`… without calling the `into_foo()` method*» — [docs.rust-embedded.org](https://docs.rust-embedded.org/book/static-guarantees/typestate-programming.html). Это и есть «значение, доказывающее авторизацию, может быть произведено только проверяющей функцией».

**Считает ли индустрия КОНСТРУКЦИЮ выше ПЕРЕЧИСЛЕНИЯ? Да — но не «вместо», а «первым слоем».** Конструкция убирает целый класс, а не экземпляры. Но канон безопасности одновременно запрещает опираться на один-единственный механизм: OWASP Authorization Cheat Sheet — «*Implement defense in depth. **Do not depend on any single framework, library, technology, or control to be the sole thing enforcing proper access control**.*», и OWASP API1:2023 отдельным пунктом требует именно перечисляющий гейт в CI: «*Write tests… **Do not deploy changes that make the tests fail***». Итог: **конструкция — основной контроль, fitness function/lint — обязательный второй контур**, потому что типы не удержат то, что лежит вне их досягаемости (прямой импорт SDK-клиента, «сырой» вызов из воркера, новый роут в обход слоя).

### Вердикт по В8: **вариант**

Две трети пункта совпадают с каноном дословно (чужой UUID → BOLA/ASVS 8.2.2 + 8.4.1, ответ без раскрытия существования → RFC 9110 §15.5.4 «MAY 404» + FHIR «Access Denied Response Handling»; удаление байтов с сохранением карточки → FHIR delete-vs-status), но третья треть — «канонический UUID пациента один на две клиники» — расходится с FHIR, где logical id по определению уникален **в пределах одного сервера**, а межорганизационная тождественность выражается business identifier'ом и `Patient.link`.

### Вердикт по Ч2: **совпадает**

«Одна дверь + механический гейт против обхода» — это буквально OWASP Top 10:2025 A01 («*implement access control mechanisms once and reuse them*») плюс OWASP Authorization Cheat Sheet («*global, application-wide configuration rather than… individually to every method or class*») плюс architecture fitness function (Thoughtworks Radar, Trial) в реализации ArchUnit / dependency-cruiser / `no-restricted-imports` / Bazel `visibility` / Error Prone `@RestrictedApi`; порог «роняет сборку» подтверждён эмпирикой Google (CACM 2018). Расхождений с источниками нет ни в одном элементе.

### Что практика предлагает вместо (там, где мы расходимся)

1. **Вместо «один UUID пациента на две клиники»** — FHIR-разделение: (а) внутренний ключ записи, тенант-скоупленный и не дереференсимый поперёк клиник (ASVS 8.4.1); (б) business identifier (МИС-номер, полис, национальный ID) как то, что переживает копирование между организациями; (в) явная связь `Patient.link` (`seealso`/`replaced-by`) или MPI-слой. Общий дереференсимый ключ поперёк тенантов — это не свойство, а поверхность атаки.
2. **Вместо «просто занулить ссылку при удалении»** — статусная модель вложения: `entered-in-error` / `superseded` / `deprecated`, чтобы «файла не было» и «файл удалён» различались; NULL этого не различает, а §164.312(b) требует, чтобы событие удаления было восстановимо из аудита. Плюс: FHIR-семантика чтения удалённого — **410 Gone** внутри своей клиники, но **404/пустая коллекция** для чужой (иначе 410 сам становится каналом раскрытия существования).
3. **Вместо «выбираем 404 навсегда, потому что так безопаснее»** — политика по контексту, как формулирует FHIR: внутри своей клиники 403 допустим и полезен; поперёк клиник — только 404 или пустой результат. RFC 9110 даёт на это разрешение (MAY), не мандат — то есть решение обязано быть записанным решением, а не побочным эффектом кода.
4. **Вместо presigned URL как «авторизации»** — presigned URL как транспорта: проверка владения выполняется в приложении на каждый запрос, затем выдаётся подпись на конкретный ключ с минимальным TTL, `X-Amz-Signature` редактируется во всех логах и на прокси. Либо стриминг через приложение — если нужен per-request контроль и аудит каждого просмотра PHI.
5. **Для В10 (media-worker)** — `orgId` первым сегментом ключа (prefix-per-tenant, AWS SaaS Factory 2022), рантайм-скоупленные креденшелы вместо наследования прав ноды, и включённое версионирование бакета как единственное документированное средство против «невидимой необратимой» перезаписи (по умолчанию **выключено**).
6. **Для «двери» в Ч2** — сначала конструкция (тип-доказательство авторизации, производимый только проверяющей функцией: parse-don't-validate / typestate / capability), затем механический гейт на импорт клиента хранилища и на прямые вызовы вне слоя, падающий в CI — потому что дашборд без падения сборки исторически не работает (Google, CACM 2018).

### НЕ СДЕЛАНО (В8 + Ч2)

- **Не найдено ни одного действующего документа AWS/GCP/Azure, прицельно предписывающего модель авторизации при выдаче байтов PHI из объектного хранилища.** Профильный AWS HIPAA whitepaper **архивирован** (подтверждено на его собственной странице); Healthcare Industry Lens покрывает классификацию, теги и least privilege, но не object-level авторизацию на запрос. Домейн-канон взят у HL7 FHIR и OWASP — с оговоркой, что FHIR описывает FHIR-сервер, а не Next.js-роут.
- **Раздел «object storage isolation» whitepaper'а AWS «SaaS Tenant Isolation Strategies» открыть не удалось**; тезисы по prefix/bucket/Access Points взяты из AWS APN-блога SaaS Factory (июнь 2022) и страницы «Run-time, policy-based isolation with IAM».
- **Текст 45 CFR §164.312 и §164.316 не выгружен дословно** — eCFR отдаёт редирект для не-браузерных клиентов. Цитаты по §164.312(b) даны в пересказе; **точная формулировка требует ручной проверки**.
- **Не найдено рецензируемого исследования (IEEE/ACM), эмпирически сравнивающего 404 vs 403.** Утверждение «404 обязателен» не подтверждается ни одним стандартом; максимум — «разрешён и рекомендуется политикой».
- **Не найдено именованного канона именно для «единственного клиента объектного хранилища»** — практика названа только в общем виде (banned imports, fitness function, Bazel visibility, `@RestrictedApi`). Прецедентов «named company: один S3-клиент + lint против обхода» найти не удалось; экстраполяция агента.
- **Не проверялись** Rust/Go-аналоги ArchUnit; для нашего стека (TS) релевантны dependency-cruiser и `no-restricted-imports`, оба подтверждены.
- **Не искалось** отдельно: Azure SAS best practices, S3 Access Grants (2024) как замена session-policy — подтверждающих цитат нет.

---

## Ч3 + Ч5 — одна точка постановки работ и запрет импорта мимо DI

### Ч3: как делают в мире

**Канон формулируется не как «одна очередь», а как «один интерфейс — много бэкендов».**

Эталонная реализация — Rails Active Job (2014, актуальные guides). Его официально заявленная цель: «framework for declaring jobs and making them run on a variety of queuing backends», а смысл абстракции — чтобы приложение «не заботилось о различиях API между Delayed Job, Resque, Sidekiq и другими» и могло переключать бэкенд, не переписывая задачи. Встроенные адаптеры перечислены в `ActiveJob::QueueAdapters`; с Rails 8.0 дефолт — Solid Queue.
- https://guides.rubyonrails.org/active_job_basics.html
- https://github.com/rails/rails/blob/main/activejob/README.md
- https://api.rubyonrails.org/classes/ActiveJob/QueueAdapters.html

Ключевое для нас: Active Job **не схлопывает очереди**. Очередь задаётся per-job (`queue_as`), бэкенд конфигурируется в том числе поочерёдно. То есть канон ровно совпадает с формулировкой Ч3 «одна точка постановки — да; схлопывание пяти очередей — отдельное решение». Это не компромисс, это архитектурный дефолт индустрии.

**Как это выглядит в нашем стеке (TypeScript/Node).** BullMQ — де-факто стандарт для Node/TS — тоже даёт единственный продюсерский класс `Queue` с методом `add()`, и отдельный `FlowProducer` для DAG зависимых задач; имя очереди — параметр, а не отдельный API.
- https://docs.bullmq.io/readme-1
- https://docs.bullmq.io/guide/flows

**Почему множественные пути постановки дают потерю/дубль доставки — и что канон говорит на самом деле.** Здесь важное расхождение с формулировкой плана. Индустрия связывает потерю и дубль не с числом точек вызова, а с **не-транзакционной постановкой** и с семантикой at-least-once:

- River (Go, Postgres) прямо документирует два режима отказа: enqueue *после* коммита транзакции — задача может быть потеряна; enqueue *до* коммита — воркер увидит незакоммиченные или откатанные данные. Транзакционный `InsertTx` устраняет оба: «jobs are guaranteed to be enqueued if their transaction commits, are removed if their transaction rolls back».
  - https://riverqueue.com/docs/transactional-enqueueing
  - https://github.com/riverqueue/river
- AWS Prescriptive Guidance, паттерн Transactional Outbox: проблема названа «dual write»; решение — запись события в outbox-таблицу в той же транзакции. Там же прямо сказано: сервис-публикатор всё равно может послать дубликаты, поэтому **потребители обязаны быть идемпотентны**.
  - https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- Amazon SQS (официальный developer guide): standard-очереди — at-least-once, дубликаты штатны, «you must design your applications to be idempotent».
  - https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html
- Azure Architecture Center, Competing Consumers: логика обработки сообщения должна быть идемпотентной, чтобы повторная обработка не меняла состояние системы.
  - https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
- Temporal: идемпотентность на входе достигается тем, что `WorkflowId` работает как ключ идемпотентности — сервер вернёт ошибку дубликата вместо создания второго исполнения (Workflow Id Reuse Policy).
  - https://docs.temporal.io/workflow-execution/workflowid-runid
  - https://temporal.io/blog/idempotency-and-durable-execution

**Про «одна точка исходящих уведомлений человеку» — это отдельный, тоже признанный канон.**

- LinkedIn, «Air Traffic Controller: Member-First Notifications» (инженерный блог LinkedIn, 2018). До ATC «each LinkedIn application team was allowed to decide for itself when and how it should notify members», что дало «non-regulated, excessive, and low-quality member notification experience». ATC — «the ultimate decision maker for notifications sent to our members», единая точка для email/SMS/push/in-app.
  - https://www.linkedin.com/blog/engineering/messaging-notifications/air-traffic-controller-member-first-notifications-at-linkedin
- Netflix TechBlog, «Building a Cross-platform In-app Messaging Orchestration Service»: события идут в единую messaging-платформу, где превращаются в готовые сообщения и маршрутизируются в внешнюю или in-app доставку; UI-платформы интерфейсятся только с одним сервисом.
  - https://netflixtechblog.com/building-a-cross-platform-in-app-messaging-orchestration-service-86ba614f92d8
- Slack Engineering, «Tracing Notifications»: уведомления проходят почти через все системы Slack (webapp, job queue, push service, сторонние сервисы), и именно поэтому потребовалась единая спецификация событий и сквозная трассировка воронки доставки.
  - https://slack.engineering/tracing-notifications/

**Расхождение источников, которое стоит назвать.** Google Cloud явно разводит два разных инструмента и не считает «один API» универсальным ответом: Pub/Sub — неявная инвокация и развязка публикатора от подписчиков; Cloud Tasks — явная инвокация, публикатор сохраняет полный контроль и указывает endpoint. Их рекомендация: если одно событие должно обработать несколько сервисов — не плодить Cloud Tasks на каждый, а брать Pub/Sub с несколькими подписками.
- https://docs.cloud.google.com/tasks/docs/comp-pub-sub
- https://docs.cloud.google.com/pubsub/docs/choosing-pubsub-or-cloud-tasks

Это единственный источник, который может быть прочитан против «одной точки», но он про выбор *транспорта*, а не про число точек постановки в коде приложения. Для нашего контекста (Postgres, единая БД, доставка человеку) ближе River/AWS-outbox: транзакционная постановка в ту же БД.

### Ч5: как делают в мире

**Общее имя практики — architecture fitness function.** Neal Ford, Rebecca Parsons, Patrick Kua, «Building Evolutionary Architectures» (O'Reilly, 1-е изд. 2017, 2-е — 2022): «An architectural fitness function provides an objective integrity assessment of some architectural characteristic(s)», реализуется тестами, метриками, мониторингом.
- https://www.oreilly.com/library/view/building-evolutionary-architectures/9781491986356/ch02.html
- https://nealford.com/books/buildingevolutionaryarchitectures.html
- Thoughtworks Technology Radar, техника «Architectural fitness function» (Trial): https://www.thoughtworks.com/radar/techniques/architectural-fitness-function
- Thoughtworks Technology Radar, инструмент ArchUnit: «Java testing library for checking architecture characteristics such as package and class dependencies… layer consistency», встраивается в CI/pipeline как fitness function: https://www.thoughtworks.com/radar/tools/archunit

**Java-эталон правила слоёв** — ArchUnit `layeredArchitecture()`:
```
.layer("Controller").definedBy("..controller..")
.whereLayer("Persistence").mayOnlyBeAccessedByLayers("Service")
```
— https://www.archunit.org/userguide/html/000_Index.html

**Инструменты для TypeScript (наш контекст — ближайший).**

- **Nx `@nx/enforce-module-boundaries`** — самый релевантный: TS-монорепо, теги на проектах + `depConstraints`, ESLint-правило анализирует импорты и валит линт. Формулировка мотивации в официальной документации: «If all of them can depend on each other freely, chaos will ensue, and the workspace will become unmanageable». — https://nx.dev/features/enforce-module-boundaries
- **dependency-cruiser** — секция `forbidden` с правилами `from`/`to` и severity; `error` даёт ненулевой код возврата, то есть валит сборку. — https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- **eslint-plugin-boundaries** — описание элементов архитектуры и правил зависимостей между ними, заявлена поддержка монорепо и слоистых архитектур. — https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md
- **Ядровое `no-restricted-imports`** (core ESLint, с v2.0.0-alpha-1) — `paths` и `patterns`, плюс `importNames`/`allowImportNames`, чтобы запретить конкретные экспорты; есть `allowTypeImports` для TS. Работает только на статических импортах. — https://eslint.org/docs/latest/rules/no-restricted-imports

**Ответ на прямой вопрос: линта индустрии НЕ достаточно — и она это знает.**

Сторона «конструкция, а не проверка»:
- **Go `internal/`** — языковой уровень, обход не компилируется. Официальная формулировка (Go 1.4, 2014): «When the `go` command sees an import of a package with `internal` in its path, it verifies that the package doing the import is within the tree rooted at the parent of the `internal` directory… It cannot be imported by code in `.../a/b/g` or in any other repository». — https://go.dev/doc/go1.4
- **Bazel visibility** — уровень сборки: «Target visibility controls who may depend on your target»; дефолт `//visibility:private`; и главное — «A target will fail to build during the analysis phase if it violates the visibility of one of its dependencies». Это **падение сборки, не предупреждение**. — https://bazel.build/concepts/visibility
- **Node.js `"exports"` — прямой аналог `internal/` для нашего pnpm-монорепо**, и это самая важная находка по Ч5. Официальная документация: «When the `"exports"` field is defined, all subpaths of the package are encapsulated and no longer available to importers. For example, `require('pkg/subpath.js')` throws an `ERR_PACKAGE_PATH_NOT_EXPORTED` error»; и «preventing any other entry points besides those defined in `"exports"`. This encapsulation allows module authors to clearly define the public interface for their package». — https://nodejs.org/api/packages.html

То есть в TypeScript pnpm-монорепо конструкция «обход невозможен» существует и не требует изобретения: репозитории живут в пакете, у которого в `exports` нет ни одного подпути наружу, кроме токенов/интерфейсов; глубокий импорт перестаёт **резолвиться**, а не «подсвечивается линтером». Nx отдельно проговаривает тот же принцип на своём уровне — доступно только то, что экспортировано из `index.ts` библиотеки, deep imports запрещены.

Сторона «линт достаточен»: Nx, dependency-cruiser и eslint-plugin-boundaries — все три сознательно выбрали проверку на этапе линта, аргумент — ловим до мержа и не ломаем сборочный граф (см. ссылки выше). Google в «Software Engineering at Google» (2020, гл. 22, Large-Scale Changes) описывает промежуточный вариант: после миграции важно иметь систему, **предотвращающую повторное появление** удалённой конструкции, и делает это через Tricorder — флаг на использование deprecated-объектов **на code review**, а не в компиляторе. — https://abseil.io/resources/swe-book/html/ch22.html

**Кто из них ближе к нам.** Nx и Node `exports` — наш контекст буквально (TS, pnpm, монорепо). ArchUnit/Bazel/Go — референс семантики, но не переносимы напрямую. Формулировка владельца «конструкция, при которой обход не может существовать» — это Go `internal/` + Node `exports` + Bazel visibility, а не ESLint. Формулировка «храповик замороженных обходов» — это ArchUnit `FreezingArchRule` и ESLint bulk suppressions (см. ниже). В зрелых системах используются **обе** одновременно: конструкция для нового кода, храповик для старого.

### Храповик: признанная практика и готовые инструменты

Да, это канон, а не импровизация. У практики есть имя (baseline / freeze / bulk suppression / clean as you code) и **как минимум четыре готовых реализации** — третий механизм строить не надо.

1. **ArchUnit `FreezingArchRule`** (Java) — эталонная семантика ровно нашего храповика. Официальный user guide: при первом прогоне «all violations of that rule will be stored as the current state. On consecutive runs only new violations will be reported». И критично: «If violations are fixed, `FreezingArchRule` will automatically reduce the known stored violations to prevent any regression» — список **может только уменьшаться**. По умолчанию номера строк игнорируются, сдвиг кода не считается новым нарушением.
   - https://www.archunit.org/userguide/html/000_Index.html

2. **ESLint bulk suppressions** — официальная фича, ESLint v9.24.0 (апрель 2025), анонс в блоге ESLint. Позволяет включить правило как `"error"`, не чиня всё сразу: «While the rule will be enforced for new code, the existing violations will not be reported». Файл `eslint-suppressions.json` в корне, флаги `--suppress-all`, `--suppress-rule`, `--prune-suppressions`, `--pass-on-unpruned-suppressions`. Храповик встроен буквально: если нарушений стало **меньше**, чем записано, ESLint «exits with a non-zero exit code and an error is reported about unused suppressions» — то есть заставляет обрезать список. Официальная рекомендация — коммитить файл в репозиторий.
   - https://eslint.org/blog/2025/04/introducing-bulk-suppressions/
   - https://eslint.org/blog/2025/04/eslint-v9.24.0-released/
   - https://eslint.org/docs/latest/use/suppressions

3. **dependency-cruiser known violations** — baseline-репортёр и `--ignore-known`: генерируется `.dependency-cruiser-known-violations.json` (командой `depcruise-baseline`), при прогоне severity известных нарушений понижается до `ignore`, новые остаются ошибками.
   - https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md

4. **Betterer** — OSS-тест-раннер, построенный именно под это: снапшот результата (ESLint-правила, TS-компиляции, RegExp, TSQuery) в results-файл в репозитории; «если тест ухудшился — это регрессия и Betterer падает; если улучшился — Betterer обновляет снапшот». Прямо задуман под инкрементальную миграцию на TS strict.
   - https://phenomnomnominal.github.io/betterer/docs/typescript-test/

5. **Sonar «Clean as You Code»** — тот же принцип на уровне процесса: quality gate ставит условия **только на новый код** («No issues are introduced»), «focuses on keeping new code clean, rather than spending a lot of effort remediating old code».
   - https://docs.sonarsource.com/sonarqube-server/10.4/user-guide/clean-as-you-code

6. **Google** (SWE at Google, 2020): у разных LSC разные определения «готово», и обязателен механизм, не дающий вернуть удалённую конструкцию — Tricorder флагует новые использования deprecated на ревью. Это тот же храповик, реализованный в процессе ревью.
   - https://abseil.io/resources/swe-book/html/ch22.html

Итог по храповику: **канон**, реализован минимум четырьмя инструментами, из которых два (ESLint bulk suppressions, dependency-cruiser known violations) работают в нашем стеке из коробки.

### Аргумент про тестируемость (для Ч5)

**Каноническая формулировка есть, и она первичная, не производная.**

- Miško Hevery, Google Testing Blog, «Clean Code Talks — Dependency Injection» (ноябрь 2008) и «Guide to Writing Testable Code» (2008): разделять оператор `new` и прикладную логику; тестируемый класс — тот, который можно сконструировать изолированно, передав ему тест-дублёры; конструктор не должен делать работу. Отсюда «new is glue».
  - https://testing.googleblog.com/2008/11/clean-code-talks-dependency-injection.html
  - http://misko.hevery.com/2008/11/24/guide-to-writing-testable-code/
- Michael Feathers, «Working Effectively with Legacy Code» (2004) — понятие **seam**: «a place where you can alter behavior in your program without editing in that place». Ключ к взятию легаси под тесты — разрыв зависимостей: «if we can replace behavior at seams, we can selectively exclude dependencies in our tests». Прямой импорт репозитория — это отсутствие шва.
  - https://www.informit.com/articles/article.aspx?p=359417&seqNum=2
  - https://martinfowler.com/bliki/LegacySeam.html
- Mark Seemann, **Composition Root** (ploeh blog; книга «Dependency Injection Principles, Practices, and Patterns», Manning, 2019): единственное место в приложении, где собирается весь граф объектов, как можно ближе к точке входа; только Composition Root знает про контейнер, остальной код на контейнер не ссылается.
  - https://blog.ploeh.dk/2019/06/17/composition-root-location/
  - https://freecontent.manning.com/dependency-injection-in-net-2nd-edition-understanding-the-composition-root/

**Контр-течение (называю честно, оно от именованных авторов):**

- Martin Fowler, «Inversion of Control Containers and the Dependency Injection Pattern» (23 января 2004) — сам автор термина ослабляет аргумент тестируемости: «There is really no difference here between dependency injection and service locator: both are very amenable to stubbing». И отдельно: для несложных случаев достаточно конфигурации кодом, контейнер не обязателен.
  - https://martinfowler.com/articles/injection.html
- DHH, «Dependency injection is not a virtue» (2012): в динамическом языке жёсткая ссылка яснее и по-прежнему тестируема (пример с `Time.stub(:now)`); паттерны «quickly graduate from tool to taste» и не переносятся между языками автоматически.
  - https://dhh.dk/2012/dependency-injection-is-not-a-virtue.html

**Чей контекст ближе нам.** DHH/Fowler правы ровно там, где подмена достижима иначе: в TS есть `vi.mock`/`jest.mock`, то есть module seam существует. Но у нас (а) уже есть DI-контейнер, значит спор «контейнер vs ручная сборка» закрыт решением владельца, а не заново открыт; (б) мультиарендная медицинская платформа с RLS — подменять надо не «часы», а носитель тенант-контекста, и делать это через мок модуля в Next.js App Router (несколько бандлеров, server/client граница, pnpm-симлинки) — хрупко и молча ломается. Конструкторная инъекция здесь строго дешевле. Ближайший к нам источник — Hevery/Seemann, не DHH.

### Вердикт по Ч3: **совпадает**

«Одна точка постановки, схлопывание очередей — отдельно» — это буквально дизайн Active Job: один интерфейс над многими бэкендами и очередями, при этом сами очереди не сливаются (https://guides.rubyonrails.org/active_job_basics.html). Ч3 не изобретает практику, а воспроизводит именно ту, что индустрия закрепила как дефолт.

Одна оговорка, которая не меняет вердикт, но меняет обоснование: **названное следствие («потеря или дубль доставки человеку») единой точкой постановки не устраняется**. По AWS/Azure/River причина потери — не-транзакционный dual write, причина дубля — at-least-once-семантика; лечится это outbox + идемпотентным потребителем, а единая точка лишь даёт **место**, куда эти два свойства можно вкрутить один раз вместо пяти.

### Вердикт по Ч5: **вариант**

Цель («слой получает зависимости, а не берёт их сам») и храповик — канон дословно (Hevery 2008, Feathers 2004, Seemann 2019; ArchUnit FreezingArchRule, ESLint bulk suppressions). Расхождение — в механизме: заявлен принцип «конструкция, при которой обход не может существовать», а описанная реализация (аллоулист + правило) — это fitness function уровня линта, то есть проверка, а не конструкция. Канон в наиболее зрелой форме (Go `internal/`, Bazel visibility, Node `"exports"`) делает обход **нерезолвимым/некомпилируемым**, и в TS pnpm-монорепо это доступно.

### Что практика предлагает вместо

**Для Ч3 — там, где расходимся с каноном:**

1. Не «одна точка постановки» как самоцель, а **один продюсерский API + транзакционная постановка**. River формулирует минимальный контракт: enqueue в той же транзакции, что и доменная запись; закоммитилось — задача есть, откатилось — задачи нет (https://riverqueue.com/docs/transactional-enqueueing). У нас Postgres, значит outbox/транзакционный insert доступен без нового инфраструктурного компонента — это дешевле, чем любая схема ретраев поверх пяти путей.
2. **Идемпотентность на приёме — обязательна вне зависимости от числа точек.** AWS явно предупреждает: outbox-публикатор всё равно может дублировать, потребитель обязан быть идемпотентным (https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). Готовая форма ключа идемпотентности — Temporal `WorkflowId` (https://docs.temporal.io/workflow-execution/workflowid-runid); в очередной модели её роль играет стабильный `jobId`.
3. **Единая точка исходящей доставки человеку — отдельная ценность, помимо надёжности.** LinkedIn ATC заменил «каждая команда решает сама» на единственного принимающего решение и назвал прежнее состояние причиной избыточных и низкокачественных уведомлений (https://www.linkedin.com/blog/engineering/messaging-notifications/air-traffic-controller-member-first-notifications-at-linkedin). Для медицинской платформы это ещё и единственное место для аудита «кому что ушло».

Почему дешевле: транзакционный insert + идемпотентный ключ — это два свойства в **одном** модуле, а не пять комплектов ретраев; и они закрывают названное следствие, чего единый API сам по себе не делает.

**Для Ч5 — там, где расходимся с каноном:**

1. **Сделать обход нерезолвимым, а не «залинтованным»**: репозитории в пакете, чей `package.json` `"exports"` не публикует внутренние подпути. Node возвращает `ERR_PACKAGE_PATH_NOT_EXPORTED` — импорт просто не разрешается (https://nodejs.org/api/packages.html). Это точный TS-аналог Go `internal/` (https://go.dev/doc/go1.4) и Bazel visibility, где нарушение **валит сборку**, а не пишет warning (https://bazel.build/concepts/visibility). Дешевле, потому что не требует поддерживать список исключений для нового кода вообще: нового обхода физически не возникает.
2. **Линт оставить вторым контуром для того, что `exports` не ловит** (импорты внутри одного пакета): `@nx/enforce-module-boundaries` в монорепо (https://nx.dev/features/enforce-module-boundaries) или dependency-cruiser `forbidden` с severity `error` — ненулевой код возврата валит CI (https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md).
3. **Храповик — взять готовый, не писать третий.** Два кандидата под наш стек: ESLint `--suppress-all` + `eslint-suppressions.json` с обязательным `--prune-suppressions` (список физически не может вырасти незамеченно и падает, если стал избыточен — https://eslint.org/docs/latest/use/suppressions), либо `depcruise-baseline` + `--ignore-known` (https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md). Оба коммитятся в репозиторий, оба — официальная фича своего инструмента. Семантику «может только уменьшаться» стоит копировать у ArchUnit `FreezingArchRule`, включая деталь про игнорирование номеров строк (https://www.archunit.org/userguide/html/000_Index.html).
4. **Всю сборку графа свести к Composition Root** (Seemann): один файл на процесс (webapp, интегратор, media worker), знающий про контейнер; остальной код про контейнер не знает (https://blog.ploeh.dk/2019/06/17/composition-root-location/). Тогда «22 обхода» перестают быть списком точек и становятся списком отсутствующих швов.

Почему сдержаннее: `exports`-инкапсуляция и готовый baseline — это конфигурация, а не новый механизм; ни один из них не требует сопровождения кода, который сам может сломаться.

### НЕ СДЕЛАНО (Ч3 + Ч5)

- **Uber — единая платформа исходящих уведомлений.** Найдены только публикации про Consumer Communication Gateway и оптимизацию тайминга push через ML, и про real-time push platform. Это про ранжирование/доставку push, а не про «единая точка отправки для всех каналов». Вместо Uber процитированы LinkedIn ATC, Netflix и Slack.
- **Airbnb — централизованная нотификационная платформа.** Публичного writeup именно про это не найдено. Не цитируется.
- **Meta/Facebook — writeup про migration baselines.** Официальный источник не найден; утверждение не делается. Роль «крупная компания про храповик» закрыта Google (SWE at Google, гл. 22).
- **Sonar «Clean as You Code» — текущий URL** отдал 404; процитирована версионированная страница 10.4, более свежая редакция (2025–2026) не проверена.
- **ts-arch** — официальную документацию не открывали, утверждений о нём не делается.
- **`import/no-restricted-paths`** (eslint-plugin-import) — существование не верифицировано фетчем; цитируется ядровое `no-restricted-imports`.
- **Sidekiq, Celery, Cadence, Oban, AWS EventBridge** — прямые цитаты из официальной документации не получены. Роль «именованные job-фреймворки» закрыта Active Job, BullMQ, River, Temporal, Cloud Tasks/Pub-Sub, SQS.
- **Java `module-info` / package-private** как build-level enforcement — не верифицировано отдельным источником; та же мысль подтверждена Bazel visibility и Go `internal/`.
- **Rails guides** — дословная цитата про «API differences between Delayed Job and Resque» получена из README `activejob` и поисковой выдачи, а не из отрендеренной страницы guides.
- **Собственный репозиторий не читался** — числа (5 очередей, 107/22/11/11 импортов) не проверялись и не подтверждаются.

---

## Ч6 — настройки не декорация

### ВОПРОС ВЛАДЕЛЬЦА: есть ли признанная практика поиска мёртвых флагов?

**Да — и это не одна практика, а две разные, с разными названиями и разными механизмами.** Отрасль называет проблему «flag debt» / «stale flags» / «zombie flags», и у всех крупных вендоров есть встроенные механизмы её обнаружения. Но ловят они **не то же самое, что Ч6**:

1. **Статический скан кода на ключи флагов** — «code references». Инструмент сканирует репозиторий на вхождения ключей и показывает флаги с **нулём ссылок в коде**. Это буквально «у настройки нет потребителя». LaunchDarkly: открытая утилита `ld-find-code-refs`, «Command line program for generating flag code references», turn-key интеграции с GitHub Actions, CircleCI Orbs, Bitbucket Pipes, GitLab CI ([github.com/launchdarkly/ld-find-code-refs](https://github.com/launchdarkly/ld-find-code-refs)). Официальная докстраница: code references помогают «determine which projects reference your feature flags and remove technical debt», а «extinction events and archive checks use code reference data to confirm when a flag is ready for code removal» ([launchdarkly.com/docs/home/flags/code-references](https://launchdarkly.com/docs/home/flags/code-references)). То же есть у Flagsmith ([docs.flagsmith.com](https://docs.flagsmith.com/managing-flags/code-references)) и у Statsig.

2. **Рантайм-телеметрия обращений** — флаг считается мёртвым, если SDK его давно не запрашивал. LaunchDarkly классифицирует флаг как `new` / `active` / `launched` / `inactive`, где Inactive = «созданный более семи дней назад и не запрашивавшийся последние семь дней» ([flag-status](https://launchdarkly.com/docs/home/flags/flag-status)); «flag health» считает процент stale-флагов, и один из критериев архивации — «the flag has not been requested in the last seven days» ([flag-health](https://launchdarkly.com/docs/home/releases/flag-health)).

**Важнейшая оговорка про наш контекст.** Почти вся эта индустрия предполагает, что флаг живёт **в SaaS-вендоре или в коде**, а не в вашей собственной таблице БД, и что флаг **временный**. Наши админ-тумблеры — это по классификации Фаулера/Ходжсона **Permissioning Toggles и Ops Toggles**, живущие «at the scale of multiple years» и «long-lived Kill Switches», которые снимать не надо ([martinfowler.com/articles/feature-toggles.html](https://martinfowler.com/articles/feature-toggles.html), Pete Hodgson, 09.10.2017 — классика). Более того, Фаулер прямо описывает наш способ хранения: «some sort of centralized store, often an existing application DB. This is usually accompanied by the build-out of some form of admin UI». GitLab это институционализировал: если флаг живёт долго — «consider introducing Cascading Settings or Application Settings instead», а development-флаг старше 6 месяцев надо «convert it to an instance, group, or project setting» ([docs.gitlab.com/development/feature_flags/](https://docs.gitlab.com/development/feature_flags/)).

**Следствие:** как только тумблер стал «настройкой», вся индустриальная гигиена флагов (expiry, stale, archive) по определению перестаёт к нему применяться — и **никто из вендоров не покрывает вопрос «а читает ли эту настройку хоть кто-нибудь»**. То есть проблема Ч6 реальна и лежит ровно в дыре между двумя признанными практиками. Ближайший академический аналог — Xu et al., «Hey, you have given me too many knobs!» (FSE 2015): исследование реальных конфигураций показало, что параметров избыточно много, и авторы удалили 51.9% параметров в Storage-A «with little impact on existing users» ([dl.acm.org/doi/10.1145/2786805.2786852](https://dl.acm.org/doi/10.1145/2786805.2786852)). Это прямое подтверждение тезиса «настройки бывают декорацией», но не механизм проверки.

### Как ловят у себя LaunchDarkly / Unleash / Google / Meta / GitLab

**LaunchDarkly.** Комбинируют оба механизма. Гайд «Reducing technical debt from feature flags»: смотреть статусы Inactive/Launched, включить code references, получать Slack-уведомления «when it's time to remove flags from code», архивировать ежеквартально, «healthy time-to-archive is in the 90–120 day range» ([technical-debt](https://launchdarkly.com/docs/guides/flags/technical-debt)). Архивация подтверждается двумя сигналами сразу.

**Unleash (open source).** Флаг имеет состояния «active, potentially stale, or stale»; Unleash «marks all flags as potentially stale automatically once they pass their expected lifetime», где expected lifetime задан на **тип флага** ([technical-debt](https://docs.getunleash.io/concepts/technical-debt), [feature-toggle-types](https://docs.getunleash.io/reference/feature-toggle-types)). Отдельно — жизненный цикл из 5 стадий, вычисляемый **из метрик**: Define (метрик нет), Develop, Production, Cleanup («Unleash hasn't detected any production usage metrics for at least two days»), Archived ([feature-flags](https://docs.getunleash.io/concepts/feature-flags)). Есть «technical debt rating». Unleash прямо предлагает «breaking project builds if the code contains stale flags» — механический гейт в CI.

**Harness FME (бывший Split.io).** Флаг «potentially stale», если за 60 дней его не меняли и не вычисляли; есть статус «ready for cleanup» и beta-фича Remote Feature Flag Cleanup Templates, автоматически открывающая PR с удалением кода ([developer.harness.io](https://developer.harness.io/docs/feature-management-experimentation/getting-started/manage-the-feature-flag-lifecycle/)).

**Statsig.** Самый близкий к нашему вопросу критерий: гейт помечается Stale, если «the gate has had 0 checks within last 30 days», при этом гейты, «referenced by other gates, experiments, or dynamic configs», stale не становятся никогда ([docs.statsig.com](https://docs.statsig.com/feature-flags/permanent-and-stale-gates)). Плюс явная категория **Permanent** — ровно то, чем являются наши админ-настройки.

**Google (KDD 2010, классика, но живая).** Tang, Agarwal, O'Brien, Meyer, «Overlapping Experiment Infrastructure: More, Better, Faster Experimentation», KDD 2010 ([dl.acm.org](https://dl.acm.org/doi/10.1145/1835804.1835810), PDF: [research.google.com/pubs/archive/36500.pdf](https://research.google.com/pubs/archive/36500.pdf)). Здесь **нет** обнаружения мёртвых флагов, но есть строго вторая половина Ч6 — уникальность потребителя, возведённая в конструкцию: «Each experiment can only modify parameters associated with its layer… and **the same parameter cannot be associated with multiple layers**». И для launch layers: «a parameter can be in at most one launch layer and at most one "normal" layer (within a domain) simultaneously».

**Meta (SOSP 2015).** Tang et al., «Holistic Configuration Management at Facebook», SOSP '15 ([dl.acm.org](https://dl.acm.org/doi/10.1145/2815400.2815401), PDF: [sigops.org](https://sigops.org/s/conferences/sosp/2015/current/2015-Monterey/printable/008-tang.pdf)). Текст проверен целиком. Что там есть: «the configuration compiler automatically runs validators to verify invariants defined for configs», code review для конфигов как для кода, integration-тесты в песочнице, автоматический canary. Что там **отсутствует полностью**: детекция неиспользуемых/мёртвых конфигов. Слов «unused», «obsolete», «dead config» в статье нет. Наоборот, честная статистика: «35% of the configs are not updated even once in the past 300 days». **Вывод: крупнейшая рецензируемая работа по управлению конфигурацией валидирует конфиги, но не проверяет, что у конфига есть читатель.** Это подтверждает, что Ч6 бьёт в непокрытое место.

Отдельно у Meta есть деталь ровно про нашу вторую половину: MobileConfig имеет «translation layer», дающий «one level of indirection to flexibly map a MobileConfig field to a backend config» — приложение читает поле в одном месте, а откуда берётся значение, меняется без правки кода.

**GitLab.** Самый близкий к нам по типу организации. Правила: «Feature flags are meant to be short lived»; максимальные сроки жизни по типам — `gitlab_com_derisk` 2 месяца, `wip` 4 месяца, `beta` 6 месяцев, `ops` без ограничения, но «must be evaluated every 12 months»; для `gitlab_com_derisk` и `beta` — «**Must** have a rollout issue created»; development-флаги старше 2 майлстоунов «are reported to engineering managers»; флаг старше 6 месяцев обязан быть либо включён и удалён, либо **превращён в instance/group/project setting**, либо снят ([docs.gitlab.com](https://docs.gitlab.com/development/feature_flags/), [handbook.gitlab.com](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/feature-flag-lifecycle/)). Плюс реестр: у флага есть YAML-определение, и «Only feature flags that have a YAML definition file can be used when running the development or testing environments» — **типизированный реестр как конструкция, а не как проверка**.

**Uber (ICSE-SEIP 2020).** Piranha — «automated code refactoring tool which automatically generates differential revisions (diffs) to delete code corresponding to stale feature flags»; с декабря 2017 по май 2019 сгенерировала диффы для 1381 флага (17% всех флагов), 65% диффов приняты без правок ([dl.acm.org](https://dl.acm.org/doi/10.1145/3377813.3381350), open source: [github.com/uber/piranha](https://github.com/uber/piranha)).

**Академический фон.** Rahman, Querel, Rigby, Adams, «Feature toggles: practitioner practices and a case study», MSR 2016 ([dl.acm.org](https://dl.acm.org/doi/10.1145/2901739.2901745)). Свежий препринт (не рецензирован, arXiv, апрель 2026): Tërnava, «Feature Toggle Dynamics in Large-Scale Systems» — у Kubernetes 155 активных feature gates, у GitLab 403; медианный срок жизни 734 против 185 дней; скорость добавления обгоняет удаление на ~35% (Kubernetes) и ~13% (GitLab) ([arxiv.org/abs/2604.15872](https://arxiv.org/abs/2604.15872)).

**OpenFeature (CNCF, incubating).** В самой спецификации **ничего про жизненный цикл и мёртвые флаги нет**. Слово `STALE` в спеке означает совсем другое — устаревший кэш провайдера ([openfeature.dev/specification](https://openfeature.dev/specification/sections/flag-evaluation/)). Не путать эти два «stale».

### Вторая половина: одно решение — одно место

Это **другая** дисциплина, и по ней канон сильнее, чем по «мёртвым флагам». Наш баг с `auth_2fa_enabled` — не про мёртвый флаг, а про раздвоенное решение.

- **Фаулер/Ходжсон, «Inversion of Decision»**: «We've introduced a `FeatureDecisions` object, which acts as a collection point for any feature toggle decision logic», мотив — «now as that logic evolves we have a singular place to manage it»; предупреждение: флаги «have a tendency to proliferate throughout a codebase», и без централизации «any change to that decision logic will require trawling through all those toggle points» ([martinfowler.com](https://martinfowler.com/articles/feature-toggles.html), 2017).
- **OWASP Top 10 Proactive Controls, C1 «Implement Access Control»**: «Use a single access control procedure or routine. This prevents the scenario where you have multiple access control implementations, where most are correct, but some are flawed» ([top10proactive.owasp.org](https://top10proactive.owasp.org/the-top-10/c1-accesscontrol/)). Это буквально описание нашего инцидента.
- **OPA / policy as code (CNCF graduated)**: «OPA decouples policy decision-making from policy enforcement»; политику можно «read, write, analyze, version, distribute, and in general manage … separate from the service itself» ([openpolicyagent.org/docs/philosophy](https://www.openpolicyagent.org/docs/philosophy)).
- **Google KDD 2010** — тот же принцип как жёсткое ограничение конструкции: «the same parameter cannot be associated with multiple layers».

**Итог по половинам:** «у каждого тумблера есть потребитель» — половина **хорошо покрыта** практикой и готовым инструментарием (но только для флагов в SaaS/коде). «Потребитель уникален» — половина покрыта **принципами** (Fowler, OWASP, OPA, Google), но **не покрыта готовым инструментом**: ни один вендор не проверяет, что ключ читается ровно в одном месте. Это придётся строить конструкцией, а не проверкой.

### Статический скан против доказательства прогоном

**Что делают вендоры.** Два сигнала, и они считают их **взаимодополняющими**:

| Сигнал | Кто | Что доказывает | Чего не доказывает |
|---|---|---|---|
| Статический скан ключей | LaunchDarkly `ld-find-code-refs`, Flagsmith, Statsig | ключ упомянут в коде | что упоминание влияет на поведение |
| Рантайм-телеметрия обращений | LD flag status (7 дней), Unleash lifecycle (метрики, 2 дня), Harness (60 дней), Statsig (0 checks / 30 дней) | код действительно спрашивал значение | что разные значения дают разное поведение |

LaunchDarkly требует **оба** перед архивацией. Авторитетнее отрасль считает **рантайм**: у Unleash сам жизненный цикл вычисляется из метрик, у Statsig критерий stale — «0 checks», не «0 references». Причина: статический скан по строковым ключам даёт и ложноположительные, и ложноотрицательные — LaunchDarkly сама признаёт проблему и предлагает `.ldignore` против «a large number of false positives», и не сканирует ключи короче трёх символов.

**Наш уровень «доказано прогоном».** Ни один вендор не требует доказать, что переключение тумблера **меняет наблюдаемое поведение**. Это строго сильнее всего, что делает индустрия. Ближайший признанный аналог — не у вендоров, а у Фаулера: «we must perform test our artifact in **both** states: with the toggle flipped On and flipped Off», причём тестировать надо «the toggle configuration which you expect to become live in production» и «the fall-back configuration where those toggles you intend to release are also flipped Off»; для этого он советует «exposing an endpoint which allows for dynamic in-memory re-configuration of a feature flag» ([martinfowler.com](https://martinfowler.com/articles/feature-toggles.html), 2017). Он же честно называет цену: комбинаторный взрыв, смягчаемый тем, что «most feature flags will not interact with each other».

То есть: **«тестируй оба состояния» — признанная практика; «докажи прогоном для каждой настройки в едином реестре» — её усиленный вариант, и публично документированных примеров такого режима не найдено.**

### Вердикт: **вариант**

Ч6 — не изобретение: обе его половины имеют признанные имена («flag debt / stale flag detection» и «single access control procedure» / «inversion of decision» / «policy decoupling»), и первая половина реализована в готовом инструментарии у пяти вендоров. Это и не совпадение: отрасль ищет мёртвые флаги у **временных флагов в SaaS/коде**, а у нас — **долгоживущие permission/ops-настройки в собственной таблице БД**, для которых ни статический сканер вендора, ни его телеметрия не работают из коробки; плюс требование «доказано прогоном» и «потребитель уникален» строже отраслевого минимума.

### Что практика предлагает вместо (готовые инструменты)

Чтобы не строить третий механизм, из канона берутся четыре готовых кирпича:

1. **Скан ключей = ripgrep по выгруженному списку ключей.** `ld-find-code-refs` по сути делает именно это: берёт список ключей и ищет их в репозитории, отдавая флаги с нулём ссылок. Для нас эквивалент: выгрузить ключи из таблицы настроек → скан → нулевые ссылки = кандидаты в декорацию. Самая дешёвая половина, и она уже реализована в отраслевом инструменте, который можно повторить в 20 строк CI.
2. **Счётчик обращений вместо теста.** Все вендоры, кто считает рантайм авторитетным, получают этот сигнал одним способом — **единая точка чтения, которая инкрементит счётчик по ключу**. Для нас это одновременно решает и вторую половину: если чтение настройки идёт через один хелпер, то (а) появляется телеметрия «кто и когда читал», (б) читателей физически становится один. Это дешевле, чем прогон-доказательство на каждый тумблер.
3. **Типизированный реестр как конструкция.** GitLab: флаг без YAML-определения не работает в dev/test. В TS-мире соответствующий механический гейт даёт **knip** — «find unused files, dependencies and exports», ловит «unused exports and dead code that ESLint and other linters would miss», есть production-режим и `--fix` ([knip.dev](https://knip.dev/), [unused-exports](https://knip.dev/typescript/unused-exports)); `ts-prune` официально считается предшественником и мигрируется в knip. Важно понимать границу: **knip не видит строковые ключи в БД** — он поймает неиспользуемый экспорт реестра, но только если ключи объявлены в коде как экспортируемые константы. То есть knip работает не «вместо» реестра, а «после» него.
4. **Одна точка решения для политик безопасности.** Fowler `FeatureDecisions`, OWASP C1 («use a single access control procedure or routine»), OPA как крайняя форма. Для случая `auth_2fa_enabled` минимальный канонический ответ — одна функция «требуется ли 2FA», которую вызывают и страж, и маршрут входа; ни страж, ни маршрут не читают ключ сами.
5. **Срок годности как гейт CI** — если решим, что часть настроек всё-таки временные: Unleash прямо предлагает «breaking project builds if the code contains stale flags», а Ходжсон — «time bombs which will fail a test (or even refuse to start an application!) if a feature flag is still around after its expiration date». Для permission/ops-настроек неприменимо — они долгоживущие по конструкции.
6. **Автоудаление кода мёртвого флага** — Piranha (Uber, open source, ICSE-SEIP 2020) для стадии «нашли мёртвый — убрать».

**Расхождение и чей контекст ближе.** LaunchDarkly/Harness/Statsig исходят из «флаг временный, живёт у вендора» — их контекст от нашего дальше всего. Statsig ближе за счёт явной категории Permanent. Ближе всех — **GitLab**: собственный продукт, собственные админ-настройки, публичное правило «долгоживущий флаг перестаёт быть флагом и становится Application/Cascading Setting», обязательный файл-определение и обязательный rollout issue.

### НЕ СДЕЛАНО (Ч6)

- **Не найдено ни одного публичного примера нашей сильной формы** — «на каждый тумблер тест, доказывающий изменение наблюдаемого поведения». Проверены доки LaunchDarkly, Unleash, Harness FME, Statsig, Flagsmith, GitLab, спека OpenFeature. Максимум канона — «тестируй оба состояния» (Fowler, 2017).
- **Google:** проверена только KDD 2010. Google Testing Blog и SRE Book по теме «configuration as code / unused flags» **не просмотрены**.
- **Meta:** проверен полный текст SOSP 2015; более поздние публичные материалы (инженерный блог 2020–2026 про Configerator/Gatekeeper) **не проверялись**. Отсутствие детекции неиспользуемых конфигов в статье — отрицательный результат, а не пробел поиска.
- **Не проверены**: Uber flagr, публичные гайды Slack и Shopify по фичефлагам, Kubernetes feature-gates policy (только через препринт).
- **ACM DL отдаёт 403** — цитаты из статей Google и Meta взяты из официальных PDF (research.google.com и sigops.org) и проверены по полному тексту.
- **Не проверено**, существует ли готовый линтер/плагин, сопоставляющий строковые ключи из БД с их использованием в TS-коде (аналог `ld-find-code-refs` для собственной таблицы настроек). Известно только, что knip этого не делает из коробки.
- **Год редакции доков вендоров** (LaunchDarkly, Unleash, Statsig, Harness, Flagsmith, GitLab) на страницах не проставлен — фиксируется как «состояние на момент проверки, август 2026».

---

## Остальные пункты — коротко, по одному источнику на пункт

### Б2 — Fail-closed при регенерации эталона схемы

1. **Практика:** Именованный fail-closed механизм против запрещённых литералов в артефакте — это GitHub secret scanning **push protection**: «prevent hardcoded credentials … from ever being pushed», при срабатывании «will block the push and provide a detailed message explaining the reason for the block», обход возможен только с явно указанной причиной, которая логируется алертом ([docs.github.com](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)). Для самой схемы каноничный аналог — линт миграций в CI: `atlas migrate lint` анализирует «destructive operations», «breaking schema changes», «table locks or rewrites» и встраивается в PR-пайплайн ([atlasgo.io, 2025](https://atlasgo.io/versioned/lint)).
2. **Вердикт:** вариант — обе половины (отказ при неизвестном и запрет литералов) каноничны по отдельности, но канон ставит гейт на границе «push/PR», а не внутри генератора артефакта.
3. **Вместо:** блокировка на границе репозитория с обязательной *названной* причиной обхода и алертом (модель push protection) — дешевле, потому что покрывает любой файл, попадающий в репозиторий, а не только вывод нашего генератора, и не требует поддерживать реестр «известных ролей» в двух местах.

### Б3 — Ревизия 22 неисполняемых live-DB тест-файлов

1. **Практика:** «Тест, который раннер не собирает» — прямое следствие конфигурации discovery: у Vitest дефолт `include` = `['**/*.{test,spec}.?(c|m)[jt]s?(x)']`, и переопределение `include` **полностью заменяет** дефолты, то есть файл вне маски молча не существует для прогона ([vitest.dev/config/include](https://vitest.dev/config/include)). Правило «удалять с названной причиной» ближе всего к Google Testing on the Toilet «Change-Detector Tests Considered Harmful» (2015), где удаление обосновано конкретным диагнозом ([testing.googleblog.com](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html)), и к главе 11 «Software Engineering at Google» (Winters/Manshreck/Wright, 2020) о brittle-тестах, которые «resist change» ([abseil.io ch. 11](https://abseil.io/resources/swe-book/html/ch11.html)).
2. **Вердикт:** вариант — гигиена тест-набора и «удаляем по названному диагнозу» признаны, но именно процедурная форма «каждый файл — порт или удаление с записанной причиной» канонического имени не имеет; практики «утверждать число собранных тестов в CI» не найдено.
3. **Вместо:** практика делает несобираемость *невозможной*, а не аудируемой — единая явная конфигурация `include`/projects, при которой файл в тест-каталоге либо собирается, либо валит прогон; это дешевле разового триажа, потому что защищает и от будущих «невидимых» файлов.

### Б4 — Калибровка стоимости до массовой стройки

1. **Практика:** «Software Engineering at Google» (2020, гл. 11) формулирует стоимость прогона как проектный параметр: «the slower a test suite, the less frequently it will be run, and the less benefit it provides», и предупреждает, что параллелизм и железо «are eventually swamped by a large number of individually slow test cases» ([abseil.io ch. 11](https://abseil.io/resources/swe-book/html/ch11.html)). DORA делает **change lead time** одной из ключевых измеряемых метрик доставки ([dora.dev, ред. 2026](https://dora.dev/guides/dora-metrics-four-keys/)).
2. **Вердикт:** вариант — «сначала измерь одну матрицу» это здравая локальная форма признанного принципа «латентность тестов — измеряемая величина», но отдельного названия у неё в источниках нет.
3. **Вместо:** постоянный бюджет длительности CI и непрерывный замер lead time, а не однократное предполётное измерение — дешевле, потому что ловит деградацию после стройки, а не только до неё.

### В3 — Провижининг организации и приглашения пациента

1. **Практика:** Канон токена приглашения — OWASP Forgot Password Cheat Sheet: токен генерируется «using a cryptographically secure random number generator», «linked to an individual user in the database», «invalidated after they have been used» и обязан истекать ([cheatsheetseries.owasp.org](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)). Продуктовый эталон семантики: GitHub — приглашения «expire seven days after they are created» ([github.blog changelog, 2020](https://github.blog/changelog/2020-02-05-self-expiring-repository-and-organization-invitations/)), владелец может «edit or cancel an invitation … any time before the user accepts» ([docs.github.com](https://docs.github.com/en/organizations/managing-membership-in-your-organization/canceling-or-editing-an-invitation-to-join-your-organization)). «Нет полусозданного тенанта» — это saga с компенсирующими транзакциями ([microservices.io](https://microservices.io/patterns/data/saga.html)), но saga нужна только когда провижининг пересекает границы сервисов; внутри одной PostgreSQL-базы канон — одна транзакция + уникальный индекс на slug.
2. **Вердикт:** совпадает — одноразовость, срок жизни, отзыв, вытеснение старого приглашения новым и «всё или ничего» при создании организации все имеют именованные источники.

### В7 — Запись и пакеты (перекрытия, баланс)

1. **Практика:** Официальная документация PostgreSQL: «Exclusion constraints ensure that if any two rows are compared on the specified columns or expressions using the specified operators, at least one of these operator comparisons will return false or null», с каноническим примером `EXCLUDE USING gist (c WITH &&)`; с расширением `btree_gist` это даёт `EXCLUDE USING gist (resource_id WITH =, period WITH &&)` по `tstzrange`, и ограничение автоматически создаёт индекс, то есть конкурентная безопасность обеспечивается движком, а не блокировками приложения ([postgresql.org, 5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)). Там же прямо сказано: CHECK не может ссылаться на другие строки, поэтому межстрочные правила — это UNIQUE/EXCLUDE/FK, а построчный инвариант «баланс ≥ 0» — это ровно CHECK.
2. **Вердикт:** совпадает — EXCLUDE-констрейнт против перекрытий и CHECK против отрицательного баланса и есть учебниковый ответ; приложенческая блокировка — заведомо более слабый вариант.

### В9 — Ветки `requireRole` (DB-free)

1. **Практика:** ANSI/INCITS 359 (NIST RBAC; принят 2004, ред. 2012) требует, чтобы «all access is through roles», права назначались только ролям, а наследование задавалось *явно* — Hierarchical RBAC, плюс Static/Dynamic Separation of Duty как явные ограничения ([csrc.nist.gov, RBAC FAQ](https://csrc.nist.gov/projects/role-based-access-control/faqs)). OWASP ASVS 4.0 V4 требует «enforces access control rules on a trusted service layer», принцип наименьших привилегий и «fail securely including when an exception occurs» ([OWASP/ASVS 4.0 V4](https://github.com/OWASP/ASVS/blob/master/4.0/en/0x12-V4-Access-Control.md)). Google Zanzibar (USENIX ATC 2019) хранит отношения доступа явными кортежами, а не выводит их из супер-роли ([research.google](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/)).
2. **Вердикт:** совпадает — «глобальный админ не наследует клинику» это буквально RBAC-правило, что полномочие возникает только из явного назначения/явной иерархии, а не подразумевается.

### В9б — Стена у данных, а не у маршрута

1. **Практика:** Классическое имя этого требования — **complete mediation**, Saltzer & Schroeder: «Every access to every object must be checked for authority. This principle, when systematically applied, is the primary underpinning of the protection system» (Fourth ACM SOSP, 1973; ред. CACM 17(7), 1974 — классика, [cs.virginia.edu/~evans/cs551/saltzer](https://www.cs.virginia.edu/~evans/cs551/saltzer/)). Внутрибазовая реализация того же принципа — PostgreSQL RLS: при `ENABLE ROW LEVEL SECURITY` «all normal access to the table for selecting rows or modifying rows must be allowed by a row security policy», а `FORCE ROW LEVEL SECURITY` подчиняет политике даже владельца таблицы ([postgresql.org, 5.9](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).
2. **Вердикт:** вариант — наш подход **сильнее** канона Next.js: DAL это одна точка посредничества внутри процесса, которую можно обойти забытым импортом или новым модулем, тогда как FORCE RLS опускает посредника ниже любого кодового пути и делает его непреодолимым для нашего же кода (свойство «always invoked» референс-монитора).
3. **Вместо:** практика (Next.js DAL) предлагает только прикладную точку медиации; мы её сохраняем и добавляем проверку в БД — это дешевле аудита всех путей, потому что полнота медиации доказывается одним свойством таблицы, а не обходом всех вызовов.

### В9в — Свести два предиката идентификатора в один

1. **Практика:** CWE-561 Dead Code: «Dead code is code that can never be executed in a running program», рекомендация буквально — «Remove dead code before deploying the application» ([cwe.mitre.org, CWE-561](https://cwe.mitre.org/data/definitions/561.html)); MISRA C:2012 Rule 2.1 («A project shall not contain unreachable code») отображается на этот же CWE. Корневое лекарство от продублированной валидации — «Parse, don't validate» (Alexis King, 2019): валидатор возвращает «`()`, the type that contains no information», парсер возвращает уточнённый тип, из-за чего повторная проверка и её невозможная ветка ошибки просто исчезают ([lexi-lambda.github.io](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)).
2. **Вердикт:** совпадает — убрать недостижимый `catch` слиянием предикатов, а не покрывать его тестом, это ровно каноническое правило.

### В10 — media-worker: один шов, а не отдельный фронт

1. **Практика:** Именованная практика — **risk-based testing** по ISTQB Foundation Level: «test activities are selected, prioritized, and managed based on risk analysis and risk control», где уровень риска складывается из likelihood и impact ([ASTQB, ISTQB FL syllabus §5.2](https://astqb.org/5-2-risk-management/)). Именованный корпоративный кейс приоритизации — Meta Predictive Test Selection: вместо «какие тесты могли быть затронуты» спрашивается «what is the likelihood that a given test finds a regression», отсюда 99.9% пойманных регрессий на трети тестов ([engineering.fb.com, 2018](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/)).
2. **Вердикт:** совпадает — «приоритет по цене молчаливого отказа» это половина «impact» в ISTQB-анализе риска; оговорка: у Meta приоритизация идёт по вероятности поймать регрессию, а не по радиусу поражения.

*(Техническая часть В10 — org-scope артефакта и ключа S3 — разобрана выше, в разделе В8 + Ч2.)*

### И1 — Уровень 0 переписан по КАРТЕ, а не по коду

1. **Практика:** ISTQB-глоссарий: specification-based (black-box) test technique — «Procedure to derive and/or select test cases based on an analysis of the specification, either functional or non-functional, of a component or system **without reference to its internal structure**» ([istqb-glossary.page](https://istqb-glossary.page/specification-based-test-technique/)). «Software Engineering at Google» (2020, гл. 11) требует проверять наблюдаемое поведение и предупреждает, что brittle-тесты «over-specify expected outcomes» ([abseil.io ch. 11](https://abseil.io/resources/swe-book/html/ch11.html)). Академическое имя вопроса «откуда берётся ожидаемый результат» — **test oracle problem**: Barr, Harman, McMinn, Shahbaz, Yoo, «The Oracle Problem in Software Testing: A Survey», IEEE TSE 41(5):507–525, 2015 ([ieeexplore.ieee.org](https://ieeexplore.ieee.org/document/6963470/)).
2. **Вердикт:** совпадает — «оракул из спецификации, а не из кода» это specified oracle в терминах обзора Barr et al. и ровно определение спецификационного тест-дизайна по ISTQB; «красный тест — находка о коде» прямое следствие.

### И2 — Уровень 2 закрывается ЧИСЛОМ (доля убитых из слепого списка)

1. **Практика:** Засев дефектов как критерий приёмки — это mutation testing в проде: «State of Mutation Testing at Google» (Petrović & Ivanković, ICSE-SEIP 2018), diff-based подход, разворачивание на ~6000 инженеров ([research.google](https://research.google/pubs/state-of-mutation-testing-at-google/)). Именно «слепой список от того, кто не читал тесты» имеет два старых имени: **error seeding / bebugging** (H. D. Mills, IBM, 1972) — один участник засевает ошибки, другой их ищет, а доля найденных даёт оценку остатка; экспериментальная проверка допущений модели — NASA NTRS, Knight & Ammann, «An experimental evaluation of error seeding as a program validation technique», 1985 ([ntrs.nasa.gov](https://ntrs.nasa.gov/citations/19860020890)). Требование независимости оценщика — это **IV&V**: NASA SWE-141 фиксирует «technical independence, managerial independence, and financial independence» и что IV&V «funded and managed independently of the selected project» ([swehb.nasa.gov, SWE-141](https://swehb.nasa.gov/display/SWEHBVC/SWE-141+-+Software+Independent+Verification+and+Validation)).
2. **Вердикт:** **совпадает (переоткрытие)** — «слепой список неисправностей от человека, не читавшего тесты» = error seeding, выполненный в режиме независимости IV&V. У практики есть имя, и не одно; наш блок М его переизобрёл с нуля.

### И3 — Стоп по ЦЕЛЕВОМУ СОСТОЯНИЮ модуля, а не по номеру уровня

1. **Практика:** Инкрементальное вытеснение легаси имеет имя — Strangler Fig Application (Martin Fowler, ~2004, обновлено 2024): новое строится «on top of, yet separate to the legacy code base», поведение переносится по кускам ([martinfowler.com](https://martinfowler.com/bliki/StranglerFigApplication.html)). Про инвестиции в код под удаление прямо говорит «Software Engineering at Google», гл. 15 «Deprecation» (2020): «It's often better to invest effort in turning off obsolete systems, rather than letting them lumber along indefinitely alongside the systems that replace them», и что без явного владельца процесс не движется ([abseil.io ch. 15](https://abseil.io/resources/swe-book/html/ch15.html)).
2. **Вердикт:** вариант — «не вкладываться в то, что удаляется» логически следует из канона deprecation/strangler fig, но как отдельное правило про **тестовые** инвестиции в депрекированный код именованного источника нет.
3. **Вместо:** практика предлагает не просто «не писать тесты», а тратить высвобожденное на *выключение* модуля (явный владелец миграции, actionable-предупреждения) — дешевле, потому что убирает и код, и его тесты разом, а не консервирует 88 модулей в состоянии «не трогаем».

### И4 — Контракт шва вебапп → интегратор

1. **Практика:** Consumer-driven contract testing: Pact — «code-first», контракт «generated during the execution of the automated consumer tests», проверяется, что «only parts of the communication that are actually used by the consumer(s) get tested» ([docs.pact.io](https://docs.pact.io/)); исходная формулировка у Fowler (ContractTest, 2011, ред. 2018) — поставщик получает копии контракта в свой пайплайн ([martinfowler.com/bliki/ContractTest.html](https://martinfowler.com/bliki/ContractTest.html)). Schema-first для сообщений — AsyncAPI: «The AsyncAPI document is a communication contract between senders and receivers within an event-driven system» ([asyncapi.com](https://www.asyncapi.com/docs/concepts/asyncapi-document)). Именованная схема-центричная альтернатива Pact — Pactflow BDCT: провайдер публикует OpenAPI-спеку, потребитель — контракт из своего мока, совместимость сверяет платформа ([pactflow.io](https://pactflow.io/bi-directional-contract-testing/)).
2. **Вердикт:** вариант — «один файл схемы, валидируемый с обеих сторон» это фактически схема-first половина BDCT; канон Pact/CDCT требует не общей схемы, а контракта, порождённого потреблением, и отдельной верификации провайдером.
3. **Вместо:** либо CDCT (контракт из consumer-тестов + верификация на стороне провайдера), либо BDCT (спека провайдера × контракт потребителя, сверка на платформе) — устойчивее общей схемы, потому что ловит расхождение «провайдер соблюдает схему, но не то её подмножество, которое реально использует потребитель»; общая схема этот класс дефектов не видит.

### Ч1 — Валидация загрузки файлов

1. **Практика:** OWASP File Upload Cheat Sheet: аллоулист расширений («Only allow safe and critical extensions for business functionality»), проверка сигнатуры (magic bytes) при том, что «The Content-Type for uploaded files is provided by the user, and as such cannot be trusted», лимиты размера (в т.ч. после распаковки), генерация случайных имён (UUID) вместо пользовательских, хранение вне webroot ([cheatsheetseries.owasp.org](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)). Требование «одна точка, которую нельзя обойти» — OWASP ASVS 4.0 V4: контроль «on a trusted service layer, especially if client-side … could be bypassed», и «fail securely including when an exception occurs» ([OWASP/ASVS 4.0 V4](https://github.com/OWASP/ASVS/blob/master/4.0/en/0x12-V4-Access-Control.md)).
2. **Вердикт:** совпадает — состав валидатора и требование единственной доверенной точки проверки прямо описаны в OWASP; три реализации и один непроверяющий маршрут — это нарушение канона, а не его вариант.

### Ч4 — Настройки и квоты: одна точка решения

1. **Практика:** Каноническое имя — разделение **PDP/PEP**; NIST определяет policy decision point как «a system entity that makes authorization decisions for itself or for other system entities that request such decisions» (CNSSI 4009-2015, [csrc.nist.gov glossary](https://csrc.nist.gov/glossary/term/policy_decision_point)). Практическая реализация — Open Policy Agent: «OPA decouples policy decision-making from policy enforcement», приложение передаёт структурированный вход и получает решение ([openpolicyagent.org/docs](https://www.openpolicyagent.org/docs)).
2. **Вердикт:** вариант — «единый резолвер настроек» это правильный PDP по духу, но три обхода кэша и дублированная логика квот означают, что де-факто у нас несколько PDP, то есть канон нарушен именно там, где заявлен.
3. **Вместо:** не «резолвер + дисциплина», а архитектурный разрыв — вычисление решения (лимит/квота) вынесено за PEP и доступно только через один запрос-ответ, без публичного доступа к сырым настройкам и кэшу; это дешевле, потому что обход становится невозможным по типу вызова, а не запрещённым код-ревью.

### НЕ СДЕЛАНО (свод по коротким пунктам)

- **Б3** — практика «утверждать в CI число собранных тестов» (assert collected-test count): источник не найден. Проверялись доки Vitest по discovery и блог Google Testing; каноническое имя отсутствует.
- **Б4** — «cost calibration» / «замерь одну матрицу до массовой стройки» как отдельный именованный приём: источник не найден; вывод опирается на смежные утверждения из «Software Engineering at Google» гл. 11 и DORA change lead time.
- **В10** — корпоративный инженерный текст, приоритизирующий тесты именно по **blast radius**: источник не найден; Meta Predictive Test Selection приоритизирует по вероятности поймать регрессию, а не по цене отказа.
- **И2** — первоисточник Mills (IBM Corporation Report FSC72-6015, 1972) не открывался: атрибуция дана по вторичному официальному источнику (NASA NTRS, Knight & Ammann, 1985). Скан NTRS-PDF нечитаем машинно, использована карточка публикации.

---

## Четыре вопроса, где подозревалось изобретение — прямые ответы

Развёрнутые разборы с источниками — в секциях выше; здесь только ответ.

### Б1 — «одноразовая база из эталона схемы + миграции поверх». Как это делают на самом деле?

**Вопрос смешивает два разных вопроса.** `testcontainers` отвечает на «откуда взять работающий сервер»;
«шаблон+клон», «схема на прогон», «транзакция-откат» — на «как привести состояние к чистому перед тестом».
Мейнстрим 2024–2026 — их **комбинация**: один контейнер/кластер на прогон + `CREATE DATABASE ... TEMPLATE`
клон на тест или на воркер.

Под наши ограничения (реальный RLS, несколько соединений, конкурентность, Docker не гарантирован):

1. **Шаблон + клон** — победитель, единственный вариант с реальными отдельными соединениями и ценой
   подготовки в десятки миллисекунд.
2. **БД на воркер** — достойный запасной, официальная механика Rails и pytest-django.
3. **Testcontainers** — был бы дефолтом (ThoughtWorks Radar, ринг **Adopt** с марта 2022), но требует
   Docker-совместимый рантайм. Наш `initdb`-кластер — вынужденная замена, и у неё есть прецедент: **`pg_tmp`**
   (обновление 11.07.2025) делает ровно это.
4. **Транзакция с откатом — дисквалифицирована**, и это цитируется: Django официально выносит
   `select_for_update()` и всё, что требует реального `COMMIT`, за пределы транзакционных тестов. Наши
   RLS-через-разные-соединения и `SKIP LOCKED` — ровно этот список.

**Про «эталон + миграции поверх»: норма или запах — зависит от того, ПОЧЕМУ.** Грузить дамп схемы вместо
проигрывания истории миграций — прямая рекомендация Rails («faster and less error prone»). Но у Rails
`structure.sql` **генерируется из миграций**, поэтому эталон и «с нуля» тождественны по построению. У нас
эталон несёт то, чего в миграциях нет. Это дрейф, а не паттерн. **Лечится не спором, а гейтом:**
`prisma migrate diff --exit-code` / Atlas drift detection — красный CI вместо веры.

**Плюс находка, которой в Б1 нет и которая может обнулить весь блок В:** в харнессе, который сам делает
`initdb`, соединение по умолчанию идёт под суперпользователем-владельцем таблиц, а он **обходит RLS** —
матрица стен будет зелёной, ничего не проверяя. Обязательны непривилегированные роли + `FORCE ROW LEVEL SECURITY`.

### В1 — «матрица принципал × организация × операция». Это велосипед?

**Нет.** У формы есть три независимых имени, и они не конкурируют, а занимают разные ниши:

- **Явная негативная матрица** — процедурно записана в OWASP WSTG-ATHZ-02 («for each role… for every request…
  swap the session identifier»), материализована как таблица в OWASP ZAP Access Control Testing, названа
  отдельной категорией «Tenant Isolation Testing» у AWS, и в том же виде написана самим PostgreSQL в
  `src/test/regress/sql/rowsecurity.sql`. Тройка «принципал × ресурс × операция» канонизирована AWS как
  **PARC** (principal, action, resource, context) в Cedar / Amazon Verified Permissions.
- **Декларативные тесты политик** (pgTAP `policies_are()`, OPA `opa test`) — доказывают, что политика
  *существует и такой формы*, а не что она *работает*. Не замена.
- **Property-based / метаморфное** — уровень авторов движка авторизации (так проверяют Cedar), не прикладной
  команды.

**Обязательность негативных путей — не наше усердие, а требование:** OWASP API1:2023 «Write tests… **Do not
deploy changes that make the tests fail**», ASVS 8.4.1, Azure multitenancy checklist «Continuously test your
isolation model».

**«Подтверждение из отдельного соединения» тоже имеет имя** — **Back Door Verification** (Meszaros, «xUnit
Test Patterns», 2007).

**Чего в формулировке В1 не хватает по канону — двух вещей.** Первое: **мета-проверка стенда** (под кем
подключён тест: не владелец, не суперпользователь, `rolbypassrls = false`, `FORCE RLS` включён) — без неё
зелёная матрица не значит ничего, и на этом уже спотыкались: Nile публично описали свой near-miss, PlanetScale
называет это «testing blind spot». Второе: **матрицу лучше порождать из каталога** (`pg_class` × 4 команды),
чтобы новая таблица без политики роняла тест сама.

И одна поправка к ожиданиям: чужой `UPDATE`/`DELETE` под RLS возвращает **0 затронутых строк без ошибки**.
Тест, ждущий исключения, будет зелёным при полностью отсутствующей политике.

### В5 — «Idempotency-Key + транзакционный outbox». Это современная норма?

**Наполовину. Одна половина норма, другая у нас лишняя.**

**`Idempotency-Key` — норма, но не как IETF-стандарт.** Черновик
`draft-ietf-httpapi-idempotency-key-header` **истёк 18.04.2026** на ревизии -07 (15.10.2025), номер RFC не
присвоен, среди активных документов рабочей группы httpapi его нет. Норма здесь — **де-факто стандарт
Stripe**. Причём имя заголовка отраслью не согласовано вообще: Stripe и Adyen — `Idempotency-Key`, PayPal —
`PayPal-Request-Id`, Twilio — `I-Twilio-Idempotency-Token`, Square и Shopify вообще не в заголовке.
Согласована **семантика**. Практический вывод: механику брать, формулировку «по стандарту IETF» — убрать.

**Transactional outbox — норма для проблемы, которой у нас нет.** Outbox решает dual write, когда БД и брокер
— **разные системы**. Наша `outgoing_delivery_queue` лежит в **той же** PostgreSQL, значит вставка строки
очереди идёт той же транзакцией, и гарантия «сообщение есть ⟺ данные закоммичены» получается бесплатно.
Это не наш вывод, это формулировка **DBOS** (компания Stonebraker и Zaharia): «This is exactly the guarantee
a conventional outbox provides, except the "outbox" is DBOS's own queue table». Зеркальное подтверждение —
Solid Queue рекомендует `enqueue_after_transaction_commit` **именно тогда, когда очередь в отдельной базе**.

Честный контраргумент назван: Gunnar Morling (создатель Debezium) в 2024 защищает outbox от критики — но его
контекст обмен данными **между сервисами** через Kafka/CDC. Outbox вернётся ровно в один момент: если очередь
переедет в отдельную БД или во внешний брокер.

**Остальное в В5 каноничнее некуда:** `FOR UPDATE ... SKIP LOCKED` благословлён самой документацией
PostgreSQL под очередь; восстановление застрявшей строки — аренда с истечением плюс heartbeat (SQS,
graphile-worker, Solid Queue, Oban Lifeline); at-least-once + идемпотентный потребитель — прямая позиция AWS.
Сквозного exactly-once (БД + Telegram/SMS) не даёт никто, и попытки его строить в плане нет — это правильно.

### Ч6 — «настройки не декорация». Есть ли признанная практика?

**Да, но она ловит не совсем то, что нужно нам, — и это важно.**

Практика называется **flag debt / stale flag detection** и имеет два независимых механизма, которые вендоры
считают взаимодополняющими:
- **статический скан ключей** — `ld-find-code-refs` у LaunchDarkly показывает флаги с нулём ссылок в коде;
  то же у Flagsmith и Statsig;
- **рантайм-телеметрия** — LaunchDarkly помечает флаг Inactive, если его не запрашивали 7 дней; Unleash
  вычисляет стадию жизненного цикла из метрик; Statsig: «0 checks within last 30 days».
Авторитетнее отрасль считает **рантайм**, потому что скан по строковым ключам даёт ложные срабатывания в обе стороны.

**Дыра, в которую попадает Ч6.** Вся эта индустрия предполагает, что флаг **временный** и живёт **в SaaS или
в коде**. Наши админ-тумблеры по классификации Фаулера/Ходжсона — это **Permissioning и Ops Toggles**,
живущие «at the scale of multiple years». GitLab это институционализировал: долгоживущий флаг перестаёт быть
флагом и **становится Application/Cascading Setting** — и в этот момент вся гигиена флагов к нему перестаёт
применяться. То есть **никто из вендоров не отвечает на вопрос «а читает ли эту настройку хоть кто-нибудь»**.

**Meta это подтверждает отрицательным результатом.** В «Holistic Configuration Management at Facebook» (SOSP
2015) есть валидаторы инвариантов, код-ревью конфигов, canary — и **нет ни слова** про обнаружение
неиспользуемых конфигов. Ближайшее академическое подтверждение самой проблемы — Xu et al., FSE 2015: удалили
51.9% параметров «with little impact on existing users».

**Вторая половина пункта («потребитель единственный») покрыта каноном сильнее первой:** Фаулер
«Inversion of Decision» (`FeatureDecisions` как единая точка), OWASP Proactive Controls C1 («Use a single
access control procedure or routine. This prevents the scenario where you have multiple access control
implementations, where most are correct, but some are flawed» — это дословное описание нашего инцидента с
`auth_2fa_enabled`), Google KDD 2010 («the same parameter cannot be associated with multiple layers»).
Но **готового инструмента для неё нет** — это строится конструкцией.

**Наше «доказано прогоном» строже всей индустрии.** Ни один вендор не требует доказать, что переключение
меняет наблюдаемое поведение. Ближайший признанный аналог — Ходжсон: «we must test our artifact in **both**
states». Публично документированных примеров нашего уровня строгости не найдено.

**Самый дешёвый путь, если брать готовое:** единая точка чтения настройки, инкрементирующая счётчик по ключу
— она одним движением даёт и рантайм-телеметрию «кто читал» (как у Statsig/Unleash), и уникальность
потребителя (как требует OWASP C1). Скан ключей — вторым контуром, по модели `ld-find-code-refs`.

---

## НЕ СДЕЛАНО — свод по всему исследованию

У каждой секции выше есть свой раздел «НЕ СДЕЛАНО» с деталями. Здесь — то, что важно знать до того, как
что-либо из отчёта попадёт в план.

### Границы самого исследования (заданы заказом, не пробелы)

- **Репозиторий не читался ни одним агентом.** Ни одно утверждение отчёта не проверялось против нашего кода.
  Все числа из планов (5 очередей, 107/22/11/11 импортов, 22 файла, 21 потребитель, 88 из 279 модулей) взяты
  как данность и **не подтверждены**.
- **Ничего не менялось**: ни код, ни планы, ни гейты, ни конфигурация. Отчёт — единственный артефакт.
- **Задачи не заводились, сроки и трудозатраты не оценивались** — по условию заказа.
- **Уже закрытые лидом вопросы не переисследовались** (стена у данных по канону Next.js, отмена процентного
  порога мутаций, типы-марки). Исключение — В9б, по которому найдена одна дополнительная опора старше
  Next.js: complete mediation, Saltzer & Schroeder, 1974.

### Источники, которые не удалось открыть (и что на них опиралось)

- **Документация нашего эквайера недоступна из этого окружения** — `alfa.rbsuat.com`, `pay.alfabank.ru`,
  `alfabank.ru` отдают ошибку TLS (российский корневой УЦ не в доверенном хранилище). Поэтому по В4 **не
  подтверждены первоисточником**: обязательность и вид контрольной суммы колбэка, точный набор полей
  `getOrderStatusExtended`, наличие серверной идемпотентности по `orderNumber`. Это самая существенная лакуна
  отчёта — проверять надо вручную по PDF с партнёрского портала.
- **ACM Digital Library отдаёт HTTP 403** — статьи Google (KDD 2010) и Meta (SOSP 2015) читались по
  официальным PDF (research.google.com, sigops.org); их содержание подтверждено, карточки на dl.acm.org — нет.
- **NIST SP 800-192** (методы верификации моделей доступа) — PDF не поддался извлечению текста; конкретные
  предписанные методы **не процитированы** и в выводах не использованы.
- **Zanzibar (USENIX ATC 2019)** — PDF вернул 403; в выводах по В1 не используется.
- **eCFR (45 CFR §164.312, §164.316)** — редирект для не-браузерных клиентов; цитаты по HIPAA даны в
  пересказе и требуют ручной сверки.
- **Debezium Outbox Event Router** — страница документации отдаёт 403; утверждения опираются на их блог 2019 г.
- **Приказ РКН № 179 и приказ Минздрава № 408** прочитаны по вторичным публикациям (Контур.Норматив, карточка
  на minzdrav.gov.ru), а не по pravo.gov.ru. Срок «25 лет для стационарной медкарты» требует проверки по тексту.

### Утверждения, для которых источника НЕ НАШЛОСЬ

Это честные пустые места, а не отрицательные факты — отсутствие результата поиска не означает отсутствия практики.

- **«Утверждать в CI число собранных тестов»** (Б3) — именованной практики не найдено.
- **«Калибровка стоимости перед массовой стройкой»** (Б4) — отдельного имени нет; вывод собран из смежного.
- **Приоритизация тестов по blast radius** (В10) — корпоративного текста именно про это не найдено; у Meta
  приоритизация по вероятности поймать регрессию, а не по цене отказа.
- **Действующая вендорская норма «как отдавать байты PHI из объектного хранилища»** (В8/Ч2) — не существует;
  профильный AWS HIPAA whitepaper архивирован. Домейн-канон пришлось брать у HL7 FHIR и OWASP.
- **Рецензируемое сравнение 404 vs 403** — нет. RFC 9110 даёт только **MAY**; «404 обязателен» не
  подтверждается ни одним стандартом.
- **Прецедент «named company: один клиент объектного хранилища + линт против обхода»** — не найден;
  обобщение сделано по общим практикам (banned imports, Bazel visibility, Error Prone `@RestrictedApi`).
- **Публичный пример нашей строгости в Ч6** («тест доказывает, что тумблер меняет поведение») — не найден
  ни у одного вендора; максимум канона — «тестируй оба состояния» (Фаулер, 2017).
- **Технический стандарт `$unmerge`** — не существует. Требование обратимости нормативно (ISO 21089:2018 /
  HL7 EHR-S FM), но FHIR его не определяет, а IHE PIX явно не поддерживает.
- **Канон тестирования деструктивных операций** (В6) — авторитетного первоисточника про orphan-detection и
  интеграционные тесты удаления не найдено; всё, что сказано, выведено из документации PostgreSQL и
  продуктовых поверхностей FHIR/Stripe.
- **Источник, предписывающий конкретный SQL** («`UPDATE ... WHERE ... RETURNING`» как норма) — нет; это вывод
  из связки ASVS 2.3.3/2.3.4 и семантики PostgreSQL Read Committed.

### Что стоит перепроверить перед использованием

- **ASVS 5.0** цитировалась из ветки `master` репозитория OWASP/ASVS, а не из релизного PDF v5.0.0 — номера
  требований стоит сверить.
- **PCI DSS** цитировался по SAQ D for Merchants v4.0 (апрель 2022), а не по полному тексту v4.0.1 (июнь 2024).
- **NIST SP 800-88 Rev. 1 отозван 26.09.2025** и заменён на **r2** — если в наших документах где-то стоит
  ссылка на Rev. 1, она устарела.
- **Доки вендоров фичефлагов** (LaunchDarkly, Unleash, Statsig, Harness, Flagsmith) года редакции на
  страницах не проставляют — зафиксировано как «состояние на 01.08.2026».
- **Devise `authenticatable_salt`** подтверждён исходником репозитория, а не прозаической документацией —
  самая слабая цитата в разделе В2.

---

